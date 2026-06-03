import { useListRecentBetsAll, getListRecentBetsAllQueryKey } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Link } from "wouter";

export function LiveFeed() {
  const { data: bets } = useListRecentBetsAll({ limit: 15 }, {
    query: {
      queryKey: getListRecentBetsAllQueryKey({ limit: 15 }),
      refetchInterval: 5000,
    }
  });

  return (
    <Card className="bg-card border-border overflow-hidden">
      <div className="p-4 border-b border-border bg-secondary/50 flex justify-between items-center">
        <h3 className="font-display font-bold uppercase tracking-widest text-lg flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          Live Bets
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-muted-foreground uppercase bg-secondary/30">
            <tr>
              <th className="px-6 py-3 font-medium">Game</th>
              <th className="px-6 py-3 font-medium">Player</th>
              <th className="px-6 py-3 font-medium text-right">Bet</th>
              <th className="px-6 py-3 font-medium text-right">Multiplier</th>
              <th className="px-6 py-3 font-medium text-right">Payout</th>
            </tr>
          </thead>
          <tbody>
            {!bets?.length ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                  No recent bets.
                </td>
              </tr>
            ) : (
              bets.map((bet) => (
                <tr key={bet.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                  <td className="px-6 py-4 font-medium">
                    <Link href={`/games/${bet.gameId}`} className="hover:text-primary transition-colors">
                      {bet.gameName}
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-mono text-muted-foreground">{bet.username}</span>
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
  );
}
