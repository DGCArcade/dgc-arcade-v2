import { useState, useEffect, useRef, useId } from "react";
import { Game } from "@workspace/api-client-react";
import { usePlaceBet, getGetMeQueryKey, getListRecentBetsAllQueryKey, getListBetsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatCurrency } from "@/lib/format";
import { THEMES, getTheme, type ThemeId } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProvablyFairPanel } from "./provably-fair-panel";

const RED_NUMS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const ORDER = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];

type BetType = "number"|"color"|"evenodd"|"dozen"|"half";
interface BetSelection { betType: BetType; betValue: string|number }

function useAccent() {
  const [id, setId] = useState<ThemeId>(getTheme());
  useEffect(() => {
    const h = (e: Event) => setId((e as CustomEvent<ThemeId>).detail);
    window.addEventListener("dgc-theme-change", h);
    return () => window.removeEventListener("dgc-theme-change", h);
  }, []);
  return THEMES.find(t => t.id === id)?.accent ?? "#FFD700";
}

interface RouletteProps { game: Game }

export function Roulette({ game }: RouletteProps) {
  const { user, requireAuth } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const placeBet = usePlaceBet();
  const accent = useAccent();
  const wheelRef = useRef<SVGGElement>(null);
  const isMobile = useIsMobile();
  const clipId = useId().replace(/:/g, "");

  const minBet = parseFloat(String(game.minBet ?? 0.01));
  const maxBet = parseFloat(String(game.maxBet ?? 1_000_000));

  const [amount, setAmount] = useState<number>(minBet);
  const [bet, setBet] = useState<BetSelection>({ betType: "color", betValue: "red" });
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<number|null>(null);
  const [win, setWin] = useState<boolean|null>(null);
  const [payout, setPayout] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [ballRotation, setBallRotation] = useState(0);
  const [history, setHistory] = useState<{ num: number; won: boolean }[]>([]);

  const isRed = (n: number) => RED_NUMS.has(n);

  // Payout label for current bet
  const betPayoutLabel = () => {
    if (bet.betType === "number") return "35×";
    if (bet.betType === "color" && bet.betValue === "green") return "35×";
    if (bet.betType === "color") return "2×";
    if (bet.betType === "evenodd") return "2×";
    if (bet.betType === "half") return "2×";
    if (bet.betType === "dozen") return "3×";
    return "2×";
  };

  const handleBet = () => {
    requireAuth(() => {
      if (!user || amount > user.balance) { toast({ title: "Insufficient balance", variant: "destructive" }); return; }
      setSpinning(true);
      setResult(null);
      setWin(null);

      placeBet.mutate({ data: { gameId: game.id, amount, meta: { betType: bet.betType, betValue: bet.betValue } } }, {
        onSuccess: (data) => {
          const pocket = (data.bet.meta as Record<string,unknown>)?.pocket as number ?? 0;
          const idx = ORDER.indexOf(pocket);
          const sectorDeg = 360 / 37;
          const targetAngle = idx * sectorDeg;
          const currentActualRotation = rotation % 360;
          const targetFinalAngle = (360 - targetAngle) % 360;
          const extraRotation = (targetFinalAngle - currentActualRotation + 360) % 360;
          const wheelDelta = 1800 + extraRotation;
          const newRot = rotation + wheelDelta;
          setRotation(newRot);
          const ballDelta = 2160 + (360 - extraRotation);
          setBallRotation(prev => prev - ballDelta);

          setTimeout(() => {
            setSpinning(false);
            setResult(pocket);
            setWin(data.won);
            setPayout(data.payout);
            setRotation(newRot % 360);
            setBallRotation(prevBall => (prevBall - ballDelta) % 360);
            setHistory(h => [{ num: pocket, won: data.won }, ...h].slice(0, 10));
            qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
            qc.invalidateQueries({ queryKey: getListRecentBetsAllQueryKey() });
            qc.invalidateQueries({ queryKey: getListBetsQueryKey() });
            if (data.won) toast({ title: `Win! +${formatCurrency(data.payout)}`, className: "bg-green-500 text-white" });
          }, 4000);
        },
        onError: (err) => {
          setSpinning(false);
          toast({ title: "Bet Failed", description: err.data?.error, variant: "destructive" });
        }
      });
    });
  };

  const pockets = ORDER;
  const r = 90, cx = 110, cy = 110;
  const n = pockets.length;

  const wheelSvg = (
    <svg viewBox="0 0 220 220" className="roulette-wheel-svg drop-shadow-2xl" preserveAspectRatio="xMidYMid meet">
      <defs>
        <clipPath id={`roulette-clip-${clipId}`}>
          <circle cx={cx} cy={cy} r={r + 6} />
        </clipPath>
        <radialGradient id={`roulette-rim-${clipId}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#CC8800" />
          <stop offset="100%" stopColor="#7a4f00" />
        </radialGradient>
      </defs>
      {/* Outer rim */}
      <circle cx={cx} cy={cy} r={r + 16} fill={`url(#roulette-rim-${clipId})`} />
      <circle cx={cx} cy={cy} r={r + 14} fill="#1a0a00" stroke="#CC8800" strokeWidth="3"/>
      <g clipPath={`url(#roulette-clip-${clipId})`}>
        <g ref={wheelRef}
          className="roulette-wheel-spin"
          style={{
            transform: `rotate(${rotation}deg)`,
            transformOrigin: `${cx}px ${cy}px`,
            transition: spinning ? `transform 4s cubic-bezier(0.17,0.67,0.35,1)` : "none",
          }}>
          {pockets.map((num, i) => {
            const startAngle = (i / n) * 2 * Math.PI - Math.PI / 2;
            const endAngle = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2;
            const x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle);
            const x2 = cx + r * Math.cos(endAngle),   y2 = cy + r * Math.sin(endAngle);
            const fill = num === 0 ? "#00AA44" : isRed(num) ? "#CC1111" : "#111";
            const midAngle = (startAngle + endAngle) / 2;
            const tx = cx + (r - 14) * Math.cos(midAngle), ty = cy + (r - 14) * Math.sin(midAngle);
            return (
              <g key={i}>
                <path d={`M${cx},${cy} L${x1},${y1} A${r},${r} 0 0,1 ${x2},${y2} Z`}
                  fill={fill} stroke="#2a2a2a" strokeWidth="0.5"/>
                <text x={tx} y={ty} textAnchor="middle" dominantBaseline="middle"
                  fontSize="5" fontWeight="bold" fill="white" transform={`rotate(${(startAngle+endAngle)/2*180/Math.PI+90},${tx},${ty})`}>
                  {num}
                </text>
              </g>
            );
          })}
          <circle cx={cx} cy={cy} r="18" fill="#CC8800" stroke="#FFD700" strokeWidth="2"/>
          <circle cx={cx} cy={cy} r="8" fill="#111"/>
        </g>
      </g>
      {/* Ball orbit */}
      <g className="roulette-ball-orbit" style={{
        transform: `rotate(${ballRotation}deg)`,
        transformOrigin: `${cx}px ${cy}px`,
        transition: spinning ? `transform 4s cubic-bezier(0.17,0.67,0.35,1)` : "none",
      }}>
        <circle cx={cx} cy={cy - r + 8} r="5" fill="white" stroke="#ccc" strokeWidth="1.2"
          style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.6))" }}/>
      </g>
      {/* Pointer */}
      <polygon className="roulette-pointer" points={`${cx},${cy - r - 4} ${cx - 5},${cy - r + 10} ${cx + 5},${cy - r + 10}`} fill="#FFD700"/>
    </svg>
  );

  return (
    <div className={isMobile ? "roulette-game-root roulette-game-root--mobile flex flex-col" : "roulette-game-root flex flex-col md:flex-row gap-8"}>
      <style>{`
        .roulette-wheel-svg { width: 100%; height: 100%; max-width: 220px; max-height: 220px; overflow: visible; }
        .roulette-wheel-spin, .roulette-ball-orbit { transform-box: fill-box; }

        @media (min-width: 768px) and (max-width: 1024px) {
          .roulette-game-root:not(.roulette-game-root--mobile) { flex-direction: column-reverse !important; gap: 12px !important; }
        }
        .roulette-game-root--mobile {
          flex-direction: column !important; align-items: stretch !important;
          height: 100% !important; gap: 6px !important; padding: 0 !important;
        }
        .roulette-game-root--mobile .roulette-wheel-area {
          order: 1 !important; flex: 1 1 auto !important; min-width: 0 !important;
          min-height: 140px !important; max-height: 42dvh !important; padding: 4px !important; border-radius: 10px !important;
        }
        .roulette-game-root--mobile .roulette-wheel-wrap { width: 100% !important; height: 100% !important; max-height: 100% !important; }
        .roulette-game-root--mobile .roulette-wheel-svg { max-width: min(100%, 160px) !important; max-height: min(100%, 160px) !important; }
        .roulette-game-root--mobile .roulette-result-badge { width: 36px !important; height: 36px !important; font-size: 14px !important; }
        .roulette-game-root--mobile .roulette-status-text { font-size: 10px !important; margin-top: 2px !important; }
        .roulette-game-root--mobile .roulette-bet-panel {
          order: 2 !important; flex: 0 0 auto !important; width: 100% !important;
          max-width: 100% !important; min-width: 0 !important; padding: 6px !important; gap: 5px !important; overflow: visible !important;
        }
        .roulette-game-root--mobile .roulette-bet-panel label { font-size: 9px !important; }
        .roulette-game-root--mobile .roulette-bet-panel input { font-size: 12px !important; height: 32px !important; padding: 4px 4px 4px 22px !important; }
        .roulette-game-root--mobile .roulette-quick-btn { height: 28px !important; min-height: 28px !important; font-size: 9px !important; padding: 0 2px !important; }
        .roulette-game-root--mobile .roulette-type-btn { height: 30px !important; min-height: 30px !important; font-size: 9px !important; padding: 0 4px !important; }
        .roulette-game-root--mobile .roulette-spin-btn { height: 36px !important; min-height: 36px !important; font-size: 11px !important; margin-top: 4px !important; }
        .roulette-game-root--mobile .roulette-number-picker {
          max-height: 120px !important; overflow-y: auto !important;
          grid-template-columns: repeat(6, minmax(0, 1fr)) !important; gap: 4px !important;
          padding: 4px !important; background: rgba(0,0,0,0.2) !important; border-radius: 8px !important;
        }
        .roulette-game-root--mobile .roulette-number-picker button { width: 100% !important; height: 32px !important; min-height: 32px !important; font-size: 11px !important; padding: 0 !important; }
        .roulette-game-root--mobile .roulette-pf-panel { display: none !important; }
        .roulette-type-btn { transition: all 0.15s; }
        .roulette-type-btn:hover:not(:disabled) { filter: brightness(1.1); }
        .roulette-spin-btn { transition: all 0.16s cubic-bezier(0.34,1.56,0.64,1); }
        .roulette-spin-btn:hover:not(:disabled) { transform: scale(1.02); filter: brightness(1.1); }
        .roulette-spin-btn:active:not(:disabled) { transform: scale(0.97); }
      `}</style>

      {/* Wheel Area */}
      <div className="roulette-wheel-area flex-1 bg-secondary border border-border rounded-xl p-4 md:p-6 flex flex-col items-center justify-center min-h-[240px] md:min-h-[440px] gap-3">
        <div className="roulette-wheel-wrap relative w-full h-full flex items-center justify-center min-h-0">
          {wheelSvg}
          {result !== null && !spinning && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className={`roulette-result-badge w-14 h-14 rounded-full flex items-center justify-center font-mono font-black text-xl shadow-lg border-2 ${
                result === 0 ? "bg-green-600 border-green-400 text-white" :
                isRed(result) ? "bg-red-600 border-red-400 text-white" : "bg-zinc-900 border-zinc-500 text-white"
              }`}>{result}</div>
            </div>
          )}
        </div>

        {win !== null && !spinning && !isMobile && (
          <div className={`roulette-status-text font-display font-black text-2xl uppercase tracking-widest ${win ? "text-green-400" : "text-muted-foreground"}`}>
            {win ? `🎉 +${formatCurrency(payout)}` : "No Win"}
          </div>
        )}
        {spinning && !isMobile && <div className="roulette-status-text text-sm text-muted-foreground font-mono animate-pulse">Spinning…</div>}

        {/* History strip */}
        {history.length > 0 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center", maxWidth: 280 }}>
            {history.map((h, i) => (
              <span key={i} style={{
                width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 9, fontFamily: "monospace", fontWeight: 700, color: "#fff",
                background: h.num === 0 ? "#00AA44" : isRed(h.num) ? "#CC1111" : "#333",
                border: `1.5px solid ${h.won ? "rgba(34,197,94,0.6)" : "rgba(255,255,255,0.15)"}`,
                boxShadow: h.won ? "0 0 6px rgba(34,197,94,0.4)" : "none",
              }}>
                {h.num}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Bet Controls */}
      <div className="roulette-bet-panel w-full md:w-80 bg-card border border-border rounded-xl p-6 flex flex-col gap-5">

        {/* Panel title */}
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 3, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", textAlign: "center", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 8 }}>
          Roulette
        </div>

        <div>
          <Label className="text-muted-foreground uppercase text-xs font-bold tracking-wider">Bet Amount</Label>
          <div className="relative mt-2">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</span>
            <Input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))}
              onBlur={() => setAmount(Math.max(minBet, Math.min(amount, maxBet)))}
              min={minBet} max={maxBet} step={0.01}
              className="pl-8 font-mono bg-secondary" disabled={spinning}/>
          </div>
          <div className="flex gap-2 mt-2">
            {[
              { l: "MIN", fn: () => setAmount(minBet) },
              { l: "½",   fn: () => setAmount(Math.max(minBet, amount / 2)) },
              { l: "2×",  fn: () => setAmount(Math.min(amount * 2, maxBet)) },
              { l: "MAX", fn: () => setAmount(Math.min(user?.balance ?? 0, maxBet)) },
            ].map(({ l, fn }) => (
              <Button key={l} variant="outline" size="sm" className="roulette-quick-btn flex-1 text-xs h-7 bg-secondary"
                disabled={spinning} onClick={fn}>{l}</Button>
            ))}
          </div>
        </div>

        {/* Potential win */}
        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "6px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: 1.5, textTransform: "uppercase" }}>Potential Win ({betPayoutLabel()})</span>
          <span style={{ fontSize: 12, fontWeight: 900, color: "#22c55e", fontFamily: "monospace" }}>
            +{formatCurrency(amount * parseFloat(betPayoutLabel()))}
          </span>
        </div>

        <div className="space-y-3">
          <Label className="text-muted-foreground uppercase text-xs font-bold tracking-wider">Bet Type</Label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { v: "red",   l: "Red",   col: "bg-red-700",   payout: "2×" },
              { v: "black", l: "Black", col: "bg-zinc-800",  payout: "2×" },
              { v: "green", l: "Zero",  col: "bg-green-700", payout: "35×" },
            ].map(b => (
              <Button key={b.v} variant="outline" size="sm"
                className={`roulette-type-btn font-bold uppercase text-xs h-10 ${bet.betType==="color"&&bet.betValue===b.v ? "border-primary bg-primary/10":"bg-secondary"}`}
                onClick={() => setBet({ betType: "color", betValue: b.v })} disabled={spinning}>
                <span className={`w-2.5 h-2.5 rounded-full mr-1 ${b.col} flex-shrink-0`}/>
                <span>{isMobile ? b.l.charAt(0) : b.l}</span>
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {["even","odd"].map(v => (
              <Button key={v} variant="outline" size="sm"
                className={`roulette-type-btn font-bold uppercase text-xs h-9 ${bet.betType==="evenodd"&&bet.betValue===v?"border-primary bg-primary/10":"bg-secondary"}`}
                onClick={() => setBet({ betType: "evenodd", betValue: v })} disabled={spinning}>
                {v} <span style={{ fontSize: 8, opacity: 0.6, marginLeft: 3 }}>2×</span>
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[{ v: "low", l: "1–18" }, { v: "high", l: "19–36" }].map(b => (
              <Button key={b.v} variant="outline" size="sm"
                className={`roulette-type-btn font-bold uppercase text-xs h-9 ${bet.betType==="half"&&bet.betValue===b.v?"border-primary bg-primary/10":"bg-secondary"}`}
                onClick={() => setBet({ betType: "half", betValue: b.v })} disabled={spinning}>
                {b.l} <span style={{ fontSize: 8, opacity: 0.6, marginLeft: 3 }}>2×</span>
              </Button>
            ))}
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1.5">Pick a number <span style={{ color: accent, fontWeight: 700 }}>35×</span></div>
            <div className="roulette-number-picker grid grid-cols-10 gap-1">
              {[0, ...Array.from({ length: 36 }, (_, i) => i + 1)].map(num => (
                <button key={num} type="button" onClick={() => setBet({ betType: "number", betValue: num })} disabled={spinning}
                  className={`w-8 h-7 rounded text-xs font-bold transition-all ${
                    bet.betType==="number"&&bet.betValue===num ? "ring-2 scale-110" :
                    num===0 ? "bg-green-800 hover:bg-green-700 text-white" :
                    isRed(num) ? "bg-red-800 hover:bg-red-700 text-white" : "bg-zinc-800 hover:bg-zinc-700 text-white"
                  }`}
                  style={bet.betType==="number"&&bet.betValue===num ? { outline: `2px solid ${accent}` } : {}}>
                  {num}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Balance */}
        {user && (
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontFamily: "monospace", textAlign: "center" }}>
            Balance: <span style={{ color: accent, fontWeight: 900 }}>{formatCurrency(user.balance)}</span>
          </div>
        )}

        <Button size="lg" className="roulette-spin-btn w-full font-display font-black text-xl uppercase tracking-widest h-14 mt-auto"
          onClick={handleBet} disabled={spinning || placeBet.isPending}
          style={{ background: `linear-gradient(140deg, ${accent}ee, ${accent}aa)`, color: "#000", border: "none" }}>
          {spinning ? "Spinning…" : "Spin"}
        </Button>

        <div className="roulette-pf-panel">
          {placeBet.data?.bet && (
            <ProvablyFairPanel
              betId={placeBet.data.bet.id}
              serverSeedHash={placeBet.data.bet.serverSeedHash}
              clientSeed={placeBet.data.bet.clientSeed}
              nonce={placeBet.data.bet.nonce}
              variant="full"
              gameName="roulette"
            />
          )}
        </div>
      </div>
    </div>
  );
}
