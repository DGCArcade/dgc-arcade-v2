"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import {
  Search,
  Loader,
  AlertCircle,
  Trophy,
  History,
  Flame,
  X,
  Trash2,
  ChevronDown,
  ChevronUp,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { CoinIcon } from "@/components/wallet/coin-icon";
import { getApiUrl } from "@/lib/api-fetch";

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

interface LiveOddsSnapshot {
  fixtures: Fixture[];
  updatedAt: string | null;
  sourceUpdatedAt: string | null;
  version: number;
  stale: boolean;
  configured: boolean;
}

interface LiveWorkerStatus {
  configured: boolean;
  workerHealthy: boolean;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  message?: string;
}

interface Fixture {
  id: string;
  sport_key: string;
  sport_title: string;  // league ID e.g. "NFL", "EPL"
  commence_time: string;
  completed: boolean;
  // Real live-status fields from SportsGameOdds API
  live: boolean;          // TRUE only while game is in-progress right now
  started: boolean;       // started but may be in half-time break
  inBreak?: boolean;      // half-time / timeout break
  currentPeriod?: string; // "1q","2q","1h","2h", etc.
  periodDisplay?: string; // human-readable e.g. "Q3 4:22" or "2nd Half"
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
  marketKey?: string;
}

/* BetSlip entry — supports multi-bet parlay / singles */
interface BetSlipEntry {
  slipId: string; // `${fixture.id}:${market.key}:${outcome.name}`
  fixture: Fixture;
  market: Market;
  outcome: Outcome;
  odds: number;
  bookmaker?: string;
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

  function getRealtimeOrigin(): string | undefined {
    // If VITE_API_URL is set, use it. Otherwise fallback to current origin.
    const configuredUrl = import.meta.env.VITE_API_URL?.trim();
    if (!configuredUrl) {
      return typeof window !== "undefined" ? window.location.origin : undefined;
    }
    try {
      return new URL(configuredUrl).origin;
    } catch {
      return configuredUrl;
    }
  }

function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

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
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
}

function formatTimeOnly(isoString: string): string {
  const tz = getUserTimezone();
  try {
    return new Date(isoString).toLocaleString(undefined, {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return new Date(isoString).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
}

/** Uses the REAL `status.live` boolean from the API — never guesses from time */
function isGameLive(fixture: Fixture): boolean {
  return fixture.live === true;
}

/** Game hasn't started yet and starts within the next 2 weeks */
function isGameUpcoming(fixture: Fixture): boolean {
  if (fixture.live || fixture.started || fixture.completed) return false;
  const now = new Date();
  const commenceTime = new Date(fixture.commence_time);
  const minutesUntil = (commenceTime.getTime() - now.getTime()) / (1000 * 60);
  return minutesUntil > 0 && minutesUntil < 20160; // up to 14 days out
}

/** Live badge label showing period/score display from the API */
function liveBadgeLabel(fixture: Fixture): string {
  if (fixture.periodDisplay) return fixture.periodDisplay;
  if (fixture.inBreak && fixture.currentPeriod) return `Break (${fixture.currentPeriod.toUpperCase()})`;
  if (fixture.currentPeriod) {
    const p = fixture.currentPeriod;
    const labels: Record<string, string> = {
      "1q": "Q1", "2q": "Q2", "3q": "Q3", "4q": "Q4",
      "1h": "1st Half", "2h": "2nd Half",
      "game": "Live", "ot": "OT",
    };
    return labels[p] || p.toUpperCase();
  }
  return "LIVE";
}

/** Human-readable league label */
const LEAGUE_LABELS: Record<string, string> = {
  NFL: "NFL", NBA: "NBA", MLB: "MLB", NHL: "NHL", NCAAB: "NCAA Basketball",
  NCAAF: "NCAA Football", WNBA: "WNBA", EPL: "Premier League",
  UEFA_CHAMPIONS_LEAGUE: "Champions League", UEFA_EUROPA_LEAGUE: "Europa League",
  MLS: "MLS Soccer", LA_LIGA: "La Liga", BUNDESLIGA: "Bundesliga",
  SERIE_A: "Serie A", LIGUE_1: "Ligue 1", UFC: "UFC", MMA: "MMA",
  BOXING: "Boxing", PGA: "PGA Tour", EUROPEAN_TOUR: "Euro Tour",
  ATP: "ATP Tennis", WTA: "WTA Tennis", CFL: "CFL", KBO: "KBO Baseball",
  NPB: "NPB Baseball", IPL: "IPL Cricket", T20I: "T20 Intl", CS2: "CS2",
  VALORANT: "VALORANT", LOL: "League of Legends", DOTA2: "Dota 2",
};
function leagueLabel(sportTitle: string): string {
  return LEAGUE_LABELS[sportTitle] || sportTitle.replace(/_/g, " ");
}

function bookmakerDisplayName(key: string): string {
  const names: Record<string, string> = {
    fanduel: "FanDuel",
    draftkings: "DraftKings",
    betmgm: "BetMGM",
    caesars: "Caesars",
    pointsbet: "PointsBet",
    barstool: "Barstool",
    betrivers: "BetRivers",
    unibet: "Unibet",
    wynnbet: "WynnBET",
    foxbet: "Fox Bet",
    betway: "Betway",
    bet365: "Bet365",
    williamhill: "William Hill",
    paddypower: "Paddy Power",
    betfair: "Betfair",
    pinnacle: "Pinnacle",
    betcris: "BetCRIS",
    superbook: "SuperBook",
    lowvig: "LowVig",
    betanysports: "BetAnySports",
  };
  return names[key.toLowerCase()] || key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ─────────────────────────────────────────────────────────────
   Sport categories
───────────────────────────────────────────────────────────── */
const SPORT_CATEGORIES: { label: string; icon: string; keys: string[] }[] = [
  { label: "Football", icon: "🏈", keys: ["NFL", "NCAAF", "CFL", "XFL", "USFL"] },
  { label: "Soccer", icon: "⚽", keys: ["EPL", "UEFA_CHAMPIONS_LEAGUE", "MLS", "LA_LIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1"] },
  { label: "Basketball", icon: "🏀", keys: ["NBA", "NCAAB", "WNBA", "EUROLEAGUE"] },
  { label: "Baseball", icon: "⚾", keys: ["MLB", "NPB", "KBO"] },
  { label: "Hockey", icon: "🏒", keys: ["NHL", "SHL", "KHL"] },
  { label: "Tennis", icon: "🎾", keys: ["ATP", "WTA", "GRAND_SLAMS"] },
  { label: "MMA", icon: "🥊", keys: ["MMA", "UFC", "BELLATOR"] },
  { label: "Boxing", icon: "🥋", keys: ["BOXING"] },
  { label: "Golf", icon: "⛳", keys: ["PGA", "LPGA", "EUROPEAN_TOUR"] },
  { label: "Esports", icon: "🎮", keys: ["VALORANT", "CS2", "LOL"] },
];

/* ─────────────────────────────────────────────────────────────
   D Sports Logo
───────────────────────────────────────────────────────────── */
function DSportsLogo() {
  return (
    <div className="flex items-center gap-3 md:gap-4">
      {/* D Icon */}
      <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-black/50 border border-yellow-500/30 shadow-[0_0_30px_rgba(255,215,0,0.2)] flex items-center justify-center overflow-hidden flex-shrink-0">
        <svg width="100%" height="100%" viewBox="0 0 180 180" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="180" height="180" rx="32" fill="#080c18"/>
          <defs>
            <radialGradient id="dLogoGlow" cx="50%" cy="45%" r="55%">
              <stop offset="0%" stopColor="#FFD700" stopOpacity="0.25"/>
              <stop offset="100%" stopColor="#FF8800" stopOpacity="0"/>
            </radialGradient>
            <radialGradient id="dLogoLetter" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#FFE55C"/>
              <stop offset="60%" stopColor="#FFD700"/>
              <stop offset="100%" stopColor="#CC9900"/>
            </radialGradient>
          </defs>
          <rect width="180" height="180" rx="32" fill="url(#dLogoGlow)"/>
          <text
            x="89" y="134"
            fontFamily="'Arial Black','Impact','Helvetica Neue',Arial,sans-serif"
            fontWeight="900"
            fontSize="118"
            fill="url(#dLogoLetter)"
            textAnchor="middle"
          >D</text>
          <rect x="1" y="1" width="178" height="88" rx="31" fill="white" fillOpacity="0.04"/>
          <rect x="1" y="1" width="178" height="178" rx="31" stroke="#FFD700" strokeOpacity="0.2" strokeWidth="1.5" fill="none"/>
        </svg>
      </div>
      {/* Text */}
      <div>
        <h1 className="font-display font-black text-2xl md:text-5xl uppercase tracking-[0.12em] leading-none flex items-baseline gap-0">
          <span className="text-glow-shift-slow drop-shadow-[0_0_20px_rgba(255,215,0,0.6)]">D</span>
        </h1>
        <div className="flex items-center gap-2 mt-1.5">
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-ping" />
            <span className="text-[9px] font-black uppercase tracking-widest text-green-400">Live Engine</span>
          </div>
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 hidden md:block">
            82+ Bookmakers · Real-Time Odds
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Main Component
───────────────────────────────────────────────────────────── */
export function Sportsbook() {
  const { user, cryptoBalances, refreshUser } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  /* ── View State ── */
  const [selectedSport, setSelectedSport] = useState<string>(() =>
    typeof window !== "undefined" ? localStorage.getItem("dgc_sb_sport") || "NFL" : "NFL"
  );
  const [activeCategory, setActiveCategory] = useState<string>(() =>
    typeof window !== "undefined" ? localStorage.getItem("dgc_sb_cat") || "Football" : "Football"
  );
  const [showLiveOnly, setShowLiveOnly] = useState(false);
  const [showTopSports, setShowTopSports] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [selectedBookmaker, setSelectedBookmaker] = useState<string>("best");
  const [selectedBetDetail, setSelectedBetDetail] = useState<SportsBet | null>(null);
  const [showBetSlip, setShowBetSlip] = useState(true);
  const [liveConnection, setLiveConnection] = useState<"connecting" | "connected" | "reconnecting" | "offline">("connecting");
  const [liveSnapshot, setLiveSnapshot] = useState<LiveOddsSnapshot | null>(null);
  const [liveWorkerStatus, setLiveWorkerStatus] = useState<LiveWorkerStatus | null>(null);

  /* ── Multi-Bet Slip ── */
  const [betSlip, setBetSlip] = useState<BetSlipEntry[]>([]);
  const [betAmount, setBetAmount] = useState<string>("");
  const [selectedCrypto, setSelectedCrypto] = useState<string>("BTC");
  const [isPlacingAll, setIsPlacingAll] = useState(false);

  const toastedBetIds = useRef<Set<number>>(new Set());

  /* ── Persist selections ── */
  useEffect(() => {
    if (selectedSport) localStorage.setItem("dgc_sb_sport", selectedSport);
  }, [selectedSport]);
  useEffect(() => {
    localStorage.setItem("dgc_sb_cat", activeCategory);
  }, [activeCategory]);
  useEffect(() => {
    if (cryptoBalances.length > 0) {
      const top = cryptoBalances.reduce((a, b) => (a.usdValue > b.usdValue ? a : b));
      setSelectedCrypto(top.currency.split("_")[0]);
    }
  }, [cryptoBalances]);

  /* ── Bet slip helpers ── */
  const makeBetSlipId = (fixtureId: string, marketKey: string, outcomeName: string) =>
    `${fixtureId}:${marketKey}:${outcomeName}`;

  const isBetSelected = (fixtureId: string, marketKey: string, outcomeName: string) =>
    betSlip.some((b) => b.slipId === makeBetSlipId(fixtureId, marketKey, outcomeName));

  const toggleBet = (
    fixture: Fixture,
    market: Market,
    outcome: Outcome,
    odds: number,
    bookmaker?: string
  ) => {
    const slipId = makeBetSlipId(fixture.id, market.key, outcome.name);
    setBetSlip((prev) => {
      const exists = prev.find((b) => b.slipId === slipId);
      if (exists) return prev.filter((b) => b.slipId !== slipId);
      
      // PREVENT CONFLICTING BETS: Can't bet on the same fixture twice in one slip
      const conflict = prev.find(b => b.fixture.id === fixture.id);
      if (conflict) {
        toast({ 
          title: "Conflicting Bet", 
          description: "You cannot bet on multiple outcomes for the same game in one slip.", 
          variant: "destructive" 
        });
        return prev;
      }

      // Max 12 selections
      if (prev.length >= 12) {
        toast({ title: "Bet slip full", description: "Max 12 selections at once.", variant: "destructive" });
        return prev;
      }
      return [...prev, { slipId, fixture, market, outcome, odds, bookmaker }];
    });
    setShowBetSlip(true);
  };

  const removeBet = (slipId: string) =>
    setBetSlip((prev) => prev.filter((b) => b.slipId !== slipId));

  /* ── Data fetching ── */
  const { data: sports = [] } = useQuery<Sport[]>({
    queryKey: ["sportsbook-sports"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/sportsbook/sports"), {
        headers: { Authorization: `Bearer ${localStorage.getItem("dgc_token")}` },
      });
      if (!res.ok) throw new Error("Failed to fetch sports");
      return res.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  /* ── Fixtures ── */
  const {
    data: fixtures = [],
    isLoading: fixturesLoading,
    error: fixturesError,
  } = useQuery<Fixture[]>({
    queryKey: ["sportsbook-odds", selectedSport, showLiveOnly, showTopSports],
    queryFn: async () => {
      if (!selectedSport && !showLiveOnly && !showTopSports) return [];


      if (showLiveOnly) {
        // Dedicated live endpoint — only returns events where status.live === true
        const res = await fetch(getApiUrl("/api/sports/live-now"), {
          headers: { Authorization: `Bearer ${localStorage.getItem("dgc_token")}` },
        });
        if (!res.ok) throw new Error("Failed to fetch live games");
        const data = await res.json();
        return (data.fixtures || []) as Fixture[];
      }

      if (showTopSports) {
        const res = await fetch(getApiUrl("/api/sports/feed"), {
          headers: { Authorization: `Bearer ${localStorage.getItem("dgc_token")}` },
        });
        if (!res.ok) throw new Error("Failed to fetch sports feed");
        const data = await res.json();

        // Deduplicate by fixture ID — same event can appear in multiple categories
        const seen = new Set<string>();
        const allGames: Fixture[] = [];
        for (const category of Object.values(data.feed || {})) {
          if (Array.isArray(category)) {
            for (const g of category as Fixture[]) {
              if (seen.has(g.id)) continue;
              seen.add(g.id);
              if (isGameLive(g) || isGameUpcoming(g)) allGames.push(g);
            }
          }
        }
        // Live games first, then by start time
        return allGames.sort((a, b) => {
          const aLive = isGameLive(a) ? 0 : 1;
          const bLive = isGameLive(b) ? 0 : 1;
          if (aLive !== bLive) return aLive - bLive;
          return new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime();
        });
      }

      const res = await fetch(
        getApiUrl(`/api/sportsbook/odds/${selectedSport}?regions=us&oddsFormat=american`),
        { headers: { Authorization: `Bearer ${localStorage.getItem("dgc_token")}` } }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to fetch odds");
      }
      return res.json();
    },
    enabled: !!(selectedSport || showLiveOnly || showTopSports),
    // Socket.IO is primary for live changes. This slower request is a safety net
    // for blocked WebSockets and gives reconnecting clients the last Neon snapshot.
    staleTime: showLiveOnly ? 30_000 : showTopSports ? 1000 * 60 : 1000 * 30,
    refetchInterval: showLiveOnly ? 60_000 : showTopSports ? 60_000 : undefined,
    retry: 1,
  });

  /* ── Realtime live odds ── */
  useEffect(() => {
    const socket = io(getRealtimeOrigin(), {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
      timeout: 15_000,
    });

    socket.on("connect", () => {
      setLiveConnection("connected");
      socket.emit("sportsbook:subscribe");
    });
    socket.on("disconnect", () => setLiveConnection("reconnecting"));
    socket.on("connect_error", () => setLiveConnection("offline"));
    socket.io.on("reconnect_attempt", () => setLiveConnection("reconnecting"));
    socket.on("sportsbook:odds:update", (snapshot: LiveOddsSnapshot) => {
      setLiveSnapshot(snapshot);
      setLiveConnection("connected");
    });
    socket.on("sportsbook:status", (status: LiveWorkerStatus) => {
      setLiveWorkerStatus(status);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!liveSnapshot) return;
    const incoming = liveSnapshot.fixtures;
    const relevantIncoming = showLiveOnly || showTopSports
      ? incoming
      : incoming.filter((fixture) =>
          fixture.sport_key.toLowerCase() === selectedSport.toLowerCase() ||
          fixture.sport_title.toLowerCase() === selectedSport.toLowerCase(),
        );
    const incomingById = new Map(relevantIncoming.map((fixture) => [fixture.id, fixture]));

    queryClient.setQueryData<Fixture[]>(
      ["sportsbook-odds", selectedSport, showLiveOnly, showTopSports],
      (current = []) => {
        if (showLiveOnly) return relevantIncoming;
        const merged = current
          .filter((fixture) => !fixture.live || incomingById.has(fixture.id))
          .map((fixture) => incomingById.get(fixture.id) ?? fixture);
        const existingIds = new Set(merged.map((fixture) => fixture.id));
        for (const fixture of relevantIncoming) {
          if (!existingIds.has(fixture.id)) merged.push(fixture);
        }
        return merged.sort((a, b) => {
          if (a.live !== b.live) return a.live ? -1 : 1;
          return new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime();
        });
      },
    );

    setBetSlip((current) => current.map((entry) => {
      const fixture = incoming.find((candidate) => candidate.id === entry.fixture.id);
      if (!fixture) return entry;
      const bookmaker = fixture.bookmakers.find((candidate) =>
        candidate.key === entry.bookmaker || candidate.title === entry.bookmaker,
      ) ?? fixture.bookmakers[0];
      const market = bookmaker?.markets.find((candidate) => candidate.key === entry.market.key);
      const outcome = market?.outcomes.find((candidate) => candidate.name === entry.outcome.name);
      if (!market || !outcome) return { ...entry, fixture };
      return {
        ...entry,
        fixture,
        market,
        outcome,
        odds: outcome.price,
        bookmaker: bookmaker.title,
      };
    }));
  }, [liveSnapshot, queryClient, selectedSport, showLiveOnly, showTopSports]);

  /* ── Search ── */
  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return fixtures;
    const term = searchTerm.toLowerCase();
    return fixtures.filter(
      (f) =>
        f.home_team.toLowerCase().includes(term) ||
        f.away_team.toLowerCase().includes(term) ||
        f.sport_title.toLowerCase().includes(term)
    );
  }, [fixtures, searchTerm]);

  /* ── Bet history ── */
  const { data: betHistory = [], isLoading: historyLoading } = useQuery<SportsBet[]>({
    queryKey: ["sportsbook-history", (user as any)?.id],
    queryFn: async () => {
      const res = await fetch(getApiUrl(`/api/sportsbook/bets/${(user as any).id}`), {
        headers: { Authorization: `Bearer ${localStorage.getItem("dgc_token")}` },
      });
      if (!res.ok) throw new Error("Failed to fetch bet history");
      return res.json();
    },
    enabled: !!(user as any)?.id && showHistory,
  });

  /* ── Settlement polling ── */
  useQuery<SportsBet[]>({
    queryKey: ["sportsbook-pending-results", (user as any)?.id],
    queryFn: async () => {
      if (!(user as any)?.id) return [];
      const res = await fetch(getApiUrl(`/api/sportsbook/pending-results/${(user as any).id}`), {
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
              description: `${bet.homeTeam} vs ${bet.awayTeam} — Payout: $${parseFloat(bet.potentialPayoutUsd).toFixed(2)}`,
            });
            refreshUser();
          } else if (bet.status === "lost") {
            toast({
              title: "Match Settled",
              description: `${bet.homeTeam} vs ${bet.awayTeam} — Better luck next time.`,
              variant: "destructive",
            });
          }
        }
      }
      return data;
    },
  });

  /* ── Place all bets ── */
  const placeAllBets = async () => {
    if (!betSlip.length || !betAmount || parseFloat(betAmount) <= 0) return;
    setIsPlacingAll(true);

    const successIds: string[] = [];
    let failCount = 0;

    for (const entry of betSlip) {
      try {
        const res = await fetch(getApiUrl("/api/sportsbook/bet"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("dgc_token")}`,
          },
          body: JSON.stringify({
            fixtureId: entry.fixture.id,
            sportKey: entry.fixture.sport_key,
            leagueTitle: entry.fixture.sport_title || "Unknown",
            homeTeam: entry.fixture.home_team,
            awayTeam: entry.fixture.away_team,
            commenceTime: entry.fixture.commence_time,
            marketKey: entry.market.key,
            selectedOutcome: entry.outcome.name,
            odds: entry.odds,
            betAmountUsd: parseFloat(betAmount),
            cryptoType: selectedCrypto,
            bookmakerKey: entry.bookmaker,
            ...(entry.market.key === "spreads" && entry.outcome.point !== undefined && { spread: entry.outcome.point }),
            ...(entry.market.key === "totals" && entry.outcome.point !== undefined && { total: entry.outcome.point }),
          }),
        });
        if (res.ok) {
          successIds.push(entry.slipId);
        } else {
          const err = await res.json();
          failCount++;
          toast({ title: `Bet Failed: ${entry.outcome.name}`, description: err.error || "Unknown error", variant: "destructive" });
        }
      } catch {
        failCount++;
        toast({ title: "Network error", description: `Could not place bet on ${entry.outcome.name}`, variant: "destructive" });
      }
    }

    if (successIds.length > 0) {
      // Only remove successfully placed bets from the slip
      setBetSlip((prev) => prev.filter((b) => !successIds.includes(b.slipId)));
      if (failCount === 0) setBetAmount("");
      toast({
        title: `${successIds.length} Bet${successIds.length > 1 ? "s" : ""} Placed! 🎯`,
        description: `${(parseFloat(betAmount) * successIds.length).toFixed(2)} wagered${failCount > 0 ? ` · ${failCount} failed (still in slip)` : ""}`,
      });
      refreshUser();
      queryClient.invalidateQueries({ queryKey: ["sportsbook-history"] });
    }
    setIsPlacingAll(false);
  };

  /* ── Derived values ── */
  const totalUsdBalance = useMemo(
    () => cryptoBalances.reduce((sum, b) => sum + b.usdValue, 0),
    [cryptoBalances]
  );

  const combinedMultiplier = betSlip.reduce(
    (acc, entry) => acc * americanOddsToMultiplier(entry.odds),
    1
  );

  const betAmountNum = betAmount ? parseFloat(betAmount) : 0;
  const totalPotentialPayout =
    betAmountNum > 0 && betSlip.length > 0
      ? (betAmountNum * combinedMultiplier).toFixed(2)
      : "0.00";

  /* ── Sidebar counts from current category ── */
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const cat of SPORT_CATEGORIES) {
      counts[cat.label] = fixtures.filter((f) => cat.keys.includes(f.sport_key)).length;
    }
    return counts;
  }, [fixtures]);

  /* ── Render ── */
  return (
    <div className="w-full space-y-4 pb-24 md:pb-12">
      {/* Hero Banner */}
      <div className="relative overflow-hidden bg-black/30 backdrop-blur-2xl border border-white/[0.08] rounded-[2rem] p-4 md:p-6 shadow-[0_20px_60px_rgba(0,0,0,0.4)]"
        style={{ background: "linear-gradient(135deg, rgba(0,0,0,0.4) 0%, rgba(255,215,0,0.04) 100%)" }}>
        <div className="absolute top-0 right-0 w-80 h-80 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/3"
          style={{ background: "radial-gradient(circle, rgba(255,215,0,0.06) 0%, transparent 70%)" }} />
        <div className="absolute bottom-0 left-1/4 w-60 h-60 rounded-full blur-[100px]"
          style={{ background: "radial-gradient(circle, rgba(255,140,0,0.04) 0%, transparent 70%)" }} />
        <div className="relative z-10">
          <DSportsLogo />
        </div>
      </div>

      {/* Search + View Toggles */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40 pointer-events-none" />
          <Input
            placeholder="Search teams, leagues..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-10 bg-white/[0.04] backdrop-blur-sm border-white/[0.08] rounded-xl h-11 text-white placeholder:text-muted-foreground/30 focus:border-primary/40"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            { label: "📊 Top Sports", active: showTopSports, onClick: () => { setShowTopSports(true); setShowLiveOnly(false); } },
            { label: "🔴 Live Now", active: showLiveOnly, onClick: () => { setShowLiveOnly(true); setShowTopSports(false); }, pulse: true },
            { label: "🏆 By Sport", active: !showTopSports && !showLiveOnly, onClick: () => { setShowTopSports(false); setShowLiveOnly(false); } },
            { label: "📋 History", active: showHistory, onClick: () => setShowHistory(!showHistory) },
          ].map((btn) => (
            <button
              key={btn.label}
              onClick={btn.onClick}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all ${
                btn.active
                  ? "bg-primary/90 text-black shadow-[0_0_15px_rgba(255,215,0,0.25)]"
                  : "bg-white/[0.04] backdrop-blur-sm text-muted-foreground border border-white/[0.06] hover:border-primary/30 hover:text-white"
              } ${btn.pulse && btn.active ? "animate-pulse" : ""}`}
            >
              {btn.label}
              {btn.label === "📋 History" && betHistory.length > 0 && !showHistory && (
                <span className="ml-1 text-[9px] bg-primary/20 text-primary px-1 rounded">{betHistory.length}</span>
              )}
            </button>
          ))}
          <div
            className={`ml-auto flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider ${
              liveConnection === "connected" && !liveSnapshot?.stale && liveWorkerStatus?.workerHealthy
                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                : "border-amber-500/25 bg-amber-500/10 text-amber-300"
            }`}
            title={liveWorkerStatus?.message || (liveSnapshot?.sourceUpdatedAt ? `Last provider update: ${new Date(liveSnapshot.sourceUpdatedAt).toLocaleString()}` : "Waiting for the first live odds snapshot")}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${liveConnection === "connected" ? "bg-current animate-pulse" : "bg-current"}`} />
            {liveConnection === "connected" && !liveSnapshot?.stale && liveWorkerStatus?.workerHealthy ? "Live feed" : "Reconnecting"}
          </div>
          {betSlip.length > 0 && (
            <button
              onClick={() => setShowBetSlip(!showBetSlip)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 transition-all flex items-center gap-1.5"
            >
              🎯 Slip ({betSlip.length})
              {showBetSlip ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      {showHistory ? (
        <BetHistory bets={betHistory} loading={historyLoading} onSelect={setSelectedBetDetail} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Sidebar: Sports nav */}
          {!showTopSports && !showLiveOnly && (
            <aside className="lg:col-span-2 space-y-0.5 bg-black/20 backdrop-blur-sm rounded-xl p-2 border border-white/[0.06] h-fit">
              <div className="text-[10px] font-bold text-primary/70 uppercase tracking-wider px-3 py-2">
                Sports
              </div>
              {SPORT_CATEGORIES.map((cat) => {
                const count = categoryCounts[cat.label] ?? 0;
                const isActive = activeCategory === cat.label && !showTopSports && !showLiveOnly;
                return (
                  <button
                    key={cat.label}
                    onClick={() => {
                      setActiveCategory(cat.label);
                      setSelectedSport(cat.keys[0]);
                      setShowTopSports(false);
                      setShowLiveOnly(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all ${
                      isActive
                        ? "bg-primary/10 border border-primary/20 text-white font-bold"
                        : "text-gray-400 hover:bg-white/[0.03] hover:text-white"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span>{cat.icon}</span>
                      <span className="text-xs">{cat.label}</span>
                    </span>
                    {count > 0 && (
                      <span className="text-[9px] font-black bg-primary/10 text-primary px-1.5 py-0.5 rounded-full border border-primary/20">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </aside>
          )}

          {/* Main games list */}
          <main className={showTopSports || showLiveOnly ? "lg:col-span-9" : "lg:col-span-7"}>
            {fixturesLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-20 rounded-xl bg-white/[0.03] animate-pulse border border-white/[0.04]" />
                ))}
                <p className="text-center text-xs text-muted-foreground/40 pt-2">
                  Fetching live odds from 82+ bookmakers…
                </p>
              </div>
            ) : fixturesError ? (
              <div className="bg-red-500/5 border border-red-500/20 rounded-xl py-12 text-center">
                <AlertCircle className="w-10 h-10 text-red-500/40 mx-auto mb-3" />
                <p className="text-red-400 font-bold text-sm">{(fixturesError as Error).message}</p>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl py-12 text-center">
                <p className="text-gray-500 text-sm">
                  {searchTerm ? "No matches found." : showLiveOnly ? "No live games right now." : "No upcoming games available."}
                </p>
              </div>
            ) : (
              <>
                {/* Bookmaker selector */}
                <div className="flex flex-col sm:flex-row gap-2 mb-4 p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl backdrop-blur-sm">
                  <button
                    onClick={() => setSelectedBookmaker("best")}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                      selectedBookmaker === "best"
                        ? "bg-primary text-black shadow-[0_0_15px_rgba(255,215,0,0.2)]"
                        : "bg-white/[0.04] border border-white/[0.08] text-gray-400 hover:text-white"
                    }`}
                  >
                    🔥 Best Odds
                  </button>
                  <div className="relative flex-1">
                    <select
                      value={selectedBookmaker}
                      onChange={(e) => setSelectedBookmaker(e.target.value)}
                      className="w-full bg-black/40 border border-white/[0.08] rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white focus:outline-none focus:border-primary/40 appearance-none cursor-pointer hover:bg-black/60 transition-all"
                    >
                      <option value="best">Select bookmaker ({Array.from(new Set(fixtures.flatMap((g) => g.bookmakers.map((b) => b.key)))).length} available)</option>
                      {Array.from(new Set(fixtures.flatMap((g) => g.bookmakers.map((b) => b.key)))).sort().map((key) => (
                        <option key={key} value={key}>{bookmakerDisplayName(key)}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500 pointer-events-none" />
                  </div>
                  <span className="text-[10px] text-gray-500 self-center whitespace-nowrap">
                    {searchResults.length} game{searchResults.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Column headers */}
                <div className="hidden md:grid md:grid-cols-12 gap-2 px-4 mb-2 text-[9px] font-black uppercase tracking-widest text-gray-600">
                  <div className="col-span-5">Match</div>
                  <div className="col-span-2 text-center">Spread</div>
                  <div className="col-span-2 text-center">Total</div>
                  <div className="col-span-2 text-center">Moneyline</div>
                  <div className="col-span-1" />
                </div>

                <div className="space-y-2">
                  {searchResults.slice(0, 60).map((game) => (
                    <GameCard
                      key={game.id}
                      game={game}
                      selectedBookmaker={selectedBookmaker}
                      isBetSelected={isBetSelected}
                      toggleBet={toggleBet}
                    />
                  ))}
                </div>
              </>
            )}
          </main>

          {/* Right Sidebar: Bet Slip */}
          {showBetSlip && (
            <aside className="lg:col-span-3">
              <BetSlipPanel
                betSlip={betSlip}
                betAmount={betAmount}
                setBetAmount={setBetAmount}
                selectedCrypto={selectedCrypto}
                setSelectedCrypto={setSelectedCrypto}
                cryptoBalances={cryptoBalances}
                totalUsdBalance={totalUsdBalance}
                totalPotentialPayout={totalPotentialPayout}
                combinedMultiplier={combinedMultiplier}
                isPlacingAll={isPlacingAll}
                onRemoveBet={removeBet}
                onClearSlip={() => setBetSlip([])}
                onPlaceAll={placeAllBets}
                onLogin={() => setLocation("/login")}
                isLoggedIn={!!(user as any)?.id}
              />
            </aside>
          )}
        </div>
      )}

      {/* Bet Detail Modal */}
      {selectedBetDetail && (
        <BetDetailModal bet={selectedBetDetail} onClose={() => setSelectedBetDetail(null)} />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   GameCard sub-component
───────────────────────────────────────────────────────────── */
interface GameCardProps {
  game: Fixture;
  selectedBookmaker: string;
  isBetSelected: (fixtureId: string, marketKey: string, outcomeName: string) => boolean;
  toggleBet: (fixture: Fixture, market: Market, outcome: Outcome, odds: number, bookmaker?: string) => void;
}

function GameCard({ game, selectedBookmaker, isBetSelected, toggleBet }: GameCardProps) {
  const getBestOdds = (marketKey: string, outcomeName: string) => {
    let bestOdds = -Infinity;
    let bestBookmaker: string | null = null;
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

  const getMarket = (key: string): (Market & { _bookmaker?: string }) | null => {
    if (selectedBookmaker === "best") {
      for (const bm of game.bookmakers) {
        const m = bm.markets.find((mk) => mk.key === key);
        if (m) {
          return {
            key,
            outcomes: m.outcomes.map((o) => {
              const best = getBestOdds(key, o.name);
              return { ...o, price: best.odds ?? o.price, _bookmaker: best.bookmaker ?? undefined } as any;
            }),
          };
        }
      }
      return null;
    }
    const activeBm = game.bookmakers.find((b) => b.key === selectedBookmaker);
    return activeBm?.markets.find((m) => m.key === key) ?? null;
  };

  const h2hMarket = getMarket("h2h");
  const spreadsMarket = getMarket("spreads");
  const totalsMarket = getMarket("totals");

  if (!h2hMarket && !spreadsMarket && !totalsMarket) return null;

  const live = isGameLive(game);
  const getBookmakerForOutcome = (market: any, outcomeName: string): string | undefined => {
    if (selectedBookmaker !== "best") return selectedBookmaker;
    const o = market?.outcomes?.find((x: any) => x.name === outcomeName);
    return (o as any)?._bookmaker;
  };

  return (
    <div className={`backdrop-blur-sm border rounded-xl p-3 hover:border-white/[0.14] transition-all group ${
      live
        ? "bg-red-950/20 border-red-500/20 hover:border-red-500/30 shadow-[0_0_20px_rgba(239,68,68,0.06)]"
        : "bg-black/20 border-white/[0.06]"
    }`}>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
        {/* Teams + date + live score */}
        <div className="col-span-1 md:col-span-5 space-y-1.5">
          {/* Top row: league badge + live indicator OR date */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* League badge */}
            <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] text-gray-400">
              {leagueLabel(game.sport_title)}
            </span>
            {live ? (
              <span className="flex items-center gap-1 bg-red-500/15 text-red-400 text-[9px] font-black uppercase px-1.5 py-0.5 rounded border border-red-500/25">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping inline-block" />
                {liveBadgeLabel(game)}
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground/45 font-mono">
                {formatCommenceTime(game.commence_time)}
              </span>
            )}
            {game.inBreak && (
              <span className="text-[9px] font-bold text-yellow-500/70 uppercase tracking-wider">Break</span>
            )}
          </div>

          {/* Team rows with live scores */}
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className={`font-semibold text-sm leading-tight flex-1 min-w-0 truncate ${
                live && game.liveScore && game.liveScore.homeScore! > game.liveScore.awayScore!
                  ? "text-white"
                  : "text-white/85"
              }`}>
                {game.home_team}
              </span>
              {live && (
                <span className={`font-mono font-black text-base tabular-nums flex-shrink-0 ${
                  game.liveScore?.homeScore !== undefined && game.liveScore?.awayScore !== undefined
                  && game.liveScore.homeScore > game.liveScore.awayScore
                    ? "text-primary"
                    : "text-white/70"
                }`}>
                  {game.liveScore?.homeScore ?? "·"}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className={`font-semibold text-sm leading-tight flex-1 min-w-0 truncate ${
                live && game.liveScore && game.liveScore.awayScore! > game.liveScore.homeScore!
                  ? "text-white"
                  : "text-white/70"
              }`}>
                {game.away_team}
              </span>
              {live && (
                <span className={`font-mono font-black text-base tabular-nums flex-shrink-0 ${
                  game.liveScore?.homeScore !== undefined && game.liveScore?.awayScore !== undefined
                  && game.liveScore.awayScore > game.liveScore.homeScore
                    ? "text-primary"
                    : "text-white/70"
                }`}>
                  {game.liveScore?.awayScore ?? "·"}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Spread */}
        <div className="col-span-1 md:col-span-2">
          <div className="text-[9px] text-gray-600 uppercase tracking-wider text-center mb-1 md:hidden">Spread</div>
          <div className="grid grid-cols-2 md:grid-cols-1 gap-1">
            {spreadsMarket?.outcomes.slice(0, 2).map((outcome) => {
              const selected = isBetSelected(game.id, spreadsMarket.key, outcome.name);
              return (
                <OddsButton
                  key={`${game.id}:spread:${outcome.name}`}
                  label={outcome.point !== undefined ? `${outcome.point > 0 ? "+" : ""}${outcome.point}` : "-"}
                  odds={outcome.price}
                  selected={selected}
                  onClick={() => toggleBet(game, spreadsMarket, outcome, outcome.price, getBookmakerForOutcome(spreadsMarket, outcome.name))}
                />
              );
            }) ?? <EmptyOdds />}
          </div>
        </div>

        {/* Totals */}
        <div className="col-span-1 md:col-span-2">
          <div className="text-[9px] text-gray-600 uppercase tracking-wider text-center mb-1 md:hidden">Total</div>
          <div className="grid grid-cols-2 md:grid-cols-1 gap-1">
            {totalsMarket?.outcomes.slice(0, 2).map((outcome) => {
              const selected = isBetSelected(game.id, totalsMarket.key, outcome.name);
              return (
                <OddsButton
                  key={`${game.id}:total:${outcome.name}`}
                  label={`${outcome.name} ${outcome.point ?? ""}`}
                  odds={outcome.price}
                  selected={selected}
                  onClick={() => toggleBet(game, totalsMarket, outcome, outcome.price, getBookmakerForOutcome(totalsMarket, outcome.name))}
                />
              );
            }) ?? <EmptyOdds />}
          </div>
        </div>

        {/* Moneyline */}
        <div className="col-span-1 md:col-span-2">
          <div className="text-[9px] text-gray-600 uppercase tracking-wider text-center mb-1 md:hidden">Moneyline</div>
          <div className="grid grid-cols-2 md:grid-cols-1 gap-1">
            {h2hMarket?.outcomes.slice(0, 2).map((outcome) => {
              const selected = isBetSelected(game.id, h2hMarket.key, outcome.name);
              return (
                <OddsButton
                  key={`${game.id}:h2h:${outcome.name}`}
                  label=""
                  odds={outcome.price}
                  selected={selected}
                  onClick={() => toggleBet(game, h2hMarket, outcome, outcome.price, getBookmakerForOutcome(h2hMarket, outcome.name))}
                />
              );
            }) ?? <EmptyOdds />}
          </div>
        </div>

        {/* Deeplink */}
        <div className="hidden md:flex col-span-1 items-center justify-end">
          {game.bookmakers[0]?.deeplinks && Object.values(game.bookmakers[0].deeplinks)[0] && (
            <a
              href={Object.values(game.bookmakers[0].deeplinks)[0]}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-all text-[10px] font-bold"
              title="Open in bookmaker"
            >
              ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function OddsButton({
  label,
  odds,
  selected,
  onClick,
}: {
  label: string;
  odds: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`p-1.5 rounded-lg text-center transition-all border ${
        selected
          ? "bg-primary/30 border-primary/60 shadow-[0_0_12px_rgba(255,215,0,0.2)]"
          : "bg-white/[0.03] border-white/[0.07] hover:bg-white/[0.07] hover:border-white/20"
      }`}
    >
      {label && <div className="text-[10px] text-gray-400 leading-tight truncate">{label}</div>}
      <div className={`text-xs font-mono font-bold ${selected ? "text-primary" : "text-white"}`}>
        {formatOdds(odds)}
      </div>
    </button>
  );
}

function EmptyOdds() {
  return (
    <div className="p-1.5 rounded-lg bg-white/[0.02] border border-white/[0.04] text-center">
      <div className="text-[10px] text-gray-700 font-mono">—</div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Bet Slip Panel
───────────────────────────────────────────────────────────── */
interface BetSlipPanelProps {
  betSlip: BetSlipEntry[];
  betAmount: string;
  setBetAmount: (v: string) => void;
  selectedCrypto: string;
  setSelectedCrypto: (v: string) => void;
  cryptoBalances: any[];
  totalUsdBalance: number;
  totalPotentialPayout: string;
  combinedMultiplier: number;
  isPlacingAll: boolean;
  onRemoveBet: (id: string) => void;
  onClearSlip: () => void;
  onPlaceAll: () => void;
  onLogin: () => void;
  isLoggedIn: boolean;
}

function BetSlipPanel({
  betSlip, betAmount, setBetAmount, selectedCrypto, setSelectedCrypto,
  cryptoBalances, totalUsdBalance, totalPotentialPayout, combinedMultiplier,
  isPlacingAll, onRemoveBet, onClearSlip, onPlaceAll, onLogin, isLoggedIn,
}: BetSlipPanelProps) {
  return (
    <div className="sticky top-4 bg-black/30 backdrop-blur-xl border border-white/[0.08] rounded-xl p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-black uppercase tracking-widest text-xs text-white">
          🎯 Bet Slip {betSlip.length > 0 && <span className="text-primary ml-1">({betSlip.length})</span>}
        </h3>
        <div className="text-right">
          <p className="text-[9px] text-gray-500 uppercase">Balance</p>
          <p className="text-sm font-black text-primary">
            ${totalUsdBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {betSlip.length === 0 ? (
        <div className="text-center py-8">
          <div className="text-3xl mb-2">🎯</div>
          <p className="text-xs text-gray-500">Click any odds to add to your slip</p>
          <p className="text-[10px] text-gray-600 mt-1">Support multi-bet & parlay</p>
        </div>
      ) : (
        <>
          {/* Selections */}
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {betSlip.map((entry) => (
              <div
                key={entry.slipId}
                className="bg-white/[0.04] rounded-lg p-2.5 border border-white/[0.06] relative group"
              >
                <button
                  onClick={() => onRemoveBet(entry.slipId)}
                  className="absolute top-1.5 right-1.5 text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <X className="w-3 h-3" />
                </button>
                <p className="text-[10px] text-gray-400 leading-tight mb-0.5">
                  {entry.fixture.home_team} vs {entry.fixture.away_team}
                </p>
                <p className="text-xs font-bold text-white leading-tight">
                  {entry.outcome.name}
                  {entry.market.key === "spreads" && entry.outcome.point !== undefined && (
                    <span className="text-gray-400"> ({entry.outcome.point > 0 ? "+" : ""}{entry.outcome.point})</span>
                  )}
                  {entry.market.key === "totals" && entry.outcome.point !== undefined && (
                    <span className="text-gray-400"> {entry.outcome.point}</span>
                  )}
                </p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[9px] text-gray-500 uppercase tracking-wider">
                    {entry.market.key === "h2h" ? "Moneyline" : entry.market.key === "spreads" ? "Spread" : "Total"}
                    {entry.bookmaker && ` · ${bookmakerDisplayName(entry.bookmaker)}`}
                  </span>
                  <span className="text-xs font-mono font-black text-primary">
                    {formatOdds(entry.odds)}
                  </span>
                </div>
                <p className="text-[9px] text-gray-600 mt-0.5">
                  {formatCommenceTime(entry.fixture.commence_time)}
                </p>
              </div>
            ))}
          </div>

          {/* Wager input */}
          <div>
            <label className="text-[10px] text-gray-500 mb-1.5 block uppercase tracking-wider">Amount per bet (USD)</label>
            <Input
              type="number"
              value={betAmount}
              onChange={(e) => setBetAmount(e.target.value)}
              placeholder="0.00"
              className="bg-white/[0.05] border-white/[0.1] text-white h-9 text-sm"
              min="0"
              step="0.01"
            />
          </div>

          {/* Crypto selector */}
          {cryptoBalances.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {cryptoBalances.map((bal) => {
                const sym = bal.currency.split("_")[0];
                return (
                  <button
                    key={bal.currency}
                    onClick={() => setSelectedCrypto(sym)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                      selectedCrypto === sym
                        ? "bg-primary/30 border border-primary/50 text-primary"
                        : "bg-white/[0.03] border border-white/[0.07] text-gray-400 hover:text-white"
                    }`}
                  >
                    <CoinIcon currency={bal.currency} size={12} />
                    <span>{sym}</span>
                    <span className="text-gray-500">${bal.usdValue.toFixed(0)}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Summary */}
          <div className="bg-white/[0.04] rounded-lg p-3 space-y-1.5 border border-white/[0.06]">
            <div className="flex justify-between text-[11px]">
              <span className="text-gray-500">Selections</span>
              <span className="text-white font-bold">{betSlip.length}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-gray-500">Total Staked</span>
              <span className="text-white font-bold">
                ${betAmount ? (parseFloat(betAmount) * betSlip.length).toFixed(2) : "0.00"}
              </span>
            </div>
            <div className="flex justify-between text-[11px] border-t border-white/[0.05] pt-1.5">
              <span className="text-gray-500">Total Potential</span>
              <span className="text-primary font-black">${totalPotentialPayout}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2">
            {!isLoggedIn ? (
              <Button onClick={onLogin} className="w-full bg-primary hover:bg-primary/90 text-black font-black uppercase tracking-widest text-xs h-9">
                Login to Bet
              </Button>
            ) : (
              <Button
                onClick={onPlaceAll}
                disabled={isPlacingAll || !betAmount || parseFloat(betAmount) <= 0}
                className="w-full bg-primary hover:bg-primary/90 text-black font-black uppercase tracking-widest text-xs h-9"
              >
                {isPlacingAll ? "Placing..." : `Place ${betSlip.length} Bet${betSlip.length > 1 ? "s" : ""}`}
              </Button>
            )}
            <button
              onClick={onClearSlip}
              className="w-full flex items-center justify-center gap-1.5 text-[10px] text-gray-500 hover:text-red-400 transition-colors py-1"
            >
              <Trash2 className="w-3 h-3" />
              Clear slip
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Bet History
───────────────────────────────────────────────────────────── */
function BetHistory({
  bets,
  loading,
  onSelect,
}: {
  bets: SportsBet[];
  loading: boolean;
  onSelect: (bet: SportsBet) => void;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  if (bets.length === 0) {
    return (
      <div className="bg-white/[0.02] border border-dashed border-white/[0.07] rounded-xl py-16 text-center">
        <Trophy className="w-10 h-10 text-gray-700 mx-auto mb-3" />
        <p className="text-gray-500 text-sm">No bets placed yet.</p>
      </div>
    );
  }

  const pending = bets.filter((b) => b.status === "pending");
  const settled = bets.filter((b) => b.status !== "pending");

  return (
    <div className="space-y-4">
      {pending.length > 0 && (
        <div>
          <h3 className="text-xs font-black uppercase tracking-widest text-blue-400 mb-2">
            ⏳ Pending ({pending.length})
          </h3>
          <div className="space-y-2">
            {pending.map((bet) => <BetHistoryRow key={bet.id} bet={bet} onClick={() => onSelect(bet)} />)}
          </div>
        </div>
      )}
      {settled.length > 0 && (
        <div>
          <h3 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-2">
            Settled ({settled.length})
          </h3>
          <div className="space-y-2">
            {settled.map((bet) => <BetHistoryRow key={bet.id} bet={bet} onClick={() => onSelect(bet)} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function BetHistoryRow({ bet, onClick }: { bet: SportsBet; onClick: () => void }) {
  const statusColor =
    bet.status === "won" ? "border-green-500/20 hover:border-green-500/40"
    : bet.status === "lost" ? "border-red-500/20 hover:border-red-500/40"
    : "border-blue-500/20 hover:border-blue-500/40";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-black/20 border rounded-xl p-3 flex items-center justify-between gap-3 transition-all ${statusColor}`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white truncate">{bet.homeTeam} vs {bet.awayTeam}</p>
        <p className="text-[10px] text-gray-400">{bet.selectedOutcome} @ {formatOdds(parseFloat(bet.odds))}</p>
        <p className="text-[10px] text-gray-600">{new Date(bet.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="text-right">
          <p className="text-[9px] text-gray-500">Wager</p>
          <p className="text-xs font-bold text-white">${parseFloat(bet.betAmountUsd).toFixed(2)}</p>
        </div>
        <Badge
          className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 ${
            bet.status === "won" ? "bg-green-500/20 text-green-400 border-green-500/30"
            : bet.status === "lost" ? "bg-red-500/20 text-red-400 border-red-500/30"
            : "bg-blue-500/20 text-blue-400 border-blue-500/30"
          }`}
        >
          {bet.status === "pending" ? "Pending" : bet.status === "won" ? "Won" : "Lost"}
        </Badge>
      </div>
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────
   Bet Detail Modal
───────────────────────────────────────────────────────────── */
function BetDetailModal({ bet, onClose }: { bet: SportsBet; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div
        className={`bg-black/60 border rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4 backdrop-blur-xl ${
          bet.status === "won" ? "border-green-500/30" : bet.status === "lost" ? "border-red-500/30" : "border-blue-500/30"
        }`}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Bet Details</p>
            <h2 className="text-base font-black text-white mt-0.5">{bet.homeTeam} vs {bet.awayTeam}</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <Badge
          className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 ${
            bet.status === "won" ? "bg-green-500/20 text-green-400 border-green-500/30"
            : bet.status === "lost" ? "bg-red-500/20 text-red-400 border-red-500/30"
            : "bg-blue-500/20 text-blue-400 border-blue-500/30"
          }`}
        >
          {bet.status === "pending" ? "⏳ Pending" : bet.status === "won" ? "🏆 Won" : "❌ Lost"}
        </Badge>

        <div className="space-y-2 bg-white/[0.04] rounded-xl p-3 border border-white/[0.06]">
          {[
            ["Selection", bet.selectedOutcome],
            ["Odds", formatOdds(parseFloat(bet.odds))],
            ["Market", (bet as any).marketKey ?? "—"],
            ["Wager", `$${parseFloat(bet.betAmountUsd).toFixed(2)}`],
            ["Potential Payout", `$${parseFloat(bet.potentialPayoutUsd).toFixed(2)}`],
            ["Multiplier", `${americanOddsToMultiplier(parseFloat(bet.odds)).toFixed(2)}x`],
            ["Placed", new Date(bet.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })],
            ...(bet.settledAt ? [["Settled", new Date(bet.settledAt).toLocaleString(undefined, { month: "short", day: "numeric" })]] : []),
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between text-xs">
              <span className="text-gray-400">{label}</span>
              <span className="text-white font-bold">{value}</span>
            </div>
          ))}
        </div>

        <Button
          onClick={onClose}
          className="w-full bg-primary hover:bg-primary/90 text-black font-black uppercase text-xs h-8"
        >
          Close
        </Button>
      </div>
    </div>
  );
}
