"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import {
  Search,
  Loader,
  AlertCircle,
  Trophy,
  Coins,
  History,
  ExternalLink,
  Flame,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { CoinIcon } from "@/components/wallet/coin-icon";

/* ─────────────────────────────────────────────────────────────
   Types
───────────────────────────────────────────────────────────── */
interface Sport {
  key: string;
  group: string;
  title: string;
  description: string;
  active: boolean;
}

interface Outcome {
  name: string;
  price: number;
  point?: number;
}

interface Market {
  key: string;
  outcomes: Outcome[];
}

interface Bookmaker {
  key: string;
  title: string;
  markets: Market[];
  deeplinks?: Record<string, string>;
}

interface LiveScore {
  homeScore?: number;
  awayScore?: number;
  period?: string;
}

interface Fixture {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  completed: boolean;
  home_team: string;
  away_team: string;
  liveScore?: LiveScore;
  bookmakers: Bookmaker[];
}

interface SportsBet {
  id: number;
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  selectedOutcome: string;
  odds: string;
  betAmountUsd: string;
  status: string;
  createdAt: string;
  potentialPayoutUsd: string;
  settledAt?: string;
}

/* ─────────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────────── */

function americanOddsToMultiplier(americanOdds: number): number {
  if (americanOdds > 0) return americanOdds / 100 + 1;
  return 100 / Math.abs(americanOdds) + 1;
}

function formatOdds(price: number): string {
  return price > 0 ? `+${price}` : `${price}`;
}

function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function formatCommenceTime(isoString: string, includeDate = false): string {
  const tz = getUserTimezone();
  try {
    return new Date(isoString).toLocaleString(undefined, {
      timeZone: tz,
      ...(includeDate && {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return new Date(isoString).toLocaleString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
}

function isGameLive(fixture: Fixture): boolean {
  // If we have live scores, it's definitely live
  if (fixture.liveScore) return true;
  
  const now = new Date();
  const commenceTime = new Date(fixture.commence_time);
  const timeDiff = (now.getTime() - commenceTime.getTime()) / (1000 * 60);
  // A game is considered live if it started within the last 4 hours and isn't marked completed
  return timeDiff >= 0 && timeDiff < 240 && !fixture.completed;
}

function isGameUpcoming(fixture: Fixture): boolean {
  const now = new Date();
  const commenceTime = new Date(fixture.commence_time);
  const timeDiff = (commenceTime.getTime() - now.getTime()) / (1000 * 60);
  return timeDiff > 0 && timeDiff < 20160; // Next 14 days (2 weeks)
}

/* ─────────────────────────────────────────────────────────────
   Sport categories
───────────────────────────────────────────────────────────── */
const SPORT_CATEGORIES: { label: string; icon: string; keys: string[] }[] = [
  { label: "Football", icon: "🏈", keys: ["NFL", "NCAAF"] },
  {
    label: "Soccer",
    icon: "⚽",
    keys: [
      "EPL",
      "UEFA_CHAMPIONS_LEAGUE",
      "MLS",
      "LA_LIGA",
      "BUNDESLIGA",
      "SERIE_A",
      "LIGUE_1",
    ],
  },
  { label: "Basketball", icon: "🏀", keys: ["NBA", "NCAAB", "WNBA"] },
  { label: "Baseball", icon: "⚾", keys: ["MLB"] },
  { label: "Hockey", icon: "🏒", keys: ["NHL"] },
  { label: "Tennis", icon: "🎾", keys: ["ATP", "WTA"] },
  { label: "MMA", icon: "🥊", keys: ["MMA", "UFC"] },
  { label: "Boxing", icon: "🥋", keys: ["BOXING"] },
  { label: "Golf", icon: "⛳", keys: ["PGA"] },
];

/* ─────────────────────────────────────────────────────────────
   Main Component
───────────────────────────────────────────────────────────── */
export function Sportsbook() {
  const { user, cryptoBalances, refreshUser } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State
  const [selectedSport, setSelectedSport] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("dgc_sportsbook_sport") || "NFL";
    }
    return "NFL";
  });

  const [activeCategory, setActiveCategory] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("dgc_sportsbook_category") || "Football";
    }
    return "Football";
  });

  const [showLiveOnly, setShowLiveOnly] = useState(false);
  const [showTopSports, setShowTopSports] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBet, setSelectedBet] = useState<{
    fixture: Fixture;
    market: Market;
    outcome: Outcome;
    odds: number;
    bookmaker?: string;
  } | null>(null);
  const [betAmount, setBetAmount] = useState<string>("");
  const [selectedCrypto, setSelectedCrypto] = useState<string>("BTC");
  const [showHistory, setShowHistory] = useState(false);
  const [selectedBookmaker, setSelectedBookmaker] = useState<string>("best");
  const [selectedBetDetail, setSelectedBetDetail] = useState<SportsBet | null>(null);

  const toastedBetIds = useRef<Set<number>>(new Set());

  // Persist selections
  useEffect(() => {
    if (selectedSport) {
      localStorage.setItem("dgc_sportsbook_sport", selectedSport);
    }
  }, [selectedSport]);

  useEffect(() => {
    localStorage.setItem("dgc_sportsbook_category", activeCategory);
  }, [activeCategory]);

  useEffect(() => {
    if (cryptoBalances.length > 0) {
      const top = cryptoBalances.reduce((a, b) => (a.usdValue > b.usdValue ? a : b));
      setSelectedCrypto(top.currency.split("_")[0]);
    }
  }, [cryptoBalances]);

  /* ── Data fetching ── */

  const { data: sports = [], isLoading: sportsLoading } = useQuery<Sport[]>({
    queryKey: ["sportsbook-sports"],
    queryFn: async () => {
      const res = await fetch("/api/sportsbook/sports", {
        headers: { Authorization: `Bearer ${localStorage.getItem("dgc_token")}` },
      });
      if (!res.ok) throw new Error("Failed to fetch sports");
      return res.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  // Fetch fixtures
  const {
    data: fixtures = [],
    isLoading: fixturesLoading,
    error: fixturesError,
  } = useQuery<Fixture[]>({
    queryKey: ["sportsbook-odds", selectedSport, showLiveOnly, showTopSports],
    queryFn: async () => {
      if (!selectedSport && !showLiveOnly && !showTopSports) return [];

      // Top Sports: fetch all upcoming games
      if (showTopSports) {
        const res = await fetch("/api/sports/feed", {
          headers: { Authorization: `Bearer ${localStorage.getItem("dgc_token")}` },
        });
        if (!res.ok) throw new Error("Failed to fetch top sports");
        const data = await res.json();
        const allGames: Fixture[] = [];
        for (const category of Object.values(data.feed || {})) {
          if (Array.isArray(category)) {
            allGames.push(...category.filter((g: any) => isGameUpcoming(g)));
          }
        }
        return allGames.sort((a, b) => {
          const aTime = new Date(a.commence_time).getTime();
          const bTime = new Date(b.commence_time).getTime();
          return aTime - bTime;
        });
      }

      // Live view: fetch all live games
      if (showLiveOnly) {
        const res = await fetch("/api/sports/feed", {
          headers: { Authorization: `Bearer ${localStorage.getItem("dgc_token")}` },
        });
        if (!res.ok) throw new Error("Failed to fetch global feed");
        const data = await res.json();
        const allGames: Fixture[] = [];
        for (const category of Object.values(data.feed || {})) {
          if (Array.isArray(category)) {
            allGames.push(...category.filter((g: any) => isGameLive(g)));
          }
        }
        return allGames;
      }

      // Single sport view
      const res = await fetch(
        `/api/sportsbook/odds/${selectedSport}?regions=us&oddsFormat=american`,
        { headers: { Authorization: `Bearer ${localStorage.getItem("dgc_token")}` } }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to fetch odds");
      }
      return res.json();
    },
    enabled: !!(selectedSport || showLiveOnly || showTopSports),
    staleTime: showLiveOnly ? 0 : 1000 * 30,
    refetchInterval: showLiveOnly ? 10_000 : undefined,
    retry: 1,
  });

  // Live SSE
  useEffect(() => {
    if (!selectedSport || showLiveOnly || showTopSports) return;

    const eventSource = new EventSource(`/api/sportsbook/live/${selectedSport}`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "odds_update" && data.fixtures) {
          queryClient.setQueryData(
            ["sportsbook-odds", selectedSport, showLiveOnly, showTopSports],
            data.fixtures
          );
        }
      } catch (error) {
        console.error("[Sportsbook] Error parsing SSE data", error);
      }
    };

    eventSource.onerror = () => {
      console.warn("[Sportsbook] SSE connection lost");
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [selectedSport, showLiveOnly, showTopSports, queryClient]);

  // Search & Filter
  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return fixtures;

    const term = searchTerm.toLowerCase();
    return fixtures.filter((f) => {
      const homeMatch = f.home_team.toLowerCase().includes(term);
      const awayMatch = f.away_team.toLowerCase().includes(term);
      const leagueMatch = f.sport_title.toLowerCase().includes(term);
      const scoreMatch =
        f.liveScore &&
        `${f.liveScore.homeScore}-${f.liveScore.awayScore}`.includes(term);
      return homeMatch || awayMatch || leagueMatch || scoreMatch;
    });
  }, [fixtures, searchTerm]);

  // Bet history
  const { data: betHistory = [], isLoading: historyLoading } = useQuery<SportsBet[]>({
    queryKey: ["sportsbook-history", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const res = await fetch(`/api/sportsbook/bets/${(user as any).id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("dgc_token")}` },
      });
      if (!res.ok) throw new Error("Failed to fetch bet history");
      return res.json();
    },
    enabled: !!(user as any)?.id && showHistory,
  });

  // Settlement polling
  useQuery<SportsBet[]>({
    queryKey: ["sportsbook-pending-results", (user as any)?.id],
    queryFn: async () => {
      if (!(user as any)?.id) return [];
      const res = await fetch(`/api/sportsbook/pending-results/${(user as any).id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("dgc_token")}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!(user as any)?.id,
    refetchInterval: 60_000,
    staleTime: 0,
    select: (data) => {
      for (const bet of data) {
        if (!toastedBetIds.current.has(bet.id) && bet.settledAt) {
          toastedBetIds.current.add(bet.id);
          if (bet.status === "won") {
            toast({
              title: "🏆 You Won!",
              description: `${bet.homeTeam} vs ${bet.awayTeam} settled. Payout: $${parseFloat(bet.potentialPayoutUsd).toFixed(2)}`,
            });
            refreshUser();
          } else if (bet.status === "lost") {
            toast({
              title: "Match Settled",
              description: `${bet.homeTeam} vs ${bet.awayTeam} — Better luck next time!`,
              variant: "destructive",
            });
          }
        }
      }
      return data;
    },
  });

  /* ── Place bet mutation ── */
  const { mutate: placeBet, isPending: isBettingPending } = useMutation({
    mutationFn: async () => {
      if (!selectedBet || !betAmount) throw new Error("Invalid bet");

      const res = await fetch("/api/sportsbook/bet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("dgc_token")}`,
        },
        body: JSON.stringify({
          fixtureId: selectedBet.fixture.id,
          sportKey: selectedBet.fixture.sport_key,
          leagueTitle: selectedBet.fixture.sport_title || "Unknown",
          homeTeam: selectedBet.fixture.home_team,
          awayTeam: selectedBet.fixture.away_team,
          commenceTime: selectedBet.fixture.commence_time,
          marketKey: selectedBet.market.key,
          selectedOutcome: selectedBet.outcome.name,
          odds: selectedBet.odds,
          betAmountUsd: parseFloat(betAmount),
          cryptoType: selectedCrypto,
          bookmakerKey: selectedBet.bookmaker,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to place bet");
      }

      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Bet Placed! 🎯",
        description: `$${parseFloat(betAmount).toFixed(2)} on ${selectedBet?.outcome.name}`,
      });
      setBetAmount("");
      setSelectedBet(null);
      refreshUser();
      queryClient.invalidateQueries({ queryKey: ["sportsbook-history"] });
    },
    onError: (error) => {
      toast({
        title: "Bet Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  /* ── Derived values ── */
  const totalUsdBalance = useMemo(
    () => cryptoBalances.reduce((sum, b) => sum + b.usdValue, 0),
    [cryptoBalances]
  );

  const potentialPayout =
    selectedBet && betAmount && parseFloat(betAmount) > 0
      ? (Math.floor(parseFloat(betAmount) * americanOddsToMultiplier(parseFloat(String(selectedBet.odds))) * 100) / 100).toFixed(2)
      : "0.00";

  /* ── Render ── */
  return (
    <div className="w-full space-y-6 pb-24 md:pb-12">
      {/* Hero Banner */}
      <div className="relative overflow-hidden bg-gradient-to-br from-black/60 to-black/40 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-4 md:p-6 lg:p-10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-all duration-300 hover:border-primary/20 hover:shadow-[0_20px_50px_rgba(255,215,0,0.2)]">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2" />

        <div className="relative z-10 space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/30 shadow-[0_0_30px_rgba(255,215,0,0.15)] group-hover:scale-110 transition-transform duration-500">
              <Trophy className="w-6 h-6 md:w-8 md:h-8 text-primary animate-pulse" />
            </div>
            <div>
              <h1 className="font-display font-black text-3xl md:text-6xl uppercase tracking-[0.15em] text-white leading-none">
                DGC<span className="text-glow-shift-slow drop-shadow-[0_0_15px_rgba(255,215,0,0.5)]">SPORTS</span>
              </h1>
              <div className="flex items-center gap-3 mt-2">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-ping" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-green-400">Live Engine</span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                  Institutional Grade Odds · Instant Settlement
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="w-full space-y-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40 pointer-events-none" />
          <Input
            placeholder="Search matches by team, league, or score..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 bg-white/5 border-white/10 rounded-2xl h-12 font-mono font-black text-lg text-white placeholder:text-muted-foreground/30 focus:border-primary/50 focus:ring-primary/20 transition-all"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* View Toggles */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setShowTopSports(true);
              setShowLiveOnly(false);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
              showTopSports
                ? "bg-primary text-black border border-primary shadow-[0_0_20px_rgba(255,215,0,0.3)]"
                : "bg-white/5 text-muted-foreground border border-white/10 hover:border-primary/40 hover:text-white"
            }`}
          >
            📊 Top Sports
          </button>

          <button
            onClick={() => {
              setShowLiveOnly(true);
              setShowTopSports(false);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
              showLiveOnly
                ? "bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse"
                : "bg-white/5 text-muted-foreground border border-white/10 hover:border-red-500/40 hover:text-white"
            }`}
          >
            <Flame className="w-3 h-3" />
            Live Now
          </button>

          <button
            onClick={() => {
              setShowTopSports(false);
              setShowLiveOnly(false);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
              !showTopSports && !showLiveOnly
                ? "bg-primary text-black border border-primary shadow-[0_0_20px_rgba(255,215,0,0.3)]"
                : "bg-white/5 text-muted-foreground border border-white/10 hover:border-primary/40 hover:text-white"
            }`}
          >
            🏆 By Sport
          </button>

          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
              showHistory
                ? "bg-primary text-black border border-primary shadow-[0_0_20px_rgba(255,215,0,0.3)]"
                : "bg-white/5 text-muted-foreground border border-white/10 hover:border-primary/40 hover:text-white"
            }`}
          >
            <History className="w-3 h-3 inline mr-1" />
            History
          </button>
        </div>
      </div>

      {/* Main Content */}
      {showHistory ? (
        /* Bet History */
        <div className="space-y-4">
          <h2 className="text-lg font-black uppercase tracking-widest">Recent Wagers</h2>

          {historyLoading ? (
            <div className="flex justify-center py-20">
              <Loader className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : betHistory.length === 0 ? (
            <div className="bg-white/5 border border-dashed border-white/10 rounded-3xl py-20 text-center">
              <p className="text-muted-foreground font-mono">No sports bets found in your history.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {betHistory.map((bet) => (
                <button
                  key={bet.id}
                  onClick={() => setSelectedBetDetail(bet)}
                  className={`text-left bg-black/40 border rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all cursor-pointer ${
                    bet.status === "won"
                      ? "border-green-500/30 hover:border-green-500/60 hover:bg-green-500/5"
                      : bet.status === "lost"
                      ? "border-red-500/30 hover:border-red-500/60 hover:bg-red-500/5"
                      : "border-white/5 hover:border-blue-500/60 hover:bg-blue-500/5"
                  }`}
                >
                  <div className="flex-1">
                    <p className="text-sm font-bold text-white">
                      {bet.homeTeam} vs {bet.awayTeam}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {bet.selectedOutcome} @ {formatOdds(parseFloat(bet.odds))}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Wager</p>
                      <p className="text-sm font-bold text-white">${parseFloat(bet.betAmountUsd).toFixed(2)}</p>
                    </div>
                    <Badge
                      className={`uppercase tracking-widest text-[9px] font-black px-2.5 py-1 ${
                        bet.status === "won"
                          ? "bg-gradient-to-r from-green-500 to-emerald-500 text-black shadow-[0_0_15px_rgba(34,197,94,0.3)]"
                          : bet.status === "lost"
                          ? "bg-gradient-to-r from-red-500 to-rose-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.3)]"
                          : "bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-[0_0_15px_rgba(59,130,246,0.3)]"
                      }`}
                    >
                      {bet.status === "pending" ? "⏳ Pending" : bet.status === "won" ? "🏆 Won" : "❌ Lost"}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Games Display */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Sidebar: Sports */}
          {!showTopSports && !showLiveOnly && (
            <aside className="lg:col-span-2 space-y-1">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider px-3 mb-2">
                Popular Sports
              </div>
              {SPORT_CATEGORIES.map((cat) => {
                const count = fixtures.filter((f) => cat.keys.includes(f.sport_key)).length;
                return (
                  <button
                    key={cat.label}
                    onClick={() => {
                      setActiveCategory(cat.label);
                      setSelectedSport(cat.keys[0]);
                      setShowTopSports(false);
                      setShowLiveOnly(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${
                      activeCategory === cat.label && !showTopSports && !showLiveOnly
                        ? "bg-gradient-to-r from-primary/20 to-transparent border-l-4 border-primary text-white font-bold"
                        : "text-gray-400 hover:bg-white/[0.02] hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`w-2 h-2 rounded-full transition-colors ${
                        activeCategory === cat.label && !showTopSports && !showLiveOnly ? "bg-primary" : "bg-gray-600 group-hover:bg-primary"
                      }`} />
                      <span>{cat.icon} {cat.label}</span>
                    </div>
                    {count > 0 && (
                      <span className="text-[10px] font-black bg-primary/10 text-primary px-1.5 py-0.5 rounded-full border border-primary/20 group-hover:bg-primary group-hover:text-black transition-all">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </aside>
          )}

          {/* Main Content */}
          <main className={showTopSports || showLiveOnly ? "lg:col-span-8" : "lg:col-span-7"}>
            {fixturesLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-24 rounded-xl bg-white/5 animate-pulse" />
                ))}
              </div>
            ) : fixturesError ? (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl py-12 text-center">
                <AlertCircle className="w-12 h-12 text-red-500/50 mx-auto mb-3" />
                <p className="text-red-400 font-bold">{(fixturesError as Error).message}</p>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="bg-white/5 border border-white/5 rounded-xl py-12 text-center">
                <p className="text-gray-400">
                  {searchTerm ? "No matches found." : "No games available."}
                </p>
              </div>
            ) : (
              <>
                {/* Bookmaker Selector */}
                {searchResults.length > 0 && (
                  <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center mb-6 p-4 bg-white/5 border border-white/10 rounded-2xl">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Odds Provider</span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setSelectedBookmaker("best")}
                          className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                            selectedBookmaker === "best"
                              ? "bg-primary text-black shadow-[0_0_20px_rgba(255,215,0,0.3)]"
                              : "bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10"
                          }`}
                        >
                          🔥 Best Odds
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex-1 w-full flex flex-col gap-1">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Specific Bookmaker</span>
                      <div className="relative">
                        <select
                          value={selectedBookmaker}
                          onChange={(e) => setSelectedBookmaker(e.target.value)}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider text-white focus:outline-none focus:border-primary/60 appearance-none cursor-pointer hover:bg-black/60 transition-all"
                        >
                          <option value="best">Select a bookmaker (82+ available)</option>
                          {Array.from(
                            new Set(
                              fixtures
                                .flatMap((g) => g.bookmakers.map((b) => b.key))
                                .filter(Boolean)
                            )
                          )
                            .sort()
                            .map((bookmakerKey) => (
                              <option key={bookmakerKey} value={bookmakerKey}>
                                🏦 {bookmakerKey.replace(/_/g, " ")}
                              </option>
                            ))}
                        </select>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                          <Search className="w-3 h-3" />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <div className="space-y-3">
                  {searchResults.slice(0, 50).map((game) => {
                  // Get best odds across all bookmakers
                  const getBestOdds = (marketKey: string, outcomeName: string) => {
                    let bestOdds = -Infinity;
                    let bestBookmaker = null;
                    for (const bm of game.bookmakers) {
                      const market = bm.markets.find((m) => m.key === marketKey);
                      const outcome = market?.outcomes.find((o) => o.name === outcomeName);
                      if (outcome && outcome.price > bestOdds) {
                        bestOdds = outcome.price;
                        bestBookmaker = bm.key;
                      }
                    }
                    return { odds: bestOdds === -Infinity ? null : bestOdds, bookmaker: bestBookmaker };
                  };

                  // Use selected bookmaker or find best odds
                  let activeBookmakers = game.bookmakers;
                  if (selectedBookmaker !== "best") {
                    activeBookmakers = game.bookmakers.filter((b) => b.key === selectedBookmaker);
                  }

                  // If "Best Odds" is selected, we want to show the best odds for each market
                  // Otherwise, we show the odds for the selected bookmaker
                  const getMarket = (key: string) => {
                    if (selectedBookmaker === "best") {
                      const best = getBestOdds(key, ""); // This is a bit simplified, we'll refine below
                      // Find a bookmaker that has this market
                      for (const bm of game.bookmakers) {
                        const m = bm.markets.find((mk) => mk.key === key);
                        if (m) {
                          // Create a synthetic market with best odds for each outcome
                          return {
                            key,
                            outcomes: m.outcomes.map((o) => {
                              const bestO = getBestOdds(key, o.name);
                              return { ...o, price: bestO.odds || o.price, bookmaker: bestO.bookmaker };
                            })
                          };
                        }
                      }
                      return null;
                    }
                    return activeBookmakers[0]?.markets.find((m) => m.key === key);
                  };

                  const h2hMarket = getMarket("h2h");
                  const spreadsMarket = getMarket("spreads");
                  const totalsMarket = getMarket("totals");

                  if (!h2hMarket) return null;

                  return (
                    <div
                      key={game.id}
                      className="bg-black/40 border border-white/5 hover:border-white/10 rounded-xl transition-all p-4"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                        {/* Teams & Scores */}
                        <div className="col-span-1 md:col-span-5 space-y-2">
                          <div className="flex items-center gap-2">
                            {isGameLive(game) && (
                              <span className="bg-red-500/10 text-red-400 text-[10px] font-black uppercase px-1.5 py-0.5 rounded border border-red-500/20 animate-pulse">
                                Live
                              </span>
                            )}
                            <span className="text-xs font-mono text-gray-400">
                              {game.liveScore?.period || formatCommenceTime(game.commence_time, true)}
                            </span>
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-white text-sm">{game.home_team}</span>
                              <span className="font-mono font-bold text-primary text-sm">
                                {game.liveScore?.homeScore ?? "-"}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-white text-sm">{game.away_team}</span>
                              <span className="font-mono font-bold text-primary text-sm">
                                {game.liveScore?.awayScore ?? "-"}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Spreads */}
                        <div className="col-span-1 md:col-span-2 grid grid-cols-2 md:grid-cols-1 gap-1">
                          {spreadsMarket?.outcomes.slice(0, 2).map((outcome) => (
                            <button
                              key={outcome.name}
                              onClick={() =>
                                setSelectedBet({
                                  fixture: game,
                                  market: spreadsMarket,
                                  outcome,
                                  odds: outcome.price,
                                  bookmaker: (outcome as any).bookmaker || activeBookmakers[0]?.key,
                                })
                              }
                              className={`p-2 rounded-lg text-center transition-all ${
                                selectedBet?.fixture.id === game.id &&
                                selectedBet?.outcome.name === outcome.name &&
                                selectedBet?.market.key === spreadsMarket.key
                                  ? "bg-primary/40 border-primary/60 border-2 shadow-[0_0_15px_rgba(255,215,0,0.3)]"
                                  : "bg-white/5 hover:bg-white/10 border border-white/10"
                              }`}
                            >
                              <div className="text-[11px] text-gray-400">
                                {outcome.point ? (outcome.point > 0 ? "+" : "") + outcome.point : "-"}
                              </div>
                              <div className="text-xs font-mono font-bold text-white">
                                {formatOdds(outcome.price)}
                              </div>
                            </button>
                          ))}
                        </div>

                        {/* Totals */}
                        <div className="col-span-1 md:col-span-2 grid grid-cols-2 md:grid-cols-1 gap-1">
                          {totalsMarket?.outcomes.slice(0, 2).map((outcome) => (
                            <button
                              key={outcome.name}
                              onClick={() =>
                                setSelectedBet({
                                  fixture: game,
                                  market: totalsMarket,
                                  outcome,
                                  odds: outcome.price,
                                  bookmaker: (outcome as any).bookmaker || activeBookmakers[0]?.key,
                                })
                              }
                              className={`p-2 rounded-lg text-center transition-all ${
                                selectedBet?.fixture.id === game.id &&
                                selectedBet?.outcome.name === outcome.name &&
                                selectedBet?.market.key === totalsMarket.key
                                  ? "bg-primary/40 border-primary/60 border-2 shadow-[0_0_15px_rgba(255,215,0,0.3)]"
                                  : "bg-white/5 hover:bg-white/10 border border-white/10"
                              }`}
                            >
                              <div className="text-[11px] text-gray-400">
                                {outcome.name} {outcome.point}
                              </div>
                              <div className="text-xs font-mono font-bold text-white">
                                {formatOdds(outcome.price)}
                              </div>
                            </button>
                          ))}
                        </div>

                        {/* Moneyline */}
                        <div className="col-span-1 md:col-span-2 grid grid-cols-2 md:grid-cols-1 gap-1">
                          {h2hMarket.outcomes.slice(0, 2).map((outcome) => (
                            <button
                              key={outcome.name}
                              onClick={() =>
                                setSelectedBet({
                                  fixture: game,
                                  market: h2hMarket,
                                  outcome,
                                  odds: outcome.price,
                                  bookmaker: (outcome as any).bookmaker || activeBookmakers[0]?.key,
                                })
                              }
                              className={`p-2 rounded-lg text-center transition-all ${
                                selectedBet?.fixture.id === game.id &&
                                selectedBet?.outcome.name === outcome.name &&
                                selectedBet?.market.key === h2hMarket.key
                                  ? "bg-primary/40 border-primary/60 border-2 shadow-[0_0_15px_rgba(255,215,0,0.3)]"
                                  : "bg-white/5 hover:bg-white/10 border border-white/10"
                              }`}
                            >
                              <div className="text-xs font-mono font-bold text-white">
                                {formatOdds(outcome.price)}
                              </div>
                            </button>
                          ))}
                        </div>

                        {/* Deeplink */}
                        <div className="col-span-1 md:col-span-1 flex items-center justify-end">
                          {game.bookmakers[0]?.deeplinks &&
                            Object.values(game.bookmakers[0].deeplinks)[0] && (
                              <a
                                href={Object.values(game.bookmakers[0].deeplinks)[0]}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-all"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              </>
            )}
          </main>

          {/* Right Sidebar: Bet Slip */}
          <aside className="lg:col-span-3">
            <div className="sticky top-6 bg-black/40 border border-white/5 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-black uppercase tracking-widest text-sm">Bet Slip</h3>
                <div className="text-right">
                  <p className="text-xs text-gray-500">Balance</p>
                  <p className="text-lg font-black text-primary">
                    ${totalUsdBalance.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
              </div>

              {selectedBet ? (
                <>
                  <div className="space-y-3 pb-4 border-b border-white/5">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Match</p>
                      <p className="text-sm font-bold text-white">
                        {selectedBet.fixture.home_team} vs {selectedBet.fixture.away_team}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Selection</p>
                      <p className="text-sm font-bold text-primary">
                        {selectedBet.outcome.name} @ {formatOdds(selectedBet.odds)}
                      </p>
                      {selectedBet.bookmaker && (
                        <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-tighter">
                          Via {selectedBet.bookmaker.replace(/_/g, " ")}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-2 block">Amount (USD)</label>
                      <Input
                        type="number"
                        value={betAmount}
                        onChange={(e) => setBetAmount(e.target.value)}
                        placeholder="0.00"
                        className="bg-white/5 border-white/10 text-white"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-gray-500 mb-2 block">Crypto</label>
                      <div className="flex gap-2 flex-wrap">
                        {cryptoBalances.map((bal) => {
                          const cryptoSymbol = bal.currency.split("_")[0];
                          return (
                            <button
                              key={bal.currency}
                              onClick={() => setSelectedCrypto(cryptoSymbol)}
                              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                                selectedCrypto === cryptoSymbol
                                  ? "bg-primary/40 border-primary/60 border text-primary shadow-[0_0_10px_rgba(255,215,0,0.2)]"
                                  : "bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:border-white/20"
                              }`}
                            >
                              <CoinIcon currency={bal.currency} size={14} />
                              <span>{cryptoSymbol}</span>
                              <span className="text-xs text-gray-500">${bal.usdValue.toFixed(2)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="bg-white/5 rounded-lg p-3 space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Potential Payout:</span>
                        <span className="text-primary font-bold">${potentialPayout}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Multiplier:</span>
                        <span className="text-primary font-bold">
                          {americanOddsToMultiplier(selectedBet.odds).toFixed(2)}x
                        </span>
                      </div>
                    </div>

                    <Button
                      onClick={() => placeBet()}
                      disabled={isBettingPending || !betAmount || parseFloat(betAmount) <= 0}
                      className="w-full bg-primary hover:bg-primary/90 text-black font-black uppercase tracking-widest"
                    >
                      {isBettingPending ? "Placing..." : "Place Bet"}
                    </Button>

                    <Button
                      onClick={() => setSelectedBet(null)}
                      variant="outline"
                      className="w-full border-white/10"
                    >
                      Clear
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p className="text-sm">Select a match and outcome to place a bet</p>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Bet Detail Modal */}
      {selectedBetDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className={`bg-black/60 border rounded-2xl p-8 w-full max-w-md shadow-2xl space-y-6 ${
            selectedBetDetail.status === "won"
              ? "border-green-500/40 shadow-green-500/20"
              : selectedBetDetail.status === "lost"
              ? "border-red-500/40 shadow-red-500/20"
              : "border-blue-500/40 shadow-blue-500/20"
          }`}>
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">Bet Details</p>
                <h2 className="text-xl font-black text-white mt-1">{selectedBetDetail.homeTeam} vs {selectedBetDetail.awayTeam}</h2>
              </div>
              <button
                onClick={() => setSelectedBetDetail(null)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Status */}
            <div className="flex items-center gap-2">
              <Badge
                className={`uppercase tracking-widest text-sm font-black px-3 py-1.5 ${
                  selectedBetDetail.status === "won"
                    ? "bg-gradient-to-r from-green-500 to-emerald-500 text-black shadow-[0_0_20px_rgba(34,197,94,0.4)]"
                    : selectedBetDetail.status === "lost"
                    ? "bg-gradient-to-r from-red-500 to-rose-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)]"
                    : "bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-[0_0_20px_rgba(59,130,246,0.4)]"
                }`}
              >
                {selectedBetDetail.status === "pending" ? "⏳ Pending" : selectedBetDetail.status === "won" ? "🏆 Won" : "❌ Lost"}
              </Badge>
            </div>

            {/* Bet Info */}
            <div className="space-y-3 bg-white/5 rounded-lg p-4">
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Selection</span>
                <span className="text-white font-bold">{selectedBetDetail.selectedOutcome}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Odds</span>
                <span className="text-primary font-bold font-mono">{formatOdds(parseFloat(selectedBetDetail.odds))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Wager</span>
                <span className="text-white font-bold">${parseFloat(selectedBetDetail.betAmountUsd).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Potential Payout</span>
                <span className="text-primary font-bold">${parseFloat(selectedBetDetail.potentialPayoutUsd).toFixed(2)}</span>
              </div>
              {selectedBetDetail.status !== "pending" && (
                <div className="flex justify-between pt-2 border-t border-white/10">
                  <span className="text-gray-400 text-sm">Settled</span>
                  <span className="text-white font-bold">{new Date(selectedBetDetail.settledAt || "").toLocaleDateString()}</span>
                </div>
              )}
            </div>

            {/* Close Button */}
            <Button
              onClick={() => setSelectedBetDetail(null)}
              className="w-full bg-primary hover:bg-primary/90 text-black font-black uppercase"
            >
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
