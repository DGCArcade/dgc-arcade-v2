import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useAuthModal } from "@/hooks/use-auth-modal";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import { ChevronLeft, Trophy, Star, Zap } from "lucide-react";

function getToken() { return typeof localStorage !== "undefined" ? localStorage.getItem("dgc_token") : null; }

const RACERS = [
  { id: 1, name: "Blaze",   color: "#ef4444", bg: "bg-red-500/20",    border: "border-red-500", emoji: "🔴" },
  { id: 2, name: "Thunder", color: "#f59e0b", bg: "bg-yellow-500/20", border: "border-yellow-500", emoji: "🟡" },
  { id: 3, name: "Shadow",  color: "#8b5cf6", bg: "bg-purple-500/20", border: "border-purple-500", emoji: "🟣" },
  { id: 4, name: "Storm",   color: "#06b6d4", bg: "bg-cyan-500/20",   border: "border-cyan-500", emoji: "🔵" },
  { id: 5, name: "Bolt",    color: "#22c55e", bg: "bg-green-500/20",  border: "border-green-500", emoji: "🟢" },
  { id: 6, name: "Phantom", color: "#ec4899", bg: "bg-pink-500/20",   border: "border-pink-500", emoji: "🩷" },
];

type RaceResult = {
  won: boolean;
  winnerRacerId: number;
  finishOrder: number[];
  playerPlace: number;
  multiplier: number;
  payout: number;
  profit: number;
  newBalance: number;
};

type TrackProgress = { racerId: number; pct: number; done: boolean };

export default function RacePage() {
  const { user, isAuthenticated, refreshUser } = useAuth();
  const { openLogin } = useAuthModal();
  const { toast } = useToast();
  const [selectedRacer, setSelectedRacer] = useState<number | null>(null);
  const [betAmount, setBetAmount] = useState("1");
  const [racing, setRacing] = useState(false);
  const [result, setResult] = useState<RaceResult | null>(null);
  const [trackProgress, setTrackProgress] = useState<TrackProgress[]>(
    RACERS.map(r => ({ racerId: r.id, pct: 0, done: false }))
  );
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function resetRace() {
    setResult(null);
    setTrackProgress(RACERS.map(r => ({ racerId: r.id, pct: 0, done: false })));
  }

  async function runRace() {
    if (!isAuthenticated) { openLogin(); return; }
    if (!selectedRacer) { toast({ title: "Pick a racer!", variant: "destructive" }); return; }
    const amt = parseFloat(betAmount);
    if (isNaN(amt) || amt <= 0) { toast({ title: "Invalid bet", variant: "destructive" }); return; }

    resetRace();
    setRacing(true);

    const token = getToken();
    let res: RaceResult;
    try {
      const r = await fetch("/api/race/run", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ betAmount: amt, racerId: selectedRacer }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Race failed"); }
      res = await r.json();
    } catch (e: unknown) {
      setRacing(false);
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
      return;
    }

    const { finishOrder } = res;
    const speeds: Record<number, number> = {};
    RACERS.forEach(r => {
      const place = finishOrder.indexOf(r.id);
      speeds[r.id] = 1.5 + (5 - place) * 0.3 + Math.random() * 0.4;
    });

    const progress: Record<number, number> = {};
    RACERS.forEach(r => { progress[r.id] = 0; });
    const finished: Set<number> = new Set();
    const finishTimes: number[] = [];

    animRef.current = setInterval(() => {
      let allDone = true;
      RACERS.forEach(r => {
        if (finished.has(r.id)) return;
        const targetPct = (6 - finishOrder.indexOf(r.id)) / 6 * 100;
        progress[r.id] = Math.min(progress[r.id] + speeds[r.id], 100);
        if (progress[r.id] >= 100) {
          finished.add(r.id);
          finishTimes.push(r.id);
        } else {
          allDone = false;
        }
      });

      setTrackProgress(RACERS.map(r => ({
        racerId: r.id,
        pct: progress[r.id],
        done: finished.has(r.id),
      })));

      if (allDone || (finishTimes.length === 6)) {
        clearInterval(animRef.current!);
        setRacing(false);
        setResult(res);
        refreshUser?.();
        if (res.won) {
          toast({ title: "🏆 YOU WIN!", description: `+${formatCurrency(res.payout)} (${res.multiplier}x)` });
        } else {
          toast({ title: `#${res.playerPlace} place`, description: `${RACERS.find(r => r.id === res.winnerRacerId)?.name} wins!`, variant: "destructive" });
        }
      }
    }, 40);
  }

  useEffect(() => () => { if (animRef.current) clearInterval(animRef.current); }, []);

  const balance = user ? Number(user.balance) : 0;

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link href="/games" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back to Games
        </Link>
      </div>

      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-4xl font-display font-black uppercase tracking-tight" style={{ color: "var(--theme-glow)" }}>
            🏇 DGC RACE
          </h1>
          <p className="text-muted-foreground mt-1">Pick your horse. Place your bet. First to cross the line wins 5.5×!</p>
        </div>
        <div className="ml-auto text-right hidden sm:block">
          <div className="text-xs text-muted-foreground uppercase tracking-widest">House Edge</div>
          <div className="text-sm font-mono font-bold">8.3%</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Race Track */}
        <Card className="lg:col-span-2 bg-card border-border p-5 flex flex-col gap-4">
          <div className="text-xs uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Race Track
          </div>

          <div className="flex flex-col gap-2">
            {RACERS.map((racer) => {
              const prog = trackProgress.find(t => t.racerId === racer.id);
              const pct = prog?.pct ?? 0;
              const place = result ? result.finishOrder.indexOf(racer.id) + 1 : null;
              const isWinner = result && racer.id === result.winnerRacerId;
              const isMyRacer = racer.id === selectedRacer;

              return (
                <div key={racer.id} className="relative">
                  <div className={`flex items-center gap-2 rounded-lg p-2 transition-all border ${isMyRacer ? racer.border + " border-2" : "border-border/30"}`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0`}
                      style={{ backgroundColor: racer.color }}>
                      {racer.id}
                    </div>
                    <div className="w-16 text-xs font-bold hidden sm:block flex-shrink-0" style={{ color: racer.color }}>
                      {racer.name}
                    </div>
                    <div className="flex-1 h-6 bg-secondary/40 rounded-full overflow-hidden relative">
                      <div
                        className="h-full rounded-full transition-none flex items-center justify-end pr-1"
                        style={{ width: `${pct}%`, backgroundColor: racer.color, minWidth: pct > 0 ? "24px" : "0" }}
                      >
                        {pct > 8 && <span className="text-xs">🐎</span>}
                      </div>
                    </div>
                    <div className="w-8 text-center flex-shrink-0">
                      {place && (
                        <span className={`text-sm font-black ${isWinner ? "text-yellow-400" : "text-muted-foreground"}`}>
                          {place === 1 ? "🏆" : place === 2 ? "🥈" : place === 3 ? "🥉" : `#${place}`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {result && (
            <div className={`mt-2 rounded-xl p-4 text-center border-2 ${result.won ? "border-yellow-500 bg-yellow-500/10" : "border-red-500/40 bg-red-500/10"}`}>
              {result.won ? (
                <div>
                  <div className="text-2xl font-black text-yellow-400 animate-bounce">🏆 WINNER!</div>
                  <div className="text-lg font-bold text-green-400">+{formatCurrency(result.payout)}</div>
                  <div className="text-sm text-muted-foreground">{result.multiplier}× multiplier</div>
                </div>
              ) : (
                <div>
                  <div className="text-xl font-black text-red-400">#{result.playerPlace} Place</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {RACERS.find(r => r.id === result.winnerRacerId)?.name} takes the gold!
                  </div>
                </div>
              )}
              <Button onClick={resetRace} variant="outline" size="sm" className="mt-3">
                Race Again
              </Button>
            </div>
          )}
        </Card>

        {/* Bet Panel */}
        <Card className="bg-card border-border p-5 flex flex-col gap-5">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground font-bold mb-3">Pick Your Racer</div>
            <div className="grid grid-cols-3 gap-2">
              {RACERS.map(racer => (
                <button
                  key={racer.id}
                  onClick={() => !racing && setSelectedRacer(racer.id)}
                  disabled={racing}
                  className={`rounded-xl p-3 flex flex-col items-center gap-1 border-2 transition-all ${
                    selectedRacer === racer.id
                      ? racer.border + " " + racer.bg + " scale-105"
                      : "border-border/40 hover:border-border bg-secondary/20"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <span className="text-xl">🐎</span>
                  <span className="text-xs font-bold" style={{ color: racer.color }}>{racer.name}</span>
                  <span className="text-xs text-muted-foreground">5.5×</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground font-bold mb-2">Bet Amount</div>
            <div className="flex rounded-lg border border-border bg-input overflow-hidden">
              <span className="px-3 py-2 text-muted-foreground text-sm border-r border-border">$</span>
              <Input
                type="number"
                value={betAmount}
                onChange={e => setBetAmount(e.target.value)}
                className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                disabled={racing}
                min={1}
              />
            </div>
            <div className="flex gap-2 mt-2">
              {["1","5","10","50"].map(v => (
                <button key={v} onClick={() => setBetAmount(v)} disabled={racing}
                  className="flex-1 text-xs font-bold bg-secondary/60 hover:bg-secondary rounded-lg py-1.5 border border-border/50 transition-colors disabled:opacity-50">
                  ${v}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-secondary/30 rounded-xl p-3 text-xs space-y-1.5 font-mono">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Win Pays</span>
              <span className="font-bold text-green-400">5.5×</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">To Win</span>
              <span className="font-bold">{formatCurrency(parseFloat(betAmount || "0") * 5.5)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Racers</span>
              <span className="font-bold">6</span>
            </div>
            {isAuthenticated && (
              <div className="flex justify-between border-t border-border/50 pt-1.5">
                <span className="text-muted-foreground">Balance</span>
                <span className="font-bold">{formatCurrency(balance)}</span>
              </div>
            )}
          </div>

          <Button
            onClick={runRace}
            disabled={racing || !selectedRacer}
            className="w-full font-black uppercase tracking-widest text-lg py-6"
            style={{ background: racing ? undefined : "var(--theme-glow)" }}
          >
            {racing ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin">🐎</span> RACING…
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Zap className="w-5 h-5" /> START RACE
              </span>
            )}
          </Button>

          {!isAuthenticated && (
            <p className="text-xs text-center text-muted-foreground">
              <button onClick={openLogin} className="text-primary hover:underline font-bold">Log in</button> to place real bets
            </p>
          )}
        </Card>
      </div>

      {/* Recent Race History placeholder */}
      <Card className="bg-card border-border p-5">
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="w-4 h-4 text-yellow-400" />
          <span className="font-bold uppercase tracking-widest text-sm">How to Play</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-muted-foreground">
          <div className="flex gap-3 items-start">
            <span className="text-2xl">1️⃣</span>
            <div><strong className="text-foreground">Pick a Racer</strong><br />Choose one of 6 horses — Blaze, Thunder, Shadow, Storm, Bolt, or Phantom.</div>
          </div>
          <div className="flex gap-3 items-start">
            <span className="text-2xl">2️⃣</span>
            <div><strong className="text-foreground">Place Your Bet</strong><br />Enter your bet amount. If your horse wins, you get 5.5× your bet back!</div>
          </div>
          <div className="flex gap-3 items-start">
            <span className="text-2xl">3️⃣</span>
            <div><strong className="text-foreground">Watch Them Race</strong><br />Hit START and watch all 6 horses race to the finish line in real time.</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
