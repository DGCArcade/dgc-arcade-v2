import { useState, useEffect, useRef, useCallback } from "react";
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
import { ChevronLeft, Trophy, Zap, Video } from "lucide-react";
import { ProvablyFairPanel } from "@/components/games/provably-fair-panel";
import { startHorseGallopLoop, stopHorseGallopLoop, playRaceStartBugle, playRaceFinishCheer } from "@/lib/horse-gallop-sound";
import { DerbyHorse } from "@/components/games/derby/derby-horse";
import {
  DerbySideView,
  DerbyFrontChaseView,
  DerbyAerialView,
  DerbyFinishView,
  TRACK_LEN,
  type CameraAngle,
  type RacerProgress,
} from "@/components/games/derby/derby-track-views";

function getToken() { return typeof localStorage !== "undefined" ? localStorage.getItem("dgc_token") : null; }

const RACERS = [
  { id: 1, name: "Blaze",   body: "#8B3A2A", coat: "#C44B33", mane: "#3D1810", silk: "#FF6B6B", num: "1" },
  { id: 2, name: "Thunder", body: "#7A4A12", coat: "#C47A1A", mane: "#3D2508", silk: "#FFD166", num: "2" },
  { id: 3, name: "Shadow",  body: "#2D1F4E", coat: "#4A3570", mane: "#120A24", silk: "#B794F6", num: "3" },
  { id: 4, name: "Storm",   body: "#1A4A52", coat: "#2A7A8A", mane: "#0A2830", silk: "#67E8F9", num: "4" },
  { id: 5, name: "Bolt",    body: "#1A4A28", coat: "#2A7A42", mane: "#0A2818", silk: "#6EE7A0", num: "5" },
  { id: 6, name: "Phantom", body: "#4A1A38", coat: "#7A2A5A", mane: "#280A1E", silk: "#F9A8D4", num: "6" },
];

const CAMERAS: { id: CameraAngle; label: string }[] = [
  { id: "side", label: "Side" },
  { id: "front", label: "Chase" },
  { id: "aerial", label: "Aerial" },
  { id: "finish", label: "Finish" },
];

type RaceResult = {
  betId: number; won: boolean; winnerRacerId: number; finishOrder: number[];
  playerPlace: number; multiplier: number; payout: number; profit: number;
  newBalance: number; serverSeedHash: string; serverSeed: string; clientSeed: string; nonce: number;
};

export default function RacePage() {
  const { user, isAuthenticated } = useAuth();
  const { open } = useAuthModal();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedRacer, setSelectedRacer] = useState<number | null>(1);
  const [betAmount, setBetAmount] = useState("1");
  const [racing, setRacing] = useState(false);
  const [result, setResult] = useState<RaceResult | null>(null);
  const [progress, setProgress] = useState<RacerProgress[]>(RACERS.map(r => ({ racerId: r.id, progress: 0, done: false })));
  const [camera, setCamera] = useState<CameraAngle>("side");
  const [cameraX, setCameraX] = useState(0);
  const animRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const resultRef = useRef<RaceResult | null>(null);
  const gallopStarted = useRef(false);

  const resetRace = useCallback(() => {
    setResult(null);
    resultRef.current = null;
    setProgress(RACERS.map(r => ({ racerId: r.id, progress: 0, done: false })));
    setCameraX(0);
    setCamera("side");
    gallopStarted.current = false;
    stopHorseGallopLoop();
  }, []);

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
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ betAmount: amt, racerId: selectedRacer }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Race failed"); }
      res = await r.json();
      resultRef.current = res;
    } catch (e: unknown) {
      setRacing(false);
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
      return;
    }

    const finishRank: Record<number, number> = {};
    res.finishOrder.forEach((id, i) => { finishRank[id] = i; });

    startRef.current = performance.now();
    playRaceStartBugle();

    const GATE_MS = 400;

    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      if (elapsed > GATE_MS && !gallopStarted.current) {
        gallopStarted.current = true;
        startHorseGallopLoop();
      }

      const raceElapsed = Math.max(0, elapsed - GATE_MS);
      const next = RACERS.map(r => {
        const rank = finishRank[r.id];
        const finishMs = 3600 + rank * 500 + (r.id % 4) * 90;
        const t = raceElapsed <= 0 ? 0 : Math.min(1, raceElapsed / finishMs);
        const eased = 1 - Math.pow(1 - t, 2.8);
        return { racerId: r.id, progress: eased * TRACK_LEN, done: t >= 1 };
      });
      setProgress(next);

      const leader = next.reduce((a, b) => a.progress > b.progress ? a : b);
      setCameraX(Math.min(leader.progress * 0.5, TRACK_LEN * 0.5));

      if (next.every(p => p.done)) {
        stopHorseGallopLoop();
        playRaceFinishCheer();
        setResult(resultRef.current);
        setRacing(false);
        setCamera("finish");
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        return;
      }
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
  }

  useEffect(() => () => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    stopHorseGallopLoop();
  }, []);

  const viewProps = {
    racers: RACERS,
    progress,
    racing,
    selectedRacer,
  };

  function renderCamera() {
    if (camera === "aerial") return <DerbyAerialView {...viewProps} />;
    if (camera === "front") return <DerbyFrontChaseView {...viewProps} />;
    if (camera === "finish") {
      return <DerbyFinishView racers={RACERS} progress={progress} winnerId={result?.winnerRacerId} />;
    }
    return (
      <DerbySideView
        {...viewProps}
        cameraX={cameraX}
        winnerId={result?.winnerRacerId}
        showResult={!!result}
      />
    );
  }

  const controlsPanel = (
    <Card className="bg-card border-border p-4 md:p-5 space-y-4">
      <div>
        <div className="text-xs uppercase tracking-widest font-bold text-muted-foreground mb-2">Pick Your Horse</div>
        <div className="grid grid-cols-2 gap-2">
          {RACERS.map(r => (
            <button key={r.id} type="button" disabled={racing} onClick={() => setSelectedRacer(r.id)}
              className={`flex items-center gap-1.5 p-2 rounded-lg border transition-all font-bold text-xs ${selectedRacer === r.id ? "border-2" : "border-border/50 hover:border-border bg-secondary/30"} disabled:opacity-50`}
              style={selectedRacer === r.id ? { borderColor: r.silk, backgroundColor: `${r.silk}18` } : undefined}>
              <DerbyHorse r={r} gallop={false} scale={0.55} />
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
      <Button className="w-full font-display font-black uppercase tracking-widest text-base h-12 shadow-lg" disabled={racing} onClick={runRace}>
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
  );

  return (
    <div className="space-y-4 max-w-7xl mx-auto px-2 md:px-4 pb-4">
      <div className="flex items-center gap-3">
        <Link href="/games">
          <button type="button" className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors text-sm font-medium">
            <ChevronLeft className="w-4 h-4" /> Games
          </button>
        </Link>
        <h1 className="font-display font-black text-2xl md:text-3xl uppercase tracking-widest">🏇 DGC Derby</h1>
      </div>

      {/* Mobile: controls always on top so START RACE is never buried */}
      <div className="lg:hidden">{controlsPanel}</div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <div className="hidden lg:block">{controlsPanel}</div>

        <div className="lg:col-span-2 space-y-3">
          <Card className="bg-card border-border p-0 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 bg-secondary/30">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <Video className="w-3.5 h-3.5" /> Camera
              </div>
              <div className="flex gap-1 flex-wrap justify-end">
                {CAMERAS.map(c => (
                  <button key={c.id} type="button"
                    onClick={() => setCamera(c.id)}
                    disabled={c.id === "finish" && !result && !racing}
                    className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all ${camera === c.id ? "bg-primary text-primary-foreground shadow-md" : "bg-secondary/60 text-muted-foreground hover:text-foreground"} disabled:opacity-40`}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative h-72 sm:h-96 md:h-[26rem] lg:h-[28rem] derby-track-scene">
              {!racing && !result && camera !== "side" && camera !== "aerial" ? (
                <DerbySideView {...viewProps} cameraX={0} winnerId={undefined} showResult={false} />
              ) : (
                renderCamera()
              )}
            </div>
            {racing && (
              <div className="px-3 py-2 border-t border-border/30 bg-primary/5 flex items-center justify-center gap-2">
                <span className="live-dot w-2 h-2 rounded-full bg-green-400" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-green-400">Live Race</span>
              </div>
            )}
          </Card>

          {result && (
            <Card className={`border-2 p-4 ${result.won ? "border-green-500/60 bg-green-500/5" : "border-destructive/40 bg-destructive/5"}`}>
              <div className="flex items-center justify-between mb-3 gap-2">
                <h3 className="font-display font-black uppercase tracking-widest text-base md:text-lg flex items-center gap-2">
                  {result.won ? <><Trophy className="w-5 h-5 text-yellow-400" /> Winner!</> : `Finished #${result.playerPlace}`}
                </h3>
                <Button variant="outline" size="sm" onClick={resetRace} disabled={racing}>Race Again</Button>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-secondary/50 rounded-lg p-2">
                  <div className={`font-mono font-black text-base ${result.profit >= 0 ? "text-green-400" : "text-destructive"}`}>{result.profit >= 0 ? "+" : ""}{formatCurrency(result.profit)}</div>
                  <div className="text-[10px] text-muted-foreground uppercase">Profit</div>
                </div>
                <div className="bg-secondary/50 rounded-lg p-2">
                  <div className="font-mono font-black text-base text-primary">{result.multiplier.toFixed(2)}×</div>
                  <div className="text-[10px] text-muted-foreground uppercase">Multiplier</div>
                </div>
                <div className="bg-secondary/50 rounded-lg p-2">
                  <div className="font-mono font-black text-base">{formatCurrency(result.newBalance)}</div>
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
