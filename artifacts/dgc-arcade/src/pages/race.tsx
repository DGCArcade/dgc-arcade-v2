import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useAuthModal } from "@/hooks/use-auth-modal";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import { ChevronLeft, Trophy, Zap, Video } from "lucide-react";
import { ProvablyFairPanel } from "@/components/games/provably-fair-panel";
import { startHorseGallopLoop, stopHorseGallopLoop, playRaceStartBugle, playRaceFinishCheer, playGateOpenClang, startCrowdAmbience, stopCrowdAmbience } from "@/lib/horse-gallop-sound";
import { DerbyHorsePicker } from "@/components/games/derby/derby-horse-picker";
import {
  DerbySideView,
  DerbyFrontChaseView,
  DerbyAerialView,
  DerbyFinishView,
  TRACK_LEN,
  type CameraAngle,
  type RacerProgress,
} from "@/components/games/derby/derby-track-views";
import {
  getAutoCamera,
  getLeaderProgress,
  getRacePhase,
  type RacePhase,
} from "@/components/games/derby/derby-broadcast";
import {
  computeRaceProgress,
  buildPhotoFinishProgress,
  FINISH_HOLD_MS,
  RACE_GATE_MS,
} from "@/components/games/derby/derby-race-animation";

function getToken() { return typeof localStorage !== "undefined" ? localStorage.getItem("dgc_token") : null; }

const RACERS = [
  { id: 1, name: "Blaze",   body: "#8B3A2A", coat: "#C44B33", mane: "#3D1810", silk: "#FF6B6B", num: "1" },
  { id: 2, name: "Thunder", body: "#7A4A12", coat: "#C47A1A", mane: "#3D2508", silk: "#FFD166", num: "2" },
  { id: 3, name: "Shadow",  body: "#2D1F4E", coat: "#4A3570", mane: "#120A24", silk: "#B794F6", num: "3" },
  { id: 4, name: "Storm",   body: "#1A4A52", coat: "#2A7A8A", mane: "#0A2830", silk: "#67E8F9", num: "4" },
  { id: 5, name: "Bolt",    body: "#1A4A28", coat: "#2A7A42", mane: "#0A2818", silk: "#6EE7A0", num: "5" },
  { id: 6, name: "Phantom", body: "#4A1A38", coat: "#7A2A5A", mane: "#280A1E", silk: "#F9A8D4", num: "6" },
];

const CAMERAS: { id: CameraAngle; label: string; mobileLabel?: string }[] = [
  { id: "side", label: "Side", mobileLabel: "Track" },
  { id: "front", label: "Chase", mobileLabel: "Lanes" },
  { id: "aerial", label: "Aerial", mobileLabel: "Aerial" },
  { id: "finish", label: "Finish", mobileLabel: "Finish" },
];

const MOBILE_CAMERAS: CameraAngle[] = ["front", "side", "finish"];

type RaceResult = {
  betId: number; won: boolean; winnerRacerId: number; finishOrder: number[];
  playerPlace: number; multiplier: number; payout: number; profit: number;
  newBalance: number; serverSeedHash: string; serverSeed: string; clientSeed: string; nonce: number;
};

export default function RacePage() {
  const isMobile = useIsMobile();
  const { user, isAuthenticated } = useAuth();
  const { open } = useAuthModal();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedRacer, setSelectedRacer] = useState<number | null>(1);
  const [betAmount, setBetAmount] = useState("1");
  const [racing, setRacing] = useState(false);
  const [result, setResult] = useState<RaceResult | null>(null);
  const [progress, setProgress] = useState<RacerProgress[]>(RACERS.map(r => ({ racerId: r.id, progress: 0, done: false })));
  const [camera, setCamera] = useState<CameraAngle>(() => (typeof window !== "undefined" && window.innerWidth < 768 ? "front" : "side"));
  const [cameraX, setCameraX] = useState(0);
  const [racePhase, setRacePhase] = useState<RacePhase>("gate");
  const [camFade, setCamFade] = useState(0);
  const [finishOrder, setFinishOrder] = useState<number[] | null>(null);
  const [showFinishReveal, setShowFinishReveal] = useState(false);
  const animRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const resultRef = useRef<RaceResult | null>(null);
  const finishOrderRef = useRef<number[]>([]);
  const finishHoldRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishTriggeredRef = useRef(false);
  const gallopStarted = useRef(false);
  const cameraRef = useRef(0);
  const manualCameraRef = useRef(false);
  const lastAutoCamRef = useRef<CameraAngle | null>(null);
  const [liveFair, setLiveFair] = useState<{
    betId: number;
    serverSeedHash: string;
    clientSeed: string;
    nonce: number;
    serverSeed?: string;
  } | null>(null);

  const resetRace = useCallback(() => {
    setResult(null);
    resultRef.current = null;
    setProgress(RACERS.map(r => ({ racerId: r.id, progress: 0, done: false })));
    setCameraX(0);
    cameraRef.current = 0;
    setCamera(isMobile ? "front" : "side");
    setRacePhase("gate");
    manualCameraRef.current = false;
    lastAutoCamRef.current = null;
    setLiveFair(null);
    setFinishOrder(null);
    setShowFinishReveal(false);
    finishOrderRef.current = [];
    finishTriggeredRef.current = false;
    if (finishHoldRef.current) {
      clearTimeout(finishHoldRef.current);
      finishHoldRef.current = null;
    }
    gallopStarted.current = false;
    stopHorseGallopLoop();
    stopCrowdAmbience();
  }, [isMobile]);

  useEffect(() => {
    if (isMobile && camera === "aerial") setCamera("front");
  }, [isMobile, camera]);

  const visibleCameras = isMobile ? CAMERAS.filter(c => MOBILE_CAMERAS.includes(c.id)) : CAMERAS;

  async function runRace() {
    if (!isAuthenticated) { open("login"); return; }
    if (!selectedRacer) { toast({ title: "Pick a horse!", variant: "destructive" }); return; }
    const amt = parseFloat(betAmount);
    if (isNaN(amt) || amt <= 0) { toast({ title: "Invalid bet", variant: "destructive" }); return; }
    resetRace();
    setRacing(true);
    manualCameraRef.current = false;
    lastAutoCamRef.current = null;
    if (isMobile) setCamera("front");

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
      setLiveFair({
        betId: res.betId,
        serverSeedHash: res.serverSeedHash,
        clientSeed: res.clientSeed,
        nonce: res.nonce,
      });
    } catch (e: unknown) {
      setRacing(false);
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
      return;
    }

    finishOrderRef.current = res.finishOrder;
    setFinishOrder(res.finishOrder);
    finishTriggeredRef.current = false;

    startRef.current = performance.now();
    playRaceStartBugle();
    startCrowdAmbience();

    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      if (elapsed > RACE_GATE_MS && !gallopStarted.current) {
        gallopStarted.current = true;
        playGateOpenClang();
        startHorseGallopLoop();
      }

      const { progress: next, winnerDone } = computeRaceProgress(
        elapsed,
        finishOrderRef.current,
        TRACK_LEN,
      );
      setProgress(next);

      const leaderProg = getLeaderProgress(next);
      const phase = getRacePhase(leaderProg, true, winnerDone);
      setRacePhase(phase);

      if (!manualCameraRef.current) {
        const autoCam = getAutoCamera(phase, isMobile);
        if (autoCam !== lastAutoCamRef.current) {
          lastAutoCamRef.current = autoCam;
          setCamFade(f => f + 1);
          setCamera(autoCam);
        }
      }

      const targetCam = Math.min(leaderProg * 0.48, TRACK_LEN * 0.48);
      cameraRef.current += (targetCam - cameraRef.current) * 0.09;
      setCameraX(cameraRef.current);

      if (winnerDone && !finishTriggeredRef.current) {
        finishTriggeredRef.current = true;
        stopHorseGallopLoop();
        stopCrowdAmbience();
        playRaceFinishCheer();
        setProgress(buildPhotoFinishProgress(finishOrderRef.current, TRACK_LEN));
        setShowFinishReveal(true);
        setRacePhase("finish");
        setCamFade(f => f + 1);
        setCamera("finish");
        manualCameraRef.current = true;
        setLiveFair(prev =>
          prev ? { ...prev, serverSeed: resultRef.current?.serverSeed } : null,
        );

        finishHoldRef.current = setTimeout(() => {
          setResult(resultRef.current);
          setRacing(false);
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          finishHoldRef.current = null;
        }, FINISH_HOLD_MS);
        return;
      }
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
  }

  useEffect(() => () => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    if (finishHoldRef.current) clearTimeout(finishHoldRef.current);
    stopHorseGallopLoop();
    stopCrowdAmbience();
  }, []);

  const viewProps = {
    racers: RACERS,
    progress,
    racing,
    selectedRacer,
    compact: isMobile,
    phase: racePhase,
    camera,
  };

  function renderCameraView(angle: CameraAngle) {
    if (angle === "aerial") return <DerbyAerialView {...viewProps} camera={angle} />;
    if (angle === "front") return <DerbyFrontChaseView {...viewProps} camera={angle} />;
    if (angle === "finish") {
      return (
        <DerbyFinishView
          racers={RACERS}
          progress={progress}
          finishOrder={finishOrder ?? result?.finishOrder}
          winnerId={result?.winnerRacerId ?? finishOrder?.[0]}
          compact={isMobile}
        />
      );
    }
    return (
      <DerbySideView
        {...viewProps}
        camera={angle}
        cameraX={cameraX}
        winnerId={result?.winnerRacerId}
        showResult={!!result}
      />
    );
  }

  function renderCamera() {
    return (
      <div key={camFade} className="absolute inset-0 derby-cam-cut">
        {renderCameraView(camera)}
      </div>
    );
  }

  const previewCamera: CameraAngle =
    !racing && !result && camera === "finish" ? "side" : camera;

  const trackCard = (
    <Card className="race-track-card bg-card border-border p-0 overflow-hidden flex flex-col min-h-0 h-full">
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-border/40 bg-secondary/30 shrink-0">
        <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          <Video className="w-3 h-3" /> Camera
        </div>
        <div className="flex gap-1 flex-wrap justify-end">
          {visibleCameras.map(c => (
            <button key={c.id} type="button"
              onClick={() => {
                manualCameraRef.current = true;
                setCamFade(f => f + 1);
                setCamera(c.id);
              }}
              disabled={c.id === "finish" && !result && !racing && !showFinishReveal}
              className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider transition-all ${camera === c.id ? "bg-primary text-primary-foreground shadow-md" : "bg-secondary/60 text-muted-foreground hover:text-foreground"} disabled:opacity-40`}>
              {isMobile ? (c.mobileLabel ?? c.label) : c.label}
            </button>
          ))}
        </div>
      </div>
      <div className="relative flex-1 min-h-[200px] derby-track-scene">
        <div className="absolute inset-0 overflow-hidden">
          {!racing && !result && !showFinishReveal ? (
            <div className="absolute inset-0 derby-cam-cut">
              {renderCameraView(previewCamera)}
            </div>
          ) : (
            renderCamera()
          )}
        </div>
      </div>
      {(racing || showFinishReveal || (result && !isMobile)) && liveFair && (
        <div className="px-2 py-1 border-t border-border/30 bg-secondary/15 shrink-0">
          <ProvablyFairPanel
            betId={liveFair.betId}
            serverSeedHash={liveFair.serverSeedHash}
            serverSeed={liveFair.serverSeed ?? result?.serverSeed}
            clientSeed={liveFair.clientSeed}
            nonce={liveFair.nonce}
            verifyPath={`/api/race/verify/${liveFair.betId}`}
            variant={isMobile ? (racing || showFinishReveal ? "inline" : "compact") : racing || showFinishReveal ? "inline" : "full"}
          />
        </div>
      )}
      {racing && (
        <div className="px-2 py-1 border-t border-border/30 bg-black/40 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <span className="live-dot w-2 h-2 rounded-full bg-green-400" />
            <span className="text-[9px] font-bold uppercase tracking-widest text-green-400">Live</span>
          </div>
          <span className="text-[8px] font-mono text-white/50 truncate">
            {Math.round(getLeaderProgress(progress))}m · Auto cam
          </span>
        </div>
      )}
    </Card>
  );

  const resultCard = result ? (
    <Card className={`race-result-card border p-2 sm:p-3 shrink-0 ${result.won ? "border-green-500/60 bg-green-500/5" : "border-destructive/40 bg-destructive/5"}`}>
      <div className="flex items-center justify-between mb-1.5 sm:mb-2 gap-2">
        <h3 className="font-display font-black uppercase tracking-widest text-xs sm:text-sm flex items-center gap-1.5">
          {result.won ? <><Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-yellow-400" /> Winner!</> : `Finished #${result.playerPlace}`}
        </h3>
        <Button variant="outline" size="sm" className="h-6 sm:h-7 text-[9px] sm:text-[10px] px-2" onClick={resetRace} disabled={racing}>Again</Button>
      </div>
      <div className="grid grid-cols-3 gap-1 text-center">
        <div className="bg-secondary/50 rounded-lg p-1 sm:p-1.5">
          <div className={`font-mono font-black text-xs sm:text-sm ${result.profit >= 0 ? "text-green-400" : "text-destructive"}`}>{result.profit >= 0 ? "+" : ""}{formatCurrency(result.profit)}</div>
          <div className="text-[8px] sm:text-[9px] text-muted-foreground uppercase">Profit</div>
        </div>
        <div className="bg-secondary/50 rounded-lg p-1 sm:p-1.5">
          <div className="font-mono font-black text-xs sm:text-sm text-primary">{result.multiplier.toFixed(2)}×</div>
          <div className="text-[8px] sm:text-[9px] text-muted-foreground uppercase">Mult</div>
        </div>
        <div className="bg-secondary/50 rounded-lg p-1 sm:p-1.5">
          <div className="font-mono font-black text-xs sm:text-sm">{formatCurrency(result.newBalance)}</div>
          <div className="text-[8px] sm:text-[9px] text-muted-foreground uppercase">Balance</div>
        </div>
      </div>
      {isMobile && (
        <div className="mt-2 pt-2 border-t border-border/30">
          <ProvablyFairPanel
            betId={result.betId}
            serverSeedHash={result.serverSeedHash}
            serverSeed={result.serverSeed}
            clientSeed={result.clientSeed}
            nonce={result.nonce}
            verifyPath={`/api/race/verify/${result.betId}`}
            variant="compact"
          />
        </div>
      )}
      {result && !isMobile && (
        <div className="mt-3 pt-3 border-t border-border/40">
          <ProvablyFairPanel
            betId={result.betId}
            serverSeedHash={result.serverSeedHash}
            serverSeed={result.serverSeed}
            clientSeed={result.clientSeed}
            nonce={result.nonce}
            verifyPath={`/api/race/verify/${result.betId}`}
            variant="full"
          />
        </div>
      )}
    </Card>
  ) : null;

  const horsePicker = (compact: boolean) => (
    <DerbyHorsePicker
      racers={RACERS}
      selectedId={selectedRacer}
      onSelect={setSelectedRacer}
      disabled={racing}
      compact={compact}
    />
  );

  const betControls = (compact: boolean) => (
    <div className={compact ? "space-y-2" : "space-y-4"}>
      {horsePicker(compact)}
      <div className={compact ? "flex gap-2 items-end" : ""}>
        <div className={compact ? "flex-1 min-w-0" : ""}>
          <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground block mb-1">Bet (USD)</label>
          <Input type="number" min="0.01" step="0.01" value={betAmount} onChange={e => setBetAmount(e.target.value)} disabled={racing} className="font-mono bg-secondary border-border h-9 text-sm" />
          {user && !compact && (
            <p className="text-xs text-muted-foreground font-mono mt-1.5">
              Balance: <span className="text-primary font-bold">{formatCurrency(user.balance)}</span>
            </p>
          )}
        </div>
        <Button
          className={`font-display font-black uppercase tracking-widest shadow-lg shrink-0 ${compact ? "h-9 px-4 text-xs" : "w-full text-base h-12"}`}
          disabled={racing}
          onClick={runRace}
        >
          <Zap className="w-4 h-4" /> {racing ? "Racing…" : compact ? "Race" : "START RACE"}
        </Button>
      </div>
      {user && compact && (
        <p className="text-[10px] text-muted-foreground font-mono text-center">
          Balance: <span className="text-primary font-bold">{formatCurrency(user.balance)}</span>
        </p>
      )}
    </div>
  );

  const desktopControlsPanel = (
    <Card className="bg-card border-border p-4 md:p-5 space-y-4">
      {betControls(false)}
    </Card>
  );

  if (isMobile) {
    return (
      <div className="race-mobile-shell">
        <div className="game-mobile-header">
          <Link href="/games" className="inline-flex items-center text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors shrink-0">
            <ChevronLeft className="w-4 h-4" /> Back
          </Link>
          <div className="min-w-0 flex-1 text-center px-2">
            <h1 className="font-display font-black text-sm uppercase tracking-widest truncate">🏇 DGC Derby</h1>
            <p className="text-[10px] text-muted-foreground font-mono">First place pays 5.5×</p>
          </div>
          <div className="w-12 shrink-0" />
        </div>

        <div className="race-mobile-track-wrap">
          {trackCard}
        </div>

        {resultCard}

        <div className="race-mobile-controls">
          <Card className="bg-card border-border p-2.5 space-y-2">
            {betControls(true)}
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="race-desktop-page space-y-3 max-w-7xl mx-auto px-2 md:px-4 pb-4 min-h-0">
      <div className="flex flex-wrap items-center gap-3 shrink-0">
        <Link href="/games">
          <button type="button" className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors text-sm font-medium">
            <ChevronLeft className="w-4 h-4" /> Games
          </button>
        </Link>
        <div>
          <h1 className="font-display font-black text-2xl md:text-3xl uppercase tracking-widest">🏇 DGC Derby</h1>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">Pick 1 of 6 horses · 1st place pays 5.5×</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 md:gap-6 min-h-0">
        <div className="lg:col-span-2">{desktopControlsPanel}</div>

        <div className="lg:col-span-3 space-y-2 min-h-0">
          <div className="min-h-[280px] h-[32rem] lg:h-[36rem]">{trackCard}</div>
          {resultCard}
        </div>
      </div>
    </div>
  );
}
