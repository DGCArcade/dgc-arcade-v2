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

/**
 * Correct American odds → payout multiplier.
 * +150 → 2.5×   |   -110 → 1.909×
 */
function americanOddsToMultiplier(americanOdds: number): number {
  if (americanOdds > 0) return americanOdds / 100 + 1;
  return 100 / Math.abs(americanOdds) + 1;
}

function formatOdds(price: number): string {
  return price > 0 ? `+${price}` : `${price}`;
}

/**
 * Returns the user's browser IANA timezone string (e.g. "America/New_York").
 * Falls back to "UTC" if the Intl API is unavailable.
 */
function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Format a UTC ISO commence_time string into the user's local timezone.
 */
function formatCommenceTime(isoString: string): string {
  const tz = getUserTimezone();
  try {
    return new Date(isoString).toLocaleString(undefined, {
      timeZone: tz,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return new Date(isoString).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
}

/* ─────────────────────────────────────────────────────────────
   Sport category tabs — mapped to SportsGameOdds leagueIDs
───────────────────────────────────────────────────────────── */
const SPORT_CATEGORIES: { label: string; icon: string; keys: string[] }[] = [
  {
    label: "Football",
    icon: "🏈",
    keys: ["NFL", "NCAAF"],
  },
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
      "EREDIVISIE",
      "PRIMEIRA_LIGA",
      "SCOTTISH_PREMIERSHIP",
    ],
  },
  {
    label: "Basketball",
    icon: "🏀",
    keys: ["NBA", "NCAAB", "WNBA", "EUROLEAGUE"],
  },
  {
    label: "Baseball",
    icon: "⚾",
    keys: ["MLB", "NPB", "KBO"],
  },
  {
    label: "Hockey",
    icon: "🏒",
    keys: ["NHL", "SHL"],
  },
  {
    label: "Tennis",
    icon: "🎾",
    keys: ["ATP", "WTA", "GRAND_SLAMS"],
  },
  {
    label: "MMA / UFC",
    icon: "🥊",
    keys: ["MMA", "UFC"],
  },
  {
    label: "Boxing",
    icon: "🥋",
    keys: ["BOXING"],
  },
  {
    label: "Golf",
    icon: "⛳",
    keys: ["PGA", "EUROPEAN_TOUR", "LPGA"],
  },
  {
    label: "Cricket",
    icon: "🏏",
    keys: ["IPL", "BIG_BASH", "TEST", "ODI", "T20I"],
  },
];

/* ─────────────────────────────────────────────────────────────
   Main Component
───────────────────────────────────────────────────────────── */
export function Sportsbook() {
  const { user, cryptoBalances, refreshUser } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Initialize from localStorage, default to Football/NFL
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
  const [selectedBet, setSelectedBet] = useState<{
    fixture: Fixture;
    market: Market;
    outcome: Outcome;
    odds: number;
  } | null>(null);
  const [betAmount, setBetAmount] = useState<string>("");
  const [selectedCrypto, setSelectedCrypto] = useState<string>("BTC");
  const [showHistory, setShowHistory] = useState(false);

  // Track which settled bet IDs have already been toasted
  const toastedBetIds = useRef<Set<number>>(new Set());

  // Persist sport selection to localStorage
  useEffect(() => {
    if (selectedSport) {
      localStorage.setItem("dgc_sportsbook_sport", selectedSport);
    }
  }, [selectedSport]);

  useEffect(() => {
    localStorage.setItem("dgc_sportsbook_category", activeCategory);
  }, [activeCategory]);

  // Auto-select top crypto holding
  useEffect(() => {
    if (cryptoBalances.length > 0) {
      const top = cryptoBalances.reduce((a, b) => (a.usdValue > b.usdValue ? a : b));
      setSelectedCrypto(top.currency.split("_")[0]);
    }
  }, [cryptoBalances]);

  /* ── Data fetching ── */

  // All available sports
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

  // Live odds for selected sport key
  const {
    data: fixtures = [],
    isLoading: fixturesLoading,
    error: fixturesError,
  } = useQuery<Fixture[]>({
    queryKey: ["sportsbook-odds", selectedSport],
    queryFn: async () => {
      if (!selectedSport) return [];
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
    enabled: !!selectedSport,
    staleTime: showLiveOnly ? 0 : 1000 * 30,
    refetchInterval: showLiveOnly ? 10_000 : undefined,
    retry: 1,
  });

  // Live SSE connection for real-time score updates
  useEffect(() => {
    if (!selectedSport) return;

    const eventSource = new EventSource(`/api/sportsbook/live/${selectedSport}`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "odds_update" && data.fixtures) {
          queryClient.setQueryData(["sportsbook-odds", selectedSport], data.fixtures);
        }
      } catch (error) {
        console.error("[Sportsbook] Error parsing SSE data", error);
      }
    };

    eventSource.onerror = () => {
      console.warn("[Sportsbook] SSE connection lost, reconnecting...");
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [selectedSport, queryClient]);

  // Filter fixtures: live only if toggle is active
  const filteredFixtures = useMemo(() => {
    if (!showLiveOnly) return fixtures;
    const now = new Date();
    return fixtures.filter((f) => {
      const commenceTime = new Date(f.commence_time);
      // Show games that started within last 3 hours or start within next 1 hour
      const timeDiff = (now.getTime() - commenceTime.getTime()) / (1000 * 60);
      return timeDiff > -60 && timeDiff < 180; // -60 min to +180 min
    });
  }, [fixtures, showLiveOnly]);

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

  // Post-match settlement polling: check for newly settled bets every 60 seconds
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
      // Fire Win/Loss toasts for newly settled bets
      for (const bet of data) {
        if (!toastedBetIds.current.has(bet.id) && bet.settledAt) {
          toastedBetIds.current.add(bet.id);
          if (bet.status === "won") {
            toast({
              title: "🏆 You Won!",
              description: `${bet.homeTeam} vs ${bet.awayTeam} — ${bet.selectedOutcome} settled. Payout: $${parseFloat(bet.potentialPayoutUsd).toFixed(2)} credited to your vault.`,
            });
            // Refresh balance immediately
            refreshUser();
          } else if (bet.status === "lost") {
            toast({
              title: "Match Settled",
              description: `${bet.homeTeam} vs ${bet.awayTeam} — ${bet.selectedOutcome} did not win. Better luck next time!`,
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
    onSuccess: (data) => {
      toast({
        title: "Bet Placed! 🎯",
        description: `$${parseFloat(betAmount).toFixed(2)} on ${selectedBet?.outcome.name}. Potential payout: $${potentialPayout}`,
      });
      setBetAmount("");
      setSelectedBet(null);
      // Immediately refresh the user's balance after deduction
      refreshUser();
      // Invalidate bet history
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

  // Correct American odds payout calculation
  const potentialPayout =
    selectedBet && betAmount && parseFloat(betAmount) > 0
      ? (parseFloat(betAmount) * americanOddsToMultiplier(parseFloat(String(selectedBet.odds)))).toFixed(2)
      : "0.00";

  /* ── Render ── */
  return (
    <div className="w-full space-y-6 pb-24 md:pb-12">
      {/* ── Live In-Play Toggle ── */}
      <div className="w-full flex items-center justify-center">
        <button
          onClick={() => setShowLiveOnly(!showLiveOnly)}
          className={`px-6 py-3 rounded-full font-black uppercase tracking-[0.15em] text-[11px] transition-all duration-300 border-2 flex items-center gap-2 ${
            showLiveOnly
              ? "bg-red-500 text-white border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.5)]"
              : "bg-white/5 text-muted-foreground border-white/10 hover:border-primary/40 hover:text-foreground"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              showLiveOnly ? "bg-white animate-pulse" : "bg-muted-foreground/30"
            }`}
          />
          🔴 LIVE IN-PLAY
        </button>
      </div>

      {/* ── Header ── */}
      <div className="relative w-full overflow-hidden group flex flex-col lg:flex-row lg:items-center justify-between gap-4 md:gap-6 bg-black/30 backdrop-blur-xl border border-white/5 rounded-[2.5rem] p-4 md:p-6 lg:p-10 shadow-[0_20px_50px_rgba(0,0,0,0.3)] transition-all duration-300 hover:border-amber-400/30 hover:shadow-[0_0_20px_rgba(255,215,0,0.1)]">
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

        <div className="relative z-10 w-full lg:w-auto flex flex-wrap items-center gap-2 md:gap-4">
          <Button
            variant="outline"
            size="lg"
            onClick={() => setShowHistory(!showHistory)}
            className={`rounded-2xl border-white/10 h-10 md:h-12 lg:h-14 px-4 md:px-6 lg:px-8 font-black uppercase tracking-[0.2em] text-[10px] md:text-xs transition-all duration-300 hover:scale-105 ${
              showHistory
                ? "bg-primary text-black border-primary shadow-[0_0_30px_rgba(255,215,0,0.3)] scale-105"
                : "bg-white/5 hover:bg-white/10 hover:border-primary/40 hover:scale-[1.02]"
            }`}
          >
            <History className="w-4 h-4 mr-3" />
            {showHistory ? "Lobby" : "History"}
          </Button>

          <div className="flex items-center gap-4 bg-black/30 backdrop-blur-xl border border-white/5 px-6 py-3 rounded-2xl h-14 shadow-[0_0_20px_rgba(255,215,0,0.1)] hover:border-amber-400/20 transition-all">
            <div className="flex flex-col items-end leading-none">
              <span className="text-[9px] font-black uppercase tracking-widest text-amber-400/60 mb-1">Vault Value</span>
              <span className="text-lg font-black font-mono text-white tracking-tighter">
                <span className="text-amber-400 mr-1">$</span>
                {totalUsdBalance.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
            <div className="w-px h-8 bg-white/5 mx-1" />
            <div className="p-2 rounded-xl bg-amber-400/10 shadow-[0_0_15px_rgba(255,215,0,0.1)]">
              <Coins className="w-5 h-5 text-amber-400" />
            </div>
          </div>
        </div>
      </div>

      {showHistory ? (
        /* ── Bet History ── */
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-lg font-black uppercase tracking-widest flex items-center gap-2">
              <History className="w-5 h-5 text-primary" /> Recent Wagers
            </h2>
          </div>

          {historyLoading ? (
            <div className="flex justify-center py-20">
              <Loader className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : betHistory.length === 0 ? (
            <div className="bg-white/5 border border-dashed border-white/10 rounded-3xl py-20 text-center space-y-3">
              <AlertCircle className="w-12 h-12 text-muted-foreground/20 mx-auto" />
              <p className="text-muted-foreground font-mono text-sm">No sports bets found in your history.</p>
              <Button
                variant="link"
                onClick={() => setShowHistory(false)}
                className="text-primary font-bold uppercase tracking-widest text-xs"
              >
                Start Betting Now
              </Button>
            </div>
          ) : (
            <div className="grid gap-3">
              {betHistory.map((bet) => (
                <div
                  key={bet.id}
                  className="bg-black/40 border border-white/5 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-white/10 transition-all"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">
                      {bet.homeTeam} vs {bet.awayTeam}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {bet.selectedOutcome} @ {formatOdds(parseFloat(bet.odds))}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(bet.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Wager</p>
                      <p className="text-sm font-bold text-white">${parseFloat(bet.betAmountUsd).toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Potential</p>
                      <p className="text-sm font-bold text-primary">
                        ${parseFloat(bet.potentialPayoutUsd).toFixed(2)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => window.open(`/bet/${bet.id}`, "_blank")}
                      className="text-primary hover:text-primary/80"
                    >
                      📊 Track
                    </Button>
                    <div className="w-24 text-right">
                      <Badge
                        className={`uppercase tracking-widest text-[9px] font-black px-2.5 py-1 ${
                          bet.status === "won"
                            ? "bg-green-500 text-black"
                            : bet.status === "lost"
                            ? "bg-red-500 text-white"
                            : "bg-blue-600 text-white"
                        }`}
                      >
                        {bet.status}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ── Betting Lobby ── */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Main Feed */}
          <div className="lg:col-span-8 space-y-6 pb-[600px] lg:pb-0">
            {/* Category tabs: Football / Basketball / UFC / Tennis */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {SPORT_CATEGORIES.map((cat) => (
                <button
                  key={cat.label}
                  onClick={() => {
                    setActiveCategory(cat.label);
                    setSelectedSport(cat.keys[0]);
                  }}
                  className={`px-5 py-3 rounded-2xl border font-black uppercase tracking-[0.15em] text-[11px] transition-all duration-300 whitespace-nowrap shrink-0 flex items-center gap-2 ${
                    activeCategory === cat.label
                      ? "bg-amber-400 text-black border-amber-400 shadow-[0_0_25px_rgba(255,215,0,0.4)] scale-105"
                      : "bg-black/30 backdrop-blur-xl text-muted-foreground border-white/5 hover:border-amber-400/30 hover:text-foreground hover:scale-[1.02] hover:shadow-[0_0_15px_rgba(255,215,0,0.1)]"
                  }`}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>

            {/* Sub-sport pills within category */}
            {selectedSport && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {sportsLoading ? (
                  <div className="flex gap-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="w-24 h-8 rounded-xl bg-white/5 animate-pulse" />
                    ))}
                  </div>
                ) : (
                  sports
                    .filter((s) =>
                      SPORT_CATEGORIES.find((c) => c.label === activeCategory)?.keys.includes(s.key)
                    )
                    .map((sport) => (
                      <button
                        key={sport.key}
                        onClick={() => setSelectedSport(sport.key)}
                        className={`px-4 py-2 rounded-xl border font-bold uppercase tracking-[0.1em] text-[10px] transition-all duration-200 whitespace-nowrap shrink-0 ${
                          selectedSport === sport.key
                            ? "bg-white/15 text-white border-white/30"
                            : "bg-white/5 text-muted-foreground border-white/10 hover:border-white/20 hover:text-white"
                        }`}
                      >
                        {sport.title}
                      </button>
                    ))
                )}
              </div>
            )}

            {/* Fixtures */}
            <div className="space-y-4">
              {fixturesLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-48 rounded-3xl bg-white/5 animate-pulse" />
                  ))}
                </div>
              ) : fixturesError ? (
                <div className="bg-red-500/10 border border-red-500/20 rounded-3xl py-20 text-center space-y-3 px-6">
                  <AlertCircle className="w-12 h-12 text-red-500/50 mx-auto" />
                  <p className="text-red-400 font-bold uppercase tracking-widest text-sm">Connection Error</p>
                  <p className="text-muted-foreground text-xs max-w-xs mx-auto">
                    {(fixturesError as Error).message}. Check SPORTS_GAME_ODDS_API_KEY in Render.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.location.reload()}
                    className="mt-4 rounded-xl border-white/10 font-bold uppercase tracking-widest text-[10px]"
                  >
                    Retry Connection
                  </Button>
                </div>
              ) : fixtures.length === 0 ? (
                <div className="bg-white/5 border border-white/5 rounded-3xl py-20 text-center">
                  <p className="text-muted-foreground font-mono">No live fixtures for this category right now.</p>
                </div>
              ) : (
                filteredFixtures.map((fixture) => {
                  const h2hMarket = fixture.bookmakers[0]?.markets.find((m) => m.key === "h2h");
                  const spreadsMarket = fixture.bookmakers[0]?.markets.find((m) => m.key === "spreads");
                  const totalsMarket = fixture.bookmakers[0]?.markets.find((m) => m.key === "totals");

                  if (!h2hMarket) return null;

                  return (
                    <div
                      key={fixture.id}
                      className="group relative w-full overflow-hidden bg-gradient-to-br from-slate-900/40 to-slate-950/60 border border-slate-700/40 rounded-2xl transition-all duration-300 hover:border-cyan-500/50 hover:shadow-[0_0_25px_rgba(34,211,238,0.15)]"
                    >
                      {/* Header: League + Live Time + Live Score */}
                      <div className="w-full px-4 py-3 border-b border-slate-700/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-900/50">
                        <div className="flex items-center gap-2 text-xs sm:text-sm">
                          <span className="text-slate-300 font-semibold">{activeCategory}</span>
                          <span className="text-slate-600">•</span>
                          <span className="text-slate-400">{fixture.sport_title}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          {fixture.liveScore && (
                            <span className="text-green-400 font-bold text-xs sm:text-sm flex items-center gap-1">
                              <span>●</span>
                              <span>
                                {fixture.liveScore.homeScore} - {fixture.liveScore.awayScore}
                              </span>
                              {fixture.liveScore.period && (
                                <span className="text-green-300 text-[10px]">({fixture.liveScore.period})</span>
                              )}
                            </span>
                          )}
                          <span className="text-cyan-400 font-bold text-xs sm:text-sm flex items-center gap-1">
                            <span>▶</span>
                            <span>{formatCommenceTime(fixture.commence_time)}</span>
                          </span>
                        </div>
                      </div>

                      {/* Match Body */}
                      <div className="w-full px-4 py-4">
                        {/* Teams with Scores */}
                        <div className="space-y-3 mb-4">
                          {/* Home Team */}
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <div className="w-7 h-7 rounded-full bg-slate-700/60 flex-shrink-0 flex items-center justify-center text-xs font-bold">
                                🏠
                              </div>
                              <span className="text-white font-bold text-sm truncate">{fixture.home_team}</span>
                            </div>
                            <div className="w-11 h-9 rounded-lg bg-slate-800/60 border border-slate-700/50 flex-shrink-0 flex items-center justify-center">
                              <span className="text-slate-400 font-black text-sm">
                                {fixture.liveScore?.homeScore ?? "-"}
                              </span>
                            </div>
                          </div>
                          {/* Away Team */}
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <div className="w-7 h-7 rounded-full bg-slate-700/60 flex-shrink-0 flex items-center justify-center text-xs font-bold">
                                ✈️
                              </div>
                              <span className="text-white font-bold text-sm truncate">{fixture.away_team}</span>
                            </div>
                            <div className="w-11 h-9 rounded-lg bg-slate-800/60 border border-slate-700/50 flex-shrink-0 flex items-center justify-center">
                              <span className="text-slate-400 font-black text-sm">
                                {fixture.liveScore?.awayScore ?? "-"}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Market Label */}
                        <div className="text-xs text-slate-400 mb-3 font-semibold uppercase tracking-wide">
                          Moneyline
                        </div>

                        {/* Moneyline Odds buttons */}
                        <div className="w-full grid grid-cols-3 gap-2 mb-4">
                          {h2hMarket.outcomes.map((outcome) => (
                            <button
                              key={outcome.name}
                              onClick={() =>
                                setSelectedBet({
                                  fixture,
                                  market: h2hMarket,
                                  outcome,
                                  odds: outcome.price,
                                })
                              }
                              className={`relative w-full overflow-hidden p-2.5 sm:p-3 rounded-xl border transition-all duration-200 flex flex-col items-center gap-1 text-xs sm:text-sm ${
                                selectedBet?.outcome.name === outcome.name &&
                                selectedBet?.fixture.id === fixture.id
                                  ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-[0_0_15px_rgba(34,211,238,0.3)] scale-105"
                                  : "bg-slate-800/40 text-slate-300 border-slate-700/40 hover:border-cyan-500/30 hover:bg-slate-800/60 hover:text-cyan-300"
                              }`}
                            >
                              <span className="font-bold uppercase tracking-tight text-[10px] sm:text-xs">
                                {outcome.name === "Draw" ? "Draw" : outcome.name === "Home" ? "1" : "2"}
                              </span>
                              <span className="font-black font-mono text-sm sm:text-base">
                                {formatOdds(outcome.price)}
                              </span>
                            </button>
                          ))}
                        </div>

                        {/* Spreads and Totals */}
                        {(spreadsMarket || totalsMarket) && (
                          <div className="grid grid-cols-2 gap-2">
                            {spreadsMarket && (
                              <div>
                                <div className="text-xs text-slate-400 mb-2 font-semibold uppercase tracking-wide">
                                  Spread
                                </div>
                                <div className="flex gap-1">
                                  {spreadsMarket.outcomes.slice(0, 2).map((outcome) => (
                                    <button
                                      key={outcome.name}
                                      onClick={() =>
                                        setSelectedBet({
                                          fixture,
                                          market: spreadsMarket,
                                          outcome,
                                          odds: outcome.price,
                                        })
                                      }
                                      className={`flex-1 p-2 rounded-lg border transition-all text-xs flex flex-col items-center gap-0.5 ${
                                        selectedBet?.outcome.name === outcome.name &&
                                        selectedBet?.market.key === "spreads"
                                          ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/50"
                                          : "bg-slate-800/40 text-slate-300 border-slate-700/40 hover:border-cyan-500/30"
                                      }`}
                                    >
                                      <span className="font-bold text-[9px]">
                                        {outcome.point ? (outcome.point > 0 ? "+" : "") + outcome.point : "-"}
                                      </span>
                                      <span className="font-black text-[10px]">{formatOdds(outcome.price)}</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            {totalsMarket && (
                              <div>
                                <div className="text-xs text-slate-400 mb-2 font-semibold uppercase tracking-wide">
                                  Total
                                </div>
                                <div className="flex gap-1">
                                  {totalsMarket.outcomes.slice(0, 2).map((outcome) => (
                                    <button
                                      key={outcome.name}
                                      onClick={() =>
                                        setSelectedBet({
                                          fixture,
                                          market: totalsMarket,
                                          outcome,
                                          odds: outcome.price,
                                        })
                                      }
                                      className={`flex-1 p-2 rounded-lg border transition-all text-xs flex flex-col items-center gap-0.5 ${
                                        selectedBet?.outcome.name === outcome.name &&
                                        selectedBet?.market.key === "totals"
                                          ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/50"
                                          : "bg-slate-800/40 text-slate-300 border-slate-700/40 hover:border-cyan-500/30"
                                      }`}
                                    >
                                      <span className="font-bold text-[9px]">
                                        {outcome.name} {outcome.point}
                                      </span>
                                      <span className="font-black text-[10px]">{formatOdds(outcome.price)}</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Bookmaker Deeplinks */}
                        {fixture.bookmakers[0]?.deeplinks && Object.keys(fixture.bookmakers[0].deeplinks).length > 0 && (
                          <div className="mt-3 pt-3 border-t border-slate-700/30">
                            <div className="text-xs text-slate-400 mb-2 font-semibold uppercase tracking-wide">
                              Bet Now
                            </div>
                            <div className="flex gap-1 flex-wrap">
                              {Object.entries(fixture.bookmakers[0].deeplinks)
                                .slice(0, 3)
                                .map(([oddID, deeplink]) => (
                                  <a
                                    key={oddID}
                                    href={deeplink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs px-2 py-1 rounded bg-slate-800/40 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/20 transition-all flex items-center gap-1"
                                  >
                                    <span>{fixture.bookmakers[0]?.title || "Bet"}</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Bet Slip Sidebar */}
          <div className="lg:col-span-4">
            <div className="sticky top-6 bg-black/40 backdrop-blur-xl border border-white/5 rounded-2xl p-6 space-y-4">
              <h3 className="font-black uppercase tracking-widest text-sm">Bet Slip</h3>

              {selectedBet ? (
                <>
                  <div className="space-y-3 pb-4 border-b border-white/5">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Match</p>
                      <p className="text-sm font-bold text-white">
                        {selectedBet.fixture.home_team} vs {selectedBet.fixture.away_team}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Selection</p>
                      <p className="text-sm font-bold text-cyan-300">
                        {selectedBet.outcome.name} @ {formatOdds(selectedBet.odds)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-2 block">Bet Amount (USD)</label>
                      <Input
                        type="number"
                        value={betAmount}
                        onChange={(e) => setBetAmount(e.target.value)}
                        placeholder="0.00"
                        className="bg-white/5 border-white/10 text-white"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-muted-foreground mb-2 block">Crypto</label>
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
                        <span className="text-muted-foreground">Potential Payout:</span>
                        <span className="text-white font-bold">${potentialPayout}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Multiplier:</span>
                        <span className="text-cyan-300 font-bold">
                          {americanOddsToMultiplier(selectedBet.odds).toFixed(2)}x
                        </span>
                      </div>
                    </div>

                    <Button
                      onClick={() => placeBet()}
                      disabled={isBettingPending || !betAmount || parseFloat(betAmount) <= 0}
                      className="w-full bg-cyan-500 hover:bg-cyan-600 text-black font-black uppercase tracking-widest"
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
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">Select a match and outcome to place a bet</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
