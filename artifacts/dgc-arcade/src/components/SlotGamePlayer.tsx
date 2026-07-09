import React from "react";
import { useLocation } from "wouter";
import { SlotLobby } from "@/components/SlotLobby";

/**
 * SlotGamePlayer
 *
 * Renders the full slot lobby with the iframe player embedded.
 * When a user clicks a game tile, the SlotLobby opens the aggregator
 * iframe directly — no external component needed.
 *
 * Route: /slots/:slug
 */
interface SlotGamePlayerProps {
  gameId: string;
  onBack?: () => void;
}

export function SlotGamePlayer({ gameId, onBack }: SlotGamePlayerProps) {
  const [, setLocation] = useLocation();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      setLocation("/slots");
    }
  };

  // Render the lobby with the game pre-selected so the iframe opens immediately
  return (
    <SlotLobby
      onGameSelect={(id) => {
        if (id !== gameId) setLocation(`/slots/${id}`);
      }}
      initialGameId={gameId}
    />
  );
}
