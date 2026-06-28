import { useState, useRef, useCallback, useEffect } from "react";
import { Game } from "@workspace/api-client-react";
import { usePlaceBet, getGetMeQueryKey, getListRecentBetsAllQueryKey, getListBetsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";

interface PlinkoProps { game: Game }

const ROWS = 8;
const BUCKET_MULTIPLIERS = [10, 3, 2, 1.5, 1, 1.5, 2, 3, 10];
const BUCKET_COLORS = ["#FF2244", "#FF6622", "#FFB800", "#FFE566", "#FFFFFF", "#FFE566", "#FFB800", "#FF6622", "#FF2244"];

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
  const boardRef = useRef<SVGSVGElement>(null);
  const animationRef = useRef<number | null>(null);

  const [amount, setAmount] = useState<number>(game.minBet);
  const [balls, setBalls] = useState<BallState[]>([]);
  const [results, setResults] = useState<{ multiplier: number; win: boolean; payout: number }[]>([]);
  const [showPF, setShowPF] = useState(false);
  const [lastBetData, setLastBetData] = useState<any>(null);
  const ballId = useRef(0);
  const ballsRef = useRef<BallState[]>([]);

  const W = 340;
  const H = 320;
  const pegRadius = 4;
  const ballRadius = 6;
  const pegSpacing = W / (ROWS + 1);
  const rowHeight = (H - 100) / ROWS;

  // Get peg positions
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

  // Get bucket X position
  const getBucketX = (b: number) => {
    const bucketW = W / 9;
    return bucketW * b + bucketW / 2;
  };

  // Physics-based ball animation loop
  useEffect(() => {
    const animate = () => {
      setBalls(prev => {
        const updated = prev.map(ball => {
          let newBall = { ...ball };

          // If already in bucket, just wait
          if (newBall.done) {
            newBall.animationProgress += 0.05;
            if (newBall.animationProgress >= 1) {
              return null as any;
            }
            return newBall;
          }

          // Apply gravity
          newBall.vy += 0.6; // gravity

          // Update position
          newBall.x += newBall.vx;
          newBall.y += newBall.vy;

          // Collision detection with pegs
          for (const peg of pegs) {
            const dx = newBall.x - peg.x;
            const dy = newBall.y - peg.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const minDist = pegRadius + ballRadius;

            if (dist < minDist) {
              // Bounce off peg
              const angle = Math.atan2(dy, dx);
              newBall.x = peg.x + Math.cos(angle) * minDist;
              newBall.y = peg.y + Math.sin(angle) * minDist;

              // Reflect velocity
              const speed = Math.sqrt(newBall.vx ** 2 + newBall.vy ** 2);
              const dot = newBall.vx * Math.cos(angle) + newBall.vy * Math.sin(angle);
              newBall.vx = (Math.cos(angle) * dot - Math.sin(angle) * Math.sqrt(speed ** 2 - dot ** 2)) * 0.85;
              newBall.vy = (Math.sin(angle) * dot + Math.cos(angle) * Math.sqrt(speed ** 2 - dot ** 2)) * 0.85;
            }
          }

          // Boundary collisions
          if (newBall.x - ballRadius < 0) {
            newBall.x = ballRadius;
            newBall.vx *= -0.8;
          }
          if (newBall.x + ballRadius > W) {
            newBall.x = W - ballRadius;
            newBall.vx *= -0.8;
          }

          // Check if ball reached bottom (in bucket)
          if (newBall.y > H - 40) {
            // Determine which bucket based on X position
            const bucketIdx = Math.floor((newBall.x / W) * 9);
            newBall.bucket = Math.max(0, Math.min(8, bucketIdx));
            newBall.done = true;
            newBall.y = H - 30;
            newBall.vx = 0;
            newBall.vy = 0;
            newBall.animationProgress = 0;
          }

          return newBall;
        }).filter(b => b !== null);

        ballsRef.current = updated;
        return updated;
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [pegs]);

  const handleBet = () => {
    requireAuth(() => {
      if (!user || amount > user.balance) {
        toast({ title: "Insufficient balance", variant: "destructive" });
        return;
      }
      placeBet.mutate(
        { data: { gameId: game.id, amount, meta: { rows: ROWS } } },
        {
          onSuccess: (data) => {
            setLastBetData(data);

            // Determine bucket from the provably fair outcome
            const meta = data.bet.meta as Record<string, unknown>;
            const bucket = (meta?.bucket as number) ?? 4;

            const id = ++ballId.current;

            // Start ball at top center with initial velocity variations
            const newBall: BallState = {
              id,
              x: W / 2,
              y: 30,
              vx: (Math.random() - 0.5) * 2, // slight random horizontal variation
              vy: 0,
              bucket,
              done: false,
              animationProgress: 0,
            };

            setBalls(prev => [...prev, newBall]);
            setResults(prev =>
              [{ multiplier: BUCKET_MULTIPLIERS[bucket], win: data.won, payout: data.payout }, ...prev].slice(0, 8)
            );

            qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
            qc.invalidateQueries({ queryKey: getListRecentBetsAllQueryKey() });
            qc.invalidateQueries({ queryKey: getListBetsQueryKey() });

            if (data.won) {
              toast({
                title: `${BUCKET_MULTIPLIERS[bucket]}x — +${formatCurrency(data.payout)}!`,
                className: "bg-green-500 text-white border-green-600",
              });
            }
          },
          onError: (err) =>
            toast({ title: "Bet Failed", description: err.data?.error, variant: "destructive" }),
        }
      );
    });
  };

  return (
    <div className="plinko-root" style={{ display: "flex", flexDirection: "row", gap: 12, width: "100%", padding: "12px", alignItems: "flex-start", boxSizing: "border-box" }}>
      <style>{`
        @media (max-width: 1024px) {
          .plinko-root { flex-direction: column-reverse !important; padding: 8px !important; gap: 10px !important; }
          .plinko-board-area { order: 2; width: 100% !important; min-height: auto !important; }
          .plinko-bet-panel { order: 1; width: 100% !important; position: static !important; }
        }
        @media (min-width: 1025px) {
          .plinko-board-area { flex: 1; min-width: 0; }
          .plinko-bet-panel { width: 280px; flex-shrink: 0; position: sticky; top: 80px; }
        }
        .plinko-btn:hover:not(:disabled) { filter: brightness(1.12); transform: scale(1.02); }
        .plinko-btn:active:not(:disabled) { transform: scale(0.97); }
      `}</style>

      {/* ── BOARD AREA ── */}
      <div
        className="plinko-board-area"
        style={{
          borderRadius: 14,
          background: "rgba(8,12,26,0.88)",
          border: "1.5px solid rgba(255,255,255,0.07)",
          backdropFilter: "blur(6px)",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
        }}
      >
        <svg
          ref={boardRef}
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          style={{ overflow: "visible", width: "100%", maxWidth: "340px", height: "auto" }}
        >
          {/* Pegs */}
          {pegs.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={pegRadius} fill="#FF8C00" opacity="0.85" />
          ))}

          {/* Buckets */}
          {BUCKET_MULTIPLIERS.map((m, i) => {
            const bw = W / 9;
            const bx = bw * i;
            return (
              <g key={`bucket-${i}`}>
                <rect x={bx + 2} y={H - 50} width={bw - 4} height={36} rx="4" fill={BUCKET_COLORS[i]} opacity="0.85" />
                <text x={bx + bw / 2} y={H - 27} textAnchor="middle" fontSize="9" fontWeight="900" fill="#000">
                  {m}x
                </text>
              </g>
            );
          })}

          {/* Balls with smooth physics animation */}
          {balls.map(ball => (
            <circle
              key={`ball-${ball.id}`}
              cx={ball.x}
              cy={ball.y}
              r={ballRadius}
              fill={ball.done ? BUCKET_COLORS[ball.bucket] : "white"}
              stroke={ball.done ? "white" : "#FFD700"}
              strokeWidth="2"
              style={{
                filter: "drop-shadow(0 2px 6px rgba(255,215,0,0.4))",
              }}
            />
          ))}
        </svg>

        {/* Recent results */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "center" }}>
          {results.map((r, i) => (
            <span
              key={i}
              style={{
                fontSize: "11px",
                fontFamily: "monospace",
                fontWeight: "bold",
                padding: "4px 8px",
                borderRadius: "12px",
                background: r.win ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.05)",
                color: r.win ? "#22c55e" : "rgba(255,255,255,0.5)",
                border: r.win ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(255,255,255,0.1)",
              }}
            >
              {r.multiplier}x
            </span>
          ))}
        </div>
      </div>

      {/* ── BET PANEL ── */}
      <div
        className="plinko-bet-panel"
        style={{
          background: "rgba(8,12,26,0.88)",
          border: "1.5px solid rgba(255,255,255,0.07)",
          borderRadius: 14,
          padding: "14px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          backdropFilter: "blur(14px)",
        }}
      >
        {/* Title */}
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 3,
            color: "rgba(255,255,255,0.35)",
            textTransform: "uppercase",
            textAlign: "center",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            paddingBottom: 8,
          }}
        >
          Drop the Ball
        </div>

        {/* Bet amount */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>
            Bet Amount
          </label>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.28)", fontFamily: "monospace", fontSize: 13, fontWeight: 700, pointerEvents: "none" }}>
              $
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={e => setAmount(parseFloat(e.target.value) || 0)}
              onBlur={() => {
                const clamped = Math.max(game.minBet, Math.min(amount, game.maxBet));
                setAmount(clamped);
              }}
              style={{
                width: "100%",
                paddingLeft: 25,
                paddingRight: 10,
                paddingTop: 9,
                paddingBottom: 9,
                fontSize: 13,
                fontWeight: 700,
                fontFamily: "monospace",
                background: "rgba(255,255,255,0.05)",
                border: "1.5px solid rgba(255,255,255,0.11)",
                borderRadius: 8,
                color: "#fff",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {[
              { l: "MIN", fn: () => setAmount(game.minBet) },
              { l: "½", fn: () => setAmount(Math.max(game.minBet, Math.floor((amount / 2) * 100) / 100)) },
              { l: "2×", fn: () => setAmount(Math.min(amount * 2, game.maxBet)) },
              { l: "MAX", fn: () => setAmount(Math.min(user?.balance ?? 0, game.maxBet)) },
            ].map(({ l, fn }) => (
              <button
                key={l}
                onClick={fn}
                style={{
                  flex: 1,
                  padding: "8px 6px",
                  borderRadius: 7,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.09)",
                  color: "rgba(255,255,255,0.6)",
                  cursor: "pointer",
                  transition: "all 0.14s",
                }}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Multipliers legend */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>
            Multipliers
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {[10, 3, 2, 1.5, 1].map(m => {
              const idx = BUCKET_MULTIPLIERS.indexOf(m);
              return (
                <div
                  key={m}
                  style={{
                    textAlign: "center",
                    fontSize: 9,
                    fontFamily: "monospace",
                    fontWeight: "bold",
                    padding: "6px 4px",
                    borderRadius: 6,
                    background: BUCKET_COLORS[idx] + "33",
                    color: BUCKET_COLORS[idx],
                  }}
                >
                  {m}x
                </div>
              );
            })}
          </div>
        </div>

        {/* Drop button */}
        <button
          className="plinko-btn"
          onClick={handleBet}
          disabled={placeBet.isPending}
          style={{
            padding: "14px 20px",
            borderRadius: 10,
            fontWeight: 900,
            fontSize: 13,
            letterSpacing: 3,
            textTransform: "uppercase",
            background: "#FF8C00",
            color: "#000",
            border: "none",
            cursor: placeBet.isPending ? "not-allowed" : "pointer",
            boxShadow: placeBet.isPending ? "none" : "0 4px 20px rgba(255,140,0,0.4)",
            opacity: placeBet.isPending ? 0.48 : 1,
            transition: "all 0.16s",
            fontFamily: "'Outfit', sans-serif",
            marginTop: "auto",
          }}
        >
          {placeBet.isPending ? "Dropping…" : "Drop Ball"}
        </button>

        {/* Provably Fair section */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 10 }}>
          <button
            onClick={() => setShowPF(v => !v)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="13" height="14" viewBox="0 0 13 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6.5 1L1 3.5V7C1 9.76 3.48 12.35 6.5 13C9.52 12.35 12 9.76 12 7V3.5L6.5 1Z" stroke="#FF8C00" strokeWidth="1.4" fill="none" />
                <path d="M4 7l1.8 1.8L9 5" stroke="#FF8C00" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 2.5, color: "#FF8C00", textTransform: "uppercase" }}>
                Provably Fair
              </span>
            </div>
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", transform: showPF ? "rotate(180deg)" : "none", transition: "transform 0.2s", display: "inline-block" }}>
              ▼
            </span>
          </button>

          {showPF && lastBetData && (
            <div
              style={{
                marginTop: 8,
                padding: 10,
                background: "rgba(0,0,0,0.55)",
                border: "1px solid rgba(255,255,255,0.09)",
                borderRadius: 8,
                fontSize: 8,
                color: "rgba(255,255,255,0.55)",
                fontFamily: "monospace",
                wordBreak: "break-all",
              }}
            >
              <div style={{ marginBottom: 6 }}>
                <span style={{ color: "rgba(255,255,255,0.35)", display: "block", marginBottom: 2, letterSpacing: 1.5, textTransform: "uppercase" }}>
                  Server Seed Hash (SHA-256)
                </span>
                <span style={{ color: "rgba(255,255,255,0.80)", fontSize: 7.5 }}>
                  {lastBetData.bet.serverSeedHash}
                </span>
              </div>
              {lastBetData.bet.clientSeed && (
                <div style={{ marginBottom: 6 }}>
                  <span style={{ color: "rgba(255,255,255,0.35)", display: "block", marginBottom: 2, letterSpacing: 1.5, textTransform: "uppercase" }}>
                    Client Seed
                  </span>
                  <span style={{ color: "rgba(255,255,255,0.80)" }}>{lastBetData.bet.clientSeed}</span>
                </div>
              )}
              {lastBetData.bet.nonce !== null && (
                <div style={{ marginBottom: 6 }}>
                  <span style={{ color: "rgba(255,255,255,0.35)", display: "block", marginBottom: 2, letterSpacing: 1.5, textTransform: "uppercase" }}>
                    Nonce
                  </span>
                  <span style={{ color: "rgba(255,255,255,0.80)" }}>{lastBetData.bet.nonce}</span>
                </div>
              )}
              {lastBetData.bet.id && (
                <a
                  href={`/api/bets/verify/${lastBetData.bet.id}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "block",
                    marginTop: 8,
                    padding: "5px 8px",
                    background: "#FF8C0018",
                    border: "1px solid #FF8C0044",
                    borderRadius: 5,
                    color: "#FF8C00",
                    textAlign: "center",
                    fontSize: 8,
                    fontWeight: 900,
                    letterSpacing: 1.5,
                    textTransform: "uppercase",
                    textDecoration: "none",
                  }}
                >
                  Verify Outcome →
                </a>
              )}
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.07)", fontSize: 7, color: "rgba(255,255,255,0.30)", lineHeight: 1.6 }}>
                The ball's path is determined by the SHA-256 hash of the server seed + your client seed. Each bounce is mathematically proven fair.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
