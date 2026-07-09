import React, { useState, useMemo, useCallback, useEffect } from "react";
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
  "NoLimit City":   "#ef4444",
  "NetEnt":         "#3b82f6",
  "Evolution":      "#10b981",
  "Inbet":          "#FFD700",
  "DGC Originals":  "#FFD700",
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
      className="group relative cursor-pointer rounded-2xl overflow-hidden border border-white/5 bg-black/40 backdrop-blur-sm transition-all duration-300 hover:border-primary/40 hover:scale-[1.05] hover:-translate-y-1 shadow-xl hover:shadow-[0_20px_40px_rgba(255,215,0,0.15)]"
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
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-black/80 to-black/60">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: `${providerColor}15`, border: `1px solid ${providerColor}30` }}
            >
              <Gamepad2 className="w-8 h-8" style={{ color: providerColor }} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-white/50 text-center px-4 leading-tight">
              {game.title}
            </span>
          </div>
        )}

        {/* Hover play overlay */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20 flex items-center justify-center">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl scale-75 group-hover:scale-100 transition-transform duration-300"
            style={{ background: providerColor }}
          >
            <Play className="w-7 h-7 text-black fill-black ml-0.5" />
          </div>
        </div>
      </div>

      {/* Info overlay */}
      <div className="absolute bottom-0 left-0 w-full p-3 z-30 space-y-1">
        <h3 className="font-black text-[11px] md:text-xs uppercase tracking-wider text-white truncate drop-shadow-lg leading-tight">
          {game.title}
        </h3>
        <div className="flex items-center justify-between gap-1">
          <span
            className="text-[9px] font-black uppercase tracking-widest truncate"
            style={{ color: providerColor }}
          >
            {game.provider}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[9px] font-black font-mono text-white/50">
              {game.rtp}%
            </span>
            <VolatilityBadge v={game.volatility} />
          </div>
        </div>
        {game.jackpot && (
          <div className="flex items-center gap-1">
            <Trophy className="w-2.5 h-2.5 text-yellow-400" />
            <span className="text-[9px] font-black text-yellow-400 font-mono">
              ${game.jackpot.toLocaleString()}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Pagination Controls
───────────────────────────────────────────────────────────── */
function PaginationBar({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  const windowSize = 2;
  const pages: (number | "…")[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - windowSize && i <= page + windowSize)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "…") {
      pages.push("…");
    }
  }
  return (
    <div className="flex items-center justify-center gap-1 flex-wrap py-2">
      <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page === 1} onClick={() => onPage(1)}>
        <ChevronFirst className="w-4 h-4" />
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page === 1} onClick={() => onPage(page - 1)}>
        <ChevronLeft className="w-4 h-4" />
      </Button>
      {pages.map((p, idx) =>
        p === "…" ? (
          <span key={`e-${idx}`} className="px-1 text-muted-foreground text-sm select-none">…</span>
        ) : (
          <Button
            key={p}
            variant={p === page ? "default" : "ghost"}
            size="icon"
            className={`h-8 w-8 text-xs font-black ${p === page ? "bg-primary text-black shadow-[0_0_12px_rgba(255,215,0,0.4)]" : ""}`}
            onClick={() => onPage(p as number)}
          >
            {p}
          </Button>
        )
      )}
      <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page === totalPages} onClick={() => onPage(page + 1)}>
        <ChevronRight className="w-4 h-4" />
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page === totalPages} onClick={() => onPage(totalPages)}>
        <ChevronLast className="w-4 h-4" />
      </Button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Game iframe Player
───────────────────────────────────────────────────────────── */
function SlotIframePlayer({ gameId, onClose }: { gameId: string; onClose: () => void }) {
  const { user } = useAuth();
  const [launchUrl, setLaunchUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const fetchLaunchUrl = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem("dgc_token");
        const res = await fetch(`/api/slots/launch?game_id=${encodeURIComponent(gameId)}&currency=USD`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (data.success && data.launchUrl) {
          setLaunchUrl(data.launchUrl);
        } else {
          setError(data.message || data.setup || "Failed to launch game");
        }
      } catch (e) {
        setError("Network error — could not launch game");
      } finally {
        setLoading(false);
      }
    };
    fetchLaunchUrl();
  }, [gameId]);

  return (
    <div
      className={`fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col transition-all duration-300 ${
        fullscreen ? "p-0" : "p-0 md:p-4"
      }`}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex items-center gap-2 text-muted-foreground hover:text-white transition-colors text-xs font-black uppercase tracking-widest"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back to Lobby</span>
          </button>
          <div className="w-px h-4 bg-white/10 hidden sm:block" />
          <span className="text-xs font-black uppercase tracking-widest text-primary truncate max-w-[200px]">
            {gameId.replace(/-/g, " ")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFullscreen((f) => !f)}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-muted-foreground hover:text-white transition-all"
          >
            {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/30 text-muted-foreground hover:text-red-400 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* iframe container */}
      <div className="flex-1 relative overflow-hidden rounded-b-2xl md:rounded-2xl">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-10 gap-4">
            <div className="w-16 h-16 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="text-white font-black uppercase tracking-widest text-xs">Loading Game…</p>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-10 gap-6 px-8 text-center">
            <div className="w-20 h-20 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Gamepad2 className="w-10 h-10 text-primary/60" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black uppercase tracking-widest text-white">Game Unavailable</h3>
              <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">{error}</p>
              {error.includes("CASINO_PROVIDER_URL") || error.includes("not configured") ? (
                <p className="text-xs text-primary/60 font-mono mt-2">
                  Set CASINO_PROVIDER_URL, CASINO_API_KEY, and CASINO_MERCHANT_ID in your Render environment variables.
                </p>
              ) : null}
            </div>
            <button
              onClick={onClose}
              className="px-8 py-3 rounded-2xl bg-primary text-black font-black uppercase tracking-widest text-xs hover:bg-primary/90 transition-all"
            >
              Back to Lobby
            </button>
          </div>
        )}
        {launchUrl && (
          <iframe
            src={launchUrl}
            className="w-full h-full border-0"
            allow="fullscreen; autoplay; payment"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
            title={gameId}
            onLoad={() => setLoading(false)}
          />
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Main Lobby
───────────────────────────────────────────────────────────── */
export function SlotLobby({ onGameSelect, initialGameId }: SlotLobbyProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [activeGameId, setActiveGameId] = useState<string | null>(initialGameId ?? null);
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const { data: games = [], isLoading } = useQuery<SlotGame[]>({
    queryKey: ["slot-games"],
    queryFn: async () => {
      const token = localStorage.getItem("dgc_token");
      const res = await fetch("/api/slots/catalog", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to fetch slot games");
      return res.json();
    },
    staleTime: 1000 * 60 * 5,
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

  const handleSearch = useCallback((val: string) => { setSearchTerm(val); setPage(1); }, []);
  const handleProvider = useCallback((p: string | null) => { setSelectedProvider(p); setPage(1); }, []);
  const handlePageSize = useCallback((val: string) => { setPageSize(Number(val) as PageSize); setPage(1); }, []);

  const handleGameClick = useCallback((gameId: string) => {
    if (onGameSelect) {
      onGameSelect(gameId);
    } else {
      setActiveGameId(gameId);
    }
  }, [onGameSelect]);

  // If a game is active, show the iframe player
  if (activeGameId) {
    return <SlotIframePlayer gameId={activeGameId} onClose={() => setActiveGameId(null)} />;
  }

  return (
    <div className="min-h-screen bg-black">
      {/* ── Hero Header ─────────────────────────────────── */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,215,0,0.08),transparent_60%)] pointer-events-none" />
        <div className="relative px-4 sm:px-6 lg:px-8 pt-8 pb-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1 h-6 bg-primary rounded-full" />
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/70">DGC Casino</span>
                </div>
                <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight text-white">
                  Slot Lobby
                </h1>
                <p className="text-sm text-muted-foreground mt-1 font-medium">
                  {isLoading ? "Loading games…" : `${games.length} games · Pragmatic Play · Hacksaw · NoLimit City`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-500/10 border border-green-500/20">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-green-400">Live</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/20">
                  <Zap className="w-3 h-3 text-primary" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-primary">Crypto Native</span>
                </div>
              </div>
            </div>

            {/* ── Search + Page Size ─────────────────────── */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Search games…"
                  className="h-12 pl-10 bg-white/5 border-white/10 rounded-2xl font-black uppercase tracking-[0.1em] text-[11px] focus:border-primary/50 focus:ring-primary/20 transition-all"
                />
              </div>
              <Select value={String(pageSize)} onValueChange={handlePageSize}>
                <SelectTrigger className="w-full sm:w-36 h-12 bg-white/5 border-white/10 rounded-2xl font-black uppercase tracking-[0.1em] text-[11px] focus:border-primary/50 shrink-0">
                  <SelectValue placeholder="Show" />
                </SelectTrigger>
                <SelectContent className="bg-black/95 border-white/10 backdrop-blur-xl rounded-xl">
                  {PAGE_SIZE_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={String(opt)} className="font-black uppercase tracking-[0.1em] text-[11px] focus:bg-primary focus:text-black">
                      {opt} Games
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* ── Provider Filters ─────────────────────── */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
              <button
                onClick={() => handleProvider(null)}
                className={`px-5 py-2.5 rounded-2xl border font-black uppercase tracking-[0.15em] text-[10px] transition-all duration-200 whitespace-nowrap shrink-0 ${
                  selectedProvider === null
                    ? "bg-primary text-black border-primary shadow-[0_0_20px_rgba(255,215,0,0.25)]"
                    : "bg-white/5 text-muted-foreground border-white/10 hover:border-primary/30 hover:text-white"
                }`}
              >
                All Games
              </button>
              {providers.map((p) => (
                <button
                  key={p}
                  onClick={() => handleProvider(p)}
                  className={`px-5 py-2.5 rounded-2xl border font-black uppercase tracking-[0.15em] text-[10px] transition-all duration-200 whitespace-nowrap shrink-0 ${
                    selectedProvider === p
                      ? "bg-primary text-black border-primary shadow-[0_0_20px_rgba(255,215,0,0.25)]"
                      : "bg-white/5 text-muted-foreground border-white/10 hover:border-primary/30 hover:text-white"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Game Grid ─────────────────────────────────── */}
      <div className="px-4 sm:px-6 lg:px-8 pb-12">
        <div className="max-w-7xl mx-auto">
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-5">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="aspect-[4/5] rounded-2xl bg-white/5 animate-pulse border border-white/5" />
              ))}
            </div>
          ) : paginated.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 bg-white/[0.02] backdrop-blur-sm rounded-3xl border border-dashed border-primary/15">
              <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center mb-6 border border-primary/20">
                <Gamepad2 className="w-10 h-10 text-primary/40" />
              </div>
              <h3 className="text-2xl font-black uppercase tracking-[0.2em] text-white mb-2">No Games Found</h3>
              <p className="text-primary/50 font-black uppercase tracking-widest text-[10px] mb-8">
                {games.length === 0 ? "No games in catalog yet — add games in the Owner Panel" : "No games match your search"}
              </p>
              <Button
                variant="outline"
                onClick={() => { setSearchTerm(""); setSelectedProvider(null); }}
                className="rounded-2xl border-primary/30 text-primary font-black uppercase tracking-widest text-xs h-12 px-8 hover:bg-primary hover:text-black transition-all"
              >
                Reset Filters
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-5">
              {paginated.map((game) => (
                <SlotCard key={game.id} game={game} onClick={() => handleGameClick(game.id)} />
              ))}
            </div>
          )}

          {/* ── Pagination ─────────────────────────────── */}
          {!isLoading && filtered.length > 0 && (
            <div className="mt-8 space-y-2">
              <PaginationBar page={page} totalPages={totalPages} onPage={setPage} />
              <p className="text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Showing {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length} games · Page {page} of {totalPages}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
