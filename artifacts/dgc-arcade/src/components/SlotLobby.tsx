import React, { useState, useMemo, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import {
  Gamepad2,
  Search,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Play,
  X,
  Maximize2,
  Minimize2,
  ArrowLeft,
  Zap,
  Trophy,
  Flame,
  AlertCircle,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────
   Types
───────────────────────────────────────────────────────────── */
interface SlotGame {
  id: string;
  title: string;
  provider: string;
  thumbnail: string;
  rtp: number;
  volatility: "low" | "medium" | "high";
  jackpot?: number;
  slug?: string;
}

interface SlotLobbyProps {
  initialGameId?: string;
  onGameSelect?: (gameId: string) => void;
}

/* ─────────────────────────────────────────────────────────────
   Constants
───────────────────────────────────────────────────────────── */
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

const PROVIDER_COLORS: Record<string, string> = {
  "Pragmatic Play": "#FFD700",
  "Hacksaw Gaming": "#a855f7",
  "NoLimit City": "#ef4444",
  "NetEnt": "#3b82f6",
  "Evolution": "#10b981",
  "Inbet": "#FFD700",
  "DGC Originals": "#FFD700",
  "NexusGGR": "#FF6B35",
};

/* ─────────────────────────────────────────────────────────────
   Volatility badge
───────────────────────────────────────────────────────────── */
function VolatilityBadge({ v }: { v: "low" | "medium" | "high" }) {
  const cls =
    v === "low"
      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
      : v === "medium"
        ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
        : "bg-red-500/20 text-red-400 border-red-500/30";
  return (
    <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${cls}`}>
      {v}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────
   Game Card
───────────────────────────────────────────────────────────── */
function SlotCard({ game, onClick }: { game: SlotGame; onClick: () => void }) {
  const [imgFailed, setImgFailed] = React.useState(false);
  const providerColor = PROVIDER_COLORS[game.provider] ?? "#FFD700";

  return (
    <div
      className="group relative w-full cursor-pointer rounded-2xl overflow-hidden border border-white/5 bg-black/40 backdrop-blur-sm transition-all duration-300 hover:border-primary/40 hover:scale-[1.05] hover:-translate-y-1 shadow-xl hover:shadow-[0_20px_40px_rgba(255,215,0,0.15)]"
      style={{ "--provider-color": providerColor } as React.CSSProperties}
      onClick={onClick}
    >
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent z-10 pointer-events-none" />

      {/* Thumbnail */}
      <div className="relative aspect-[4/5] overflow-hidden bg-black/60">
        {!imgFailed ? (
          <img
            src={game.thumbnail}
            alt={game.title}
            className="w-full h-full object-cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-black/80 to-black/40">
            <Gamepad2 className="w-8 h-8 text-muted-foreground/40" />
            <span className="text-[10px] text-muted-foreground/30 text-center px-2">No cover available</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="relative z-20 p-4 space-y-3">
        {/* Title */}
        <div className="space-y-1">
          <h3 className="font-black text-sm uppercase tracking-tight line-clamp-2 text-white group-hover:text-primary transition-colors">
            {game.title}
          </h3>
          <div className="flex items-center justify-between gap-2">
            <span
              className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/10"
              style={{ borderColor: providerColor, borderWidth: "1px" }}
            >
              {game.provider}
            </span>
            <VolatilityBadge v={game.volatility} />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2 text-[10px] font-black uppercase tracking-widest">
          <div className="bg-white/5 rounded-lg p-2 text-center">
            <div className="text-muted-foreground/60">RTP</div>
            <div className="text-primary">{game.rtp}%</div>
          </div>
          {game.jackpot ? (
            <div className="bg-primary/10 rounded-lg p-2 text-center border border-primary/20">
              <div className="text-muted-foreground/60">Jackpot</div>
              <div className="text-primary">${game.jackpot.toLocaleString()}</div>
            </div>
          ) : (
            <div className="bg-white/5 rounded-lg p-2 text-center">
              <div className="text-muted-foreground/60">Volatility</div>
              <div className="text-amber-400 capitalize">{game.volatility}</div>
            </div>
          )}
        </div>

        {/* Play button */}
        <Button
          className="w-full h-10 bg-primary text-black font-black uppercase tracking-widest text-xs rounded-xl hover:bg-primary/90 hover:shadow-[0_0_20px_rgba(255,215,0,0.3)] transition-all"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
        >
          <Play className="w-3 h-3 mr-2" />
          Play Now
        </Button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Main Slot Lobby Component
───────────────────────────────────────────────────────────── */
export function SlotLobby({ initialGameId, onGameSelect }: SlotLobbyProps) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState<PageSize>(25);
  const [page, setPage] = useState(1);
  const [fullscreenGameId, setFullscreenGameId] = useState<string | null>(null);

  // Fetch real games from aggregator API
  const { data: games = [], isLoading, error } = useQuery<SlotGame[]>({
    queryKey: ["slot-games-aggregator"],
    queryFn: async () => {
      const token = localStorage.getItem("dgc_token");
      const res = await fetch("/api/slots/aggregator/games", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        throw new Error("Failed to fetch slot games from aggregator");
      }
      const data = await res.json();
      return data.games || [];
    },
    staleTime: 1000 * 60 * 10, // 10 minutes
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  const providers = useMemo(() => {
    const set = new Set(games.map((g) => g.provider));
    return Array.from(set).sort();
  }, [games]);

  const filtered = useMemo(() => {
    return games.filter((g) => {
      const matchSearch = g.title.toLowerCase().includes(searchTerm.toLowerCase());
      const matchProvider = !selectedProvider || g.provider === selectedProvider;
      return matchSearch && matchProvider;
    });
  }, [games, searchTerm, selectedProvider]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const handleSearch = useCallback((val: string) => {
    setSearchTerm(val);
    setPage(1);
  }, []);

  const handleLaunchGame = useCallback(
    async (gameId: string) => {
      try {
        if (onGameSelect) onGameSelect(gameId);
        setLocation(`/slots/${gameId}`);
      } catch (err) {
        console.error("Error launching game:", err);
      }
    },
    [setLocation, onGameSelect]
  );

  if (isLoading) {
    return (
      <div className="w-full space-y-6 pb-24 md:pb-12">
        <div className="relative overflow-hidden group flex flex-col lg:flex-row lg:items-center justify-between gap-4 md:gap-6 bg-gradient-to-br from-black/60 to-black/40 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-4 md:p-6 lg:p-10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] animate-pulse">
          <div className="h-16 w-48 bg-white/5 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="aspect-[4/5] bg-white/5 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full space-y-6 pb-24 md:pb-12">
        <div className="relative overflow-hidden group flex flex-col lg:flex-row lg:items-center justify-between gap-4 md:gap-6 bg-gradient-to-br from-red-500/10 to-red-500/5 backdrop-blur-2xl border border-red-500/30 rounded-[2.5rem] p-4 md:p-6 lg:p-10 shadow-[0_20px_50px_rgba(255,0,0,0.1)]">
          <div className="flex items-center gap-4">
            <AlertCircle className="w-8 h-8 text-red-500" />
            <div>
              <h2 className="font-black text-lg text-red-400">Failed to Load Games</h2>
              <p className="text-sm text-red-300/80">Could not fetch games from the aggregator. Please try again.</p>
            </div>
          </div>
          <Button onClick={() => window.location.reload()} className="bg-red-500 hover:bg-red-600">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 pb-24 md:pb-12">
      {/* ── Header ── */}
      <div className="relative w-full overflow-hidden group flex flex-col lg:flex-row lg:items-center justify-between gap-4 md:gap-6 bg-gradient-to-br from-black/60 to-black/40 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-4 md:p-6 lg:p-10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-all duration-300 hover:border-primary/20 hover:shadow-[0_20px_50px_rgba(255,215,0,0.2)]">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2" />

        <div className="relative z-10 space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/30 shadow-[0_0_30px_rgba(255,215,0,0.15)] group-hover:scale-110 transition-transform duration-500">
              <Gamepad2 className="w-6 h-6 md:w-8 md:h-8 text-primary animate-pulse" />
            </div>
            <div>
              <h1 className="font-display font-black text-3xl md:text-6xl uppercase tracking-[0.15em] text-white leading-none">
                DGC<span className="text-glow-shift-slow drop-shadow-[0_0_15px_rgba(255,215,0,0.5)]">SLOTS</span>
              </h1>
              <div className="flex items-center gap-3 mt-2">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-ping" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-green-400">
                    {games.length} Games Live
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Search & Filters ── */}
      <div className="w-full space-y-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40 pointer-events-none" />
          <Input
            placeholder="Search games..."
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full pl-12 bg-white/5 border-white/10 rounded-2xl h-12 font-mono font-black text-lg text-white placeholder:text-muted-foreground/30 focus:border-primary/50 focus:ring-primary/20 transition-all"
          />
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <Select value={selectedProvider || "all"} onValueChange={(v) => setSelectedProvider(v === "all" ? null : v)}>
            <SelectTrigger className="w-full md:w-48 bg-white/5 border-white/10 rounded-2xl h-12 font-black uppercase text-xs">
              <SelectValue placeholder="All Providers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Providers</SelectItem>
              {providers.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Per Page:</span>
            <Select value={pageSize.toString()} onValueChange={(v) => { setPageSize(parseInt(v) as PageSize); setPage(1); }}>
              <SelectTrigger className="w-20 bg-white/5 border-white/10 rounded-xl h-10 font-black">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={size.toString()}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* ── Games Grid ── */}
      <div className="w-full space-y-6">
        {paginated.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
            {paginated.map((game) => (
              <SlotCard key={game.id} game={game} onClick={() => handleLaunchGame(game.id)} />
            ))}
          </div>
        ) : (
          <div className="w-full py-12 text-center">
            <Zap className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">No games found matching your filters.</p>
          </div>
        )}
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="w-full flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(1)}
            disabled={page === 1}
            className="rounded-lg"
          >
            <ChevronFirst className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="rounded-lg"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>

          <div className="flex items-center gap-1 px-4">
            <span className="text-sm font-black">
              {page} / {totalPages}
            </span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="rounded-lg"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(totalPages)}
            disabled={page === totalPages}
            className="rounded-lg"
          >
            <ChevronLast className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
