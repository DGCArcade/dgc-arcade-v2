import { useState, useEffect } from "react";
import { useListRecentBetsAll, getListRecentBetsAllQueryKey, useListBets, getListBetsQueryKey } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Shield, ChevronDown, ChevronUp, ExternalLink, Info } from "lucide-react";
import { getApiUrl } from "@/lib/api-fetch";

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
  serverSeed?: string | null;
  serverSeedHash?: string | null;
  clientSeed?: string | null;
  nonce?: number | null;
  meta?: any;
  createdAt: string;
}

function BetsTable({ bets, loading, emptyMsg }: { bets: Bet[]; loading?: boolean; emptyMsg?: string }) {
  const [expandedBet, setExpandedBet] = useState<number | null>(null);
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

  if (!bets?.length) {
    return (
      <div className="px-6 py-10 text-center text-muted-foreground font-mono text-sm">
        {emptyMsg ?? "No bets yet."}
      </div>
    );
  }

  return (
    <>
      {/* Mobile card list */}
      <div className="md:hidden divide-y divide-border/40">
        {bets.map(bet => (
          <div key={bet.id}
            className={`px-4 py-3 flex items-center justify-between gap-3 transition-all duration-500 ${newIds.has(bet.id) ? "bg-primary/8" : ""}`}>
            <div className="flex flex-col gap-0.5 min-w-0">
              <Link href={`/games/${bet.gameId}`} className="font-bold text-sm hover:text-primary transition-colors truncate">
                {bet.gameName}
              </Link>
              <span className="text-xs text-muted-foreground font-mono truncate">{bet.username}</span>
            </div>
            <div className="flex flex-col items-end gap-0.5 shrink-0">
              <span className={`font-mono font-bold text-sm ${bet.won ? "text-green-400" : "text-muted-foreground/60"}`}>
                {bet.won ? `+${formatCurrency(bet.payout)}` : formatCurrency(bet.amount)}
              </span>
              <span className="text-xs text-muted-foreground font-mono">
                {bet.multiplier ? `${bet.multiplier.toFixed(2)}x` : `${formatCurrency(bet.amount)} bet`}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
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
            {bets.map(bet => (
              <>
                <tr key={bet.id}
                  onClick={() => bet.serverSeedHash && setExpandedBet(expandedBet === bet.id ? null : bet.id)}
                  className={`border-b border-border/50 transition-all duration-500 cursor-pointer ${newIds.has(bet.id) ? "bg-primary/8" : "hover:bg-secondary/20"} ${expandedBet === bet.id ? "bg-secondary/40" : ""}`}>
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-2">
                      {bet.serverSeedHash && (expandedBet === bet.id ? <ChevronUp className="w-3 h-3 text-primary" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />)}
                      <Link href={`/games/${bet.gameId}`} className="hover:text-primary transition-colors text-sm font-bold">{bet.gameName}</Link>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-muted-foreground text-sm">{bet.username}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm">{formatCurrency(bet.amount)}</td>
                  <td className="px-4 py-3 text-right font-mono text-sm">
                    {bet.multiplier ? `${bet.multiplier.toFixed(2)}x` : "-"}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono font-bold text-sm ${bet.won ? "text-green-400" : "text-muted-foreground/60"}`}>
                    <div className="flex items-center justify-end gap-2">
                      {bet.won ? `+${formatCurrency(bet.payout)}` : "-"}
                      {bet.serverSeedHash && <Shield className="w-3 h-3 text-green-500/50" />}
                    </div>
                  </td>
                </tr>
                {expandedBet === bet.id && bet.serverSeedHash && (
                  <tr className="bg-secondary/20 border-b border-border/50">
                    <td colSpan={5} className="px-4 py-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary">
                            <Shield className="w-3.5 h-3.5" /> Provably Fair Data
                          </div>
                          <div className="space-y-2">
                            <div className="bg-black/40 rounded p-2 border border-border/40">
                              <div className="text-[10px] uppercase text-muted-foreground font-bold mb-1">Server Seed Hash (Public)</div>
                              <div className="font-mono text-[10px] break-all text-muted-foreground/80">{bet.serverSeedHash}</div>
                            </div>
                            {bet.serverSeed && (
                              <div className="bg-black/40 rounded p-2 border border-green-500/20">
                                <div className="text-[10px] uppercase text-green-400 font-bold mb-1">Server Seed (Revealed)</div>
                                <div className="font-mono text-[10px] break-all text-green-300/90">{bet.serverSeed}</div>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            <Info className="w-3.5 h-3.5" /> Verification Inputs
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-black/40 rounded p-2 border border-border/40">
                              <div className="text-[10px] uppercase text-muted-foreground font-bold mb-1">Client Seed</div>
                              <div className="font-mono text-[10px] truncate text-muted-foreground/80">{bet.clientSeed || "N/A"}</div>
                            </div>
                            <div className="bg-black/40 rounded p-2 border border-border/40">
                              <div className="text-[10px] uppercase text-muted-foreground font-bold mb-1">Nonce</div>
                              <div className="font-mono text-[10px] text-muted-foreground/80">{bet.nonce || "0"}</div>
                            </div>
                          </div>
                          <div className="flex justify-end">
                            <Link href="/profile" className="text-[10px] uppercase font-bold text-primary hover:underline flex items-center gap-1">
                              Verify in Tool <ExternalLink className="w-2.5 h-2.5" />
                            </Link>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function HighRollersFeed() {
  const [bets, setBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () => {
      fetch(getApiUrl("/api/bets/high-rollers"))
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
      refetchInterval: 10_000,
    }
  });
  return <BetsTable bets={bets as unknown as Bet[] ?? []} loading={isLoading} emptyMsg="No bets placed yet. Start playing!" />;
}

function RaceFeed() {
  const [leaderboard, setLeaderboard] = useState<{ username: string; totalWon: number; bets: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(getApiUrl("/api/leaderboard?limit=10"))
      .then(r => r.json())
      .then(d => { setLeaderboard(d); setLoading(false); })
      .catch(() => setLoading(false));
    const iv = setInterval(() => {
      fetch(getApiUrl("/api/leaderboard?limit=10")).then(r => r.json()).then(setLeaderboard).catch(()=>{});
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
      refetchInterval: 10_000,
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
          <div className="p-6 flex flex-col items-center gap-4 text-center">
            <div className="text-5xl animate-bounce">🏇</div>
            <div>
              <h3 className="font-display font-black text-xl uppercase tracking-tight mb-1">DGC Horse Race</h3>
              <p className="text-sm text-muted-foreground">Pick your horse, place your bet, and watch them race live! First place pays <strong className="text-yellow-400">5.5×</strong>.</p>
            </div>
            <RaceFeed />
            <a href="/race" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-black uppercase tracking-widest text-sm text-black transition-all hover:opacity-90 active:scale-95"
              style={{ background: "var(--theme-glow)" }}>
              🏇 Play Horse Race Now
            </a>
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
