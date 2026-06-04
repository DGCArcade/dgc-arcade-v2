import { useState, useRef, useCallback } from "react";
import { Game } from "@workspace/api-client-react/src/generated/api.schemas";
import { usePlaceBet, getGetMeQueryKey, getListRecentBetsAllQueryKey, getListBetsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PlinkoProps { game: Game }

const ROWS = 8;
const BUCKET_MULTIPLIERS = [10, 3, 2, 1.5, 1, 1.5, 2, 3, 10];
const BUCKET_COLORS = ["#FF2244","#FF6622","#FFB800","#FFE566","#FFFFFF","#FFE566","#FFB800","#FF6622","#FF2244"];

export function Plinko({ game }: PlinkoProps) {
  const { user, requireAuth } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const placeBet = usePlaceBet();
  const boardRef = useRef<SVGSVGElement>(null);

  const [amount, setAmount] = useState<number>(game.minBet);
  const [balls, setBalls] = useState<{ id: number; path: number[]; done: boolean; bucket: number }[]>([]);
  const [results, setResults] = useState<{ multiplier: number; win: boolean; payout: number }[]>([]);
  const ballId = useRef(0);

  const W = 340, H = 300;
  const pegSpacing = W / (ROWS + 1);
  const rowHeight = (H - 80) / ROWS;

  const getPegs = () => {
    const pegs: { x: number; y: number }[] = [];
    for (let r = 0; r < ROWS; r++) {
      const count = r + 2;
      const totalW = (count - 1) * pegSpacing;
      const startX = (W - totalW) / 2;
      for (let c = 0; c < count; c++) {
        pegs.push({ x: startX + c * pegSpacing, y: 40 + r * rowHeight });
      }
    }
    return pegs;
  };
  const pegs = getPegs();

  const getBucketX = (b: number) => {
    const bucketW = W / 9;
    return bucketW * b + bucketW / 2;
  };

  const animateBall = useCallback((id: number, path: number[], bucket: number) => {
    let step = 0;
    const interval = setInterval(() => {
      step++;
      if (step >= path.length) {
        clearInterval(interval);
        setBalls(prev => prev.map(b => b.id === id ? { ...b, done: true } : b));
        setTimeout(() => setBalls(prev => prev.filter(b => b.id !== id)), 1500);
        return;
      }
      setBalls(prev => prev.map(b => b.id === id ? { ...b, path: path.slice(0, step + 1) } : b));
    }, 180);
  }, []);

  const getBallPos = (path: number[], _bucket: number) => {
    if (path.length === 0) return { x: W / 2, y: 20 };
    const rowIdx = path.length - 1;
    if (rowIdx >= ROWS) {
      return { x: getBucketX(_bucket), y: H - 30 };
    }
    const r = rowIdx;
    const count = r + 2;
    const totalW = (count - 1) * pegSpacing;
    const startX = (W - totalW) / 2;
    const colIdx = path[rowIdx];
    return { x: startX + colIdx * pegSpacing, y: 40 + r * rowHeight };
  };

  const handleBet = () => {
    requireAuth(() => {
      if (!user || amount > user.balance) { toast({ title:"Insufficient balance", variant:"destructive" }); return; }
      placeBet.mutate({ data: { gameId: game.id, amount } }, {
        onSuccess: (data) => {
          const meta = data.bet.meta as Record<string,unknown>;
          const path = (meta?.path as number[]) ?? [];
          const bucket = (meta?.bucket as number) ?? 4;
          const id = ++ballId.current;
          setBalls(prev => [...prev, { id, path: [0], done: false, bucket }]);
          setResults(prev => [{ multiplier: BUCKET_MULTIPLIERS[bucket], win: data.won, payout: data.payout }, ...prev].slice(0, 8));
          animateBall(id, [0, ...path, bucket], bucket);
          qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
          qc.invalidateQueries({ queryKey: getListRecentBetsAllQueryKey() });
          qc.invalidateQueries({ queryKey: getListBetsQueryKey() });
          if (data.won) toast({ title: `${BUCKET_MULTIPLIERS[bucket]}x — +${formatCurrency(data.payout)}!`, className: "bg-green-500 text-white" });
        },
        onError: (err) => toast({ title: "Bet Failed", description: err.data?.error, variant: "destructive" })
      });
    });
  };

  return (
    <div className="flex flex-col md:flex-row gap-8">
      {/* Board */}
      <div className="flex-1 bg-secondary border border-border rounded-xl p-4 flex flex-col items-center min-h-[440px]">
        <svg ref={boardRef} width={W} height={H} className="overflow-visible">
          {/* Pegs */}
          {pegs.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="5" fill="#FF8C00" opacity="0.9" />
          ))}
          {/* Buckets */}
          {BUCKET_MULTIPLIERS.map((m, i) => {
            const bw = W / 9, bx = bw * i;
            return (
              <g key={i}>
                <rect x={bx + 2} y={H - 50} width={bw - 4} height={36} rx="4" fill={BUCKET_COLORS[i]} opacity="0.85" />
                <text x={bx + bw / 2} y={H - 27} textAnchor="middle" fontSize="9" fontWeight="900" fill="#000">{m}x</text>
              </g>
            );
          })}
          {/* Balls */}
          {balls.map(ball => {
            const pos = getBallPos(ball.path, ball.bucket);
            return (
              <circle key={ball.id} cx={pos.x} cy={pos.y} r="8"
                fill={ball.done ? BUCKET_COLORS[ball.bucket] : "white"}
                stroke={ball.done ? "white" : "#FFD700"} strokeWidth="2"
                style={{ transition: "cx 0.16s ease-out, cy 0.16s ease-out", filter: "drop-shadow(0 2px 6px rgba(255,215,0,0.4))" }} />
            );
          })}
        </svg>

        {/* Recent results */}
        <div className="flex gap-1.5 mt-3 flex-wrap justify-center">
          {results.map((r, i) => (
            <span key={i} className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${r.win ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-secondary text-muted-foreground border border-border/50"}`}>
              {r.multiplier}x
            </span>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="w-full md:w-72 bg-card border border-border rounded-xl p-6 flex flex-col gap-5">
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

        {/* Multiplier legend */}
        <div className="space-y-1.5">
          <Label className="text-muted-foreground uppercase text-xs font-bold tracking-wider">Multipliers</Label>
          <div className="grid grid-cols-3 gap-1.5">
            {BUCKET_MULTIPLIERS.filter((v,i,a)=>a.indexOf(v)===i).map(m=>(
              <div key={m} className="text-center text-xs font-mono font-bold py-1 rounded" style={{ background: BUCKET_COLORS[BUCKET_MULTIPLIERS.indexOf(m)] + "33", color: BUCKET_COLORS[BUCKET_MULTIPLIERS.indexOf(m)] }}>
                {m}x
              </div>
            ))}
          </div>
        </div>

        <Button size="lg" className="w-full font-display font-black text-xl uppercase tracking-widest h-14 mt-auto btn-pulse"
          onClick={handleBet} disabled={placeBet.isPending}>
          Drop
        </Button>
      </div>
    </div>
  );
}
