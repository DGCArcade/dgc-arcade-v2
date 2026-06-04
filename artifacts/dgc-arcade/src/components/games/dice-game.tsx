import { useState } from "react";
import { Game } from "@workspace/api-client-react/src/generated/api.schemas";
import { usePlaceBet, getGetMeQueryKey, getListRecentBetsAllQueryKey, getListBetsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DiceGameProps { game: Game }

export function DiceGame({ game }: DiceGameProps) {
  const { user, requireAuth } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const placeBet = usePlaceBet();

  const [amount, setAmount] = useState<number>(game.minBet);
  const [target, setTarget] = useState<number>(50);
  const [mode, setMode] = useState<"over"|"under">("over");
  const [result, setResult] = useState<number|null>(null);
  const [won, setWon] = useState<boolean|null>(null);
  const [payout, setPayout] = useState(0);
  const [rolling, setRolling] = useState(false);

  const winChance = mode === "over" ? 100 - target : target;
  const multiplier = Math.max(0.01, (99 / winChance)).toFixed(4);
  const potentialPayout = (amount * parseFloat(multiplier)).toFixed(2);

  const roll = () => {
    requireAuth(() => {
      if (!user || amount > user.balance) { toast({ title:"Insufficient balance", variant:"destructive" }); return; }
      setRolling(true);
      setResult(null);
      setWon(null);

      placeBet.mutate({ data: { gameId: game.id, amount, meta: { target, mode } } }, {
        onSuccess: (data) => {
          const meta = data.bet.meta as Record<string,unknown>;
          const roll = meta?.roll as number ?? 50;
          setResult(roll);
          setWon(data.won);
          setPayout(data.payout);
          setRolling(false);
          qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
          qc.invalidateQueries({ queryKey: getListRecentBetsAllQueryKey() });
          qc.invalidateQueries({ queryKey: getListBetsQueryKey() });
          if (data.won) toast({ title: `Win! Roll: ${roll.toFixed(2)} — +${formatCurrency(data.payout)}`, className: "bg-green-500 text-white" });
        },
        onError: (err) => { setRolling(false); toast({ title:"Bet Failed", description:err.data?.error, variant:"destructive" }); }
      });
    });
  };

  return (
    <div className="flex flex-col md:flex-row gap-8">
      {/* Roll Display */}
      <div className="flex-1 bg-secondary border border-border rounded-xl p-8 flex flex-col items-center justify-center min-h-[440px] gap-8">
        {/* Result number */}
        <div className={`text-7xl font-mono font-black transition-all duration-500 ${
          rolling ? "opacity-30 scale-95 animate-pulse" :
          won === true ? "text-green-400 scale-110" :
          won === false ? "text-red-400" : "text-muted-foreground/40"
        }`}>
          {rolling ? "??" : result !== null ? result.toFixed(2) : "00.00"}
        </div>

        {/* Win/lose */}
        {won !== null && !rolling && (
          <div className={`text-2xl font-display font-black uppercase tracking-widest ${won?"text-green-400":"text-red-400"}`}>
            {won ? `Win! +${formatCurrency(payout)}` : `Lose`}
          </div>
        )}

        {/* Slider visual */}
        <div className="w-full max-w-sm space-y-2">
          {/* Track */}
          <div className="relative h-8 rounded-full overflow-hidden">
            {mode === "over" ? (
              <>
                <div className="absolute inset-y-0 left-0 bg-red-600/70 rounded-l-full" style={{ width: `${target}%` }} />
                <div className="absolute inset-y-0 bg-green-600/70 rounded-r-full" style={{ left:`${target}%`, right:0 }} />
              </>
            ) : (
              <>
                <div className="absolute inset-y-0 left-0 bg-green-600/70 rounded-l-full" style={{ width: `${target}%` }} />
                <div className="absolute inset-y-0 bg-red-600/70 rounded-r-full" style={{ left:`${target}%`, right:0 }} />
              </>
            )}
            {/* Result indicator */}
            {result !== null && !rolling && (
              <div className="absolute top-0 bottom-0 w-1 bg-white rounded-full transition-all duration-500 shadow-lg"
                style={{ left: `${result}%` }} />
            )}
            {/* Target line */}
            <div className="absolute top-0 bottom-0 w-0.5 bg-white/80" style={{ left: `${target}%` }} />
          </div>
          <div className="flex justify-between text-xs font-mono text-muted-foreground">
            <span>0</span><span className="text-primary font-bold">{target}</span><span>100</span>
          </div>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-3">
          <button onClick={()=>setMode("over")}
            className={`px-6 py-2.5 rounded-xl font-bold uppercase text-sm transition-all ${mode==="over"?"bg-green-600 text-white scale-105":"bg-secondary text-muted-foreground hover:text-foreground"}`}>
            Roll Over
          </button>
          <button onClick={()=>setMode("under")}
            className={`px-6 py-2.5 rounded-xl font-bold uppercase text-sm transition-all ${mode==="under"?"bg-green-600 text-white scale-105":"bg-secondary text-muted-foreground hover:text-foreground"}`}>
            Roll Under
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="w-full md:w-80 bg-card border border-border rounded-xl p-6 flex flex-col gap-5">
        <div className="space-y-4">
          <div>
            <Label className="text-muted-foreground uppercase text-xs font-bold tracking-wider">Bet Amount</Label>
            <div className="relative mt-2">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</span>
              <Input type="number" value={amount} onChange={e=>setAmount(Number(e.target.value))} min={game.minBet} max={game.maxBet} className="pl-8 font-mono bg-secondary"/>
            </div>
            <div className="flex gap-2 mt-2">
              {["MIN","x2","/2","MAX"].map((l,i)=>(
                <Button key={l} variant="outline" size="sm" className="flex-1 text-xs h-7 bg-secondary"
                  onClick={()=>{if(i===0)setAmount(game.minBet);if(i===1)setAmount(Math.min(amount*2,game.maxBet));if(i===2)setAmount(Math.max(game.minBet,amount/2));if(i===3)setAmount(Math.min(user?.balance||0,game.maxBet));}}>{l}</Button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-muted-foreground uppercase text-xs font-bold tracking-wider">Target: {target}</Label>
              <span className="text-xs font-mono text-muted-foreground">Win: {winChance}%</span>
            </div>
            <input type="range" min={2} max={98} value={target} onChange={e=>setTarget(Number(e.target.value))}
              className="w-full accent-primary"/>
            <div className="flex gap-2 mt-2">
              {[10,25,50,75,90].map(v=>(
                <button key={v} onClick={()=>setTarget(v)} className={`flex-1 text-xs py-1 rounded font-mono border transition-colors ${target===v?"border-primary text-primary":"border-border/50 text-muted-foreground hover:border-primary/40"}`}>{v}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="bg-secondary/50 rounded-lg p-3 border border-border/40 space-y-1.5 text-xs font-mono">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Multiplier</span>
            <span className="text-primary font-bold">{multiplier}x</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Win Chance</span>
            <span className="text-foreground">{winChance}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Potential Payout</span>
            <span className="text-green-400 font-bold">${potentialPayout}</span>
          </div>
        </div>

        <Button size="lg" className="w-full font-display font-black text-xl uppercase tracking-widest h-14 mt-auto btn-pulse"
          onClick={roll} disabled={rolling||placeBet.isPending}>
          {rolling ? "Rolling…" : "Roll"}
        </Button>
      </div>
    </div>
  );
}
