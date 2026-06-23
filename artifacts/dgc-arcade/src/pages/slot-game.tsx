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

// ─── Sound Engine — Theme-Aware Audio System ───────────────────────────────────
class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private themeSlug = "default";
  private ambientOsc: OscillatorNode | null = null;
  private ambientGain: GainNode | null = null;

  private getCtx(): AudioContext {
    if (!this.ctx) this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    return this.ctx;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ambientGain && this.ctx) {
      this.ambientGain.gain.setTargetAtTime(m ? 0 : 0.028, this.ctx.currentTime, 0.3);
    }
  }

  setTheme(slug: string) { this.themeSlug = slug; }

  // Per-theme oscillator profiles
  private get profile(): { spinType: OscillatorType; spinBase: number; spinVol: number; stopType: OscillatorType; stopBase: number; winScale: number[] } {
    const P: Record<string, { spinType: OscillatorType; spinBase: number; spinVol: number; stopType: OscillatorType; stopBase: number; winScale: number[] }> = {
      "neon-cyber":      { spinType: "square",   spinBase: 1300, spinVol: 0.09, stopType: "square",   stopBase: 750,  winScale: [880, 1109, 1319, 1760] },
      "dragons-fortune": { spinType: "sawtooth",  spinBase: 290,  spinVol: 0.17, stopType: "triangle", stopBase: 185,  winScale: [392, 494, 587, 784, 1047] },
      "pharaohs-riches": { spinType: "triangle",  spinBase: 560,  spinVol: 0.17, stopType: "triangle", stopBase: 350,  winScale: [440, 554, 659, 880, 1109] },
      "street-gold":     { spinType: "sawtooth",  spinBase: 880,  spinVol: 0.15, stopType: "square",   stopBase: 550,  winScale: [523, 698, 880, 1047] },
      "ocean-depths":    { spinType: "sine",      spinBase: 360,  spinVol: 0.20, stopType: "sine",     stopBase: 230,  winScale: [349, 440, 523, 698, 880] },
      "wolf-pack":       { spinType: "sawtooth",  spinBase: 230,  spinVol: 0.19, stopType: "triangle", stopBase: 145,  winScale: [330, 415, 494, 659, 880] },
      "cosmic-cash":     { spinType: "sine",      spinBase: 880,  spinVol: 0.13, stopType: "sine",     stopBase: 590,  winScale: [523, 659, 784, 1047, 1319] },
      "fire-and-ice":    { spinType: "sawtooth",  spinBase: 710,  spinVol: 0.17, stopType: "square",   stopBase: 460,  winScale: [415, 523, 659, 831, 1047] },
      "diamond-vault":   { spinType: "triangle",  spinBase: 1080, spinVol: 0.13, stopType: "triangle", stopBase: 690,  winScale: [659, 831, 988, 1319] },
      "lucky-sevens":    { spinType: "sawtooth",  spinBase: 590,  spinVol: 0.19, stopType: "square",   stopBase: 390,  winScale: [523, 659, 784, 1047, 1319, 1568] },
    };
    return P[this.themeSlug] ?? { spinType: "sawtooth", spinBase: 650, spinVol: 0.14, stopType: "square", stopBase: 390, winScale: [523, 659, 784, 1047] };
  }

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
    const p = this.profile;
    for (let i = 0; i < 10; i++) {
      this.tone(p.spinBase - i * 35, 0.07, p.spinType, p.spinVol, i * 0.048);
    }
  }

  reelStop(reelIndex: number) {
    const p = this.profile;
    const f = p.stopBase + reelIndex * 22;
    this.tone(f,         0.14, p.stopType, 0.22, 0);
    this.tone(f * 0.75,  0.09, p.stopType, 0.16, 0.06);
    this.tone(80,        0.03, "square",   0.14, 0.01);
  }

  smallWin() {
    const notes = this.profile.winScale;
    notes.forEach((f, i) => this.tone(f, 0.22, "sine", 0.34, i * 0.1));
  }

  bigWin() {
    const notes = this.profile.winScale;
    notes.forEach((f, i) => this.tone(f, 0.28, "sine", 0.40, i * 0.085));
    setTimeout(() => {
      [notes[notes.length - 1], notes[notes.length - 1] * 1.25, notes[notes.length - 1] * 1.5].forEach(
        (f, i) => this.tone(f, 0.32, "triangle", 0.36, i * 0.11)
      );
    }, 650);
  }

  megaWin() {
    const base = [261, 329, 392, 523, 659, 784, 1047, 1319];
    base.forEach((f, i) => {
      this.tone(f,     0.42, "sine",     0.30, i * 0.058);
      this.tone(f * 2, 0.30, "triangle", 0.20, i * 0.058 + 0.03);
    });
  }

  jackpot() {
    const notes = [523, 659, 784, 1047, 1319, 1568, 2093, 2637];
    notes.forEach((f, i) => {
      this.tone(f,       0.52, "sine",     0.40, i * 0.068);
      this.tone(f * 1.5, 0.32, "triangle", 0.22, i * 0.068 + 0.04);
    });
    setTimeout(() => {
      for (let i = 0; i < 6; i++) {
        this.tone(2093, 0.22, "sine",     0.34, i * 0.28);
        this.tone(2637, 0.22, "triangle", 0.24, i * 0.28 + 0.14);
      }
    }, 700);
  }

  coinDrop() {
    this.tone(1200, 0.05, "sine", 0.2);
    this.tone(900,  0.05, "sine", 0.15, 0.05);
    this.tone(1100, 0.05, "sine", 0.18, 0.10);
  }

  buttonClick() {
    const p = this.profile;
    this.tone(p.stopBase * 1.4, 0.04, p.spinType, 0.07);
  }

  // Ambient atmospheric drone per theme
  startAmbient() {
    if (this.muted) return;
    try {
      const ctx = this.getCtx();
      if (this.ambientOsc) { try { this.ambientOsc.stop(); } catch {} }
      const freqs: Record<string, number> = {
        "neon-cyber": 58, "dragons-fortune": 48, "pharaohs-riches": 98,
        "ocean-depths": 44, "wolf-pack": 42, "cosmic-cash": 74,
        "fire-and-ice": 62, "diamond-vault": 86, "lucky-sevens": 70,
        "street-gold": 66,
      };
      const freq = freqs[this.themeSlug] ?? 58;
      this.ambientOsc = ctx.createOscillator();
      this.ambientGain = ctx.createGain();
      this.ambientOsc.connect(this.ambientGain);
      this.ambientGain.connect(ctx.destination);
      this.ambientOsc.type = "sine";
      this.ambientOsc.frequency.value = freq;
      this.ambientGain.gain.setValueAtTime(0, ctx.currentTime);
      this.ambientGain.gain.linearRampToValueAtTime(0.028, ctx.currentTime + 2.5);
      this.ambientOsc.start();
    } catch {}
  }

  stopAmbient() {
    try {
      if (this.ambientGain && this.ctx) {
        this.ambientGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.6);
        setTimeout(() => { try { this.ambientOsc?.stop(); } catch {} this.ambientOsc = null; }, 3000);
      }
    } catch {}
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

// ─── Symbol Tile — Always Glowing ─────────────────────────────────────────────
function SymbolTile({
  sym, spinning, landing, landingDelay, winning, size
}: {
  sym: SlotSymbol;
  spinning: boolean;
  landing: boolean;
  landingDelay: number;
  winning: boolean;
  size: number;
}) {
  const glow = sym.glow ?? sym.color;
  return (
    <div
      className="relative flex items-center justify-center rounded-xl overflow-hidden select-none"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        background: sym.isWild
          ? "linear-gradient(135deg, #4f46e5, #7c3aed, #a855f7, #ec4899)"
          : `radial-gradient(ellipse at 35% 30%, ${sym.color}38, rgba(0,0,0,0.88))`,
        border: `2px solid ${winning ? sym.color : sym.color + "38"}`,
        // Always glowing — idle breath, intensifies on win
        boxShadow: winning
          ? `0 0 24px ${glow}, 0 0 48px ${glow}88, inset 0 0 14px ${sym.color}22`
          : `0 0 7px ${glow}30, inset 0 0 5px rgba(0,0,0,0.5)`,
        animation: landing
          ? `cascadeLand 0.55s cubic-bezier(0.34,1.56,0.64,1) both`
          : winning
          ? "symWinPulse 0.9s ease-in-out infinite"
          : "symIdleBreath 4s ease-in-out infinite",
        animationDelay: `${landingDelay}ms`,
        transition: spinning ? "none" : "box-shadow 0.35s ease, border-color 0.35s ease",
        opacity: spinning ? 0.88 : 1,
      }}
    >
      {/* Top-left shine */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.18) 0%, transparent 55%)",
          borderRadius: "inherit",
        }}
      />
      {/* Win shimmer sweep */}
      {winning && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl">
          <div
            className="absolute inset-y-0"
            style={{
              width: 48,
              background: `linear-gradient(90deg, transparent, ${sym.color}55, transparent)`,
              animation: "shimmerSweep 1.6s linear infinite",
            }}
          />
        </div>
      )}
      {/* Win radial pulse */}
      {winning && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at center, ${sym.color}2e, transparent 68%)`,
            animation: "winRadialPulse 0.9s ease-in-out infinite alternate",
          }}
        />
      )}
      {/* Symbol emoji — always has drop-shadow glow */}
      <span
        className="relative z-10 select-none leading-none"
        style={{
          fontSize: size * 0.54,
          filter: winning
            ? `drop-shadow(0 0 10px ${sym.color}) drop-shadow(0 0 22px ${sym.color}aa)`
            : `drop-shadow(0 0 5px ${sym.color}77)`,
          fontFamily: "Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif",
          animation: winning ? "emojiWinBounce 0.9s ease-in-out infinite" : "none",
          transition: "filter 0.3s ease",
        }}
      >
        {sym.emoji}
      </span>
      {/* Label */}
      <span
        className="absolute bottom-0.5 left-0 right-0 text-center font-black uppercase tracking-wider"
        style={{
          fontSize: Math.max(7, size * 0.115),
          color: sym.color,
          textShadow: `0 0 8px ${glow}`,
          lineHeight: 1,
        }}
      >
        {sym.isWild ? "WILD" : sym.isScatter ? "BONUS" : sym.label}
      </span>
      <style>{`
        @keyframes cascadeLand {
          from { transform: translateY(-110px) scaleY(0.65); opacity: 0; }
          to   { transform: translateY(0) scaleY(1); opacity: 1; }
        }
        @keyframes symWinPulse {
          0%,100% { transform: scale(1);    box-shadow: 0 0 20px ${glow}, 0 0 40px ${glow}88; }
          50%     { transform: scale(1.07); box-shadow: 0 0 34px ${glow}, 0 0 68px ${glow}aa; }
        }
        @keyframes symIdleBreath {
          0%,100% { box-shadow: 0 0 5px ${glow}20; }
          50%     { box-shadow: 0 0 13px ${glow}44; }
        }
        @keyframes emojiWinBounce {
          0%,100% { transform: scale(1); }
          50%     { transform: scale(1.14); }
        }
        @keyframes shimmerSweep {
          from { left: -48px; }
          to   { left: calc(100% + 48px); }
        }
        @keyframes winRadialPulse {
          from { opacity: 0.35; transform: scale(0.88); }
          to   { opacity: 1;    transform: scale(1.12); }
        }
      `}</style>
    </div>
  );
}

// ─── Reel Column — Cascade-Landing Physics ────────────────────────────────────
function ReelColumn({
  allSymbols, finalSymIds, spinning, landing, winCells, reelIndex, cellSize,
}: {
  allSymbols: SlotSymbol[];
  finalSymIds: string[];
  spinning: boolean;
  landing: boolean;
  winCells: Set<string>;
  reelIndex: number;
  cellSize: number;
}) {
  const rows = finalSymIds.length;
  const pool = allSymbols.filter(s => !s.isScatter);
  const [displayIds, setDisplayIds] = useState<string[]>(finalSymIds);
  const [isLanding, setIsLanding] = useState(false);
  const finalRef = useRef(finalSymIds);
  finalRef.current = finalSymIds;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (spinning) {
      setIsLanding(false);
      intervalRef.current = setInterval(() => {
        setDisplayIds(Array.from({ length: rows }, () =>
          pool[Math.floor(Math.random() * pool.length)].id
        ));
      }, 62);
      return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }
    if (landing) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      setDisplayIds([...finalRef.current]);
      setIsLanding(true);
      const t = setTimeout(() => setIsLanding(false), 750);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [spinning, landing]);

  const getSymById = (id: string) => allSymbols.find(s => s.id === id) ?? allSymbols[0];

  return (
    <div
      className="flex flex-col rounded-xl overflow-hidden relative"
      style={{
        gap: 6,
        padding: 4,
        background: "rgba(0,0,0,0.22)",
        flex: 1,
        filter: spinning ? "blur(1.2px) brightness(0.72)" : "none",
        transition: spinning ? "none" : "filter 0.18s ease",
      }}
    >
      {/* Speed lines */}
      {spinning && (
        <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden rounded-xl">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-full"
              style={{
                height: 1,
                background: "rgba(255,255,255,0.08)",
                top: `${8 + i * 18}%`,
                animation: "spinLine 0.09s linear infinite",
                animationDelay: `${i * 0.018}s`,
              }}
            />
          ))}
          <style>{`
            @keyframes spinLine { 0% { opacity:0; transform:scaleX(0); } 50% { opacity:1; } 100% { opacity:0; transform:scaleX(1); } }
          `}</style>
        </div>
      )}

      {displayIds.map((symId, row) => (
        <SymbolTile
          key={row}
          sym={getSymById(symId)}
          spinning={spinning}
          landing={isLanding}
          landingDelay={row * 58}
          winning={winCells.has(`${reelIndex}-${row}`)}
          size={cellSize}
        />
      ))}
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
    <div className="grid grid-cols-4 gap-1 md:gap-2 mb-2 md:mb-3">
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

  const isMobileView = typeof window !== "undefined" && window.innerWidth < 768;
  const symSize = isFullscreen
    ? (REELS >= 5 ? 90 : 110)
    : isMobileView
      ? (REELS >= 5 ? Math.floor((window.innerWidth - 40) / REELS) : Math.floor((window.innerWidth - 40) / REELS))
      : (REELS >= 5 ? 72 : 88);

  useEffect(() => { soundEngine.setMuted(muted); }, [muted]);

  // Wire theme-specific audio profile + ambient atmosphere
  useEffect(() => {
    soundEngine.setTheme(theme.slug);
    soundEngine.startAmbient();
    return () => soundEngine.stopAmbient();
  }, [theme.slug]);

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
        minHeight: isFullscreen ? "100dvh" : "auto",
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
        className="relative rounded-xl overflow-hidden py-3 px-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-0"
        style={{
          background: `linear-gradient(90deg, ${accentColor}22, transparent, ${accentColor}11)`,
          border: `1px solid ${accentColor}33`,
        }}
      >
        <div>
          <div className="font-black text-lg sm:text-xl uppercase tracking-widest" style={{ color: accentColor, textShadow: `0 0 20px ${accentColor}` }}>
            {config.name}
          </div>
          {config.tagline && (
            <div className="text-xs text-white/60 mt-0.5">{config.tagline}</div>
          )}
        </div>
        <div className="flex items-center gap-2 sm:gap-3 text-xs font-mono text-white/60 flex-wrap">
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

        {/* Reel Grid — ReelColumn per reel */}
        <div
          className="flex p-3 gap-2"
          style={{ background: "rgba(0,0,0,0.7)", minHeight: symSize * ROWS + 32 }}
        >
          {Array.from({ length: REELS }, (_, reel) => (
            <ReelColumn
              key={reel}
              allSymbols={symbols}
              finalSymIds={grid[reel] ?? Array(ROWS).fill(symbols[0].id)}
              spinning={spinning[reel]}
              landing={landing[reel]}
              winCells={winCells}
              reelIndex={reel}
              cellSize={symSize}
            />
          ))}
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
    <div className="space-y-3 md:space-y-4 w-full md:max-w-2xl md:mx-auto">
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
