import { useState, useEffect, useRef } from "react";
import { Check, Copy } from "lucide-react";
import { Game } from "@workspace/api-client-react";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useCrashLiveRound } from "@/hooks/use-crash-live-round";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProvablyFairPanel } from "./provably-fair-panel";
import { getApiUrl } from "@/lib/api-fetch";

interface CrashGameLiveProps { game: Game }

function LiveBettorFeed({ bets, showResults }: { bets: { username: string; amount: number; cashoutAt: number; won?: boolean; payout?: number }[]; showResults: boolean }) {
  return (
    <div className="space-y-2 h-full flex flex-col min-h-0">
      <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider shrink-0">Live Bets</div>
      <div className="space-y-2 overflow-y-auto flex-1 min-h-0">
        {bets.length === 0 ? (
          <div className="text-center text-muted-foreground text-xs py-4">No bets this round</div>
        ) : (
          bets.map((bet, i) => (
            <div key={i} className="flex items-center justify-between text-xs p-2 rounded"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex-1 min-w-0">
                <div className="font-mono font-bold text-white truncate">{bet.username}</div>
                <div className="text-muted-foreground text-xs">@{bet.cashoutAt.toFixed(2)}×</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="font-bold text-green-400">${bet.amount.toFixed(2)}</div>
                {showResults && bet.won !== undefined && (
                  <div className={`text-xs font-bold ${bet.won ? "text-green-400" : "text-red-400"}`}>
                    {bet.won ? `+${formatCurrency(bet.payout ?? 0)}` : "Lost"}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SHAHashDisplay({ hash, label }: { hash: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="flex items-center gap-2 p-2 rounded bg-secondary/40 border border-border/50">
        <code className="text-xs font-mono text-foreground/70 flex-1 truncate">{hash}</code>
        <button type="button" onClick={() => { navigator.clipboard.writeText(hash); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="p-1 hover:bg-secondary rounded">
          {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
        </button>
      </div>
    </div>
  );
}

export function CrashGameLive({ game }: CrashGameLiveProps) {
  const { user, requireAuth } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: liveData } = useCrashLiveRound();
  const round = liveData?.round;
  const bets = liveData?.bets ?? [];

  const [amount, setAmount] = useState(game.minBet);
  const [cashoutAt, setCashoutAt] = useState(2.0);
  const [displayMult, setDisplayMult] = useState(1.0);
  const [placing, setPlacing] = useState(false);
  const [myBetPlaced, setMyBetPlaced] = useState(false);
  const animRef = useRef<number | undefined>(undefined);

  const bettingActive = round?.state === "betting";
  const flying = round?.state === "flying";
  const crashed = round?.state === "crashed" || round?.state === "results";
  const showResults = crashed;

  useEffect(() => {
    if (!round) return;
    if (round.state === "betting") {
      setDisplayMult(1.0);
      setMyBetPlaced(false);
    }
  }, [round?.roundId, round?.state]);

  useEffect(() => {
    if (!flying || !round?.flyingStartedAt) {
      if (crashed && round?.crashPoint) setDisplayMult(round.crashPoint);
      return;
    }

    const flyStart = round.flyingStartedAt;
    const tick = () => {
      const elapsed = (Date.now() - flyStart) / 1000;
      const mult = Math.pow(Math.E, 0.2 * elapsed);
      setDisplayMult(mult);
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [flying, round?.flyingStartedAt, crashed, round?.crashPoint]);

  useEffect(() => {
    if (crashed) {
      qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
    }
  }, [crashed, round?.roundId, qc]);

  const placeLiveBet = () => {
    requireAuth(async () => {
      if (!user || amount > parseFloat(String(user.balance))) {
        toast({ title: "Insufficient balance", variant: "destructive" });
        return;
      }
      if (amount < game.minBet || amount > game.maxBet) {
        toast({ title: "Invalid bet", description: `Bet must be between ${formatCurrency(game.minBet)} and ${formatCurrency(game.maxBet)}`, variant: "destructive" });
        return;
      }
      if (cashoutAt < 1.01) {
        toast({ title: "Invalid cashout", description: "Minimum 1.01×", variant: "destructive" });
        return;
      }
      if (!bettingActive) {
        toast({ title: "Betting closed", description: "Wait for the next round", variant: "destructive" });
        return;
      }

      setPlacing(true);
      try {
        const token = localStorage.getItem("dgc_token");
        const res = await fetch(getApiUrl("/api/crash/live/bet"), {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ amount, cashoutAt }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Bet failed");
        setMyBetPlaced(true);
        qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
        qc.invalidateQueries({ queryKey: ["crash-live-round"] });
        toast({ title: "Bet placed!", description: `Auto cashout @ ${cashoutAt.toFixed(2)}×` });
      } catch (e: unknown) {
        toast({ title: "Bet failed", description: (e as Error).message, variant: "destructive" });
      } finally {
        setPlacing(false);
      }
    });
  };

  const timeRemaining = round?.timeRemaining ?? 0;
  const multColor = crashed ? "text-destructive" : flying ? "text-primary" : "text-foreground";

  return (
    <div className="crash-game-root w-full">
      <style>{`
        @media (min-width: 768px) {
          .crash-live-grid { display: grid; grid-template-columns: 260px 1fr 240px; gap: 12px; min-height: 420px; }
        }
        @media (max-width: 767px) {
          .crash-live-grid { display: flex; flex-direction: column; gap: 6px; height: 100%; min-height: 0; overflow-y: auto; padding-bottom: 20px; }
          .crash-bet-col { order: 2; flex-shrink: 0; }
          .crash-chart-col { order: 1; flex: 0 0 160px; }
          .crash-feed-col { order: 3; flex: 1 0 180px; min-height: 180px; }
          .crash-sha-col { order: 4; flex-shrink: 0; }
        }
      `}</style>

      <div className="crash-live-grid">
        <div className="crash-bet-col crash-bet-panel bg-card border border-border rounded-xl p-3 md:p-4 flex flex-col gap-3 min-h-0">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-center border-b border-border/40 pb-2">
            Live Crash
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground mb-1">Round</div>
            <div className={`inline-block px-3 py-1 rounded-lg text-xs font-bold font-mono uppercase ${
              bettingActive ? "bg-green-500/20 text-green-400 border border-green-500/40" :
              flying ? "bg-primary/20 text-primary border border-primary/40" :
              "bg-red-500/20 text-red-400 border border-red-500/40"
            }`}>
              {round?.state ?? "…"}
              {bettingActive && ` · ${(timeRemaining / 1000).toFixed(1)}s`}
            </div>
          </div>
          <div>
            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Bet Amount</Label>
            <Input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))}
              min={game.minBet} max={game.maxBet} step={0.01}
              disabled={!bettingActive || placing || myBetPlaced}
              className="mt-1 font-mono bg-secondary border-border text-sm h-9" />
          </div>
          <div>
            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Auto Cashout</Label>
            <Input type="number" value={cashoutAt} onChange={e => setCashoutAt(Number(e.target.value))}
              min={1.01} step={0.01}
              disabled={!bettingActive || placing || myBetPlaced}
              className="mt-1 font-mono bg-secondary border-border text-sm h-9" />
          </div>
          {user && (
            <p className="text-[10px] text-muted-foreground font-mono">Balance: <span className="text-primary font-bold">{formatCurrency(user.balance)}</span></p>
          )}
          <Button onClick={placeLiveBet} disabled={!bettingActive || placing || myBetPlaced}
            className={`w-full font-display font-black uppercase tracking-widest mt-auto h-10 text-sm transition-all duration-300 ${
              myBetPlaced ? "bg-green-600 hover:bg-green-600 text-white shadow-[0_0_15px_rgba(22,163,74,0.4)]" : 
              bettingActive ? "bg-primary hover:bg-primary/90" : "bg-muted text-muted-foreground"
            }`}>
            {myBetPlaced ? "✓ Bet Active" : placing ? "Placing…" : bettingActive ? "Place Bet" : "Waiting for Next Round"}
          </Button>
        </div>

        <div className="crash-chart-col crash-chart-area bg-secondary border border-border rounded-xl p-3 flex flex-col items-center justify-center relative overflow-hidden min-h-[140px]">
          <div className="absolute inset-0 opacity-10 pointer-events-none">
            <svg className="w-full h-full" preserveAspectRatio="none">
              <path d={`M 0,100% Q 50%,50% 100%,0`} fill="none" stroke="currentColor" strokeWidth="3" />
            </svg>
          </div>
          <div className={`relative z-10 font-mono font-black text-4xl md:text-7xl tracking-tighter transition-colors ${multColor}`}>
            {displayMult.toFixed(2)}×
          </div>
          {crashed && round?.crashPoint && (
            <div className="text-xs font-bold uppercase tracking-widest text-destructive mt-2 animate-pulse">Crashed!</div>
          )}
        </div>

        <div className="crash-feed-col bg-card border border-border rounded-xl p-3 min-h-0 flex flex-col overflow-hidden">
          <LiveBettorFeed bets={bets} showResults={showResults} />
        </div>

        {round?.serverSeedHash && (
          <div className="crash-sha-col bg-card border border-border rounded-xl p-3 space-y-2">
            <SHAHashDisplay hash={round.serverSeedHash} label="Server Seed Hash (SHA-256)" />
            {showResults && round.serverSeed && round.clientSeed && (
              <ProvablyFairPanel
                serverSeedHash={round.serverSeedHash}
                serverSeed={round.serverSeed}
                clientSeed={round.clientSeed}
                nonce={0}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
