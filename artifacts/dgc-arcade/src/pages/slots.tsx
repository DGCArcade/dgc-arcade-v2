import { useListGames, getListGamesQueryKey } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";

interface SlotTheme {
  id: number;
  slug: string;
  name: string;
  config: {
    reels?: number;
    rows?: number;
    rtp?: number;
    volatility?: string;
    minBet?: number;
    maxBet?: number;
    paylines?: number;
    tagline?: string;
    coverGradient?: string[];
    accentColor?: string;
    symbols?: Array<{ id: string; emoji: string; color: string; glow: string }>;
    jackpots?: { mini: number; minor: number; major: number; grand: number };
    features?: string[];
  };
  assets: {
    background?: string;
    icon?: string;
    coverEmoji?: string;
    coverArt?: string;
  };
  active: string;
}

// ─── Premium Slot Cover Card with Advanced Hover Animations ────────────────────
function SlotCoverCard({ theme, onClick }: { theme: SlotTheme; onClick: () => void }) {
  const config = theme.config;
  const accentColor = config.accentColor ?? "#f59e0b";
  const gradient = config.coverGradient ?? ["#1a1a1a", "#2d2d2d", "#1a1a1a"];
  const symbols = config.symbols?.slice(0, 4) ?? [];
  const [hovered, setHovered] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setMousePos({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };

  // Premium cover art URL (will be updated with AI-generated images)
  const coverArtUrl = theme.assets.coverArt || theme.assets.background;

  return (
    <div
      ref={containerRef}
      className="relative rounded-2xl overflow-hidden cursor-pointer select-none group"
      style={{
        aspectRatio: "3/4",
        background: `linear-gradient(160deg, ${gradient.join(", ")})`,
        border: `2px solid ${hovered ? accentColor : accentColor + "55"}`,
        boxShadow: hovered
          ? `0 0 45px ${accentColor}77, 0 0 90px ${accentColor}33, 0 8px 40px rgba(0,0,0,0.7)`
          : `0 0 18px ${accentColor}33, 0 0 45px ${accentColor}16, 0 4px 20px rgba(0,0,0,0.5)`,
        transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
        transform: hovered ? "scale(1.04) translateY(-5px)" : "scale(1)",
        animation: "cardBreath 4s ease-in-out infinite",
      }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setMousePos({ x: 50, y: 50 });
      }}
      onMouseMove={handleMouseMove}
    >
      {/* Premium AI Cover Art — Full Bleed with Parallax on Hover */}
      {coverArtUrl && (
        <div
          className="absolute inset-0 w-full h-full overflow-hidden"
          style={{
            perspective: "1000px",
          }}
        >
          <img
            src={coverArtUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            style={{
              opacity: hovered ? 0.7 : 0.45,
              transition: "opacity 0.4s ease",
              filter: "saturate(1.4) brightness(0.95) contrast(1.1)",
              transform: hovered
                ? `scale(1.08) translate(${(mousePos.x - 50) * 2}px, ${(mousePos.y - 50) * 2}px)`
                : "scale(1) translate(0, 0)",
              transformOrigin: "center",
              transitionProperty: "opacity, transform",
              transitionDuration: "0.4s",
              transitionTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}
          />
        </div>
      )}

      {/* Animated Particle Overlay on Hover */}
      {hovered && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                width: Math.random() * 8 + 3,
                height: Math.random() * 8 + 3,
                background: `radial-gradient(circle, ${accentColor}88, ${accentColor}00)`,
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animation: `particleFloat${i} ${2 + Math.random() * 1.5}s ease-out forwards`,
                animationDelay: `${i * 0.08}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* Dark vignette — top is lighter, bottom is heavy for readability */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `linear-gradient(to bottom,
            rgba(0,0,0,0.1) 0%,
            transparent 22%,
            transparent 45%,
            rgba(0,0,0,0.75) 75%,
            rgba(0,0,0,0.97) 100%
          )`,
        }}
      />

      {/* Enhanced Accent color radial at top — always-on glow with hover boost */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at ${mousePos.x}% ${Math.max(mousePos.y - 20, 0)}%, ${accentColor}66 0%, transparent 55%)`,
          opacity: hovered ? 1 : 0.65,
          transition: "opacity 0.4s ease, background 0.2s ease",
          animation: "topGlowPulse 3s ease-in-out infinite",
        }}
      />

      {/* Floating background symbols */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {symbols.map((s, i) => (
          <div
            key={s.id}
            className="absolute select-none"
            style={{
              left: `${10 + i * 23}%`,
              top: `${6 + (i % 3) * 12}%`,
              fontSize: 22,
              opacity: hovered ? 0.28 : 0.18,
              filter: `drop-shadow(0 0 8px ${s.color}) drop-shadow(0 0 16px ${s.color}66)`,
              animation: `symDrift${i} ${3.5 + i * 0.7}s ease-in-out infinite`,
              animationDelay: `${i * 0.5}s`,
              transition: "opacity 0.4s ease",
              transform: hovered ? `scale(1.15) translateY(-${i * 3}px)` : "scale(1) translateY(0)",
              transitionProperty: "opacity, transform",
              transitionDuration: "0.4s",
            }}
          >
            {s.emoji}
          </div>
        ))}
      </div>

      {/* Hero emoji — massive, layered triple-glow, always animated */}
      <div className="absolute left-0 right-0 flex justify-center" style={{ top: "13%" }}>
        <div
          style={{
            fontSize: 90,
            lineHeight: 1,
            filter: hovered
              ? `drop-shadow(0 0 28px ${accentColor}) drop-shadow(0 0 56px ${accentColor}99) drop-shadow(0 0 84px ${accentColor}55)`
              : `drop-shadow(0 0 16px ${accentColor}cc) drop-shadow(0 0 36px ${accentColor}66) drop-shadow(0 0 60px ${accentColor}33)`,
            transition: "filter 0.4s ease, transform 0.4s ease",
            animation: "heroLevitate 3.2s ease-in-out infinite",
            transform: hovered ? "scale(1.2) translateY(-8px)" : "scale(1) translateY(0)",
          }}
        >
          {theme.assets.coverEmoji ?? "🎰"}
        </div>
      </div>

      {/* Symbol strip — always glowing, enhanced on hover */}
      {symbols.length > 0 && (
        <div
          className="absolute left-0 right-0 flex justify-center gap-2 px-3"
          style={{ top: "54%" }}
        >
          {symbols.map((s, idx) => (
            <div
              key={s.id}
              className="flex items-center justify-center rounded-lg"
              style={{
                width: 36,
                height: 36,
                background: `radial-gradient(ellipse at 40% 30%, ${s.color}3a, rgba(0,0,0,0.75))`,
                border: `1.5px solid ${s.color}66`,
                fontSize: 18,
                boxShadow: hovered
                  ? `0 0 16px ${s.glow ?? s.color}88, 0 0 32px ${s.glow ?? s.color}44, 0 0 48px ${s.glow ?? s.color}22`
                  : `0 0 10px ${s.glow ?? s.color}55, 0 0 20px ${s.glow ?? s.color}28`,
                animation: `symGlowBreath 2.5s ease-in-out infinite`,
                animationDelay: `${idx * 0.4}s`,
                transition: "all 0.4s ease",
                transform: hovered ? `scale(1.2) translateY(-6px)` : "scale(1) translateY(0)",
              }}
            >
              {s.emoji}
            </div>
          ))}
        </div>
      )}

      {/* Bottom info section */}
      <div
        className="absolute bottom-0 left-0 right-0 px-3 pt-10 pb-3"
        style={{
          background: `linear-gradient(to top, rgba(0,0,0,0.98) 0%, rgba(0,0,0,0.9) 55%, transparent 100%)`,
        }}
      >
        {/* Game name — always glowing text */}
        <div
          className="font-black uppercase tracking-widest leading-tight mb-0.5"
          style={{
            fontSize: "clamp(11px, 2.5vw, 14px)",
            color: accentColor,
            textShadow: `0 0 14px ${accentColor}, 0 0 28px ${accentColor}77, 0 0 56px ${accentColor}33`,
            transition: "all 0.3s ease",
            transform: hovered ? "scale(1.08) translateY(-2px)" : "scale(1) translateY(0)",
          }}
        >
          {theme.name}
        </div>

        {/* Tagline */}
        {config.tagline && (
          <div className="text-[9px] text-white/45 italic mb-1.5 leading-tight line-clamp-1">
            {config.tagline}
          </div>
        )}

        {/* Badges */}
        <div className="flex items-center gap-1 mb-2 flex-wrap">
          {config.rtp && (
            <span
              className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
              style={{
                background: "rgba(34,197,94,0.14)",
                color: "#4ade80",
                border: "1px solid rgba(34,197,94,0.36)",
                boxShadow: "0 0 6px rgba(34,197,94,0.3)",
              }}
            >
              {config.rtp}% RTP
            </span>
          )}
          {config.volatility && (
            <span
              className="text-[9px] font-black px-1.5 py-0.5 rounded-full capitalize"
              style={{
                background: `${accentColor}18`,
                color: accentColor,
                border: `1px solid ${accentColor}44`,
                boxShadow: `0 0 6px ${accentColor}33`,
              }}
            >
              {config.volatility}
            </span>
          )}
          {config.paylines && (
            <span className="text-[9px] text-white/30 font-mono ml-auto">
              {config.paylines}L
            </span>
          )}
        </div>

        {/* PLAY NOW — always visible, glows brighter on hover */}
        <div
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl font-black uppercase tracking-widest"
          style={{
            fontSize: "clamp(9px, 2vw, 11px)",
            background: hovered
              ? `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`
              : `linear-gradient(135deg, ${accentColor}cc, ${accentColor}99)`,
            color: "#000",
            boxShadow: hovered
              ? `0 0 22px ${accentColor}aa, 0 0 44px ${accentColor}44, 0 4px 12px rgba(0,0,0,0.5)`
              : `0 0 10px ${accentColor}55, 0 0 20px ${accentColor}28`,
            transition: "all 0.3s ease",
            transform: hovered ? "scale(1.06)" : "scale(1)",
          }}
        >
          <span>▶</span>
          <span>Play Now</span>
        </div>
      </div>

      {/* HOT badge */}
      {config.rtp && config.rtp >= 97 && (
        <div
          className="absolute top-3 right-3 text-[9px] font-black px-2 py-1 rounded-full uppercase tracking-wider"
          style={{
            background: "linear-gradient(135deg, #ef4444, #dc2626)",
            color: "#fff",
            boxShadow: "0 0 12px #ef444488, 0 0 24px #ef444433",
            animation: "hotBadgePulse 1.5s ease-in-out infinite",
          }}
        >
          HOT
        </div>
      )}

      <style>{`
        @keyframes cardBreath {
          0%, 100% { box-shadow: 0 0 18px ${accentColor}33, 0 0 45px ${accentColor}16, 0 4px 20px rgba(0,0,0,0.5); }
          50%       { box-shadow: 0 0 28px ${accentColor}44, 0 0 60px ${accentColor}22, 0 4px 20px rgba(0,0,0,0.5); }
        }
        @keyframes topGlowPulse {
          0%, 100% { opacity: 0.55; }
          50%       { opacity: 0.9; }
        }
        @keyframes heroLevitate {
          0%, 100% { transform: translateY(0px) scale(1); }
          50%       { transform: translateY(-10px) scale(1.05); }
        }
        @keyframes symGlowBreath {
          0%, 100% { box-shadow: 0 0 8px ${accentColor}33; }
          50%       { box-shadow: 0 0 16px ${accentColor}66; }
        }
        @keyframes hotBadgePulse {
          0%, 100% { box-shadow: 0 0 10px #ef444488; }
          50%       { box-shadow: 0 0 18px #ef4444cc; }
        }
        ${symbols.map((s, i) => `
          @keyframes symDrift${i} {
            0%, 100% { transform: translateY(0px) rotate(${i * 18}deg); opacity: 0.18; }
            50%       { transform: translateY(-14px) rotate(${i * 18 + 22}deg); opacity: 0.32; }
          }
        `).join("")}
        ${Array.from({ length: 12 }).map((_, i) => `
          @keyframes particleFloat${i} {
            0% {
              opacity: 1;
              transform: translateY(0) translateX(0) scale(1);
            }
            100% {
              opacity: 0;
              transform: translateY(-${40 + Math.random() * 60}px) translateX(${(Math.random() - 0.5) * 60}px) scale(0);
            }
          }
        `).join("")}
      `}</style>
    </div>
  );
}

// ─── Slots Page ───────────────────────────────────────────────────────────────
export default function SlotsPage() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [slotThemes, setSlotThemes] = useState<SlotTheme[]>([]);
  const [themesLoading, setThemesLoading] = useState(true);

  useEffect(() => {
    fetch("/api/games/slot-themes")
      .then(r => r.json())
      .then(data => setSlotThemes(data.themes ?? []))
      .catch(() => {})
      .finally(() => setThemesLoading(false));
  }, []);

  const filtered = slotThemes.filter(
    t => t.name.toLowerCase().includes(search.toLowerCase()) ||
         (t.config.tagline ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-border/50 pb-6">
        <div>
          <h1 className="font-display font-black text-4xl uppercase tracking-widest mb-2">
            🎰 Slots
          </h1>
          <p className="text-muted-foreground">
            {slotThemes.length > 0
              ? `${slotThemes.length} games available — spin the reels and chase the jackpot.`
              : "Spin the reels and chase the jackpot."}
          </p>
        </div>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search slots..."
            className="pl-10 bg-secondary border-border"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Live Jackpot Ticker */}
      <LiveJackpotTicker />

      {/* Game Grid */}
      {themesLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] bg-secondary animate-pulse rounded-2xl border border-border" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-secondary/50 rounded-lg border border-border border-dashed">
          <div className="text-4xl mb-3">🎰</div>
          <p className="text-muted-foreground font-mono">
            {search ? `No slots matching "${search}"` : "No slot games available yet."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map(theme => (
            <SlotCoverCard
              key={theme.id}
              theme={theme}
              onClick={() => setLocation(`/slots/${theme.slug}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Live Jackpot Ticker ──────────────────────────────────────────────────────
function LiveJackpotTicker() {
  const [data, setData] = useState<{ grand: number; major: number; minor: number; mini: number } | null>(null);

  useEffect(() => {
    const load = () => {
      fetch("/api/jackpot")
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setData(d); })
        .catch(() => {});
    };
    load();
    const iv = setInterval(load, 8000);
    return () => clearInterval(iv);
  }, []);

  if (!data) return null;

  const tiers = [
    { key: "grand" as const,  label: "GRAND",  color: "#FF6600", bg: "#FF660022" },
    { key: "major" as const,  label: "MAJOR",  color: "#FFDD44", bg: "#FFDD4422" },
    { key: "minor" as const,  label: "MINOR",  color: "#AAFFAA", bg: "#AAFFAA22" },
    { key: "mini" as const,   label: "MINI",   color: "#88EEFF", bg: "#88EEFF22" },
  ];

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "linear-gradient(135deg, rgba(0,0,0,0.8), rgba(20,20,20,0.9))", border: "1px solid rgba(255,200,0,0.2)" }}
    >
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5">
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        <span className="text-xs font-bold uppercase tracking-widest text-white/60">Live Jackpots</span>
      </div>
      <div className="grid grid-cols-4 divide-x divide-white/5">
        {tiers.map(t => (
          <div key={t.key} className="flex flex-col items-center py-3 px-2" style={{ background: t.bg }}>
            <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: t.color }}>{t.label}</span>
            <span
              className="font-mono font-black text-base tabular-nums mt-0.5"
              style={{ color: t.color, textShadow: `0 0 10px ${t.color}` }}
            >
              ${data[t.key].toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
