import React, { useState, useMemo } from "react";
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Badge } from "@workspace/ui/components/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import { useNavigate } from "wouter";
import { Gamepad2, Search, Zap } from "lucide-react";

interface SlotGame {
  id: string;
  title: string;
  provider: string;
  thumbnail: string;
  rtp: number;
  volatility: "low" | "medium" | "high";
  jackpot?: number;
}

interface SlotLobbyProps {
  onGameSelect?: (gameId: string) => void;
}

export function SlotLobby({ onGameSelect }: SlotLobbyProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  // Fetch slot games catalog from the aggregator API
  const { data: games = [], isLoading } = useQuery({
    queryKey: ["slot-games"],
    queryFn: async () => {
      // TODO: Replace with actual aggregator API endpoint
      const response = await fetch("/api/slots/catalog", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("dgc_token")}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch slot games");
      return response.json();
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Extract unique providers for filter tabs
  const providers = useMemo(() => {
    const uniqueProviders = new Set(games.map((game: SlotGame) => game.provider));
    return Array.from(uniqueProviders).sort();
  }, [games]);

  // Filter games based on search and provider
  const filteredGames = useMemo(() => {
    return games.filter((game: SlotGame) => {
      const matchesSearch = game.title.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesProvider = !selectedProvider || game.provider === selectedProvider;
      return matchesSearch && matchesProvider;
    });
  }, [games, searchTerm, selectedProvider]);

  const handleGameClick = (gameId: string) => {
    if (onGameSelect) {
      onGameSelect(gameId);
    } else {
      navigate(`/slots/${gameId}`);
    }
  };

  return (
    <div className="w-full space-y-6 p-4 md:p-6">
      {/* Header with Live Jackpot Ticker */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Premium Slots</h1>
            <p className="text-muted-foreground mt-1">Authentic commercial slot streams from leading providers</p>
          </div>
          <div className="hidden md:flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 rounded-lg">
            <Zap className="w-4 h-4 text-white" />
            <span className="text-white font-semibold">Live Jackpot: $12,450.50</span>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Search 348+ slot titles..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-11 text-base"
          />
        </div>
      </div>

      {/* Provider Filter Tabs */}
      {providers.length > 0 && (
        <Tabs value={selectedProvider || "all"} onValueChange={(value) => setSelectedProvider(value === "all" ? null : value)}>
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 h-auto p-2 bg-muted">
            <TabsTrigger value="all" className="text-xs md:text-sm">
              All Games
            </TabsTrigger>
            {providers.map((provider) => (
              <TabsTrigger key={provider} value={provider} className="text-xs md:text-sm">
                {provider}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      {/* Games Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-video bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : filteredGames.length === 0 ? (
        <div className="text-center py-12">
          <Gamepad2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold">No games found</h3>
          <p className="text-muted-foreground">Try adjusting your search or filters</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredGames.map((game: SlotGame) => (
            <Card
              key={game.id}
              className="group cursor-pointer overflow-hidden transition-all hover:shadow-lg hover:-translate-y-1"
              onClick={() => handleGameClick(game.id)}
            >
              <CardContent className="p-0 relative aspect-video overflow-hidden bg-black">
                <img
                  src={game.thumbnail}
                  alt={game.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
                  <h3 className="font-semibold text-white text-sm">{game.title}</h3>
                  <p className="text-xs text-gray-300">{game.provider}</p>
                </div>
              </CardContent>
              <CardHeader className="p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className="text-xs">
                    RTP {game.rtp}%
                  </Badge>
                  <Badge
                    variant={
                      game.volatility === "low"
                        ? "secondary"
                        : game.volatility === "medium"
                          ? "default"
                          : "destructive"
                    }
                    className="text-xs"
                  >
                    {game.volatility.charAt(0).toUpperCase() + game.volatility.slice(1)}
                  </Badge>
                </div>
                {game.jackpot && (
                  <div className="text-xs font-semibold text-amber-600">
                    Jackpot: ${game.jackpot.toLocaleString()}
                  </div>
                )}
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
