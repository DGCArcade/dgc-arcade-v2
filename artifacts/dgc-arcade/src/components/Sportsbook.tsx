import React, { useState, useMemo, useCallback } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

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

export function Sportsbook() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [selectedBet, setSelectedBet] = useState<{
    fixture: Fixture;
    market: Market;
    outcome: Outcome;
    odds: number;
  } | null>(null);
  const [betAmount, setBetAmount] = useState<string>("");
  const [selectedCrypto, setSelectedCrypto] = useState<string>("BTC");

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
    staleTime: 1000 * 30, // Update every 30 seconds
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
      alert(`Bet placed! Potential payout: $${data.bet.potentialPayoutUsd.toFixed(2)}`);
      setBetAmount("");
      setSelectedBet(null);
    },
    onError: (error) => {
      alert(`Error: ${error.message}`);
    },
  });

  // Format time
  const formatTime = (isoTime: string) => {
    return new Date(isoTime).toLocaleString();
  };

  // Calculate potential payout
  const potentialPayout = selectedBet && betAmount
    ? (parseFloat(betAmount) * selectedBet.odds).toFixed(2)
    : "0.00";

  return (
    <div className="w-full space-y-6 px-4 md:px-6 py-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Trophy className="w-5 h-5 text-primary" />
            <span className="text-xs font-bold uppercase tracking-widest text-primary">
              Premium Sportsbook
            </span>
          </div>
          <h1 className="font-display font-black text-3xl md:text-4xl uppercase tracking-widest">
            Live Sports Betting
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Real-time odds from The Odds API — bet in crypto, display in USD
          </p>
        </div>

        {/* Balance Display */}
        <div className="flex items-center gap-2 bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 px-4 py-2.5 rounded-xl shrink-0">
          <DollarSign className="w-4 h-4 text-amber-400" />
          <div>
            <div className="text-[10px] text-amber-400/70 font-bold uppercase tracking-widest">
              Casino Balance
            </div>
            <div className="text-amber-400 font-black font-mono text-base">
              ${(parseFloat(user?.casinoBalance?.toString() || "0") * 50000).toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* Sports Selector */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {sportsLoading ? (
          <div className="col-span-full flex justify-center py-4">
            <Loader className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : (
          sports.filter((s) => s.active).map((sport) => (
            <button
              key={sport.key}
              onClick={() => setSelectedSport(sport.key)}
              className={`p-3 rounded-lg border transition-all duration-200 text-xs font-bold uppercase tracking-wider text-center ${
                selectedSport === sport.key
                  ? "bg-primary text-primary-foreground border-primary shadow-[0_0_12px_rgba(255,193,7,0.4)]"
                  : "bg-secondary text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
              }`}
            >
              {sport.title}
            </button>
          ))
        )}
      </div>

      {/* Fixtures Grid */}
      {selectedSport && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold uppercase tracking-widest">Live Fixtures</h2>

          {fixturesLoading ? (
            <div className="flex justify-center py-8">
              <Loader className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : fixtures.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No fixtures available for this sport
            </div>
          ) : (
            <div className="grid gap-4">
              {fixtures.map((fixture) => (
                <div
                  key={fixture.id}
                  className="border border-border/60 rounded-lg overflow-hidden bg-card hover:border-primary/50 transition-all duration-300"
                >
                  {/* Fixture Header */}
                  <div className="p-4 border-b border-border/40 bg-secondary/30">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-bold uppercase tracking-wider">
                          {fixture.home_team} vs {fixture.away_team}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {formatTime(fixture.commence_time)}
                        </div>
                      </div>
                      <Badge variant="outline" className="shrink-0">
                        Live
                      </Badge>
                    </div>
                  </div>

                  {/* Markets */}
                  <div className="p-4 space-y-3">
                    {fixture.bookmakers[0]?.markets.map((market) => (
                      <div key={market.key} className="space-y-2">
                        <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                          {market.key === "h2h" ? "Head to Head" : market.key.toUpperCase()}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {market.outcomes.map((outcome) => (
                            <button
                              key={`${outcome.name}-${outcome.price}`}
                              onClick={() =>
                                setSelectedBet({
                                  fixture,
                                  market,
                                  outcome,
                                  odds: outcome.price,
                                })
                              }
                              className={`p-3 rounded-lg border transition-all duration-200 text-sm font-bold ${
                                selectedBet?.outcome.name === outcome.name &&
                                selectedBet?.fixture.id === fixture.id
                                  ? "bg-primary text-primary-foreground border-primary shadow-[0_0_8px_rgba(255,193,7,0.3)]"
                                  : "bg-secondary text-foreground border-border hover:border-primary/50 hover:bg-secondary/80"
                              }`}
                            >
                              <div className="text-xs">{outcome.name}</div>
                              <div className="text-lg font-black mt-1">{outcome.price.toFixed(2)}</div>
                              {outcome.point && (
                                <div className="text-[10px] text-muted-foreground mt-0.5">
                                  {outcome.point > 0 ? "+" : ""}{outcome.point}
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bet Slip */}
      {selectedBet && (
        <div className="fixed bottom-0 left-0 right-0 md:relative md:bottom-auto md:left-auto md:right-auto border-t md:border md:rounded-lg bg-card p-4 md:p-6 space-y-4 md:max-w-md md:ml-auto">
          <div className="flex items-center justify-between">
            <h3 className="font-bold uppercase tracking-widest">Bet Slip</h3>
            <button
              onClick={() => setSelectedBet(null)}
              className="text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          </div>

          {/* Bet Details */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Match:</span>
              <span className="font-bold">
                {selectedBet.fixture.home_team} vs {selectedBet.fixture.away_team}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Selection:</span>
              <span className="font-bold">{selectedBet.outcome.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Odds:</span>
              <span className="font-bold text-primary">{selectedBet.odds.toFixed(2)}</span>
            </div>
          </div>

          {/* Bet Amount Input */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Bet Amount (USD)
            </label>
            <Input
              type="number"
              value={betAmount}
              onChange={(e) => setBetAmount(e.target.value)}
              placeholder="Enter amount"
              min="0"
              step="0.01"
            />
          </div>

          {/* Crypto Selection */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Crypto Type
            </label>
            <select
              value={selectedCrypto}
              onChange={(e) => setSelectedCrypto(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-secondary text-foreground"
            >
              <option>BTC</option>
              <option>ETH</option>
              <option>USDT</option>
              <option>USDC</option>
            </select>
          </div>

          {/* Potential Payout */}
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Potential Payout:</span>
              <span className="font-black text-primary">${potentialPayout}</span>
            </div>
          </div>

          {/* Place Bet Button */}
          <Button
            onClick={() => placeBet()}
            disabled={!betAmount || isBettingPending}
            className="w-full"
            size="lg"
          >
            {isBettingPending ? (
              <>
                <Loader className="w-4 h-4 mr-2 animate-spin" />
                Placing Bet...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 mr-2" />
                Place Bet
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
