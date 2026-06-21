import { useState, useEffect } from "react";
import { Game } from "@workspace/api-client-react";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function getToken() { return localStorage.getItem("dgc_token"); }
function authHeaders() { return { "Content-Type":"application/json", Authorization:`Bearer ${getToken()}` }; }

interface MinesProps { game: Game }

export function Mines({ game }: MinesProps) {
  const { user, requireAuth } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [amount, setAmount] = useState<number>(game.minBet);
  const [mineCount, setMineCount] = useState(5);
  const [sessionId, setSessionId] = useState<number|null>(null);
  const [revealed, setRevealed] = useState<number[]>([]);
  const [minePositions, setMinePositions] = useState<number[]>([]);
  const [bustedAt, setBustedAt] = useState<number|null>(null);
  const [currentMultiplier, setCurrentMultiplier] = useState(1);
  const [nextMultiplier, setNextMultiplier] = useState(1);
  const [status, setStatus] = useState<"idle"|"active"|"busted"|"cashed_out">("idle");
  const [loading, setLoading] = useState(false);
  const [payout, setPayout] = useState(0);
  const [lastCell, setLastCell] = useState<number|null>(null);

  useEffect(() => {
    fetch("/api/mines/current", { headers: authHeaders() })
      .then(r=>r.json())
      .then(d => {
        if (d && d.sessionId) {
          setSessionId(d.sessionId);
          setRevealed(d.revealed);
          setCurrentMultiplier(d.currentMultiplier);
          setNextMultiplier(d.nextMultiplier);
          setMineCount(d.mineCount);
          setAmount(d.bet);
          setStatus("active");
        }
      }).catch(()=>{});
  }, []);

  const start = () => {
    requireAuth(async () => {
      if (!user || amount > user.balance) { toast({ title:"Insufficient balance", variant:"destructive" }); return; }
      setLoading(true);
      try {
        const r = await fetch("/api/mines/start", { method:"POST", headers:authHeaders(), body:JSON.stringify({gameId:game.id,amount,mineCount}) });
        const d = await r.json();
        if (!r.ok) { toast({ title:d.error, variant:"destructive" }); return; }
        setSessionId(d.sessionId);
        setRevealed([]);
        setMinePositions([]);
        setBustedAt(null);
        setCurrentMultiplier(1);
        setNextMultiplier(d.nextMultiplier);
        setPayout(0);
        setStatus("active");
        qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
      } finally { setLoading(false); }
    });
  };

  const reveal = async (cell: number) => {
    if (status !== "active" || revealed.includes(cell) || !sessionId) return;
    setLoading(true);
    setLastCell(cell);
    try {
      const r = await fetch("/api/mines/reveal", { method:"POST", headers:authHeaders(), body:JSON.stringify({sessionId,cell}) });
      const d = await r.json();
      if (!r.ok) { toast({ title:d.error, variant:"destructive" }); return; }
      setRevealed(d.revealed);
      if (d.hit) {
        setBustedAt(cell);
        setMinePositions(d.minePositions);
        setStatus("busted");
        qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
        toast({ title: "BOOM! 💣", description: "You hit a mine!", variant: "destructive" });
      } else {
        setCurrentMultiplier(d.currentMultiplier);
        setNextMultiplier(d.nextMultiplier);
      }
    } finally { setLoading(false); }
  };

  const cashout = async () => {
    if (!sessionId || status !== "active" || revealed.length === 0) return;
    setLoading(true);
    try {
      const r = await fetch("/api/mines/cashout", { method:"POST", headers:authHeaders(), body:JSON.stringify({sessionId}) });
      const d = await r.json();
      if (!r.ok) { toast({ title:d.error, variant:"destructive" }); return; }
      setMinePositions(d.minePositions);
      setStatus("cashed_out");
      setPayout(d.payout);
      qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast({ title:`Cashed out! +${formatCurrency(d.payout)}`,className:"bg-green-500 text-white" });
    } finally { setLoading(false); }
  };

  const reset = () => {
    setSessionId(null);setRevealed([]);setMinePositions([]);setBustedAt(null);
    setCurrentMultiplier(1);setNextMultiplier(1);setPayout(0);setStatus("idle");setLastCell(null);
  };

  const isActive = status === "active";
  const isDone = status === "busted" || status === "cashed_out";

  return (
    <div className="flex flex-col md:flex-row gap-8">
      {/* Grid */}
      <div className="flex-1 bg-secondary border border-border rounded-xl p-6 flex flex-col items-center justify-center min-h-[440px] gap-4">
        <div className="grid grid-cols-5 gap-2 w-full max-w-xs">
          {Array.from({length:25},(_,i)=>{
            const isRevealed = revealed.includes(i);
            const isMine = minePositions.includes(i);
            const isBustedCell = bustedAt === i;
            const isLastGem = lastCell === i && isRevealed && !isMine && isActive;
            return (
              <button
                key={i}
                onClick={()=>reveal(i)}
                disabled={!isActive||isRevealed||loading}
                className={`aspect-square rounded-xl border-2 text-2xl flex items-center justify-center transition-all duration-200 font-bold ${
                  isBustedCell ? "border-red-500 bg-red-900/50 scale-110" :
                  isMine && isDone ? "border-red-500/60 bg-red-900/30" :
                  isRevealed ? "border-green-500/60 bg-green-900/20 gem-reveal" :
                  isActive ? "border-border/60 bg-secondary/60 hover:border-primary/60 hover:bg-primary/10 hover:scale-105 cursor-pointer" :
                  "border-border/30 bg-secondary/30"
                }`}
              >
                {isBustedCell ? "💣" : isMine && isDone ? "💣" : isRevealed ? "💎" : isActive ? "?" : ""}
              </button>
            );
          })}
        </div>

        {isActive && revealed.length > 0 && (
          <div className="text-center space-y-1">
            <div className="text-3xl font-mono font-black text-primary">{currentMultiplier.toFixed(2)}x</div>
            <div className="text-xs text-muted-foreground">Next: {nextMultiplier.toFixed(2)}x</div>
          </div>
        )}

        {isDone && (
          <div className={`text-2xl font-display font-black uppercase tracking-widest ${status==="cashed_out"?"text-green-400":"text-red-400"}`}>
            {status === "cashed_out" ? `+${formatCurrency(payout)}` : "BUSTED!"}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="w-full md:w-80 bg-card border border-border rounded-xl p-6 flex flex-col gap-5">
        <div className="space-y-4">
          <div>
            <Label className="text-muted-foreground uppercase text-xs font-bold tracking-wider">Bet Amount</Label>
            <div className="relative mt-2">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</span>
              <Input type="number" value={amount} onChange={e=>setAmount(Number(e.target.value))} min={game.minBet} max={game.maxBet} className="pl-8 font-mono bg-secondary" disabled={isActive}/>
            </div>
          </div>

          <div>
            <Label className="text-muted-foreground uppercase text-xs font-bold tracking-wider">Mines: {mineCount}</Label>
            <input type="range" min={1} max={24} value={mineCount}
              onChange={e=>setMineCount(Number(e.target.value))}
              className="w-full mt-2 accent-primary" disabled={isActive}/>
            <div className="flex justify-between text-xs text-muted-foreground font-mono mt-1">
              <span>1 mine</span><span>Safe: {25-mineCount}</span><span>24 mines</span>
            </div>
          </div>

          {isActive && (
            <div className="bg-secondary/50 rounded-lg p-3 text-xs border border-border/40 space-y-1.5">
              <div className="flex justify-between font-mono">
                <span className="text-muted-foreground">Current</span>
                <span className="text-primary font-bold">{currentMultiplier.toFixed(2)}x</span>
              </div>
              <div className="flex justify-between font-mono">
                <span className="text-muted-foreground">Profit</span>
                <span className="text-green-400 font-bold">+{formatCurrency(amount*currentMultiplier-amount)}</span>
              </div>
              <div className="flex justify-between font-mono">
                <span className="text-muted-foreground">Cells safe</span>
                <span className="text-foreground">{25-mineCount-revealed.length} left</span>
              </div>
            </div>
          )}
        </div>

        {status === "idle" ? (
          <Button size="lg" className="w-full font-display font-black text-xl uppercase tracking-widest h-14 mt-auto" onClick={start} disabled={loading}>
            {loading?"Starting…":"Place Bet"}
          </Button>
        ) : isActive ? (
          <div className="space-y-2 mt-auto">
            <Button size="lg" variant="outline" className="w-full font-bold uppercase tracking-widest h-12 border-green-500 text-green-400 hover:bg-green-500/10"
              onClick={cashout} disabled={loading||revealed.length===0}>
              Cash Out {revealed.length>0?`(${currentMultiplier.toFixed(2)}x)`:""}
            </Button>
          </div>
        ) : isDone ? (
          <Button size="lg" className="w-full font-display font-black text-xl uppercase tracking-widest h-14 mt-auto" onClick={reset}>
            New Game
          </Button>
        ) : null}
      </div>
    </div>
  );
}
