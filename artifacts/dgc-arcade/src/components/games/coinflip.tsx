import { useState, useRef, useEffect } from "react";
import { Game } from "@workspace/api-client-react/src/generated/api.schemas";
import { usePlaceBet, getGetMeQueryKey, getListRecentBetsAllQueryKey, getListBetsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CoinflipProps {
  game: Game;
}

export function Coinflip({ game }: CoinflipProps) {
  const { user, requireAuth } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const placeBet = usePlaceBet();
  
  const [amount, setAmount] = useState<number>(game.minBet);
  const [choice, setChoice] = useState<"heads" | "tails">("heads");
  const [isFlipping, setIsFlipping] = useState(false);
  const [result, setResult] = useState<"heads" | "tails" | null>(null);
  const [win, setWin] = useState<boolean | null>(null);

  const handleBet = () => {
    requireAuth(() => {
      if (amount < game.minBet || amount > game.maxBet) {
        toast({
          title: "Invalid Bet",
          description: `Bet must be between ${formatCurrency(game.minBet)} and ${formatCurrency(game.maxBet)}`,
          variant: "destructive",
        });
        return;
      }
      
      if (user && amount > user.balance) {
        toast({
          title: "Insufficient funds",
          description: "You do not have enough balance to place this bet.",
          variant: "destructive",
        });
        return;
      }

      setIsFlipping(true);
      setResult(null);
      setWin(null);

      placeBet.mutate(
        { 
          data: { 
            gameId: game.id, 
            amount, 
            meta: { choice } 
          } 
        },
        {
          onSuccess: (data) => {
            // Wait for flip animation
            setTimeout(() => {
              setIsFlipping(false);
              const serverResult = data.won ? choice : (choice === "heads" ? "tails" : "heads");
              setResult(serverResult);
              setWin(data.won);
              
              // Invalidate queries
              queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
              queryClient.invalidateQueries({ queryKey: getListRecentBetsAllQueryKey() });
              queryClient.invalidateQueries({ queryKey: getListBetsQueryKey() });
              
              if (data.won) {
                toast({
                  title: "You Won!",
                  description: `Payout: ${formatCurrency(data.payout)}`,
                  className: "bg-green-500 text-white border-green-600",
                });
              }
            }, 1500);
          },
          onError: (err) => {
            setIsFlipping(false);
            toast({
              title: "Bet Failed",
              description: err.data?.error || "An error occurred",
              variant: "destructive",
            });
          }
        }
      );
    });
  };

  return (
    <div className="flex flex-col md:flex-row gap-8">
      {/* Game Area */}
      <div className="flex-1 bg-secondary border border-border rounded-xl p-8 flex flex-col items-center justify-center min-h-[400px] relative overflow-hidden">
        
        {/* The Coin */}
        <div className="relative w-48 h-48 perspective-1000">
          <div 
            className={`w-full h-full relative preserve-3d transition-transform duration-1000 ease-out
              ${isFlipping ? 'animate-[spin_1s_linear_infinite]' : ''}
              ${!isFlipping && result === 'tails' ? 'rotate-y-180' : ''}
            `}
          >
            {/* Heads Side */}
            <div className="absolute inset-0 backface-hidden rounded-full bg-gradient-to-br from-yellow-300 to-yellow-600 flex items-center justify-center border-4 border-yellow-200 shadow-xl">
              <div className="w-36 h-36 rounded-full border-2 border-yellow-200/50 flex items-center justify-center">
                <span className="font-display font-black text-5xl text-yellow-900 uppercase">H</span>
              </div>
            </div>
            
            {/* Tails Side */}
            <div className="absolute inset-0 backface-hidden rounded-full bg-gradient-to-br from-zinc-300 to-zinc-600 flex items-center justify-center border-4 border-zinc-200 shadow-xl rotate-y-180">
              <div className="w-36 h-36 rounded-full border-2 border-zinc-200/50 flex items-center justify-center">
                <span className="font-display font-black text-5xl text-zinc-900 uppercase">T</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Result Text */}
        <div className="mt-8 h-8">
          {win !== null && (
            <span className={`font-display font-bold text-2xl uppercase tracking-widest ${win ? 'text-green-500' : 'text-destructive'}`}>
              {win ? 'Winner!' : 'Better Luck Next Time'}
            </span>
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
              <Input 
                type="number" 
                value={amount} 
                onChange={(e) => setAmount(Number(e.target.value))}
                min={game.minBet}
                max={game.maxBet}
                step={1}
                className="pl-8 font-mono text-lg bg-secondary border-border"
                disabled={isFlipping}
              />
            </div>
            <div className="flex gap-2 mt-2">
              <Button variant="outline" size="sm" className="flex-1 text-xs h-7 bg-secondary" onClick={() => setAmount(game.minBet)} disabled={isFlipping}>MIN</Button>
              <Button variant="outline" size="sm" className="flex-1 text-xs h-7 bg-secondary" onClick={() => setAmount(amount * 2)} disabled={isFlipping}>x2</Button>
              <Button variant="outline" size="sm" className="flex-1 text-xs h-7 bg-secondary" onClick={() => setAmount(Math.max(game.minBet, amount / 2))} disabled={isFlipping}>/2</Button>
              <Button variant="outline" size="sm" className="flex-1 text-xs h-7 bg-secondary" onClick={() => user && setAmount(Math.min(user.balance, game.maxBet))} disabled={isFlipping}>MAX</Button>
            </div>
          </div>
          
          <div>
            <Label className="text-muted-foreground uppercase text-xs font-bold tracking-wider mb-2 block">Choose Side</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button 
                variant={choice === "heads" ? "default" : "outline"} 
                className={`font-bold uppercase h-12 ${choice === "heads" ? "bg-yellow-500 hover:bg-yellow-600 text-yellow-950" : "bg-secondary"}`}
                onClick={() => setChoice("heads")}
                disabled={isFlipping}
              >
                Heads
              </Button>
              <Button 
                variant={choice === "tails" ? "default" : "outline"} 
                className={`font-bold uppercase h-12 ${choice === "tails" ? "bg-zinc-400 hover:bg-zinc-500 text-zinc-950" : "bg-secondary"}`}
                onClick={() => setChoice("tails")}
                disabled={isFlipping}
              >
                Tails
              </Button>
            </div>
          </div>
        </div>
        
        <Button 
          size="lg" 
          className="w-full font-display font-black text-xl uppercase tracking-widest h-14 bg-primary text-primary-foreground hover:bg-primary/90 mt-auto"
          onClick={handleBet}
          disabled={isFlipping}
        >
          {isFlipping ? "Flipping..." : "Place Bet"}
        </Button>
      </div>
    </div>
  );
}
