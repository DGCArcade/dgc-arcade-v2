import { useState, useEffect, useRef } from "react";
import { Game } from "@workspace/api-client-react";
import { usePlaceBet, getGetMeQueryKey, getListRecentBetsAllQueryKey, getListBetsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import { THEMES, getTheme, type ThemeId } from "@/lib/theme";
import { ProvablyFairPanel } from "./provably-fair-panel";

interface PlinkoProps { game: Game }

const ROWS = 8;
const BUCKET_MULTIPLIERS = [10, 3, 2, 1.5, 1, 1.5, 2, 3, 10];
const BUCKET_COLORS = ["#FF2244", "#FF6622", "#FFB800", "#FFE566", "#aaaaaa", "#FFE566", "#FFB800", "#FF6622", "#FF2244"];

function useAccent() {
  const [id, setId] = useState<ThemeId>(getTheme());
  useEffect(() => {
    const h = (e: Event) => setId((e as CustomEvent<ThemeId>).detail);
    window.addEventListener("dgc-theme-change", h);
    return () => window.removeEventListener("dgc-theme-change", h);
  }, []);
  return THEMES.find(t => t.id === id)?.accent ?? "#FF8C00";
}

interface BallState {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  bucket: number;
  done: boolean;
  animationProgress: number;
}

export function Plinko({ game }: PlinkoProps) {
  const { user, requireAuth } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const placeBet = usePlaceBet();
  const accent = useAccent();
  const boardRef = useRef<SVGSVGElement>(null);
  const animationRef = useRef<number | null>(null);

  const minBet = parseFloat(String(game.minBet ?? 0.01));
  const maxBet = parseFloat(String(game.maxBet ?? 1_000_000));

  const [amount, setAmount] = useState<number>(minBet);
  const [amountStr, setAmountStr] = useState<string>(String(minBet));
  const [balls, setBalls] = useState<BallState[]>([]);
  const [results, setResults] = useState<{ multiplier: number; win: boolean; payout: number }[]>([]);
  const [lastBetData, setLastBetData] = useState<any>(null);
  const ballId = useRef(0);
  const ballsRef = useRef<BallState[]>([]);

  const W = 340;
  const H = 320;
  const pegRadius = 4;
  const ballRadius = 6;
  const pegSpacing = W / (ROWS + 1);
  const rowHeight = (H - 100) / ROWS;

  const getPegs = () => {
    const pegs: { x: number; y: number }[] = [];
    for (let r = 0; r < ROWS; r++) {
      const count = r + 2;
      const totalW = (count - 1) * pegSpacing;
      const startX = (W - totalW) / 2;
      for (let c = 0; c < count; c++) {
        pegs.push({ x: startX + c * pegSpacing, y: 50 + r * rowHeight });
      }
    }
    return pegs;
  };

  const pegs = getPegs();

  const getBucketX = (b: number) => {
    const bucketW = W / 9;
    return bucketW * b + bucketW / 2;
  };

  // Physics animation loop
  useEffect(() => {
    const animate = () => {
      setBalls(prev => {
        const updated = prev.map(ball => {
          let nb = { ...ball };
          if (nb.done) {
            nb.animationProgress += 0.05;
            if (nb.animationProgress >= 1) return null as any;
            return nb;
          }
          nb.vy += 0.6;
          nb.x += nb.vx;
          nb.y += nb.vy;
          for (const peg of pegs) {
            const dx = nb.x - peg.x;
            const dy = nb.y - peg.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const minDist = pegRadius + ballRadius;
            if (dist < minDist) {
              const angle = Math.atan2(dy, dx);
              nb.x = peg.x + Math.cos(angle) * minDist;
              nb.y = peg.y + Math.sin(angle) * minDist;
              const speed = Math.sqrt(nb.vx ** 2 + nb.vy ** 2);
              const dot = nb.vx * Math.cos(angle) + nb.vy * Math.sin(angle);
              nb.vx = (Math.cos(angle) * dot - Math.sin(angle) * Math.sqrt(speed ** 2 - dot ** 2)) * 0.85;
              nb.vy = (Math.sin(angle) * dot + Math.cos(angle) * Math.sqrt(speed ** 2 - dot ** 2)) * 0.85;
            }
          }
          if (nb.x - ballRadius < 0) { nb.x = ballRadius; nb.vx *= -0.8; }
          if (nb.x + ballRadius > W) { nb.x = W - ballRadius; nb.vx *= -0.8; }
          if (nb.y > H - 40) {
            const bucketIdx = Math.floor((nb.x / W) * 9);
            nb.bucket = Math.max(0, Math.min(8, bucketIdx));
            nb.done = true; nb.y = H - 30; nb.vx = 0; nb.vy = 0; nb.animationProgress = 0;
          }
          return nb;
        }).filter(b => b !== null);
        ballsRef.current = updated;
        return updated;
      });
      animationRef.current = requestAnimationFrame(animate);
    };
    animationRef.current = requestAnimationFrame(animate);
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [pegs]);

  const handleAmountChange = (val: string) => {
    setAmountStr(val);
    const n = parseFloat(val.replace(/[^0-9.]/g, ""));
    if (!isNaN(n)) setAmount(Math.min(n, maxBet));
    else if (val === "" || val === ".") setAmount(0);
  };
  const handleAmountBlur = () => {
    const c = Math.max(minBet, Math.min(amount, maxBet));
    setAmount(c); setAmountStr(String(c));
  };
  const setAmt = (n: number) => { setAmount(n); setAmountStr(String(n)); };

  const handleBet = () => {
    requireAuth(() => {
      if (!user || amount > user.balance) {
        toast({ title: "Insufficient balance", variant: "destructive" }); return;
      }
      placeBet.mutate(
        { data: { gameId: game.id, amount, meta: { rows: ROWS } } },
        {
          onSuccess: (data) => {
            setLastBetData(data);
            const meta = data.bet.meta as Record<string, unknown>;
            const bucket = (meta?.bucket as number) ?? 4;
            const id = ++ballId.current;
            const newBall: BallState = {
              id, x: W / 2, y: 30,
              vx: (Math.random() - 0.5) * 2, vy: 0,
              bucket, done: false, animationProgress: 0,
            };
            setBalls(prev => [...prev, newBall]);
            setResults(prev =>
              [{ multiplier: BUCKET_MULTIPLIERS[bucket], win: data.won, payout: data.payout }, ...prev].slice(0, 10)
            );
            qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
            qc.invalidateQueries({ queryKey: getListRecentBetsAllQueryKey() });
            qc.invalidateQueries({ queryKey: getListBetsQueryKey() });
            if (data.won) {
              toast({ title: `${BUCKET_MULTIPLIERS[bucket]}× — +${formatCurrency(data.payout)}!`, className: "bg-green-500 text-white border-green-600" });
            }
          },
          onError: (err) => toast({ title: "Bet Failed", description: err.data?.error, variant: "destructive" }),
        }
      );
    });
  };

  const maxMultiplier = Math.max(...BUCKET_MULTIPLIERS);
  const potentialMax = amount * maxMultiplier;

  return (
    <div className="plinko-root" style={{ display: "flex", flexDirection: "row", gap: 12, width: "100%", padding: "12px", alignItems: "flex-start", boxSizing: "border-box" }}>
      <style>{`
        @media (max-width: 1024px) {
          .plinko-root { flex-direction: column !important; padding: 8px !important; gap: 10px !important; }
          .plinko-board-area { order: 1; width: 100% !important; min-height: auto !important; }
          .plinko-bet-panel { order: 2; width: 100% !important; position: static !important; }
          .plinko-pf-panel { display: none !important; }
        }
        @media (min-width: 1025px) {
          .plinko-board-area { flex: 1; min-width: 0; }
          .plinko-bet-panel { width: 280px; flex-shrink: 0; position: sticky; top: 80px; }
        }
        .plinko-btn { transition: all 0.16s cubic-bezier(0.34,1.56,0.64,1); }
        .plinko-btn:hover:not(:disabled) { filter: brightness(1.12); transform: scale(1.03); }
        .plinko-btn:active:not(:disabled) { transform: scale(0.96); }
        .plinko-mult-btn:hover:not(:disabled) { background: rgba(255,255,255,0.12) !important; color: #fff !important; }
      `}</style>

      {/* Board Area */}
      <div className="plinko-board-area" style={{
        borderRadius: 14, background: "rgba(8,12,26,0.88)",
        border: "1.5px solid rgba(255,255,255,0.07)", backdropFilter: "blur(6px)",
        padding: "16px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12,
      }}>
        <svg ref={boardRef} width={W} height={H} viewBox={`0 0 ${W} ${H}`}
          style={{ overflow: "visible", width: "100%", maxWidth: "340px", height: "auto" }}>
          {/* Background grid */}
          <rect x={0} y={0} width={W} height={H} fill="transparent" />

          {/* Pegs */}
          {pegs.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={pegRadius + 2} fill={`${accent}22`} />
              <circle cx={p.x} cy={p.y} r={pegRadius} fill={accent} opacity="0.9" />
            </g>
          ))}

          {/* Buckets */}
          {BUCKET_MULTIPLIERS.map((m, i) => {
            const bw = W / 9;
            const bx = bw * i;
            const isHighValue = m >= 3;
            return (
              <g key={`bucket-${i}`}>
                <rect x={bx + 2} y={H - 50} width={bw - 4} height={36} rx="5"
                  fill={BUCKET_COLORS[i]} opacity={isHighValue ? "0.9" : "0.7"}
                  style={{ filter: isHighValue ? `drop-shadow(0 0 6px ${BUCKET_COLORS[i]}88)` : "none" }}
                />
                <text x={bx + bw / 2} y={H - 27} textAnchor="middle" fontSize="9" fontWeight="900" fill="#000">
                  {m}×
                </text>
              </g>
            );
          })}

          {/* Balls */}
          {balls.map(ball => (
            <g key={`ball-${ball.id}`}>
              <circle cx={ball.x} cy={ball.y} r={ballRadius + 3}
                fill={ball.done ? `${BUCKET_COLORS[ball.bucket]}44` : `${accent}33`} />
              <circle cx={ball.x} cy={ball.y} r={ballRadius}
                fill={ball.done ? BUCKET_COLORS[ball.bucket] : "white"}
                stroke={ball.done ? "white" : accent} strokeWidth="2"
                style={{ filter: `drop-shadow(0 2px 6px ${ball.done ? BUCKET_COLORS[ball.bucket] : accent}88)` }}
              />
            </g>
          ))}
        </svg>

        {/* Recent results */}
        {results.length > 0 && (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "center", maxWidth: 340 }}>
            {results.map((r, i) => (
              <span key={i} style={{
                fontSize: 10, fontFamily: "monospace", fontWeight: 700,
                padding: "3px 8px", borderRadius: 10,
                background: r.multiplier >= 3 ? `${BUCKET_COLORS[BUCKET_MULTIPLIERS.indexOf(r.multiplier)]}22` : "rgba(255,255,255,0.05)",
                color: r.multiplier >= 3 ? BUCKET_COLORS[BUCKET_MULTIPLIERS.indexOf(r.multiplier)] : "rgba(255,255,255,0.5)",
                border: `1px solid ${r.multiplier >= 3 ? BUCKET_COLORS[BUCKET_MULTIPLIERS.indexOf(r.multiplier)] + "55" : "rgba(255,255,255,0.1)"}`,
              }}>
                {r.multiplier}×
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Bet Panel */}
      <div className="plinko-bet-panel" style={{
        background: "rgba(8,12,26,0.88)", border: "1.5px solid rgba(255,255,255,0.07)",
        borderRadius: 14, padding: "14px", display: "flex", flexDirection: "column", gap: 12,
        backdropFilter: "blur(14px)",
      }}>
        {/* Title */}
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 3, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", textAlign: "center", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 8 }}>
          Plinko
        </div>

        {/* Bet amount */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>Bet Amount</label>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.28)", fontFamily: "monospace", fontSize: 13, fontWeight: 700, pointerEvents: "none" }}>$</span>
            <input type="text" inputMode="decimal" value={amountStr}
              onChange={e => handleAmountChange(e.target.value)}
              onBlur={handleAmountBlur}
              style={{
                width: "100%", paddingLeft: 25, paddingRight: 10, paddingTop: 9, paddingBottom: 9,
                fontSize: 13, fontWeight: 700, fontFamily: "monospace",
                background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.11)",
                borderRadius: 8, color: "#fff", outline: "none", boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {[
              { l: "MIN", fn: () => setAmt(minBet) },
              { l: "½",   fn: () => setAmt(Math.max(minBet, Math.floor((amount / 2) * 100) / 100)) },
              { l: "2×",  fn: () => setAmt(Math.min(amount * 2, maxBet)) },
              { l: "MAX", fn: () => setAmt(Math.min(user?.balance ?? 0, maxBet)) },
            ].map(({ l, fn }) => (
              <button key={l} onClick={fn} className="plinko-mult-btn"
                style={{
                  flex: 1, padding: "8px 6px", borderRadius: 7, fontSize: 9, fontWeight: 700,
                  letterSpacing: 1.2, textTransform: "uppercase",
                  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)",
                  color: "rgba(255,255,255,0.6)", cursor: "pointer", transition: "all 0.14s",
                }}>{l}</button>
            ))}
          </div>
        </div>

        {/* Potential win */}
        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "8px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: 1.5, textTransform: "uppercase" }}>Max Win</span>
          <span style={{ fontSize: 13, fontWeight: 900, color: "#FF2244", fontFamily: "monospace" }}>
            +{formatCurrency(potentialMax)}
          </span>
        </div>

        {/* Balance */}
        {user && (
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontFamily: "monospace", textAlign: "center" }}>
            Balance: <span style={{ color: accent, fontWeight: 900 }}>{formatCurrency(user.balance)}</span>
          </div>
        )}

        {/* Multipliers legend */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>Multipliers</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 5 }}>
            {[10, 3, 2, 1.5, 1].map(m => {
              const idx = BUCKET_MULTIPLIERS.indexOf(m);
              return (
                <div key={m} style={{
                  textAlign: "center", fontSize: 10, fontFamily: "monospace", fontWeight: 900,
                  padding: "6px 4px", borderRadius: 6,
                  background: `${BUCKET_COLORS[idx]}22`, color: BUCKET_COLORS[idx],
                  border: `1px solid ${BUCKET_COLORS[idx]}44`,
                }}>
                  {m}×
                </div>
              );
            })}
          </div>
        </div>

        {/* Drop button */}
        <button className="plinko-btn" onClick={handleBet} disabled={placeBet.isPending}
          style={{
            padding: "14px 20px", borderRadius: 10, fontWeight: 900, fontSize: 13, letterSpacing: 3,
            textTransform: "uppercase",
            background: `linear-gradient(140deg, ${accent}ee, ${accent}aa)`,
            color: "#000", border: "none",
            cursor: placeBet.isPending ? "not-allowed" : "pointer",
            boxShadow: placeBet.isPending ? "none" : `0 4px 20px ${accent}55`,
            opacity: placeBet.isPending ? 0.48 : 1,
            transition: "all 0.16s", fontFamily: "'Outfit', sans-serif", marginTop: "auto",
          }}>
          {placeBet.isPending ? "Dropping…" : "Drop Ball"}
        </button>

        <div className="plinko-pf-panel">
          {lastBetData?.bet && (
            <ProvablyFairPanel
              betId={lastBetData.bet.id}
              serverSeedHash={lastBetData.bet.serverSeedHash}
              clientSeed={lastBetData.bet.clientSeed}
              nonce={lastBetData.bet.nonce}
              variant="full"
              gameName="plinko"
            />
          )}
        </div>
      </div>
    </div>
  );
}
