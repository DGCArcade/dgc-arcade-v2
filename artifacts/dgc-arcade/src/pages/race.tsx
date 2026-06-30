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

function getToken() { return typeof localStorage !== "undefined" ? localStorage.getItem("dgc_token") : null; }

const RACERS = [
  { id: 1, name: "Blaze",   body: "#8B3A2A", coat: "#C44B33", mane: "#3D1810", silk: "#FF6B6B", num: "1" },
  { id: 2, name: "Thunder", body: "#7A4A12", coat: "#C47A1A", mane: "#3D2508", silk: "#FFD166", num: "2" },
  { id: 3, name: "Shadow",  body: "#2D1F4E", coat: "#4A3570", mane: "#120A24", silk: "#B794F6", num: "3" },
  { id: 4, name: "Storm",   body: "#1A4A52", coat: "#2A7A8A", mane: "#0A2830", silk: "#67E8F9", num: "4" },
  { id: 5, name: "Bolt",    body: "#1A4A28", coat: "#2A7A42", mane: "#0A2818", silk: "#6EE7A0", num: "5" },
  { id: 6, name: "Phantom", body: "#4A1A38", coat: "#7A2A5A", mane: "#280A1E", silk: "#F9A8D4", num: "6" },
];

type CameraAngle = "side" | "front" | "aerial" | "finish";

type RaceResult = {
  betId: number; won: boolean; winnerRacerId: number; finishOrder: number[];
  playerPlace: number; multiplier: number; payout: number; profit: number;
  newBalance: number; serverSeedHash: string; serverSeed: string; clientSeed: string; nonce: number;
};

type RacerProgress = { racerId: number; progress: number; done: boolean };

const CAMERAS: { id: CameraAngle; label: string }[] = [
  { id: "side", label: "Side" },
  { id: "front", label: "Front" },
  { id: "aerial", label: "Aerial" },
  { id: "finish", label: "Finish" },
];

function RealisticHorse({ r, gallop, scale = 1, view = "side" }: {
  r: typeof RACERS[0]; gallop: boolean; scale?: number; view?: CameraAngle;
}) {
  const legClass = gallop ? "horse-gallop" : "";
  const w = 72 * scale;
  const h = 48 * scale;

  if (view === "aerial") {
    return (
      <svg viewBox="0 0 48 32" width={w * 0.7} height={h * 0.7} className={`drop-shadow-md ${legClass}`}>
        <ellipse cx="24" cy="16" rx="18" ry="8" fill={r.coat} />
        <ellipse cx="36" cy="14" rx="7" ry="5" fill={r.coat} />
        <rect x="20" y="10" width="8" height="6" rx="1" fill={r.silk} stroke="#fff" strokeWidth="0.5" />
        <text x="24" y="15" textAnchor="middle" fontSize="5" fontWeight="900" fill="#111">{r.num}</text>
      </svg>
    );
  }

  if (view === "front") {
    return (
      <svg viewBox="0 0 40 56" width={w * 0.55} height={h * 1.1} className={`drop-shadow-md ${legClass}`}>
        <ellipse cx="20" cy="30" rx="10" ry="14" fill={r.coat} />
        <ellipse cx="20" cy="12" rx="8" ry="9" fill={r.coat} />
        <rect x="14" y="18" width="12" height="8" rx="2" fill={r.silk} stroke="#fff" strokeWidth="0.5" />
        <rect x="12" y="40" width="4" height="12" rx="2" fill={r.mane} className="horse-leg-front" />
        <rect x="24" y="40" width="4" height="12" rx="2" fill={r.mane} className="horse-leg-back" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 80 48" width={w} height={h} className={`drop-shadow-lg ${legClass}`}>
      <ellipse cx="14" cy="42" rx="12" ry="2.5" fill="#8B6914" opacity={gallop ? 0.45 : 0.2} className={gallop ? "horse-dust" : ""} />
      {/* Back legs */}
      <path d="M22 34 L20 44 L17 44 L19 34 Z" fill={r.mane} className="horse-leg-back" />
      <path d="M28 34 L26 44 L23 44 L25 34 Z" fill={r.mane} className="horse-leg-front" />
      {/* Body */}
      <ellipse cx="38" cy="26" rx="22" ry="11" fill={r.coat} />
      <ellipse cx="38" cy="28" rx="18" ry="7" fill={r.body} opacity="0.35" />
      {/* Neck */}
      <path d="M52 22 Q58 14 64 12 Q66 18 62 24 Q56 28 50 28 Z" fill={r.coat} />
      {/* Head */}
      <ellipse cx="66" cy="14" rx="9" ry="7" fill={r.coat} />
      <ellipse cx="72" cy="13" rx="2" ry="1.5" fill="#1a1a1a" />
      {/* Ear */}
      <path d="M64 8 L66 4 L68 9 Z" fill={r.coat} />
      {/* Mane */}
      <path d="M58 10 Q54 6 56 2 Q60 8 58 16 Q62 12 64 18" fill={r.mane} />
      {/* Tail */}
      <path d="M18 24 Q8 20 10 32 Q14 30 20 28 Z" fill={r.mane} />
      {/* Front legs */}
      <path d="M44 34 L42 44 L39 44 L41 34 Z" fill={r.mane} className="horse-leg-front" />
      <path d="M50 34 L48 44 L45 44 L47 34 Z" fill={r.mane} className="horse-leg-back" />
      {/* Jockey */}
      <rect x="32" y="16" width="12" height="9" rx="2" fill={r.silk} stroke="#fff" strokeWidth="0.6" />
      <text x="38" y="23" textAnchor="middle" fontSize="6" fontWeight="900" fill="#111">{r.num}</text>
      <circle cx="38" cy="13" r="3.5" fill="#F5D0A0" />
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
  const [progress, setProgress] = useState<RacerProgress[]>(RACERS.map(r => ({ racerId: r.id, progress: 0, done: false })));
  const [camera, setCamera] = useState<CameraAngle>("side");
  const [cameraX, setCameraX] = useState(0);
  const animRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const resultRef = useRef<RaceResult | null>(null);

  const resetRace = useCallback(() => {
    setResult(null);
    resultRef.current = null;
    setProgress(RACERS.map(r => ({ racerId: r.id, progress: 0, done: false })));
    setCameraX(0);
  }, []);

  async function runRace() {
    if (!isAuthenticated) { open("login"); return; }
    if (!selectedRacer) { toast({ title: "Pick a horse!", variant: "destructive" }); return; }
    const amt = parseFloat(betAmount);
    if (isNaN(amt) || amt <= 0) { toast({ title: "Invalid bet", variant: "destructive" }); return; }
    resetRace();
    setRacing(true);
    setCamera("side");

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
    const TRACK_LEN = 92;

    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const next = RACERS.map(r => {
        const rank = finishRank[r.id];
        const finishMs = 3200 + rank * 480 + (r.id % 4) * 90;
        const t = Math.min(1, elapsed / finishMs);
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        return { racerId: r.id, progress: eased * TRACK_LEN, done: t >= 1 };
      });
      setProgress(next);

      const leader = next.reduce((a, b) => a.progress > b.progress ? a : b);
      setCameraX(Math.min(leader.progress * 0.52, TRACK_LEN * 0.52));

      if (next.every(p => p.done)) {
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

  useEffect(() => () => { if (animRef.current) cancelAnimationFrame(animRef.current); }, []);

  function renderTrack() {
    const commonBg = (
      <>
        <div className="absolute inset-0 bg-gradient-to-b from-[#6BB5E8] via-[#D4B86A] to-[#9A7B42]" />
        <div className="absolute bottom-0 left-0 right-0 h-[28%] bg-gradient-to-b from-[#A08040] to-[#5C4033]" />
        <div className="absolute bottom-[26%] left-0 right-0 h-0.5 bg-white/50" />
      </>
    );

    if (camera === "aerial") {
      return (
        <div className="relative h-full w-full overflow-hidden">
          {commonBg}
          <div className="absolute inset-4 border-2 border-dashed border-white/20 rounded-full" />
          <div className="absolute inset-8 border border-white/10 rounded-full" />
          {RACERS.map((r, lane) => {
            const p = progress.find(x => x.racerId === r.id);
            const angle = ((p?.progress ?? 0) / 92) * Math.PI * 1.6 - Math.PI * 0.3;
            const cx = 50 + Math.cos(angle) * (32 - lane * 3);
            const cy = 50 + Math.sin(angle) * (22 - lane * 2);
            return (
              <div key={r.id} className="absolute transition-none" style={{ left: `${cx}%`, top: `${cy}%`, transform: "translate(-50%,-50%)" }}>
                <RealisticHorse r={r} gallop={racing && !p?.done} view="aerial" scale={0.85} />
              </div>
            );
          })}
        </div>
      );
    }

    if (camera === "front") {
      return (
        <div className="relative h-full w-full overflow-hidden flex items-end justify-center gap-1 px-2 pb-6">
          {commonBg}
          <div className="absolute bottom-6 left-0 right-0 h-16 flex items-end justify-center gap-2 z-10">
            {RACERS.map(r => {
              const p = progress.find(x => x.racerId === r.id);
              const bounce = racing && !p?.done ? Math.sin((p?.progress ?? 0) * 0.3) * 4 : 0;
              return (
                <div key={r.id} style={{ transform: `translateY(${-bounce}px)` }} className={r.id === selectedRacer ? "scale-110" : "opacity-80"}>
                  <RealisticHorse r={r} gallop={racing && !p?.done} view="front" />
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    if (camera === "finish") {
      const ordered = [...RACERS].sort((a, b) => {
        const pa = progress.find(x => x.racerId === a.id)?.progress ?? 0;
        const pb = progress.find(x => x.racerId === b.id)?.progress ?? 0;
        return pb - pa;
      });
      return (
        <div className="relative h-full w-full overflow-hidden">
          {commonBg}
          <div className="absolute right-[12%] bottom-[18%] flex flex-col items-center z-20">
            <div className="w-1.5 h-20 bg-white shadow-lg" />
            {[0,1,2,3,4,5,6,7].map(i => (
              <div key={i} className="w-4 h-2" style={{ background: i % 2 === 0 ? "#111" : "#fff" }} />
            ))}
            <span className="text-[10px] font-black text-white uppercase mt-1">Finish</span>
          </div>
          {ordered.slice(0, 4).map((r, i) => (
            <div key={r.id} className="absolute flex items-end" style={{ right: `${18 + i * 8}%`, bottom: `${22 + i * 10}%`, zIndex: 10 - i }}>
              {result?.winnerRacerId === r.id && <Trophy className="w-5 h-5 text-yellow-400 mr-1 mb-8 animate-bounce" />}
              <RealisticHorse r={r} gallop={false} scale={1.1 - i * 0.08} />
            </div>
          ))}
        </div>
      );
    }

    // Side view (default)
    return (
      <div className="relative h-full w-full overflow-hidden">
        {commonBg}
        <div className="absolute bottom-[24%] left-0 right-0 h-10 opacity-25"
          style={{ background: "repeating-linear-gradient(90deg, #333 0px, #333 10px, transparent 10px, transparent 20px)" }} />
        <div className="absolute bottom-[18%] left-0 right-0 h-20 transition-none"
          style={{ transform: `translateX(-${cameraX}%)`, width: "200%" }}>
          <div className="absolute right-[6%] bottom-0 flex flex-col items-center">
            <div className="w-1 h-16 bg-white shadow-lg" />
            {[0,1,2,3,4,5,6,7].map(i => (
              <div key={i} className="w-3 h-2" style={{ background: i % 2 === 0 ? "#111" : "#fff" }} />
            ))}
          </div>
          {RACERS.map((r, lane) => {
            const p = progress.find(x => x.racerId === r.id);
            const x = p?.progress ?? 0;
            const isWinner = result?.winnerRacerId === r.id;
            const isMyPick = r.id === selectedRacer;
            return (
              <div key={r.id} className="absolute flex items-end gap-1"
                style={{ left: `${3 + x}%`, bottom: `${lane * 11 + 2}%`, zIndex: isMyPick ? 20 : 12 - lane }}>
                {isMyPick && <span className="text-[8px] font-black uppercase text-yellow-300 drop-shadow mb-10">YOU</span>}
                <div className={isWinner && result ? "scale-110" : ""}>
                  <RealisticHorse r={r} gallop={racing && !p?.done} />
                </div>
                {isWinner && result && <Trophy className="w-4 h-4 text-yellow-400 mb-8 animate-bounce" />}
              </div>
            );
          })}
        </div>
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-black/25 via-transparent to-black/20" />
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 max-w-5xl mx-auto px-2 md:px-0">
      <div className="flex items-center gap-3">
        <Link href="/games">
          <button type="button" className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors text-sm font-medium">
            <ChevronLeft className="w-4 h-4" /> Games
          </button>
        </Link>
        <h1 className="font-display font-black text-2xl md:text-3xl uppercase tracking-widest">🏇 DGC Derby</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <Card className="bg-card border-border p-4 md:p-5 space-y-4 order-2 lg:order-1">
          <div>
            <div className="text-xs uppercase tracking-widest font-bold text-muted-foreground mb-2">Pick Your Horse</div>
            <div className="grid grid-cols-2 gap-2">
              {RACERS.map(r => (
                <button key={r.id} type="button" disabled={racing} onClick={() => setSelectedRacer(r.id)}
                  className={`flex items-center gap-1.5 p-2 rounded-lg border transition-all font-bold text-xs ${selectedRacer === r.id ? "border-2" : "border-border/50 hover:border-border bg-secondary/30"} disabled:opacity-50`}
                  style={selectedRacer === r.id ? { borderColor: r.silk, backgroundColor: `${r.silk}18` } : undefined}>
                  <RealisticHorse r={r} gallop={false} scale={0.65} />
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
          <Button className="w-full font-display font-black uppercase tracking-widest text-base h-11" disabled={racing} onClick={runRace}>
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

        <div className="lg:col-span-2 space-y-3 order-1 lg:order-2">
          <Card className="bg-card border-border p-0 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 bg-secondary/30">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <Video className="w-3.5 h-3.5" /> Camera
              </div>
              <div className="flex gap-1">
                {CAMERAS.map(c => (
                  <button key={c.id} type="button" onClick={() => setCamera(c.id)} disabled={racing && c.id === "finish" && !result}
                    className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all ${camera === c.id ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-muted-foreground hover:text-foreground"} disabled:opacity-40`}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative h-52 sm:h-64 md:h-72 derby-track-scene">
              {renderTrack()}
            </div>
          </Card>

          {result && (
            <Card className={`border-2 p-4 ${result.won ? "border-green-500/60 bg-green-500/5" : "border-destructive/40 bg-destructive/5"}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display font-black uppercase tracking-widest text-base md:text-lg">{result.won ? "Winner! 🏆" : `Finished #${result.playerPlace}`}</h3>
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
