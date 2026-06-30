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
import { ChevronLeft, Trophy, Zap } from "lucide-react";
import { ProvablyFairPanel } from "@/components/games/provably-fair-panel";

function getToken() { return typeof localStorage !== "undefined" ? localStorage.getItem("dgc_token") : null; }

const RACERS = [
  { id: 1, name: "Blaze",   color: "#ef4444", silk: "#fecaca", mane: "#7f1d1d" },
  { id: 2, name: "Thunder", color: "#f59e0b", silk: "#fde68a", mane: "#92400e" },
  { id: 3, name: "Shadow",  color: "#8b5cf6", silk: "#ddd6fe", mane: "#4c1d95" },
  { id: 4, name: "Storm",   color: "#06b6d4", silk: "#a5f3fc", mane: "#155e75" },
  { id: 5, name: "Bolt",    color: "#22c55e", silk: "#bbf7d0", mane: "#14532d" },
  { id: 6, name: "Phantom", color: "#ec4899", silk: "#fbcfe8", mane: "#831843" },
];

type RaceResult = {
  betId: number; won: boolean; winnerRacerId: number; finishOrder: number[];
  playerPlace: number; multiplier: number; payout: number; profit: number;
  newBalance: number; serverSeedHash: string; serverSeed: string; clientSeed: string; nonce: number;
};
type TrackProgress = { racerId: number; x: number; done: boolean };

function HorseSprite({ color, silk, mane, gallop }: { color: string; silk: string; mane: string; gallop: boolean }) {
  return (
    <svg viewBox="0 0 64 40" className={`w-16 h-10 drop-shadow-lg ${gallop ? "horse-gallop" : ""}`}>
      {/* Dust */}
      <ellipse cx="8" cy="36" rx="10" ry="2" fill="#8B6914" opacity="0.35" className={gallop ? "horse-dust" : ""} />
      {/* Legs back */}
      <rect x="14" y="28" width="3" height="10" rx="1.5" fill={mane} className="horse-leg-back" />
      <rect x="22" y="28" width="3" height="10" rx="1.5" fill={mane} className="horse-leg-front" />
      {/* Body */}
      <ellipse cx="32" cy="22" rx="18" ry="9" fill={color} />
      {/* Neck + head */}
      <ellipse cx="48" cy="16" rx="8" ry="7" fill={color} />
      <circle cx="54" cy="13" r="5" fill={color} />
      {/* Mane */}
      <path d="M44 10 Q40 6 46 4 Q50 8 48 14" fill={mane} />
      {/* Jockey silk */}
      <rect x="28" y="14" width="10" height="8" rx="2" fill={silk} stroke="#fff" strokeWidth="0.5" />
      {/* Legs front */}
      <rect x="36" y="28" width="3" height="10" rx="1.5" fill={mane} className="horse-leg-front" />
      <rect x="44" y="28" width="3" height="10" rx="1.5" fill={mane} className="horse-leg-back" />
      {/* Tail */}
      <path d="M16 20 Q8 16 10 26 Q14 24 18 22" fill={mane} />
    </svg>
  );
}

export default function RacePage() {
  const { user, isAuthenticated } = useAuth();
  const { open } = useAuthModal();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedRacer, setSelectedRacer] = useState<number | null>(1);
  const [betAmount, setBetAmount] = useState("1");
  const [racing, setRacing] = useState(false);
  const [result, setResult] = useState<RaceResult | null>(null);
  const [trackProgress, setTrackProgress] = useState<TrackProgress[]>(RACERS.map(r => ({ racerId: r.id, x: 0, done: false })));
  const [cameraX, setCameraX] = useState(0);
  const animRef = useRef<number | null>(null);
  const startRef = useRef(0);

  function resetRace() {
    setResult(null);
    setTrackProgress(RACERS.map(r => ({ racerId: r.id, x: 0, done: false })));
    setCameraX(0);
  }

  async function runRace() {
    if (!isAuthenticated) { open("login"); return; }
    if (!selectedRacer) { toast({ title: "Pick a horse!", variant: "destructive" }); return; }
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
    const finishRank: Record<number, number> = {};
    finishOrder.forEach((id, i) => { finishRank[id] = i; });

    startRef.current = performance.now();
    const TRACK_LEN = 88; // percent of track width

    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const progress = RACERS.map(r => {
        const rank = finishRank[r.id];
        const finishMs = 2800 + rank * 550 + (r.id % 3) * 80;
        const t = Math.min(1, elapsed / finishMs);
        // Ease-out gallop curve
        const eased = 1 - Math.pow(1 - t, 2.2);
        return { racerId: r.id, x: eased * TRACK_LEN, done: t >= 1 };
      });
      setTrackProgress(progress);

      const leader = progress.reduce((a, b) => a.x > b.x ? a : b);
      setCameraX(Math.min(leader.x * 0.55, TRACK_LEN * 0.55));

      if (progress.every(p => p.done)) {
        setResult(res);
        setRacing(false);
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        return;
      }
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
  }

  useEffect(() => () => { if (animRef.current) cancelAnimationFrame(animRef.current); }, []);

  const selectedRacerData = RACERS.find(r => r.id === selectedRacer);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/games">
          <button className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors text-sm font-medium">
            <ChevronLeft className="w-4 h-4" /> Games
          </button>
        </Link>
        <h1 className="font-display font-black text-3xl uppercase tracking-widest">🏇 DGC Derby</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-card border-border p-5 space-y-5">
          <div>
            <div className="text-xs uppercase tracking-widest font-bold text-muted-foreground mb-3">Pick Your Horse</div>
            <div className="grid grid-cols-2 gap-2">
              {RACERS.map(r => (
                <button key={r.id} disabled={racing} onClick={() => setSelectedRacer(r.id)}
                  className={`flex items-center gap-2 p-2.5 rounded-lg border transition-all font-bold text-sm ${selectedRacer === r.id ? "border-2" : "border-border/50 hover:border-border bg-secondary/30"} disabled:opacity-50`}
                  style={selectedRacer === r.id ? { borderColor: r.color, backgroundColor: `${r.color}18` } : undefined}>
                  <HorseSprite color={r.color} silk={r.silk} mane={r.mane} gallop={false} />
                  <span>{r.name}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest font-bold text-muted-foreground block mb-2">Bet Amount (USD)</label>
            <Input type="number" min="0.01" step="0.01" value={betAmount} onChange={e => setBetAmount(e.target.value)} disabled={racing} className="font-mono bg-secondary border-border" />
            {user && <p className="text-xs text-muted-foreground font-mono mt-1.5">Balance: <span className="text-primary font-bold">{formatCurrency(user.balance)}</span></p>}
          </div>
          <Button className="w-full font-display font-black uppercase tracking-widest text-base h-12" disabled={racing} onClick={runRace}>
            <Zap className="w-5 h-5" /> {racing ? "Racing…" : "START RACE"}
          </Button>
          {result && (
            <ProvablyFairPanel
              betId={result.betId}
              serverSeedHash={result.serverSeedHash}
              serverSeed={result.serverSeed}
              clientSeed={result.clientSeed}
              nonce={result.nonce}
              verifyPath={`/api/race/verify/${result.betId}`}
            />
          )}
        </Card>

        <div className="lg:col-span-2 space-y-4">
          {/* San Andreas style side-view track */}
          <Card className="bg-card border-border p-0 overflow-hidden">
            <div className="relative h-72 md:h-80 overflow-hidden derby-track-scene">
              {/* Sky */}
              <div className="absolute inset-0 bg-gradient-to-b from-[#87CEEB] via-[#E8C872] to-[#C4A052]" />
              {/* Grandstand silhouette */}
              <div className="absolute bottom-24 left-0 right-0 h-16 opacity-30"
                style={{ background: "repeating-linear-gradient(90deg, #333 0px, #333 8px, transparent 8px, transparent 16px)" }} />
              {/* Track surface */}
              <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-b from-[#8B6914] to-[#5C4033]" />
              <div className="absolute bottom-20 left-0 right-0 h-1 bg-white/40" />
              {/* Inner rail */}
              <div className="absolute bottom-16 left-0 right-0 h-0.5 bg-[#FFD700]/60" />

              {/* Scrolling track content */}
              <div className="absolute bottom-6 left-0 right-0 h-20 transition-transform duration-75"
                style={{ transform: `translateX(-${cameraX}%)`, width: "180%" }}>
                {/* Finish post */}
                <div className="absolute right-[8%] bottom-0 flex flex-col items-center">
                  <div className="w-1 h-16 bg-white shadow-lg" />
                  <div className="flex flex-col w-3">
                    {Array.from({length:8}).map((_,i)=>(
                      <div key={i} className="h-2" style={{ background: i%2===0 ? "#111" : "#fff" }} />
                    ))}
                  </div>
                  <span className="text-[10px] font-black text-white mt-1 uppercase tracking-widest drop-shadow">Finish</span>
                </div>

                {RACERS.map((r, lane) => {
                  const prog = trackProgress.find(p => p.racerId === r.id);
                  const x = prog?.x ?? 0;
                  const isWinner = result?.winnerRacerId === r.id;
                  const isMyPick = r.id === selectedRacer;
                  return (
                    <div key={r.id} className="absolute flex items-end gap-1 transition-all duration-75"
                      style={{ left: `${4 + x}%`, bottom: `${lane * 12 + 4}px`, zIndex: isMyPick ? 20 : 10 - lane }}>
                      {isMyPick && <span className="text-[9px] font-black uppercase text-yellow-300 drop-shadow mb-8">YOU</span>}
                      <div className={isWinner && result ? "scale-110" : ""}>
                        <HorseSprite color={r.color} silk={r.silk} mane={r.mane} gallop={racing && !prog?.done} />
                      </div>
                      {isWinner && result && <Trophy className="w-4 h-4 text-yellow-400 mb-6 animate-bounce" />}
                    </div>
                  );
                })}
              </div>

              {/* Vignette */}
              <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-black/20 via-transparent to-black/30" />
            </div>
          </Card>

          {result && (
            <Card className={`border-2 p-5 ${result.won ? "border-green-500/60 bg-green-500/5" : "border-destructive/40 bg-destructive/5"}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display font-black uppercase tracking-widest text-lg">{result.won ? "Winner! 🏆" : `Finished #${result.playerPlace}`}</h3>
                <Button variant="outline" size="sm" onClick={resetRace} disabled={racing}>Race Again</Button>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-secondary/50 rounded-lg p-2.5">
                  <div className={`font-mono font-black text-lg ${result.profit >= 0 ? "text-green-400" : "text-destructive"}`}>{result.profit >= 0 ? "+" : ""}{formatCurrency(result.profit)}</div>
                  <div className="text-[10px] text-muted-foreground uppercase">Profit</div>
                </div>
                <div className="bg-secondary/50 rounded-lg p-2.5">
                  <div className="font-mono font-black text-lg text-primary">{result.multiplier.toFixed(2)}×</div>
                  <div className="text-[10px] text-muted-foreground uppercase">Multiplier</div>
                </div>
                <div className="bg-secondary/50 rounded-lg p-2.5">
                  <div className="font-mono font-black text-lg">{formatCurrency(result.newBalance)}</div>
                  <div className="text-[10px] text-muted-foreground uppercase">Balance</div>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
