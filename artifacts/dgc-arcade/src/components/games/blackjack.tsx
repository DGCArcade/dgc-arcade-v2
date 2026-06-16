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

// Enhanced card component with flip animation
function PlayingCard({card,hidden,delay=0,fromDeck=false}:{card:Card;hidden?:boolean;delay?:number;fromDeck?:boolean}) {
  const isRed = card.suit==="♥"||card.suit==="♦";
  const clr = isRed?"#dc2626":"#111827";
  
  return (
    <div style={{
      width:100,
      height:140,
      borderRadius:14,
      flexShrink:0,
      position:"relative",
      perspective:"1200px",
      animation: fromDeck ? `bj-deal-from-deck 0.6s cubic-bezier(0.34,1.56,0.64,1) both` : `bj-deal 0.5s cubic-bezier(0.22,0.61,0.36,1) both`,
      animationDelay:`${delay}ms`,
      boxShadow:"0 12px 40px rgba(0,0,0,0.8),0 4px 12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1)",
      transformStyle:"preserve-3d",
    }}>
      {hidden?(
        <div style={{
          position:"absolute",
          inset:0,
          borderRadius:14,
          overflow:"hidden",
          background:"linear-gradient(145deg,#1e3a8a 0%,#1e1b4b 55%,#0c1445 100%)",
          border:"2px solid rgba(255,255,255,0.15)",
          boxShadow:"inset 0 2px 8px rgba(0,0,0,0.5)",
          animation:"bj-card-flip 0.6s ease-in-out both",
          animationDelay:`${delay}ms`,
          transformStyle:"preserve-3d",
        }}>
          <div style={{position:"absolute",inset:0,backgroundImage:"repeating-linear-gradient(45deg,rgba(255,255,255,0.04) 0,rgba(255,255,255,0.04) 1px,transparent 1px,transparent 8px)"}}/>
          <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8}}>
            <div style={{width:36,height:36,border:"2.5px solid rgba(255,255,255,0.2)",borderRadius:5,transform:"rotate(45deg)"}}/>
            <span style={{fontSize:9,fontWeight:900,letterSpacing:3,color:"rgba(255,255,255,0.25)"}}>DGC</span>
          </div>
        </div>
      ):(
        <>
          <div style={{position:"absolute",inset:0,borderRadius:14,background:"#fff",border:"2px solid #e5e7eb",boxShadow:"inset 0 1px 3px rgba(0,0,0,0.1)"}}/>
          <div style={{position:"absolute",inset:0}}>
            <div style={{position:"absolute",top:8,left:9,display:"flex",flexDirection:"column",gap:1}}>
              <span style={{fontSize:19,fontWeight:900,color:clr,lineHeight:"1"}}>{card.rank}</span>
              <span style={{fontSize:16,color:clr,lineHeight:"1"}}>{card.suit}</span>
            </div>
            <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <span style={{fontSize:48,lineHeight:"1",color:clr,userSelect:"none",opacity:0.15}}>{card.suit}</span>
            </div>
            <div style={{position:"absolute",bottom:8,right:9,display:"flex",flexDirection:"column",gap:1,transform:"rotate(180deg)"}}>
              <span style={{fontSize:19,fontWeight:900,color:clr,lineHeight:"1"}}>{card.rank}</span>
              <span style={{fontSize:16,color:clr,lineHeight:"1"}}>{card.suit}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Deck pile in top-right corner
function DeckPile() {
  return (
    <div style={{position:"relative",width:72,height:100}}>
      {[3,2,1,0].map(i=>(
        <div key={i} style={{
          position:"absolute",
          width:72,
          height:100,
          borderRadius:12,
          background:"linear-gradient(145deg,#1e3a8a,#0c1445)",
          border:"2px solid rgba(255,255,255,0.12)",
          top:i*-3,
          left:i*1,
          zIndex:i,
          boxShadow:i===0?"0 6px 20px rgba(0,0,0,0.6)":"none",
          transition:"transform 0.3s ease"
        }}/>
      ))}
      <div style={{position:"absolute",inset:0,zIndex:10,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6}}>
        <div style={{width:32,height:32,border:"2px solid rgba(255,255,255,0.18)",borderRadius:4,transform:"rotate(45deg)"}}/>
        <span style={{fontSize:8,fontWeight:900,letterSpacing:2.5,color:"rgba(255,255,255,0.2)"}}>DECK</span>
      </div>
    </div>
  );
}

// Enhanced score badge
function ScoreBadge({total,bust}:{total:number;bust?:boolean}) {
  const bj=total===21;
  return (
    <span style={{
      background:bust?"rgba(239,68,68,0.25)":bj?"rgba(251,191,36,0.25)":"rgba(59,130,246,0.15)",
      border:`2px solid ${bust?"rgba(239,68,68,0.6)":bj?"rgba(251,191,36,0.6)":"rgba(59,130,246,0.4)"}`,
      borderRadius:24,
      padding:"6px 16px",
      fontSize:16,
      fontWeight:900,
      color:bust?"#fca5a5":bj?"#fde047":"#60a5fa",
      boxShadow:bust?"0 0 20px rgba(239,68,68,0.4)":bj?"0 0 20px rgba(251,191,36,0.45)":"0 0 16px rgba(59,130,246,0.3)",
      display:"inline-block",
      letterSpacing:1,
      fontFamily:"monospace"
    }}>
      {total}
    </span>
  );
}

const RCFG:{[k:string]:{label:string;color:string;glow:string;rgb:string}} = {
  player_wins:     {label:"YOU WIN",     color:"#22c55e",glow:"rgba(34,197,94,0.6)",  rgb:"34,197,94"},
  player_blackjack:{label:"BLACKJACK!",  color:"#fbbf24",glow:"rgba(251,191,36,0.65)",rgb:"251,191,36"},
  dealer_wins:     {label:"DEALER WINS", color:"#ef4444",glow:"rgba(239,68,68,0.55)", rgb:"239,68,68"},
  push:            {label:"PUSH",        color:"#94a3b8",glow:"rgba(148,163,184,0.4)",rgb:"148,163,184"},
  player_bust:     {label:"BUST",        color:"#ef4444",glow:"rgba(239,68,68,0.55)", rgb:"239,68,68"},
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

  const action=async(act:"hit"|"stand"|"double"|"split")=>{
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
    <div key={k} style={{width:100,height:140,borderRadius:14,flexShrink:0,
      border:"2px dashed rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.01)"}}/>
  );

  const tableShadow=isDone&&result
    ?`0 0 0 1px rgba(${result.rgb},0.4),0 0 120px rgba(${result.rgb},0.25),0 32px 100px rgba(0,0,0,0.8)`
    :"0 0 0 1px rgba(255,255,255,0.08),0 32px 100px rgba(0,0,0,0.7)";
  
  const tableBg=isDone&&result
    ?`radial-gradient(ellipse at 50% 35%,rgba(${result.rgb},0.1) 0%,#080f1e 50%,#040810 100%)`
    :"radial-gradient(ellipse at 50% 30%,#0d1f3c 0%,#080f1e 50%,#040810 100%)";

  const canSplit = playerHand.length === 2 && playerHand[0].rank === playerHand[1].rank && user && parseFloat(String(user.balance)) >= amount;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12,minHeight:"100vh",paddingBottom:20}}>
      <style>{`
        @keyframes bj-deal-from-deck {
          0% {
            transform: translate(0, 0) scale(0.8) rotateY(180deg);
            opacity: 0;
          }
          50% {
            opacity: 1;
          }
          100% {
            transform: translate(0, 0) scale(1) rotateY(0deg);
            opacity: 1;
          }
        }
        @keyframes bj-deal {
          0% {
            transform: translateY(-20px) scale(0.95);
            opacity: 0;
          }
          100% {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
        }
        @keyframes bj-card-flip {
          0% {
            transform: rotateY(0deg);
          }
          50% {
            transform: rotateY(90deg);
          }
          100% {
            transform: rotateY(0deg);
          }
        }
        @keyframes bj-result-anim {
          0% {
            transform: scale(0.8) translateY(-20px);
            opacity: 0;
          }
          100% {
            transform: scale(1) translateY(0);
            opacity: 1;
          }
        }
      `}</style>

      {/* GAME TABLE - FITS ON ONE SCREEN */}
      <div style={{
        borderRadius:28,
        overflow:"hidden",
        position:"relative",
        background:tableBg,
        boxShadow:tableShadow,
        transition:"box-shadow 0.8s ease,background 0.8s ease",
        display:"flex",
        flexDirection:"column",
        alignItems:"center",
        justifyContent:"space-between",
        padding:"24px 20px",
        gap:12,
        minHeight:"520px",
        flex:1,
      }}>

        {/* Decorative arcs */}
        <div style={{position:"absolute",bottom:-100,left:"50%",transform:"translateX(-50%)",width:"180%",height:300,borderRadius:"50%",border:"1px solid rgba(255,255,255,0.03)",pointerEvents:"none"}}/>
        <div style={{position:"absolute",bottom:-150,left:"50%",transform:"translateX(-50%)",width:"220%",height:400,borderRadius:"50%",border:"1px solid rgba(255,255,255,0.02)",pointerEvents:"none"}}/>
        <div style={{position:"absolute",top:"35%",left:"50%",transform:"translate(-50%,-50%)",width:360,height:260,borderRadius:"50%",background:"radial-gradient(ellipse,rgba(255,255,255,0.015) 0%,transparent 70%)",pointerEvents:"none"}}/>
        <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",fontSize:11,fontWeight:900,letterSpacing:12,color:"rgba(255,255,255,0.02)",pointerEvents:"none",userSelect:"none",whiteSpace:"nowrap"}}>DGC ARCADE</div>

        {/* Deck pile - top right */}
        <div style={{position:"absolute",top:16,right:16,opacity:0.8,zIndex:5}}><DeckPile/></div>

        {/* Bet indicator */}
        {status!=="idle"&&(
          <div style={{position:"absolute",top:16,left:16,background:"rgba(0,0,0,0.6)",border:"1.5px solid rgba(255,255,255,0.12)",borderRadius:12,padding:"7px 16px",fontSize:12,fontWeight:700,color:"rgba(255,255,255,0.5)",letterSpacing:2,textTransform:"uppercase"}}>
            Bet: {formatCurrency(amount)}
          </div>
        )}

        {/* DEALER SECTION */}
        <div style={{position:"relative",zIndex:10,width:"100%",display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
          <div style={{display:"flex",alignItems:"center",gap:12,fontSize:12,fontWeight:700,letterSpacing:5,color:"rgba(255,255,255,0.45)",textTransform:"uppercase"}}>
            Dealer {shownDealerTotal&&<ScoreBadge total={shownDealerTotal} bust={shownDealerTotal>21}/>}
          </div>
          <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap",minHeight:140}}>
            {status==="idle"?<>{emptySlot(0)}{emptySlot(1)}</>:dealerHand.map((c,i)=>(
              <PlayingCard key={`${dealKey}-d${i}`} card={c} hidden={c.suit==="?"} delay={i*160} fromDeck={true}/>
            ))}
          </div>
        </div>

        {/* VS DIVIDER */}
        <div style={{position:"relative",zIndex:10,width:"100%",maxWidth:360,display:"flex",alignItems:"center",gap:20,marginVertical:8}}>
          <div style={{flex:1,height:"1.5px",background:"linear-gradient(90deg,rgba(255,255,255,0.05) 0%,rgba(255,255,255,0.12) 50%,rgba(255,255,255,0.05) 100%)"}}/>
          <span style={{fontSize:11,fontWeight:700,letterSpacing:7,color:"rgba(255,255,255,0.15)",textTransform:"uppercase"}}>vs</span>
          <div style={{flex:1,height:"1.5px",background:"linear-gradient(90deg,rgba(255,255,255,0.05) 0%,rgba(255,255,255,0.12) 50%,rgba(255,255,255,0.05) 100%)"}}/>
        </div>

        {/* PLAYER SECTION */}
        <div style={{position:"relative",zIndex:10,width:"100%",display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
          <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap",minHeight:140}}>
            {status==="idle"?<>{emptySlot(2)}{emptySlot(3)}</>:playerHand.map((c,i)=>(
              <PlayingCard key={`${dealKey}-p${i}`} card={c} delay={i*160+80} fromDeck={true}/>
            ))}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:12,fontSize:12,fontWeight:700,letterSpacing:5,color:"rgba(255,255,255,0.45)",textTransform:"uppercase"}}>
            You {playerTotal>0&&<ScoreBadge total={playerTotal} bust={playerTotal>21}/>}
          </div>
        </div>

        {/* RESULT OVERLAY */}
        {isDone&&result&&(
          <div style={{position:"relative",zIndex:20,textAlign:"center",padding:"12px 0",animation:"bj-result-anim 0.6s cubic-bezier(0.34,1.56,0.64,1) both"}}>
            <div style={{fontSize:42,fontWeight:900,textTransform:"uppercase",letterSpacing:8,color:result.color,textShadow:`0 0 50px ${result.glow},0 0 120px ${result.glow}`,marginBottom:12}}>
              {result.label}
            </div>
            {payout>0&&<div style={{fontSize:20,fontWeight:700,color:"#22c55e",letterSpacing:2,fontFamily:"monospace"}}>+{formatCurrency(payout)}</div>}
          </div>
        )}

        {/* ACTION BUTTONS */}
        {isActive&&(
          <div style={{position:"relative",zIndex:10,display:"flex",gap:10,flexWrap:"wrap",justifyContent:"center",marginTop:8}}>
            <button onClick={()=>action("hit")} disabled={loading} style={{padding:"14px 32px",borderRadius:18,fontWeight:900,fontSize:14,letterSpacing:4,textTransform:"uppercase",background:"linear-gradient(140deg,#16a34a,#15803d)",color:"#fff",border:"2px solid rgba(255,255,255,0.2)",cursor:loading?"not-allowed":"pointer",boxShadow:"0 6px 32px rgba(22,163,74,0.6),inset 0 1px 0 rgba(255,255,255,0.2)",opacity:loading?0.5:1,minWidth:100,transition:"all 0.2s",transform:loading?"scale(0.95)":"scale(1)"}}>HIT</button>
            <button onClick={()=>action("stand")} disabled={loading} style={{padding:"14px 32px",borderRadius:18,fontWeight:900,fontSize:14,letterSpacing:4,textTransform:"uppercase",background:"linear-gradient(140deg,#dc2626,#b91c1c)",color:"#fff",border:"2px solid rgba(255,255,255,0.2)",cursor:loading?"not-allowed":"pointer",boxShadow:"0 6px 32px rgba(220,38,38,0.6),inset 0 1px 0 rgba(255,255,255,0.2)",opacity:loading?0.5:1,minWidth:100,transition:"all 0.2s",transform:loading?"scale(0.95)":"scale(1)"}}>STAND</button>
            {playerHand.length===2&&user&&parseFloat(String(user.balance))>=amount&&(
              <button onClick={()=>action("double")} disabled={loading} style={{padding:"14px 28px",borderRadius:18,fontWeight:900,fontSize:14,letterSpacing:4,textTransform:"uppercase",background:"linear-gradient(140deg,#7c3aed,#6d28d9)",color:"#fff",border:"2px solid rgba(255,255,255,0.2)",cursor:loading?"not-allowed":"pointer",boxShadow:"0 6px 32px rgba(124,58,237,0.6),inset 0 1px 0 rgba(255,255,255,0.2)",opacity:loading?0.5:1,minWidth:100,transition:"all 0.2s",transform:loading?"scale(0.95)":"scale(1)"}}>DOUBLE</button>
            )}
            {canSplit&&(
              <button onClick={()=>action("split")} disabled={loading} style={{padding:"14px 28px",borderRadius:18,fontWeight:900,fontSize:14,letterSpacing:4,textTransform:"uppercase",background:"linear-gradient(140deg,#0891b2,#0e7490)",color:"#fff",border:"2px solid rgba(255,255,255,0.2)",cursor:loading?"not-allowed":"pointer",boxShadow:"0 6px 32px rgba(8,145,178,0.6),inset 0 1px 0 rgba(255,255,255,0.2)",opacity:loading?0.5:1,minWidth:100,transition:"all 0.2s",transform:loading?"scale(0.95)":"scale(1)"}}>SPLIT</button>
            )}
          </div>
        )}
      </div>

      {/* BET PANEL - COMPACT AND INTEGRATED */}
      <div style={{background:"rgba(15,23,42,0.8)",border:"1.5px solid rgba(255,255,255,0.08)",borderRadius:20,padding:"16px",display:"flex",gap:16,alignItems:"flex-end",flexWrap:"wrap",justifyContent:"space-between"}}>
        
        {/* Bet Amount Input */}
        <div style={{flex:1,minWidth:200}}>
          <Label style={{fontSize:11,fontWeight:700,letterSpacing:2,color:"rgba(255,255,255,0.4)",textTransform:"uppercase",display:"block",marginBottom:8}}>Bet Amount</Label>
          <div style={{position:"relative",display:"flex",alignItems:"center"}}>
            <span style={{position:"absolute",left:12,color:"rgba(255,255,255,0.3)",fontFamily:"monospace",fontSize:14,fontWeight:700}}>$</span>
            <Input type="text" inputMode="decimal"
              value={amount===0?"":String(amount)}
              onChange={e=>{const v=e.target.value.replace(/[^0-9.]/g,"");if(v===""||v===".")setAmount(0);else{const n=parseFloat(v);if(!isNaN(n))setAmount(Math.min(n,game.maxBet));}}}
              onBlur={()=>{if(!amount||amount<game.minBet)setAmount(game.minBet);}}
              placeholder={String(game.minBet)}
              style={{paddingLeft:32,fontSize:15,fontWeight:700,fontFamily:"monospace",background:"rgba(255,255,255,0.05)",border:"1.5px solid rgba(255,255,255,0.1)",borderRadius:12,color:"#fff",padding:"10px 12px 10px 32px",height:44}}
              disabled={status==="active"}/>
          </div>
        </div>

        {/* Quick bet buttons */}
        <div style={{display:"flex",gap:8}}>
          {["MIN","x2","/2","MAX"].map((l,i)=>(
            <button key={l} onClick={()=>{if(i===0)setAmount(game.minBet);if(i===1)setAmount(Math.min(amount*2,game.maxBet));if(i===2)setAmount(Math.max(game.minBet,amount/2));if(i===3)setAmount(Math.min(user?.balance??0,game.maxBet));}} disabled={status==="active"} style={{padding:"10px 12px",fontSize:12,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",background:"rgba(255,255,255,0.08)",border:"1.5px solid rgba(255,255,255,0.12)",borderRadius:10,color:"rgba(255,255,255,0.7)",cursor:status==="active"?"not-allowed":"pointer",transition:"all 0.2s",opacity:status==="active"?0.5:1}}>{l}</button>
          ))}
        </div>

        {/* Game Info */}
        <div style={{display:"flex",gap:16,fontSize:11,fontFamily:"monospace",color:"rgba(255,255,255,0.4)"}}>
          <div><span style={{color:"rgba(251,191,36,0.8)"}}>BJ: 3:2</span></div>
          <div><span style={{color:"rgba(34,197,94,0.8)"}}>Win: 2:1</span></div>
          <div><span style={{color:"rgba(59,130,246,0.8)"}}>Edge: {game.houseEdge}%</span></div>
        </div>

        {/* Deal/New Hand Button */}
        {status==="idle"?(
          <button onClick={deal} disabled={loading} style={{padding:"12px 40px",borderRadius:14,fontWeight:900,fontSize:15,letterSpacing:4,textTransform:"uppercase",background:"linear-gradient(140deg,#3b82f6,#2563eb)",color:"#fff",border:"2px solid rgba(255,255,255,0.2)",cursor:loading?"not-allowed":"pointer",boxShadow:"0 6px 32px rgba(59,130,246,0.5),inset 0 1px 0 rgba(255,255,255,0.2)",opacity:loading?0.5:1,minWidth:140,transition:"all 0.2s",transform:loading?"scale(0.95)":"scale(1)"}}>
            {loading?<span style={{display:"flex",alignItems:"center",gap:8}}>⏳ Dealing...</span>:"DEAL"}
          </button>
        ):isDone?(
          <button onClick={reset} style={{padding:"12px 40px",borderRadius:14,fontWeight:900,fontSize:15,letterSpacing:4,textTransform:"uppercase",background:"linear-gradient(140deg,#3b82f6,#2563eb)",color:"#fff",border:"2px solid rgba(255,255,255,0.2)",cursor:"pointer",boxShadow:"0 6px 32px rgba(59,130,246,0.5),inset 0 1px 0 rgba(255,255,255,0.2)",minWidth:140,transition:"all 0.2s"}}>NEW HAND</button>
        ):null}
      </div>
    </div>
  );
}
