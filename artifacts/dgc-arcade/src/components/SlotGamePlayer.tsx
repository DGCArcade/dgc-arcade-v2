import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Slots } from "@/components/games/slots";
import type { Game } from "@workspace/api-client-react";

/**
 * SlotGamePlayer
 *
 * Loads a slot game by slug from the DGC Arcade games API and renders it
 * using the built-in Slots component (no external iframe / RapidAPI required).
 *
 * Route: /slots/:slug
 */
interface SlotGamePlayerProps {
  gameId: string;
  onBack?: () => void;
}

export function SlotGamePlayer({ gameId, onBack }: SlotGamePlayerProps) {
  const [, setLocation] = useLocation();

  const { data: game, isLoading, error } = useQuery<Game>({
    queryKey: ["game-by-slug", gameId],
    queryFn: async () => {
      const res = await fetch(`/api/games/by-slug/${gameId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("dgc_token")}`,
        },
      });
      if (!res.ok) throw new Error("Game not found");
      return res.json();
    },
    retry: 1,
    staleTime: 1000 * 60 * 5,
  });

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      setLocation("/slots");
    }
  };

  if (isLoading) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-4" />
          <p className="text-white font-semibold">Loading game…</p>
          <p className="text-gray-500 text-xs mt-1 font-mono">{gameId}</p>
        </div>
      </div>
    );
  }

  if (error || !game) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-black">
        <div className="text-center space-y-4">
          <div className="text-5xl">🎰</div>
          <p className="text-white font-semibold">Game not found</p>
          <p className="text-gray-400 text-sm max-w-xs mx-auto">
            This slot game could not be loaded. It may have been removed or disabled.
          </p>
          <button
            onClick={handleBack}
            className="mt-2 px-4 py-2 rounded-lg border border-white/20 text-white hover:bg-white/10 transition-colors text-sm"
          >
            ← Back to Slots
          </button>
        </div>
      </div>
    );
  }

  // Render the built-in DGC slot engine — no external API needed
  return <Slots game={game} />;
}
