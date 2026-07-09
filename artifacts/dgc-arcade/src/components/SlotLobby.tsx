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
  "Pragmatic Play": "hsl(43 100% 50%)",   // gold — primary
  "Hacksaw Gaming": "hsl(280 80% 60%)",   // purple
  "NoLimit City":   "hsl(0 80% 55%)",     // red
  "NetEnt":         "hsl(200 80% 55%)",   // cyan
  "Evolution":      "hsl(160 70% 45%)",   // teal
};

function providerGlow(provider: string): string {
  const hex = PROVIDER_COLORS[provider] ?? "hsl(43 100% 50%)";
  return hex;
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
    <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${cls}`}>
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
  const glow = providerGlow(game.provider);

  return (
    <div
      className="slot-card group cursor-pointer rounded-xl overflow-hidden border border-border/60 bg-card transition-all duration-300 ease-in-out hover:border-primary/50"
      style={
        {
          "--card-glow": glow,
        } as React.CSSProperties
      }
      onClick={onClick}
    >
      {/* Thumbnail */}
      <div className="relative aspect-[4/3] overflow-hidden bg-secondary">
        <img
          src={game.thumbnail}
          alt={game.title}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-300 ease-in-out group-hover:scale-105"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src =
              "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300'%3E%3Crect width='400' height='300' fill='%23111827'/%3E%3Ctext x='200' y='155' text-anchor='middle' fill='%23374151' font-size='48' font-family='sans-serif'%3E🎰%3C/text%3E%3C/svg%3E";
          }}
        />

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center gap-3">
          <div className="w-14 h-14 rounded-full bg-primary/90 flex items-center justify-center shadow-lg shadow-primary/40 scale-90 group-hover:scale-100 transition-transform duration-300">
            <Play className="w-6 h-6 text-primary-foreground fill-primary-foreground ml-0.5" />
          </div>
          <span className="text-white text-xs font-bold uppercase tracking-widest">Play Now</span>
        </div>

        {/* Jackpot badge */}
        {game.jackpot && game.jackpot > 10000 && (
          <div className="absolute top-2 left-2 bg-amber-500 text-black text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shadow">
            Jackpot
          </div>
        )}
      </div>

      {/* Info row */}
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-1">
          <h3 className="font-semibold text-sm leading-tight text-foreground line-clamp-1 flex-1">
            {game.title}
          </h3>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground font-medium truncate">
            {game.provider}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] font-mono text-muted-foreground">
              {game.rtp}%
            </span>
            <VolatilityBadge v={game.volatility} />
          </div>
        </div>
        {game.jackpot && (
          <div className="text-[11px] font-semibold text-amber-500 font-mono">
            ${game.jackpot.toLocaleString()} jackpot
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

  // Build a window of page numbers around the current page
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
      {/* First */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        disabled={page === 1}
        onClick={() => onPage(1)}
        title="First page"
      >
        <ChevronFirst className="w-4 h-4" />
      </Button>

      {/* Prev */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        disabled={page === 1}
        onClick={() => onPage(page - 1)}
        title="Previous page"
      >
        <ChevronLeft className="w-4 h-4" />
      </Button>

      {/* Page numbers */}
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
            className="h-8 w-8 text-xs font-bold"
            onClick={() => onPage(p as number)}
          >
            {p}
          </Button>
        )
      )}

      {/* Next */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        disabled={page === totalPages}
        onClick={() => onPage(page + 1)}
        title="Next page"
      >
        <ChevronRight className="w-4 h-4" />
      </Button>

      {/* Last */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        disabled={page === totalPages}
        onClick={() => onPage(totalPages)}
        title="Last page"
      >
        <ChevronLast className="w-4 h-4" />
      </Button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Provider Filter Pill
───────────────────────────────────────────────────────────── */

function ProviderPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border transition-all duration-200 whitespace-nowrap ${
        active
          ? "bg-primary text-primary-foreground border-primary shadow-[0_0_12px_rgba(255,193,7,0.4)]"
          : "bg-secondary text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
      }`}
    >
      {label}
    </button>
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

  const { user } = useAuth();
  const [, setLocation] = useLocation();

  /* ── Fetch catalog ─────────────────────────────────────── */
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

  /* ── Derived state ─────────────────────────────────────── */
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

  // Reset to page 1 whenever filters change
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

  /* ── Render ────────────────────────────────────────────── */
  return (
    <div className="w-full space-y-6 px-4 md:px-6 py-6">

      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-5 h-5 text-primary" />
            <span className="text-xs font-bold uppercase tracking-widest text-primary">
              Premium Slots
            </span>
          </div>
          <h1 className="font-display font-black text-3xl md:text-4xl uppercase tracking-widest">
            Slot Lobby
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Authentic streams from Pragmatic Play, Hacksaw, NoLimit City &amp; more
          </p>
        </div>

        {/* Live jackpot ticker */}
        <div className="flex items-center gap-2 bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 px-4 py-2.5 rounded-xl shrink-0">
          <Zap className="w-4 h-4 text-amber-400 animate-pulse" />
          <div>
            <div className="text-[10px] text-amber-400/70 font-bold uppercase tracking-widest">
              Live Jackpot
            </div>
            <div className="text-amber-400 font-black font-mono text-base">
              $12,450.50
            </div>
          </div>
        </div>
      </div>

      {/* ── Search ─────────────────────────────────────── */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder={`Search ${games.length > 0 ? games.length + "+" : ""} slot titles…`}
          value={searchTerm}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            handleSearch(e.target.value)
          }
          className="pl-10 h-11 bg-secondary border-border focus:border-primary/60"
        />
      </div>

      {/* ── Provider filter pills ───────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <ProviderPill
          label="All Games"
          active={selectedProvider === null}
          onClick={() => handleProvider(null)}
        />
        {providers.map((p) => (
          <ProviderPill
            key={p}
            label={p}
            active={selectedProvider === p}
            onClick={() => handleProvider(p)}
          />
        ))}
      </div>

      {/* ── Controls bar ───────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {isLoading ? (
            "Loading games…"
          ) : (
            <>
              Showing{" "}
              <span className="text-foreground font-semibold">
                {Math.min((page - 1) * pageSize + 1, filtered.length)}–
                {Math.min(page * pageSize, filtered.length)}
              </span>{" "}
              of{" "}
              <span className="text-foreground font-semibold">
                {filtered.length}
              </span>{" "}
              games
            </>
          )}
        </p>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            Per page:
          </span>
          <Select value={String(pageSize)} onValueChange={handlePageSize}>
            <SelectTrigger className="h-8 w-20 text-xs bg-secondary border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)} className="text-xs">
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Game grid ──────────────────────────────────── */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
          {Array.from({ length: pageSize > 10 ? 10 : pageSize }).map((_, i) => (
            <div
              key={i}
              className="aspect-[4/3] bg-secondary rounded-xl animate-pulse border border-border/40"
            />
          ))}
        </div>
      ) : paginated.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-border/40 rounded-xl bg-secondary/30">
          <Gamepad2 className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-1">No games found</h3>
          <p className="text-muted-foreground text-sm">
            Try adjusting your search or provider filter
          </p>
          {searchTerm && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-4"
              onClick={() => handleSearch("")}
            >
              Clear search
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
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
          <p className="text-center text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </p>
        </div>
      )}
    </div>
  );
}
