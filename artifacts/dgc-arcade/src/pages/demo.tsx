import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { setAuthToken } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/api-fetch";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertCircle, LogOut, Zap } from "lucide-react";

interface DemoUser {
  id: number;
  username: string;
  balance: number;
  demoCoin: string;
  role: string;
  isDemo: true;
}

interface DemoBet {
  id: number;
  username: string;
  game: string;
  amount: string;
  multiplier: number;
  payout: string;
  won: boolean;
  timestamp: string;
}

export function DemoPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [demoUser, setDemoUser] = useState<DemoUser | null>(null);
  const [liveBets, setLiveBets] = useState<DemoBet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    const initDemo = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch demo login
        const loginRes = await fetch(getApiUrl("/api/demo/login"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        if (!loginRes.ok) throw new Error("Failed to initialize demo");
        const loginData = await loginRes.json();

        setDemoUser(loginData.user);
        setAuthToken(loginData.token);

        // Fetch live bets
        const betsRes = await fetch(getApiUrl("/api/demo/live-bets"));
        if (betsRes.ok) {
          const betsData = await betsRes.json();
          setLiveBets(betsData.bets);
        }

        // Refresh live bets every 5 seconds
        interval = setInterval(async () => {
          const freshBets = await fetch(getApiUrl("/api/demo/live-bets"));
          if (freshBets.ok) {
            const freshData = await freshBets.json();
            setLiveBets(freshData.bets);
          }
        }, 5000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    void initDemo();

    return () => {
      if (interval) clearInterval(interval);
    };
  }, []);

  const handleExitDemo = () => {
    // Clear demo session
    localStorage.removeItem("dgc_token");
    setAuthToken("");
    queryClient.clear();
    setLocation("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-lg font-bold">Initializing Demo Mode...</p>
        </div>
      </div>
    );
  }

  if (error || !demoUser) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20 flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-6 border-red-500/30 bg-red-500/10">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <h2 className="font-bold text-red-400 mb-2">Demo Error</h2>
              <p className="text-sm text-red-300 mb-4">{error || "Failed to initialize demo"}</p>
              <Button onClick={() => setLocation("/")} className="w-full">
                Return to Home
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20">
      {/* Demo Header */}
      <div className="sticky top-0 z-40 border-b border-border/40 bg-background/80 backdrop-blur-lg">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-500/20 border border-yellow-500/50 flex items-center justify-center">
              <Zap className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Demo Mode</p>
              <p className="font-bold text-sm">{demoUser.username}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Balance</p>
              <p className="font-bold text-lg text-primary font-mono">
                {formatCurrency(demoUser.balance)}
              </p>
              <p className="text-xs text-muted-foreground">{demoUser.demoCoin}</p>
            </div>
            <Button
              onClick={handleExitDemo}
              variant="destructive"
              size="sm"
              className="gap-2"
            >
              <LogOut className="w-4 h-4" />
              Exit Demo
            </Button>
          </div>
        </div>
      </div>

      {/* Demo Warning */}
      <div className="container mx-auto px-4 py-4">
        <Card className="p-4 border-yellow-500/30 bg-yellow-500/10">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-yellow-400 text-sm mb-1">Welcome to Demo Mode!</p>
              <p className="text-xs text-yellow-300">
                You have <strong>${demoUser.balance.toLocaleString()}</strong> to explore the platform. All bets are fictitious and will reset when you close this session. You cannot deposit, withdraw, or access real funds in demo mode.
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Live Bets */}
      <div className="container mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold mb-6">Live Demo Bets</h2>
        <div className="grid gap-4">
          {liveBets.map((bet) => (
            <Card
              key={bet.id}
              className="p-4 border-border/50 hover:border-primary/50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <p className="font-bold text-sm">{bet.username}</p>
                    <span className="text-xs px-2 py-1 rounded-full bg-primary/20 text-primary">
                      {bet.game}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Bet: {formatCurrency(parseFloat(bet.amount))}</span>
                    <span>Multiplier: {bet.multiplier}x</span>
                    <span>{new Date(bet.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>

                <div className="text-right">
                  <p
                    className={`font-bold text-lg font-mono ${
                      bet.won ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {bet.won ? "+" : "-"}
                    {formatCurrency(parseFloat(bet.payout))}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {bet.won ? "✅ Won" : "❌ Lost"}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Features Info */}
      <div className="container mx-auto px-4 py-8">
        <div className="grid md:grid-cols-3 gap-4">
          <Card className="p-4 border-green-500/30 bg-green-500/10">
            <p className="text-xs text-green-400 font-bold mb-2">✅ Available</p>
            <ul className="text-xs text-green-300 space-y-1">
              <li>• Play all games</li>
              <li>• View leaderboards</li>
              <li>• Check stats</li>
              <li>• Claim daily bonus</li>
            </ul>
          </Card>

          <Card className="p-4 border-red-500/30 bg-red-500/10">
            <p className="text-xs text-red-400 font-bold mb-2">❌ Disabled</p>
            <ul className="text-xs text-red-300 space-y-1">
              <li>• Real deposits</li>
              <li>• Real withdrawals</li>
              <li>• Account creation</li>
              <li>• Permanent data</li>
            </ul>
          </Card>

          <Card className="p-4 border-blue-500/30 bg-blue-500/10">
            <p className="text-xs text-blue-400 font-bold mb-2">ℹ️ Info</p>
            <ul className="text-xs text-blue-300 space-y-1">
              <li>• Demo balance: ${demoUser.balance.toLocaleString()}</li>
              <li>• Coin: {demoUser.demoCoin}</li>
              <li>• Session resets on close</li>
              <li>• No real transactions</li>
            </ul>
          </Card>
        </div>
      </div>

      {/* Exit Demo Button */}
      <div className="container mx-auto px-4 py-8 text-center">
        <Button
          onClick={handleExitDemo}
          variant="outline"
          size="lg"
          className="gap-2"
        >
          <LogOut className="w-4 h-4" />
          Exit Demo Mode & Return Home
        </Button>
      </div>
    </div>
  );
}
