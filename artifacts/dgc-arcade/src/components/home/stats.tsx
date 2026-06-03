import { useGetPlatformStats, getGetPlatformStatsQueryKey } from "@workspace/api-client-react";
import { formatCurrency, formatNumber } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Users, Coins, Trophy, TrendingUp } from "lucide-react";

export function PlatformStats() {
  const { data: stats, isLoading } = useGetPlatformStats({
    query: {
      queryKey: getGetPlatformStatsQueryKey(),
      refetchInterval: 30000,
    }
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="p-6 bg-card border-border animate-pulse h-24" />
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const statItems = [
    { label: "Total Players", value: formatNumber(stats.totalPlayers), icon: Users, color: "text-blue-500" },
    { label: "Total Bets", value: formatNumber(stats.totalBets), icon: TrendingUp, color: "text-green-500" },
    { label: "Total Wagered", value: formatCurrency(stats.totalWagered), icon: Coins, color: "text-primary" },
    { label: "Biggest Win", value: formatCurrency(stats.biggestWin), icon: Trophy, color: "text-yellow-500" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {statItems.map((stat, i) => (
        <Card key={i} className="p-6 bg-card border-border border flex items-center gap-4 hover:border-primary/50 transition-colors">
          <div className={`p-3 rounded-full bg-secondary ${stat.color}`}>
            <stat.icon className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground uppercase tracking-wider font-medium">{stat.label}</p>
            <p className="text-2xl font-bold font-mono text-foreground">{stat.value}</p>
          </div>
        </Card>
      ))}
    </div>
  );
}
