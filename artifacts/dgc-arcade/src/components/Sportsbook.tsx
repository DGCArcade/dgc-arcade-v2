"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import {
  Zap,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Loader,
  AlertCircle,
  DollarSign,
  Trophy,
  Coins,
  History,
  CheckCircle2,
  XCircle,
  Clock,
  PartyPopper,
  ExternalLink,
  Flame,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

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

interface AltLine {
  odds: number;
  spread?: number;
  overUnder?: number;
}

interface Outcome {
  name: string;
  price: number;
  point?: number;
  altLines?: AltLine[];
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
  const now = new Date();
  const commenceTime = new Date(fixture.commence_time);
  const timeDiff = (now.getTime() - commenceTime.getTime()) / (1000 * 60);
  // Live if started within last 3 hours and not completed
  return timeDiff >= 0 && timeDiff < 180 && !fixture.completed;
}

/* ─────────────────────────────────────────────────────────────
   Sport category tabs
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
  const [activeMarket, setActiveMarket] = useState<"main" | "props" | "alt">("main");
  const [selectedBet, setSelectedBet] = useState<{
    fixture: Fixture;
    market: Market;
    outcome: Outcome;
    odds: number;
  } | null>(null);
  const [betAmount, setBetAmount] = useState<string>("");
  const [selectedCrypto, setSelectedCrypto] = useState<string>("BTC");
  const [showHistory, setShowHistory] = useState(false);

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

  // Fetch fixtures for selected sport OR all sports if live view
  const {
    data: fixtures = [],
    isLoading: fixturesLoading,
    error: fixturesError,
  } = useQuery<Fixture[]>({
    queryKey: ["sportsbook-odds", selectedSport, showLiveOnly],
    queryFn: async () => {
      if (!selectedSport && !showLiveOnly) return [];

      // If live view, fetch from global feed
      if (showLiveOnly) {
        const res = await fetch("/api/sports/feed", {
          headers: { Authorization: `Bearer ${localStorage.getItem("dgc_token")}` },
        });
        if (!res.ok) throw new Error("Failed to fetch global feed");
        const data = await res.json();
        // Flatten all categories and filter for live games only
        const allGames: Fixture[] = [];
        for (const category of Object.values(data.feed || {})) {
          if (Array.isArray(category)) {
            allGames.push(...category.filter((g: any) => isGameLive(g)));
          }
        }
        return allGames;
      }

      // Otherwise fetch for selected sport
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
    enabled: !!(selectedSport || showLiveOnly),
    staleTime: showLiveOnly ? 0 : 1000 * 30,
    refetchInterval: showLiveOnly ? 10_000 : undefined,
    retry: 1,
  });

  // Live SSE
  useEffect(() => {
    if (!selectedSport || showLiveOnly) return;

    const eventSource = new EventSource(`/api/sportsbook/live/${selectedSport}`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "odds_update" && data.fixtures) {
          queryClient.setQueryData(["sportsbook-odds", selectedSport, showLiveOnly], data.fixtures);
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
  }, [selectedSport, showLiveOnly, queryClient]);

  // Filter for live games only
  const filteredFixtures = useMemo(() => {
    if (!showLiveOnly) return fixtures;
    return fixtures.filter((f) => isGameLive(f));
  }, [fixtures, showLiveOnly]);

  // Group fixtures by sport for live view
  const groupedByCategory = useMemo(() => {
    if (!showLiveOnly) return {};
    const grouped: Record<string, Fixture[]> = {};
    for (const cat of SPORT_CATEGORIES) {
      grouped[cat.label] = filteredFixtures.filter((f) =>
        cat.keys.includes(f.sport_key)
      );
    }
    return grouped;
  }, [filteredFixtures, showLiveOnly]);

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
      ? (parseFloat(betAmount) * americanOddsToMultiplier(parseFloat(String(selectedBet.odds)))).toFixed(2)
      : "0.00";

  /* ── Render ── */
  return (
    <div className="min-h-screen bg-[#0d0e12] text-[#f5f6f9] font-sans antialiased selection:bg-emerald-500 selection:text-black">
      {/* Hero Banner */}
      <div className="relative overflow-hidden bg-gradient-to-r from-emerald-600/20 to-purple-600/10 border-b border-white/5 px-6 py-8 mb-6 rounded-2xl mx-4 mt-4">
        <div className="relative z-10 max-w-2xl">
          <span className="bg-emerald-500/10 text-emerald-400 text-xs font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border border-emerald-500/20">
            Live Streaming & Betting
          </span>
          <h1 className="text-3xl font-black tracking-tight mt-3 text-white uppercase sm:text-4xl">
            DGC <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
              Arcade Sports
            </span>
          </h1>
          <p className="mt-2 text-sm text-gray-400 max-w-md">
            Sub-minute odds updates, real-time live scores, and instant settlement.
          </p>
        </div>
        <div className="absolute right-0 bottom-0 top-0 w-1/3 bg-[radial-gradient(circle_at_bottom_right,_var(--tw-gradient-stops))] from-emerald-500/10 via-transparent to-transparent hidden md:block" />
      </div>

      {/* Main 3-Column Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 px-4 pb-12">
        {/* LEFT SIDEBAR: Sports Navigation */}
        <aside className="xl:col-span-2 space-y-1">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider px-3 mb-2">
            {showLiveOnly ? "🔴 LIVE NOW" : "Popular Sports"}
          </div>

          {!showLiveOnly && (
            <>
              {SPORT_CATEGORIES.map((cat) => (
                <button
                  key={cat.label}
                  onClick={() => {
                    setActiveCategory(cat.label);
                    setSelectedSport(cat.keys[0]);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${
                    activeCategory === cat.label
                      ? "bg-gradient-to-r from-emerald-500/10 to-transparent border-l-4 border-emerald-500 text-white font-bold"
                      : "text-gray-400 hover:bg-white/[0.02] hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-gray-600 group-hover:bg-emerald-400 transition-colors" />
                    <span>{cat.icon} {cat.label}</span>
                  </div>
                  <span className="text-xs bg-white/5 text-gray-500 px-1.5 py-0.5 rounded group-hover:text-emerald-400">
                    {fixtures.filter((f) => cat.keys.includes(f.sport_key)).length}
                  </span>
                </button>
              ))}
            </>
          )}

          {showLiveOnly && (
            <>
              {SPORT_CATEGORIES.map((cat) => {
                const count = (groupedByCategory[cat.label] || []).length;
                if (count === 0) return null;
                return (
                  <button
                    key={cat.label}
                    onClick={() => {
                      setShowLiveOnly(false);
                      setActiveCategory(cat.label);
                      setSelectedSport(cat.keys[0]);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all bg-gradient-to-r from-red-500/10 to-transparent border-l-4 border-red-500 text-white font-bold"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span>{cat.icon} {cat.label}</span>
                    </div>
                    <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">
                      {count}
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </aside>

        {/* CENTER: Main Match Display */}
        <main className="xl:col-span-7 space-y-4">
          {/* Live Toggle & Market Tabs */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#14161d] p-3 rounded-xl border border-white/5">
            <button
              onClick={() => setShowLiveOnly(!showLiveOnly)}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
                showLiveOnly
                  ? "bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse"
                  : "bg-white/5 text-gray-400 hover:text-white border border-white/10"
              }`}
            >
              <Flame className="w-4 h-4" />
              {showLiveOnly ? "Live View Active" : "View All Live"}
            </button>

            {!showLiveOnly && (
              <div className="flex gap-1">
                {(["main", "props", "alt"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveMarket(tab)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                      activeMarket === tab
                        ? "bg-[#1e222d] text-white shadow-sm shadow-black/40"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    {tab === "main" ? "Main" : tab === "props" ? "Props" : "Alt"}
                  </button>
                ))}
              </div>
            )}

            <span className="text-xs text-emerald-400 bg-emerald-500/5 px-2 py-1 rounded border border-emerald-500/10 animate-pulse font-mono">
              ● Live Feed
            </span>
          </div>

          {/* Column Headers */}
          <div className="hidden md:grid grid-cols-12 gap-2 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider">
            <div className="col-span-5">Event / Matchup</div>
            <div className="col-span-2 text-center">Spread</div>
            <div className="col-span-2 text-center">Total</div>
            <div className="col-span-2 text-center">Moneyline</div>
            <div className="col-span-1"></div>
          </div>

          {/* Games Display */}
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
          ) : filteredFixtures.length === 0 ? (
            <div className="bg-white/5 border border-white/5 rounded-xl py-12 text-center">
              <p className="text-gray-400">
                {showLiveOnly ? "No live games right now." : "No fixtures available."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredFixtures.map((game) => {
                const h2hMarket = game.bookmakers[0]?.markets.find((m) => m.key === "h2h");
                const spreadsMarket = game.bookmakers[0]?.markets.find((m) => m.key === "spreads");
                const totalsMarket = game.bookmakers[0]?.markets.find((m) => m.key === "totals");

                if (!h2hMarket) return null;

                return (
                  <div
                    key={game.id}
                    className="bg-[#14161d] border border-white/5 hover:border-white/10 rounded-xl transition-all p-4"
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
                            {game.liveScore?.period || formatCommenceTime(game.commence_time)}
                          </span>
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-white text-sm">{game.home_team}</span>
                            <span className="font-mono font-bold text-emerald-400 text-sm">
                              {game.liveScore?.homeScore ?? "-"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-white text-sm">{game.away_team}</span>
                            <span className="font-mono font-bold text-emerald-400 text-sm">
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
                              })
                            }
                            className="bg-[#1a1d26] hover:bg-[#222733] border border-white/[0.03] p-2 rounded-lg text-center transition-colors"
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
                              })
                            }
                            className="bg-[#1a1d26] hover:bg-[#222733] border border-white/[0.03] p-2 rounded-lg text-center transition-colors"
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
                              })
                            }
                            className="bg-[#1a1d26] hover:bg-[#222733] border border-white/[0.03] p-2 rounded-lg text-center transition-colors"
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
                              className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-all"
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
          )}
        </main>

        {/* RIGHT SIDEBAR: Bet Slip */}
        <aside className="xl:col-span-3">
          <div className="sticky top-6 bg-[#14161d] border border-white/5 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black uppercase tracking-widest text-sm">Bet Slip</h3>
              <div className="text-right">
                <p className="text-xs text-gray-500">Vault</p>
                <p className="text-lg font-black text-emerald-400">
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
                    <p className="text-sm font-bold text-emerald-400">
                      {selectedBet.outcome.name} @ {formatOdds(selectedBet.odds)}
                    </p>
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
                    <select
                      value={selectedCrypto}
                      onChange={(e) => setSelectedCrypto(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
                    >
                      {cryptoBalances.map((bal) => (
                        <option key={bal.currency} value={bal.currency.split("_")[0]}>
                          {bal.currency.split("_")[0]} (${bal.usdValue.toFixed(2)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="bg-white/5 rounded-lg p-3 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Potential Payout:</span>
                      <span className="text-emerald-400 font-bold">${potentialPayout}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Multiplier:</span>
                      <span className="text-emerald-400 font-bold">
                        {americanOddsToMultiplier(selectedBet.odds).toFixed(2)}x
                      </span>
                    </div>
                  </div>

                  <Button
                    onClick={() => placeBet()}
                    disabled={isBettingPending || !betAmount || parseFloat(betAmount) <= 0}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-black font-black uppercase tracking-widest"
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
    </div>
  );
}
