import { useState, useEffect, useRef } from "react";
import { Game, usePlaceBet, getGetMeQueryKey, getListRecentBetsAllQueryKey, getListBetsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import { THEMES, getTheme, type ThemeId } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProvablyFairPanel } from "./provably-fair-panel";

interface CrashProps { game: Game }

function useAccent() {
  const [id, setId] = useState<ThemeId>(getTheme());
  useEffect(() => {
    const h = (e: Event) => setId((e as CustomEvent<ThemeId>).detail);
    window.addEventListener("dgc-theme-change", h);
    return () => window.removeEventListener("dgc-theme-change", h);
  }, []);
  return THEMES.find(t => t.id === id)?.accent ?? "#FFD700";
}

export function Crash({ game }: CrashProps) {
  const { user, requireAuth } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const placeBet = usePlaceBet();
  const accent = useAccent();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [amount, setAmount] = useState<number>(game.minBet);
  const [cashoutAt, setCashoutAt] = useState<number>(2.0);
  const [gameState, setGameState] = useState<"idle" | "playing" | "crashed">("idle");
  const [currentMultiplier, setCurrentMultiplier] = useState(1.0);
  const [finalMultiplier, setFinalMultiplier] = useState(0);
  const [win, setWin] = useState<boolean | null>(null);
  const [payout, setPayout] = useState(0);
  const [pf, setPf] = useState<{ betId?: number; serverSeedHash?: string; serverSeed?: string; clientSeed?: string; nonce?: number }>({});
  const [history, setHistory] = useState<{ mult: number; won: boolean }[]>([]);
  
  const animationRef = useRef<number | undefined>(undefined);
  const startTimeRef = useRef<number | undefined>(undefined);
  const multHistoryRef = useRef<number[]>([1.0]);

  // Draw the crash curve on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const history = multHistoryRef.current;
    if (history.length < 2) return;

    const maxMult = Math.max(...history, 1.5);
    const points = history.map((m, i) => ({
      x: (i / (history.length - 1)) * (W - 40) + 20,
      y: H - 20 - ((m - 1) / (maxMult - 1 || 1)) * (H - 40),
    }));

    // Gradient fill under curve
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    const crashed = gameState === "crashed" && !win;
    grad.addColorStop(0, crashed ? "rgba(239,68,68,0.3)" : `${accent}44`);
    grad.addColorStop(1, "rgba(0,0,0,0)");

    ctx.beginPath();
    ctx.moveTo(points[0].x, H - 20);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, H - 20);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Curve line
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = crashed ? "#ef4444" : (win ? "#22c55e" : accent);
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Cashout line
    if (gameState !== "idle") {
      const cashoutY = H - 20 - ((cashoutAt - 1) / (maxMult - 1 || 1)) * (H - 40);
      if (cashoutY > 20 && cashoutY < H - 20) {
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(20, cashoutY);
        ctx.lineTo(W - 20, cashoutY);
        ctx.strokeStyle = "rgba(34,197,94,0.6)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(34,197,94,0.8)";
        ctx.font = "bold 10px monospace";
        ctx.fillText(`${cashoutAt.toFixed(2)}×`, W - 50, cashoutY - 4);
      }
    }
  }, [currentMultiplier, gameState, win, accent, cashoutAt]);

  const handleBet = () => {
    requireAuth(() => {
      if (amount < game.minBet || amount > game.maxBet) {
        toast({ title: "Invalid Bet", description: `Bet must be between ${formatCurrency(game.minBet)} and ${formatCurrency(game.maxBet)}`, variant: "destructive" });
        return;
      }
      if (cashoutAt < 1.01) {
        toast({ title: "Invalid Cashout", description: "Target multiplier must be at least 1.01×", variant: "destructive" });
        return;
      }
      if (user && amount > user.balance) {
        toast({ title: "Insufficient funds", description: "You do not have enough balance.", variant: "destructive" });
        return;
      }

      setGameState("playing");
      setCurrentMultiplier(1.0);
      setWin(null);
      setPayout(0);
      multHistoryRef.current = [1.0];

      placeBet.mutate({ data: { gameId: game.id, amount, meta: { cashoutAt } } }, {
        onSuccess: (data) => {
          const meta = data.bet.meta as Record<string, unknown>;
          const crashPoint = Math.max(1.01, Number(meta?.crashPoint ?? 1.5));

          setPf({
            betId: data.bet.id,
            serverSeedHash: data.bet.serverSeedHash ?? undefined,
            serverSeed: data.bet.serverSeed ?? undefined,
            clientSeed: data.bet.clientSeed ?? undefined,
            nonce: data.bet.nonce ?? undefined,
          });
          setFinalMultiplier(crashPoint);
          
          startTimeRef.current = performance.now();
          
          const animate = (time: number) => {
            const elapsed = (time - (startTimeRef.current || time)) / 1000;
            const newMult = 1.0 * Math.pow(Math.E, 0.2 * elapsed);
            
            multHistoryRef.current = [...multHistoryRef.current, newMult].slice(-80);
            
            if (newMult >= crashPoint) {
              setCurrentMultiplier(crashPoint);
              setGameState("crashed");
              setWin(data.won);
              setPayout(data.payout);
              setHistory(h => [{ mult: crashPoint, won: data.won }, ...h].slice(0, 10));
              
              queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
              queryClient.invalidateQueries({ queryKey: getListRecentBetsAllQueryKey() });
              queryClient.invalidateQueries({ queryKey: getListBetsQueryKey() });
              
              if (data.won) {
                toast({ title: `Cashed Out! ${cashoutAt.toFixed(2)}×`, description: `+${formatCurrency(data.payout)}`, className: "bg-green-500 text-white border-green-600" });
              }
            } else {
              setCurrentMultiplier(newMult);
              animationRef.current = requestAnimationFrame(animate);
            }
          };
          
          animationRef.current = requestAnimationFrame(animate);
        },
        onError: (err) => {
          setGameState("idle");
          toast({ title: "Bet Failed", description: err.data?.error || "An error occurred", variant: "destructive" });
        }
      });
    });
  };

  useEffect(() => {
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, []);

  const multColor = gameState === "crashed"
    ? (win ? "#22c55e" : "#ef4444")
    : gameState === "playing"
    ? accent
    : "rgba(255,255,255,0.6)";

  return (
    <div className="crash-game-root flex flex-col md:flex-row gap-6">
      <style>{`
        @media (max-width: 1024px) {
          .crash-game-root { flex-direction: column !important; gap: 10px !important; }
          .crash-chart-area { min-height: 200px !important; }
          .crash-bet-panel { width: 100% !important; position: static !important; }
        }
        @keyframes crash-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        .crash-playing-pulse { animation: crash-pulse 0.6s ease-in-out infinite; }
      `}</style>

      {/* Game Area */}
      <div className="crash-chart-area flex-1 rounded-xl flex flex-col items-center justify-center min-h-[220px] md:min-h-[420px] relative overflow-hidden"
        style={{ background: "rgba(8,12,26,0.88)", border: "1.5px solid rgba(255,255,255,0.07)" }}>
        
        {/* Canvas chart */}
        <canvas
          ref={canvasRef}
          width={600}
          height={300}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: gameState === "idle" ? 0.3 : 1 }}
        />

        {/* Multiplier Display */}
        <div className="relative z-10 text-center" style={{ pointerEvents: "none" }}>
          <div
            className={gameState === "playing" ? "crash-playing-pulse" : ""}
            style={{
              fontFamily: "monospace", fontWeight: 900, letterSpacing: -2,
              fontSize: "clamp(56px, 12vw, 96px)",
              color: multColor,
              textShadow: `0 0 40px ${multColor}55`,
              transition: "color 0.3s",
            }}>
            {currentMultiplier.toFixed(2)}×
          </div>
          
          {gameState === "playing" && (
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: 3, textTransform: "uppercase", marginTop: 4 }}>
              Target: {cashoutAt.toFixed(2)}×
            </div>
          )}
          
          {gameState === "crashed" && (
            <div style={{ fontSize: 18, fontWeight: 900, textTransform: "uppercase", letterSpacing: 3, color: win ? "#22c55e" : "#ef4444", marginTop: 8 }}>
              {win ? `🎉 Cashed Out! +${formatCurrency(payout)}` : "💥 Crashed!"}
            </div>
          )}
        </div>

        {/* History pills */}
        {history.length > 0 && (
          <div style={{ position: "absolute", top: 10, left: 10, right: 10, display: "flex", gap: 4, flexWrap: "wrap", zIndex: 5 }}>
            {history.map((h, i) => (
              <span key={i} style={{
                fontSize: 9, fontFamily: "monospace", fontWeight: 700,
                padding: "2px 6px", borderRadius: 8,
                background: h.won ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)",
                color: h.won ? "#22c55e" : "#ef4444",
                border: `1px solid ${h.won ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)"}`,
              }}>
                {h.mult.toFixed(2)}×
              </span>
            ))}
          </div>
        )}
      </div>
      
      {/* Bet Controls */}
      <div className="crash-bet-panel w-full md:w-80 rounded-xl flex flex-col gap-5"
        style={{ background: "rgba(8,12,26,0.9)", border: "1.5px solid rgba(255,255,255,0.07)", padding: 20, backdropFilter: "blur(14px)", position: "sticky", top: 80 }}>

        {/* Panel title */}
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 3, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", textAlign: "center", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 8 }}>
          Crash
        </div>

        <div className="space-y-4">
          <div>
            <Label className="text-muted-foreground uppercase text-xs font-bold tracking-wider">Bet Amount</Label>
            <div className="relative mt-2">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</div>
              <Input 
                type="number" 
                value={amount} 
                onChange={(e) => setAmount(Number(e.target.value))}
                min={game.minBet}
                max={game.maxBet}
                step={0.01}
                className="pl-8 font-mono bg-secondary border-border"
                disabled={gameState === "playing"}
              />
            </div>
            <div className="flex gap-2 mt-2">
              {[
                { l: "MIN", fn: () => setAmount(game.minBet) },
                { l: "½",   fn: () => setAmount(Math.max(game.minBet, amount / 2)) },
                { l: "2×",  fn: () => setAmount(Math.min(amount * 2, game.maxBet)) },
                { l: "MAX", fn: () => setAmount(Math.min(user?.balance ?? 0, game.maxBet)) },
              ].map(({ l, fn }) => (
                <button key={l} onClick={fn} disabled={gameState === "playing"}
                  style={{
                    flex: 1, padding: "6px 4px", borderRadius: 6, fontSize: 9, fontWeight: 700,
                    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)",
                    color: "rgba(255,255,255,0.6)", cursor: gameState === "playing" ? "not-allowed" : "pointer",
                    opacity: gameState === "playing" ? 0.38 : 1, transition: "all 0.14s",
                  }}>{l}</button>
              ))}
            </div>
          </div>
          
          <div>
            <Label className="text-muted-foreground uppercase text-xs font-bold tracking-wider">Auto Cashout At</Label>
            <div className="relative mt-2">
              <Input 
                type="number" 
                value={cashoutAt} 
                onChange={(e) => setCashoutAt(Number(e.target.value))}
                min={1.01}
                step={0.01}
                className="pr-8 font-mono bg-secondary border-border"
                disabled={gameState === "playing"}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">×</div>
            </div>
            {/* Quick cashout presets */}
            <div className="flex gap-2 mt-2">
              {[1.5, 2, 3, 5, 10].map(v => (
                <button key={v} onClick={() => setCashoutAt(v)} disabled={gameState === "playing"}
                  style={{
                    flex: 1, padding: "5px 2px", borderRadius: 6, fontSize: 9, fontWeight: 700,
                    border: `1px solid ${cashoutAt === v ? accent : "rgba(255,255,255,0.12)"}`,
                    color: cashoutAt === v ? accent : "rgba(255,255,255,0.40)",
                    background: cashoutAt === v ? `${accent}15` : "transparent",
                    cursor: gameState === "playing" ? "not-allowed" : "pointer",
                    opacity: gameState === "playing" ? 0.38 : 1, transition: "all 0.14s",
                  }}>{v}×</button>
              ))}
            </div>
          </div>
        </div>

        {/* Stats panel */}
        <div style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${accent}33`, borderRadius: 10, padding: "10px", display: "flex", flexDirection: "column", gap: 6, fontSize: 10, fontFamily: "monospace" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "rgba(255,255,255,0.45)" }}>Potential Win</span>
            <span style={{ color: "#22c55e", fontWeight: 900 }}>+{formatCurrency(amount * cashoutAt - amount)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "rgba(255,255,255,0.45)" }}>Payout at {cashoutAt.toFixed(2)}×</span>
            <span style={{ color: accent, fontWeight: 900 }}>{formatCurrency(amount * cashoutAt)}</span>
          </div>
          {user && (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "rgba(255,255,255,0.45)" }}>Balance</span>
              <span style={{ color: "rgba(255,255,255,0.8)", fontWeight: 700 }}>{formatCurrency(user.balance)}</span>
            </div>
          )}
        </div>
        
        <Button 
          size="lg" 
          className="w-full font-display font-black text-base uppercase tracking-widest h-12 mt-auto"
          style={{
            background: gameState === "playing" ? "rgba(100,100,100,0.5)" : `linear-gradient(140deg, ${accent}ee, ${accent}aa)`,
            color: "#000", border: "none",
            boxShadow: gameState === "playing" ? "none" : `0 4px 20px ${accent}55`,
          }}
          onClick={handleBet}
          disabled={gameState === "playing"}
        >
          {gameState === "playing" ? "Playing…" : gameState === "crashed" ? "Play Again" : "Place Bet"}
        </Button>

        <ProvablyFairPanel {...pf} />
      </div>
    </div>
  );
}
