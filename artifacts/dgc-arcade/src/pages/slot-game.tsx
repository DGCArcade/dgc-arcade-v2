import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { usePlaceBet, getGetMeQueryKey, getListRecentBetsAllQueryKey, getListBetsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import { ArrowLeft, Maximize2, Minimize2, Volume2, VolumeX, Info } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface SlotSymbol {
  id: string;
  label: string;
  emoji: string;
  color: string;
  glow: string;
  payouts: Record<number, number>;
  isWild?: boolean;
  isScatter?: boolean;
}

interface SlotThemeConfig {
  id: string;
  name: string;
  tagline?: string;
  reels: number;
  rows: number;
  rtp: number;
  volatility?: string;
  minBet: number;
  maxBet: number;
  paylines: number;
  symbols: SlotSymbol[];
  jackpots: { mini: number; minor: number; major: number; grand: number };
  features?: string[];
  coverGradient?: string[];
  accentColor?: string;
}

interface SlotTheme {
  id: number;
  slug: string;
  name: string;
  config: SlotThemeConfig;
  assets: { background?: string; icon?: string; coverEmoji?: string };
  active: string;
}

// ─── Sound Engine (Web Audio API) ─────────────────────────────────────────────
class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  private getCtx(): AudioContext {
    if (!this.ctx) this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    return this.ctx;
  }

  setMuted(m: boolean) { this.muted = m; }

  private tone(freq: number, duration: number, type: OscillatorType = "sine", vol = 0.3, delay = 0) {
    if (this.muted) return;
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
      gain.gain.setValueAtTime(0, ctx.currentTime + delay);
      gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + delay + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + duration + 0.05);
    } catch {}
  }

  spin() {
    // Mechanical reel spin sound — rapid descending tones
    for (let i = 0; i < 8; i++) {
      this.tone(800 - i * 60, 0.08, "sawtooth", 0.15, i * 0.06);
    }
  }

  reelStop(reelIndex: number) {
    // Each reel stops with a satisfying click
    this.tone(200 + reelIndex * 30, 0.12, "square", 0.2, 0);
    this.tone(150 + reelIndex * 20, 0.08, "square", 0.15, 0.05);
  }

  smallWin() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => this.tone(f, 0.2, "sine", 0.35, i * 0.1));
  }

  bigWin() {
    const notes = [523, 659, 784, 1047, 1319, 1568];
    notes.forEach((f, i) => this.tone(f, 0.25, "sine", 0.4, i * 0.08));
    setTimeout(() => {
      const fanfare = [1047, 1319, 1568, 2093];
      fanfare.forEach((f, i) => this.tone(f, 0.3, "triangle", 0.35, i * 0.1));
    }, 600);
  }

  megaWin() {
    // Epic multi-layer fanfare
    const base = [261, 329, 392, 523, 659, 784, 1047, 1319];
    base.forEach((f, i) => {
      this.tone(f, 0.4, "sine", 0.3, i * 0.06);
      this.tone(f * 2, 0.3, "triangle", 0.2, i * 0.06 + 0.03);
    });
  }

  jackpot() {
    // Jackpot celebration — ascending arpeggio then hold
    const notes = [523, 659, 784, 1047, 1319, 1568, 2093, 2637];
    notes.forEach((f, i) => {
      this.tone(f, 0.5, "sine", 0.4, i * 0.07);
      this.tone(f * 1.5, 0.3, "triangle", 0.2, i * 0.07 + 0.04);
    });
    setTimeout(() => {
      for (let i = 0; i < 5; i++) {
        this.tone(2093, 0.2, "sine", 0.35, i * 0.3);
        this.tone(2637, 0.2, "triangle", 0.25, i * 0.3 + 0.15);
      }
    }, 700);
  }

  coinDrop() {
    this.tone(1200, 0.05, "sine", 0.2);
    this.tone(900, 0.05, "sine", 0.15, 0.05);
    this.tone(1100, 0.05, "sine", 0.18, 0.1);
  }

  buttonClick() {
    this.tone(440, 0.05, "square", 0.1);
  }
}

const soundEngine = new SoundEngine();

// ─── Particle System ──────────────────────────────────────────────────────────
interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  emoji?: string;
  life: number;
  maxLife: number;
  rotation: number;
  rotSpeed: number;
}

function ParticleCanvas({ particles }: { particles: Particle[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const particlesRef = useRef(particles);
  particlesRef.current = particles;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particlesRef.current.forEach(p => {
        const alpha = p.life / p.maxLife;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        if (p.emoji) {
          ctx.font = `${p.size}px serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(p.emoji, 0, 0);
        } else {
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });
      animRef.current = requestAnimationFrame(render);
    };
    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={400}
      className="absolute inset-0 w-full h-full pointer-events-none z-30"
      style={{ mixBlendMode: "screen" }}
    />
  );
}

// ─── Win Celebration Overlay ──────────────────────────────────────────────────
type WinTier = "WIN" | "BIG WIN" | "MEGA WIN" | "EPIC WIN" | "JACKPOT";
const WIN_STYLES: Record<WinTier, { colors: [string, string]; scale: number; duration: number }> = {
  "WIN":      { colors: ["#22c55e", "#16a34a"],   scale: 1.0, duration: 1800 },
  "BIG WIN":  { colors: ["#f59e0b", "#d97706"],   scale: 1.2, duration: 2400 },
  "MEGA WIN": { colors: ["#a855f7", "#7c3aed"],   scale: 1.5, duration: 3000 },
  "EPIC WIN": { colors: ["#ef4444", "#dc2626"],   scale: 1.8, duration: 3500 },
  "JACKPOT":  { colors: ["#fbbf24", "#f59e0b"],   scale: 2.2, duration: 5000 },
};

function WinCelebration({ tier, amount, onDone }: { tier: WinTier; amount: number; onDone: () => void }) {
  const style = WIN_STYLES[tier];
  const [particles, setParticles] = useState<Particle[]>([]);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const emojis = tier === "JACKPOT" ? ["🏆", "💎", "🌟", "💰", "🎉"] : ["💰", "⭐", "🪙", "✨"];
    const newParticles: Particle[] = Array.from({ length: tier === "JACKPOT" ? 80 : 40 }, (_, i) => ({
      id: i,
      x: Math.random() * 600,
      y: Math.random() * 400,
      vx: (Math.random() - 0.5) * 4,
      vy: -Math.random() * 6 - 2,
      size: Math.random() * 20 + 10,
      color: style.colors[Math.floor(Math.random() * 2)],
      emoji: emojis[Math.floor(Math.random() * emojis.length)],
      life: 1,
      maxLife: 1,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.2,
    }));
    setParticles(newParticles);

    const interval = setInterval(() => {
      setParticles(prev => prev
        .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.15, life: p.life - 0.015, rotation: p.rotation + p.rotSpeed }))
        .filter(p => p.life > 0)
      );
    }, 16);

    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDone, 400);
    }, style.duration);

    return () => { clearInterval(interval); clearTimeout(timer); };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="absolute inset-0 flex items-center justify-center z-40 pointer-events-none"
      style={{ animation: "fadeIn 0.3s ease" }}
    >
      <ParticleCanvas particles={particles} />
      <div
        className="relative z-50 flex flex-col items-center gap-2 px-8 py-6 rounded-2xl"
        style={{
          background: `radial-gradient(ellipse at center, ${style.colors[0]}33 0%, rgba(0,0,0,0.85) 70%)`,
          border: `2px solid ${style.colors[0]}`,
          boxShadow: `0 0 60px ${style.colors[0]}88, 0 0 120px ${style.colors[0]}44`,
          animation: `winPop ${style.duration}ms ease`,
          transform: `scale(${style.scale})`,
        }}
      >
        <div
          className="font-black text-4xl uppercase tracking-widest"
          style={{ color: style.colors[0], textShadow: `0 0 20px ${style.colors[0]}, 0 0 40px ${style.colors[0]}` }}
        >
          {tier}
        </div>
        <div
          className="font-mono font-black text-3xl"
          style={{ color: "#fff", textShadow: `0 0 15px ${style.colors[0]}` }}
        >
          +{formatCurrency(amount)}
        </div>
      </div>
      <style>{`
        @keyframes winPop {
          0% { transform: scale(0.5) rotate(-5deg); opacity: 0; }
          10% { transform: scale(${style.scale * 1.1}) rotate(2deg); opacity: 1; }
          20% { transform: scale(${style.scale}) rotate(0deg); }
          80% { transform: scale(${style.scale}); opacity: 1; }
          100% { transform: scale(${style.scale * 0.8}); opacity: 0; }
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
}

// ─── Symbol Tile ──────────────────────────────────────────────────────────────
function SymbolTile({
  sym, spinning, landing, winning, size
}: {
  sym: SlotSymbol;
  spinning: boolean;
  landing: boolean;
  winning: boolean;
  size: number;
}) {
  return (
    <div
      className="relative flex items-center justify-center rounded-xl overflow-hidden select-none"
      style={{
        width: size,
        height: size,
        background: sym.isWild
          ? "linear-gradient(135deg, #6366f1, #a855f7, #ec4899)"
          : `radial-gradient(ellipse at 30% 30%, ${sym.color}55, rgba(0,0,0,0.8))`,
        border: `2px solid ${winning ? sym.color : sym.color + "44"}`,
        boxShadow: winning ? `0 0 20px ${sym.glow}, 0 0 40px ${sym.glow}` : `0 0 8px ${sym.glow}44`,
        transition: "box-shadow 0.2s ease, border-color 0.2s ease",
        animation: spinning
          ? "symSpin 0.12s linear infinite"
          : landing
          ? "symLand 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)"
          : winning
          ? "symWin 0.8s ease-in-out infinite"
          : "none",
      }}
    >
      {/* Shine overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 60%)",
          borderRadius: "inherit",
        }}
      />
      {/* Symbol */}
      <span
        className="relative z-10 select-none leading-none"
        style={{
          fontSize: size * 0.45,
          filter: winning ? `drop-shadow(0 0 8px ${sym.color})` : "none",
          fontFamily: "Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif",
        }}
      >
        {sym.emoji}
      </span>
      {/* Label */}
      <span
        className="absolute bottom-1 left-0 right-0 text-center font-bold uppercase tracking-wider"
        style={{
          fontSize: Math.max(7, size * 0.1),
          color: sym.color,
          textShadow: `0 0 6px ${sym.glow}`,
          lineHeight: 1,
        }}
      >
        {sym.isWild ? "WILD" : sym.isScatter ? "BONUS" : sym.label}
      </span>
      <style>{`
        @keyframes symSpin { 0% { transform: scaleY(1); } 50% { transform: scaleY(0.1); } 100% { transform: scaleY(1); } }
        @keyframes symLand { 0% { transform: scaleY(0.1) translateY(-20px); } 60% { transform: scaleY(1.08) translateY(2px); } 80% { transform: scaleY(0.96); } 100% { transform: scaleY(1); } }
        @keyframes symWin  { 0%,100% { transform: scale(1); box-shadow: 0 0 20px var(--glow); } 50% { transform: scale(1.06); } }
      `}</style>
    </div>
  );
}

// ─── Jackpot Banner ───────────────────────────────────────────────────────────
function JackpotBanner({ jackpots, accentColor }: { jackpots: { mini: number; minor: number; major: number; grand: number }; accentColor: string }) {
  const [vals, setVals] = useState(jackpots);
  useEffect(() => {
    const iv = setInterval(() => {
      fetch("/api/jackpot")
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setVals(d); })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(iv);
  }, []);

  const tiers = [
    { key: "mini" as const,  label: "MINI",  color: "#88EEFF" },
    { key: "minor" as const, label: "MINOR", color: "#AAFFAA" },
    { key: "major" as const, label: "MAJOR", color: "#FFDD44" },
    { key: "grand" as const, label: "GRAND", color: "#FF6600" },
  ];

  return (
    <div className="grid grid-cols-4 gap-2 mb-3">
      {tiers.map(t => (
        <div
          key={t.key}
          className="flex flex-col items-center py-2 px-1 rounded-xl"
          style={{
            background: `radial-gradient(ellipse at 50% 0%, ${t.color}22 0%, rgba(0,0,0,0.6) 80%)`,
            border: `1px solid ${t.color}44`,
          }}
        >
          <span className="font-black text-[9px] tracking-[0.2em] uppercase" style={{ color: t.color }}>{t.label}</span>
          <span className="font-mono font-black text-sm tabular-nums" style={{ color: t.color, textShadow: `0 0 10px ${t.color}` }}>
            ${vals[t.key].toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Slot Game ───────────────────────────────────────────────────────────
function SlotGame({ theme, gameId }: { theme: SlotTheme; gameId: number }) {
  const config = theme.config;
  const symbols = config.symbols;
  const REELS = config.reels;
  const ROWS = config.rows;

  // Build weighted pool from symbols (exclude scatter from reels)
  const POOL = symbols.flatMap(s => {
    if (s.isScatter) return [];
    const weight = s.isWild ? 2 : s.payouts[3] ? Math.max(1, Math.floor(20 / (s.payouts[3] || 1))) : 4;
    return Array(weight).fill(s.id);
  });

  const getSymById = (id: string) => symbols.find(s => s.id === id) ?? symbols[0];
  const randomSym = () => POOL[Math.floor(Math.random() * POOL.length)];
  const randomGrid = (): string[][] => Array.from({ length: REELS }, () => Array.from({ length: ROWS }, randomSym));

  function buildWinGrid(): string[][] {
    const winSyms = symbols.filter(s => !s.isScatter && !s.isWild && s.payouts[3]);
    const sym = winSyms[Math.floor(Math.random() * winSyms.length)];
    const count = Math.floor(Math.random() * (REELS - 2)) + 3;
    return Array.from({ length: REELS }, (_, i) => {
      const col = Array.from({ length: ROWS }, randomSym);
      if (i < count) col[Math.floor(ROWS / 2)] = sym.id;
      return col;
    });
  }

  function buildLossGrid(): string[][] {
    for (let t = 0; t < 50; t++) {
      const g = randomGrid();
      const midRow = g.map(c => c[Math.floor(ROWS / 2)]);
      let run = 1;
      for (let c = 1; c < REELS; c++) {
        const a = midRow[c - 1], b = midRow[c];
        const aS = getSymById(a), bS = getSymById(b);
        if (a === b || aS.isWild || bS.isWild) run++;
        else break;
        if (run >= 3) { run = 0; break; }
      }
      if (run < 3) return g;
    }
    return randomGrid();
  }

  function getWinCells(grid: string[][]): Set<string> {
    const cells = new Set<string>();
    for (let row = 0; row < ROWS; row++) {
      const line = grid.map(c => c[row]);
      let base: string | null = getSymById(line[0]).isWild ? null : line[0];
      let run = 1;
      for (let c = 1; c < REELS; c++) {
        const s = getSymById(line[c]);
        if (line[c] === base || s.isWild || (base === null && !s.isWild)) {
          if (base === null) base = line[c];
          run++;
        } else break;
      }
      if (run >= 3) for (let c = 0; c < run; c++) cells.add(`${c}-${row}`);
    }
    return cells;
  }

  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { mutateAsync: placeBet } = usePlaceBet();

  const [grid, setGrid] = useState<string[][]>(randomGrid);
  const [spinning, setSpinning] = useState<boolean[]>(Array(REELS).fill(false));
  const [landing, setLanding] = useState<boolean[]>(Array(REELS).fill(false));
  const [winCells, setWinCells] = useState<Set<string>>(new Set());
  const [isSpinning, setIsSpinning] = useState(false);
  const [bet, setBet] = useState(Math.max(config.minBet, 1));
  const [winAmount, setWinAmount] = useState(0);
  const [winTier, setWinTier] = useState<WinTier | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [muted, setMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [autoSpin, setAutoSpin] = useState(false);
  const [autoCount, setAutoCount] = useState(0);
  const autoRef = useRef(false);
  const spinTickRef = useRef(0);

  const symSize = REELS >= 5 ? (isFullscreen ? 90 : 72) : (isFullscreen ? 110 : 88);

  useEffect(() => { soundEngine.setMuted(muted); }, [muted]);

  const handleSpin = useCallback(async () => {
    if (isSpinning || !user) return;
    if ((user.balance ?? 0) < bet) {
      toast({ title: "Insufficient balance", description: "Add funds to continue playing.", variant: "destructive" });
      return;
    }

    soundEngine.buttonClick();
    setIsSpinning(true);
    setWinAmount(0);
    setWinCells(new Set());
    setWinTier(null);

    // Start all reels spinning
    setSpinning(Array(REELS).fill(true));
    soundEngine.spin();

    try {
      const result = await placeBet({
        data: { gameId, amount: bet, clientSeed: Math.random().toString(36).slice(2), meta: { themeSlug: theme.slug } },
      });

      const won = result.won;
      const payout = result.payout ?? 0;
      const multiplier = result.multiplier ?? 0;
      const resultAny = result as any;

      // Build final grid
      const finalGrid = won ? buildWinGrid() : buildLossGrid();

      // Stop reels one by one with delays
      for (let r = 0; r < REELS; r++) {
        await new Promise<void>(res => setTimeout(res, 280 + r * 180));
        setSpinning(prev => { const n = [...prev]; n[r] = false; return n; });
        setLanding(prev => { const n = [...prev]; n[r] = true; return n; });
        setGrid(prev => { const n = [...prev]; n[r] = finalGrid[r]; return n; });
        soundEngine.reelStop(r);
        setTimeout(() => setLanding(prev => { const n = [...prev]; n[r] = false; return n; }), 350);
      }

      await new Promise<void>(res => setTimeout(res, 400));

      if (won && payout > 0) {
        const cells = getWinCells(finalGrid);
        setWinCells(cells);
        setWinAmount(payout);

        // Determine win tier
        let tier: WinTier = "WIN";
        if (resultAny.jackpotWin) {
          tier = "JACKPOT";
        } else if (multiplier >= 50) {
          tier = "EPIC WIN";
        } else if (multiplier >= 20) {
          tier = "MEGA WIN";
        } else if (multiplier >= 8) {
          tier = "BIG WIN";
        }

        setWinTier(tier);
        setShowCelebration(true);

        if (tier === "JACKPOT") soundEngine.jackpot();
        else if (tier === "EPIC WIN" || tier === "MEGA WIN") soundEngine.megaWin();
        else if (tier === "BIG WIN") soundEngine.bigWin();
        else soundEngine.smallWin();

        if (resultAny.jackpotWin) {
          toast({
            title: `🏆 ${resultAny.jackpotWin.tier.toUpperCase()} JACKPOT!`,
            description: `You won ${formatCurrency(resultAny.jackpotWin.amount)}!`,
          });
        }
      }

      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListRecentBetsAllQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListBetsQueryKey() });

    } catch (err: any) {
      toast({ title: "Spin failed", description: err?.message ?? "Please try again.", variant: "destructive" });
      setSpinning(Array(REELS).fill(false));
    } finally {
      setIsSpinning(false);
    }
  }, [isSpinning, user, bet, gameId, theme.slug, placeBet, queryClient, toast]);

  // Auto-spin
  useEffect(() => {
    autoRef.current = autoSpin;
    if (autoSpin && autoCount > 0 && !isSpinning) {
      const t = setTimeout(() => {
        if (autoRef.current) {
          handleSpin();
          setAutoCount(c => c - 1);
        }
      }, 800);
      return () => clearTimeout(t);
    }
    if (autoCount <= 0) setAutoSpin(false);
    return undefined;
  }, [autoSpin, autoCount, isSpinning, handleSpin]);

  const accentColor = config.accentColor ?? "#f59e0b";

  return (
    <div
      className={`relative flex flex-col gap-3 rounded-2xl overflow-hidden ${isFullscreen ? "fixed inset-0 z-50 rounded-none" : ""}`}
      style={{
        background: config.coverGradient
          ? `linear-gradient(160deg, ${config.coverGradient.join(", ")})`
          : "linear-gradient(160deg, #0a0a0a, #1a1a1a)",
        border: `1.5px solid ${accentColor}44`,
        boxShadow: `0 0 60px ${accentColor}22`,
        padding: isFullscreen ? "16px" : "12px",
        minHeight: isFullscreen ? "100vh" : "auto",
      }}
    >
      {/* ── Top Bar ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <JackpotBanner jackpots={config.jackpots} accentColor={accentColor} />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMuted(m => !m)}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            style={{ color: accentColor }}
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <button
            onClick={() => setShowInfo(s => !s)}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            style={{ color: accentColor }}
          >
            <Info size={16} />
          </button>
          <button
            onClick={() => setIsFullscreen(f => !f)}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            style={{ color: accentColor }}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>

      {/* ── Game Banner ── */}
      <div
        className="relative rounded-xl overflow-hidden py-3 px-4 flex items-center justify-between"
        style={{
          background: `linear-gradient(90deg, ${accentColor}22, transparent, ${accentColor}11)`,
          border: `1px solid ${accentColor}33`,
        }}
      >
        <div>
          <div className="font-black text-xl uppercase tracking-widest" style={{ color: accentColor, textShadow: `0 0 20px ${accentColor}` }}>
            {config.name}
          </div>
          {config.tagline && (
            <div className="text-xs text-white/60 mt-0.5">{config.tagline}</div>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs font-mono text-white/60">
          <span className="text-green-400 font-bold">{config.rtp}% RTP</span>
          <span>{REELS} Reels · {config.paylines} Lines</span>
          {config.volatility && (
            <span className="capitalize" style={{ color: accentColor }}>{config.volatility} Vol</span>
          )}
        </div>
      </div>

      {/* ── Reel Cabinet ── */}
      <div className="relative rounded-xl overflow-hidden" style={{ border: `2px solid ${accentColor}55`, boxShadow: `inset 0 0 40px rgba(0,0,0,0.8), 0 0 30px ${accentColor}22` }}>
        {/* Win celebration overlay */}
        {showCelebration && winTier && (
          <WinCelebration
            tier={winTier}
            amount={winAmount}
            onDone={() => { setShowCelebration(false); setWinTier(null); }}
          />
        )}

        {/* Payline indicator */}
        <div
          className="absolute left-0 right-0 pointer-events-none z-20"
          style={{
            top: `${(Math.floor(ROWS / 2) / ROWS) * 100 + (100 / ROWS / 2)}%`,
            height: "2px",
            background: `linear-gradient(90deg, transparent, ${accentColor}88, ${accentColor}, ${accentColor}88, transparent)`,
            boxShadow: `0 0 8px ${accentColor}`,
          }}
        />

        {/* Grid */}
        <div
          className="grid p-3 gap-2"
          style={{
            gridTemplateColumns: `repeat(${REELS}, 1fr)`,
            background: "rgba(0,0,0,0.7)",
          }}
        >
          {Array.from({ length: REELS }, (_, reel) =>
            Array.from({ length: ROWS }, (_, row) => {
              const symId = grid[reel]?.[row] ?? symbols[0].id;
              const sym = getSymById(symId);
              return (
                <SymbolTile
                  key={`${reel}-${row}-${spinning[reel] ? spinTickRef.current + reel : symId}`}
                  sym={sym}
                  spinning={spinning[reel]}
                  landing={landing[reel]}
                  winning={winCells.has(`${reel}-${row}`)}
                  size={symSize}
                />
              );
            })
          )}
        </div>

        {/* Corner decorations */}
        {["tl", "tr", "bl", "br"].map(pos => (
          <div
            key={pos}
            className="absolute w-6 h-6 pointer-events-none"
            style={{
              top: pos.includes("t") ? 0 : "auto",
              bottom: pos.includes("b") ? 0 : "auto",
              left: pos.includes("l") ? 0 : "auto",
              right: pos.includes("r") ? 0 : "auto",
              borderTop: pos.includes("t") ? `3px solid ${accentColor}` : "none",
              borderBottom: pos.includes("b") ? `3px solid ${accentColor}` : "none",
              borderLeft: pos.includes("l") ? `3px solid ${accentColor}` : "none",
              borderRight: pos.includes("r") ? `3px solid ${accentColor}` : "none",
            }}
          />
        ))}
      </div>

      {/* ── Status Bar ── */}
      <div
        className="flex items-center justify-center py-2 rounded-xl font-mono font-bold"
        style={{ background: "rgba(0,0,0,0.5)", border: `1px solid ${accentColor}22` }}
      >
        {winAmount > 0 ? (
          <span className="text-lg" style={{ color: accentColor, textShadow: `0 0 15px ${accentColor}` }}>
            WIN +{formatCurrency(winAmount)}
          </span>
        ) : isSpinning ? (
          <span className="text-sm text-white/60 flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: "300ms" }} />
          </span>
        ) : (
          <span className="text-sm text-white/40">Press SPIN to play</span>
        )}
      </div>

      {/* ── Controls ── */}
      <div className="flex items-center gap-3">
        {/* Balance */}
        <div className="flex flex-col items-center rounded-xl px-3 py-2 flex-1" style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Balance</span>
          <span className="font-mono font-bold text-sm text-white">{formatCurrency(user?.balance ?? 0)}</span>
        </div>

        {/* Bet control */}
        <div className="flex items-center gap-1 rounded-xl px-2 py-2 flex-1" style={{ background: "rgba(0,0,0,0.5)", border: `1px solid ${accentColor}33` }}>
          <button
            className="w-8 h-8 rounded-lg font-bold text-lg flex items-center justify-center hover:bg-white/10 transition-colors disabled:opacity-40"
            style={{ color: accentColor }}
            onClick={() => { setBet(b => Math.max(config.minBet, +(b - 1).toFixed(2))); soundEngine.buttonClick(); }}
            disabled={isSpinning}
          >−</button>
          <div className="flex flex-col items-center flex-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Bet</span>
            <span className="font-mono font-bold text-sm" style={{ color: accentColor }}>{formatCurrency(bet)}</span>
          </div>
          <button
            className="w-8 h-8 rounded-lg font-bold text-lg flex items-center justify-center hover:bg-white/10 transition-colors disabled:opacity-40"
            style={{ color: accentColor }}
            onClick={() => { setBet(b => Math.min(config.maxBet, +(b + 1).toFixed(2))); soundEngine.buttonClick(); }}
            disabled={isSpinning}
          >+</button>
        </div>

        {/* Spin button */}
        <button
          className="flex-1 py-3 rounded-xl font-black text-lg uppercase tracking-widest transition-all disabled:opacity-60"
          style={{
            background: isSpinning
              ? `rgba(0,0,0,0.5)`
              : `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`,
            color: isSpinning ? accentColor : "#000",
            border: `2px solid ${accentColor}`,
            boxShadow: isSpinning ? "none" : `0 0 20px ${accentColor}88`,
            transform: isSpinning ? "scale(0.97)" : "scale(1)",
          }}
          onClick={handleSpin}
          disabled={isSpinning}
        >
          {isSpinning ? "..." : "SPIN"}
        </button>
      </div>

      {/* ── Bet Presets ── */}
      <div className="flex gap-2 flex-wrap">
        {([config.minBet, 1, 5, 10, 25, 50] as number[])
          .filter(v => v >= config.minBet && v <= config.maxBet)
          .map(v => (
            <button
              key={v}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-40"
              style={{
                background: bet === v ? accentColor : "rgba(255,255,255,0.08)",
                color: bet === v ? "#000" : accentColor,
                border: `1px solid ${accentColor}44`,
              }}
              onClick={() => { setBet(v); soundEngine.buttonClick(); }}
              disabled={isSpinning}
            >
              ${v}
            </button>
          ))}
        <button
          className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-40 ml-auto"
          style={{ background: "rgba(255,255,255,0.08)", color: accentColor, border: `1px solid ${accentColor}44` }}
          onClick={() => { if (user) setBet(Math.min(user.balance, config.maxBet)); soundEngine.buttonClick(); }}
          disabled={isSpinning}
        >
          MAX
        </button>
      </div>

      {/* ── Auto Spin ── */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-white/40 font-bold uppercase tracking-wider">Auto:</span>
        {[10, 25, 50, 100].map(n => (
          <button
            key={n}
            className="px-2 py-1 rounded text-xs font-bold transition-all"
            style={{
              background: autoSpin && autoCount === n ? accentColor : "rgba(255,255,255,0.06)",
              color: autoSpin && autoCount === n ? "#000" : "rgba(255,255,255,0.5)",
              border: `1px solid ${accentColor}22`,
            }}
            onClick={() => {
              if (autoSpin && autoCount === n) { setAutoSpin(false); setAutoCount(0); }
              else { setAutoCount(n); setAutoSpin(true); }
              soundEngine.buttonClick();
            }}
            disabled={isSpinning && !(autoSpin && autoCount === n)}
          >
            {autoSpin && autoCount > 0 && autoCount === n ? `${autoCount}` : n}x
          </button>
        ))}
        {autoSpin && (
          <button
            className="px-2 py-1 rounded text-xs font-bold text-red-400 border border-red-400/30 ml-auto"
            onClick={() => { setAutoSpin(false); setAutoCount(0); }}
          >
            Stop
          </button>
        )}
      </div>

      {/* ── Paytable Info ── */}
      {showInfo && (
        <div
          className="rounded-xl p-4 space-y-3"
          style={{ background: "rgba(0,0,0,0.8)", border: `1px solid ${accentColor}33` }}
        >
          <div className="font-bold uppercase tracking-wider text-sm" style={{ color: accentColor }}>Paytable</div>
          <div className="grid grid-cols-2 gap-2">
            {symbols.filter(s => !s.isScatter && Object.keys(s.payouts).length > 0).map(s => (
              <div key={s.id} className="flex items-center gap-2 text-xs">
                <span style={{ fontSize: 18 }}>{s.emoji}</span>
                <span className="text-white/60">{s.label}</span>
                <span className="ml-auto font-mono" style={{ color: s.color }}>
                  {Object.entries(s.payouts).map(([k, v]) => `${k}×${v}x`).join(" ")}
                </span>
              </div>
            ))}
          </div>
          <div className="text-xs text-white/40">
            RTP: {config.rtp}% · {REELS} Reels · {ROWS} Rows · {config.paylines} Paylines
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Loading Screen ───────────────────────────────────────────────────────────
function SlotLoadingScreen({ theme, onDone }: { theme: SlotTheme; onDone: () => void }) {
  const [progress, setProgress] = useState(0);
  const config = theme.config;
  const accentColor = config.accentColor ?? "#f59e0b";

  useEffect(() => {
    const DURATION = 2200;
    const start = Date.now();
    const tick = () => {
      const p = Math.min(((Date.now() - start) / DURATION) * 100, 100);
      setProgress(p);
      if (p < 100) requestAnimationFrame(tick);
      else setTimeout(onDone, 200);
    };
    requestAnimationFrame(tick);
  }, [onDone]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{
        background: config.coverGradient
          ? `linear-gradient(160deg, ${config.coverGradient.join(", ")})`
          : "linear-gradient(160deg, #0a0a0a, #1a1a1a)",
      }}
    >
      {/* Floating coins */}
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="absolute text-2xl"
          style={{
            left: `${8 * i + (i % 3) * 3}%`,
            top: "-20px",
            animation: `coinFloat ${2 + (i % 3) * 0.5}s linear infinite`,
            animationDelay: `${i * 0.2}s`,
          }}
        >
          {config.symbols[i % config.symbols.length]?.emoji ?? "🪙"}
        </div>
      ))}

      {/* Center content */}
      <div className="flex flex-col items-center gap-6 z-10">
        <div
          className="text-8xl"
          style={{ animation: "loadPulse 1.5s ease-in-out infinite", filter: `drop-shadow(0 0 20px ${accentColor})` }}
        >
          {theme.assets.coverEmoji ?? "🎰"}
        </div>
        <div className="text-center">
          <div className="font-black text-3xl uppercase tracking-widest" style={{ color: accentColor, textShadow: `0 0 20px ${accentColor}` }}>
            {config.name}
          </div>
          {config.tagline && (
            <div className="text-sm text-white/60 mt-1">{config.tagline}</div>
          )}
        </div>
        <div className="flex gap-4 text-xs font-mono text-white/50">
          <span className="text-green-400 font-bold">{config.rtp}% RTP</span>
          <span>{config.reels} Reels · {config.paylines} Lines</span>
        </div>
        <div className="w-64">
          <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${progress}%`,
                background: `linear-gradient(90deg, ${accentColor}, ${accentColor}cc)`,
                boxShadow: `0 0 10px ${accentColor}`,
              }}
            />
          </div>
          <div className="text-center text-xs font-mono mt-1" style={{ color: accentColor }}>{Math.round(progress)}%</div>
        </div>
      </div>

      <style>{`
        @keyframes coinFloat { 0% { transform: translateY(-20px) rotate(0deg); opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { transform: translateY(110vh) rotate(720deg); opacity: 0; } }
        @keyframes loadPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }
      `}</style>
    </div>
  );
}

// ─── Slot Game Page ───────────────────────────────────────────────────────────
export default function SlotGamePage() {
  const params = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const [theme, setTheme] = useState<SlotTheme | null>(null);
  const [gameId, setGameId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.slug) return;
    // Load theme + find the game entry by slug
    Promise.all([
      fetch(`/api/games/slot-themes/${params.slug}`).then(r => r.json()),
      fetch(`/api/games/by-slug/${params.slug}`).then(r => r.ok ? r.json() : null),
    ])
      .then(([themeData, gameData]) => {
        if (!themeData.theme) { setError("Slot game not found."); return; }
        setTheme(themeData.theme);
        if (!gameData || !gameData.id) { setError("Slots game not configured in games table yet. Please run the seed script."); return; }
        setGameId(gameData.id);
      })
      .catch(() => setError("Failed to load game."))
      .finally(() => setLoading(false));
  }, [params.slug]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (error || !theme || !gameId) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <div className="text-4xl">🎰</div>
        <p className="text-muted-foreground">{error ?? "Game not available."}</p>
        <button
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-bold"
          onClick={() => setLocation("/slots")}
        >
          Back to Slots
        </button>
      </div>
    );
  }

  if (!loaded) {
    return <SlotLoadingScreen theme={theme} onDone={() => setLoaded(true)} />;
  }

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <button
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setLocation("/slots")}
      >
        <ArrowLeft size={16} />
        Back to Slots
      </button>
      <SlotGame theme={theme} gameId={gameId} />
    </div>
  );
}
