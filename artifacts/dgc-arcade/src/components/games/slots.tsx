import { useState, useEffect, useRef, useCallback } from "react";
import { Game } from "@workspace/api-client-react/src/generated/api.schemas";
import {
  usePlaceBet,
  getGetMeQueryKey,
  getListRecentBetsAllQueryKey,
  getListBetsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import { Maximize2, Minimize2 } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
   SYMBOL SYSTEM
═══════════════════════════════════════════════════════════════ */

type SymId = "dgc" | "diamond" | "crown" | "seven" | "star" | "bell" | "cherry" | "wild";

interface SymDef {
  label: string;
  emoji: string;
  bg: string;
  border: string;
  glow: string;
  payouts: Record<number, number>;
  isWild?: boolean;
}

const SYMS: Record<SymId, SymDef> = {
  dgc:     { label: "DGC",      emoji: "🏆", bg: "linear-gradient(160deg,#f59e0b,#d97706,#78350f)", border: "#fbbf24", glow: "rgba(251,191,36,0.95)",  payouts: { 3: 20, 4: 80,  5: 500 } },
  diamond: { label: "DIAMOND",  emoji: "💎", bg: "linear-gradient(160deg,#06b6d4,#0284c7,#0c4a6e)", border: "#67e8f9", glow: "rgba(103,232,249,0.9)",  payouts: { 3: 10, 4: 40,  5: 200 } },
  crown:   { label: "CROWN",    emoji: "👑", bg: "linear-gradient(160deg,#a855f7,#7c3aed,#3b0764)", border: "#c084fc", glow: "rgba(192,132,252,0.9)",  payouts: { 3: 6,  4: 25,  5: 100 } },
  seven:   { label: "LUCKY 7",  emoji: "7",  bg: "linear-gradient(160deg,#ef4444,#dc2626,#7f1d1d)", border: "#fca5a5", glow: "rgba(252,165,165,0.9)",  payouts: { 3: 4,  4: 15,  5: 75  } },
  star:    { label: "STAR",     emoji: "⭐", bg: "linear-gradient(160deg,#eab308,#ca8a04,#713f12)", border: "#fde047", glow: "rgba(253,224,71,0.85)",  payouts: { 3: 3,  4: 10,  5: 40  } },
  bell:    { label: "BELL",     emoji: "🔔", bg: "linear-gradient(160deg,#f97316,#ea580c,#7c2d12)", border: "#fdba74", glow: "rgba(253,186,116,0.85)", payouts: { 3: 2,  4: 7,   5: 25  } },
  cherry:  { label: "CHERRY",   emoji: "🍒", bg: "linear-gradient(160deg,#e11d48,#be123c,#4c0519)", border: "#fda4af", glow: "rgba(253,164,175,0.85)", payouts: { 3: 1.5,4: 5,   5: 15  } },
  wild:    { label: "WILD",     emoji: "★",  bg: "linear-gradient(135deg,#6366f1,#a855f7,#ec4899)", border: "#a5b4fc", glow: "rgba(165,180,252,0.95)", payouts: {}, isWild: true },
};

const POOL: SymId[] = [
  "cherry","cherry","cherry","cherry",
  "bell","bell","bell","bell",
  "star","star","star",
  "seven","seven","seven",
  "crown","crown",
  "diamond","diamond",
  "wild","wild",
  "dgc",
];

function rs(): SymId { return POOL[Math.floor(Math.random() * POOL.length)]; }
function rg(): SymId[][] { return Array.from({ length: 5 }, () => [rs(), rs(), rs()]); }

function buildWin(): SymId[][] {
  const candidates: SymId[] = ["dgc", "diamond", "crown", "seven", "star"];
  const sym = candidates[Math.floor(Math.random() * candidates.length)];
  const count = Math.floor(Math.random() * 3) + 3;
  return Array.from({ length: 5 }, (_, i) => [rs(), i < count ? sym : rs(), rs()]);
}

function buildLoss(): SymId[][] {
  for (let t = 0; t < 50; t++) {
    const g = rg();
    let ok = true;
    for (let row = 0; row < 3 && ok; row++) {
      const r = g.map(c => c[row]);
      let run = 1;
      for (let c = 1; c < 5; c++) {
        if (r[c] === r[c - 1] || r[c] === "wild" || r[c - 1] === "wild") run++;
        else break;
        if (run >= 3) { ok = false; break; }
      }
    }
    if (ok) return g;
  }
  const cycle: SymId[] = ["cherry", "bell", "star", "seven", "crown"];
  return Array.from({ length: 5 }, (_, i) => [cycle[i % 5], cycle[(i + 2) % 5], cycle[(i + 3) % 5]]);
}

function getWinCells(grid: SymId[][]): Set<string> {
  const cells = new Set<string>();
  for (let row = 0; row < 3; row++) {
    const r = grid.map(c => c[row]);
    let base: SymId | null = r[0] === "wild" ? null : r[0];
    let run = 1;
    for (let c = 1; c < 5; c++) {
      const s = r[c];
      if (s === base || s === "wild" || (base === null && s !== "wild")) {
        if (base === null) base = s;
        run++;
      } else break;
    }
    if (run >= 3) for (let c = 0; c < run; c++) cells.add(`${c}-${row}`);
  }
  return cells;
}

const JACKPOTS = [
  { label: "MINI",  value: 10,   color: "#3b82f6" },
  { label: "MINOR", value: 50,   color: "#22c55e" },
  { label: "MAJOR", value: 250,  color: "#a855f7" },
  { label: "GRAND", value: 1000, color: "#f59e0b" },
];

/* ═══════════════════════════════════════════════════════════════
   LOADING SCREEN
═══════════════════════════════════════════════════════════════ */

function LoadingScreen({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const DURATION = 2600;
    const start = Date.now();
    const tick = () => {
      const p = Math.min(((Date.now() - start) / DURATION) * 100, 100);
      setProgress(p);
      if (p < 100) requestAnimationFrame(tick);
      else setTimeout(onDone, 250);
    };
    requestAnimationFrame(tick);
  }, [onDone]);

  return (
    <div className="slot-loader">
      {Array.from({ length: 14 }).map((_, i) => (
        <div key={i} className="slot-loader-coin" style={{
          left: `${7 * i + (i % 3) * 2}%`,
          animationDelay: `${i * 0.18}s`,
          animationDuration: `${2.2 + (i % 3) * 0.6}s`,
        }} />
      ))}
      <div className="slot-loader-center">
        <div className="slot-loader-logo-wrap">
          <svg viewBox="0 0 140 140" width="130" height="130">
            <defs>
              <linearGradient id="sl-g" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%">
                  <animate attributeName="stop-color" values="#f59e0b;#a855f7;#06b6d4;#ef4444;#f59e0b" dur="2.8s" repeatCount="indefinite" />
                </stop>
                <stop offset="100%">
                  <animate attributeName="stop-color" values="#d97706;#7c3aed;#0284c7;#b91c1c;#d97706" dur="2.8s" repeatCount="indefinite" />
                </stop>
              </linearGradient>
              <filter id="sl-gf">
                <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            <text x="70" y="108" textAnchor="middle" fontFamily="Outfit,sans-serif" fontWeight="900" fontSize="110" fill="url(#sl-g)" filter="url(#sl-gf)">D</text>
          </svg>
        </div>
        <div className="slot-loader-brand">DGC ARCADE</div>
        <div className="slot-loader-game">GOLD RUSH SLOTS</div>
        <div className="slot-loader-progress-track">
          <div className="slot-loader-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="slot-loader-pct">{Math.round(progress)}%</div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SYMBOL TILE
═══════════════════════════════════════════════════════════════ */

function SymTile({ id, spinning, landing, winning, size }: {
  id: SymId; spinning?: boolean; landing?: boolean; winning?: boolean; size: number;
}) {
  const def = SYMS[id];
  return (
    <div
      className={["slot-sym", spinning ? "slot-sym-spin" : "slot-sym-new", landing ? "slot-sym-land" : "", winning ? "slot-sym-win" : ""].join(" ")}
      style={{ width: size, height: size, background: def.bg, borderColor: def.border, "--sym-glow": def.glow } as React.CSSProperties}
    >
      <div className="slot-sym-shine" />
      {id === "seven" ? (
        <span className="slot-sym-seven" style={{ fontSize: size * 0.46 }}>{def.emoji}</span>
      ) : id === "wild" ? (
        <span className="slot-sym-wild" style={{ fontSize: size * 0.22 }}>WILD</span>
      ) : (
        <span className="slot-sym-emoji" style={{ fontSize: size * 0.44 }}>{def.emoji}</span>
      )}
      <span className="slot-sym-label" style={{ fontSize: Math.max(7, size * 0.1) }}>{def.label}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   WIN CELEBRATION OVERLAY
═══════════════════════════════════════════════════════════════ */

type WinTier = "WIN" | "BIG WIN" | "MEGA WIN" | "EPIC WIN" | "JACKPOT";

const WIN_COLORS: Record<WinTier, [string, string]> = {
  "WIN":      ["#22c55e", "#16a34a"],
  "BIG WIN":  ["#f59e0b", "#d97706"],
  "MEGA WIN": ["#a855f7", "#7c3aed"],
  "EPIC WIN": ["#ef4444", "#dc2626"],
  "JACKPOT":  ["#fbbf24", "#f59e0b"],
};

function WinCelebration({ tier, amount, onDone }: { tier: WinTier; amount: number; onDone: () => void }) {
  const [c1, c2] = WIN_COLORS[tier];
  useEffect(() => {
    const t = setTimeout(onDone, tier === "JACKPOT" ? 4500 : 3200);
    return () => clearTimeout(t);
  }, []);
  const coinCount = tier === "JACKPOT" ? 30 : tier === "EPIC WIN" ? 24 : tier === "MEGA WIN" ? 18 : 12;
  return (
    <div className="slot-win-overlay" onClick={onDone}>
      {Array.from({ length: coinCount }).map((_, i) => (
        <div key={i} className="slot-win-coin" style={{
          left: `${Math.random() * 100}%`,
          animationDelay: `${Math.random() * 0.6}s`,
          animationDuration: `${1.2 + Math.random() * 1.8}s`,
        }} />
      ))}
      <div className="slot-win-content">
        <div className="slot-win-type" style={{ color: c1, textShadow: `0 0 40px ${c1},0 0 80px ${c1}` }}>
          {tier}!
        </div>
        <div className="slot-win-amount" style={{ color: c2 }}>
          +{formatCurrency(amount)}
        </div>
        <div className="slot-win-tap">Tap to continue</div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN SLOT GAME
═══════════════════════════════════════════════════════════════ */

export function Slots({ game }: { game: Game }) {
  const { user, requireAuth } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const placeBet = usePlaceBet();

  const [loaded, setLoaded] = useState(false);
  const [grid, setGrid] = useState<SymId[][]>(rg);
  const [spinning, setSpinning] = useState<boolean[]>([false, false, false, false, false]);
  const [landing, setLanding] = useState<boolean[]>([false, false, false, false, false]);
  const [winCells, setWinCells] = useState<Set<string>>(new Set());
  const [winAmount, setWinAmount] = useState<number | null>(null);
  const [celebration, setCelebration] = useState<WinTier | null>(null);
  const [bet, setBet] = useState(Math.max(game.minBet, 1));
  const [isSpinning, setIsSpinning] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [symSize, setSymSize] = useState(84);

  const gameRef = useRef<HTMLDivElement>(null);
  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);
  const spinTickRef = useRef(0);

  const clearIntervals = useCallback(() => {
    intervalsRef.current.forEach(clearInterval);
    intervalsRef.current = [];
  }, []);

  useEffect(() => {
    const calc = () => {
      const w = gameRef.current?.clientWidth ?? Math.min(window.innerWidth, 620);
      setSymSize(Math.min(88, Math.max(52, Math.floor((w - 88) / 6))));
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, [loaded]);

  const toggleFullscreen = useCallback(() => {
    if (!isFullscreen) { gameRef.current?.requestFullscreen?.().catch(() => {}); setIsFullscreen(true); }
    else { document.exitFullscreen?.().catch(() => {}); setIsFullscreen(false); }
  }, [isFullscreen]);

  useEffect(() => {
    const h = () => { if (!document.fullscreenElement) setIsFullscreen(false); };
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  const handleSpin = useCallback(() => {
    requireAuth(() => {
      if (isSpinning) return;
      if (bet < game.minBet || bet > game.maxBet) {
        toast({ title: "Invalid Bet", description: `Bet between ${formatCurrency(game.minBet)} – ${formatCurrency(game.maxBet)}`, variant: "destructive" });
        return;
      }
      if (user && bet > user.balance) {
        toast({ title: "Insufficient Funds", description: "Not enough balance.", variant: "destructive" });
        return;
      }

      setIsSpinning(true);
      setWinCells(new Set());
      setWinAmount(null);
      setCelebration(null);
      setSpinning([true, true, true, true, true]);

      intervalsRef.current = Array.from({ length: 5 }, (_, reel) =>
        setInterval(() => {
          spinTickRef.current++;
          setGrid(prev => {
            const n = prev.map(c => [...c]) as SymId[][];
            n[reel] = [rs(), rs(), rs()];
            return n;
          });
        }, 58 + reel * 6)
      );

      placeBet.mutate({ data: { gameId: game.id, amount: bet } }, {
        onSuccess: data => {
          clearIntervals();
          const finalGrid = data.won ? buildWin() : buildLoss();

          Array.from({ length: 5 }, (_, reel) => {
            const delay = 700 + reel * 380;
            setTimeout(() => {
              setSpinning(prev => { const n = [...prev]; n[reel] = false; return n; });
              setLanding(prev => { const n = [...prev]; n[reel] = true; return n; });
              setGrid(prev => {
                const n = prev.map(c => [...c]) as SymId[][];
                n[reel] = finalGrid[reel] as [SymId, SymId, SymId];
                return n;
              });
              setTimeout(() => setLanding(prev => { const n = [...prev]; n[reel] = false; return n; }), 450);
            }, delay);
          });

          const allDone = 700 + 4 * 380 + 600;
          setTimeout(() => {
            setIsSpinning(false);
            if (data.won && data.payout > 0) {
              const cells = getWinCells(finalGrid);
              setWinCells(cells);
              setWinAmount(data.payout);
              const mult = data.payout / bet;
              const tier: WinTier = mult >= 100 ? "JACKPOT" : mult >= 50 ? "EPIC WIN" : mult >= 20 ? "MEGA WIN" : mult >= 5 ? "BIG WIN" : "WIN";
              setTimeout(() => setCelebration(tier), 400);
            }
            queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
            queryClient.invalidateQueries({ queryKey: getListRecentBetsAllQueryKey() });
            queryClient.invalidateQueries({ queryKey: getListBetsQueryKey() });
          }, allDone);
        },
        onError: err => {
          clearIntervals();
          setSpinning([false, false, false, false, false]);
          setIsSpinning(false);
          toast({ title: "Spin Failed", description: (err as any)?.data?.error ?? "Error occurred", variant: "destructive" });
        },
      });
    });
  }, [isSpinning, bet, game, user, requireAuth, toast, placeBet, queryClient, clearIntervals]);

  useEffect(() => () => clearIntervals(), [clearIntervals]);

  if (!loaded) return <LoadingScreen onDone={() => setLoaded(true)} />;

  return (
    <div ref={gameRef} className={`slot-game${isFullscreen ? " slot-game-fullscreen" : ""}`}>
      {celebration && (
        <WinCelebration tier={celebration} amount={winAmount ?? 0} onDone={() => setCelebration(null)} />
      )}

      {/* ── Jackpot Strip + Fullscreen ─────────────────── */}
      <div className="slot-top-bar">
        <div className="slot-jackpots">
          {JACKPOTS.map(j => (
            <div key={j.label} className="slot-jackpot" style={{ "--jk-color": j.color } as React.CSSProperties}>
              <span className="slot-jackpot-label">{j.label}</span>
              <span className="slot-jackpot-value">${j.value.toLocaleString()}</span>
            </div>
          ))}
        </div>
        <button onClick={toggleFullscreen} className="slot-fs-btn" title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>

      {/* ── Game Banner ────────────────────────────────── */}
      <div className="slot-banner">
        <div className="slot-banner-particles">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="slot-banner-coin" style={{
              left: `${10 + i * 11}%`,
              animationDelay: `${i * 0.3}s`,
              animationDuration: `${2 + i * 0.22}s`,
            }} />
          ))}
        </div>
        <div className="slot-banner-title">
          <span className="slot-banner-dgc">DGC</span>
          <span className="slot-banner-name"> GOLD RUSH</span>
        </div>
        <div className="slot-banner-sub">96.5% RTP · 5 REELS · 20 PAYLINES</div>
      </div>

      {/* ── Reel Cabinet ───────────────────────────────── */}
      <div className="slot-frame-wrap">
        <div className="slot-frame">
          <div className="slot-payline-line" />
          <div className="slot-grid">
            {grid.map((col, reel) => (
              <div key={reel} className="slot-reel-col">
                {col.map((id, row) => (
                  <SymTile
                    key={`${reel}-${row}-${spinning[reel] ? spinTickRef.current + reel : id}`}
                    id={id}
                    spinning={spinning[reel]}
                    landing={landing[reel]}
                    winning={winCells.has(`${reel}-${row}`)}
                    size={symSize}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="slot-frame-corner slot-frame-corner-tl" />
          <div className="slot-frame-corner slot-frame-corner-tr" />
          <div className="slot-frame-corner slot-frame-corner-bl" />
          <div className="slot-frame-corner slot-frame-corner-br" />
        </div>
      </div>

      {/* ── Status ─────────────────────────────────────── */}
      <div className="slot-status-bar">
        {winAmount ? (
          <div className="slot-win-display">
            <span className="slot-win-label">WIN</span>
            <span className="slot-win-value">+{formatCurrency(winAmount)}</span>
          </div>
        ) : isSpinning ? (
          <div className="slot-spin-hint">🍀 Good luck!</div>
        ) : (
          <div className="slot-spin-hint">Press SPIN to play</div>
        )}
      </div>

      {/* ── Bottom Controls ─────────────────────────────── */}
      <div className="slot-controls">
        <div className="slot-balance">
          <span className="slot-balance-label">BALANCE</span>
          <span className="slot-balance-value">{formatCurrency(user?.balance ?? 0)}</span>
        </div>
        <div className="slot-bet">
          <button className="slot-bet-btn" onClick={() => setBet(b => Math.max(game.minBet, +(b - 1).toFixed(2)))} disabled={isSpinning}>−</button>
          <div className="slot-bet-display">
            <span className="slot-bet-label">BET</span>
            <span className="slot-bet-value">{formatCurrency(bet)}</span>
          </div>
          <button className="slot-bet-btn" onClick={() => setBet(b => Math.min(game.maxBet, +(b + 1).toFixed(2)))} disabled={isSpinning}>+</button>
        </div>
        <button
          className={`slot-spin-btn${isSpinning ? " slot-spin-btn-active" : ""}`}
          onClick={handleSpin}
          disabled={isSpinning}
        >
          {isSpinning ? (
            <span className="slot-spin-inner">
              <span className="slot-spin-dot" />
              <span className="slot-spin-dot" style={{ animationDelay: "0.15s" }} />
              <span className="slot-spin-dot" style={{ animationDelay: "0.3s" }} />
            </span>
          ) : "SPIN"}
        </button>
      </div>

      {/* ── Bet Presets ─────────────────────────────────── */}
      <div className="slot-presets">
        {([game.minBet, 1, 5, 10, 25] as number[])
          .filter(v => v >= game.minBet && v <= game.maxBet)
          .map(v => (
            <button key={v} className={`slot-preset${bet === v ? " slot-preset-active" : ""}`} onClick={() => setBet(v)} disabled={isSpinning}>
              ${v}
            </button>
          ))}
        <button className="slot-preset" onClick={() => user && setBet(Math.min(user.balance, game.maxBet))} disabled={isSpinning}>MAX</button>
      </div>
    </div>
  );
}
