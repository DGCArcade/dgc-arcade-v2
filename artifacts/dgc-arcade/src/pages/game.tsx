import { useParams, Link, useLocation } from "wouter";
import { useGetGame, getGetGameQueryKey, useListBets, getListBetsQueryKey, type BetRecord, type Game } from "@workspace/api-client-react";
import { GameRenderer } from "@/components/games/game-renderer";
import { formatCurrency } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { ChevronLeft, Trophy, Timer, ChevronDown, ChevronUp, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { createPortal } from "react-dom";

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

function MobileGamePageOverlay({
  game,
  onClose,
  showBets,
  setShowBets,
  gameBets,
}: {
  game: Game;
  onClose: () => void;
  showBets: boolean;
  setShowBets: (v: boolean | ((prev: boolean) => boolean)) => void;
  gameBets: BetRecord[];
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  return createPortal(
    <div className="mobile-game-overlay" role="dialog" aria-modal="true" aria-label={game.name}>
      <div className="mobile-game-overlay-header">
        <button type="button" onClick={onClose} className="mobile-game-overlay-back">
          <ChevronLeft className="w-5 h-5" />
          <span>Back</span>
        </button>
        <div className="mobile-game-overlay-title">
          <h1>{game.name}</h1>
          <p>{formatCurrency(game.minBet)} – {formatCurrency(game.maxBet)}</p>
        </div>
        <button type="button" onClick={onClose} className="mobile-game-overlay-close" aria-label="Close game">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="mobile-game-overlay-body">
        <GameRenderer game={game} />
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
    </div>,
    document.body,
  );
}

export default function GamePage() {
  const params = useParams();
  const gameId = Number(params.gameId);
  const isMobile = useIsMobile();
  const [, setLocation] = useLocation();
  const [showBets, setShowBets] = useState(false);

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
    },
  });

  if (isLoading) {
    return isMobile ? null : (
      <div className="animate-pulse bg-secondary h-96 rounded-xl border border-border" />
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

  if (isMobile) {
    return (
      <MobileGamePageOverlay
        game={game}
        onClose={() => setLocation("/games")}
        showBets={showBets}
        setShowBets={setShowBets}
        gameBets={gameBets}
      />
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

      <GameRenderer game={game} />

      <section className="pt-4">
        <h3 className="font-display font-bold text-2xl uppercase tracking-widest mb-6">Your Recent Bets</h3>
        <RecentBetsTable gameBets={gameBets} />
      </section>
    </div>
  );
}
