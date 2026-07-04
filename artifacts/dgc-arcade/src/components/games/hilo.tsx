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
import { ChevronUp, ChevronDown } from "lucide-react";
import { ProvablyFairPanel } from "./provably-fair-panel";

interface HiLoProps { game: Game }

const SUITS = ["♠","♥","♦","♣"];
const RANKS = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];

function rankValue(rank: string) { return RANKS.indexOf(rank); }
const isRed = (suit: string) => suit === "♥" || suit === "♦";

function CardFace({ rank, suit, animate }: { rank:string; suit:string; animate?:boolean }) {
  return (
    <div className={`w-20 h-28 rounded-xl border-2 border-zinc-300 bg-white flex flex-col p-2 select-none shadow-xl ${animate?"card-deal":""}`}>
      <div className="text-base font-black leading-none" style={{color:isRed(suit)?"#CC1111":"#111"}}>{rank}</div>
      <div className="text-base leading-none" style={{color:isRed(suit)?"#CC1111":"#111"}}>{suit}</div>
      <div className="flex-1 flex items-center justify-center text-3xl" style={{color:isRed(suit)?"#CC1111":"#111"}}>{suit}</div>
    </div>
  );
}

function CardBack() {
  return (
    <div className="w-20 h-28 rounded-xl border-2 border-primary/40 bg-secondary flex items-center justify-center">
      <div className="grid grid-cols-4 gap-0.5 p-2 w-full h-full">
        {Array.from({length:16},(_,i)=><div key={i} className="rounded-sm bg-primary/20"/>)}
      </div>
    </div>
  );
}

export function HiLo({ game }: HiLoProps) {
  const { user, requireAuth } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const placeBet = usePlaceBet();

  const [amount, setAmount] = useState<number>(game.minBet);
  const [currentCard, setCurrentCard] = useState<{rank:string;suit:string}|null>(null);
  const [nextCard, setNextCard] = useState<{rank:string;suit:string}|null>(null);
  const [streak, setStreak] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [showResult, setShowResult] = useState(false);
  const [lastWon, setLastWon] = useState<boolean|null>(null);
  const [roundPayout, setRoundPayout] = useState(0);
  const [history, setHistory] = useState<{won:boolean;rank:string;suit:string;mult:number}[]>([]);
  const [pf, setPf] = useState<{ betId?: number; serverSeedHash?: string; serverSeed?: string; clientSeed?: string; nonce?: number }>({});

  const deal = (pick: "hi"|"lo") => {
    requireAuth(() => {
      if (!user || amount > user.balance) { toast({ title:"Insufficient balance", variant:"destructive" }); return; }
      setShowResult(false);

      placeBet.mutate({ data: { gameId: game.id, amount, meta: { pick, currentRank: currentCard?.rank ?? "7" } } }, {
        onSuccess: (data) => {
          const meta = data.bet.meta as Record<string,unknown>;
          const drawnRank = String(meta?.drawnRank ?? "7");
          const drawnSuit = String(meta?.suit ?? "♠");
          const next = { rank: drawnRank, suit: drawnSuit };
          setNextCard(next);
          setShowResult(true);
          setLastWon(data.won);
          setRoundPayout(data.payout);
          setPf({
            betId: data.bet.id,
            serverSeedHash: data.bet.serverSeedHash ?? undefined,
            serverSeed: data.bet.serverSeed ?? undefined,
            clientSeed: data.bet.clientSeed ?? undefined,
            nonce: data.bet.nonce ?? undefined,
          });
          qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
          qc.invalidateQueries({ queryKey: getListRecentBetsAllQueryKey() });
          qc.invalidateQueries({ queryKey: getListBetsQueryKey() });

          if (data.won) {
            const newStreak = streak + 1;
            const newMult = parseFloat((1 + newStreak * 0.5).toFixed(2));
            setStreak(newStreak);
            setMultiplier(newMult);
            setHistory(h => [{ won:true, rank:drawnRank, suit:drawnSuit, mult:newMult }, ...h].slice(0,6));
            setCurrentCard(next);
            toast({ title:`Correct! +${formatCurrency(data.payout)}`, className:"bg-green-500 text-white" });
          } else {
            setHistory(h => [{ won:false, rank:drawnRank, suit:drawnSuit, mult:multiplier }, ...h].slice(0,6));
            setStreak(0);
            setMultiplier(1);
            setTimeout(() => {
              setCurrentCard({ rank: "7", suit: "♠" });
              setNextCard(null);
              setShowResult(false);
              setLastWon(null);
            }, 1800);
          }
        },
        onError: (err) => toast({ title:"Bet Failed", description:err.data?.error, variant:"destructive" })
      });
    });
  };

  const startGame = () => {
    requireAuth(() => setCurrentCard({ rank: "7", suit: "♠" }));
  };

  const currentRankVal = currentCard ? rankValue(currentCard.rank) : 6;
  const hiOdds = currentCard ? (12 - currentRankVal) / 13 : 0.5;
  const loOdds = currentCard ? currentRankVal / 13 : 0.5;

  return (
    <div className="hilo-game-root flex flex-col md:flex-row gap-8">
      <div className="hilo-card-area flex-1 bg-secondary border border-border rounded-xl p-4 md:p-6 flex flex-col items-center justify-center min-h-[220px] md:min-h-[440px] gap-4 md:gap-6">
        {history.length > 0 && (
          <div className="flex gap-1 justify-center flex-wrap">
            {history.map((h,i)=>(
              <span key={i} className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${h.won?"bg-green-500/20 text-green-400 border border-green-500/30":"bg-red-500/20 text-red-400 border border-red-500/30"}`}>
                {h.rank}{h.suit}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-8">
          {currentCard ? <CardFace {...currentCard} /> : <CardBack />}
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/50 flex items-center justify-center">
              {!showResult ? <span className="text-primary font-bold text-sm">?</span> :
                lastWon ? <ChevronUp className="w-5 h-5 text-green-400"/> : <ChevronDown className="w-5 h-5 text-red-400"/>}
            </div>
          </div>
          {showResult && nextCard ? <CardFace {...nextCard} animate /> : <CardBack />}
        </div>

        {streak > 0 && (
          <div className="text-center">
            <div className="text-xs text-muted-foreground uppercase tracking-widest">Streak</div>
            <div className="font-mono font-black text-2xl text-primary">{streak}🔥 · {multiplier}x</div>
          </div>
        )}

        {showResult && lastWon !== null && (
          <div className={`font-display font-black text-xl uppercase tracking-widest ${lastWon?"text-green-400":"text-red-400"}`}>
            {lastWon ? `Win! +${formatCurrency(roundPayout)}` : "Wrong!"}
          </div>
        )}

        {currentCard && !placeBet.isPending && (
          <div className="flex gap-6">
            <Button size="lg" className="min-w-[120px] h-14 font-black text-lg uppercase bg-green-700 hover:bg-green-600 flex flex-col"
              onClick={()=>deal("hi")} disabled={placeBet.isPending || currentRankVal >= 12}>
              <ChevronUp className="w-5 h-5"/>
              Hi <span className="text-xs font-normal opacity-70">{Math.round(hiOdds*100)}%</span>
            </Button>
            <Button size="lg" className="min-w-[120px] h-14 font-black text-lg uppercase bg-red-700 hover:bg-red-600 flex flex-col"
              onClick={()=>deal("lo")} disabled={placeBet.isPending || currentRankVal <= 0}>
              <ChevronDown className="w-5 h-5"/>
              Lo <span className="text-xs font-normal opacity-70">{Math.round(loOdds*100)}%</span>
            </Button>
          </div>
        )}

        {!currentCard && (
          <Button size="lg" className="font-display font-black text-xl uppercase tracking-widest h-14 px-10" onClick={startGame}>
            Deal Card
          </Button>
        )}
      </div>

      <div className="hilo-bet-panel w-full md:w-72 bg-card border border-border rounded-xl p-6 flex flex-col gap-5">
        <div>
          <Label className="text-muted-foreground uppercase text-xs font-bold tracking-wider">Bet Per Round</Label>
          <div className="relative mt-2">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</span>
            <Input type="number" value={amount} onChange={e=>setAmount(Number(e.target.value))} min={game.minBet} max={game.maxBet} className="pl-8 font-mono bg-secondary"/>
          </div>
        </div>

        <div className="bg-secondary/50 rounded-lg p-3 text-xs border border-border/40 space-y-1.5 font-mono">
          <div className="flex justify-between"><span className="text-muted-foreground">Streak</span><span className="text-primary font-bold">{streak}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Multiplier</span><span className="text-primary font-bold">{multiplier}x</span></div>
        </div>

        <ProvablyFairPanel {...pf} />

        <div className="text-xs text-muted-foreground space-y-1 text-center border-t border-border/40 pt-3">
          <div>Server draws next card via SHA-256</div>
          <div>Ace is high · 2 is low</div>
        </div>
      </div>
    </div>
  );
}
