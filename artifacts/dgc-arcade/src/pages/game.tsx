import { useParams, Link } from "wouter";
import { useGetGame, getGetGameQueryKey, useListBets, getListBetsQueryKey, type BetRecord, type Game } from "@workspace/api-client-react";
import { GameRenderer } from "@/components/games/game-renderer";
import { formatCurrency } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { ChevronLeft, Trophy, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/use-auth";

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
    fetch("/api/users/tournaments/active", {
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

function RecentBetsTable({ gameBets, compact = false }: { gameBets: BetRecord[]; compact?: boolean }) {
  return (
    <Card className="bg-card border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-muted-foreground uppercase bg-secondary/30">
            <tr>
              <th className={`${compact ? "px-3 py-2" : "px-6 py-3"} font-medium`}>Time</th>
              <th className={`${compact ? "px-3 py-2" : "px-6 py-3"} font-medium text-right`}>Bet</th>
              <th className={`${compact ? "px-3 py-2" : "px-6 py-3"} font-medium text-right`}>Mult</th>
              <th className={`${compact ? "px-3 py-2" : "px-6 py-3"} font-medium text-right`}>Result</th>
            </tr>
          </thead>
          <tbody>
            {!gameBets.length ? (
              <tr>
                <td colSpan={4} className={`${compact ? "px-3 py-6" : "px-6 py-8"} text-center text-muted-foreground font-mono text-xs`}>
                  No recent bets on this game.
                </td>
              </tr>
            ) : (
              gameBets.map(bet => (
                <tr key={bet.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                  <td className={`${compact ? "px-3 py-2" : "px-6 py-4"} text-muted-foreground font-mono text-xs`}>
                    {compact
                      ? new Date(bet.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                      : new Date(bet.createdAt).toLocaleString()}
                  </td>
                  <td className={`${compact ? "px-3 py-2" : "px-6 py-4"} text-right font-mono text-xs`}>{formatCurrency(bet.amount)}</td>
                  <td className={`${compact ? "px-3 py-2" : "px-6 py-4"} text-right font-mono text-xs`}>{bet.multiplier ? `${bet.multiplier.toFixed(2)}x` : "-"}</td>
                  <td className={`${compact ? "px-3 py-2" : "px-6 py-4"} text-right font-mono font-bold text-xs ${bet.won ? "text-green-400" : "text-muted-foreground"}`}>
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

function GameHeader({ game, compact = false }: { game: Game; compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex justify-between items-center border-b border-border/50 pb-2 gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="font-display font-black text-lg uppercase tracking-widest truncate text-glow-shift">
            {game.name}
          </h1>
          <div className="flex gap-2 items-center flex-wrap mt-0.5">
            {game.houseEdge != null && (
              <span className="text-[10px] font-mono bg-secondary px-1.5 py-0.5 rounded text-muted-foreground border border-border">
                Edge: {game.houseEdge}%
              </span>
            )}
            <span className="flex items-center gap-1 text-[10px] font-bold text-green-400">
              <span className="live-dot w-1.5 h-1.5 rounded-full bg-green-400" />Live
            </span>
          </div>
        </div>
        <div className="text-right text-[10px] text-muted-foreground font-mono space-y-0.5 shrink-0">
          <div>Min <span className="text-foreground">{formatCurrency(game.minBet)}</span></div>
          <div>Max <span className="text-foreground">{formatCurrency(game.maxBet)}</span></div>
        </div>
      </div>
    );
  }

  return (
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
  );
}

export default function GamePage() {
  const params = useParams();
  const gameId = Number(params.gameId);
  const isMobile = useIsMobile();
  const { isAuthenticated } = useAuth();

  const { data: game, isLoading } = useGetGame(gameId, {
    query: {
      queryKey: getGetGameQueryKey(gameId),
      enabled: !!gameId && !isNaN(gameId),
    },
  });

  const { data: bets } = useListBets({ limit: 10 }, {
    query: {
      queryKey: getListBetsQueryKey({ limit: 10 }),
      refetchInterval: 5000,
      enabled: isAuthenticated,
    },
  });

  if (isLoading) {
    return (
      <div className="animate-pulse bg-secondary h-48 md:h-96 rounded-xl border border-border" />
    );
  }

  if (!game) {
    return (
      <div className="text-center py-20">
        <h2 className="font-display font-bold text-3xl uppercase tracking-widest mb-4">Game Not Found</h2>
        <Link href="/games" className="text-primary hover:underline font-bold uppercase">Back to Lobby</Link>
      </div>
    );
  }

  const gameBets = Array.isArray(bets) ? bets.filter(b => b.gameId === game.id) : [];

  return (
    <div className="space-y-3 md:space-y-6">
      <Link href="/games" className="inline-flex items-center text-xs md:text-sm font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
        <ChevronLeft className="w-4 h-4 mr-1" />Back to Games
      </Link>

      {!isMobile && <TournamentBanner />}

      <GameHeader game={game} compact={isMobile} />

      <div className={isMobile ? `mobile-game-play-area mobile-game--${game.slug}` : undefined}>
        <GameRenderer game={game} />
      </div>

      <section className="pt-2 md:pt-4">
        <h3 className="font-display font-bold text-base md:text-2xl uppercase tracking-widest mb-3 md:mb-6">
          Your Recent Bets
        </h3>
        <RecentBetsTable gameBets={gameBets} compact={isMobile} />
      </section>
    </div>
  );
}
