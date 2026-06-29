import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Game } from "@workspace/api-client-react";
import { ChevronLeft, X } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { GameRenderer } from "@/components/games/game-renderer";

interface MobileGameContextValue {
  isOpen: boolean;
  activeGame: Game | null;
  openGame: (game: Game) => void;
  closeGame: () => void;
}

const MobileGameContext = createContext<MobileGameContextValue | null>(null);

function MobileGameOverlay({ game, onClose }: { game: Game; onClose: () => void }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  return createPortal(
    <div className="mobile-game-overlay" role="dialog" aria-modal="true" aria-label={game.name}>
      <div className="mobile-game-overlay-header">
        <button type="button" onClick={onClose} className="mobile-game-overlay-back">
          <ChevronLeft className="w-5 h-5" />
          <span>Back</span>
        </button>
        <div className="mobile-game-overlay-title">
          <h1>{game.name}</h1>
          <p>{formatCurrency(game.minBet)} – {formatCurrency(game.maxBet)}</p>
        </div>
        <button type="button" onClick={onClose} className="mobile-game-overlay-close" aria-label="Close game">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="mobile-game-overlay-body">
        <GameRenderer game={game} />
      </div>
    </div>,
    document.body,
  );
}

export function MobileGameProvider({ children }: { children: ReactNode }) {
  const [activeGame, setActiveGame] = useState<Game | null>(null);

  const openGame = useCallback((game: Game) => {
    setActiveGame(game);
  }, []);

  const closeGame = useCallback(() => {
    setActiveGame(null);
  }, []);

  return (
    <MobileGameContext.Provider value={{ isOpen: !!activeGame, activeGame, openGame, closeGame }}>
      {children}
      {activeGame && <MobileGameOverlay game={activeGame} onClose={closeGame} />}
    </MobileGameContext.Provider>
  );
}

export function useMobileGame() {
  return useContext(MobileGameContext);
}
