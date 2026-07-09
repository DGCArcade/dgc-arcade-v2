import React, { useState, useMemo, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Zap,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Play,
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
  onGameSelect?: (gameId: string) => void;
}

/* ─────────────────────────────────────────────────────────────
   Provider colour map — matches brand accent palette
───────────────────────────────────────────────────────────── */

const PROVIDER_COLORS: Record<string, string> = {
  "Pragmatic Play": "hsl(43 100% 50%)",
  "Hacksaw Gaming": "hsl(280 80% 60%)",
  "NoLimit City":   "hsl(0 80% 55%)",
  "NetEnt":         "hsl(200 80% 55%)",
  "Evolution":      "hsl(160 70% 45%)",
  "Inbet":          "hsl(43 100% 50%)",
};

function providerGlow(provider: string): string {
  return PROVIDER_COLORS[provider] ?? "hsl(43 100% 50%)";
}

/* ─────────────────────────────────────────────────────────────
   Volatility badge helper
───────────────────────────────────────────────────────────── */

function VolatilityBadge({ v }: { v: "low" | "medium" | "high" }) {
  const cls =
    v === "low"
      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
      : v === "medium"
        ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
        : "bg-red-500/20 text-red-400 border-red-500/30";
  return (
    <span className={`text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${cls}`}>
      {v}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────
   Game Card
───────────────────────────────────────────────────────────── */

function SlotCard({
  game,
  onClick,
}: {
  game: SlotGame;
  onClick: () => void;
}) {
  const [imgFailed, setImgFailed] = React.useState(false);

  return (
    <div
      className="group relative cursor-pointer rounded-2xl overflow-hidden border border-white/5 bg-black/40 transition-all duration-500 hover:border-primary/40 hover:scale-[1.05] hover:-translate-y-2 shadow-2xl hover:shadow-[0_20px_40px_rgba(255,215,0,0.15)]"
      onClick={onClick}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent z-10" />
      
      {/* Thumbnail */}
      <div className="relative aspect-[4/5] overflow-hidden bg-secondary">
        {!imgFailed ? (
          <img
            src={game.thumbnail}
            alt={game.title}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-black/60 to-black/40">
            <Gamepad2 className="w-12 h-12 text-primary/20" />
            <span className="text-[10px] font-black uppercase tracking-widest text-primary/40 text-center px-4">
              {game.title}
            </span>
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-20 flex flex-col items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center shadow-[0_0_30px_rgba(255,215,0,0.5)] scale-75 group-hover:scale-100 transition-transform duration-500">
            <Play className="w-8 h-8 text-black fill-black ml-1" />
          </div>
        </div>
      </div>

      {/* Info Overlay */}
      <div className="absolute bottom-0 left-0 w-full p-4 z-30 space-y-1">
        <h3 className="font-black text-xs md:text-sm uppercase tracking-wider text-white truncate drop-shadow-lg">
          {game.title}
        </h3>
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-black uppercase tracking-widest text-primary drop-shadow-lg">
            {game.provider}
          </span>
          <div className="flex items-center gap-1.5">
             <span className="text-[9px] font-black font-mono text-white/60">
              {game.rtp}%
            </span>
            <VolatilityBadge v={game.volatility} />
          </div>
        </div>
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

  const window = 2;
  const pages: (number | "…")[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (
      i === 1 ||
      i === totalPages ||
      (i >= page - window && i <= page + window)
    ) {
      pages.push(i);
    } else if (
      pages[pages.length - 1] !== "…"
    ) {
      pages.push("…");
    }
  }

  return (
    <div className="flex items-center justify-center gap-1 flex-wrap py-2">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        disabled={page === 1}
        onClick={() => onPage(1)}
      >
        <ChevronFirst className="w-4 h-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        disabled={page === 1}
        onClick={() => onPage(page - 1)}
      >
        <ChevronLeft className="w-4 h-4" />
      </Button>

      {pages.map((p, idx) =>
        p === "…" ? (
          <span
            key={`ellipsis-${idx}`}
            className="px-1 text-muted-foreground text-sm select-none"
          >
            …
          </span>
        ) : (
          <Button
            key={p}
            variant={p === page ? "default" : "ghost"}
            size="icon"
            className="h-8 w-8 text-xs font-black"
            onClick={() => onPage(p as number)}
          >
            {p}
          </Button>
        )
      )}

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        disabled={page === totalPages}
        onClick={() => onPage(page + 1)}
      >
        <ChevronRight className="w-4 h-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        disabled={page === totalPages}
        onClick={() => onPage(totalPages)}
      >
        <ChevronLast className="w-4 h-4" />
      </Button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Main Lobby
───────────────────────────────────────────────────────────── */

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export function SlotLobby({ onGameSelect }: SlotLobbyProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(50);

  const [, setLocation] = useLocation();

  const { data: games = [], isLoading } = useQuery<SlotGame[]>({
    queryKey: ["slot-games"],
    queryFn: async () => {
      const res = await fetch("/api/slots/catalog", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("dgc_token")}`,
        },
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
      const matchSearch = g.title
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      const matchProvider =
        !selectedProvider || g.provider === selectedProvider;
      return matchSearch && matchProvider;
    });
  }, [games, searchTerm, selectedProvider]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  const handleSearch = useCallback((val: string) => {
    setSearchTerm(val);
    setPage(1);
  }, []);

  const handleProvider = useCallback((p: string | null) => {
    setSelectedProvider(p);
    setPage(1);
  }, []);

  const handlePageSize = useCallback((val: string) => {
    setPageSize(Number(val) as PageSize);
    setPage(1);
  }, []);

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const handleGameClick = useCallback(
    (gameId: string) => {
      if (onGameSelect) {
        onGameSelect(gameId);
      } else {
        setLocation(`/slots/${gameId}`);
      }
    },
    [onGameSelect, setLocation]
  );

  return (
    <div className="w-full space-y-8 px-4 md:px-8 py-8 max-w-[1600px] mx-auto">
      {/* ── Premium Header ─────────────────────────────────────── */}
      <div className="relative overflow-hidden group bg-gradient-to-br from-black/60 to-black/40 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-8 md:p-12 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/30 shadow-[0_0_30px_rgba(255,215,0,0.2)]">
                <Gamepad2 className="w-7 h-7 text-primary animate-pulse" />
              </div>
              <div>
                <h1 className="font-display font-black text-4xl md:text-6xl uppercase tracking-[0.2em] text-white leading-none">
                  DGC<span className="text-primary">SLOTS</span>
                </h1>
                <div className="flex items-center gap-3 mt-2">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-primary">Live Engine</span>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                    Premium Providers • Instant Play
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="relative w-full sm:w-72 group/search">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within/search:text-primary transition-colors" />
              <Input
                placeholder="Search games..."
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-12 h-14 bg-black/40 border-white/10 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] focus:border-primary/50 focus:ring-primary/20 transition-all"
              />
            </div>
            <Select value={String(pageSize)} onValueChange={handlePageSize}>
              <SelectTrigger className="w-full sm:w-32 h-14 bg-black/40 border-white/10 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] focus:border-primary/50">
                <SelectValue placeholder="Show" />
              </SelectTrigger>
              <SelectContent className="bg-black/90 border-white/10 backdrop-blur-xl rounded-xl">
                {PAGE_SIZE_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={String(opt)} className="font-black uppercase tracking-[0.2em] text-[10px] focus:bg-primary focus:text-black">
                    {opt} Games
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* ── Provider Filters ─────────────────────────────────── */}
      <div className="flex items-center gap-3 overflow-x-auto pb-4 scrollbar-hide px-2">
        <button
          onClick={() => handleProvider(null)}
          className={`px-8 py-3.5 rounded-2xl border font-black uppercase tracking-[0.2em] text-[10px] transition-all duration-300 whitespace-nowrap ${
            selectedProvider === null
              ? "bg-primary text-black border-primary shadow-[0_0_30px_rgba(255,215,0,0.3)] scale-105"
              : "bg-white/5 text-muted-foreground border-white/10 hover:border-primary/40 hover:text-foreground hover:scale-[1.02]"
          }`}
        >
          All Categories
        </button>
        {providers.map((p) => (
          <button
            key={p}
            onClick={() => handleProvider(p)}
            className={`px-8 py-3.5 rounded-2xl border font-black uppercase tracking-[0.2em] text-[10px] transition-all duration-300 whitespace-nowrap ${
              selectedProvider === p
                ? "bg-primary text-black border-primary shadow-[0_0_30px_rgba(255,215,0,0.3)] scale-105"
                : "bg-white/5 text-muted-foreground border-white/10 hover:border-primary/40 hover:text-foreground hover:scale-[1.02]"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* ── Game Grid ──────────────────────────────────── */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 md:gap-10">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[4/5] rounded-2xl bg-white/5 animate-pulse border border-white/10"
            />
          ))}
        </div>
      ) : paginated.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 bg-black/40 backdrop-blur-xl rounded-[3rem] border border-dashed border-white/10">
          <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6">
            <Gamepad2 className="w-10 h-10 text-muted-foreground/30" />
          </div>
          <h3 className="text-2xl font-black uppercase tracking-widest text-white">No games found</h3>
          <p className="text-muted-foreground font-mono mt-2">Try adjusting your filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 md:gap-10">
          {paginated.map((game) => (
            <SlotCard
              key={game.id}
              game={game}
              onClick={() => handleGameClick(game.id)}
            />
          ))}
        </div>
      )}

      {/* ── Pagination ─────────────────────────────────── */}
      {!isLoading && filtered.length > 0 && (
        <div className="space-y-2">
          <PaginationBar
            page={page}
            totalPages={totalPages}
            onPage={setPage}
          />
          <p className="text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Page {page} of {totalPages}
          </p>
        </div>
      )}
    </div>
  );
}
