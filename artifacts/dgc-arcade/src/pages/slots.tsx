import { useListGames, getListGamesQueryKey } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useState, useEffect } from "react";
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
  };
  active: string;
}

// ─── Professional Slot Cover Card ─────────────────────────────────────────────
function SlotCoverCard({ theme, onClick }: { theme: SlotTheme; onClick: () => void }) {
  const config = theme.config;
  const accentColor = config.accentColor ?? "#f59e0b";
  const gradient = config.coverGradient ?? ["#1a1a1a", "#2d2d2d", "#1a1a1a"];
  const symbols = config.symbols?.slice(0, 5) ?? [];
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="relative rounded-2xl overflow-hidden cursor-pointer group"
      style={{
        aspectRatio: "3/4",
        background: `linear-gradient(160deg, ${gradient.join(", ")})`,
        border: `1.5px solid ${hovered ? accentColor : accentColor + "44"}`,
        boxShadow: hovered
          ? `0 0 40px ${accentColor}66, 0 8px 32px rgba(0,0,0,0.6)`
          : `0 4px 20px rgba(0,0,0,0.4)`,
        transition: "all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)",
        transform: hovered ? "scale(1.03) translateY(-4px)" : "scale(1)",
      }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at 50% 20%, ${accentColor}22 0%, transparent 70%)`,
          opacity: hovered ? 1 : 0.5,
          transition: "opacity 0.25s ease",
        }}
      />

      {/* Floating symbols background decoration */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {symbols.map((s, i) => (
          <div
            key={s.id}
            className="absolute text-2xl opacity-10"
            style={{
              left: `${15 + i * 18}%`,
              top: `${10 + (i % 2) * 15}%`,
              fontSize: 28,
              filter: `drop-shadow(0 0 8px ${s.color})`,
              animation: `floatSym ${3 + i * 0.4}s ease-in-out infinite`,
              animationDelay: `${i * 0.3}s`,
            }}
          >
            {s.emoji}
          </div>
        ))}
      </div>

      {/* Main cover emoji */}
      <div className="absolute top-6 left-0 right-0 flex justify-center">
        <div
          className="relative"
          style={{
            fontSize: 72,
            filter: `drop-shadow(0 0 20px ${accentColor}) drop-shadow(0 0 40px ${accentColor}88)`,
            animation: "coverPulse 2.5s ease-in-out infinite",
          }}
        >
          {theme.assets.coverEmoji ?? "🎰"}
        </div>
      </div>

      {/* Symbol row */}
      {symbols.length > 0 && (
        <div className="absolute top-40 left-0 right-0 flex justify-center gap-2 px-4">
          {symbols.slice(0, 4).map(s => (
            <div
              key={s.id}
              className="flex items-center justify-center rounded-lg"
              style={{
                width: 36,
                height: 36,
                background: `radial-gradient(ellipse, ${s.color}33, rgba(0,0,0,0.6))`,
                border: `1px solid ${s.color}55`,
                fontSize: 20,
              }}
            >
              {s.emoji}
            </div>
          ))}
        </div>
      )}

      {/* Bottom info */}
      <div
        className="absolute bottom-0 left-0 right-0 p-4"
        style={{
          background: "linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.7) 60%, transparent 100%)",
        }}
      >
        {/* Game name */}
        <div
          className="font-black text-base uppercase tracking-widest leading-tight mb-1"
          style={{
            color: accentColor,
            textShadow: `0 0 12px ${accentColor}`,
          }}
        >
          {theme.name}
        </div>

        {/* Tagline */}
        {config.tagline && (
          <div className="text-[10px] text-white/50 mb-2 leading-tight italic">
            {config.tagline}
          </div>
        )}

        {/* Stats row */}
        <div className="flex items-center gap-2 flex-wrap">
          {config.rtp && (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: "#22c55e22", color: "#22c55e", border: "1px solid #22c55e44" }}
            >
              {config.rtp}% RTP
            </span>
          )}
          {config.reels && (
            <span className="text-[10px] text-white/50 font-mono">
              {config.reels}R · {config.paylines ?? "?"}L
            </span>
          )}
          {config.volatility && (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ml-auto"
              style={{
                background: `${accentColor}22`,
                color: accentColor,
                border: `1px solid ${accentColor}44`,
              }}
            >
              {config.volatility}
            </span>
          )}
        </div>

        {/* Play button (shows on hover) */}
        <div
          className="mt-3 py-2 rounded-xl font-black text-sm uppercase tracking-widest text-center transition-all"
          style={{
            background: hovered ? `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)` : "rgba(255,255,255,0.08)",
            color: hovered ? "#000" : accentColor,
            border: `1.5px solid ${accentColor}`,
            boxShadow: hovered ? `0 0 20px ${accentColor}88` : "none",
            transform: hovered ? "scale(1.02)" : "scale(1)",
            transition: "all 0.2s ease",
          }}
        >
          {hovered ? "▶ PLAY NOW" : "PLAY"}
        </div>
      </div>

      {/* Hot badge for high RTP games */}
      {config.rtp && config.rtp >= 97 && (
        <div
          className="absolute top-3 right-3 text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-wider"
          style={{ background: "#ef4444", color: "#fff", boxShadow: "0 0 10px #ef444488" }}
        >
          HOT
        </div>
      )}

      <style>{`
        @keyframes floatSym { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-8px) rotate(5deg); } }
        @keyframes coverPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); } }
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
