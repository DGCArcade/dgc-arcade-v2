import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
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

interface Fixture {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Bookmaker[];
}

interface Bookmaker {
  key: string;
  title: string;
  markets: Market[];
}

interface Market {
  key: string;
  outcomes: Outcome[];
}

interface Outcome {
  name: string;
  price: number;
  point?: number;
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
 * Explicitly passes the detected IANA timezone so the correct day/hour
 * is always shown regardless of server-side UTC offsets.
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
    // Fallback: rely on browser default (no explicit timeZone)
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
   Sport category tabs — expanded with more sports
───────────────────────────────────────────────────────────── */
const SPORT_CATEGORIES: { label: string; icon: string; keys: string[] }[] = [
  {
    label: "Football",
    icon: "🏈",
    keys: [
      "americanfootball_nfl",
      "americanfootball_ncaaf",
      "soccer_epl",
      "soccer_mls",
      "soccer_uefa_champs_league",
      "soccer_uefa_europa_league",
      "soccer_spain_la_liga",
      "soccer_germany_bundesliga",
      "soccer_italy_serie_a",
      "soccer_france_ligue_one",
    ],
  },
  {
    label: "Basketball",
    icon: "🏀",
    keys: [
      "basketball_nba",
      "basketball_ncaab",
      "basketball_euroleague",
      "basketball_wnba",
    ],
  },
  {
    label: "Baseball",
    icon: "⚾",
    keys: ["baseball_mlb"],
  },
  {
    label: "Hockey",
    icon: "🏒",
    keys: ["icehockey_nhl", "icehockey_sweden_hockey_league"],
  },
  {
    label: "Tennis",
    icon: "🎾",
    keys: [
      "tennis_atp_wimbledon",
      "tennis_wta_wimbledon",
      "tennis_atp_us_open",
      "tennis_wta_us_open",
      "tennis_atp_aus_open",
      "tennis_wta_aus_open",
      "tennis_atp_french_open",
      "tennis_wta_french_open",
    ],
  },
  {
    label: "UFC / MMA",
    icon: "🥊",
    keys: ["mma_mixed_martial_arts"],
  },
  {
    label: "Boxing",
    icon: "🥋",
    keys: ["boxing_boxing"],
  },
  {
    label: "Golf",
    icon: "⛳",
    keys: [
      "golf_pga_championship",
      "golf_the_masters_tournament",
      "golf_us_open",
      "golf_the_open_championship",
    ],
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

  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("Football");
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
          leagueTitle:
            sports.find((s) => s.key === selectedBet.fixture.sport_key)?.title || "Unknown",
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
          <span className={`w-2 h-2 rounded-full ${
            showLiveOnly ? "bg-white animate-pulse" : "bg-muted-foreground/30"
          }`} />
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
                {totalUsdBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center border ${
                        bet.status === "won"
                          ? "bg-green-500/10 border-green-500/30 text-green-400"
                          : bet.status === "lost"
                          ? "bg-red-500/10 border-red-500/30 text-red-400"
                          : "bg-blue-500/10 border-blue-500/30 text-blue-400"
                      }`}
                    >
                      {bet.status === "won" ? (
                        <CheckCircle2 className="w-6 h-6" />
                      ) : bet.status === "lost" ? (
                        <XCircle className="w-6 h-6" />
                      ) : (
                        <Clock className="w-6 h-6 animate-pulse" />
                      )}
                    </div>
                    <div>
                      <div className="font-bold text-sm uppercase tracking-wide">
                        {bet.homeTeam} vs {bet.awayTeam}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Selection: <span className="text-foreground font-bold">{bet.selectedOutcome}</span>{" "}
                        @ {formatOdds(parseFloat(bet.odds))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-8 px-2">
                    <div className="flex flex-col items-end">
                      <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-0.5">Wager</span>
                      <span className="font-mono font-bold text-sm">${parseFloat(bet.betAmountUsd).toFixed(2)}</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-0.5">Payout</span>
                      <span
                        className={`font-mono font-black text-sm ${
                          bet.status === "won" ? "text-green-400" : "text-muted-foreground"
                        }`}
                      >
                        ${parseFloat(bet.potentialPayoutUsd).toFixed(2)}
                      </span>
                    </div>
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
              {!selectedSport ? (
                <div className="bg-white/5 border border-white/5 rounded-3xl py-24 text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
                    <Trophy className="w-8 h-8 text-primary/40" />
                  </div>
                  <h3 className="font-display font-black text-xl uppercase tracking-widest">Select a Sport</h3>
                  <p className="text-muted-foreground text-sm max-w-xs mx-auto">
                    Choose a category above to view live fixtures and competitive odds.
                  </p>
                </div>
              ) : fixturesLoading ? (
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
                    {(fixturesError as Error).message}. Check THE_ODDS_API_KEY in Render.
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
                  if (!h2hMarket) return null;
                  return (
                    <div
                      key={fixture.id}
                      className="group relative w-full overflow-hidden bg-black/30 backdrop-blur-xl border border-white/5 rounded-[2.5rem] transition-all duration-300 hover:scale-[1.05] hover:-translate-y-1 hover:border-amber-400/30 hover:shadow-[0_0_20px_rgba(255,215,0,0.1)] shadow-lg"
                    >
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                      <div className="w-full p-4 md:p-6 lg:p-8 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/[0.02]">
                        <div className="flex items-center gap-4">
                          <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/80">
                              {formatCommenceTime(fixture.commence_time)}
                            </span>
                          </div>
                          <span className="hidden md:block text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/30">
                            Match ID: {fixture.id.slice(0, 8)}
                          </span>
                        </div>
                        <Badge className="bg-primary/10 hover:bg-primary/20 text-primary border-primary/20 text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1.5 rounded-lg">
                          Market Open
                        </Badge>
                      </div>

                      <div className="w-full p-4 md:p-6 lg:p-8">
                        <div className="w-full flex flex-col gap-6 md:gap-8">
                          <div className="w-full flex-1">
                            <div className="w-full grid grid-cols-[1fr,auto,1fr] items-center gap-2 md:gap-4 lg:gap-8">
                              <div className="space-y-2 text-center md:text-right">
                                <div className="text-base md:text-2xl font-black uppercase tracking-tight text-white group-hover:text-amber-400 transition-colors duration-300">
                                  {fixture.home_team}
                                </div>
                                <div className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest">Home Squad</div>
                              </div>
                              <div className="relative">
                                <div className="w-10 h-10 md:w-14 md:h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center font-black italic text-muted-foreground/20 text-xs md:text-sm">
                                  VS
                                </div>
                                <div className="absolute inset-0 rounded-full bg-primary/5 blur-lg animate-pulse" />
                              </div>
                              <div className="space-y-2 text-center md:text-left">
                                <div className="text-base md:text-2xl font-black uppercase tracking-tight text-white group-hover:text-amber-400 transition-colors duration-300">
                                  {fixture.away_team}
                                </div>
                                <div className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest">Away Squad</div>
                              </div>
                            </div>
                          </div>

                          {/* Odds buttons */}
                          <div className="w-full grid grid-cols-3 gap-2 md:gap-3">
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
                                className={`group/odd relative w-full overflow-hidden p-3 md:p-4 rounded-2xl border transition-all duration-300 hover:scale-105 flex flex-col items-center gap-1.5 ${
                                  selectedBet?.outcome.name === outcome.name &&
                                  selectedBet?.fixture.id === fixture.id
                                    ? "bg-primary text-black border-primary shadow-[0_10px_30px_rgba(255,215,0,0.4)] scale-110 -translate-y-1 z-10"
                                    : "bg-white/[0.03] border-white/10 hover:border-primary/50 hover:bg-white/[0.07] hover:scale-[1.05] hover:-translate-y-0.5"
                                }`}
                              >
                                <span
                                  className={`text-[9px] font-black uppercase tracking-widest transition-opacity ${
                                    selectedBet?.outcome.name === outcome.name &&
                                    selectedBet?.fixture.id === fixture.id
                                      ? "opacity-100"
                                      : "opacity-40"
                                  }`}
                                >
                                  {outcome.name}
                                </span>
                                <span className="text-xl font-black font-mono tracking-tighter">
                                  {formatOdds(outcome.price)}
                                </span>
                                {selectedBet?.outcome.name === outcome.name &&
                                  selectedBet?.fixture.id === fixture.id && (
                                    <div className="absolute inset-0 bg-white/20 animate-pulse" />
                                  )}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ── Bet Slip Sidebar (Desktop Only) ── */}
          <div className="hidden lg:block lg:col-span-4">
            <div className="sticky top-24 space-y-4 max-h-[calc(100vh-120px)] overflow-y-auto">
              {!selectedBet ? (
                <div className="w-full bg-black/40 border border-white/5 rounded-3xl p-6 md:p-8 text-center space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mx-auto">
                    <Zap className="w-6 h-6 text-muted-foreground/30" />
                  </div>
                  <h3 className="font-bold uppercase tracking-widest text-sm">Empty Slip</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Select an outcome from the feed to build your wager.
                  </p>
                </div>
              ) : (
                <div className="w-full bg-black/40 border border-primary/30 rounded-3xl p-4 md:p-6 space-y-4 md:space-y-6 shadow-2xl shadow-primary/5 animate-in zoom-in-95 duration-300">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display font-black uppercase tracking-[0.2em] text-sm text-primary">Bet Slip</h3>
                    <button
                      onClick={() => setSelectedBet(null)}
                      className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-red-500/20 hover:text-red-400 transition-all"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="space-y-4">
                    {/* Selection summary */}
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                      <div className="text-[10px] font-black uppercase tracking-widest text-primary/70">Selection</div>
                      <div className="font-bold text-sm leading-tight">{selectedBet.outcome.name}</div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-widest">
                        {selectedBet.fixture.home_team} vs {selectedBet.fixture.away_team}
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-white/5 mt-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                          American Odds
                        </span>
                        <span className="font-mono font-black text-primary">
                          {formatOdds(selectedBet.odds)}
                        </span>
                      </div>
                    </div>

                    {/* Wager input */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between px-1">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                          Wager Amount (USD)
                        </label>
                        <div className="flex items-center gap-2">
                          {[10, 50, 100].map((amt) => (
                            <button
                              key={amt}
                              onClick={() => setBetAmount(amt.toString())}
                              className="text-[9px] font-black bg-white/5 hover:bg-white/10 border border-white/10 px-2 py-1 rounded-md transition-all"
                            >
                              ${amt}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="relative group">
                        <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary group-focus-within:animate-pulse" />
                        <Input
                          type="number"
                          value={betAmount}
                          onChange={(e) => setBetAmount(e.target.value)}
                          placeholder="0.00"
                          className="h-14 pl-10 bg-black/60 border-white/10 focus:border-primary/50 text-lg font-black font-mono rounded-2xl transition-all"
                        />
                      </div>
                    </div>

                    {/* Crypto selector */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">
                        Settle With
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {cryptoBalances.slice(0, 4).map((b) => {
                          const symbol = b.currency.split("_")[0];
                          return (
                            <button
                              key={b.currency}
                              onClick={() => setSelectedCrypto(symbol)}
                              className={`p-2 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                                selectedCrypto === symbol
                                  ? "bg-primary/20 border-primary text-primary"
                                  : "bg-white/5 border-white/10 text-muted-foreground hover:border-white/20"
                              }`}
                            >
                              {symbol}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Payout preview */}
                    <div className="bg-primary/10 border border-primary/20 rounded-2xl p-4 flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black uppercase tracking-widest text-primary/70">
                          Potential Payout
                        </span>
                        <span className="text-xl font-black font-mono text-primary">${potentialPayout}</span>
                        <span className="text-[9px] text-muted-foreground/60 font-mono mt-0.5">
                          {americanOddsToMultiplier(selectedBet.odds).toFixed(3)}× multiplier
                        </span>
                      </div>
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                        <TrendingUp className="w-5 h-5 text-primary" />
                      </div>
                    </div>

                    <Button
                      onClick={() => placeBet()}
                      disabled={!betAmount || parseFloat(betAmount) <= 0 || isBettingPending}
                      className="w-full h-16 rounded-2xl bg-primary hover:bg-primary/90 text-black font-display font-black uppercase tracking-[0.2em] shadow-xl shadow-primary/20 transition-all active:scale-95 disabled:opacity-50"
                    >
                      {isBettingPending ? (
                        <Loader className="w-6 h-6 animate-spin" />
                      ) : (
                        "Place Wager"
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Mobile Bottom Drawer Bet Slip ── */}
          {selectedBet && (
            <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-t from-black via-black/95 to-black/80 backdrop-blur-xl border-t border-primary/30 rounded-t-3xl p-6 space-y-6 shadow-2xl shadow-primary/5 animate-in slide-in-from-bottom-4 duration-300 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between sticky top-0 bg-black/50 -m-6 p-6 mb-4 border-b border-white/5">
                <h3 className="font-display font-black uppercase tracking-[0.2em] text-sm text-primary">Bet Slip</h3>
                <button
                  onClick={() => setSelectedBet(null)}
                  className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-red-500/20 hover:text-red-400 transition-all"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                {/* Selection summary */}
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                  <div className="text-[10px] font-black uppercase tracking-widest text-primary/70">Selection</div>
                  <div className="font-bold text-sm leading-tight">{selectedBet.outcome.name}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-widest">
                    {selectedBet.fixture.home_team} vs {selectedBet.fixture.away_team}
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-white/5 mt-2">
                    <span className="text-[9px] text-muted-foreground/60 uppercase tracking-widest">Odds</span>
                    <span className="font-mono font-black text-lg text-primary">{formatOdds(selectedBet.odds)}</span>
                  </div>
                </div>

                {/* Payout preview */}
                <div className="p-4 rounded-2xl bg-primary/10 border border-primary/30 space-y-2">
                  <div className="text-[10px] font-black uppercase tracking-widest text-primary/70">Potential Payout</div>
                  <div className="font-display font-black text-2xl text-primary">
                    ${(parseFloat(betAmount) * americanOddsToMultiplier(parseFloat(String(selectedBet.odds)))).toFixed(2)}
                  </div>
                </div>

                {/* Bet amount input */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">Wager Amount (USD)</label>
                  <Input
                    type="number"
                    value={betAmount}
                    onChange={(e) => setBetAmount(e.target.value)}
                    placeholder="0.00"
                    className="bg-white/5 border-white/10 rounded-2xl h-12 font-mono font-black text-lg text-white placeholder:text-muted-foreground/30 focus:border-primary/50 focus:ring-primary/20 transition-all"
                  />
                </div>

                {/* Place bet button */}
                <Button
                  onClick={() => placeBet()}
                  disabled={isBettingPending || !betAmount || parseFloat(betAmount) <= 0}
                  className="w-full h-12 bg-primary text-black font-black uppercase tracking-widest rounded-2xl hover:bg-primary/90 disabled:opacity-50 transition-all"
                >
                  {isBettingPending ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin mr-2" />
                      Processing...
                    </>
                  ) : (
                    "Place Bet"
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
