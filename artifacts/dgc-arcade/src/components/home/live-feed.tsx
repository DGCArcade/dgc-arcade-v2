import { useState, useEffect } from "react";
import { useListRecentBetsAll, getListRecentBetsAllQueryKey, useListBets, getListBetsQueryKey } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";

function getToken() { return typeof localStorage !== "undefined" ? localStorage.getItem("dgc_token") : null; }

interface Bet {
  id: number;
  gameId: number;
  gameName: string;
  username: string;
  amount: number;
  payout: number;
  won: boolean;
  multiplier?: number | null;
  createdAt: string;
}

function BetsTable({ bets, loading, emptyMsg }: { bets: Bet[]; loading?: boolean; emptyMsg?: string }) {
  const [newIds, setNewIds] = useState<Set<number>>(new Set());
  const prevIds = useState<Set<number>>(new Set())[0];

  useEffect(() => {
    if (!bets) return;
    const incoming = new Set(bets.map(b => b.id));
    const fresh = new Set([...incoming].filter(id => !prevIds.has(id)));
    if (fresh.size) {
      setNewIds(fresh);
      setTimeout(() => setNewIds(new Set()), 1200);
    }
    prevIds.clear?.();
    bets.forEach(b => prevIds.add(b.id));
  }, [bets]);

  if (loading) return <div className="px-6 py-10 text-center text-muted-foreground font-mono text-sm animate-pulse">Loading…</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="text-xs text-muted-foreground uppercase bg-secondary/30">
          <tr>
            <th className="px-4 py-3 font-medium">Game</th>
            <th className="px-4 py-3 font-medium">Player</th>
            <th className="px-4 py-3 font-medium text-right">Bet</th>
            <th className="px-4 py-3 font-medium text-right">Multi</th>
            <th className="px-4 py-3 font-medium text-right">Payout</th>
          </tr>
        </thead>
        <tbody>
          {!bets?.length ? (
            <tr>
              <td colSpan={5} className="px-6 py-10 text-center text-muted-foreground font-mono text-sm">
                {emptyMsg ?? "No bets yet."}
              </td>
            </tr>
          ) : (
            bets.map(bet => (
              <tr key={bet.id}
                className={`border-b border-border/50 transition-all duration-500 ${newIds.has(bet.id) ? "bg-primary/8" : "hover:bg-secondary/20"}`}>
                <td className="px-4 py-3 font-medium">
                  <Link href={`/games/${bet.gameId}`} className="hover:text-primary transition-colors text-sm font-bold">{bet.gameName}</Link>
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-muted-foreground text-sm">{bet.username}</span>
                </td>
                <td className="px-4 py-3 text-right font-mono text-sm">{formatCurrency(bet.amount)}</td>
                <td className="px-4 py-3 text-right font-mono text-sm">
                  {bet.multiplier ? `${bet.multiplier.toFixed(2)}x` : "-"}
                </td>
                <td className={`px-4 py-3 text-right font-mono font-bold text-sm ${bet.won ? "text-green-400" : "text-muted-foreground/60"}`}>
                  {bet.won ? `+${formatCurrency(bet.payout)}` : "-"}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function HighRollersFeed() {
  const [bets, setBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () => {
      fetch("/api/bets/high-rollers")
        .then(r => r.json())
        .then(d => { setBets(d); setLoading(false); })
        .catch(() => setLoading(false));
    };
    load();
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, []);

  return <BetsTable bets={bets} loading={loading} emptyMsg="No high roller bets yet. Be the first!" />;
}

function MyBetsFeed() {
  const { data: bets, isLoading } = useListBets({ limit: 20 }, {
    query: {
      queryKey: getListBetsQueryKey({ limit: 20 }),
      refetchInterval: 6000,
    }
  });
  return <BetsTable bets={bets as unknown as Bet[] ?? []} loading={isLoading} emptyMsg="No bets placed yet. Start playing!" />;
}

function RaceFeed() {
  const [leaderboard, setLeaderboard] = useState<{ username: string; totalWon: number; bets: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/leaderboard?limit=10")
      .then(r => r.json())
      .then(d => { setLeaderboard(d); setLoading(false); })
      .catch(() => setLoading(false));
    const iv = setInterval(() => {
      fetch("/api/leaderboard?limit=10").then(r => r.json()).then(setLeaderboard).catch(()=>{});
    }, 15000);
    return () => clearInterval(iv);
  }, []);

  if (loading) return <div className="px-6 py-10 text-center text-muted-foreground font-mono animate-pulse">Loading race…</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="text-xs text-muted-foreground uppercase bg-secondary/30">
          <tr>
            <th className="px-4 py-3 font-medium">#</th>
            <th className="px-4 py-3 font-medium">Player</th>
            <th className="px-4 py-3 font-medium text-right">Total Won</th>
            <th className="px-4 py-3 font-medium text-right">Bets</th>
          </tr>
        </thead>
        <tbody>
          {leaderboard.map((entry, i) => (
            <tr key={entry.username} className="border-b border-border/50 hover:bg-secondary/20">
              <td className="px-4 py-3 font-mono font-black text-base">
                {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : <span className="text-muted-foreground">{i+1}</span>}
              </td>
              <td className="px-4 py-3 font-bold">{entry.username}</td>
              <td className="px-4 py-3 text-right font-mono text-green-400 font-bold">{formatCurrency(entry.totalWon)}</td>
              <td className="px-4 py-3 text-right font-mono text-muted-foreground">{entry.bets}</td>
            </tr>
          ))}
          {!leaderboard.length && (
            <tr><td colSpan={4} className="px-6 py-10 text-center text-muted-foreground">No data yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function LiveFeed() {
  const { isAuthenticated } = useAuth();
  const { data: allBets, isLoading } = useListRecentBetsAll({ limit: 20 }, {
    query: {
      queryKey: getListRecentBetsAllQueryKey({ limit: 20 }),
      refetchInterval: 5000,
    }
  });

  return (
    <Card className="bg-card border-border overflow-hidden">
      <Tabs defaultValue="all">
        <div className="p-4 border-b border-border/40 bg-secondary/30 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="live-dot w-2 h-2 rounded-full bg-green-500" />
            <span className="font-display font-bold uppercase tracking-widest text-lg">Live Bets</span>
          </div>
          <TabsList className="bg-secondary/60 h-8 sm:ml-auto">
            <TabsTrigger value="all" className="text-xs font-bold uppercase h-6 px-3">All Bets</TabsTrigger>
            {isAuthenticated && <TabsTrigger value="my" className="text-xs font-bold uppercase h-6 px-3">My Bets</TabsTrigger>}
            <TabsTrigger value="highrollers" className="text-xs font-bold uppercase h-6 px-3">High Rollers</TabsTrigger>
            <TabsTrigger value="race" className="text-xs font-bold uppercase h-6 px-3">Race</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="all" className="mt-0">
          <BetsTable bets={allBets as unknown as Bet[] ?? []} loading={isLoading} />
        </TabsContent>

        {isAuthenticated && (
          <TabsContent value="my" className="mt-0">
            <MyBetsFeed />
          </TabsContent>
        )}

        <TabsContent value="highrollers" className="mt-0">
          <HighRollersFeed />
        </TabsContent>

        <TabsContent value="race" className="mt-0">
          <RaceFeed />
        </TabsContent>
      </Tabs>
    </Card>
  );
}
