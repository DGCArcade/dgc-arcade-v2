import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getListBetsQueryKey } from "@workspace/api-client-react";
import type { Game } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorBoundary } from "@/components/error-boundary";

function getToken() { return localStorage.getItem("dgc_token"); }
function authHeaders() { return { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` }; }

const TIER_LABELS = {
  easy: { label: "Easy", cars: 1, safe: 4, color: "text-green-400" },
  medium: { label: "Medium", cars: 2, safe: 3, color: "text-yellow-400" },
  hard: { label: "Hard", cars: 3, safe: 2, color: "text-orange-400" },
  extreme: { label: "Extreme", cars: 4, safe: 1, color: "text-red-400" },
} as const;

type Tier = keyof typeof TIER_LABELS;

const LANES = 10;
const TILES = 5;

// Multiplier sequences per tier
function getMultiplier(tier: Tier, step: number): number {
  const safeTiles = TIER_LABELS[tier].safe;
  let m = 1.0;
  for (let i = 0; i <= step; i++) {
    m = (m * (TILES / safeTiles)) * 0.99;
  }
  return m;
}

// Sound engine
function playSound(type: "safe" | "bust" | "cashout" | "start") {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    switch (type) {
      case "safe":
        osc.type = "sine";
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(1400, now + 0.08);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now); osc.stop(now + 0.2);
        break;
      case "bust":
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.5);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.5);
        osc.start(now); osc.stop(now + 0.5);
        break;
      case "cashout":
        osc.type = "sine";
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.3);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.start(now); osc.stop(now + 0.4);
        break;
      case "start":
        osc.type = "square";
        osc.frequency.setValueAtTime(300, now);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now); osc.stop(now + 0.15);
        break;
    }
  } catch (_) {}
}

interface TileState {
  status: "hidden" | "safe" | "car" | "revealed-car";
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
  const { user, requireAuth } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const minBet = parseFloat(String(game.minBet ?? 0.01));
  const maxBet = parseFloat(String(game.maxBet ?? 1_000_000));

  const [amount, setAmount] = useState<number>(minBet);
  const [tier, setTier] = useState<Tier>("medium");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [serverSeedHash, setServerSeedHash] = useState<string>("");
  const [serverSeed, setServerSeed] = useState<string>(""); // revealed after game
  const [clientSeed, setClientSeed] = useState<string>("chicken-road");
  const [currentLane, setCurrentLane] = useState<number>(0); // next lane to play
  const [multiplier, setMultiplier] = useState<number>(1);
  const [payout, setPayout] = useState<number>(0);
  const [status, setStatus] = useState<"idle" | "active" | "won" | "lost">("idle");
  const [grid, setGrid] = useState<TileState[][]>(() =>
    Array.from({ length: LANES }, () => Array.from({ length: TILES }, () => ({ status: "hidden" as const })))
  );
  const [revealedMatrix, setRevealedMatrix] = useState<number[][] | null>(null);
  const [loading, setLoading] = useState(false);

  const resetGrid = useCallback(() => {
    setGrid(Array.from({ length: LANES }, () => Array.from({ length: TILES }, () => ({ status: "hidden" as const }))));
    setRevealedMatrix(null);
  }, []);

  const startGame = () => {
    requireAuth(async () => {
      if (amount < minBet || amount > maxBet) {
        toast({ title: "Invalid bet", description: `Bet must be between $${minBet} and $${maxBet}`, variant: "destructive" });
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
        if (!res.ok) throw new Error(data.error || "Failed to start game");

        setSessionId(data.sessionId);
        setServerSeedHash(data.serverSeedHash);
        setServerSeed("");
        setCurrentLane(0);
        setMultiplier(1);
        setPayout(0);
        setStatus("active");
        resetGrid();
        playSound("start");
        qc.invalidateQueries({ queryKey: getListBetsQueryKey({ limit: 10 }) });
      } catch (err: any) {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    });
  };

  const pickTile = async (laneIndex: number, tileIndex: number) => {
    if (status !== "active" || laneIndex !== currentLane || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/chicken-road/progress", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ sessionId, laneIndex, tileIndex }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to progress");

      const newGrid = grid.map(row => [...row]);

      if (data.isCar) {
        // Bust
        newGrid[laneIndex][tileIndex] = { status: "car" };
        // Reveal all cars from the matrix
        if (data.matrix) {
          setRevealedMatrix(data.matrix);
          data.matrix.forEach((laneCars: number[], li: number) => {
            if (li !== laneIndex) {
              laneCars.forEach((ti: number) => {
                newGrid[li][ti] = { status: "revealed-car" };
              });
            }
          });
        }
        setGrid(newGrid);
        setStatus("lost");
        setServerSeed(data.serverSeed || "");
        playSound("bust");
        toast({ title: "BUST! 🚗💥", description: "You got hit. Better luck next time.", variant: "destructive" });
        qc.invalidateQueries({ queryKey: getListBetsQueryKey({ limit: 10 }) });
      } else {
        // Safe
        newGrid[laneIndex][tileIndex] = { status: "safe" };
        setGrid(newGrid);
        const newMultiplier = getMultiplier(tier, laneIndex);
        setMultiplier(newMultiplier);

        if (data.status === "won") {
          // Completed all lanes
          setStatus("won");
          setPayout(data.payout);
          setServerSeed(data.serverSeed || "");
          playSound("cashout");
          toast({ title: `🏆 WINNER! ${newMultiplier.toFixed(3)}x`, description: `You crossed all 10 lanes! Payout: $${data.payout?.toFixed(2)}` });
          qc.invalidateQueries({ queryKey: getListBetsQueryKey({ limit: 10 }) });
        } else {
          setCurrentLane(laneIndex + 1);
          playSound("safe");
        }
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const cashout = async () => {
    if (status !== "active" || currentLane === 0 || loading) return;
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
      playSound("cashout");
      toast({ title: `💰 Cashed Out! ${data.multiplier?.toFixed(3)}x`, description: `Payout: $${data.payout?.toFixed(2)}` });
      qc.invalidateQueries({ queryKey: getListBetsQueryKey({ limit: 10 }) });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const isIdle = status === "idle" || status === "won" || status === "lost";

  return (
    <div className="chicken-road-game-root flex flex-col lg:flex-row gap-4 md:gap-6">
      {/* Controls Panel */}
      <div className="chicken-road-bet-panel lg:w-72 shrink-0 space-y-4 bg-card border border-border rounded-xl p-4">
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Bet Amount</label>
          <Input
            type="number"
            value={amount}
            min={minBet}
            max={maxBet}
            step={0.01}
            disabled={!isIdle}
            onChange={e => setAmount(parseFloat(e.target.value) || minBet)}
            className="font-mono"
          />
          <div className="grid grid-cols-4 gap-1">
            {[0.5, 2, 5, 10].map(mult => (
              <button
                key={mult}
                disabled={!isIdle}
                onClick={() => setAmount(prev => Math.min(maxBet, Math.max(minBet, parseFloat((prev * mult).toFixed(2)))))}
                className="text-xs font-bold bg-secondary hover:bg-secondary/80 border border-border rounded px-1 py-1 transition-colors disabled:opacity-40"
              >
                {mult === 0.5 ? "½" : `${mult}x`}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Difficulty</label>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(TIER_LABELS) as Tier[]).map(t => (
              <button
                key={t}
                disabled={!isIdle}
                onClick={() => setTier(t)}
                className={`text-xs font-bold border rounded px-2 py-2 transition-colors disabled:opacity-40 ${
                  tier === t
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary border-border hover:bg-secondary/80"
                }`}
              >
                <span className={TIER_LABELS[t].color}>{TIER_LABELS[t].label}</span>
                <div className="text-muted-foreground font-mono text-[10px]">{TIER_LABELS[t].cars} Car{TIER_LABELS[t].cars > 1 ? "s" : ""}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Client Seed</label>
          <Input
            value={clientSeed}
            disabled={!isIdle}
            onChange={e => setClientSeed(e.target.value || "chicken-road")}
            className="font-mono text-xs"
          />
        </div>

        {/* Multiplier Preview */}
        <div className="bg-secondary/50 rounded-lg p-3 border border-border space-y-1">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Next Lane Multiplier</div>
          <div className="font-mono font-black text-2xl text-primary">
            {status === "active" ? getMultiplier(tier, currentLane).toFixed(3) : getMultiplier(tier, 0).toFixed(3)}x
          </div>
          {status === "active" && currentLane > 0 && (
            <div className="text-xs text-muted-foreground">Current: <span className="text-foreground font-mono">{multiplier.toFixed(3)}x</span></div>
          )}
        </div>

        {isIdle ? (
          <Button
            className="w-full font-bold uppercase tracking-wider"
            onClick={startGame}
            disabled={loading}
          >
            {loading ? "Starting..." : "🐔 Start Game"}
          </Button>
        ) : (
          <Button
            className="w-full font-bold uppercase tracking-wider"
            variant="outline"
            onClick={cashout}
            disabled={loading || currentLane === 0}
          >
            {loading ? "Processing..." : `💰 Cashout ${multiplier.toFixed(3)}x`}
          </Button>
        )}

        {/* Result */}
        {status === "won" && payout > 0 && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-center">
            <div className="text-xs text-green-400 uppercase tracking-wider font-bold">Won</div>
            <div className="text-2xl font-black font-mono text-green-400">${payout.toFixed(2)}</div>
          </div>
        )}
        {status === "lost" && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-center">
            <div className="text-xs text-red-400 uppercase tracking-wider font-bold">Busted</div>
            <div className="text-sm text-muted-foreground font-mono">-${amount.toFixed(2)}</div>
          </div>
        )}
      </div>

      {/* Game Grid */}
      <div className="chicken-road-play-area flex-1 space-y-3 min-w-0">
        {/* Provably Fair Hash Display */}
        {serverSeedHash && (
          <div className="bg-secondary/50 border border-border rounded-lg p-3 text-xs font-mono break-all">
            <span className="text-muted-foreground uppercase tracking-wider font-bold mr-2">Server Seed Hash (SHA-256):</span>
            <span className="text-primary">{serverSeedHash}</span>
          </div>
        )}
        {serverSeed && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-xs font-mono break-all">
            <span className="text-green-400 uppercase tracking-wider font-bold mr-2">Revealed Server Seed:</span>
            <span className="text-foreground">{serverSeed}</span>
          </div>
        )}

        {/* Lane Grid */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[auto_1fr] gap-2 px-4 py-2 border-b border-border bg-secondary/30">
            <div className="text-xs text-muted-foreground font-mono w-12">Lane</div>
            <div className="grid grid-cols-5 gap-2 text-xs text-muted-foreground font-mono text-center">
              {[0, 1, 2, 3, 4].map(i => <div key={i}>T{i + 1}</div>)}
            </div>
          </div>

          {/* Lanes */}
          <div className="divide-y divide-border/50">
            {Array.from({ length: LANES }, (_, laneIdx) => {
              const isCurrentLane = status === "active" && laneIdx === currentLane;
              const isPastLane = currentLane > laneIdx;
              const isFutureLane = status === "active" && laneIdx > currentLane;
              const laneMultiplier = getMultiplier(tier, laneIdx);

              return (
                <div
                  key={laneIdx}
                  className={`grid grid-cols-[auto_1fr] gap-2 px-4 py-3 transition-colors ${
                    isCurrentLane ? "bg-primary/5 border-l-2 border-l-primary" : ""
                  } ${isFutureLane ? "opacity-50" : ""}`}
                >
                  <div className="flex flex-col justify-center w-12">
                    <div className="text-xs font-mono text-muted-foreground">L{laneIdx + 1}</div>
                    <div className="text-[10px] font-mono text-primary/70">{laneMultiplier.toFixed(2)}x</div>
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {Array.from({ length: TILES }, (_, tileIdx) => {
                      const tile = grid[laneIdx][tileIdx];
                      const isClickable = isCurrentLane && !loading;

                      return (
                        <button
                          key={tileIdx}
                          disabled={!isClickable}
                          onClick={() => pickTile(laneIdx, tileIdx)}
                          className={`
                            aspect-square rounded-lg border text-lg font-bold transition-all
                            ${tile.status === "hidden" && isClickable ? "bg-secondary border-border hover:bg-primary/20 hover:border-primary hover:scale-105 cursor-pointer" : ""}
                            ${tile.status === "hidden" && !isClickable ? "bg-secondary/30 border-border/30 cursor-not-allowed" : ""}
                            ${tile.status === "safe" ? "bg-green-500/20 border-green-500/50 text-green-400" : ""}
                            ${tile.status === "car" ? "bg-red-500/30 border-red-500/60 text-red-400 animate-pulse" : ""}
                            ${tile.status === "revealed-car" ? "bg-red-500/10 border-red-500/30 text-red-400/50" : ""}
                          `}
                        >
                          {tile.status === "safe" && "✅"}
                          {tile.status === "car" && "🚗"}
                          {tile.status === "revealed-car" && "🚗"}
                          {tile.status === "hidden" && isClickable && "?"}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Multiplier table */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Multiplier Progression ({TIER_LABELS[tier].label})</div>
          <div className="grid grid-cols-5 gap-2 text-xs font-mono">
            {Array.from({ length: LANES }, (_, i) => (
              <div
                key={i}
                className={`text-center p-2 rounded border ${
                  i < currentLane && status === "active" ? "bg-green-500/10 border-green-500/30 text-green-400" :
                  i === currentLane && status === "active" ? "bg-primary/10 border-primary/50 text-primary" :
                  "bg-secondary/30 border-border/30 text-muted-foreground"
                }`}
              >
                <div className="text-[10px] text-muted-foreground">L{i + 1}</div>
                <div className="font-bold">{getMultiplier(tier, i).toFixed(2)}x</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
