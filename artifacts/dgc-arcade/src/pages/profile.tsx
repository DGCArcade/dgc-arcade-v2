import { useAuth } from "@/hooks/use-auth";
import { useListTransactions, getListTransactionsQueryKey } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DepositForm } from "@/components/profile/deposit-form";
import { WithdrawForm } from "@/components/profile/withdraw-form";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { ArrowDownLeft, ArrowUpRight, Clock, CheckCircle2, XCircle, Landmark, RefreshCw } from "lucide-react";
import { useState, useEffect, useCallback } from "react";

export default function Profile() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  const { data: transactions } = useListTransactions({ limit: 50 }, {
    query: {
      queryKey: getListTransactionsQueryKey({ limit: 50 }),
      enabled: isAuthenticated,
    }
  });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/");
    }
  }, [isLoading, isAuthenticated, setLocation]);

  const [plisioBalances, setPlisioBalances] = useState<Record<string,string> | null>(null);
  const [plisioLoading, setPlisioLoading] = useState(false);
  const [plisioError, setPlisioError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchPlisioBalance = useCallback(async () => {
    if (user?.username !== "fanodgc") return;
    setPlisioLoading(true);
    setPlisioError(null);
    try {
      const token = localStorage.getItem("dgc_token");
      const apiUrl = (import.meta.env.VITE_API_URL ?? "") + "/api/users/owner/plisio-balance";
      const res = await fetch(apiUrl, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) {
        const detail = data.detail ? ` (${data.detail})` : "";
        setPlisioError((data.error ?? "Failed to load") + detail);
        return;
      }
      if (!data.balances || Object.keys(data.balances).length === 0) {
        setPlisioError("No balances returned — your Plisio account may need the Balance API enabled. Go to Plisio → API Settings → enable Balance access.");
        return;
      }
      setPlisioBalances(data.balances);
      setLastRefresh(new Date());
    } catch (e: any) { setPlisioError("Network error: " + (e?.message ?? "unknown")); }
    finally { setPlisioLoading(false); }
  }, [user?.username]);

  useEffect(() => {
    if (user?.username === "fanodgc") {
      fetchPlisioBalance();
      const interval = setInterval(fetchPlisioBalance, 30000);
      return () => clearInterval(interval);
    }
  }, [user?.username, fetchPlisioBalance]);

  if (isLoading || !user) return <div className="animate-pulse bg-secondary h-96 rounded-xl border border-border" />;

  const getStatusIcon = (status: string) => {
    switch(status) {
      case 'completed': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'failed': return <XCircle className="w-4 h-4 text-destructive" />;
      case 'pending': return <Clock className="w-4 h-4 text-yellow-500" />;
      default: return null;
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto w-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-border/50 pb-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-secondary border-2 border-primary flex items-center justify-center font-display font-black text-3xl text-primary">
            {user.username.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="font-display font-black text-3xl uppercase tracking-widest">{user.username}</h1>
            <p className="text-muted-foreground font-mono text-sm">Joined {new Date(user.createdAt).toLocaleDateString()}</p>
          </div>
        </div>
        
        <div className="bg-secondary/50 border border-primary/20 rounded-xl p-4 flex flex-col items-end min-w-[200px]">
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Available Balance</span>
          <span className="font-mono font-bold text-3xl text-primary">{formatCurrency(user.balance)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-1 space-y-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="font-display uppercase tracking-widest text-lg flex items-center gap-2"><span className="text-glow-shift">DGC Bank · Wallet</span></CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="deposit" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6 bg-secondary">
                  <TabsTrigger value="deposit" className="font-bold uppercase text-xs">Deposit</TabsTrigger>
                  <TabsTrigger value="withdraw" className="font-bold uppercase text-xs">Withdraw</TabsTrigger>
                </TabsList>
                <TabsContent value="deposit">
                  <DepositForm />
                </TabsContent>
                <TabsContent value="withdraw">
                  <WithdrawForm />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
          
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="font-display uppercase tracking-widest text-lg">Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between border-b border-border/50 pb-2">
                <span className="text-muted-foreground text-sm font-medium">Total Bets</span>
                <span className="font-mono font-bold">{user.totalBets || 0}</span>
              </div>
              <div className="flex justify-between pb-2">
                <span className="text-muted-foreground text-sm font-medium">Total Won</span>
                <span className="font-mono font-bold text-primary">{formatCurrency(user.totalWon || 0)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
        
        <div className="md:col-span-2">
          <Card className="bg-card border-border h-full">
            <CardHeader>
              <CardTitle className="font-display uppercase tracking-widest text-lg">Transaction History</CardTitle>
            </CardHeader>
            <CardContent>
              {!transactions?.length ? (
                <div className="text-center py-12 text-muted-foreground font-mono text-sm border border-dashed border-border rounded-lg bg-secondary/20">
                  No transactions found.
                </div>
              ) : (
                <div className="space-y-4 max-h-[520px] overflow-y-auto pr-2 rounded-lg border border-primary/10 shadow-[0_0_24px_var(--theme-glow)] p-1">
                  {transactions.map(tx => (
                    <div key={tx.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-secondary/30 hover:bg-secondary/60 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${tx.type === 'deposit' || tx.type === 'bet_win' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                          {tx.type === 'deposit' || tx.type === 'bet_win' ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                        </div>
                        <div>
                          <p className="font-bold text-sm uppercase">{tx.type.replace('_', ' ')}</p>
                          <p className="text-xs text-muted-foreground font-mono">{new Date(tx.createdAt).toLocaleString()}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`font-mono font-bold ${tx.type === 'deposit' || tx.type === 'bet_win' ? 'text-green-500' : 'text-foreground'}`}>
                          {tx.type === 'deposit' || tx.type === 'bet_win' ? '+' : '-'}{formatCurrency(tx.amount)}
                        </span>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
                          {getStatusIcon(tx.status)}
                          <span className="uppercase">{tx.status}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {user.username === "fanodgc" && (
        <Card className="bg-card border-border border-yellow-500/30 shadow-[0_0_32px_rgba(255,215,0,0.08)]">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="font-display uppercase tracking-widest text-lg flex items-center gap-2">
              <Landmark className="w-5 h-5 text-yellow-400" />
              <span className="text-yellow-400">Casino Bank — Live Plisio Balance</span>
            </CardTitle>
            <button onClick={fetchPlisioBalance} disabled={plisioLoading}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-yellow-400 transition-colors font-mono border border-border/50 rounded px-2 py-1">
              <RefreshCw className={`w-3 h-3 ${plisioLoading ? "animate-spin" : ""}`} />
              {lastRefresh ? lastRefresh.toLocaleTimeString() : "Refresh"}
            </button>
          </CardHeader>
          <CardContent>
            {plisioError && <p className="text-destructive text-sm font-mono">{plisioError}</p>}
            {plisioLoading && !plisioBalances && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[...Array(8)].map((_,i) => <div key={i} className="h-16 bg-secondary animate-pulse rounded-lg" />)}
              </div>
            )}
            {plisioBalances && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                {Object.entries(plisioBalances).map(([currency, balance]) => (
                  <div key={currency} className="bg-secondary/50 border border-yellow-500/20 rounded-lg p-3 flex flex-col gap-1">
                    <span className="text-xs font-bold uppercase tracking-widest text-yellow-400">{currency}</span>
                    <span className="font-mono font-black text-sm break-all">{String(balance)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
