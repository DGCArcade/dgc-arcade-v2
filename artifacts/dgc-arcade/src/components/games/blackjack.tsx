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

function handTotal(hand: Card[]): number {
  let t=0,a=0;
  for(const c of hand){
    const v=["J","Q","K"].includes(c.rank)?10:c.rank==="A"?11:parseInt(c.rank);
    if(v===11)a++;t+=v;
  }
  while(t>21&&a>0){t-=10;a--;}
  return t;
}

function PlayingCard({ card, hidden, delay=0 }: { card:Card; hidden?:boolean; delay?:number }) {
  const isRed = card.suit==="♥"||card.suit==="♦";
  const color = isRed ? "#dc2626" : "#0f172a";
  const cardBase: React.CSSProperties = {
    width:76, height:108, borderRadius:10, flexShrink:0,
    animation:"card-flip 0.38s cubic-bezier(0.25,0.46,0.45,0.94) both",
    animationDelay:`${delay}ms`,
    boxShadow:"0 6px 24px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.4)",
  };
  if (hidden) return (
    <div style={cardBase}>
      <div style={{
        width:"100%",height:"100%",borderRadius:10,
        background:"linear-gradient(140deg,#1e3a8a 0%,#1e1b4b 55%,#0c1445 100%)",
        border:"2px solid rgba(255,255,255,0.12)",
        display:"flex",alignItems:"center",justifyContent:"center",
        position:"relative",overflow:"hidden",
      }}>
        <div style={{
          position:"absolute",inset:0,
          backgroundImage:"repeating-linear-gradient(45deg,rgba(255,255,255,0.025) 0px,rgba(255,255,255,0.025) 1px,transparent 1px,transparent 9px)",
        }}/>
        <div style={{
          width:36,height:36,border:"2.5px solid rgba(255,255,255,0.18)",
          borderRadius:4,transform:"rotate(45deg)",background:"rgba(255,255,255,0.04)",
        }}/>
        <span style={{position:"absolute",fontSize:9,fontWeight:900,color:"rgba(255,255,255,0.18)",letterSpacing:3}}>DGC</span>
      </div>
    </div>
  );
  return (
    <div style={cardBase}>
      <div style={{
        width:"100%",height:"100%",borderRadius:10,
        background:"#ffffff",border:"2px solid #d1d5db",
        display:"flex",flexDirection:"column",padding:"5px 6px",
      }}>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-start",lineHeight:1,gap:1}}>
          <span style={{fontSize:17,fontWeight:900,color,lineHeight:1}}>{card.rank}</span>
          <span style={{fontSize:15,color,lineHeight:1}}>{card.suit}</span>
        </div>
        <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <span style={{fontSize:38,color,lineHeight:1}}>{card.suit}</span>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",lineHeight:1,gap:1,transform:"rotate(180deg)"}}>
          <span style={{fontSize:17,fontWeight:900,color,lineHeight:1}}>{card.rank}</span>
          <span style={{fontSize:15,color,lineHeight:1}}>{card.suit}</span>
        </div>
      </div>
    </div>
  );
}

function DeckPile() {
  return (
    <div style={{position:"relative",width:56,height:80}}>
      {[3,2,1,0].map(i=>(
        <div key={i} style={{
          position:"absolute",width:56,height:80,borderRadius:8,
          background:"linear-gradient(140deg,#1e3a8a,#0c1445)",
          border:"1.5px solid rgba(255,255,255,0.12)",
          top:i*-1.5,left:i*0.5,
          boxShadow:"0 2px 8px rgba(0,0,0,0.5)",
        }}/>
      ))}
      <div style={{
        position:"absolute",inset:0,borderRadius:8,
        display:"flex",alignItems:"center",justifyContent:"center",zIndex:5,
      }}>
        <span style={{fontSize:9,fontWeight:900,color:"rgba(255,255,255,0.25)",letterSpacing:2}}>DGC</span>
      </div>
    </div>
  );
}

function ScoreBadge({ total, bust }: { total:number; bust?:boolean }) {
  return (
    <span style={{
      background:"rgba(0,0,0,0.55)",border:"1px solid rgba(255,255,255,0.15)",
      borderRadius:20,padding:"2px 11px",fontSize:13,fontWeight:900,
      color: bust ? "#ef4444" : total===21 ? "#eab308" : "#fff",
    }}>{total}</span>
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
  const [dealKey, setDealKey] = useState(0);

  const isActive = status==="active";
  const isDone = !["idle","active"].includes(status);

  useEffect(()=>{
    fetch("/api/blackjack/current",{headers:authHeaders()})
      .then(r=>r.json())
      .then(d=>{
        if(d&&d.handId){
          setHandId(d.handId);setPlayerHand(d.playerHand);
          setDealerHand(d.dealerHand);setPlayerTotal(d.playerTotal);setStatus(d.status);
        }
      }).catch(()=>{});
  },[]);

  const deal = ()=>{
    requireAuth(async ()=>{
      if(!user||amount>user.balance){toast({title:"Insufficient balance",variant:"destructive"});return;}
      setLoading(true);
      try {
        const r=await fetch("/api/blackjack/deal",{method:"POST",headers:authHeaders(),body:JSON.stringify({gameId:game.id,amount})});
        const d=await r.json();
        if(!r.ok){toast({title:`Error ${r.status}: ${d.error??JSON.stringify(d)}`,variant:"destructive"});return;}
        setDealKey(k=>k+1);
        setHandId(d.handId);setPlayerHand(d.playerHand);setDealerHand(d.dealerHand);
        setPlayerTotal(d.playerTotal);setStatus(d.status);setPayout(0);
        queryClient.invalidateQueries({queryKey:getGetMeQueryKey()});
        if(d.status==="player_blackjack") toast({title:"BLACKJACK! 🃏",description:`Payout: ${formatCurrency(d.bet*2.5)}`,className:"bg-yellow-500 text-black"});
      } catch(e:any){toast({title:`Deal failed: ${e?.message??String(e)}`,variant:"destructive"});}
      finally{setLoading(false);}
    });
  };

  const action=async(act:"hit"|"stand"|"double")=>{
    if(!handId)return;
    setLoading(true);
    try {
      const r=await fetch("/api/blackjack/action",{method:"POST",headers:authHeaders(),body:JSON.stringify({handId,action:act})});
      const d=await r.json();
      if(!r.ok){toast({title:`Error ${r.status}: ${d.error??JSON.stringify(d)}`,variant:"destructive"});return;}
      setPlayerHand(d.playerHand);setDealerHand(d.dealerHand);
      setPlayerTotal(d.playerTotal);setDealerTotal(d.dealerTotal);
      setStatus(d.status as Status);setPayout(d.payout);
      queryClient.invalidateQueries({queryKey:getGetMeQueryKey()});
      if(d.status==="player_wins") toast({title:"You Win! 🎉",description:`+${formatCurrency(d.payout)}`,className:"bg-green-500 text-white"});
      else if(d.status==="push") toast({title:"Push — Tie game",description:"Your bet returned."});
    } catch(e:any){toast({title:`Action failed: ${e?.message??String(e)}`,variant:"destructive"});}
    finally{setLoading(false);}
  };

  const reset=()=>{
    setHandId(null);setPlayerHand([]);setDealerHand([]);
    setPlayerTotal(0);setDealerTotal(null);setStatus("idle");setPayout(0);
  };

  const resultCfg: Record<string,{label:string;color:string;glow:string}> = {
    player_wins:     {label:"You Win! 🎉",    color:"#22c55e",glow:"0 0 80px rgba(34,197,94,0.35)"},
    player_blackjack:{label:"BLACKJACK! 🃏",  color:"#eab308",glow:"0 0 80px rgba(234,179,8,0.45)"},
    dealer_wins:     {label:"Dealer Wins",    color:"#ef4444",glow:"0 0 80px rgba(239,68,68,0.35)"},
    push:            {label:"Push — Tie",     color:"#94a3b8",glow:"none"},
    player_bust:     {label:"Bust!",          color:"#ef4444",glow:"0 0 80px rgba(239,68,68,0.35)"},
  };
  const result = resultCfg[status];
  const shownDealerTotal = dealerTotal ?? (isDone && dealerHand.length>0 ? handTotal(dealerHand) : null);
  const emptyCard = (key:number)=>(
    <div key={key} style={{width:76,height:108,borderRadius:10,background:"rgba(255,255,255,0.04)",border:"2px dashed rgba(255,255,255,0.1)",flexShrink:0}}/>
  );

  return (
    <div className="flex flex-col md:flex-row gap-6">
      {/* TABLE */}
      <div style={{
        flex:1,minHeight:480,borderRadius:20,position:"relative",overflow:"hidden",
        background:"radial-gradient(ellipse at 50% 25%,#065f46 0%,#022c22 45%,#011a14 100%)",
        boxShadow: isDone&&result ? result.glow : "none",
        transition:"box-shadow 0.5s ease",
        display:"flex",flexDirection:"column",alignItems:"center",
        justifyContent:"space-between",padding:"24px 20px 20px",gap:8,
      }}>
        {/* Arc decorations */}
        <div style={{position:"absolute",bottom:-80,left:"50%",transform:"translateX(-50%)",width:"145%",height:220,border:"2px solid rgba(255,255,255,0.05)",borderRadius:"50%",pointerEvents:"none"}}/>
        <div style={{position:"absolute",bottom:-110,left:"50%",transform:"translateX(-50%)",width:"175%",height:280,border:"1px solid rgba(255,255,255,0.025)",borderRadius:"50%",pointerEvents:"none"}}/>

        {/* Deck top-right */}
        <div style={{position:"absolute",top:20,right:20,opacity:0.75}}>
          <DeckPile/>
        </div>

        {/* DEALER */}
        <div style={{position:"relative",zIndex:10,display:"flex",flexDirection:"column",alignItems:"center",gap:10,width:"100%"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,fontSize:11,fontWeight:700,letterSpacing:3,color:"rgba(255,255,255,0.45)",textTransform:"uppercase"}}>
            Dealer {shownDealerTotal&&<ScoreBadge total={shownDealerTotal} bust={shownDealerTotal>21}/>}
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap",minHeight:108}}>
            {status==="idle" ? <>{emptyCard(0)}{emptyCard(1)}</> :
              dealerHand.map((c,i)=><PlayingCard key={`${dealKey}-d${i}`} card={c} hidden={c.suit==="?"} delay={i*130}/>)}
          </div>
        </div>

        {/* VS */}
        <div style={{width:"100%",display:"flex",alignItems:"center",gap:12,zIndex:10,position:"relative"}}>
          <div style={{flex:1,height:1,background:"rgba(255,255,255,0.07)"}}/>
          <span style={{fontSize:10,fontWeight:700,letterSpacing:4,color:"rgba(255,255,255,0.18)",textTransform:"uppercase"}}>vs</span>
          <div style={{flex:1,height:1,background:"rgba(255,255,255,0.07)"}}/>
        </div>

        {/* PLAYER */}
        <div style={{position:"relative",zIndex:10,display:"flex",flexDirection:"column",alignItems:"center",gap:10,width:"100%"}}>
          <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap",minHeight:108}}>
            {status==="idle" ? <>{emptyCard(2)}{emptyCard(3)}</> :
              playerHand.map((c,i)=><PlayingCard key={`${dealKey}-p${i}`} card={c} delay={i*130+65}/>)}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,fontSize:11,fontWeight:700,letterSpacing:3,color:"rgba(255,255,255,0.45)",textTransform:"uppercase"}}>
            You {playerTotal>0&&<ScoreBadge total={playerTotal} bust={playerTotal>21}/>}
          </div>
        </div>

        {/* RESULT */}
        {isDone&&result&&(
          <div style={{position:"relative",zIndex:10,textAlign:"center"}}>
            <div style={{fontSize:30,fontWeight:900,textTransform:"uppercase",letterSpacing:4,color:result.color,textShadow:`0 0 30px ${result.color}`}}>{result.label}</div>
            {payout>0&&<div style={{fontSize:16,fontWeight:700,color:"#22c55e",marginTop:4}}>+{formatCurrency(payout)}</div>}
          </div>
        )}

        {/* ACTION BUTTONS */}
        {isActive&&(
          <div style={{position:"relative",zIndex:10,display:"flex",gap:12,marginTop:4}}>
            <button onClick={()=>action("hit")} disabled={loading} style={{padding:"13px 30px",borderRadius:12,fontWeight:900,fontSize:14,letterSpacing:2,textTransform:"uppercase",background:"linear-gradient(135deg,#16a34a,#15803d)",color:"#fff",border:"none",cursor:loading?"not-allowed":"pointer",boxShadow:"0 4px 18px rgba(22,163,74,0.45)",opacity:loading?0.7:1,transition:"all 0.15s"}}>Hit</button>
            <button onClick={()=>action("stand")} disabled={loading} style={{padding:"13px 30px",borderRadius:12,fontWeight:900,fontSize:14,letterSpacing:2,textTransform:"uppercase",background:"linear-gradient(135deg,#dc2626,#b91c1c)",color:"#fff",border:"none",cursor:loading?"not-allowed":"pointer",boxShadow:"0 4px 18px rgba(220,38,38,0.45)",opacity:loading?0.7:1,transition:"all 0.15s"}}>Stand</button>
            {playerHand.length===2&&user&&parseFloat(String(user.balance))>=amount&&(
              <button onClick={()=>action("double")} disabled={loading} style={{padding:"13px 26px",borderRadius:12,fontWeight:900,fontSize:14,letterSpacing:2,textTransform:"uppercase",background:"rgba(255,255,255,0.09)",color:"#fff",border:"1px solid rgba(255,255,255,0.2)",cursor:loading?"not-allowed":"pointer",boxShadow:"0 4px 14px rgba(0,0,0,0.3)",opacity:loading?0.7:1,transition:"all 0.15s"}}>2×</button>
            )}
          </div>
        )}
      </div>

      {/* BET PANEL */}
      <div className="w-full md:w-72 bg-card border border-border rounded-2xl p-5 flex flex-col gap-5">
        <div className="space-y-4">
          <div>
            <Label className="text-muted-foreground uppercase text-xs font-bold tracking-wider">Bet Amount</Label>
            <div className="relative mt-2">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm">$</div>
              <Input type="text" inputMode="decimal"
                value={amount===0?"":String(amount)}
                onChange={e=>{const v=e.target.value.replace(/[^0-9.]/g,"");if(v===""||v===".")setAmount(0);else{const n=parseFloat(v);if(!isNaN(n))setAmount(Math.min(n,game.maxBet));}}}
                onBlur={()=>{if(!amount||amount<game.minBet)setAmount(game.minBet);}}
                placeholder={String(game.minBet)}
                className="pl-8 font-mono text-lg bg-secondary border-border" disabled={status==="active"}/>
            </div>
            <div className="flex gap-2 mt-2">
              {["MIN","×2","½","MAX"].map((l,i)=>(
                <Button key={l} variant="outline" size="sm" className="flex-1 text-xs h-8 bg-secondary font-bold" disabled={status==="active"}
                  onClick={()=>{
                    if(i===0)setAmount(game.minBet);
                    if(i===1)setAmount(Math.min(amount*2,game.maxBet));
                    if(i===2)setAmount(Math.max(game.minBet,amount/2));
                    if(i===3)setAmount(Math.min(user?.balance??0,game.maxBet));
                  }}>{l}</Button>
              ))}
            </div>
          </div>
          <div className="bg-secondary/50 rounded-xl p-3 space-y-2 text-xs font-mono text-muted-foreground border border-border/40">
            <div className="flex justify-between"><span>Blackjack pays</span><span className="text-yellow-400 font-bold">3:2 (2.5×)</span></div>
            <div className="flex justify-between"><span>Win pays</span><span className="text-foreground">2:1</span></div>
            <div className="flex justify-between"><span>Dealer stands on</span><span className="text-foreground">17+</span></div>
            <div className="flex justify-between"><span>House edge</span><span className="text-green-400">0.02%</span></div>
          </div>
        </div>
        {status==="idle" ? (
          <Button size="lg" className="w-full font-display font-black text-xl uppercase tracking-widest h-14 mt-auto" onClick={deal} disabled={loading}>
            {loading ? <span className="flex items-center gap-2"><span className="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full"/>Dealing...</span> : "Deal"}
          </Button>
        ) : isDone ? (
          <Button size="lg" className="w-full font-display font-black text-xl uppercase tracking-widest h-14 mt-auto" onClick={reset}>New Hand</Button>
        ) : null}
      </div>
    </div>
  );
}
