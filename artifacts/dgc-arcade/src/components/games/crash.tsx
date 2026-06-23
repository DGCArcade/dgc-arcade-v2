import { useState, useRef, useEffect } from "react";
import { Game, usePlaceBet, getGetMeQueryKey, getListRecentBetsAllQueryKey, getListBetsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CrashProps {
  game: Game;
}

export function Crash({ game }: CrashProps) {
  const { user, requireAuth } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const placeBet = usePlaceBet();
  
  const [amount, setAmount] = useState<number>(game.minBet);
  const [cashoutAt, setCashoutAt] = useState<number>(2.0);
  
  // Game states: idle, playing, crashed
  const [gameState, setGameState] = useState<"idle" | "playing" | "crashed">("idle");
  const [currentMultiplier, setCurrentMultiplier] = useState(1.0);
  const [finalMultiplier, setFinalMultiplier] = useState(0);
  const [win, setWin] = useState<boolean | null>(null);
  
  const animationRef = useRef<number | undefined>(undefined);
  const startTimeRef = useRef<number | undefined>(undefined);

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
      
      if (cashoutAt < 1.01) {
        toast({
          title: "Invalid Cashout",
          description: "Target multiplier must be at least 1.01x",
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

      setGameState("playing");
      setCurrentMultiplier(1.0);
      setWin(null);

      // Call API immediately to resolve the bet based on their target cashout
      placeBet.mutate(
        { 
          data: { 
            gameId: game.id, 
            amount, 
            meta: { cashoutAt } 
          } 
        },
        {
          onSuccess: (data) => {
            // The server determines the crash point and whether they won
            // We simulate the graph climbing
            
            // Derive a fake crash point based on the result
            let crashPoint = 0;
            if (data.won) {
              // They won, so crash point is >= cashoutAt
              crashPoint = cashoutAt + Math.random() * (cashoutAt * 0.5);
            } else {
              // They lost, so crash point is < cashoutAt
              crashPoint = 1.0 + Math.random() * (cashoutAt - 1.0);
            }
            
            setFinalMultiplier(crashPoint);
            
            // Start the visual climb
            startTimeRef.current = performance.now();
            
            const animate = (time: number) => {
              const elapsed = (time - (startTimeRef.current || time)) / 1000;
              // Exponential growth curve: 1 * e^(k * t)
              const newMult = 1.0 * Math.pow(Math.E, 0.2 * elapsed);
              
              if (newMult >= crashPoint) {
                setCurrentMultiplier(crashPoint);
                setGameState("crashed");
                setWin(data.won);
                
                // Invalidate queries
                queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
                queryClient.invalidateQueries({ queryKey: getListRecentBetsAllQueryKey() });
                queryClient.invalidateQueries({ queryKey: getListBetsQueryKey() });
                
                if (data.won) {
                  toast({
                    title: "Cashed Out!",
                    description: `Payout: ${formatCurrency(data.payout)}`,
                    className: "bg-green-500 text-white border-green-600",
                  });
                }
              } else {
                setCurrentMultiplier(newMult);
                animationRef.current = requestAnimationFrame(animate);
              }
            };
            
            animationRef.current = requestAnimationFrame(animate);
          },
          onError: (err) => {
            setGameState("idle");
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

  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  return (
    <div className="flex flex-col md:flex-row gap-8">
      {/* Game Area */}
      <div className="flex-1 bg-secondary border border-border rounded-xl p-4 md:p-8 flex flex-col items-center justify-center min-h-[200px] md:min-h-[400px] relative overflow-hidden">
        
        {/* Background graph line */}
        <div className="absolute inset-0 opacity-10">
           <svg className="w-full h-full" preserveAspectRatio="none">
             <path 
               d={`M 0,${400} Q ${currentMultiplier * 50},${400 - currentMultiplier * 20} ${currentMultiplier * 100},${Math.max(0, 400 - currentMultiplier * 50)}`} 
               fill="none" 
               stroke="currentColor" 
               strokeWidth="4" 
             />
           </svg>
        </div>

        {/* Multiplier Display */}
        <div className="relative z-10 text-center">
          <div className={`font-mono font-black text-7xl md:text-9xl tracking-tighter transition-colors duration-300
            ${gameState === 'crashed' && win ? 'text-green-500' : ''}
            ${gameState === 'crashed' && !win ? 'text-destructive' : ''}
            ${gameState === 'playing' ? 'text-primary' : ''}
            ${gameState === 'idle' ? 'text-foreground' : ''}
          `}>
            {currentMultiplier.toFixed(2)}x
          </div>
          
          <div className="h-8 mt-4 font-display font-bold text-xl uppercase tracking-widest text-muted-foreground">
            {gameState === 'crashed' ? 'Crashed' : ''}
          </div>
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
                disabled={gameState === "playing"}
              />
            </div>
          </div>
          
          <div>
            <Label className="text-muted-foreground uppercase text-xs font-bold tracking-wider">Auto Cashout At</Label>
            <div className="relative mt-2">
              <Input 
                type="number" 
                value={cashoutAt} 
                onChange={(e) => setCashoutAt(Number(e.target.value))}
                min={1.01}
                step={0.01}
                className="pr-8 font-mono text-lg bg-secondary border-border"
                disabled={gameState === "playing"}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">x</div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Target multiplier to auto cash out.</p>
          </div>
        </div>
        
        <Button 
          size="lg" 
          className="w-full font-display font-black text-xl uppercase tracking-widest h-14 bg-primary text-primary-foreground hover:bg-primary/90 mt-auto"
          onClick={handleBet}
          disabled={gameState === "playing"}
        >
          {gameState === "playing" ? "Playing..." : "Place Bet"}
        </Button>
      </div>
    </div>
  );
}
