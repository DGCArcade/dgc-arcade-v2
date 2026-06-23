import { useState } from "react";
import { Game } from "@workspace/api-client-react";
import { usePlaceBet, getGetMeQueryKey, getListRecentBetsAllQueryKey, getListBetsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface KenoProps { game: Game }

const PAYOUT_TABLE: Record<number, number[]> = {
  1:  [0,3.8],
  2:  [0,0,7],
  3:  [0,0,1.4,26],
  4:  [0,0,1,2,50],
  5:  [0,0,0.5,1.5,15,100],
  6:  [0,0,0,1.2,5,40,200],
  7:  [0,0,0,1,2.5,15,100,500],
  8:  [0,0,0,0.5,2,7,40,200,1000],
  9:  [0,0,0,0.5,1.5,5,20,80,400,2000],
  10: [0,0,0,0,1,3,12,50,200,1000,5000],
};

export function Keno({ game }: KenoProps) {
  const { user, requireAuth } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const placeBet = usePlaceBet();

  const [amount, setAmount] = useState<number>(game.minBet);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [drawn, setDrawn] = useState<number[]>([]);
  const [matches, setMatches] = useState<number[]>([]);
  const [playing, setPlaying] = useState(false);
  const [payout, setPayout] = useState<number|null>(null);
  const [won, setWon] = useState<boolean|null>(null);

  const toggleNum = (n: number) => {
    if (playing) return;
    const s = new Set(selected);
    if (s.has(n)) s.delete(n);
    else if (s.size < 10) s.add(n);
    setSelected(s);
  };

  const clear = () => { if (!playing) { setSelected(new Set()); setDrawn([]); setMatches([]); setPayout(null); setWon(null); } };
  const autoSelect = () => {
    if (playing) return;
    const count = selected.size || 5;
    const nums = new Set<number>();
    while (nums.size < count) nums.add(Math.floor(Math.random()*80)+1);
    setSelected(nums);
  };

  const play = () => {
    requireAuth(() => {
      if (!user || amount > user.balance) { toast({ title:"Insufficient balance", variant:"destructive" }); return; }
      if (selected.size < 1) { toast({ title:"Pick at least 1 number", variant:"destructive" }); return; }
      setDrawn([]);
      setMatches([]);
      setPayout(null);
      setWon(null);
      setPlaying(true);

      placeBet.mutate({ data: { gameId: game.id, amount, meta: { picks: [...selected] } } }, {
        onSuccess: (data) => {
          const meta = data.bet.meta as Record<string,unknown>;
          const drawnNums = (meta?.drawn as number[]) ?? [];
          const matchNums = (meta?.matches as number[]) ?? [];

          // Reveal drawn numbers one by one
          let i = 0;
          const interval = setInterval(() => {
            if (i >= drawnNums.length) {
              clearInterval(interval);
              setMatches(matchNums);
              setPayout(data.payout);
              setWon(data.won);
              setPlaying(false);
              qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
              qc.invalidateQueries({ queryKey: getListRecentBetsAllQueryKey() });
              qc.invalidateQueries({ queryKey: getListBetsQueryKey() });
              if (data.won) toast({ title:`${matchNums.length} matches! +${formatCurrency(data.payout)}`, className:"bg-green-500 text-white" });
              return;
            }
            setDrawn(prev => [...prev, drawnNums[i]]);
            i++;
          }, 60);
        },
        onError: (err) => { setPlaying(false); toast({ title:"Bet Failed", description:err.data?.error, variant:"destructive" }); }
      });
    });
  };

  const selArr = [...selected];
  const payouts = PAYOUT_TABLE[selArr.length] ?? [];

  return (
    <div className="flex flex-col md:flex-row gap-8">
      {/* Grid */}
      <div className="flex-1 bg-secondary border border-border rounded-xl p-3 md:p-5 flex flex-col gap-3 md:gap-4 min-h-[200px] md:min-h-[440px]">
        <div className="grid grid-cols-10 gap-1.5">
          {Array.from({length:80},(_,i)=>{
            const n = i+1;
            const isSel = selected.has(n);
            const isDrawn = drawn.includes(n);
            const isMatch = matches.includes(n);
            return (
              <button key={n} onClick={()=>toggleNum(n)} disabled={playing && !isDrawn}
                className={`aspect-square rounded-lg text-xs font-bold flex items-center justify-center transition-all duration-150 ${
                  isMatch ? "bg-green-500 text-white border border-green-400 scale-110 shadow-[0_0_8px_rgba(0,255,100,0.5)]" :
                  isDrawn && !isSel ? "bg-red-900/50 text-red-300 border border-red-700" :
                  isSel && isDrawn ? "bg-yellow-500 text-black border border-yellow-400 scale-110" :
                  isSel ? "bg-primary text-primary-foreground border border-primary/80 scale-105" :
                  "bg-card/60 border border-border/50 hover:border-primary/40 hover:bg-primary/10 text-muted-foreground hover:text-foreground"
                }`}>
                {n}
              </button>
            );
          })}
        </div>

        <div className="flex justify-between items-center text-xs text-muted-foreground mt-1">
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-primary inline-block"/> Selected ({selected.size}/10)</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-500 inline-block"/> Match</span>
          </span>
          <div className="flex gap-2">
            <button onClick={autoSelect} disabled={playing} className="text-xs text-primary hover:text-primary/80 font-bold transition-colors">Auto</button>
            <button onClick={clear} disabled={playing} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Clear</button>
          </div>
        </div>

        {payout !== null && won !== null && (
          <div className={`text-center font-display font-black text-2xl uppercase tracking-widest ${won?"text-green-400":"text-muted-foreground"}`}>
            {matches.length} match{matches.length!==1?"es":""}! {won ? `+${formatCurrency(payout)}` : "Better luck next time"}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="w-full md:w-72 bg-card border border-border rounded-xl p-6 flex flex-col gap-5">
        <div>
          <Label className="text-muted-foreground uppercase text-xs font-bold tracking-wider">Bet Amount</Label>
          <div className="relative mt-2">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</span>
            <Input type="number" value={amount} onChange={e=>setAmount(Number(e.target.value))} min={game.minBet} max={game.maxBet} className="pl-8 font-mono bg-secondary" disabled={playing}/>
          </div>
        </div>

        {/* Payout table */}
        {selArr.length > 0 && (
          <div className="space-y-1">
            <Label className="text-muted-foreground uppercase text-xs font-bold tracking-wider">Payouts ({selArr.length} picks)</Label>
            <div className="bg-secondary/50 rounded-lg p-2 border border-border/40 max-h-36 overflow-y-auto">
              {payouts.map((mult,i) => mult > 0 ? (
                <div key={i} className="flex justify-between text-xs font-mono py-0.5">
                  <span className="text-muted-foreground">{i} match{i!==1?"es":""}</span>
                  <span className={mult >= 10 ? "text-primary font-bold" : "text-foreground"}>{mult}x</span>
                </div>
              ) : null)}
            </div>
          </div>
        )}

        <Button size="lg" className="w-full font-display font-black text-xl uppercase tracking-widest h-14 mt-auto btn-pulse"
          onClick={play} disabled={playing||selected.size<1||placeBet.isPending}>
          {playing ? "Drawing…" : "Play Keno"}
        </Button>
      </div>
    </div>
  );
}
