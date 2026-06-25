import { useState, useEffect } from "react";
import { formatCurrency, formatNumber } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Medal, Crown, Swords, Clock } from "lucide-react";

interface LeaderboardEntry {
  rank: number;
  userId: number;
  username: string;
  avatarUrl: string | null;
  totalWon: number;
  totalBets: number;
}

interface Tournament {
  id: number;
  name: string;
  description: string | null;
  prize: number;
  status: string;
  startAt: string;
  endAt: string;
}

interface TournamentEntry {
  rank: number;
  userId: number;
  username: string;
  score: number;
}

function getToken() {
  return typeof localStorage !== "undefined" ? localStorage.getItem("dgc_token") : null;
}

const PERIODS = [
  { key: "alltime",  label: "All Time" },
  { key: "monthly",  label: "Monthly" },
  { key: "weekly",   label: "Weekly"  },
  { key: "daily",    label: "Today"   },
];

const getRankIcon = (rank: number) => {
  switch (rank) {
    case 1: return <Crown className="w-6 h-6 text-yellow-500" />;
    case 2: return <Medal className="w-6 h-6 text-gray-400" />;
    case 3: return <Medal className="w-6 h-6 text-amber-700" />;
    default: return <span className="font-mono text-muted-foreground w-6 text-center inline-block">{rank}</span>;
  }
};

function LeaderboardTable({ entries, loading }: { entries: LeaderboardEntry[]; loading: boolean }) {
  return (
    <Card className="bg-card border-border overflow-hidden">
      <div className="overflow-x-auto scrollbar-hide">
        <table className="w-full text-[10px] md:text-sm text-left">
          <thead className="text-[10px] md:text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border">
            <tr>
              <th className="px-2 md:px-6 py-4 font-medium w-12 md:w-24 text-center">Rank</th>
              <th className="px-2 md:px-6 py-4 font-medium">Player</th>
              <th className="px-2 md:px-6 py-4 font-medium text-right">Bets</th>
              <th className="px-2 md:px-6 py-4 font-medium text-right text-primary">Won</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center">
                  <div className="animate-pulse space-y-4">
                    {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-10 bg-secondary rounded-md w-full" />)}
                  </div>
                </td>
              </tr>
            ) : !entries.length ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground font-mono">
                  No data for this period yet.
                </td>
              </tr>
            ) : (
              entries.map((entry, idx) => (
                <tr
                  key={entry.userId}
                  className={`border-b border-border/50 transition-colors ${idx < 3 ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-secondary/20"}`}
                >
                  <td className="px-2 md:px-6 py-4 text-center">
                    <div className="flex justify-center scale-75 md:scale-100">{getRankIcon(entry.rank)}</div>
                  </td>
                  <td className="px-2 md:px-6 py-4">
                    <div className="flex items-center gap-2 md:gap-3">
                      <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-secondary border border-border flex items-center justify-center font-bold text-[10px] md:text-xs text-primary">
                        {entry.username.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-mono font-bold text-foreground truncate max-w-[60px] md:max-w-none">{entry.username}</span>
                    </div>
                  </td>
                  <td className="px-2 md:px-6 py-4 text-right font-mono text-muted-foreground">{formatNumber(entry.totalBets)}</td>
                  <td className="px-2 md:px-6 py-4 text-right font-mono font-bold text-primary">{formatCurrency(entry.totalWon)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function TournamentCard({ t, onSelect }: { t: Tournament; onSelect: (id: number) => void }) {
  const now = Date.now();
  const isActive = t.status === "active";
  const isUpcoming = t.status === "upcoming";
  const timeLeft = new Date(t.endAt).getTime() - now;
  const hoursLeft = Math.max(0, Math.floor(timeLeft / 3600000));

  return (
    <Card
      className={`bg-card border cursor-pointer hover:border-primary/40 transition-all ${isActive ? "border-primary/30 shadow-[0_0_20px_var(--theme-glow)]" : "border-border/50"}`}
      onClick={() => onSelect(t.id)}
    >
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <div className="font-display font-black uppercase tracking-widest text-base">{t.name}</div>
            {t.description && <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>}
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase whitespace-nowrap ${
            isActive   ? "bg-green-500/10 text-green-400"  :
            isUpcoming ? "bg-yellow-500/10 text-yellow-400" :
                         "bg-secondary text-muted-foreground"
          }`}>{t.status}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="font-mono font-black text-xl text-primary">{formatCurrency(t.prize)} <span className="text-xs font-normal text-muted-foreground">prize</span></div>
          {isActive && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
              <Clock className="w-3 h-3" />{hoursLeft}h left
            </div>
          )}
          {isUpcoming && (
            <div className="text-xs text-muted-foreground font-mono">
              Starts {new Date(t.startAt).toLocaleDateString()}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Leaderboard() {
  const [period, setPeriod] = useState("alltime");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<number | null>(null);
  const [tournamentBoard, setTournamentBoard] = useState<{ tournament: Tournament; leaderboard: TournamentEntry[] } | null>(null);
  const [tLoading, setTLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/leaderboard?period=${period}&limit=50`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setEntries(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period]);

  useEffect(() => {
    fetch("/api/tournaments")
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setTournaments(d); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedTournament) return;
    setTLoading(true);
    fetch(`/api/tournaments/${selectedTournament}/leaderboard`)
      .then(r => r.json())
      .then(d => { if (d.tournament) setTournamentBoard(d); })
      .catch(() => {})
      .finally(() => setTLoading(false));
  }, [selectedTournament]);

  const activeTournaments = tournaments.filter(t => t.status === "active");
  const upcomingTournaments = tournaments.filter(t => t.status === "upcoming");
  const endedTournaments = tournaments.filter(t => t.status === "ended");

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="text-center space-y-4 mb-8">
        <div className="w-20 h-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
          <Trophy className="w-10 h-10 text-primary" />
        </div>
        <h1 className="font-display font-black text-4xl md:text-5xl uppercase tracking-widest">Hall of Fame</h1>
        <p className="text-muted-foreground max-w-xl mx-auto">
          The highest rollers in the DGC Arcade — ranked by total winnings.
        </p>
      </div>

      <Tabs value="leaderboard" className="w-full">
        <TabsList className="bg-secondary grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="leaderboard" className="font-bold uppercase text-xs">Leaderboard</TabsTrigger>
          <TabsTrigger value="tournaments" className="font-bold uppercase text-xs">
            Tournaments {activeTournaments.length > 0 && <span className="ml-1 w-2 h-2 rounded-full bg-green-400 inline-block animate-pulse" />}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="leaderboard" className="space-y-4">
          {/* Period selector */}
          <div className="flex gap-2 flex-wrap">
            {PERIODS.map(p => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest border transition-colors ${
                  period === p.key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/30"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <LeaderboardTable entries={entries} loading={loading} />
        </TabsContent>

        <TabsContent value="tournaments" className="space-y-6">
          {activeTournaments.length > 0 && (
            <div>
              <h3 className="font-display font-bold uppercase tracking-widest text-sm text-green-400 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block" /> Live Now
              </h3>
              <div className="grid gap-3 md:grid-cols-2">
                {activeTournaments.map(t => <TournamentCard key={t.id} t={t} onSelect={setSelectedTournament} />)}
              </div>
            </div>
          )}

          {upcomingTournaments.length > 0 && (
            <div>
              <h3 className="font-display font-bold uppercase tracking-widest text-sm text-yellow-400 mb-3">Coming Soon</h3>
              <div className="grid gap-3 md:grid-cols-2">
                {upcomingTournaments.map(t => <TournamentCard key={t.id} t={t} onSelect={setSelectedTournament} />)}
              </div>
            </div>
          )}

          {activeTournaments.length === 0 && upcomingTournaments.length === 0 && (
            <div className="text-center py-16 text-muted-foreground font-mono border border-dashed border-border rounded-xl">
              <Swords className="w-10 h-10 mx-auto mb-3 opacity-30" />
              No active tournaments right now. Check back soon!
            </div>
          )}

          {endedTournaments.length > 0 && (
            <div>
              <h3 className="font-display font-bold uppercase tracking-widest text-sm text-muted-foreground mb-3">Past Tournaments</h3>
              <div className="grid gap-3 md:grid-cols-2">
                {endedTournaments.slice(0, 4).map(t => <TournamentCard key={t.id} t={t} onSelect={setSelectedTournament} />)}
              </div>
            </div>
          )}

          {/* Tournament leaderboard modal */}
          {selectedTournament && tournamentBoard && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <div className="bg-card border border-border/60 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
                <div className="sticky top-0 bg-card border-b border-border/50 p-5 flex items-center justify-between">
                  <div>
                    <h2 className="font-display font-black uppercase tracking-widest text-lg">{tournamentBoard.tournament.name}</h2>
                    <div className="text-xs text-muted-foreground font-mono">{formatCurrency(tournamentBoard.tournament.prize)} prize pool</div>
                  </div>
                  <button onClick={() => setSelectedTournament(null)} className="text-muted-foreground hover:text-foreground text-xl font-bold px-2">✕</button>
                </div>
                <div className="p-4 space-y-2">
                  {tLoading ? (
                    <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 bg-secondary animate-pulse rounded-lg" />)}</div>
                  ) : !tournamentBoard.leaderboard.length ? (
                    <div className="text-center py-8 text-muted-foreground font-mono text-sm">No participants yet.</div>
                  ) : (
                    tournamentBoard.leaderboard.map(e => (
                      <div key={e.userId} className={`flex items-center justify-between p-3 rounded-lg border ${e.rank <= 3 ? "border-primary/30 bg-primary/5" : "border-border/40 bg-secondary/20"}`}>
                        <div className="flex items-center gap-3">
                          <div className="w-7 flex justify-center">{getRankIcon(e.rank)}</div>
                          <span className="font-mono font-bold text-sm">{e.username}</span>
                        </div>
                        <span className="font-mono text-sm text-primary font-bold">{formatCurrency(e.score)} wagered</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
