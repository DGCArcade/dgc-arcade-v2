import { useState, useCallback, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getListBetsQueryKey, getGetMeQueryKey } from "@workspace/api-client-react";
import type { Game } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorBoundary } from "@/components/error-boundary";
import { ChickenRoadBoard, type CrossAnim, type HazardType } from "./chicken-road/chicken-road-board-view";
import { ProvablyFairPanel } from "./provably-fair-panel";
import {
  STAKE_TIERS,
  getStakeMultiplierTable,
  normalizeStakeTier,
  type StakeTier,
} from "@/lib/chicken-road-stake-math";
import {
  playChickenCluck,
  playCrossSuccess,
  playChickenBust,
  playCarPass,
  playBarrierClang,
  playManholeIgnite,
  playChickenSpawn,
  startChickenRoadAmbience,
  stopChickenRoadAmbience,
  playCarCrash,
} from "@/lib/chicken-road-sounds";

const CAR_ANIM_MS = 850;
const BARRIER_MS = 500;
const CAR_IMPACT_MS = 800;
const MANHOLE_BUST_MS = 700;
const CHICKEN_GLIDE_MS = 580;

function getToken() { return localStorage.getItem("dgc_token"); }
function authHeaders() { return { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` }; }

function shouldShowNearMiss(sessionId: number, lane: number): boolean {
  return ((sessionId * 17 + lane * 31) % 5) === 0;
}

function delay(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}

interface ChickenRoadProps { game: Game }

export function ChickenRoad(props: ChickenRoadProps) {
  return (
    <ErrorBoundary>
      <ChickenRoadGame {...props} />
    </ErrorBoundary>
  );
}

function ChickenRoadGame({ game }: ChickenRoadProps) {
  const { requireAuth } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const minBet = parseFloat(String(game.minBet ?? 0.01));
  const maxBet = parseFloat(String(game.maxBet ?? 1_000_000));
  const animLock = useRef(false);

  const [amount, setAmount] = useState(minBet);
  const [tier, setTier] = useState<StakeTier>("medium");
  const [maxLanes, setMaxLanes] = useState<number>(STAKE_TIERS.medium.maxSteps);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [serverSeedHash, setServerSeedHash] = useState("");
  const [serverSeed, setServerSeed] = useState("");
  const [clientSeed, setClientSeed] = useState("chicken-road");
  const [nonce, setNonce] = useState(1);
  const [currentLane, setCurrentLane] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [payout, setPayout] = useState(0);
  const [status, setStatus] = useState<"idle" | "active" | "won" | "lost">("idle");
  const [loading, setLoading] = useState(false);
  const [hopping, setHopping] = useState(false);
  const [chickenVisible, setChickenVisible] = useState(false);
  const [bustLane, setBustLane] = useState<number | undefined>();
  const [bustHazard, setBustHazard] = useState<HazardType | undefined>();
  const [crossAnim, setCrossAnim] = useState<CrossAnim>(null);
  const [hopStripIndex, setHopStripIndex] = useState<number | undefined>();
  const [laneMultipliers, setLaneMultipliers] = useState(() => getStakeMultiplierTable("medium"));

  useEffect(() => {
    fetch("/api/chicken-road/config")
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!data?.tiers) return;
        const tierData = data.tiers.find((t: { tier: string }) => t.tier === tier);
        if (tierData) {
          setMaxLanes(tierData.maxSteps);
          setLaneMultipliers(tierData.multipliers);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setMaxLanes(STAKE_TIERS[tier].maxSteps);
    setLaneMultipliers(getStakeMultiplierTable(tier));
    fetch("/api/chicken-road/config")
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        const tierData = data?.tiers?.find((t: { tier: string }) => t.tier === tier);
        if (tierData?.multipliers) setLaneMultipliers(tierData.multipliers);
        if (tierData?.maxSteps) setMaxLanes(tierData.maxSteps);
      })
      .catch(() => {});
  }, [tier]);

  useEffect(() => {
    if (status === "idle" || status === "active") {
      startChickenRoadAmbience();
    } else {
      stopChickenRoadAmbience();
    }
    return () => stopChickenRoadAmbience();
  }, [status]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch("/api/chicken-road/session", { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!data?.session) return;
        const s = data.session;
        setSessionId(s.sessionId);
        setServerSeedHash(s.serverSeedHash ?? "");
        setServerSeed("");
        setClientSeed(s.clientSeed ?? "chicken-road");
        setNonce(s.nonce ?? 1);
        setCurrentLane(s.currentLane ?? 0);
        setMultiplier(s.currentMultiplier ?? 1);
        const resumedTier = normalizeStakeTier(s.tier ?? "medium");
        setTier(resumedTier);
        setMaxLanes(s.maxSteps ?? STAKE_TIERS[resumedTier].maxSteps);
        setLaneMultipliers(s.multipliers ?? getStakeMultiplierTable(resumedTier));
        setStatus("active");
        setChickenVisible(true);
      })
      .catch(() => {});
  }, []);

  const startGame = () => {
    requireAuth(async () => {
      if (amount < minBet || amount > maxBet) {
        toast({ title: "Invalid bet", variant: "destructive" });
        return;
      }
      setLoading(true);
      try {
        const res = await fetch("/api/chicken-road/initialize", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ gameId: game.id, amount, tier, clientSeed }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to start");

        setSessionId(data.sessionId);
        setServerSeedHash(data.serverSeedHash);
        setServerSeed("");
        setNonce(data.nonce ?? 1);
        setCurrentLane(0);
        setMultiplier(1);
        setPayout(0);
        setBustLane(undefined);
        setBustHazard(undefined);
        setCrossAnim(null);
        setStatus("active");
        setMaxLanes(data.maxSteps ?? STAKE_TIERS[tier].maxSteps);
        setLaneMultipliers(data.multipliers ?? getStakeMultiplierTable(tier));

        setChickenVisible(true);
        playChickenSpawn();
        playChickenCluck();
        qc.invalidateQueries({ queryKey: getListBetsQueryKey({ limit: 10 }) });
        qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
      } catch (err: unknown) {
        toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    });
  };

  const crossLane = useCallback(async () => {
    if (status !== "active" || loading || !sessionId || animLock.current) return;
    animLock.current = true;
    setLoading(true);

    const lane = currentLane;
    const carDir: "down" | "up" = lane % 2 === 0 ? "down" : "up";

    setCrossAnim({ lane, phase: carDir === "down" ? "car-down" : "car-up", carDirection: carDir });
    playCarPass();

    try {
      const [data] = await Promise.all([
        fetch("/api/chicken-road/progress", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ sessionId, laneIndex: lane }),
        }).then(async r => {
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || "Failed to cross");
          return d;
        }),
        delay(CAR_ANIM_MS),
      ]);

      if (data.isDeath) {
        const hazard: HazardType = data.hazardType === "manhole" ? "manhole" : "car";
        if (hazard === "car") {
          setCrossAnim({ lane, phase: "car-impact", carDirection: carDir });
          playCarCrash();
          await delay(CAR_IMPACT_MS);
        } else {
          setCrossAnim({ lane, phase: "manhole-fire", carDirection: carDir });
          playManholeIgnite();
          await delay(MANHOLE_BUST_MS);
        }
        setBustLane(lane);
        setBustHazard(hazard);
        setStatus("lost");
        setCrossAnim(null);
        setServerSeed(data.serverSeed || "");
        playChickenBust();
        toast({
          title: hazard === "car" ? "Hit by a car!" : "Manhole collapsed!",
          variant: "destructive",
        });
      } else {
        const nearMiss = shouldShowNearMiss(sessionId, lane);
        if (nearMiss) {
          setCrossAnim({ lane, phase: "barrier", carDirection: carDir });
          playBarrierClang();
          await delay(BARRIER_MS);
        }

        setHopping(true);
        setHopStripIndex(lane);
        playCrossSuccess();
        playChickenCluck();

        const newMult = data.multiplier ?? 1;
        setMultiplier(newMult);
        setCrossAnim(null);

        if (data.status === "won") {
          setCurrentLane(maxLanes);
          setHopStripIndex(maxLanes - 1);
          await delay(CHICKEN_GLIDE_MS);
          setStatus("won");
          setPayout(data.payout);
          setServerSeed(data.serverSeed || "");
          toast({
            title: `Cleared all ${maxLanes} lanes!`,
            description: `Payout: $${Number(data.payout).toFixed(2)}`,
          });
        } else {
          setCurrentLane(lane + 1);
          await delay(CHICKEN_GLIDE_MS);
        }
      }
      qc.invalidateQueries({ queryKey: getListBetsQueryKey({ limit: 10 }) });
    } catch (err: unknown) {
      setCrossAnim(null);
      setHopStripIndex(undefined);
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
      setTimeout(() => {
        setHopping(false);
        setHopStripIndex(undefined);
      }, CHICKEN_GLIDE_MS + 80);
      animLock.current = false;
    }
  }, [status, loading, sessionId, currentLane, maxLanes, toast, qc]);

  const cashout = async () => {
    if (status !== "active" || currentLane === 0 || loading || !sessionId || animLock.current) return;
    setLoading(true);
    try {
      const res = await fetch("/api/chicken-road/settle", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to cashout");
      setStatus("won");
      setPayout(data.payout);
      setServerSeed(data.serverSeed || "");
      playCrossSuccess();
      toast({ title: `Cashed out ${data.multiplier?.toFixed(2)}×`, description: `$${Number(data.payout).toFixed(2)}` });
      qc.invalidateQueries({ queryKey: getListBetsQueryKey({ limit: 10 }) });
      qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } catch (err: unknown) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const resetToIdle = () => {
    setStatus("idle");
    setChickenVisible(false);
    setCurrentLane(0);
    setMultiplier(1);
    setPayout(0);
    setSessionId(null);
    setServerSeed("");
    setServerSeedHash("");
    setBustLane(undefined);
    setBustHazard(undefined);
    setCrossAnim(null);
    setHopStripIndex(undefined);
  };

  const isIdle = status === "idle";
  const isEnded = status === "won" || status === "lost";
  const canConfigure = isIdle || isEnded;
  const netGain = status === "active" && currentLane > 0 ? amount * (multiplier - 1) : payout > 0 ? payout - amount : 0;

  return (
    <div className="chicken-road-game-root flex flex-col lg:flex-row gap-4 md:gap-6">
      <div className="chicken-road-bet-panel order-2 lg:order-none lg:w-72 shrink-0 space-y-4 bg-card border border-border rounded-xl p-4">
        <div className="flex gap-1 p-1 bg-secondary/50 rounded-lg">
          <button type="button" className="flex-1 text-xs font-bold uppercase py-1.5 rounded-md bg-primary text-primary-foreground">
            Manual
          </button>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Amount</label>
          <Input type="number" value={amount} min={minBet} max={maxBet} step={0.01} disabled={!canConfigure}
            onChange={e => setAmount(parseFloat(e.target.value) || minBet)} className="font-mono" />
          <div className="grid grid-cols-4 gap-1">
            {[0.5, 2, 5, 10].map(mult => (
              <button key={mult} type="button" disabled={!canConfigure}
                onClick={() => setAmount(prev => Math.min(maxBet, Math.max(minBet, parseFloat((prev * mult).toFixed(2)))))}
                className="text-xs font-bold bg-secondary border border-border rounded py-1 disabled:opacity-40">
                {mult === 0.5 ? "½" : `${mult}×`}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Difficulty</label>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(STAKE_TIERS) as StakeTier[]).map(t => (
              <button key={t} type="button" disabled={!canConfigure} onClick={() => setTier(t)}
                className={`text-xs font-bold border rounded px-2 py-2 disabled:opacity-40 text-left ${
                  tier === t ? "bg-primary text-primary-foreground border-primary" : "bg-secondary border-border"
                }`}>
                <span>{STAKE_TIERS[t].label}</span>
                <div className={`font-mono text-[9px] ${tier === t ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                  {STAKE_TIERS[t].desc}
                </div>
              </button>
            ))}
          </div>
        </div>

        {status === "active" && currentLane > 0 && (
          <div className="bg-secondary/50 rounded-lg p-3 border border-border">
            <div className="text-[10px] text-muted-foreground uppercase">Total Net Gain ({multiplier.toFixed(2)}×)</div>
            <div className="font-mono font-black text-xl text-green-400">${netGain.toFixed(2)}</div>
          </div>
        )}

        {isIdle ? (
          <Button className="w-full font-display font-black uppercase h-12 text-base bg-blue-600 hover:bg-blue-500" onClick={startGame} disabled={loading}>
            {loading ? "…" : "Play"}
          </Button>
        ) : status === "active" ? (
          <div className="space-y-2">
            <Button className="w-full font-display font-black uppercase h-11 bg-blue-600 hover:bg-blue-500 text-white"
              onClick={cashout} disabled={loading || currentLane === 0}>
              Cashout {multiplier.toFixed(2)}×
            </Button>
            <Button className="w-full font-display font-black uppercase h-12" onClick={crossLane} disabled={loading}>
              {loading ? "Crossing…" : "Go"}
            </Button>
          </div>
        ) : isEnded ? (
          <Button className="w-full font-display font-black uppercase h-12" onClick={resetToIdle}>
            Play Again
          </Button>
        ) : null}

        {status === "won" && payout > 0 && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-center">
            <div className="text-xs text-green-400 uppercase font-bold">Won</div>
            <div className="text-2xl font-black font-mono text-green-400">${payout.toFixed(2)}</div>
          </div>
        )}
        {status === "lost" && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-center">
            <div className="text-xs text-red-400 uppercase font-bold">Busted</div>
          </div>
        )}

        {serverSeed && sessionId && (
          <ProvablyFairPanel
            serverSeedHash={serverSeedHash}
            serverSeed={serverSeed}
            clientSeed={clientSeed}
            nonce={nonce}
            verifyPath={`/api/chicken-road/verify/${sessionId}`}
            gameName="Chicken Road"
          />
        )}

        <p className="text-[9px] text-muted-foreground leading-relaxed">
          98% RTP · Provably fair · Fisher-Yates death placement on 20 positions. Cash out anytime after your first safe cross.
        </p>
      </div>

      <div className="chicken-road-play-area order-1 lg:order-none flex-1 min-w-0 min-h-[360px] space-y-2">
        {serverSeedHash && !serverSeed && sessionId && (
          <ProvablyFairPanel
            variant="compact"
            serverSeedHash={serverSeedHash}
            clientSeed={clientSeed}
            nonce={nonce}
            verifyPath={`/api/chicken-road/verify/${sessionId}`}
            gameName="Chicken Road"
          />
        )}
        <ChickenRoadBoard
          lanes={maxLanes}
          currentLane={currentLane}
          status={status}
          multipliers={laneMultipliers}
          hopping={hopping}
          chickenVisible={chickenVisible}
          bustLane={bustLane}
          bustHazard={bustHazard}
          crossAnim={crossAnim}
          previewMode={status === "idle"}
          onCrossNext={crossLane}
          canCross={status === "active" && !loading}
          crossLoading={loading}
          betAmount={amount}
          tier={tier}
          chickenStripIndex={hopStripIndex}
        />
      </div>
    </div>
  );
}
