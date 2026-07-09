import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import {
  Zap,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Loader,
  AlertCircle,
  DollarSign,
  Trophy,
  Coins,
  History,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface Sport {
  key: string;
  group: string;
  title: string;
  description: string;
  active: boolean;
}

interface Fixture {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Bookmaker[];
}

interface Bookmaker {
  key: string;
  title: string;
  markets: Market[];
}

interface Market {
  key: string;
  outcomes: Outcome[];
}

interface Outcome {
  name: string;
  price: number;
  point?: number;
}

interface SportsBet {
  id: number;
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  selectedOutcome: string;
  odds: string;
  betAmountUsd: string;
  status: string;
  createdAt: string;
  potentialPayoutUsd: string;
}

export function Sportsbook() {
  const { user, cryptoBalances, refreshUser } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [selectedBet, setSelectedBet] = useState<{
    fixture: Fixture;
    market: Market;
    outcome: Outcome;
    odds: number;
  } | null>(null);
  const [betAmount, setBetAmount] = useState<string>("");
  const [selectedCrypto, setSelectedCrypto] = useState<string>("BTC");
  const [showHistory, setShowHistory] = useState(false);

  // Top crypto holding for default selection
  useEffect(() => {
    if (cryptoBalances.length > 0) {
      const top = cryptoBalances.reduce((a, b) => a.usdValue > b.usdValue ? a : b);
      setSelectedCrypto(top.currency.split("_")[0]);
    }
  }, [cryptoBalances]);

  // Fetch available sports
  const { data: sports = [], isLoading: sportsLoading } = useQuery<Sport[]>({
    queryKey: ["sportsbook-sports"],
    queryFn: async () => {
      const res = await fetch("/api/sportsbook/sports", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("dgc_token")}`,
        },
      });
      if (!res.ok) throw new Error("Failed to fetch sports");
      return res.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  // Fetch odds for selected sport
  const { data: fixtures = [], isLoading: fixturesLoading } = useQuery<Fixture[]>({
    queryKey: ["sportsbook-odds", selectedSport],
    queryFn: async () => {
      if (!selectedSport) return [];
      const res = await fetch(
        `/api/sportsbook/odds/${selectedSport}?regions=us&oddsFormat=decimal`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("dgc_token")}`,
          },
        }
      );
      if (!res.ok) throw new Error("Failed to fetch odds");
      return res.json();
    },
    enabled: !!selectedSport,
    staleTime: 1000 * 30,
  });

  // Fetch bet history
  const { data: betHistory = [], isLoading: historyLoading } = useQuery<SportsBet[]>({
    queryKey: ["sportsbook-history", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const res = await fetch(`/api/sportsbook/bets/${user.id}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("dgc_token")}`,
        },
      });
      if (!res.ok) throw new Error("Failed to fetch bet history");
      return res.json();
    },
    enabled: !!user?.id && showHistory,
  });

  // Place bet mutation
  const { mutate: placeBet, isPending: isBettingPending } = useMutation({
    mutationFn: async () => {
      if (!selectedBet || !betAmount) throw new Error("Invalid bet");

      const res = await fetch("/api/sportsbook/bet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("dgc_token")}`,
        },
        body: JSON.stringify({
          fixtureId: selectedBet.fixture.id,
          sportKey: selectedBet.fixture.sport_key,
          leagueTitle: sports.find((s) => s.key === selectedBet.fixture.sport_key)?.title || "Unknown",
          homeTeam: selectedBet.fixture.home_team,
          awayTeam: selectedBet.fixture.away_team,
          commenceTime: selectedBet.fixture.commence_time,
          marketKey: selectedBet.market.key,
          selectedOutcome: selectedBet.outcome.name,
          odds: selectedBet.odds,
          betAmountUsd: parseFloat(betAmount),
          cryptoType: selectedCrypto,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to place bet");
      }

      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Bet Placed Successfully! 🎯",
        description: `Your bet of $${parseFloat(betAmount).toFixed(2)} on ${selectedBet?.outcome.name} is live.`,
      });
      setBetAmount("");
      setSelectedBet(null);
      refreshUser();
    },
    onError: (error) => {
      toast({
        title: "Bet Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Total USD balance across all cryptos
  const totalUsdBalance = useMemo(() => {
    return cryptoBalances.reduce((sum, b) => sum + b.usdValue, 0);
  }, [cryptoBalances]);

  // Potential payout
  const potentialPayout = selectedBet && betAmount
    ? (parseFloat(betAmount) * selectedBet.odds).toFixed(2)
    : "0.00";

  return (
    <div className="w-full space-y-6 pb-24 md:pb-8">
      {/* Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-black/40 backdrop-blur-md border border-white/5 rounded-3xl p-6 md:p-8 shadow-2xl">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center border border-primary/30 shadow-[0_0_15px_rgba(255,215,0,0.1)]">
              <Trophy className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-display font-black text-2xl md:text-4xl uppercase tracking-[0.2em] text-white">
                Sports<span className="text-primary">book</span>
              </h1>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Live Odds • Real-Time Payouts
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowHistory(!showHistory)}
            className={`rounded-xl border-white/10 h-11 px-5 font-bold uppercase tracking-widest transition-all ${showHistory ? "bg-primary text-black border-primary" : "bg-white/5 hover:bg-white/10"}`}
          >
            <History className="w-4 h-4 mr-2" />
            {showHistory ? "Back to Betting" : "My Bets"}
          </Button>

          <div className="flex items-center gap-3 bg-white/5 border border-white/10 px-5 py-2.5 rounded-2xl h-11">
            <div className="flex flex-col items-end leading-none">
              <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-0.5">Total Balance</span>
              <span className="text-sm font-black font-mono text-primary tracking-tight">
                ${totalUsdBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="w-px h-6 bg-white/10 mx-1" />
            <Coins className="w-4 h-4 text-primary/70" />
          </div>
        </div>
      </div>

      {showHistory ? (
        /* ── Bet History View ── */
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-lg font-black uppercase tracking-widest flex items-center gap-2">
              <History className="w-5 h-5 text-primary" /> Recent Wagers
            </h2>
          </div>

          {historyLoading ? (
            <div className="flex justify-center py-20"><Loader className="w-8 h-8 animate-spin text-primary" /></div>
          ) : betHistory.length === 0 ? (
            <div className="bg-white/5 border border-dashed border-white/10 rounded-3xl py-20 text-center space-y-3">
              <AlertCircle className="w-12 h-12 text-muted-foreground/20 mx-auto" />
              <p className="text-muted-foreground font-mono text-sm">No sports bets found in your history.</p>
              <Button variant="link" onClick={() => setShowHistory(false)} className="text-primary font-bold uppercase tracking-widest text-xs">Start Betting Now</Button>
            </div>
          ) : (
            <div className="grid gap-3">
              {betHistory.map((bet) => (
                <div key={bet.id} className="bg-black/40 border border-white/5 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-white/10 transition-all">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${
                      bet.status === "won" ? "bg-green-500/10 border-green-500/30 text-green-400" :
                      bet.status === "lost" ? "bg-red-500/10 border-red-500/30 text-red-400" :
                      "bg-blue-500/10 border-blue-500/30 text-blue-400"
                    }`}>
                      {bet.status === "won" ? <CheckCircle2 className="w-6 h-6" /> :
                       bet.status === "lost" ? <XCircle className="w-6 h-6" /> :
                       <Clock className="w-6 h-6 animate-pulse" />}
                    </div>
                    <div>
                      <div className="font-bold text-sm uppercase tracking-wide">{bet.homeTeam} vs {bet.awayTeam}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">Selection: <span className="text-foreground font-bold">{bet.selectedOutcome}</span> @ {parseFloat(bet.odds).toFixed(2)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-8 px-2">
                    <div className="flex flex-col items-end">
                      <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-0.5">Wager</span>
                      <span className="font-mono font-bold text-sm">${parseFloat(bet.betAmountUsd).toFixed(2)}</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-0.5">Payout</span>
                      <span className={`font-mono font-black text-sm ${bet.status === "won" ? "text-green-400" : "text-muted-foreground"}`}>
                        ${parseFloat(bet.potentialPayoutUsd).toFixed(2)}
                      </span>
                    </div>
                    <div className="w-24 text-right">
                      <Badge className={`uppercase tracking-widest text-[9px] font-black px-2.5 py-1 ${
                        bet.status === "won" ? "bg-green-500 text-black" :
                        bet.status === "lost" ? "bg-red-500 text-white" :
                        "bg-blue-600 text-white"
                      }`}>
                        {bet.status}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ── Betting View ── */
        <div className="grid lg:grid-cols-12 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Main Feed */}
          <div className="lg:col-span-8 space-y-6">
            {/* Sport Categories */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {sportsLoading ? (
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(i => <div key={i} className="w-24 h-10 rounded-xl bg-white/5 animate-pulse" />)}
                </div>
              ) : (
                sports.filter((s) => s.active).map((sport) => (
                  <button
                    key={sport.key}
                    onClick={() => setSelectedSport(sport.key)}
                    className={`px-5 py-2.5 rounded-xl border font-black uppercase tracking-widest text-[10px] transition-all whitespace-nowrap shrink-0 ${
                      selectedSport === sport.key
                        ? "bg-primary text-black border-primary shadow-[0_0_20px_rgba(255,215,0,0.3)] scale-105"
                        : "bg-white/5 text-muted-foreground border-white/10 hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    {sport.title}
                  </button>
                ))
              )}
            </div>

            {/* Fixtures List */}
            <div className="space-y-4">
              {!selectedSport ? (
                <div className="bg-white/5 border border-white/5 rounded-3xl py-24 text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
                    <Trophy className="w-8 h-8 text-primary/40" />
                  </div>
                  <h3 className="font-display font-black text-xl uppercase tracking-widest">Select a Sport</h3>
                  <p className="text-muted-foreground text-sm max-w-xs mx-auto">Choose a category above to view live fixtures and competitive odds.</p>
                </div>
              ) : fixturesLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map(i => <div key={i} className="h-48 rounded-3xl bg-white/5 animate-pulse" />)}
                </div>
              ) : fixtures.length === 0 ? (
                <div className="bg-white/5 border border-white/5 rounded-3xl py-20 text-center">
                  <p className="text-muted-foreground font-mono">No live fixtures for this category right now.</p>
                </div>
              ) : (
                fixtures.map((fixture) => (
                  <div key={fixture.id} className="group bg-black/40 border border-white/5 rounded-3xl overflow-hidden hover:border-primary/30 transition-all duration-500 shadow-xl">
                    <div className="p-5 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                          {new Date(fixture.commence_time).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
                        </span>
                      </div>
                      <Badge variant="outline" className="bg-primary/10 border-primary/20 text-primary text-[9px] font-black uppercase tracking-widest px-2.5">In-Play</Badge>
                    </div>

                    <div className="p-6">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="flex-1 space-y-4">
                          <div className="flex items-center justify-between md:justify-start md:gap-8">
                            <div className="text-lg font-black uppercase tracking-tight group-hover:text-primary transition-colors">{fixture.home_team}</div>
                            <span className="text-xs font-black text-muted-foreground/30 italic">VS</span>
                            <div className="text-lg font-black uppercase tracking-tight group-hover:text-primary transition-colors">{fixture.away_team}</div>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {fixture.bookmakers[0]?.markets.find(m => m.key === "h2h")?.outcomes.map((outcome) => (
                            <button
                              key={outcome.name}
                              onClick={() => setSelectedBet({ fixture, market: fixture.bookmakers[0].markets[0], outcome, odds: outcome.price })}
                              className={`min-w-[100px] p-3 rounded-2xl border transition-all duration-300 flex flex-col items-center gap-1 ${
                                selectedBet?.outcome.name === outcome.name && selectedBet?.fixture.id === fixture.id
                                  ? "bg-primary text-black border-primary shadow-[0_0_20px_rgba(255,215,0,0.4)] scale-105"
                                  : "bg-white/5 border-white/10 hover:border-primary/50 hover:bg-white/10"
                              }`}
                            >
                              <span className="text-[9px] font-black uppercase tracking-widest opacity-60">{outcome.name}</span>
                              <span className="text-base font-black font-mono">{outcome.price.toFixed(2)}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Bet Slip Sidebar */}
          <div className="lg:col-span-4">
            <div className="sticky top-24 space-y-4">
              {!selectedBet ? (
                <div className="bg-black/40 border border-white/5 rounded-3xl p-8 text-center space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mx-auto">
                    <Zap className="w-6 h-6 text-muted-foreground/30" />
                  </div>
                  <h3 className="font-bold uppercase tracking-widest text-sm">Empty Slip</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">Select an outcome from the feed to build your wager.</p>
                </div>
              ) : (
                <div className="bg-black/40 border border-primary/30 rounded-3xl p-6 space-y-6 shadow-2xl shadow-primary/5 animate-in zoom-in-95 duration-300">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display font-black uppercase tracking-[0.2em] text-sm text-primary">Bet Slip</h3>
                    <button onClick={() => setSelectedBet(null)} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-red-500/20 hover:text-red-400 transition-all">✕</button>
                  </div>

                  <div className="space-y-4">
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                      <div className="text-[10px] font-black uppercase tracking-widest text-primary/70">Selection</div>
                      <div className="font-bold text-sm leading-tight">{selectedBet.outcome.name}</div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-widest">{selectedBet.fixture.home_team} vs {selectedBet.fixture.away_team}</div>
                      <div className="flex items-center justify-between pt-2 border-t border-white/5 mt-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Decimal Odds</span>
                        <span className="font-mono font-black text-primary">{selectedBet.odds.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between px-1">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Wager Amount (USD)</label>
                        <div className="flex items-center gap-2">
                          {[10, 50, 100].map(amt => (
                            <button key={amt} onClick={() => setBetAmount(amt.toString())} className="text-[9px] font-black bg-white/5 hover:bg-white/10 border border-white/10 px-2 py-1 rounded-md transition-all">${amt}</button>
                          ))}
                        </div>
                      </div>
                      <div className="relative group">
                        <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary group-focus-within:animate-pulse" />
                        <Input
                          type="number"
                          value={betAmount}
                          onChange={(e) => setBetAmount(e.target.value)}
                          placeholder="0.00"
                          className="h-14 pl-10 bg-black/60 border-white/10 focus:border-primary/50 text-lg font-black font-mono rounded-2xl transition-all"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Settle With</label>
                      <div className="grid grid-cols-2 gap-2">
                        {cryptoBalances.slice(0, 4).map(b => {
                          const symbol = b.currency.split("_")[0];
                          return (
                            <button
                              key={b.currency}
                              onClick={() => setSelectedCrypto(symbol)}
                              className={`p-2 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                                selectedCrypto === symbol ? "bg-primary/20 border-primary text-primary" : "bg-white/5 border-white/10 text-muted-foreground hover:border-white/20"
                              }`}
                            >
                              {symbol}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="bg-primary/10 border border-primary/20 rounded-2xl p-4 flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black uppercase tracking-widest text-primary/70">Potential Payout</span>
                        <span className="text-xl font-black font-mono text-primary">${potentialPayout}</span>
                      </div>
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                        <TrendingUp className="w-5 h-5 text-primary" />
                      </div>
                    </div>

                    <Button
                      onClick={() => placeBet()}
                      disabled={!betAmount || parseFloat(betAmount) <= 0 || isBettingPending}
                      className="w-full h-16 rounded-2xl bg-primary hover:bg-primary/90 text-black font-display font-black uppercase tracking-[0.2em] shadow-xl shadow-primary/20 transition-all active:scale-95 disabled:opacity-50"
                    >
                      {isBettingPending ? (
                        <Loader className="w-6 h-6 animate-spin" />
                      ) : (
                        "Place Wager"
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
