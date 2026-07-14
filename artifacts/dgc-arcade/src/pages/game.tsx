import { useParams, Link, useLocation } from "wouter";
import { useListBets, getListBetsQueryKey, type BetRecord, type Game } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Coinflip } from "@/components/games/coinflip";
import { Slots } from "@/components/games/slots";
import { CrashGameLive as Crash } from "@/components/games/crash-game-live";
import { Blackjack } from "@/components/games/blackjack";
import { Roulette } from "@/components/games/roulette";
import { Mines } from "@/components/games/mines";
import { HiLo } from "@/components/games/hilo";
import { Keno } from "@/components/games/keno";
import { DiceGameLive as DiceGame } from "@/components/games/dice-game-live";
import { ChickenRoad } from "@/components/games/chicken-road";
import { ErrorBoundary } from "@/components/error-boundary";
import { formatCurrency } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { ChevronLeft, Trophy, Timer, ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/use-auth";
import { getApiUrl } from "@/lib/api-fetch";

interface TournamentInfo {
  tournament: { id: number; name: string; description: string | null; prize: string; endAt: string };
  rank: number | null;
  totalPlayers: number;
  userScore: string | null;
}

function TournamentBanner({ compact = false }: { compact?: boolean }) {
  const [info, setInfo] = useState<TournamentInfo | null>(null);
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("dgc_token");
    fetch(getApiUrl("/api/users/tournaments/active"), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.tournament) setInfo(d); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!info?.tournament?.endAt) return;
    function tick() {
      const diff = new Date(info!.tournament.endAt).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft("Ended"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${h}h ${m}m ${s}s`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [info]);

  if (!info) return null;

  const { tournament, rank, totalPlayers, userScore } = info;

  if (compact) {
    return (
      <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 flex items-center gap-2 text-xs">
        <Trophy className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
        <span className="font-bold text-yellow-400 truncate flex-1">{tournament.name}</span>
        <span className="font-mono text-amber-400 shrink-0">{timeLeft}</span>
        {rank !== null && <span className="text-yellow-300 shrink-0">#{rank}</span>}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-yellow-500/30 bg-gradient-to-r from-yellow-500/10 via-amber-500/5 to-transparent p-4 flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center shrink-0">
          <Trophy className="w-5 h-5 text-yellow-400" />
        </div>
        <div className="min-w-0">
          <p className="font-display font-black uppercase tracking-widest text-yellow-400 text-sm leading-tight truncate">{tournament.name}</p>
          <p className="text-xs text-muted-foreground">Prize: <span className="text-yellow-300 font-bold font-mono">{formatCurrency(parseFloat(tournament.prize))}</span></p>
        </div>
      </div>

      <div className="flex items-center gap-6 text-xs">
        {rank !== null && (
          <div className="text-center">
            <p className="text-muted-foreground uppercase tracking-wider">Your Rank</p>
            <p className="font-black text-xl text-yellow-400">#{rank}</p>
            <p className="text-muted-foreground">of {totalPlayers}</p>
          </div>
        )}
        {userScore && (
          <div className="text-center">
            <p className="text-muted-foreground uppercase tracking-wider">Wagered</p>
            <p className="font-bold text-foreground font-mono">{formatCurrency(parseFloat(userScore))}</p>
          </div>
        )}
        <div className="text-center">
          <div className="flex items-center gap-1 text-muted-foreground uppercase tracking-wider justify-center">
            <Timer className="w-3 h-3" /> Ends in
          </div>
          <p className="font-mono font-bold text-amber-400">{timeLeft}</p>
        </div>
      </div>
    </div>
  );
}

function RecentBetsTable({ gameBets }: { gameBets: BetRecord[] }) {
  return (
    <Card className="bg-card border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-muted-foreground uppercase bg-secondary/30">
            <tr>
              <th className="px-6 py-3 font-medium">Time</th>
              <th className="px-6 py-3 font-medium text-right">Bet Amount</th>
              <th className="px-6 py-3 font-medium text-right">Multiplier</th>
              <th className="px-6 py-3 font-medium text-right">Result</th>
            </tr>
          </thead>
          <tbody>
            {!gameBets.length ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground font-mono">No recent bets on this game.</td>
              </tr>
            ) : (
              gameBets.map(bet => (
                <tr key={bet.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                  <td className="px-6 py-4 text-muted-foreground font-mono text-xs">{new Date(bet.createdAt).toLocaleString()}</td>
                  <td className="px-6 py-4 text-right font-mono">{formatCurrency(bet.amount)}</td>
                  <td className="px-6 py-4 text-right font-mono">{bet.multiplier ? `${bet.multiplier.toFixed(2)}x` : "-"}</td>
                  <td className={`px-6 py-4 text-right font-mono font-bold ${bet.won ? "text-green-400" : "text-muted-foreground"}`}>
                    {bet.won ? `+${formatCurrency(bet.payout)}` : formatCurrency(0)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function GamePage() {
  const params = useParams();
  const gameRef = String(params.gameId ?? "").trim();
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const { isAuthenticated } = useAuth();
  const [showBets, setShowBets] = useState(false);

  const { data: game, isLoading, isError } = useQuery<Game>({
    queryKey: ["/api/games", gameRef],
    enabled: gameRef.length > 0,
    queryFn: async () => {
      const res = await fetch(getApiUrl(`/api/games/${encodeURIComponent(gameRef)}`));
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Game not found");
      }
      return res.json();
    },
  });

  useEffect(() => {
    if (game?.slug === "race") setLocation("/race");
  }, [game?.slug, setLocation]);

  const { data: bets } = useListBets({ limit: 10 }, {
    query: {
      queryKey: getListBetsQueryKey({ limit: 10 }),
      refetchInterval: 15_000,
      enabled: isAuthenticated,
    },
  });

  if (isLoading) {
    return isMobile ? (
      <div className="game-mobile-shell">
        <div className="flex items-center justify-center flex-1">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-primary" />
        </div>
      </div>
    ) : (
      <div className="animate-pulse bg-secondary h-96 rounded-xl border border-border" />
    );
  }

  if (!game) {
    return (
      <div className="text-center py-20 px-4">
        <h2 className="font-display font-bold text-3xl uppercase tracking-widest mb-4">
          {isError ? "Could Not Load Game" : "Game Not Found"}
        </h2>
        <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
          {isError
            ? "The game server could not be reached, or this game may be disabled. Try again from the lobby."
            : gameRef
              ? `No active game matches “${gameRef}”. IDs differ between environments — use the lobby link instead of a saved numeric URL.`
              : "Invalid game link."}
        </p>
        <Link href="/games" className="text-primary hover:underline font-bold uppercase">Back to Lobby</Link>
      </div>
    );
  }

  if (game.slug === "race") {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-primary" />
      </div>
    );
  }

  const gameBets = Array.isArray(bets) ? bets.filter(b => b.gameId === game.id) : [];

  function renderGame() {
    if (!game) return null;
    switch (game.slug) {
      case "coinflip":  return <Coinflip game={game} />;
      case "slots":     return <Slots game={game} />;
      case "crash":     return <Crash game={game} />;
      case "blackjack": return <Blackjack game={game} />;
      case "roulette":  return <Roulette game={game} />;
      case "mines":     return <Mines game={game} />;
      case "hilo":
      case "hi-lo":     return <HiLo game={game} />;
      case "keno":      return <Keno game={game} />;
      case "dice":      return <DiceGame game={game} />;
      case "chicken-road": return <ChickenRoad game={game} />;
      default:
        return (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-4 border border-border/50 rounded-xl bg-secondary/30">
            <div className="text-6xl font-display font-black text-primary/20">{game.slug.charAt(0).toUpperCase()}</div>
            <p className="text-muted-foreground">Game coming soon</p>
          </div>
        );
    }
  }

  if (isMobile) {
    return (
      <div className="game-mobile-shell">
        <div className="game-mobile-header">
          <Link href="/games" className="inline-flex items-center text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors shrink-0">
            <ChevronLeft className="w-4 h-4" /> Back
          </Link>
          <div className="min-w-0 flex-1 text-center px-2">
            <h1 className="font-display font-black text-sm uppercase tracking-widest truncate">{game.name}</h1>
            <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground font-mono">
              <span>{formatCurrency(game.minBet)}–{formatCurrency(game.maxBet)}</span>
              <span className="flex items-center gap-0.5 text-green-400 font-bold">
                <span className="live-dot w-1 h-1 rounded-full bg-green-400" />Live
              </span>
            </div>
          </div>
          <div className="w-12 shrink-0" />
        </div>

        <div className="px-2 pb-1">
          <TournamentBanner compact />
        </div>

        <div className={`game-mobile-viewport mobile-game-play-area mobile-game--${game.slug}`}>
          <ErrorBoundary key={game.slug}>
            {renderGame()}
          </ErrorBoundary>
        </div>

        <button
          type="button"
          onClick={() => setShowBets(v => !v)}
          className="game-mobile-bets-toggle"
        >
          {showBets ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
          Recent Bets ({gameBets.length})
        </button>

        {showBets && (
          <div className="game-mobile-bets-panel px-2 pb-2">
            <RecentBetsTable gameBets={gameBets} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 md:space-y-6">
      <Link href="/games" className="inline-flex items-center text-sm font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
        <ChevronLeft className="w-4 h-4 mr-1" />Back to Games
      </Link>

      <TournamentBanner />

      <div className="flex justify-between items-start md:items-end border-b border-border/50 pb-3 md:pb-6 gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="font-display font-black text-2xl md:text-4xl uppercase tracking-widest mb-1 md:mb-2 text-glow-shift truncate">
            {game.name}
          </h1>
          <div className="flex gap-2 md:gap-3 items-center flex-wrap">
            <p className="text-muted-foreground text-sm hidden md:block">{game.description}</p>
            {game.houseEdge != null && (
              <span className="text-xs font-mono bg-secondary px-2 py-0.5 rounded text-muted-foreground border border-border">
                Edge: {game.houseEdge}%
              </span>
            )}
            <span className="flex items-center gap-1 text-xs font-bold text-green-400">
              <span className="live-dot w-1.5 h-1.5 rounded-full bg-green-400" />Live
            </span>
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground font-mono space-y-0.5 shrink-0">
          <div>Min <span className="text-foreground">{formatCurrency(game.minBet)}</span></div>
          <div>Max <span className="text-foreground">{formatCurrency(game.maxBet)}</span></div>
        </div>
      </div>

      <ErrorBoundary key={game.slug}>
        {renderGame()}
      </ErrorBoundary>

      <section className="pt-4">
        <h3 className="font-display font-bold text-2xl uppercase tracking-widest mb-6">Your Recent Bets</h3>
        <RecentBetsTable gameBets={gameBets} />
      </section>
    </div>
  );
}
