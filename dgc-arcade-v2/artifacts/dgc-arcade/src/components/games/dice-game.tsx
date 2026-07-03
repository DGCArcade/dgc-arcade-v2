import { useState, useEffect } from "react";
import { Game } from "@workspace/api-client-react";
import { usePlaceBet, getGetMeQueryKey, getListRecentBetsAllQueryKey, getListBetsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import { THEMES, getTheme, type ThemeId } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DiceGameProps { game: Game }

// ─── Theme hooks ─────────────────────────────────────────────────────────────

function useAccent() {
  const [id, setId] = useState<ThemeId>(getTheme());
  useEffect(() => {
    const h = (e: Event) => setId((e as CustomEvent<ThemeId>).detail);
    window.addEventListener("dgc-theme-change", h);
    return () => window.removeEventListener("dgc-theme-change", h);
  }, []);
  return THEMES.find(t => t.id === id)?.accent ?? "#FFD700";
}

// ─── 3D Dice face component ───────────────────────────────────────────────────

function DiceFace({ value, size = 80, accent }: { value: number; size?: number; accent: string }) {
  const dots: Record<number, [number, number][]> = {
    1: [[50, 50]],
    2: [[25, 25], [75, 75]],
    3: [[25, 25], [50, 50], [75, 75]],
    4: [[25, 25], [75, 25], [25, 75], [75, 75]],
    5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
    6: [[25, 20], [75, 20], [25, 50], [75, 50], [25, 80], [75, 80]],
  };
  const positions = dots[value] ?? dots[1];
  const dotSize = size * 0.14;

  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.18,
      background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.12), rgba(0,0,0,0.3))`,
      backgroundColor: "#fafafa",
      border: "2px solid rgba(0,0,0,0.15)",
      position: "relative",
      boxShadow: `0 8px 24px rgba(0,0,0,0.6), inset 0 2px 6px rgba(255,255,255,0.4), inset 0 -2px 6px rgba(0,0,0,0.15)`,
    }}>
      {positions.map(([x, y], i) => (
        <div key={i} style={{
          position: "absolute",
          width: dotSize, height: dotSize,
          borderRadius: "50%",
          background: `radial-gradient(circle at 35% 35%, ${accent}ff, ${accent}99)`,
          boxShadow: `0 2px 4px rgba(0,0,0,0.4), 0 0 6px ${accent}66`,
          left: `${x}%`, top: `${y}%`,
          transform: "translate(-50%, -50%)",
        }} />
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DiceGame({ game }: DiceGameProps) {
  const { user, requireAuth } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const placeBet = usePlaceBet();
  const accent = useAccent();

  const [amount, setAmount] = useState<number>(game.minBet);
  const [target, setTarget] = useState<number>(50);
  const [mode, setMode] = useState<"over" | "under">("over");
  const [result, setResult] = useState<number | null>(null);
  const [won, setWon] = useState<boolean | null>(null);
  const [payout, setPayout] = useState(0);
  const [rolling, setRolling] = useState(false);
  const [diceValue, setDiceValue] = useState<number>(1);
  const [rollCount, setRollCount] = useState(0);
  const [betId, setBetId] = useState<number | null>(null);
  const [serverSeedHash, setServerSeedHash] = useState<string | null>(null);
  const [clientSeed, setClientSeed] = useState<string | null>(null);
  const [nonce, setNonce] = useState<number | null>(null);

  const winChance = mode === "over" ? 100 - target : target;
  const multiplier = Math.max(0.01, (99 / winChance)).toFixed(4);
  const potentialPayout = (amount * parseFloat(multiplier)).toFixed(2);

  const roll = () => {
    requireAuth(() => {
      if (!user || amount > parseFloat(String(user.balance))) {
        toast({ title: "Insufficient balance", variant: "destructive" }); return;
      }
      setRolling(true);
      setResult(null);
      setWon(null);
      setRollCount(c => c + 1);

      // Animate dice while rolling
      let frames = 0;
      const animate = setInterval(() => {
        setDiceValue(Math.floor(Math.random() * 6) + 1);
        frames++;
        if (frames > 20) clearInterval(animate);
      }, 80);

      placeBet.mutate({ data: { gameId: game.id, amount, meta: { target, mode } } }, {
        onSuccess: (data) => {
          clearInterval(animate);
          const meta = data.bet.meta as Record<string, unknown>;
          const roll = meta?.roll as number ?? 50;
          const finalDice = Math.max(1, Math.min(6, Math.ceil(roll / (100 / 6))));
          setDiceValue(finalDice);
          setResult(roll);
          setWon(data.won);
          setPayout(data.payout);
          setBetId(data.bet.id);
          setServerSeedHash(data.bet.serverSeedHash ?? null);
          setClientSeed(data.bet.clientSeed ?? null);
          setNonce(data.bet.nonce ?? null);
          setRolling(false);
          qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
          qc.invalidateQueries({ queryKey: getListRecentBetsAllQueryKey() });
          qc.invalidateQueries({ queryKey: getListBetsQueryKey() });
          if (data.won) toast({ title: `Win! Roll: ${roll.toFixed(2)} — +${formatCurrency(data.payout)}`, className: "bg-green-500 text-white" });
        },
        onError: (err) => {
          clearInterval(animate);
          setRolling(false);
          toast({ title: "Bet Failed", description: err.data?.error, variant: "destructive" });
        }
      });
    });
  };

  return (
    <div className="dice-game-root flex flex-col md:flex-row gap-6">

      <style>{`
        @media (max-width: 1024px) {
          .dice-game-root { flex-direction: column-reverse !important; gap: 16px !important; }
        }
        @keyframes dice-bounce {
          0%,100% { transform: translateY(0) rotate(0deg); }
          25%      { transform: translateY(-12px) rotate(-8deg); }
          75%      { transform: translateY(-6px) rotate(6deg); }
        }
        @keyframes dice-win-glow {
          0%,100% { filter: drop-shadow(0 0 8px rgba(34,197,94,0.4)); }
          50%      { filter: drop-shadow(0 0 20px rgba(34,197,94,0.8)); }
        }
        @keyframes dice-lose-glow {
          0%,100% { filter: drop-shadow(0 0 8px rgba(239,68,68,0.4)); }
          50%      { filter: drop-shadow(0 0 20px rgba(239,68,68,0.8)); }
        }
        .dice-roll-anim { animation: dice-bounce 0.3s ease-in-out infinite; }
        .dice-win-anim  { animation: dice-win-glow 1.5s ease-in-out infinite; }
        .dice-lose-anim { animation: dice-lose-glow 1.5s ease-in-out infinite; }
      `}</style>

      {/* ── Roll Display ── */}
      <div className="dice-display-area flex-1 bg-secondary border border-border rounded-xl p-4 md:p-8 flex flex-col items-center justify-center min-h-[220px] md:min-h-[460px] gap-4 md:gap-6"
        style={{ background: "rgba(8,12,26,0.85)", border: "1.5px solid rgba(255,255,255,0.08)" }}>

        {/* 3D Dice */}
        <div className={rolling ? "dice-roll-anim" : won === true ? "dice-win-anim" : won === false ? "dice-lose-anim" : ""}>
          <DiceFace value={diceValue} size={100} accent={accent} />
        </div>

        {/* Result number */}
        <div className={`text-6xl font-mono font-black transition-all duration-500 ${
          rolling ? "opacity-30 scale-95 animate-pulse" :
          won === true ? "text-green-400 scale-110" :
          won === false ? "text-red-400" : "text-muted-foreground/40"
        }`}
          style={{ color: rolling ? undefined : won === true ? "#22c55e" : won === false ? "#ef4444" : `${accent}44` }}>
          {rolling ? "??" : result !== null ? result.toFixed(2) : "00.00"}
        </div>

        {/* Win/lose banner */}
        {won !== null && !rolling && (
          <div className={`text-2xl font-display font-black uppercase tracking-widest`}
            style={{ color: won ? "#22c55e" : "#ef4444", textShadow: won ? "0 0 20px rgba(34,197,94,0.5)" : "0 0 20px rgba(239,68,68,0.5)" }}>
            {won ? `Win! +${formatCurrency(payout)}` : `Lose`}
          </div>
        )}

        {/* Slider visual */}
        <div className="w-full max-w-sm space-y-2">
          <div className="relative h-8 rounded-full overflow-hidden">
            {mode === "over" ? (
              <>
                <div className="absolute inset-y-0 left-0 rounded-l-full" style={{ width: `${target}%`, background: "rgba(239,68,68,0.65)" }} />
                <div className="absolute inset-y-0 rounded-r-full" style={{ left: `${target}%`, right: 0, background: "rgba(34,197,94,0.65)" }} />
              </>
            ) : (
              <>
                <div className="absolute inset-y-0 left-0 rounded-l-full" style={{ width: `${target}%`, background: "rgba(34,197,94,0.65)" }} />
                <div className="absolute inset-y-0 rounded-r-full" style={{ left: `${target}%`, right: 0, background: "rgba(239,68,68,0.65)" }} />
              </>
            )}
            {result !== null && !rolling && (
              <div className="absolute top-0 bottom-0 w-1 rounded-full transition-all duration-500 shadow-lg"
                style={{ left: `${result}%`, background: accent }} />
            )}
            <div className="absolute top-0 bottom-0 w-0.5" style={{ left: `${target}%`, background: "rgba(255,255,255,0.7)" }} />
          </div>
          <div className="flex justify-between text-xs font-mono text-muted-foreground">
            <span>0</span>
            <span className="font-bold" style={{ color: accent }}>{target}</span>
            <span>100</span>
          </div>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-3">
          {(["over", "under"] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className="px-6 py-2.5 rounded-xl font-bold uppercase text-sm transition-all"
              style={{
                background: mode === m ? "rgba(34,197,94,0.85)" : "rgba(255,255,255,0.06)",
                color: mode === m ? "#fff" : "rgba(255,255,255,0.5)",
                border: `1.5px solid ${mode === m ? "rgba(34,197,94,0.8)" : "rgba(255,255,255,0.1)"}`,
                transform: mode === m ? "scale(1.05)" : "scale(1)",
                boxShadow: mode === m ? "0 0 16px rgba(34,197,94,0.4)" : "none",
              }}>
              Roll {m === "over" ? "Over" : "Under"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Controls (side panel) ── */}
      <div className="dice-bet-panel w-full md:w-80 rounded-xl p-6 flex flex-col gap-5"
        style={{ background: "rgba(8,12,26,0.88)", border: "1.5px solid rgba(255,255,255,0.07)", backdropFilter: "blur(14px)", position: "sticky", top: 80 }}>

        {/* Panel title */}
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 3, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", textAlign: "center", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 8 }}>
          Place Your Bet
        </div>

        <div className="space-y-4">
          <div>
            <Label className="text-muted-foreground uppercase text-xs font-bold tracking-wider">Bet Amount</Label>
            <div className="relative mt-2">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</span>
              <Input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))}
                min={game.minBet} max={game.maxBet}
                className="pl-8 font-mono"
                style={{ background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.11)", color: "#fff" }} />
            </div>
            <div className="flex gap-2 mt-2">
              {["MIN", "x2", "/2", "MAX"].map((l, i) => (
                <Button key={l} variant="outline" size="sm" className="flex-1 text-xs h-7"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.6)" }}
                  onClick={() => {
                    if (i === 0) setAmount(game.minBet);
                    if (i === 1) setAmount(Math.min(amount * 2, game.maxBet));
                    if (i === 2) setAmount(Math.max(game.minBet, amount / 2));
                    if (i === 3) setAmount(Math.min(parseFloat(String(user?.balance ?? 0)), game.maxBet));
                  }}>{l}</Button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-muted-foreground uppercase text-xs font-bold tracking-wider">Target: {target}</Label>
              <span className="text-xs font-mono text-muted-foreground">Win: {winChance}%</span>
            </div>
            <input type="range" min={2} max={98} value={target} onChange={e => setTarget(Number(e.target.value))}
              className="w-full" style={{ accentColor: accent }} />
            <div className="flex gap-2 mt-2">
              {[10, 25, 50, 75, 90].map(v => (
                <button key={v} onClick={() => setTarget(v)}
                  className="flex-1 text-xs py-1 rounded font-mono transition-colors"
                  style={{
                    border: `1px solid ${target === v ? accent : "rgba(255,255,255,0.15)"}`,
                    color: target === v ? accent : "rgba(255,255,255,0.45)",
                    background: target === v ? `${accent}15` : "transparent",
                  }}>{v}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="rounded-lg p-3 border space-y-1.5 text-xs font-mono"
          style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${accent}33` }}>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Multiplier</span>
            <span className="font-bold" style={{ color: accent }}>{multiplier}x</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Win Chance</span>
            <span className="text-foreground">{winChance}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Potential Payout</span>
            <span className="font-bold" style={{ color: "#22c55e" }}>${potentialPayout}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">House Edge</span>
            <span className="text-foreground">1%</span>
          </div>
        </div>

        <Button size="lg" className="w-full font-display font-black text-xl uppercase tracking-widest h-14 mt-auto"
          style={{
            background: `linear-gradient(140deg, ${accent}ee, ${accent}aa)`,
            color: "#000", border: "none",
            boxShadow: rolling || placeBet.isPending ? "none" : `0 4px 20px ${accent}55`,
          }}
          onClick={roll} disabled={rolling || placeBet.isPending}>
          {rolling ? "Rolling…" : "Roll Dice"}
        </Button>

        {/* Provably Fair Info */}
        {serverSeedHash && clientSeed !== null && nonce !== null && (
          <div style={{
            marginTop: 12, padding: 10, background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8, fontSize: 8, color: "rgba(255,255,255,0.6)", fontFamily: "monospace", wordBreak: "break-all"
          }}>
            <div style={{ fontWeight: 900, color: "rgba(255,255,255,0.8)", marginBottom: 4 }}>PROVABLY FAIR</div>
            <div style={{ marginBottom: 2 }}>Server Hash: {serverSeedHash.slice(0, 16)}...</div>
            <div style={{ marginBottom: 2 }}>Client Seed: {clientSeed}</div>
            <div>Nonce: {nonce}</div>
            <div style={{ marginTop: 6, fontSize: 7, color: "rgba(255,255,255,0.4)" }}>
              After game completes, verify at:
              <a 
                href={`/api/bets/verify/${betId}`} 
                target="_blank" 
                rel="noreferrer"
                style={{ color: accent, marginLeft: 4, textDecoration: "underline" }}
              >
                /api/bets/verify/{betId}
              </a>
            </div>
            {won !== null && (
              <button
                onClick={() => window.open(`/api/bets/verify/${betId}`, '_blank')}
                style={{
                  marginTop: 8, width: "100%", padding: "4px 8px", background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.2)", borderRadius: 4, color: "#fff",
                  fontSize: 8, fontWeight: 900, cursor: "pointer"
                }}
              >
                VERIFY OUTCOME
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
