import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { Play, Zap } from "lucide-react";

interface Game {
  id: number;
  slug: string;
  name: string;
  description: string;
  imageUrl?: string | null;
  minBet: number;
  maxBet: number;
  houseEdge?: number | null;
  active: boolean;
}

interface GameCardProps {
  game: Game;
}

const GAME_IMAGES: Record<string, string> = {
  coinflip:
    "https://images.unsplash.com/photo-1621761191319-c6fb62004040?w=800&q=80&fit=crop&crop=center",
  slots:
    "https://images.unsplash.com/photo-1596838132731-3301c3fd4317?w=800&q=80&fit=crop&crop=center",
  crash:
    "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&q=80&fit=crop&crop=center",
};

const GAME_COLORS: Record<string, string> = {
  coinflip: "from-amber-500/30 to-yellow-600/10",
  slots: "from-purple-500/30 to-pink-600/10",
  crash: "from-green-500/30 to-emerald-600/10",
};

const GAME_ICON_COLORS: Record<string, string> = {
  coinflip: "text-amber-400",
  slots: "text-purple-400",
  crash: "text-green-400",
};

export function GameCard({ game }: GameCardProps) {
  const imageUrl = game.imageUrl || GAME_IMAGES[game.slug] || GAME_IMAGES.crash;
  const colorClass = GAME_COLORS[game.slug] || "from-primary/20 to-primary/5";
  const iconColor = GAME_ICON_COLORS[game.slug] || "text-primary";

  return (
    <Link href={`/games/${game.id}`}>
      <Card className="group relative overflow-hidden bg-card border-border/50 hover:border-primary/50 transition-all duration-400 cursor-pointer h-full flex flex-col card-hover-glow">
        {/* Image */}
        <div className="aspect-[16/9] relative overflow-hidden bg-secondary">
          <img
            src={imageUrl}
            alt={game.name}
            className="w-full h-full object-cover opacity-70 group-hover:opacity-95 group-hover:scale-110 transition-all duration-700"
            loading="lazy"
          />
          <div className={`absolute inset-0 bg-gradient-to-br ${colorClass} mix-blend-multiply`} />
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />

          {/* Play button on hover */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
            <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-[0_0_32px_rgba(255,215,0,0.6)] transform scale-75 group-hover:scale-100 transition-transform duration-300">
              <Play className="w-7 h-7 ml-1" fill="currentColor" />
            </div>
          </div>

          {/* Live badge */}
          <div className="absolute top-3 left-3">
            <span className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-green-400 border border-green-500/30">
              <span className="live-dot w-1.5 h-1.5 rounded-full bg-green-400 block" />
              Live
            </span>
          </div>

          {/* House edge badge */}
          {game.houseEdge != null && (
            <div className="absolute top-3 right-3">
              <span className="bg-black/60 backdrop-blur-sm rounded-full px-2.5 py-1 text-xs font-mono text-muted-foreground border border-border/40">
                {game.houseEdge}% edge
              </span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-5 flex-1 flex flex-col gap-3">
          <div className="flex justify-between items-start gap-2">
            <h3 className="font-display font-bold text-xl text-foreground group-hover:text-primary transition-colors uppercase tracking-wide leading-tight">
              {game.name}
            </h3>
            <Zap className={`w-5 h-5 flex-shrink-0 mt-0.5 ${iconColor}`} />
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed flex-1">
            {game.description}
          </p>

          <div className="flex items-center justify-between text-xs font-mono text-muted-foreground pt-3 border-t border-border/40">
            <span>Min <span className="text-foreground font-bold">{formatCurrency(game.minBet)}</span></span>
            <span>Max <span className="text-foreground font-bold">{formatCurrency(game.maxBet)}</span></span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
