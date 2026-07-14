import { useState, useEffect, useCallback, Fragment } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import { TransactionFeed } from "./transaction-feed";
import {
  Calendar, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownLeft,
  RefreshCw, Users, Wallet, ChevronDown, ChevronUp, Activity,
  DollarSign, Crown
} from "lucide-react";
import { getApiUrl, authHeaders } from "@/lib/api-fetch";

function getBankSession() {
  return typeof sessionStorage !== "undefined" ? sessionStorage.getItem("dgcBankSession") : null;
}

async function bankFetch(path: string) {
  const bankSession = getBankSession();
  const url = getApiUrl(`/api/admin${path}`);
  const res = await fetch(url, {
    headers: authHeaders({
      ...(bankSession ? { "x-bank-session": bankSession } : {}),
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

interface PlatformSummary {
  totalPlatformBalance: number;
  totalUsers: number;
  activeToday: number;
}

interface DailyStats {
  winLoss: number;
  totalWagered: number;
  totalPayout: number;
  totalWithdrawals: number;
  totalDeposits: number;
}

interface CryptoBalance {
  currency: string;
  amount: number;
  price: number;
  usdValue: number;
}

interface UserBalance {
  id: number;
  username: string;
  role: string;
  staticBalance: number;
  cryptoBalances: CryptoBalance[];
  totalBalance: number;
  createdAt: string | null;
}

export function DGCBankDashboard() {
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );

  const [platformSummary, setPlatformSummary] = useState<PlatformSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [dailyStats, setDailyStats] = useState<DailyStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  const [userBalances, setUserBalances] = useState<UserBalance[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [expandedUser, setExpandedUser] = useState<number | null>(null);

  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchPlatformSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const data = await bankFetch("/bank/platform-summary");
      setPlatformSummary(data);
      setLastRefresh(new Date());
    } catch (err: any) {
      setSummaryError(err?.message ?? "Failed to load platform summary");
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  const fetchUserBalances = useCallback(async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const data = await bankFetch("/bank/user-balances");
      // Hide specialty creators and owners from the leaderboard to keep it focused on real players
      const realPlayers = (data.users ?? []).filter((u: UserBalance) => 
        u.role !== "owner" && u.role !== "creator" && (u as any).accountType !== "creator"
      );
      setUserBalances(realPlayers);
    } catch (err: any) {
      setUsersError(err?.message ?? "Failed to load user balances");
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const fetchDailyStats = useCallback(async (date: string) => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const [winLossData, withdrawalsData, depositsData] = await Promise.all([
        bankFetch(`/stats/daily-win-loss?date=${date}`),
        bankFetch(`/stats/daily-withdrawals?date=${date}`),
        bankFetch(`/stats/daily-deposits?date=${date}`),
      ]);
      setDailyStats({
        ...winLossData,
        totalWithdrawals: withdrawalsData.totalWithdrawals ?? 0,
        totalDeposits: depositsData.totalDeposits ?? 0,
      });
    } catch (err: any) {
      setStatsError(err?.message ?? "Failed to load daily stats");
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchAll = useCallback(() => {
    fetchPlatformSummary();
    fetchUserBalances();
    fetchDailyStats(selectedDate);
  }, [fetchPlatformSummary, fetchUserBalances, fetchDailyStats, selectedDate]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(() => {
      fetchPlatformSummary();
      fetchUserBalances();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchDailyStats(selectedDate);
  }, [selectedDate]);

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

  const houseEdge =
    dailyStats && dailyStats.totalWagered > 0
      ? ((dailyStats.winLoss / dailyStats.totalWagered) * 100).toFixed(2)
      : "0.00";

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-black text-2xl uppercase tracking-widest">
            DGC Bank
          </h2>
          <p className="text-xs text-muted-foreground font-mono mt-1 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
            Live platform stats
            {lastRefresh && (
              <span className="opacity-60">· Refreshed {lastRefresh.toLocaleTimeString()}</span>
            )}
          </p>
        </div>
        <button
          onClick={fetchAll}
          disabled={summaryLoading || usersLoading || statsLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-bold text-xs uppercase hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${summaryLoading || usersLoading ? "animate-spin" : ""}`}
          />
          Refresh All
        </button>
      </div>

      {/* ── Platform Overview — All-In-One Live Balance ── */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
          <Wallet className="w-3.5 h-3.5 text-primary" />
          Platform All-In-One Balance
          <span className="flex items-center gap-1 text-green-400 text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
            Live
          </span>
        </h3>

        {summaryError && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs font-mono mb-3">
            {summaryError}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Total Platform Balance */}
          <Card className="bg-gradient-to-br from-primary/20 to-primary/5 border-primary/40 sm:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-primary" />
                Total Platform Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              {summaryLoading && !platformSummary ? (
                <div className="h-8 bg-secondary/50 rounded animate-pulse w-32" />
              ) : (
                <div className="font-mono font-black text-3xl text-primary">
                  {formatCurrency(platformSummary?.totalPlatformBalance ?? 0)}
                </div>
              )}
              <p className="text-xs text-muted-foreground font-mono mt-1">
                All users · static + live crypto
              </p>
            </CardContent>
          </Card>

          {/* Total Users */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                Total Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              {summaryLoading && !platformSummary ? (
                <div className="h-8 bg-secondary/50 rounded animate-pulse w-16" />
              ) : (
                <div className="font-mono font-black text-3xl text-white">
                  {platformSummary?.totalUsers ?? 0}
                </div>
              )}
              <p className="text-xs text-muted-foreground font-mono mt-1">Registered accounts</p>
            </CardContent>
          </Card>

          {/* Active Today */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-green-400" />
                Active Last 24h
              </CardTitle>
            </CardHeader>
            <CardContent>
              {summaryLoading && !platformSummary ? (
                <div className="h-8 bg-secondary/50 rounded animate-pulse w-16" />
              ) : (
                <div className="font-mono font-black text-3xl text-green-400">
                  {platformSummary?.activeToday ?? 0}
                </div>
              )}
              <p className="text-xs text-muted-foreground font-mono mt-1">Seen in last 24 hours</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Daily Stats with Date Picker ── */}
      <div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-amber-400" />
            Daily Stats
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevDay}
              className="px-3 py-1.5 rounded-lg border border-border hover:bg-secondary transition-colors text-xs font-bold"
            >
              ← Prev
            </button>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-lg border border-border bg-secondary text-xs font-mono"
              />
            </div>
            <button
              onClick={handleNextDay}
              className="px-3 py-1.5 rounded-lg border border-border hover:bg-secondary transition-colors text-xs font-bold"
            >
              Next →
            </button>
            <button
              onClick={() => fetchDailyStats(selectedDate)}
              disabled={statsLoading}
              className="px-3 py-1.5 rounded-lg border border-border hover:bg-secondary transition-colors text-xs font-bold flex items-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${statsLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {statsError && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs font-mono mb-3">
            {statsError}
          </div>
        )}

        {statsLoading && !dailyStats ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 bg-secondary/50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : dailyStats ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Win / Loss */}
              <Card
                className={`bg-card border-border ${
                  dailyStats.winLoss >= 0 ? "border-green-500/40" : "border-red-500/40"
                }`}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1">
                    {dailyStats.winLoss >= 0 ? (
                      <TrendingUp className="w-3.5 h-3.5 text-green-400" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                    )}
                    House Win/Loss
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    className={`font-mono font-black text-2xl ${
                      dailyStats.winLoss >= 0 ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {dailyStats.winLoss >= 0 ? "+" : ""}
                    {formatCurrency(dailyStats.winLoss)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 font-mono">
                    Wagered {formatCurrency(dailyStats.totalWagered)}
                  </p>
                </CardContent>
              </Card>

              {/* Deposits */}
              <Card className="bg-card border-border border-blue-500/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1">
                    <ArrowDownLeft className="w-3.5 h-3.5 text-blue-400" />
                    Deposits
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="font-mono font-black text-2xl text-blue-400">
                    {formatCurrency(dailyStats.totalDeposits)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 font-mono">Completed deposits</p>
                </CardContent>
              </Card>

              {/* Withdrawals */}
              <Card className="bg-card border-border border-amber-500/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1">
                    <ArrowUpRight className="w-3.5 h-3.5 text-amber-400" />
                    Withdrawals
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="font-mono font-black text-2xl text-amber-400">
                    {formatCurrency(dailyStats.totalWithdrawals)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 font-mono">Completed payouts</p>
                </CardContent>
              </Card>

              {/* House Edge */}
              <Card className="bg-card border-border border-primary/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5 text-primary" />
                    House Edge
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="font-mono font-black text-2xl text-primary">{houseEdge}%</div>
                  <p className="text-xs text-muted-foreground mt-1 font-mono">
                    Payout {dailyStats.totalWagered > 0
                      ? ((dailyStats.totalPayout / dailyStats.totalWagered) * 100).toFixed(1)
                      : "0.0"}%
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Summary bar */}
            <Card className="mt-3 bg-secondary/30 border-border/50">
              <CardContent className="py-3 px-4">
                <div className="flex flex-wrap gap-6 text-xs font-mono text-muted-foreground">
                  <span>
                    <span className="text-white font-bold">Date: </span>
                    {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </span>
                  <span>
                    <span className="text-white font-bold">Net: </span>
                    <span
                      className={
                        dailyStats.winLoss - dailyStats.totalWithdrawals >= 0
                          ? "text-green-400"
                          : "text-red-400"
                      }
                    >
                      {formatCurrency(dailyStats.winLoss - dailyStats.totalWithdrawals)}
                    </span>
                  </span>
                  <span>
                    <span className="text-white font-bold">Total Payout: </span>
                    {formatCurrency(dailyStats.totalPayout)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      {/* ── Live Transaction Feed ── */}
      <div className="mb-8">
        <TransactionFeed autoRefreshInterval={30000} />
      </div>

      {/* ── User Balance Leaderboard ── */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
          <Crown className="w-3.5 h-3.5 text-yellow-400" />
          User Balance Leaderboard
          <span className="flex items-center gap-1 text-green-400 text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
            Live · richest → poorest
          </span>
          {usersLoading && (
            <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />
          )}
        </h3>

        {usersError && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs font-mono mb-3">
            {usersError}
          </div>
        )}

        {usersLoading && userBalances.length === 0 ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 bg-secondary/50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : userBalances.length === 0 ? (
          <Card className="border-dashed border-border/40">
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              No users found
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border/60 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40 bg-secondary/50">
                    <th className="text-left text-xs font-bold uppercase tracking-widest text-muted-foreground px-4 py-3 w-10">
                      #
                    </th>
                    <th className="text-left text-xs font-bold uppercase tracking-widest text-muted-foreground px-4 py-3">
                      User
                    </th>
                    <th className="text-right text-xs font-bold uppercase tracking-widest text-muted-foreground px-4 py-3">
                      Static Balance
                    </th>
                    <th className="text-right text-xs font-bold uppercase tracking-widest text-muted-foreground px-4 py-3">
                      Crypto (Live USD)
                    </th>
                    <th className="text-right text-xs font-bold uppercase tracking-widest text-muted-foreground px-4 py-3">
                      Total Balance
                    </th>
                    <th className="w-8 px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {userBalances.map((user, idx) => {
                    const cryptoUsd = user.cryptoBalances.reduce(
                      (acc, c) => acc + c.usdValue,
                      0
                    );
                    const isExpanded = expandedUser === user.id;
                    const isTopUser = idx === 0 && user.totalBalance > 0;

                    return (
                      <Fragment key={user.id}>
                        <tr
                          className={`border-b border-border/30 cursor-pointer transition-colors hover:bg-secondary/30 ${
                            isExpanded ? "bg-secondary/20" : ""
                          } ${isTopUser ? "bg-yellow-950/10" : ""}`}
                          onClick={() => setExpandedUser(isExpanded ? null : user.id)}
                        >
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                            {isTopUser ? (
                              <Crown className="w-4 h-4 text-yellow-400" />
                            ) : (
                              `#${idx + 1}`
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white">@{user.username}</span>
                              {user.role === "owner" && (
                                <Badge className="text-xs bg-yellow-600/20 text-yellow-400 border-yellow-500/30">
                                  Owner
                                </Badge>
                              )}
                              {user.role === "admin" && (
                                <Badge className="text-xs bg-blue-600/20 text-blue-400 border-blue-500/30">
                                  Admin
                                </Badge>
                              )}
                              {user.cryptoBalances.length > 0 && (
                                <span className="flex items-center gap-1 text-xs text-green-400">
                                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                                  Crypto
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-sm">
                            {formatCurrency(user.staticBalance)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-sm">
                            {cryptoUsd > 0 ? (
                              <span className="text-green-400">{formatCurrency(cryptoUsd)}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span
                              className={`font-mono font-black text-base ${
                                user.totalBalance > 0 ? "text-white" : "text-muted-foreground"
                              }`}
                            >
                              {formatCurrency(user.totalBalance)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            )}
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-secondary/10 border-b border-border/20">
                            <td colSpan={6} className="px-6 py-4">
                              <div className="space-y-3">
                                <div className="flex flex-wrap gap-6 text-xs font-mono text-muted-foreground">
                                  <span>
                                    <span className="text-white font-bold">User ID: </span>#{user.id}
                                  </span>
                                  <span>
                                    <span className="text-white font-bold">Role: </span>
                                    {user.role}
                                  </span>
                                  <span>
                                    <span className="text-white font-bold">Joined: </span>
                                    {user.createdAt
                                      ? new Date(user.createdAt).toLocaleDateString()
                                      : "—"}
                                  </span>
                                  <span>
                                    <span className="text-white font-bold">Static (USD): </span>
                                    {formatCurrency(user.staticBalance)}
                                  </span>
                                </div>

                                {user.cryptoBalances.length > 0 ? (
                                  <div>
                                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
                                      Live Crypto Holdings
                                    </p>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                                      {user.cryptoBalances.map((cb) => (
                                        <div
                                          key={cb.currency}
                                          className="bg-secondary/50 rounded-lg p-3 border border-border/40"
                                        >
                                          <div className="flex items-center justify-between mb-1">
                                            <span className="font-bold text-xs text-primary uppercase">
                                              {cb.currency}
                                            </span>
                                            <span className="flex items-center gap-1 text-xs text-green-400">
                                              <span className="w-1 h-1 rounded-full bg-green-400 animate-pulse inline-block" />
                                              Live
                                            </span>
                                          </div>
                                          <p className="font-mono text-sm font-bold text-white">
                                            {cb.amount.toFixed(8)}
                                          </p>
                                          <p className="font-mono text-xs text-green-400 mt-0.5">
                                            {formatCurrency(cb.usdValue)}
                                          </p>
                                          <p className="font-mono text-xs text-muted-foreground">
                                            @ {formatCurrency(cb.price)}/ea
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-xs text-muted-foreground font-mono">
                                    No crypto holdings — balance is static USD only
                                  </p>
                                )}

                                <div className="border-t border-border/30 pt-3 flex items-center gap-3">
                                  <span className="text-xs text-muted-foreground font-mono">Total:</span>
                                  <span className="font-mono font-black text-lg text-primary">
                                    {formatCurrency(user.totalBalance)}
                                  </span>
                                  {user.cryptoBalances.length > 0 && (
                                    <span className="text-xs text-muted-foreground font-mono">
                                      (live crypto prices · refreshes every 30s)
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
