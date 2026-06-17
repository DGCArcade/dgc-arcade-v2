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
import { SlotMachine } from "./SlotMachine";
import { SlotConfig } from "../../../../slot-engine/src/engine/types";

interface SlotsProps {
  game: Game;
}

const SYMBOLS = ["CHERRY", "LEMON", "BELL", "SEVEN", "BAR", "DIAMOND", "WILD"];

export function Slots({ game }: SlotsProps) {
  const { user, requireAuth } = useAuth();
  const [activeThemeConfig, setActiveThemeConfig] = useState<SlotConfig | undefined>(undefined);

  useEffect(() => {
    fetch("/api/games/slot-themes")
      .then((r) => r.json())
      .then((data) => {
        const themes: any[] = data.themes ?? [];
        const first = themes[0];
        if (first?.config) {
          setActiveThemeConfig(first.config as SlotConfig);
        }
      })
      .catch(() => {});
  }, []);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const placeBet = usePlaceBet();
  
  const [amount, setAmount] = useState<number>(game.minBet);
  const [isSpinning, setIsSpinning] = useState(false);
  const [reels, setReels] = useState<string[]>(["SEVEN", "SEVEN", "SEVEN"]);
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

      setIsSpinning(true);
      setWin(null);

      // Start fake spinning immediately
      const spinInterval = setInterval(() => {
        setReels([
          SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
          SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
          SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]
        ]);
      }, 100);

      placeBet.mutate(
        { 
          data: { 
            gameId: game.id, 
            amount, 
          } 
        },
        {
          onSuccess: (data) => {
            // Stop spinning after a delay
            setTimeout(() => {
              clearInterval(spinInterval);
              setIsSpinning(false);
              
              // Set final reels based on win
              if (data.won) {
                // If they won, make all 3 reels match
                const winSymbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
                setReels([winSymbol, winSymbol, winSymbol]);
              } else {
                // If they lost, make sure they don't match
                let s1 = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
                let s2 = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
                let s3 = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
                while (s1 === s2 && s2 === s3) {
                  s3 = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
                }
                setReels([s1, s2, s3]);
              }
              
              setWin(data.won);
              
              // Invalidate queries
              queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
              queryClient.invalidateQueries({ queryKey: getListRecentBetsAllQueryKey() });
              queryClient.invalidateQueries({ queryKey: getListBetsQueryKey() });
              
              if (data.won) {
                toast({
                  title: "Jackpot!",
                  description: `Payout: ${formatCurrency(data.payout)}`,
                  className: "bg-green-500 text-white border-green-600",
                });
              }
            }, 2000);
          },
          onError: (err) => {
            clearInterval(spinInterval);
            setIsSpinning(false);
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

  const getSymbolColor = (symbol: string) => {
    switch (symbol) {
      case "CHERRY": return "text-red-500";
      case "LEMON": return "text-yellow-400";
      case "BELL": return "text-yellow-600";
      case "SEVEN": return "text-red-600";
      case "BAR": return "text-zinc-800 dark:text-zinc-200";
      case "DIAMOND": return "text-cyan-400";
      case "WILD": return "text-primary";
      default: return "text-foreground";
    }
  };

  return (
    <div className="flex flex-col md:flex-row gap-8">
      {/* Game Area - Upgraded to Next-Gen Slot Engine */}
      <div className="flex-1 relative min-h-[600px]">
        <SlotMachine key={activeThemeConfig?.id ?? 'default'} config={activeThemeConfig} />
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
                disabled={isSpinning}
              />
            </div>
            <div className="flex gap-2 mt-2">
              <Button variant="outline" size="sm" className="flex-1 text-xs h-7 bg-secondary" onClick={() => setAmount(game.minBet)} disabled={isSpinning}>MIN</Button>
              <Button variant="outline" size="sm" className="flex-1 text-xs h-7 bg-secondary" onClick={() => setAmount(amount * 2)} disabled={isSpinning}>x2</Button>
              <Button variant="outline" size="sm" className="flex-1 text-xs h-7 bg-secondary" onClick={() => setAmount(Math.max(game.minBet, amount / 2))} disabled={isSpinning}>/2</Button>
              <Button variant="outline" size="sm" className="flex-1 text-xs h-7 bg-secondary" onClick={() => user && setAmount(Math.min(user.balance, game.maxBet))} disabled={isSpinning}>MAX</Button>
            </div>
          </div>
        </div>
        
        <Button 
          size="lg" 
          className="w-full font-display font-black text-xl uppercase tracking-widest h-14 bg-primary text-primary-foreground hover:bg-primary/90 mt-auto"
          onClick={handleBet}
          disabled={isSpinning}
        >
          {isSpinning ? "Spinning..." : "Spin"}
        </Button>
      </div>
    </div>
  );
}
