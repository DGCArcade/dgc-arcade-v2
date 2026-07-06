import { useState, useEffect } from "react";
import { Game } from "@workspace/api-client-react";
import { usePlaceBet, getGetMeQueryKey, getListRecentBetsAllQueryKey, getListBetsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useDiceLiveRound } from "@/hooks/use-dice-live-round";
import { formatCurrency } from "@/lib/format";
import { THEMES, getTheme, type ThemeId } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { playRealisticDiceSound } from "@/lib/realistic-dice-sound";
import { Copy, Check } from "lucide-react";

interface DiceGameLiveProps { game: Game }

function useAccent() {
  const [id, setId] = useState<ThemeId>(getTheme());
  useEffect(() => {
    const h = (e: Event) => setId((e as CustomEvent<ThemeId>).detail);
    window.addEventListener("dgc-theme-change", h);
    return () => window.removeEventListener("dgc-theme-change", h);
  }, []);
  return THEMES.find(t => t.id === id)?.accent ?? "#FFD700";
}

// ─── 3D Rolling Dice Component ───────────────────────────────────────────────

function RollingDice({ value, size = 100, accent, isRolling }: { value: number; size?: number; accent: string; isRolling: boolean }) {
  const [rotation, setRotation] = useState({ x: 0, y: 0, z: 0 });

  useEffect(() => {
    if (!isRolling) return;
    const interval = setInterval(() => {
      setRotation({ x: Math.random() * 360, y: Math.random() * 360, z: Math.random() * 360 });
    }, 50);
    return () => clearInterval(interval);
  }, [isRolling]);

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
    <div style={{ width: size, height: size, perspective: "1000px", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{
        width: size, height: size, borderRadius: size * 0.18,
        background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.12), rgba(0,0,0,0.3))`,
        backgroundColor: "#fafafa",
        border: "2px solid rgba(0,0,0,0.15)",
        position: "relative",
        boxShadow: `0 8px 24px rgba(0,0,0,0.6), inset 0 2px 6px rgba(255,255,255,0.4), inset 0 -2px 6px rgba(0,0,0,0.15)`,
        transform: isRolling ? `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg) rotateZ(${rotation.z}deg)` : "rotateX(0) rotateY(0) rotateZ(0)",
        transition: isRolling ? "none" : "transform 0.3s ease-out",
        transformStyle: "preserve-3d",
      }}>
        {positions.map(([x, y], i) => (
          <div key={i} style={{
            position: "absolute", width: dotSize, height: dotSize, borderRadius: "50%",
            background: `radial-gradient(circle at 35% 35%, ${accent}ff, ${accent}99)`,
            boxShadow: `0 2px 4px rgba(0,0,0,0.4), 0 0 6px ${accent}66`,
            left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)",
          }} />
        ))}
      </div>
    </div>
  );
}

// ─── SHA-256 Hash Display ───────────────────────────────────────────────────

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
          {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
        </button>
      </div>
    </div>
  );
}

// ─── Live Bettor Feed ───────────────────────────────────────────────────────

function LiveBettorFeed({ bets, label, showResults }: { bets: any[]; label: string; showResults: boolean }) {
  return (
    <div className="space-y-2 h-full flex flex-col">
      <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="space-y-1 overflow-y-auto flex-1">
        {bets.length === 0 ? (
          <div className="text-center text-muted-foreground text-xs py-1">No bets yet</div>
        ) : (
          bets.map((bet, i) => (
            <div key={i} className="flex items-center justify-between text-xs p-1 rounded"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex-1 min-w-0">
                <div className="font-mono font-bold text-white truncate">{bet.username}</div>
                <div className="text-muted-foreground text-xs">{bet.mode.toUpperCase()} {bet.target}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="font-bold text-green-400">${bet.amount.toFixed(2)}</div>
                {showResults && bet.won !== undefined && (
                  <div className={`text-xs font-bold ${bet.won ? "text-green-400" : "text-red-400"}`}>
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

// ─── Main Dice Game Component ────────────────────────────────────────────────

export function DiceGameLive({ game }: DiceGameLiveProps) {
  const { user, requireAuth } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const placeBet = usePlaceBet();
  const accent = useAccent();
  const { data: liveRound } = useDiceLiveRound();

  const minBet = parseFloat(String(game.minBet ?? 0.01));
  const maxBet = parseFloat(String(game.maxBet ?? 1_000_000));

  const [amount, setAmount] = useState<number>(minBet);
  const [target, setTarget] = useState<number>(50);
  const [mode, setMode] = useState<"over" | "under">("over");
  const [result, setResult] = useState<number | null>(null);
  const [won, setWon] = useState<boolean | null>(null);
  const [payout, setPayout] = useState(0);
  const [rolling, setRolling] = useState(false);
  const [diceValue, setDiceValue] = useState<number>(1);
  const [bettingOnNext, setBettingOnNext] = useState(false);
  const [showLiveResults, setShowLiveResults] = useState(false);
  const [betPlaced, setBetPlaced] = useState(false);

  const winChance = mode === "over" ? 100 - target : target;
  const multiplier = Math.max(0.01, (99 / winChance)).toFixed(4);
  const potentialPayout = (amount * parseFloat(multiplier)).toFixed(2);

  useEffect(() => {
    if (!liveRound?.round) return;
    const round = liveRound.round;
    if (round.state === "rolling" && !rolling) {
      setRolling(true);
      setShowLiveResults(false);
      playRealisticDiceSound();
    }
    if (round.state === "results" && rolling && round.roll) {
      setRolling(false);
      setResult(round.roll);
      const finalDice = Math.max(1, Math.min(6, Math.ceil(round.roll / (100 / 6))));
      setDiceValue(finalDice);
      setTimeout(() => { setShowLiveResults(true); }, 1500);
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
      if (round.state !== "betting") setBettingOnNext(true);
      setResult(null);
      setWon(null);
      setShowLiveResults(false);
      setBetPlaced(true);
      setTimeout(() => setBetPlaced(false), 300);

      let frames = 0;
      const animate = setInterval(() => {
        setDiceValue(Math.floor(Math.random() * 6) + 1);
        frames++;
        if (frames > 25) clearInterval(animate);
      }, 80);

      placeBet.mutate({ data: { gameId: game.id, amount, meta: { target, mode } } }, {
        onSuccess: (data) => {
          setTimeout(() => {
            clearInterval(animate);
            const meta = data.bet.meta as Record<string, unknown>;
            const rollNum = meta?.roll as number ?? 50;
            const finalDice = Math.max(1, Math.min(6, Math.ceil(rollNum / (100 / 6))));
            setDiceValue(finalDice);
            setResult(rollNum);
            setWon(data.won);
            setPayout(data.payout);
            setBettingOnNext(false);
            qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
            qc.invalidateQueries({ queryKey: getListRecentBetsAllQueryKey() });
            qc.invalidateQueries({ queryKey: getListBetsQueryKey() });
            if (data.won) toast({ title: `Win! +${formatCurrency(data.payout)}`, className: "bg-green-500 text-white" });
          }, 800);
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
  const canBet = bettingActive || bettingOnNext;

  return (
    <div className="w-full bg-gradient-to-br from-slate-950 to-slate-900 p-2 md:p-4">
      <style>{`
        /* DESKTOP LAYOUT */
        @media (min-width: 1024px) {
          .dice-container { display: grid; grid-template-columns: 280px 1fr 300px; grid-template-rows: auto auto; gap: 16px; }
          .betting-panel { grid-column: 1; grid-row: 1 / 3; padding: 20px; }
          .dice-display { grid-column: 2; grid-row: 1; padding: 24px; }
          .live-feed { grid-column: 3; grid-row: 1; padding: 20px; }
          .sha-display { grid-column: 2 / 4; grid-row: 2; padding: 20px; }
          .dice-size { width: 120px; height: 120px; }
          .result-text { font-size: 60px; }
        }
        /* TABLET */
        @media (min-width: 768px) and (max-width: 1023px) {
          .dice-container { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: auto auto auto; gap: 12px; }
          .betting-panel { grid-column: 1; grid-row: 1 / 3; padding: 16px; }
          .dice-display { grid-column: 2; grid-row: 1; padding: 16px; }
          .live-feed { grid-column: 2; grid-row: 2; padding: 16px; }
          .sha-display { grid-column: 1 / 3; grid-row: 3; padding: 16px; }
          .dice-size { width: 100px; height: 100px; }
          .result-text { font-size: 48px; }
        }
        /* MOBILE */
        @media (max-width: 767px) {
          .dice-container { display: flex; flex-direction: column; gap: 8px; max-height: 100dvh; overflow-y: auto; }
          .betting-panel { padding: 12px; order: 2; flex-shrink: 0; }
          .dice-display { padding: 12px; order: 1; flex-shrink: 0; }
          .live-feed { padding: 8px; order: 3; flex-shrink: 0; max-height: 140px; }
          .sha-display { padding: 12px; display: none; }
          .dice-size { width: 70px; height: 70px; }
          .result-text { font-size: 36px; }
          .label-text { font-size: 9px; }
          .button-text { font-size: 10px; }
        }
        @keyframes dice-bounce {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-12px) scale(1.05); }
        }
        @keyframes bet-pulse {
          0% { transform: scale(1); }
          50% { transform: scale(0.95); }
          100% { transform: scale(1); }
        }
        .dice-roll-anim { animation: dice-bounce 0.4s ease-in-out infinite; }
        .bet-placed-anim { animation: bet-pulse 0.3s ease-in-out; }
        .dice-bet-btn { transition: all 0.16s cubic-bezier(0.34,1.56,0.64,1); }
        .dice-bet-btn:hover:not(:disabled) { transform: scale(1.04); filter: brightness(1.1); }
        .dice-bet-btn:active:not(:disabled) { transform: scale(0.96); }
        input[type="range"] {
          -webkit-appearance: none; appearance: none; width: 100%; height: 6px;
          border-radius: 3px; outline: none; cursor: pointer;
          background: linear-gradient(to right, rgba(239,68,68,0.6) 0%, rgba(239,68,68,0.6) var(--value), rgba(34,197,94,0.6) var(--value), rgba(34,197,94,0.6) 100%);
        }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none; width: 18px; height: 18px;
          border-radius: 50%; background: linear-gradient(135deg, rgba(255,255,255,0.9), rgba(255,255,255,0.7));
          cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.5), 0 0 0 2px rgba(255,255,255,0.3); border: 2px solid rgba(0,0,0,0.2);
        }
        input[type="range"]::-moz-range-thumb {
          width: 18px; height: 18px; border-radius: 50%;
          background: linear-gradient(135deg, rgba(255,255,255,0.9), rgba(255,255,255,0.7));
          cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.5), 0 0 0 2px rgba(255,255,255,0.3); border: 2px solid rgba(0,0,0,0.2);
        }
      `}</style>

      <div className="dice-container">
        {/* ─── BETTING PANEL ─── */}
        <div className="betting-panel rounded-xl flex flex-col gap-4"
          style={{ background: "rgba(8,12,26,0.92)", border: "1.5px solid rgba(255,255,255,0.08)" }}>

          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 3, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", textAlign: "center", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 8 }}>
            {bettingOnNext ? "Next Round Bet" : "Live Dice"}
          </div>

          {/* Round Status */}
          <div className="text-center">
            <div style={{
              display: "inline-block", padding: "6px 12px", borderRadius: "8px",
              fontWeight: "bold", fontSize: "13px", fontFamily: "monospace",
              background: bettingActive ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)",
              color: bettingActive ? "#22c55e" : "#ef4444",
              border: `1px solid ${bettingActive ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.5)"}`,
            }}>
              {liveRound?.round?.state === "betting"
                ? `Betting: ${Math.ceil(timeRemaining / 1000)}s`
                : liveRound?.round?.state === "rolling"
                ? "Rolling…"
                : "Results"}
            </div>
          </div>

          <div className="space-y-3">
            {/* Bet Amount */}
            <div>
              <Label className="text-muted-foreground uppercase text-xs font-bold tracking-wider">Bet Amount</Label>
              <div className="relative mt-2">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</span>
                <Input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))}
                  onBlur={() => setAmount(Math.max(minBet, Math.min(amount, maxBet)))}
                  min={minBet} max={maxBet} step={0.01}
                  disabled={!canBet}
                  className="pl-8 font-mono text-sm"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.11)", color: "#fff" }} />
              </div>
              {/* Quick bet buttons */}
              <div className="flex gap-1.5 mt-2">
                {[
                  { l: "MIN", fn: () => setAmount(minBet) },
                  { l: "½",   fn: () => setAmount(Math.max(minBet, amount / 2)) },
                  { l: "2×",  fn: () => setAmount(Math.min(amount * 2, maxBet)) },
                  { l: "MAX", fn: () => setAmount(Math.min(parseFloat(String(user?.balance ?? 0)), maxBet)) },
                ].map(({ l, fn }) => (
                  <button key={l} onClick={fn} disabled={!canBet}
                    style={{
                      flex: 1, padding: "5px 2px", borderRadius: 6, fontSize: 9, fontWeight: 700,
                      background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)",
                      color: "rgba(255,255,255,0.6)", cursor: !canBet ? "not-allowed" : "pointer",
                      opacity: !canBet ? 0.38 : 1, transition: "all 0.14s",
                    }}>{l}</button>
                ))}
              </div>
            </div>

            {/* Target Slider */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-muted-foreground uppercase text-xs font-bold tracking-wider">
                  Target: <span style={{ color: accent, fontSize: 13, fontWeight: 900 }}>{target}</span>
                </Label>
                <span className="text-xs font-mono" style={{ color: accent }}>Win: {winChance}%</span>
              </div>
              <input
                type="range" min={2} max={98} value={target}
                onChange={e => setTarget(Number(e.target.value))}
                disabled={!canBet}
                style={{ "--value": `${target}%` } as React.CSSProperties}
                className="w-full"
              />
              {/* Target presets */}
              <div className="flex gap-1.5 mt-2">
                {[10, 25, 50, 75, 90].map(v => (
                  <button key={v} onClick={() => setTarget(v)} disabled={!canBet}
                    className="flex-1 text-xs py-1 rounded font-mono"
                    style={{
                      border: `1px solid ${target === v ? accent : "rgba(255,255,255,0.15)"}`,
                      color: target === v ? accent : "rgba(255,255,255,0.45)",
                      background: target === v ? `${accent}15` : "transparent",
                      opacity: !canBet ? 0.38 : 1, transition: "all 0.14s",
                    }}>{v}</button>
                ))}
              </div>
            </div>

            {/* Over/Under Toggle */}
            <div className="flex gap-2">
              {(["over", "under"] as const).map(m => (
                <button key={m} onClick={() => setMode(m)} disabled={!canBet}
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
          <div className="rounded-lg p-3 space-y-1.5 text-xs font-mono"
            style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${accent}33` }}>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Multiplier</span>
              <span className="font-bold" style={{ color: accent }}>{multiplier}×</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Win Chance</span>
              <span className="text-foreground">{winChance}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Potential Win</span>
              <span className="font-bold text-green-400">${potentialPayout}</span>
            </div>
            {user && (
              <div className="flex justify-between border-t border-white/10 pt-1.5 mt-1.5">
                <span className="text-muted-foreground">Balance</span>
                <span style={{ color: accent, fontWeight: 900 }}>{formatCurrency(user.balance)}</span>
              </div>
            )}
          </div>

          <Button onClick={roll}
            disabled={!canBet || rolling || placeBet.isPending}
            className={`dice-bet-btn w-full py-3 font-bold uppercase text-sm ${betPlaced ? "bet-placed-anim" : ""}`}
            style={{
              background: canBet ? `linear-gradient(140deg, ${accent}ee, ${accent}aa)` : "rgba(100,100,100,0.5)",
              color: canBet ? "#000" : "#fff",
              border: "none",
              boxShadow: canBet ? `0 4px 16px ${accent}44` : "none",
              opacity: canBet ? 1 : 0.6,
            }}>
            {rolling ? "Rolling…" : bettingOnNext ? "Queued for Next" : "Place Bet"}
          </Button>
        </div>

        {/* ─── DICE DISPLAY ─── */}
        <div className="dice-display rounded-xl flex flex-col items-center justify-center gap-6"
          style={{ background: "rgba(8,12,26,0.85)", border: "1.5px solid rgba(255,255,255,0.08)", minHeight: "300px" }}>

          <div className={rolling ? "dice-roll-anim" : ""}>
            <RollingDice value={diceValue} size={120} accent={accent} isRolling={rolling} />
          </div>

          <div className={`result-text font-mono font-black transition-all duration-500`}
            style={{
              color: rolling ? `${accent}44` : won === true ? "#22c55e" : won === false ? "#ef4444" : `${accent}44`,
              opacity: rolling ? 0.4 : 1,
            }}>
            {rolling ? "??" : result !== null ? result.toFixed(0) : "00"}
          </div>

          {won !== null && !rolling && (
            <div style={{
              fontSize: 20, fontWeight: 900, textTransform: "uppercase", letterSpacing: 2,
              color: won ? "#22c55e" : "#ef4444",
              textShadow: `0 0 20px ${won ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.5)"}`,
            }}>
              {won ? `✓ Win! +${formatCurrency(payout)}` : "✗ Lose"}
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

        {/* ─── LIVE FEED ─── */}
        <div className="live-feed rounded-xl flex flex-col gap-3"
          style={{ background: "rgba(8,12,26,0.92)", border: "1.5px solid rgba(255,255,255,0.08)" }}>
          <LiveBettorFeed
            bets={liveRound?.bets ?? []}
            label={`Live Bets (${liveRound?.round?.betCount ?? 0})`}
            showResults={showLiveResults}
          />
        </div>

        {/* ─── SHA HASH ─── */}
        <div className="sha-display rounded-xl space-y-4"
          style={{ background: "rgba(8,12,26,0.92)", border: "1.5px solid rgba(255,255,255,0.08)" }}>

          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 3, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>
            Provably Fair — SHA-256 Verification
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {liveRound?.round?.serverSeedHash && (
              <SHAHashDisplay hash={liveRound.round.serverSeedHash} label="Current Round Hash" />
            )}
            {liveRound?.bets && liveRound.bets.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Bets This Round</div>
                <div className="text-sm font-bold text-green-400">${liveRound.round?.totalBetAmount?.toFixed(2) ?? "0.00"}</div>
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            Each round uses a server seed (hashed above) and a client seed to generate a fair, verifiable roll. Players can verify the result by checking the hash against the server seed revealed after the round completes.
          </p>
        </div>
      </div>
    </div>
  );
}
