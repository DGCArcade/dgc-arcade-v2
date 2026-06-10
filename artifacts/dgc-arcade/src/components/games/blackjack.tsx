import { useState, useEffect } from "react";
import { Game } from "@workspace/api-client-react/src/generated/api.schemas";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Card { suit: string; rank: string }
type Status = "idle"|"active"|"player_blackjack"|"player_wins"|"dealer_wins"|"push"|"player_bust";

function getToken() { return localStorage.getItem("dgc_token"); }
function authHeaders() { return { "Content-Type":"application/json", Authorization:`Bearer ${getToken()}` }; }

function cardColor(suit: string) { return suit==="♥"||suit==="♦" ? "#FF4444" : "#fff"; }
function cardBg(suit: string) { return suit==="♥"||suit==="♦" ? "#1a0000" : "#000"; }

function handTotal(hand: Card[]): number {
  let t=0,a=0;
  for(const c of hand){
    const v=["J","Q","K"].includes(c.rank)?10:c.rank==="A"?11:parseInt(c.rank);
    if(v===11)a++;
    t+=v;
  }
  while(t>21&&a>0){t-=10;a--;}
  return t;
}

function PlayingCard({ card, hidden, animate }: { card: Card; hidden?: boolean; animate?: boolean }) {
  if (hidden) return (
    <div className={`w-16 h-24 rounded-lg border-2 border-border/60 bg-card flex items-center justify-center ${animate?"card-deal":""}`}>
      <div className="w-10 h-16 rounded border border-primary/20 grid grid-cols-3 gap-0.5 p-0.5">
        {Array.from({length:9},(_,i)=><div key={i} className="rounded-sm bg-primary/20"/>)}
      </div>
    </div>
  );
  return (
    <div className={`w-16 h-24 rounded-lg border-2 border-border/40 bg-white flex flex-col p-1.5 select-none ${animate?"card-deal":""}`}
      style={{ background: "#fff" }}>
      <div className="text-sm font-black leading-none" style={{ color: cardColor(card.suit) }}>{card.rank}</div>
      <div className="text-sm leading-none" style={{ color: cardColor(card.suit) }}>{card.suit}</div>
      <div className="flex-1 flex items-center justify-center text-2xl leading-none" style={{ color: cardColor(card.suit) }}>
        {card.suit}
      </div>
      <div className="text-sm font-black leading-none self-end rotate-180" style={{ color: cardColor(card.suit) }}>{card.rank}</div>
    </div>
  );
}

interface BlackjackProps { game: Game }

export function Blackjack({ game }: BlackjackProps) {
  const { user, requireAuth } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState<number>(game.minBet);
  const [handId, setHandId] = useState<number|null>(null);
  const [playerHand, setPlayerHand] = useState<Card[]>([]);
  const [dealerHand, setDealerHand] = useState<Card[]>([]);
  const [playerTotal, setPlayerTotal] = useState(0);
  const [dealerTotal, setDealerTotal] = useState<number|null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [payout, setPayout] = useState(0);
  const [loading, setLoading] = useState(false);
  const [newCards, setNewCards] = useState<number[]>([]);

  const isActive = status === "active";
  const isDone = !["idle","active"].includes(status);

  useEffect(() => {
    // Check for active hand on mount
    fetch("/api/blackjack/current", { headers: authHeaders() })
      .then(r=>r.json())
      .then(d=>{
        if(d&&d.handId){
          setHandId(d.handId);
          setPlayerHand(d.playerHand);
          setDealerHand(d.dealerHand);
          setPlayerTotal(d.playerTotal);
          setStatus(d.status);
        }
      }).catch(()=>{});
  }, []);

  const deal = () => {
    requireAuth(async () => {
      if(!user||amount>user.balance){
        toast({title:"Insufficient balance",variant:"destructive"});return;
      }
      setLoading(true);
      try {
        const r = await fetch("/api/blackjack/deal",{method:"POST",headers:authHeaders(),body:JSON.stringify({gameId:game.id,amount})});
        const d = await r.json();
        if(!r.ok){toast({title:`Error ${r.status}: ${d.error??JSON.stringify(d)}`,variant:"destructive"});return;}
        setHandId(d.handId);
        setPlayerHand(d.playerHand);
        setDealerHand(d.dealerHand);
        setPlayerTotal(d.playerTotal);
        setStatus(d.status);
        setNewCards([0,1,2,3]);
        setPayout(0);
        queryClient.invalidateQueries({queryKey:getGetMeQueryKey()});
        if(d.status==="player_blackjack"){
          toast({title:"BLACKJACK! 🃏",description:`Payout: ${formatCurrency(d.bet*2.5)}`,className:"bg-yellow-500 text-black"});
        }
      } catch(e:any) { toast({title:`Deal failed: ${e?.message??String(e)}`,variant:"destructive"}); } finally { setLoading(false); }
    });
  };

  const action = async (act: "hit"|"stand"|"double") => {
    if(!handId)return;
    setLoading(true);
    setNewCards([]);
    try {
      const r = await fetch("/api/blackjack/action",{method:"POST",headers:authHeaders(),body:JSON.stringify({handId,action:act})});
      const d = await r.json();
      if(!r.ok){toast({title:`Error ${r.status}: ${d.error??JSON.stringify(d)}`,variant:"destructive"});return;}
      setPlayerHand(d.playerHand);
      setDealerHand(d.dealerHand);
      setPlayerTotal(d.playerTotal);
      setDealerTotal(d.dealerTotal);
      setStatus(d.status as Status);
      setPayout(d.payout);
      if(act==="hit") setNewCards([d.playerHand.length-1]);
      queryClient.invalidateQueries({queryKey:getGetMeQueryKey()});
      if(d.status==="player_wins") toast({title:"You Win! 🎉",description:`+${formatCurrency(d.payout)}`,className:"bg-green-500 text-white"});
      else if(d.status==="push") toast({title:"Push — Tie game",description:"Your bet returned."});
    } catch(e:any) { toast({title:`Deal failed: ${e?.message??String(e)}`,variant:"destructive"}); } finally { setLoading(false); }
  };

  const reset = () => {
    setHandId(null);setPlayerHand([]);setDealerHand([]);
    setPlayerTotal(0);setDealerTotal(null);setStatus("idle");setPayout(0);
  };

  const resultColors: Record<string,string> = {
    player_wins:"text-green-400",player_blackjack:"text-yellow-400",
    dealer_wins:"text-red-400",push:"text-muted-foreground",player_bust:"text-red-400",
  };
  const resultLabels: Record<string,string> = {
    player_wins:"You Win! 🎉",player_blackjack:"BLACKJACK! 🃏",
    dealer_wins:"Dealer Wins",push:"Push — Tie",player_bust:"Bust!",
  };

  return (
    <div className="flex flex-col md:flex-row gap-8">
      {/* Game Area */}
      <div className="flex-1 bg-secondary border border-border rounded-xl p-6 flex flex-col items-center min-h-[440px] relative overflow-hidden">
        {/* Green felt */}
        <div className="absolute inset-0 bg-[#002211] opacity-60 rounded-xl"/>
        <div className="absolute inset-0 rounded-xl border-[6px] border-[#003322] opacity-30"/>
        <div className="relative w-full flex flex-col items-center gap-6">

          {/* Dealer hand */}
          <div className="text-center">
            <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
              Dealer {dealerTotal ? `(${dealerTotal})` : ""}
            </div>
            <div className="flex gap-2 justify-center flex-wrap">
              {status === "idle" ? (
                <div className="w-16 h-24 rounded-lg border border-border/30 bg-secondary/40 flex items-center justify-center text-muted-foreground/30 text-xs">Cards</div>
              ) : (
                dealerHand.map((c,i)=>(
                  <PlayingCard key={i} card={c} hidden={c.suit==="?"} animate={newCards.includes(i)} />
                ))
              )}
            </div>
          </div>

          {/* VS divider */}
          <div className="flex items-center gap-3 w-full max-w-xs">
            <div className="flex-1 h-px bg-border/40"/>
            <span className="text-xs text-muted-foreground/50 uppercase tracking-widest">vs</span>
            <div className="flex-1 h-px bg-border/40"/>
          </div>

          {/* Player hand */}
          <div className="text-center">
            <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
              You {playerTotal > 0 ? `(${playerTotal})` : ""}
            </div>
            <div className="flex gap-2 justify-center flex-wrap">
              {status === "idle" ? (
                <div className="w-16 h-24 rounded-lg border border-border/30 bg-secondary/40 flex items-center justify-center text-muted-foreground/30 text-xs">Cards</div>
              ) : (
                playerHand.map((c,i)=>(
                  <PlayingCard key={i} card={c} animate={newCards.includes(i)} />
                ))
              )}
            </div>
          </div>

          {/* Result */}
          {isDone && (
            <div className="text-center space-y-1">
              <div className={`font-display font-black text-2xl uppercase tracking-widest ${resultColors[status]||""}`}>
                {resultLabels[status]||status}
              </div>
              {payout > 0 && <div className="text-sm font-mono text-green-400">+{formatCurrency(payout)}</div>}
            </div>
          )}

          {/* Action buttons */}
          {isActive && (
            <div className="flex gap-3 mt-2">
              <Button onClick={()=>action("hit")} disabled={loading} className="font-bold uppercase tracking-wider min-w-[80px] bg-green-600 hover:bg-green-700">Hit</Button>
              <Button onClick={()=>action("stand")} disabled={loading} className="font-bold uppercase tracking-wider min-w-[80px] bg-red-700 hover:bg-red-800">Stand</Button>
              {playerHand.length===2 && user && parseFloat(String(user.balance))>=(amount) && (
                <Button onClick={()=>action("double")} disabled={loading} variant="outline" className="font-bold uppercase tracking-wider min-w-[80px]">Double</Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bet Controls */}
      <div className="w-full md:w-80 bg-card border border-border rounded-xl p-6 flex flex-col gap-6">
        <div className="space-y-4">
          <div>
            <Label className="text-muted-foreground uppercase text-xs font-bold tracking-wider">Bet Amount</Label>
            <div className="relative mt-2">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</div>
              <Input type="number" value={amount} onChange={e=>setAmount(Number(e.target.value))}
                min={game.minBet} max={game.maxBet} className="pl-8 font-mono text-lg bg-secondary border-border" disabled={status==="active"}/>
            </div>
            <div className="flex gap-2 mt-2">
              {["MIN","x2","/2","MAX"].map((l,i)=>(
                <Button key={l} variant="outline" size="sm" className="flex-1 text-xs h-7 bg-secondary" disabled={status==="active"}
                  onClick={()=>{
                    if(i===0)setAmount(game.minBet);
                    if(i===1)setAmount(Math.min(amount*2,game.maxBet));
                    if(i===2)setAmount(Math.max(game.minBet,amount/2));
                    if(i===3)setAmount(Math.min(user?.balance||0,game.maxBet));
                  }}>
                  {l}
                </Button>
              ))}
            </div>
          </div>
          {/* Game info */}
          <div className="bg-secondary/50 rounded-lg p-3 space-y-1.5 text-xs font-mono text-muted-foreground border border-border/40">
            <div className="flex justify-between"><span>Blackjack pays</span><span className="text-primary font-bold">3:2 (2.5x)</span></div>
            <div className="flex justify-between"><span>Win pays</span><span className="text-foreground">2:1</span></div>
            <div className="flex justify-between"><span>Dealer stands on</span><span className="text-foreground">17+</span></div>
          </div>
        </div>

        {status === "idle" ? (
          <Button size="lg" className="w-full font-display font-black text-xl uppercase tracking-widest h-14 mt-auto" onClick={deal} disabled={loading}>
            {loading?"Dealing...":"Deal"}
          </Button>
        ) : isDone ? (
          <Button size="lg" className="w-full font-display font-black text-xl uppercase tracking-widest h-14 mt-auto" onClick={reset}>
            New Hand
          </Button>
        ) : null}
      </div>
    </div>
  );
}
