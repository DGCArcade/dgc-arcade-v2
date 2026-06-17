import { useListGames, getListGamesQueryKey } from "@workspace/api-client-react";
import { GameCard } from "@/components/games/game-card";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";

const SLOT_SLUGS = ["slots", "lucky-slots", "dragon-realm"];

export default function Games() {
  const { data: games, isLoading } = useListGames({
    query: { queryKey: getListGamesQueryKey() }
  });
  const [search, setSearch] = useState("");

  // Slots have their own dedicated page — exclude them here
  const filteredGames = Array.isArray(games)
    ? games.filter(g => g.active && !SLOT_SLUGS.includes(g.slug) && g.name.toLowerCase().includes(search.toLowerCase()))
    : [];

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-border/50 pb-6">
        <div>
          <h1 className="font-display font-black text-4xl uppercase tracking-widest mb-2">Games Lobby</h1>
          <p className="text-muted-foreground">Choose your game and place your bets.</p>
        </div>
        
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search games..." 
            className="pl-10 bg-secondary border-border"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Slots promo banner */}
      <Link href="/slots" className="block group">
        <div className="flex items-center justify-between gap-4 px-6 py-4 rounded-xl bg-gradient-to-r from-purple-900/40 to-primary/20 border border-primary/30 hover:border-primary/60 transition-all duration-300 cursor-pointer">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🎰</span>
            <div>
              <p className="font-display font-black uppercase tracking-widest text-foreground group-hover:text-primary transition-colors">Looking for Slots?</p>
              <p className="text-xs text-muted-foreground">Dragon Realm and more — all in the dedicated Slots section.</p>
            </div>
          </div>
          <span className="text-sm font-bold uppercase tracking-wider text-primary whitespace-nowrap">Go to Slots →</span>
        </div>
      </Link>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="aspect-[3/4] bg-secondary animate-pulse rounded-lg border border-border" />
          ))}
        </div>
      ) : filteredGames.length === 0 ? (
        <div className="text-center py-20 bg-secondary/50 rounded-lg border border-border border-dashed">
          <p className="text-muted-foreground font-mono">No games found matching "{search}"</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredGames.map(game => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      )}
    </div>
  );
}
