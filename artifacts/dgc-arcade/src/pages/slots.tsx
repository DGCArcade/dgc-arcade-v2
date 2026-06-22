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

// ─── Premium Slot Cover Card with 3D Tilt & Light-Sweep ────────────────────────
function SlotCoverCard({ theme, onClick }: { theme: SlotTheme; onClick: () => void }) {
  const config = theme.config;
  const accentColor = config.accentColor ?? "#f59e0b";
  const gradient = config.coverGradient ?? ["#1a1a1a", "#2d2d2d", "#1a1a1a"];
  const [hovered, setHovered] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    
    setMousePos({ x, y });
    
    // 3D tilt effect: max ±15 degrees
    const tiltX = (y - 0.5) * 30; // vertical mouse movement = x-axis tilt
    const tiltY = (x - 0.5) * -30; // horizontal mouse movement = y-axis tilt
    setTilt({ x: tiltX, y: tiltY });
  };

  const handleMouseLeave = () => {
    setHovered(false);
    setMousePos({ x: 0.5, y: 0.5 });
    setTilt({ x: 0, y: 0 });
  };

  // Premium cover art URL
  const coverArtUrl = theme.assets.coverArt || theme.assets.background;

  return (
    <div
      ref={containerRef}
      className="relative rounded-2xl overflow-hidden cursor-pointer select-none group"
      style={{
        aspectRatio: "3/4",
        perspective: "1200px",
        transformStyle: "preserve-3d" as any,
      }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
    >
      {/* Outer card container with 3D transform */}
      <div
        style={{
          width: "100%",
          height: "100%",
          transformStyle: "preserve-3d" as any,
          transform: hovered
            ? `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(1.02)`
            : "rotateX(0deg) rotateY(0deg) scale(1)",
          transition: hovered ? "none" : "transform 0.6s cubic-bezier(0.23, 1, 0.320, 1)",
          transformOrigin: "center",
        }}
      >
        {/* Card background with border and glow */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(160deg, ${gradient.join(", ")})`,
            border: `2px solid ${hovered ? accentColor : accentColor + "55"}`,
            borderRadius: "1rem",
            boxShadow: hovered
              ? `0 0 45px ${accentColor}77, 0 0 90px ${accentColor}33, 0 8px 40px rgba(0,0,0,0.7)`
              : `0 0 18px ${accentColor}33, 0 0 45px ${accentColor}16, 0 4px 20px rgba(0,0,0,0.5)`,
            transition: "all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        />

        {/* Premium AI Cover Art — Full Bleed with Safe Parallax */}
        {coverArtUrl && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              overflow: "hidden",
              borderRadius: "1rem",
            }}
          >
            <img
              src={coverArtUrl}
              alt=""
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "center",
                opacity: hovered ? 0.75 : 0.5,
                transition: "opacity 0.4s ease",
                filter: "saturate(1.4) brightness(0.95) contrast(1.1)",
              }}
            />
          </div>
        )}

        {/* Rapid Glow rotating border — high-intensity neon edge only */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            borderRadius: "1rem",
            padding: "2px",
            background: `conic-gradient(
              from 0deg,
              #ff00ff, #00ffff, #ffff00, #ff0080, #00ff80, #ff00ff
            )`,
            animation: "rapidGlowRotate 4s linear infinite",
            WebkitMaskImage: `radial-gradient(ellipse at center, transparent 95%, black 100%)`,
            maskImage: `radial-gradient(ellipse at center, transparent 95%, black 100%)`,
          }}
        />

        {/* Lightened vignette — preserves art visibility while darkening bottom */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background: `linear-gradient(to bottom,
              rgba(0,0,0,0) 0%,
              transparent 40%,
              transparent 60%,
              rgba(0,0,0,0.15) 80%,
              rgba(0,0,0,0.3) 100%
            )`,
            borderRadius: "1rem",
          }}
        />

        {/* Enhanced Accent color radial at top — always-on glow with hover boost */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background: `radial-gradient(ellipse at ${mousePos.x * 100}% ${Math.max(mousePos.y * 100 - 20, 0)}%, ${accentColor}66 0%, transparent 55%)`,
            opacity: hovered ? 1 : 0.65,
            transition: "opacity 0.4s ease, background 0.2s ease",
            animation: "topGlowPulse 3s ease-in-out infinite",
            borderRadius: "1rem",
          }}
        />

        {/* Cinematic Light Sweep on Hover */}
        {hovered && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              borderRadius: "1rem",
              background: `linear-gradient(
                ${Math.atan2(mousePos.y - 0.5, mousePos.x - 0.5) * (180 / Math.PI) + 90}deg,
                rgba(255, 255, 255, 0.15) 0%,
                rgba(255, 255, 255, 0.05) 20%,
                transparent 50%,
                rgba(0, 0, 0, 0.1) 80%,
                rgba(0, 0, 0, 0.2) 100%
              )`,
              animation: "lightSweep 0.8s ease-out",
            }}
          />
        )}

        {/* Bottom info section */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "0.75rem",
            paddingTop: "2.5rem",
            paddingBottom: "0.75rem",
            background: `linear-gradient(to top, rgba(0,0,0,0.98) 0%, rgba(0,0,0,0.9) 55%, transparent 100%)`,
            borderRadius: "0 0 1rem 1rem",
          }}
        >
          {/* Game name — signature DGC glow effect */}
          <div
            style={{
              fontSize: "clamp(11px, 2.5vw, 14px)",
              fontWeight: "900",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              lineHeight: "1.2",
              marginBottom: "0.125rem",
              color: accentColor,
              textShadow: `0 0 8px ${accentColor}, 0 0 16px ${accentColor}99, 0 0 32px ${accentColor}66, 0 0 48px ${accentColor}44`,
              transition: "all 0.3s ease",
              transform: hovered ? "scale(1.08) translateY(-2px)" : "scale(1) translateY(0)",
              animation: "titleGlow 2.5s ease-in-out infinite",
            }}
          >
            {theme.name}
          </div>

          {/* Tagline */}
          {config.tagline && (
            <div
              style={{
                fontSize: "9px",
                color: "rgba(255, 255, 255, 0.45)",
                fontStyle: "italic",
                marginBottom: "0.375rem",
                lineHeight: "1.2",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {config.tagline}
            </div>
          )}

          {/* Badges */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.25rem",
              marginBottom: "0.5rem",
              flexWrap: "wrap",
            }}
          >
            {config.rtp && (
              <span
                style={{
                  fontSize: "9px",
                  fontWeight: "900",
                  padding: "0.375rem 0.375rem",
                  borderRadius: "9999px",
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
                style={{
                  fontSize: "9px",
                  fontWeight: "900",
                  padding: "0.375rem 0.375rem",
                  borderRadius: "9999px",
                  textTransform: "capitalize",
                  background: `${accentColor}18`,
                  color: accentColor,
                  border: `1px solid ${accentColor}44`,
                  boxShadow: `0 0 6px ${accentColor}33`,
                }}
              >
                {config.volatility}
              </span>
            )}

          </div>

          {/* PLAY NOW button */}
          <div
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.375rem",
              padding: "0.5rem",
              borderRadius: "0.75rem",
              fontSize: "clamp(9px, 2vw, 11px)",
              fontWeight: "900",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              background: hovered
                ? `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`
                : `linear-gradient(135deg, ${accentColor}cc, ${accentColor}99)`,
              color: "#000",
              boxShadow: hovered
                ? `0 0 22px ${accentColor}aa, 0 0 44px ${accentColor}44, 0 4px 12px rgba(0,0,0,0.5)`
                : `0 0 10px ${accentColor}55, 0 0 20px ${accentColor}28`,
              transition: "all 0.3s ease",
              transform: hovered ? "scale(1.06)" : "scale(1)",
              cursor: "pointer",
            }}
          >
            <span>▶</span>
            <span>Play Now</span>
          </div>
        </div>

        {/* HOT badge */}
        {config.rtp && config.rtp >= 97 && (
          <div
            style={{
              position: "absolute",
              top: "0.75rem",
              right: "0.75rem",
              fontSize: "9px",
              fontWeight: "900",
              padding: "0.25rem 0.5rem",
              borderRadius: "9999px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              background: "linear-gradient(135deg, #ef4444, #dc2626)",
              color: "#fff",
              boxShadow: "0 0 12px #ef444488, 0 0 24px #ef444433",
              animation: "hotBadgePulse 1.5s ease-in-out infinite",
            }}
          >
            HOT
          </div>
        )}
      </div>

      <style>{`
        @keyframes topGlowPulse {
          0%, 100% { opacity: 0.55; }
          50%       { opacity: 0.9; }
        }
        @keyframes hotBadgePulse {
          0%, 100% { box-shadow: 0 0 10px #ef444488; }
          50%       { box-shadow: 0 0 18px #ef4444cc; }
        }
        @keyframes lightSweep {
          0% {
            opacity: 1;
            transform: translateX(-100%) translateY(-100%);
          }
          100% {
            opacity: 0;
            transform: translateX(100%) translateY(100%);
          }
        }
        @keyframes titleGlow {
          0%, 100% {
            filter: drop-shadow(0 0 4px currentColor) drop-shadow(0 0 8px currentColor);
          }
          50% {
            filter: drop-shadow(0 0 8px currentColor) drop-shadow(0 0 16px currentColor) drop-shadow(0 0 24px currentColor);
          }
        }
        @keyframes rapidGlowRotate {
          0% {
            filter: drop-shadow(0 0 8px #ff00ff) drop-shadow(0 0 16px #ff00ff);
          }
          25% {
            filter: drop-shadow(0 0 8px #00ffff) drop-shadow(0 0 16px #00ffff);
          }
          50% {
            filter: drop-shadow(0 0 8px #ffff00) drop-shadow(0 0 16px #ffff00);
          }
          75% {
            filter: drop-shadow(0 0 8px #ff0080) drop-shadow(0 0 16px #ff0080);
          }
          100% {
            filter: drop-shadow(0 0 8px #ff00ff) drop-shadow(0 0 16px #ff00ff);
          }
        }
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
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-white/5">
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
