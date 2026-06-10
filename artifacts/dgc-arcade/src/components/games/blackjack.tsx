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
  for(const c of hand){const v=["J","Q","K"].includes(c.rank)?10:c.rank==="A"?11:parseInt(c.rank);if(v===11)a++;t+=v;}
  while(t>21&&a>0){t-=10;a--;}
  return t;
}

function PlayingCard({card,hidden,delay=0}:{card:Card;hidden?:boolean;delay?:number}) {
  const isRed = card.suit==="♥"||card.suit==="♦";
  const clr = isRed?"#dc2626":"#111827";
  return (
    <div style={{width:86,height:124,borderRadius:12,flexShrink:0,position:"relative",
      animation:"bj-deal 0.44s cubic-bezier(0.22,0.61,0.36,1) both",
      animationDelay:`${delay}ms`,
      boxShadow:"0 8px 32px rgba(0,0,0,0.6),0 2px 8px rgba(0,0,0,0.4)"}}>
      {hidden?(
        <div style={{position:"absolute",inset:0,borderRadius:12,overflow:"hidden",
          background:"linear-gradient(145deg,#1e3a8a 0%,#1e1b4b 55%,#0c1445 100%)",
          border:"2px solid rgba(255,255,255,0.1)"}}>
          <div style={{position:"absolute",inset:0,backgroundImage:"repeating-linear-gradient(45deg,rgba(255,255,255,0.03) 0,rgba(255,255,255,0.03) 1px,transparent 1px,transparent 8px)"}}/>
          <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6}}>
            <div style={{width:32,height:32,border:"2px solid rgba(255,255,255,0.18)",borderRadius:4,transform:"rotate(45deg)"}}/>
            <span style={{fontSize:8,fontWeight:900,letterSpacing:3,color:"rgba(255,255,255,0.2)"}}>DGC</span>
          </div>
        </div>
      ):(
        <>
          <div style={{position:"absolute",inset:0,borderRadius:12,background:"#fff",border:"1.5px solid #e5e7eb"}}/>
          <div style={{position:"absolute",inset:0}}>
            <div style={{position:"absolute",top:6,left:7,display:"flex",flexDirection:"column",gap:1}}>
              <span style={{fontSize:17,fontWeight:900,color:clr,lineHeight:"1"}}>{card.rank}</span>
              <span style={{fontSize:15,color:clr,lineHeight:"1"}}>{card.suit}</span>
            </div>
            <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <span style={{fontSize:38,lineHeight:"1",color:clr,userSelect:"none"}}>{card.suit}</span>
            </div>
            <div style={{position:"absolute",bottom:6,right:7,display:"flex",flexDirection:"column",gap:1,transform:"rotate(180deg)"}}>
              <span style={{fontSize:17,fontWeight:900,color:clr,lineHeight:"1"}}>{card.rank}</span>
              <span style={{fontSize:15,color:clr,lineHeight:"1"}}>{card.suit}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function DeckPile() {
  return (
    <div style={{position:"relative",width:64,height:90}}>
      {[3,2,1,0].map(i=>(
        <div key={i} style={{position:"absolute",width:64,height:90,borderRadius:10,
          background:"linear-gradient(145deg,#1e3a8a,#0c1445)",
          border:"1.5px solid rgba(255,255,255,0.09)",
          top:i*-2,left:i*0.8,zIndex:i,
          boxShadow:i===0?"0 4px 16px rgba(0,0,0,0.5)":"none"}}/>
      ))}
      <div style={{position:"absolute",inset:0,zIndex:10,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:5}}>
        <div style={{width:28,height:28,border:"1.5px solid rgba(255,255,255,0.15)",borderRadius:3,transform:"rotate(45deg)"}}/>
        <span style={{fontSize:7,fontWeight:900,letterSpacing:2.5,color:"rgba(255,255,255,0.18)"}}>DGC</span>
      </div>
    </div>
  );
}

function ScoreBadge({total,bust}:{total:number;bust?:boolean}) {
  const bj=total===21;
  return (
    <span style={{
      background:bust?"rgba(239,68,68,0.2)":bj?"rgba(251,191,36,0.2)":"rgba(0,0,0,0.5)",
      border:`1px solid ${bust?"rgba(239,68,68,0.5)":bj?"rgba(251,191,36,0.5)":"rgba(255,255,255,0.12)"}`,
      borderRadius:20,padding:"3px 13px",fontSize:14,fontWeight:900,
      color:bust?"#fca5a5":bj?"#fde047":"#fff",
      boxShadow:bust?"0 0 14px rgba(239,68,68,0.35)":bj?"0 0 14px rgba(251,191,36,0.4)":"none",
      display:"inline-block",letterSpacing:0.5}}>
      {total}
    </span>
  );
}

const RCFG:{[k:string]:{label:string;color:string;glow:string;rgb:string}} = {
  player_wins:     {label:"YOU WIN",     color:"#22c55e",glow:"rgba(34,197,94,0.5)",  rgb:"34,197,94"},
  player_blackjack:{label:"BLACKJACK",   color:"#fbbf24",glow:"rgba(251,191,36,0.55)",rgb:"251,191,36"},
  dealer_wins:     {label:"DEALER WINS", color:"#ef4444",glow:"rgba(239,68,68,0.45)", rgb:"239,68,68"},
  push:            {label:"PUSH",        color:"#94a3b8",glow:"transparent",           rgb:"148,163,184"},
  player_bust:     {label:"BUST",        color:"#ef4444",glow:"rgba(239,68,68,0.45)", rgb:"239,68,68"},
};

interface BlackjackProps { game: Game }
export function Blackjack({game}:BlackjackProps) {
  const {user,requireAuth}=useAuth();
  const {toast}=useToast();
  const queryClient=useQueryClient();
  const [amount,setAmount]=useState<number>(game.minBet);
  const [handId,setHandId]=useState<number|null>(null);
  const [playerHand,setPlayerHand]=useState<Card[]>([]);
  const [dealerHand,setDealerHand]=useState<Card[]>([]);
  const [playerTotal,setPlayerTotal]=useState(0);
  const [dealerTotal,setDealerTotal]=useState<number|null>(null);
  const [status,setStatus]=useState<Status>("idle");
  const [payout,setPayout]=useState(0);
  const [loading,setLoading]=useState(false);
  const [dealKey,setDealKey]=useState(0);

  const isActive=status==="active";
  const isDone=!["idle","active"].includes(status);
  const result=RCFG[status];
  const shownDealerTotal=dealerTotal??(isDone&&dealerHand.length>0?handTotal(dealerHand):null);

  useEffect(()=>{
    fetch("/api/blackjack/current",{headers:authHeaders()}).then(r=>r.json()).then(d=>{
      if(d?.handId){setHandId(d.handId);setPlayerHand(d.playerHand);setDealerHand(d.dealerHand);setPlayerTotal(d.playerTotal);setStatus(d.status);}
    }).catch(()=>{});
  },[]);

  const deal=()=>{
    requireAuth(async()=>{
      if(!user||amount>user.balance){toast({title:"Insufficient balance",variant:"destructive"});return;}
      setLoading(true);
      try{
        const r=await fetch("/api/blackjack/deal",{method:"POST",headers:authHeaders(),body:JSON.stringify({gameId:game.id,amount})});
        const d=await r.json();
        if(!r.ok){toast({title:`Error ${r.status}: ${d.error??JSON.stringify(d)}`,variant:"destructive"});return;}
        setDealKey(k=>k+1);setHandId(d.handId);setPlayerHand(d.playerHand);setDealerHand(d.dealerHand);
        setPlayerTotal(d.playerTotal);setStatus(d.status);setPayout(0);
        queryClient.invalidateQueries({queryKey:getGetMeQueryKey()});
        if(d.status==="player_blackjack")toast({title:"BLACKJACK! 🃏",description:`Payout: ${formatCurrency(d.bet*2.5)}`,className:"bg-yellow-500 text-black"});
      }catch(e:any){toast({title:`Deal failed: ${e?.message??String(e)}`,variant:"destructive"});}
      finally{setLoading(false);}
    });
  };

  const action=async(act:"hit"|"stand"|"double")=>{
    if(!handId)return;
    setLoading(true);
    try{
      const r=await fetch("/api/blackjack/action",{method:"POST",headers:authHeaders(),body:JSON.stringify({handId,action:act})});
      const d=await r.json();
      if(!r.ok){toast({title:`Error ${r.status}: ${d.error??JSON.stringify(d)}`,variant:"destructive"});return;}
      setPlayerHand(d.playerHand);setDealerHand(d.dealerHand);setPlayerTotal(d.playerTotal);
      setDealerTotal(d.dealerTotal);setStatus(d.status as Status);setPayout(d.payout);
      queryClient.invalidateQueries({queryKey:getGetMeQueryKey()});
      if(d.status==="player_wins")toast({title:"You Win! 🎉",description:`+${formatCurrency(d.payout)}`,className:"bg-green-500 text-white"});
      else if(d.status==="push")toast({title:"Push",description:"Your bet returned."});
    }catch(e:any){toast({title:`Failed: ${e?.message??String(e)}`,variant:"destructive"});}
    finally{setLoading(false);}
  };

  const reset=()=>{setHandId(null);setPlayerHand([]);setDealerHand([]);setPlayerTotal(0);setDealerTotal(null);setStatus("idle");setPayout(0);};
  const emptySlot=(k:number)=>(
    <div key={k} style={{width:86,height:124,borderRadius:12,flexShrink:0,
      border:"2px dashed rgba(255,255,255,0.07)",background:"rgba(255,255,255,0.02)"}}/>
  );

  const tableShadow=isDone&&result
    ?`0 0 0 1px rgba(${result.rgb},0.35),0 0 100px rgba(${result.rgb},0.2),0 24px 80px rgba(0,0,0,0.7)`
    :"0 0 0 1px rgba(255,255,255,0.07),0 24px 80px rgba(0,0,0,0.6)";
  const tableBg=isDone&&result
    ?`radial-gradient(ellipse at 50% 35%,rgba(${result.rgb},0.07) 0%,#080f1e 55%,#040810 100%)`
    :"radial-gradient(ellipse at 50% 30%,#0d1f3c 0%,#080f1e 55%,#040810 100%)";

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>

      {/* TABLE */}
      <div style={{borderRadius:24,overflow:"hidden",position:"relative",minHeight:520,
        background:tableBg,boxShadow:tableShadow,
        transition:"box-shadow 0.7s ease,background 0.7s ease",
        display:"flex",flexDirection:"column",alignItems:"center",
        justifyContent:"space-between",padding:"28px 20px 24px",gap:8}}>

        {/* Arcs */}
        <div style={{position:"absolute",bottom:-90,left:"50%",transform:"translateX(-50%)",width:"160%",height:280,borderRadius:"50%",border:"1px solid rgba(255,255,255,0.04)",pointerEvents:"none"}}/>
        <div style={{position:"absolute",bottom:-140,left:"50%",transform:"translateX(-50%)",width:"200%",height:360,borderRadius:"50%",border:"1px solid rgba(255,255,255,0.02)",pointerEvents:"none"}}/>
        <div style={{position:"absolute",top:"38%",left:"50%",transform:"translate(-50%,-50%)",width:320,height:220,borderRadius:"50%",background:"radial-gradient(ellipse,rgba(255,255,255,0.012) 0%,transparent 70%)",pointerEvents:"none"}}/>
        <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",fontSize:10,fontWeight:900,letterSpacing:10,color:"rgba(255,255,255,0.018)",pointerEvents:"none",userSelect:"none",whiteSpace:"nowrap"}}>DGC ARCADE</div>

        {/* Deck */}
        <div style={{position:"absolute",top:20,right:20,opacity:0.7}}><DeckPile/></div>

        {/* Bet indicator */}
        {status!=="idle"&&(
          <div style={{position:"absolute",top:20,left:20,background:"rgba(0,0,0,0.55)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:10,padding:"5px 13px",fontSize:11,fontWeight:700,color:"rgba(255,255,255,0.4)",letterSpacing:1.5,textTransform:"uppercase"}}>
            Bet {formatCurrency(amount)}
          </div>
        )}

        {/* DEALER */}
        <div style={{position:"relative",zIndex:10,width:"100%",display:"flex",flexDirection:"column",alignItems:"center",gap:14}}>
          <div style={{display:"flex",alignItems:"center",gap:10,fontSize:11,fontWeight:700,letterSpacing:4,color:"rgba(255,255,255,0.38)",textTransform:"uppercase"}}>
            Dealer {shownDealerTotal&&<ScoreBadge total={shownDealerTotal} bust={shownDealerTotal>21}/>}
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap",minHeight:124}}>
            {status==="idle"?<>{emptySlot(0)}{emptySlot(1)}</>:dealerHand.map((c,i)=>(
              <PlayingCard key={`${dealKey}-d${i}`} card={c} hidden={c.suit==="?"} delay={i*145}/>
            ))}
          </div>
        </div>

        {/* VS */}
        <div style={{position:"relative",zIndex:10,width:"100%",maxWidth:320,display:"flex",alignItems:"center",gap:16}}>
          <div style={{flex:1,height:1,background:"rgba(255,255,255,0.06)"}}/>
          <span style={{fontSize:10,fontWeight:700,letterSpacing:6,color:"rgba(255,255,255,0.12)",textTransform:"uppercase"}}>vs</span>
          <div style={{flex:1,height:1,background:"rgba(255,255,255,0.06)"}}/>
        </div>

        {/* PLAYER */}
        <div style={{position:"relative",zIndex:10,width:"100%",display:"flex",flexDirection:"column",alignItems:"center",gap:14}}>
          <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap",minHeight:124}}>
            {status==="idle"?<>{emptySlot(2)}{emptySlot(3)}</>:playerHand.map((c,i)=>(
              <PlayingCard key={`${dealKey}-p${i}`} card={c} delay={i*145+72}/>
            ))}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10,fontSize:11,fontWeight:700,letterSpacing:4,color:"rgba(255,255,255,0.38)",textTransform:"uppercase"}}>
            You {playerTotal>0&&<ScoreBadge total={playerTotal} bust={playerTotal>21}/>}
          </div>
        </div>

        {/* RESULT */}
        {isDone&&result&&(
          <div key={status} className="bj-result-anim" style={{position:"relative",zIndex:20,textAlign:"center",padding:"6px 0"}}>
            <div style={{fontSize:36,fontWeight:900,textTransform:"uppercase",letterSpacing:6,color:result.color,textShadow:`0 0 40px ${result.glow},0 0 90px ${result.glow}`}}>
              {result.label}
            </div>
            {payout>0&&<div style={{fontSize:18,fontWeight:700,color:"#22c55e",marginTop:8,letterSpacing:1}}>+{formatCurrency(payout)}</div>}
          </div>
        )}

        {/* ACTIONS */}
        {isActive&&(
          <div style={{position:"relative",zIndex:10,display:"flex",gap:12,flexWrap:"wrap",justifyContent:"center",marginTop:4}}>
            <button onClick={()=>action("hit")} disabled={loading} style={{padding:"15px 40px",borderRadius:16,fontWeight:900,fontSize:15,letterSpacing:3,textTransform:"uppercase",background:"linear-gradient(140deg,#16a34a,#15803d)",color:"#fff",border:"none",cursor:loading?"not-allowed":"pointer",boxShadow:"0 4px 28px rgba(22,163,74,0.55),inset 0 1px 0 rgba(255,255,255,0.15)",opacity:loading?0.6:1,minWidth:110,transition:"opacity 0.15s"}}>HIT</button>
            <button onClick={()=>action("stand")} disabled={loading} style={{padding:"15px 40px",borderRadius:16,fontWeight:900,fontSize:15,letterSpacing:3,textTransform:"uppercase",background:"linear-gradient(140deg,#dc2626,#b91c1c)",color:"#fff",border:"none",cursor:loading?"not-allowed":"pointer",boxShadow:"0 4px 28px rgba(220,38,38,0.55),inset 0 1px 0 rgba(255,255,255,0.15)",opacity:loading?0.6:1,minWidth:110,transition:"opacity 0.15s"}}>STAND</button>
            {playerHand.length===2&&user&&parseFloat(String(user.balance))>=amount&&(
              <button onClick={()=>action("double")} disabled={loading} style={{padding:"15px 30px",borderRadius:16,fontWeight:900,fontSize:15,letterSpacing:3,textTransform:"uppercase",background:"rgba(255,255,255,0.07)",color:"rgba(255,255,255,0.8)",border:"1px solid rgba(255,255,255,0.18)",cursor:loading?"not-allowed":"pointer",boxShadow:"0 4px 16px rgba(0,0,0,0.3)",opacity:loading?0.6:1,minWidth:100,transition:"opacity 0.15s"}}>2x</button>
            )}
          </div>
        )}
      </div>

      {/* BET PANEL */}
      <div className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-4">
        <div className="space-y-3">
          <Label className="text-muted-foreground uppercase text-xs font-bold tracking-wider">Bet Amount</Label>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm select-none">$</div>
            <Input type="text" inputMode="decimal"
              value={amount===0?"":String(amount)}
              onChange={e=>{const v=e.target.value.replace(/[^0-9.]/g,"");if(v===""||v===".")setAmount(0);else{const n=parseFloat(v);if(!isNaN(n))setAmount(Math.min(n,game.maxBet));}}}
              onBlur={()=>{if(!amount||amount<game.minBet)setAmount(game.minBet);}}
              placeholder={String(game.minBet)}
              className="pl-8 font-mono text-lg bg-secondary border-border h-12" disabled={status==="active"}/>
          </div>
          <div className="flex gap-2">
            {["MIN","x2","/2","MAX"].map((l,i)=>(
              <Button key={l} variant="outline" size="sm" className="flex-1 text-xs h-9 bg-secondary font-bold tracking-wider" disabled={status==="active"}
                onClick={()=>{if(i===0)setAmount(game.minBet);if(i===1)setAmount(Math.min(amount*2,game.maxBet));if(i===2)setAmount(Math.max(game.minBet,amount/2));if(i===3)setAmount(Math.min(user?.balance??0,game.maxBet));}}>{l}</Button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs font-mono bg-secondary/50 rounded-xl p-3 border border-border/40">
          <span className="text-muted-foreground">Blackjack pays</span><span className="text-yellow-400 font-bold text-right">3:2 (2.5x)</span>
          <span className="text-muted-foreground">Win pays</span><span className="text-right">2:1</span>
          <span className="text-muted-foreground">Dealer stands</span><span className="text-right">17+</span>
          <span className="text-muted-foreground">House edge</span><span className="text-green-400 text-right">0.02%</span>
        </div>
        {status==="idle"?(
          <Button size="lg" className="w-full font-display font-black text-xl uppercase tracking-widest h-14" onClick={deal} disabled={loading}>
            {loading?<span className="flex items-center gap-2"><span className="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full"/>Dealing...</span>:"Deal"}
          </Button>
        ):isDone?(
          <Button size="lg" className="w-full font-display font-black text-xl uppercase tracking-widest h-14" onClick={reset}>New Hand</Button>
        ):null}
      </div>
    </div>
  );
}
