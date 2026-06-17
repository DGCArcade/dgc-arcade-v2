import { useListGames, getListGamesQueryKey } from "@workspace/api-client-react";
import { GameCard } from "@/components/games/game-card";
import { Input } from "@/components/ui/input";
import { Search, Layers } from "lucide-react";
import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";

const SLOT_SLUGS = ["slots", "lucky-slots", "dragon-realm"];

interface SlotTheme {
  id: number;
  slug: string;
  name: string;
  config: any;
  assets: any;
  active: string;
  createdAt: string;
  updatedAt: string;
}

export default function SlotsPage() {
  const { data: games, isLoading: gamesLoading } = useListGames({
    query: { queryKey: getListGamesQueryKey() }
  });
  const [search, setSearch] = useState("");
  const [slotThemes, setSlotThemes] = useState<SlotTheme[]>([]);
  const [themesLoading, setThemesLoading] = useState(true);

  useEffect(() => {
    fetch("/api/games/slot-themes")
      .then((r) => r.json())
      .then((data) => {
        setSlotThemes(data.themes ?? []);
      })
      .catch(() => {})
      .finally(() => setThemesLoading(false));
  }, []);

  const slotGames = Array.isArray(games)
    ? games.filter(g => g.active && SLOT_SLUGS.includes(g.slug) && g.name.toLowerCase().includes(search.toLowerCase()))
    : [];

  const filteredThemes = slotThemes.filter(
    t => t.name.toLowerCase().includes(search.toLowerCase())
  );

  const isLoading = gamesLoading || themesLoading;
  const hasContent = slotGames.length > 0 || filteredThemes.length > 0;

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
      ) : !hasContent ? (
        <div className="text-center py-20 bg-secondary/50 rounded-lg border border-border border-dashed">
          <p className="text-muted-foreground font-mono">
            {search ? `No slots found matching "${search}"` : "No slot games available yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {slotGames.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {slotGames.map(game => (
                <GameCard key={game.id} game={game} />
              ))}
            </div>
          )}

          {filteredThemes.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Layers className="w-4 h-4 text-amber-400" />
                <h2 className="font-display font-bold uppercase tracking-wider text-sm text-muted-foreground">
                  Themed Slots
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredThemes.map((theme) => (
                  <div
                    key={theme.id}
                    className="aspect-[3/4] bg-gradient-to-b from-purple-900/40 to-card border border-purple-500/30 rounded-lg flex flex-col items-center justify-center gap-3 p-6 relative overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-b from-purple-500/5 to-transparent pointer-events-none" />
                    <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-2">
                      <span className="text-3xl">🎰</span>
                    </div>
                    <h3 className="font-display font-black text-lg uppercase tracking-wider text-center">
                      {theme.name}
                    </h3>
                    <p className="text-xs text-muted-foreground font-mono text-center">{theme.slug}</p>
                    <div className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
                      {theme.config?.reels && (
                        <span>{theme.config.reels} Reels · {theme.config.rows} Rows</span>
                      )}
                      {theme.config?.rtp && (
                        <span className="text-green-400 font-bold">{theme.config.rtp}% RTP</span>
                      )}
                    </div>
                    <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs mt-auto">
                      Theme Active
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
