import { useState, useRef, useId } from "react";
import { Game } from "@workspace/api-client-react";
import { usePlaceBet, getGetMeQueryKey, getListRecentBetsAllQueryKey, getListBetsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const RED_NUMS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const ORDER = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];

type BetType = "number"|"color"|"evenodd"|"dozen"|"half";
interface BetSelection { betType: BetType; betValue: string|number }

interface RouletteProps { game: Game }

export function Roulette({ game }: RouletteProps) {
  const { user, requireAuth } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const placeBet = usePlaceBet();
  const wheelRef = useRef<SVGGElement>(null);
  const isMobile = useIsMobile();
  const clipId = useId().replace(/:/g, "");

  const [amount, setAmount] = useState<number>(game.minBet);
  const [bet, setBet] = useState<BetSelection>({ betType: "color", betValue: "red" });
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<number|null>(null);
  const [win, setWin] = useState<boolean|null>(null);
  const [payout, setPayout] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [ballRotation, setBallRotation] = useState(0);

  const isRed = (n: number) => RED_NUMS.has(n);

  const handleBet = () => {
    requireAuth(() => {
      if (!user || amount > user.balance) { toast({ title:"Insufficient balance", variant:"destructive" }); return; }
      setSpinning(true);
      setResult(null);
      setWin(null);

      placeBet.mutate({ data: { gameId: game.id, amount, meta: { betType: bet.betType, betValue: bet.betValue } } }, {
        onSuccess: (data) => {
          const pocket = (data.bet.meta as Record<string,unknown>)?.pocket as number ?? 0;
          const idx = ORDER.indexOf(pocket);
          const sectorDeg = 360 / 37;
          const targetAngle = idx * sectorDeg;
          const currentActualRotation = rotation % 360;
          const targetFinalAngle = (360 - targetAngle) % 360;
          const extraRotation = (targetFinalAngle - currentActualRotation + 360) % 360;
          const wheelDelta = 1800 + extraRotation;
          const newRot = rotation + wheelDelta;
          setRotation(newRot);
          setBallRotation(prev => prev - wheelDelta * 1.2);

          setTimeout(() => {
            setSpinning(false);
            setResult(pocket);
            setWin(data.won);
            setPayout(data.payout);
            setBallRotation(prev => {
              const mod = ((prev % 360) + 360) % 360;
              return prev - mod;
            });
            qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
            qc.invalidateQueries({ queryKey: getListRecentBetsAllQueryKey() });
            qc.invalidateQueries({ queryKey: getListBetsQueryKey() });
            if (data.won) toast({ title: `Win! +${formatCurrency(data.payout)}`, className: "bg-green-500 text-white" });
          }, 4000);
        },
        onError: (err) => {
          setSpinning(false);
          toast({ title: "Bet Failed", description: err.data?.error, variant: "destructive" });
        }
      });
    });
  };

  const pockets = ORDER;
  const r = 90, cx = 110, cy = 110;
  const n = pockets.length;

  const wheelSvg = (
    <svg viewBox="0 0 220 220" className="roulette-wheel-svg drop-shadow-2xl" preserveAspectRatio="xMidYMid meet">
      <defs>
        <clipPath id={`roulette-clip-${clipId}`}>
          <circle cx={cx} cy={cy} r={r + 6} />
        </clipPath>
      </defs>
      <circle cx={cx} cy={cy} r={r + 14} fill="#1a0a00" stroke="#CC8800" strokeWidth="4"/>
      <g clipPath={`url(#roulette-clip-${clipId})`}>
        <g ref={wheelRef}
          className="roulette-wheel-spin"
          style={{
            transform: `rotate(${rotation}deg)`,
            transformOrigin: `${cx}px ${cy}px`,
            transition: spinning ? `transform 4s cubic-bezier(0.17,0.67,0.35,1)` : "none",
          }}>
          {pockets.map((num, i) => {
            const startAngle = (i / n) * 2 * Math.PI - Math.PI / 2;
            const endAngle = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2;
            const x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle);
            const x2 = cx + r * Math.cos(endAngle),   y2 = cy + r * Math.sin(endAngle);
            const fill = num === 0 ? "#00AA44" : isRed(num) ? "#CC1111" : "#111";
            const midAngle = (startAngle + endAngle) / 2;
            const tx = cx + (r - 14) * Math.cos(midAngle), ty = cy + (r - 14) * Math.sin(midAngle);
            return (
              <g key={i}>
                <path d={`M${cx},${cy} L${x1},${y1} A${r},${r} 0 0,1 ${x2},${y2} Z`}
                  fill={fill} stroke="#333" strokeWidth="0.5"/>
                <text x={tx} y={ty} textAnchor="middle" dominantBaseline="middle"
                  fontSize="5" fontWeight="bold" fill="white" transform={`rotate(${(startAngle+endAngle)/2*180/Math.PI+90},${tx},${ty})`}>
                  {num}
                </text>
              </g>
            );
          })}
          <circle cx={cx} cy={cy} r="18" fill="#CC8800" stroke="#FFD700" strokeWidth="2"/>
          <circle cx={cx} cy={cy} r="8" fill="#111"/>
        </g>
      </g>
      <g className="roulette-ball-orbit" style={{
        transform: `rotate(${ballRotation}deg)`,
        transformOrigin: `${cx}px ${cy}px`,
        transition: spinning ? `transform 4s cubic-bezier(0.17,0.67,0.35,1)` : "none",
      }}>
        <circle cx={cx} cy={cy - r + 8} r="5" fill="white" stroke="#ccc" strokeWidth="1.2"
          style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.6))" }}/>
      </g>
      <polygon className="roulette-pointer" points={`${cx},${cy - r - 4} ${cx - 5},${cy - r + 10} ${cx + 5},${cy - r + 10}`} fill="#FFD700"/>
    </svg>
  );

  return (
    <div className={isMobile ? "roulette-game-root roulette-game-root--mobile flex flex-row" : "roulette-game-root flex flex-col md:flex-row gap-8"}>
      <style>{`
        .roulette-wheel-svg { width: 100%; height: 100%; max-width: 220px; max-height: 220px; overflow: visible; }
        .roulette-wheel-spin,
        .roulette-ball-orbit {
          transform-box: fill-box;
        }

        @media (min-width: 768px) and (max-width: 1024px) {
          .roulette-game-root:not(.roulette-game-root--mobile) { flex-direction: column-reverse !important; gap: 12px !important; }
        }

        .roulette-game-root--mobile {
          flex-direction: row !important;
          align-items: stretch !important;
          height: 100% !important;
          gap: 4px !important;
          padding: 0 !important;
        }
        .roulette-game-root--mobile .roulette-wheel-area {
          flex: 1 1 52% !important;
          min-width: 0 !important;
          min-height: 0 !important;
          padding: 4px !important;
          border-radius: 10px !important;
        }
        .roulette-game-root--mobile .roulette-wheel-wrap {
          width: 100% !important;
          height: 100% !important;
          max-height: 100% !important;
        }
        .roulette-game-root--mobile .roulette-wheel-svg {
          max-width: min(100%, 180px) !important;
          max-height: min(100%, 180px) !important;
        }
        .roulette-game-root--mobile .roulette-result-badge {
          width: 36px !important;
          height: 36px !important;
          font-size: 14px !important;
        }
        .roulette-game-root--mobile .roulette-status-text {
          font-size: 10px !important;
          margin-top: 2px !important;
        }
        .roulette-game-root--mobile .roulette-bet-panel {
          flex: 0 0 46% !important;
          width: 46% !important;
          max-width: 46% !important;
          min-width: 0 !important;
          padding: 6px !important;
          gap: 5px !important;
          overflow-x: hidden !important;
          overflow-y: auto !important;
          -webkit-overflow-scrolling: touch;
        }
        .roulette-game-root--mobile .roulette-bet-panel label {
          font-size: 9px !important;
        }
        .roulette-game-root--mobile .roulette-bet-panel input {
          font-size: 12px !important;
          height: 32px !important;
          padding: 4px 4px 4px 22px !important;
        }
        .roulette-game-root--mobile .roulette-quick-btn {
          height: 28px !important;
          min-height: 28px !important;
          font-size: 9px !important;
          padding: 0 2px !important;
        }
        .roulette-game-root--mobile .roulette-type-btn {
          height: 30px !important;
          min-height: 30px !important;
          font-size: 9px !important;
          padding: 0 4px !important;
        }
        .roulette-game-root--mobile .roulette-spin-btn {
          height: 36px !important;
          min-height: 36px !important;
          font-size: 11px !important;
          margin-top: 4px !important;
        }
        .roulette-game-root--mobile .roulette-number-picker {
          max-height: 88px !important;
          overflow-y: auto !important;
          -webkit-overflow-scrolling: touch;
        }
        .roulette-game-root--mobile .roulette-number-picker button {
          width: 22px !important;
          height: 22px !important;
          min-height: 22px !important;
          font-size: 8px !important;
        }
        .roulette-game-root--mobile .roulette-pf-panel { display: none !important; }
      `}</style>

      {/* Wheel */}
      <div className="roulette-wheel-area flex-1 bg-secondary border border-border rounded-xl p-4 md:p-6 flex flex-col items-center justify-center min-h-[240px] md:min-h-[440px]">
        <div className="roulette-wheel-wrap relative w-full h-full flex items-center justify-center min-h-0">
          {wheelSvg}
          {result !== null && !spinning && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className={`roulette-result-badge w-14 h-14 rounded-full flex items-center justify-center font-mono font-black text-xl shadow-lg border-2 ${
                result === 0 ? "bg-green-600 border-green-400 text-white" :
                isRed(result) ? "bg-red-600 border-red-400 text-white" : "bg-zinc-900 border-zinc-500 text-white"
              }`}>{result}</div>
            </div>
          )}
        </div>

        {win !== null && !spinning && !isMobile && (
          <div className={`roulette-status-text mt-4 font-display font-black text-2xl uppercase tracking-widest ${win ? "text-green-400" : "text-muted-foreground"}`}>
            {win ? `+${formatCurrency(payout)}` : "No Win"}
          </div>
        )}
        {spinning && !isMobile && <div className="roulette-status-text mt-4 text-sm text-muted-foreground font-mono animate-pulse">Spinning…</div>}
      </div>

      {/* Bet Controls */}
      <div className="roulette-bet-panel w-full md:w-80 bg-card border border-border rounded-xl p-6 flex flex-col gap-5">
        <div>
          <Label className="text-muted-foreground uppercase text-xs font-bold tracking-wider">Bet Amount</Label>
          <div className="relative mt-2">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</span>
            <Input type="number" value={amount} onChange={e=>setAmount(Number(e.target.value))} min={game.minBet} max={game.maxBet} className="pl-8 font-mono bg-secondary" disabled={spinning}/>
          </div>
          <div className="flex gap-2 mt-2">
            {["MIN","x2","/2","MAX"].map((l,i)=>(
              <Button key={l} variant="outline" size="sm" className="roulette-quick-btn flex-1 text-xs h-7 bg-secondary" disabled={spinning}
                onClick={()=>{if(i===0)setAmount(game.minBet);if(i===1)setAmount(Math.min(amount*2,game.maxBet));if(i===2)setAmount(Math.max(game.minBet,amount/2));if(i===3)setAmount(Math.min(user?.balance||0,game.maxBet));}}>{l}</Button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <Label className="text-muted-foreground uppercase text-xs font-bold tracking-wider">Bet Type</Label>
          <div className="grid grid-cols-3 gap-2">
            {[{v:"red",l:"Red",col:"bg-red-700"},{v:"black",l:"Black",col:"bg-zinc-800"},{v:"green",l:"Zero",col:"bg-green-700"}].map(b=>(
              <Button key={b.v} variant="outline" size="sm"
                className={`roulette-type-btn font-bold uppercase text-xs h-10 ${bet.betType==="color"&&bet.betValue===b.v ? "border-primary bg-primary/10":"bg-secondary"}`}
                onClick={()=>setBet({betType:"color",betValue:b.v})} disabled={spinning}>
                <span className={`w-3 h-3 rounded-full mr-1.5 ${b.col}`}/>
                {isMobile ? b.l.charAt(0) : b.l}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {["even","odd"].map(v=>(
              <Button key={v} variant="outline" size="sm"
                className={`roulette-type-btn font-bold uppercase text-xs h-9 ${bet.betType==="evenodd"&&bet.betValue===v?"border-primary bg-primary/10":"bg-secondary"}`}
                onClick={()=>setBet({betType:"evenodd",betValue:v})} disabled={spinning}>
                {v}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[{v:"low",l:"1-18"},{v:"high",l:"19-36"}].map(b=>(
              <Button key={b.v} variant="outline" size="sm"
                className={`roulette-type-btn font-bold uppercase text-xs h-9 ${bet.betType==="half"&&bet.betValue===b.v?"border-primary bg-primary/10":"bg-secondary"}`}
                onClick={()=>setBet({betType:"half",betValue:b.v})} disabled={spinning}>
                {b.l}
              </Button>
            ))}
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1.5">Pick a number (35x)</div>
            <div className="roulette-number-picker grid grid-cols-7 gap-1 max-h-36 overflow-y-auto">
              {[0,...Array.from({length:36},(_,i)=>i+1)].map(num=>(
                <button key={num} type="button" onClick={()=>setBet({betType:"number",betValue:num})} disabled={spinning}
                  className={`w-8 h-7 rounded text-xs font-bold transition-all ${
                    bet.betType==="number"&&bet.betValue===num ? "ring-2 ring-primary scale-110" :
                    num===0 ? "bg-green-800 hover:bg-green-700 text-white" :
                    isRed(num) ? "bg-red-800 hover:bg-red-700 text-white" : "bg-zinc-800 hover:bg-zinc-700 text-white"
                  }`}>
                  {num}
                </button>
              ))}
            </div>
          </div>
        </div>

        <Button size="lg" className="roulette-spin-btn w-full font-display font-black text-xl uppercase tracking-widest h-14 mt-auto"
          onClick={handleBet} disabled={spinning||placeBet.isPending}>
          {spinning ? "Spinning…" : "Spin"}
        </Button>

        {placeBet.data?.bet && (
          <div className="roulette-pf-panel mt-4 pt-4 border-t border-border/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Provably Fair</span>
              <a 
                href={`/api/bets/verify/${placeBet.data.bet.id}`} 
                target="_blank" 
                rel="noreferrer"
                className="text-[10px] text-primary hover:underline font-bold"
              >
                Verify SHA-256
              </a>
            </div>
            <div className="space-y-1.5">
              <div className="flex flex-col gap-0.5">
                <span className="text-[9px] text-muted-foreground uppercase">Server Seed Hash</span>
                <code className="text-[10px] bg-secondary p-1 rounded truncate block">
                  {placeBet.data.bet.serverSeedHash}
                </code>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] text-muted-foreground uppercase">Client Seed</span>
                  <code className="text-[10px] bg-secondary p-1 rounded truncate block">
                    {placeBet.data.bet.clientSeed}
                  </code>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] text-muted-foreground uppercase">Nonce</span>
                  <code className="text-[10px] bg-secondary p-1 rounded block">
                    {placeBet.data.bet.nonce}
                  </code>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
