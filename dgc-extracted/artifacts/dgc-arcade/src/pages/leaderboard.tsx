import { useGetLeaderboard, getGetLeaderboardQueryKey } from "@workspace/api-client-react";
import { formatCurrency, formatNumber } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Trophy, Medal, Crown } from "lucide-react";

export default function Leaderboard() {
  const { data: leaderboard, isLoading } = useGetLeaderboard({ limit: 50 }, {
    query: { queryKey: getGetLeaderboardQueryKey({ limit: 50 }) }
  });

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1: return <Crown className="w-6 h-6 text-yellow-500" />;
      case 2: return <Medal className="w-6 h-6 text-gray-400" />;
      case 3: return <Medal className="w-6 h-6 text-amber-700" />;
      default: return <span className="font-mono text-muted-foreground w-6 text-center inline-block">{rank}</span>;
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="text-center space-y-4 mb-12">
        <div className="w-20 h-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-6">
          <Trophy className="w-10 h-10 text-primary" />
        </div>
        <h1 className="font-display font-black text-4xl md:text-5xl uppercase tracking-widest">Hall of Fame</h1>
        <p className="text-muted-foreground max-w-xl mx-auto">
          The highest rollers and biggest winners in the DGC Arcade. Rankings based on total net winnings.
        </p>
      </div>

      <Card className="bg-card border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border">
              <tr>
                <th className="px-6 py-4 font-medium w-24 text-center">Rank</th>
                <th className="px-6 py-4 font-medium">Player</th>
                <th className="px-6 py-4 font-medium text-right">Total Bets</th>
                <th className="px-6 py-4 font-medium text-right text-primary">Total Won</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center">
                    <div className="animate-pulse space-y-4">
                      {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="h-10 bg-secondary rounded-md w-full" />
                      ))}
                    </div>
                  </td>
                </tr>
              ) : !leaderboard?.length ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground font-mono">
                    No players found. The leaderboard is empty.
                  </td>
                </tr>
              ) : (
                leaderboard.map((entry, idx) => (
                  <tr 
                    key={entry.userId} 
                    className={`border-b border-border/50 transition-colors ${
                      idx < 3 ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-secondary/20'
                    }`}
                  >
                    <td className="px-6 py-4 text-center">
                      <div className="flex justify-center">{getRankIcon(entry.rank)}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center font-bold text-xs text-primary">
                          {entry.username.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-mono font-bold text-foreground">{entry.username}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-muted-foreground">
                      {formatNumber(entry.totalBets)}
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-bold text-primary">
                      {formatCurrency(entry.totalWon)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
