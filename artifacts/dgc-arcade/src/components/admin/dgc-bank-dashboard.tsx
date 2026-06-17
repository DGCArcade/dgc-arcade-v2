import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { Calendar, TrendingUp, TrendingDown, ArrowUpRight, RefreshCw, Download } from "lucide-react";

interface DailyStats {
  winLoss: number;
  totalWagered: number;
  totalPayout: number;
  totalWithdrawals: number;
}

export function DGCBankDashboard() {
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [stats, setStats] = useState<DailyStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async (date: string) => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("dgc_token");
      
      // Fetch win/loss
      const winLossRes = await fetch(`/api/admin/stats/daily-win-loss?date=${date}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const winLossData = await winLossRes.json();

      // Fetch withdrawals
      const withdrawalsRes = await fetch(`/api/admin/stats/daily-withdrawals?date=${date}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const withdrawalsData = await withdrawalsRes.json();

      if (!winLossRes.ok || !withdrawalsRes.ok) {
        setError("Failed to load stats");
        return;
      }

      setStats({
        ...winLossData,
        totalWithdrawals: withdrawalsData.totalWithdrawals,
      });
    } catch (err: any) {
      setError(err?.message ?? "Network error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats(selectedDate);
  }, [selectedDate]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedDate(e.target.value);
  };

  const handlePrevDay = () => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() - 1);
    setSelectedDate(date.toISOString().split("T")[0]);
  };

  const handleNextDay = () => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() + 1);
    setSelectedDate(date.toISOString().split("T")[0]);
  };

  return (
    <div className="space-y-6">
      {/* Header with date picker */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-black text-2xl uppercase tracking-widest">DGC Bank Dashboard</h2>
          <p className="text-xs text-muted-foreground font-mono mt-1">Real-time platform statistics</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevDay}
              className="px-3 py-2 rounded-lg border border-border hover:bg-secondary transition-colors text-sm font-bold"
            >
              ← Prev
            </button>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                type="date"
                value={selectedDate}
                onChange={handleDateChange}
                className="pl-10 pr-3 py-2 rounded-lg border border-border bg-secondary text-sm font-mono"
              />
            </div>
            <button
              onClick={handleNextDay}
              className="px-3 py-2 rounded-lg border border-border hover:bg-secondary transition-colors text-sm font-bold"
            >
              Next →
            </button>
          </div>
          <button
            onClick={() => fetchStats(selectedDate)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground font-bold text-xs uppercase hover:bg-primary/90 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/50 text-destructive text-sm font-mono">
          {error}
        </div>
      )}

      {/* Stats grid */}
      {loading && !stats ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-secondary/50 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : stats ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Wagered */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-bold">
                  Total Wagered
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-2">
                  <div className="font-mono font-black text-2xl">{formatCurrency(stats.totalWagered)}</div>
                </div>
              </CardContent>
            </Card>

            {/* Total Payout */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-bold">
                  Total Payout
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-2">
                  <div className="font-mono font-black text-2xl text-green-400">{formatCurrency(stats.totalPayout)}</div>
                </div>
              </CardContent>
            </Card>

            {/* Win/Loss */}
            <Card className={`bg-card border-border ${stats.winLoss >= 0 ? "border-green-500/30" : "border-red-500/30"}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1">
                  {stats.winLoss >= 0 ? (
                    <TrendingUp className="w-3.5 h-3.5 text-green-400" />
                  ) : (
                    <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                  )}
                  Win/Loss
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`font-mono font-black text-2xl ${stats.winLoss >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {stats.winLoss >= 0 ? "+" : ""}{formatCurrency(stats.winLoss)}
                </div>
              </CardContent>
            </Card>

            {/* Total Withdrawals */}
            <Card className="bg-card border-border border-amber-500/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1">
                  <ArrowUpRight className="w-3.5 h-3.5 text-amber-400" />
                  Withdrawals
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="font-mono font-black text-2xl text-amber-400">{formatCurrency(stats.totalWithdrawals)}</div>
              </CardContent>
            </Card>
          </div>

          {/* Summary row */}
          <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/30">
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold mb-1">House Edge</p>
                  <p className="font-mono font-black text-lg text-primary">
                    {stats.totalWagered > 0 ? ((stats.winLoss / stats.totalWagered) * 100).toFixed(2) : "0.00"}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold mb-1">Payout Ratio</p>
                  <p className="font-mono font-black text-lg text-primary">
                    {stats.totalWagered > 0 ? ((stats.totalPayout / stats.totalWagered) * 100).toFixed(2) : "0.00"}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold mb-1">Net Balance</p>
                  <p className={`font-mono font-black text-lg ${stats.winLoss >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {formatCurrency(stats.winLoss - stats.totalWithdrawals)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold mb-1">Date</p>
                  <p className="font-mono font-black text-lg text-muted-foreground">
                    {new Date(selectedDate).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
