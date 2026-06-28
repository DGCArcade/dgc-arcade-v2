import { useState, useEffect, useRef } from "react";
import { Game } from "@workspace/api-client-react";
import { usePlaceBet, getGetMeQueryKey, getListRecentBetsAllQueryKey, getListBetsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useDiceLiveRound, useDiceLiveHistory } from "@/hooks/use-dice-live-round";
import { formatCurrency } from "@/lib/format";
import { THEMES, getTheme, type ThemeId } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { playDiceRollSound } from "@/lib/dice-sound";
import { Copy, Check } from "lucide-react";

interface DiceGameLiveProps { game: Game }

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

// ─── SHA-256 Hash Display Component ───────────────────────────────────────────

function SHAHashDisplay({ hash, label }: { hash: string; label: string }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = () => {
    navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-1">
      <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="flex items-center gap-2 p-2 rounded bg-secondary/40 border border-border/50">
        <code className="text-xs font-mono text-foreground/70 flex-1 truncate">{hash}</code>
        <button onClick={handleCopy} className="p-1 hover:bg-secondary rounded transition-colors">
          {copied ? (
            <Check className="w-3 h-3 text-green-400" />
          ) : (
            <Copy className="w-3 h-3 text-muted-foreground" />
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Live Bettor Feed Component ───────────────────────────────────────────────

function LiveBettorFeed({ bets, label }: { bets: any[]; label: string }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="space-y-2 max-h-40 overflow-y-auto">
        {bets.length === 0 ? (
          <div className="text-center text-muted-foreground text-xs py-3">No bets</div>
        ) : (
          bets.map((bet, i) => (
            <div key={i} className="flex items-center justify-between text-xs p-2 rounded"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex-1 min-w-0">
                <div className="font-mono font-bold text-white truncate">{bet.username}</div>
                <div className="text-muted-foreground text-xs">{bet.mode.toUpperCase()} {bet.target}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="font-bold text-green-400">${bet.amount.toFixed(2)}</div>
                {bet.won !== undefined && (
                  <div className={bet.won ? "text-green-400" : "text-red-400"}>
                    {bet.won ? `+${formatCurrency(bet.payout)}` : "Lost"}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Main Live Dice Component ─────────────────────────────────────────────────

export function DiceGameLive({ game }: DiceGameLiveProps) {
  const { user, requireAuth } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const placeBet = usePlaceBet();
  const accent = useAccent();
  const { data: liveRound } = useDiceLiveRound();

  const [amount, setAmount] = useState<number>(game.minBet);
  const [target, setTarget] = useState<number>(50);
  const [mode, setMode] = useState<"over" | "under">("over");
  const [result, setResult] = useState<number | null>(null);
  const [won, setWon] = useState<boolean | null>(null);
  const [payout, setPayout] = useState(0);
  const [rolling, setRolling] = useState(false);
  const [diceValue, setDiceValue] = useState<number>(1);
  const [bettingOnNext, setBettingOnNext] = useState(false);

  const winChance = mode === "over" ? 100 - target : target;
  const multiplier = Math.max(0.01, (99 / winChance)).toFixed(4);
  const potentialPayout = (amount * parseFloat(multiplier)).toFixed(2);

  // Sync with live round state
  useEffect(() => {
    if (!liveRound?.round) return;

    const round = liveRound.round;
    if (round.state === "rolling" && !rolling) {
      setRolling(true);
      playDiceRollSound();
    }

    if (round.state === "results" && rolling && round.roll) {
      setRolling(false);
      setResult(round.roll);
      const finalDice = Math.max(1, Math.min(6, Math.ceil(round.roll / (100 / 6))));
      setDiceValue(finalDice);
    }
  }, [liveRound?.round?.state, liveRound?.round?.roll]);

  const roll = () => {
    requireAuth(() => {
      if (!user || amount > parseFloat(String(user.balance))) {
        toast({ title: "Insufficient balance", variant: "destructive" });
        return;
      }

      if (!liveRound?.round) {
        toast({ title: "No active round", variant: "destructive" });
        return;
      }

      const round = liveRound.round;
      
      // Determine which round to bet on
      let targetRound = round.roundId;
      if (round.state !== "betting") {
        // If current round is not betting, bet on next round
        setBettingOnNext(true);
        // We'll need to get the next round ID from the API
        // For now, we'll just try to place the bet and let the API handle it
      }

      setResult(null);
      setWon(null);

      // Animate dice
      let frames = 0;
      const animate = setInterval(() => {
        setDiceValue(Math.floor(Math.random() * 6) + 1);
        frames++;
        if (frames > 15) clearInterval(animate);
      }, 100);

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
          setBettingOnNext(false);
          qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
          qc.invalidateQueries({ queryKey: getListRecentBetsAllQueryKey() });
          qc.invalidateQueries({ queryKey: getListBetsQueryKey() });
          if (data.won) {
            toast({ title: `Win! Roll: ${roll.toFixed(2)} — +${formatCurrency(data.payout)}`, className: "bg-green-500 text-white" });
          }
        },
        onError: (err) => {
          clearInterval(animate);
          setBettingOnNext(false);
          toast({ title: "Bet Failed", description: err.data?.error, variant: "destructive" });
        }
      });
    });
  };

  const timeRemaining = liveRound?.round?.timeRemaining ?? 0;
  const bettingActive = liveRound?.round?.state === "betting";

  return (
    <div className="dice-game-live-root w-full min-h-screen bg-gradient-to-br from-slate-950 to-slate-900 p-2 md:p-4">
      <style>{`
        @media (max-width: 768px) {
          .dice-game-live-root { display: flex; flex-direction: column; }
          .dice-betting-panel { width: 100%; order: 1; }
          .dice-display-area { width: 100%; order: 2; }
          .dice-feed-area { width: 100%; order: 3; }
          .dice-hash-area { width: 100%; order: 4; }
        }
        @media (min-width: 769px) {
          .dice-game-live-root { display: grid; grid-template-columns: 280px 1fr 300px; gap: 16px; }
          .dice-betting-panel { grid-column: 1; grid-row: 1 / 3; }
          .dice-display-area { grid-column: 2; grid-row: 1; }
          .dice-feed-area { grid-column: 3; grid-row: 1; }
          .dice-hash-area { grid-column: 2 / 4; grid-row: 2; }
        }
        @keyframes dice-bounce {
          0%,100% { transform: translateY(0) rotate(0deg) scale(1); }
          25%      { transform: translateY(-16px) rotate(-12deg) scale(1.05); }
          75%      { transform: translateY(-8px) rotate(8deg) scale(1.02); }
        }
        @keyframes dice-win-glow {
          0%,100% { filter: drop-shadow(0 0 12px rgba(34,197,94,0.5)); }
          50%      { filter: drop-shadow(0 0 24px rgba(34,197,94,0.9)); }
        }
        @keyframes dice-lose-glow {
          0%,100% { filter: drop-shadow(0 0 12px rgba(239,68,68,0.5)); }
          50%      { filter: drop-shadow(0 0 24px rgba(239,68,68,0.9)); }
        }
        .dice-roll-anim { animation: dice-bounce 0.4s ease-in-out infinite; }
        .dice-win-anim  { animation: dice-win-glow 1.5s ease-in-out infinite; }
        .dice-lose-anim { animation: dice-lose-glow 1.5s ease-in-out infinite; }
        .countdown-badge {
          display: inline-block;
          padding: 6px 12px;
          border-radius: 8px;
          font-weight: bold;
          font-size: 14px;
          font-family: monospace;
        }
      `}</style>

      {/* ─── BETTING PANEL (Left / Top on mobile) ─── */}
      <div className="dice-betting-panel rounded-xl p-5 flex flex-col gap-4"
        style={{ background: "rgba(8,12,26,0.92)", border: "1.5px solid rgba(255,255,255,0.08)", backdropFilter: "blur(16px)" }}>

        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 3, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", textAlign: "center", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 8 }}>
          {bettingOnNext ? "Next Round Bet" : "Live Betting"}
        </div>

        {/* Round Status */}
        <div className="text-center">
          <div className="text-xs text-muted-foreground mb-1">Round Status</div>
          <div className="countdown-badge" style={{
            background: bettingActive ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)",
            color: bettingActive ? "#22c55e" : "#ef4444",
            borderColor: bettingActive ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.5)",
            border: "1px solid"
          }}>
            {liveRound?.round?.state === "betting" ? `${Math.ceil(timeRemaining / 1000)}s` : liveRound?.round?.state === "rolling" ? "Rolling..." : "Results"}
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <Label className="text-muted-foreground uppercase text-xs font-bold tracking-wider">Bet Amount</Label>
            <div className="relative mt-2">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</span>
              <Input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))}
                min={game.minBet} max={game.maxBet} disabled={!bettingActive && !bettingOnNext}
                className="pl-8 font-mono text-sm"
                style={{ background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.11)", color: "#fff" }} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-muted-foreground uppercase text-xs font-bold tracking-wider">Target: {target}</Label>
              <span className="text-xs font-mono text-muted-foreground">Win: {winChance}%</span>
            </div>
            <input type="range" min={2} max={98} value={target} onChange={e => setTarget(Number(e.target.value))}
              disabled={!bettingActive && !bettingOnNext}
              className="w-full" style={{ accentColor: accent }} />
          </div>

          <div className="flex gap-2">
            {(["over", "under"] as const).map(m => (
              <button key={m} onClick={() => setMode(m)} disabled={!bettingActive && !bettingOnNext}
                className="flex-1 px-3 py-2 rounded-lg font-bold text-xs uppercase transition-all disabled:opacity-50"
                style={{
                  background: mode === m ? "rgba(34,197,94,0.85)" : "rgba(255,255,255,0.06)",
                  color: mode === m ? "#fff" : "rgba(255,255,255,0.5)",
                  border: `1px solid ${mode === m ? "rgba(34,197,94,0.8)" : "rgba(255,255,255,0.1)"}`,
                }}>
                {m === "over" ? "Over" : "Under"}
              </button>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="rounded-lg p-3 border space-y-1 text-xs font-mono"
          style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${accent}33` }}>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Multiplier</span>
            <span className="font-bold" style={{ color: accent }}>{multiplier}x</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Potential</span>
            <span className="font-bold text-green-400">${potentialPayout}</span>
          </div>
        </div>

        {/* Roll Button */}
        <Button onClick={roll} disabled={(!bettingActive && !bettingOnNext) || rolling || placeBet.isPending}
          className="w-full py-3 font-bold uppercase text-sm"
          style={{
            background: (bettingActive || bettingOnNext) ? "rgba(34,197,94,0.9)" : "rgba(100,100,100,0.5)",
            color: "#fff",
            opacity: (bettingActive || bettingOnNext) ? 1 : 0.6,
          }}>
          {rolling ? "Rolling..." : bettingOnNext ? "Bet on Next" : "Place Bet"}
        </Button>
      </div>

      {/* ─── DICE DISPLAY (Center) ─── */}
      <div className="dice-display-area rounded-xl p-6 flex flex-col items-center justify-center gap-6"
        style={{ background: "rgba(8,12,26,0.85)", border: "1.5px solid rgba(255,255,255,0.08)", minHeight: "300px" }}>

        <div className={rolling ? "dice-roll-anim" : won === true ? "dice-win-anim" : won === false ? "dice-lose-anim" : ""}>
          <DiceFace value={diceValue} size={120} accent={accent} />
        </div>

        <div className={`text-5xl md:text-6xl font-mono font-black transition-all duration-500 ${
          rolling ? "opacity-30 scale-95 animate-pulse" :
          won === true ? "text-green-400 scale-110" :
          won === false ? "text-red-400" : "text-muted-foreground/40"
        }`}
          style={{ color: rolling ? undefined : won === true ? "#22c55e" : won === false ? "#ef4444" : `${accent}44` }}>
          {rolling ? "??" : result !== null ? result.toFixed(0) : "00"}
        </div>

        {won !== null && !rolling && (
          <div className={`text-xl md:text-2xl font-display font-black uppercase tracking-widest`}
            style={{ color: won ? "#22c55e" : "#ef4444", textShadow: won ? "0 0 20px rgba(34,197,94,0.5)" : "0 0 20px rgba(239,68,68,0.5)" }}>
            {won ? `Win! +${formatCurrency(payout)}` : `Lose`}
          </div>
        )}

        {/* Slider visual */}
        <div className="w-full max-w-xs space-y-2">
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
      </div>

      {/* ─── LIVE FEED (Right / Bottom on mobile) ─── */}
      <div className="dice-feed-area rounded-xl p-5 flex flex-col gap-3"
        style={{ background: "rgba(8,12,26,0.92)", border: "1.5px solid rgba(255,255,255,0.08)", backdropFilter: "blur(16px)" }}>

        <LiveBettorFeed bets={liveRound?.bets ?? []} label={`Live Bets (${liveRound?.round?.betCount ?? 0})`} />
      </div>

      {/* ─── SHA-256 HASH DISPLAY (Bottom / Full width on mobile) ─── */}
      <div className="dice-hash-area rounded-xl p-5 space-y-4"
        style={{ background: "rgba(8,12,26,0.92)", border: "1.5px solid rgba(255,255,255,0.08)", backdropFilter: "blur(16px)" }}>

        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 3, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>
          Provably Fair - SHA-256 Verification
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {liveRound?.round?.serverSeedHash && (
            <SHAHashDisplay hash={liveRound.round.serverSeedHash} label="Current Round Hash" />
          )}
          
          {/* Show previous round hash for verification */}
          {liveRound?.bets && liveRound.bets.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Bets This Round</div>
              <div className="text-sm font-bold text-green-400">${liveRound.round?.totalBetAmount?.toFixed(2) ?? "0.00"}</div>
            </div>
          )}
        </div>

        <div className="text-xs text-muted-foreground leading-relaxed">
          <p>Each round uses a server seed (hashed above) and a client seed to generate a fair, verifiable roll. Players can verify the result by checking the hash against the server seed revealed after the round completes.</p>
        </div>
      </div>
    </div>
  );
}
