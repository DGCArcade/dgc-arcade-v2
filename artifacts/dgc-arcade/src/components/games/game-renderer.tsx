import type { Game } from "@workspace/api-client-react";
import { Coinflip } from "@/components/games/coinflip";
import { Slots } from "@/components/games/slots";
import { Crash } from "@/components/games/crash";
import { Blackjack } from "@/components/games/blackjack";
import { Roulette } from "@/components/games/roulette";
import { Mines } from "@/components/games/mines";
import { HiLo } from "@/components/games/hilo";
import { Keno } from "@/components/games/keno";
import { DiceGameLive as DiceGame } from "@/components/games/dice-game-live";
import { ChickenRoad } from "@/components/games/chicken-road";
import { ErrorBoundary } from "@/components/error-boundary";

export function GameRenderer({ game }: { game: Game }) {
  function renderGame() {
    switch (game.slug) {
      case "coinflip": return <Coinflip game={game} />;
      case "slots": return <Slots game={game} />;
      case "crash": return <Crash game={game} />;
      case "blackjack": return <Blackjack game={game} />;
      case "roulette": return <Roulette game={game} />;
      case "mines": return <Mines game={game} />;
      case "hilo": return <HiLo game={game} />;
      case "keno": return <Keno game={game} />;
      case "dice": return <DiceGame game={game} />;
      case "chicken-road": return <ChickenRoad game={game} />;
      default:
        return (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-4 border border-border/50 rounded-xl bg-secondary/30">
            <div className="text-6xl font-display font-black text-primary/20">{game.slug.charAt(0).toUpperCase()}</div>
            <p className="text-muted-foreground">Game coming soon</p>
          </div>
        );
    }
  }

  return (
    <ErrorBoundary key={game.slug}>
      {renderGame()}
    </ErrorBoundary>
  );
}
