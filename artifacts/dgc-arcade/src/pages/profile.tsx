import { useAuth } from "@/hooks/use-auth";
import { useListTransactions, getListTransactionsQueryKey } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DepositForm } from "@/components/profile/deposit-form";
import { WithdrawForm } from "@/components/profile/withdraw-form";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { ArrowDownLeft, ArrowUpRight, Clock, CheckCircle2, XCircle } from "lucide-react";

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
              <CardTitle className="font-display uppercase tracking-widest text-lg">Cashier</CardTitle>
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
                <div className="space-y-4">
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
    </div>
  );
}
