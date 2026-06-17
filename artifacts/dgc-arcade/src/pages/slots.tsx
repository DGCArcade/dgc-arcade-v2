import { useListGames, getListGamesQueryKey } from "@workspace/api-client-react";
import { GameCard } from "@/components/games/game-card";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useState } from "react";

const SLOT_SLUGS = ["slots", "lucky-slots", "dragon-realm"];

export default function SlotsPage() {
  const { data: games, isLoading } = useListGames({
    query: { queryKey: getListGamesQueryKey() }
  });
  const [search, setSearch] = useState("");

  const slotGames = Array.isArray(games)
    ? games.filter(g => g.active && SLOT_SLUGS.includes(g.slug) && g.name.toLowerCase().includes(search.toLowerCase()))
    : [];

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-border/50 pb-6">
        <div>
          <h1 className="font-display font-black text-4xl uppercase tracking-widest mb-2">
            🎰 Slots
          </h1>
          <p className="text-muted-foreground">Spin the reels and chase the jackpot.</p>
        </div>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search slots..."
            className="pl-10 bg-secondary border-border"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="aspect-[3/4] bg-secondary animate-pulse rounded-lg border border-border" />
          ))}
        </div>
      ) : slotGames.length === 0 ? (
        <div className="text-center py-20 bg-secondary/50 rounded-lg border border-border border-dashed">
          <p className="text-muted-foreground font-mono">
            {search ? `No slots found matching "${search}"` : "No slot games available yet."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {slotGames.map(game => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      )}
    </div>
  );
}
