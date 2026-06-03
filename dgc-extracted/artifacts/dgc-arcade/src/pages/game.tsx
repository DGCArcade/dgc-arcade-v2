import { useRoute, useParams, Link } from "wouter";
import { useGetGame, getGetGameQueryKey, useListBets, getListBetsQueryKey } from "@workspace/api-client-react";
import { Coinflip } from "@/components/games/coinflip";
import { Slots } from "@/components/games/slots";
import { Crash } from "@/components/games/crash";
import { formatCurrency } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { ChevronLeft } from "lucide-react";

export default function GamePage() {
  const params = useParams();
  const gameId = Number(params.gameId);
  
  const { data: game, isLoading } = useGetGame(gameId, {
    query: {
      queryKey: getGetGameQueryKey(gameId),
      enabled: !!gameId && !isNaN(gameId)
    }
  });

  const { data: bets } = useListBets({ limit: 10 }, {
    query: {
      queryKey: getListBetsQueryKey({ limit: 10 }),
      refetchInterval: 5000,
    }
  });

  if (isLoading) {
    return <div className="animate-pulse bg-secondary h-96 rounded-xl border border-border" />;
  }

  if (!game) {
    return (
      <div className="text-center py-20">
        <h2 className="font-display font-bold text-3xl uppercase tracking-widest mb-4">Game Not Found</h2>
        <Link href="/games" className="text-primary hover:underline font-bold uppercase">
          Back to Lobby
        </Link>
      </div>
    );
  }

  // Filter bets to only show those for this game
  const gameBets = bets?.filter(b => b.gameId === game.id) || [];

  return (
    <div className="space-y-8">
      <Link href="/games" className="inline-flex items-center text-sm font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
        <ChevronLeft className="w-4 h-4 mr-1" />
        Back to Games
      </Link>
      
      <div className="flex justify-between items-end border-b border-border/50 pb-6">
        <div>
          <h1 className="font-display font-black text-4xl uppercase tracking-widest mb-2">{game.name}</h1>
          <div className="flex gap-4 items-center">
            <p className="text-muted-foreground">{game.description}</p>
            {game.houseEdge && (
              <span className="text-xs font-mono bg-secondary px-2 py-1 rounded text-muted-foreground border border-border">
                House Edge: {game.houseEdge}%
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Render the specific game component */}
      {game.slug === 'coinflip' && <Coinflip game={game} />}
      {game.slug === 'slots' && <Slots game={game} />}
      {game.slug === 'crash' && <Crash game={game} />}

      {/* Recent Bets for this user on this game */}
      <section className="pt-8">
        <h3 className="font-display font-bold text-2xl uppercase tracking-widest mb-6">Your Recent Bets</h3>
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
                    <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground font-mono">
                      No recent bets on this game.
                    </td>
                  </tr>
                ) : (
                  gameBets.map((bet) => (
                    <tr key={bet.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                      <td className="px-6 py-4 text-muted-foreground font-mono text-xs">
                        {new Date(bet.createdAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right font-mono">
                        {formatCurrency(bet.amount)}
                      </td>
                      <td className="px-6 py-4 text-right font-mono">
                        {bet.multiplier ? `${bet.multiplier.toFixed(2)}x` : '-'}
                      </td>
                      <td className={`px-6 py-4 text-right font-mono font-bold ${bet.won ? 'text-green-500' : 'text-muted-foreground'}`}>
                        {bet.won ? `+${formatCurrency(bet.payout)}` : formatCurrency(0)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </section>
    </div>
  );
}
