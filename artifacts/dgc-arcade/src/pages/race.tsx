import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useAuthModal } from "@/hooks/use-auth-modal";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
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

type RaceResult = { won: boolean; winnerRacerId: number; finishOrder: number[]; playerPlace: number; multiplier: number; payout: number; profit: number; newBalance: number; };
type TrackProgress = { racerId: number; pct: number; done: boolean };

export default function RacePage() {
  const { user, isAuthenticated } = useAuth();
  const { open } = useAuthModal();
  const openLogin = () => open("login");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // Blaze pre-selected so the Start Race button is immediately active
  const [selectedRacer, setSelectedRacer] = useState<number | null>(1);
  const [betAmount, setBetAmount] = useState("1");
  const [racing, setRacing] = useState(false);
  const [result, setResult] = useState<RaceResult | null>(null);
  const [trackProgress, setTrackProgress] = useState<TrackProgress[]>(RACERS.map(r => ({ racerId: r.id, pct: 0, done: false })));
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

    const finishOrder = res.finishOrder;
    const racerSpeeds: Record<number, number> = {};
    RACERS.forEach(r => { racerSpeeds[r.id] = 0.8 + Math.random() * 0.8; });
    racerSpeeds[finishOrder[0]] = 1.8 + Math.random() * 0.4;
    let progress: Record<number, number> = {};
    RACERS.forEach(r => { progress[r.id] = 0; });
    let finishedCount = 0;

    animRef.current = setInterval(() => {
      RACERS.forEach(r => {
        if (progress[r.id] >= 100) return;
        progress[r.id] = Math.min(100, progress[r.id] + racerSpeeds[r.id] * (0.7 + Math.random() * 0.6));
        if (progress[r.id] >= 100) { finishedCount++; }
      });
      setTrackProgress(RACERS.map(r => ({ racerId: r.id, pct: progress[r.id], done: progress[r.id] >= 100 })));
      if (finishedCount >= RACERS.length) {
        clearInterval(animRef.current!);
        setResult(res);
        setRacing(false);
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      }
    }, 50);
  }

  useEffect(() => () => { if (animRef.current) clearInterval(animRef.current); }, []);
  const selectedRacerData = RACERS.find(r => r.id === selectedRacer);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/games">
          <button className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors text-sm font-medium">
            <ChevronLeft className="w-4 h-4" /> Games
          </button>
        </Link>
        <h1 className="font-display font-black text-3xl uppercase tracking-widest">🏇 Horse Racing</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-card border-border p-5 space-y-5">
          <div>
            <div className="text-xs uppercase tracking-widest font-bold text-muted-foreground mb-3">Pick Your Racer</div>
            <div className="grid grid-cols-2 gap-2">
              {RACERS.map(r => (
                <button key={r.id} disabled={racing} onClick={() => setSelectedRacer(r.id)}
                  className={`flex items-center gap-2 p-2.5 rounded-lg border transition-all font-bold text-sm ${selectedRacer === r.id ? `${r.bg} ${r.border} border-2` : "border-border/50 hover:border-border bg-secondary/30"} disabled:opacity-50 disabled:cursor-not-allowed`}>
                  <span>{r.emoji}</span><span>{r.name}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest font-bold text-muted-foreground block mb-2">Bet Amount (USD)</label>
            <Input type="number" min="0.01" step="0.01" value={betAmount} onChange={e => setBetAmount(e.target.value)} disabled={racing} className="font-mono bg-secondary border-border" />
            <div className="grid grid-cols-4 gap-1.5 mt-2">
              {[1, 5, 10, 25].map(v => (
                <button key={v} onClick={() => setBetAmount(String(v))} disabled={racing}
                  className="flex-1 text-xs font-bold bg-secondary/60 hover:bg-secondary rounded-lg py-1.5 border border-border/50 hover:border-border transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  ${v}
                </button>
              ))}
            </div>
            {user && <p className="text-xs text-muted-foreground font-mono mt-1.5">Balance: <span className="text-primary font-bold">{formatCurrency(user.balance)}</span></p>}
          </div>
          <Button className="w-full font-display font-black uppercase tracking-widest text-base h-12" disabled={racing} onClick={runRace}>
            <Zap className="w-5 h-5" /> {racing ? "Racing…" : "START RACE"}
          </Button>
          {selectedRacerData && !racing && (
            <div className="text-xs text-center text-muted-foreground font-mono">
              Betting on <span style={{ color: selectedRacerData.color }} className="font-bold">{selectedRacerData.emoji} {selectedRacerData.name}</span>
            </div>
          )}
        </Card>

        <div className="lg:col-span-2 space-y-4">
          <Card className="bg-card border-border p-5">
            <div className="text-xs uppercase tracking-widest font-bold text-muted-foreground mb-4">Live Track</div>
            <div className="space-y-3">
              {RACERS.map(r => {
                const prog = trackProgress.find(p => p.racerId === r.id);
                const pct = prog?.pct ?? 0;
                const isWinner = result?.winnerRacerId === r.id;
                const isMyPick = r.id === selectedRacer;
                return (
                  <div key={r.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className={`flex items-center gap-1.5 ${isMyPick ? "text-foreground" : "text-muted-foreground"}`}>
                        {r.emoji} {r.name}
                        {isMyPick && <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full uppercase tracking-wider">Your pick</span>}
                        {isWinner && <Trophy className="w-3.5 h-3.5 text-yellow-400" />}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">{Math.round(pct)}%</span>
                    </div>
                    <div className="w-full h-3 rounded-full bg-secondary overflow-hidden border border-border/30">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: r.color, boxShadow: pct > 0 ? `0 0 6px ${r.color}80` : "none" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {result && (
            <Card className={`border-2 p-5 ${result.won ? "border-green-500/60 bg-green-500/5" : "border-destructive/40 bg-destructive/5"}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {result.won ? <Trophy className="w-5 h-5 text-yellow-400" /> : <Star className="w-5 h-5 text-muted-foreground" />}
                  <h3 className="font-display font-black uppercase tracking-widest text-lg">{result.won ? "Winner! 🏆" : `Finished #${result.playerPlace}`}</h3>
                </div>
                <Button variant="outline" size="sm" className="font-bold uppercase text-xs" onClick={resetRace} disabled={racing}>Race Again</Button>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-secondary/50 rounded-lg p-2.5">
                  <div className={`font-mono font-black text-lg ${result.profit >= 0 ? "text-green-400" : "text-destructive"}`}>{result.profit >= 0 ? "+" : ""}{formatCurrency(result.profit)}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Profit</div>
                </div>
                <div className="bg-secondary/50 rounded-lg p-2.5">
                  <div className="font-mono font-black text-lg text-primary">{result.multiplier}×</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Multiplier</div>
                </div>
                <div className="bg-secondary/50 rounded-lg p-2.5">
                  <div className="font-mono font-black text-lg">{formatCurrency(result.newBalance)}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">New Balance</div>
                </div>
              </div>
              <div className="mt-3 text-xs text-muted-foreground font-mono text-center">
                Finish order: {result.finishOrder.map(id => { const r = RACERS.find(x => x.id === id); return r ? r.emoji + " " + r.name : ""; }).join(" → ")}
              </div>
            </Card>
          )}

          {!result && !racing && (
            <Card className="bg-secondary/20 border-border/50 p-4">
              <div className="text-xs uppercase tracking-widest font-bold text-muted-foreground mb-3">How it works</div>
              <div className="space-y-2">
                {[["🐴 Pick a Horse","Choose one of 6 racers to bet on"],["💰 Set Your Bet","Enter how much you want to wager"],["🏁 Watch Them Race","Hit START and watch all 6 horses race to the finish"],["🏆 Win Up To 4×","1st pays 4×, 2nd pays 2.5×, 3rd pays 1.5×"]].map(([title, desc]) => (
                  <div key={String(title)} className="flex gap-3 items-start">
                    <div><strong className="text-foreground text-xs">{title}</strong><br /><span className="text-muted-foreground text-xs">{desc}</span></div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
