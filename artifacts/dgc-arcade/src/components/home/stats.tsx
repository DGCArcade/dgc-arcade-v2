import { useGetPlatformStats, getGetPlatformStatsQueryKey } from "@workspace/api-client-react";
import { formatCurrency, formatNumber } from "@/lib/format";
import { Users, Coins, Trophy, TrendingUp } from "lucide-react";

export function PlatformStats() {
  const { data: stats, isLoading } = useGetPlatformStats({
    query: {
      queryKey: getGetPlatformStatsQueryKey(),
      refetchInterval: 15_000,
    }
  });

  const statItems = [
    {
      label: "Total Players",
      value: isLoading ? null : formatNumber(stats?.totalPlayers ?? 0),
      icon: Users,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      border: "border-blue-500/20",
      glow: "shadow-[0_0_24px_rgba(59,130,246,0.15)]",
    },
    {
      label: "Total Bets",
      value: isLoading ? null : formatNumber(stats?.totalBets ?? 0),
      icon: TrendingUp,
      color: "text-green-400",
      bg: "bg-green-500/10",
      border: "border-green-500/20",
      glow: "shadow-[0_0_24px_rgba(34,197,94,0.15)]",
    },
    {
      label: "Total Wagered",
      value: isLoading ? null : formatCurrency(stats?.totalWagered ?? 0),
      icon: Coins,
      color: "text-yellow-400",
      bg: "bg-yellow-500/10",
      border: "border-yellow-500/20",
      glow: "shadow-[0_0_24px_rgba(234,179,8,0.15)]",
    },
    {
      label: "Biggest Win",
      value: isLoading ? null : formatCurrency(stats?.biggestWin ?? 0),
      icon: Trophy,
      color: "text-orange-400",
      bg: "bg-orange-500/10",
      border: "border-orange-500/20",
      glow: "shadow-[0_0_24px_rgba(249,115,22,0.15)]",
    },
  ];

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
      {statItems.map((stat, i) => (
        <div
          key={i}
          className={`relative rounded-2xl border ${stat.border} ${stat.bg} ${stat.glow} p-4 sm:p-5 flex flex-col gap-3 hover:scale-[1.02] transition-transform duration-200 overflow-hidden`}
        >
          <div className="absolute top-0 right-0 w-20 h-20 rounded-full opacity-10 blur-2xl" />
          <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl ${stat.bg} border ${stat.border} flex items-center justify-center shrink-0`}>
            <stat.icon className={`w-5 h-5 sm:w-6 sm:h-6 ${stat.color}`} />
          </div>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm text-muted-foreground uppercase tracking-widest font-semibold mb-1">
              {stat.label}
            </p>
            {isLoading ? (
              <div className="h-7 w-24 bg-secondary rounded animate-pulse" />
            ) : (
              <p className={`font-black font-mono ${stat.color} leading-none break-all ${String(stat.value).length > 9 ? "text-base sm:text-lg" : "text-xl sm:text-2xl lg:text-3xl"}`}>
                {stat.value}
              </p>
            )}
          </div>
          <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${stat.bg} opacity-50`} />
        </div>
      ))}
    </div>
  );
}
