import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Maximize2, Volume2, VolumeX, Zap } from "lucide-react";
import { useLocation } from "wouter";

interface SlotGamePlayerProps {
  gameId: string;
  onBack?: () => void;
}

export function SlotGamePlayer({ gameId, onBack }: SlotGamePlayerProps) {
  const [, setLocation] = useLocation();
  const [isMuted, setIsMuted] = useState(false);
  const [, setIsFullscreen] = useState(false);

  // Fetch game launch URL from backend (tries RapidAPI first, falls back to casino provider)
  const { data: gameSession, isLoading, error } = useQuery({
    queryKey: ["slot-game", gameId],
    queryFn: async () => {
      // Try RapidAPI launcher first
      try {
        const rapidResponse = await fetch(`/api/slots/launch-rapidapi`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("dgc_token")}`,
          },
          body: JSON.stringify({
            gameId,
            gameName: gameId,
            provider: "rapidapi",
            cryptoType: "BTC",
          }),
        });
        if (rapidResponse.ok) {
          return rapidResponse.json();
        }
      } catch (e) {
        console.warn("RapidAPI launcher failed, falling back to casino provider", e);
      }

      // Fallback to original casino provider launcher
      const response = await fetch(`/api/slots/launch?game_id=${gameId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("dgc_token")}`,
        },
      });
      if (!response.ok) throw new Error("Failed to launch game");
      return response.json();
    },
  });

  // Also fetch the catalog to display the game name in the header
  const { data: catalog = [] } = useQuery<Array<{ id: string; title: string; provider: string }>>({
    queryKey: ["slot-games"],
    queryFn: async () => {
      const res = await fetch("/api/slots/catalog", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("dgc_token")}`,
        },
      });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  const gameInfo = catalog.find((g) => g.id === gameId);

  const handleFullscreen = () => {
    const iframeElement = document.getElementById("slot-iframe") as HTMLIFrameElement;
    if (iframeElement?.requestFullscreen) {
      iframeElement.requestFullscreen();
      setIsFullscreen(true);
    }
  };

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
          <p className="text-white font-semibold">Loading game stream…</p>
          <p className="text-gray-500 text-xs mt-1 font-mono">{gameId}</p>
        </div>
      </div>
    );
  }

  if (error || !gameSession?.launchUrl) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-black">
        <div className="text-center space-y-4">
          <div className="text-5xl">🎰</div>
          <p className="text-white font-semibold">Unable to launch game</p>
          <p className="text-gray-400 text-sm max-w-xs mx-auto">
            The game session could not be started. Please ensure your casino credentials are configured.
          </p>
          <Button onClick={handleBack} variant="outline" className="mt-2">
            ← Back to Slots
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen bg-black flex flex-col">
      {/* Header Controls */}
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-b border-white/10 px-4 py-3 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="text-white hover:bg-white/10 h-9 w-9"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <div>
              <h2 className="text-white font-bold text-sm leading-tight">
                {gameInfo?.title ?? "Premium Slot"}
              </h2>
              <p className="text-gray-400 text-[11px] font-mono">
                {gameInfo?.provider ?? gameId}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsMuted(!isMuted)}
            className="text-white hover:bg-white/10 h-9 w-9"
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleFullscreen}
            className="text-white hover:bg-white/10 h-9 w-9"
            title="Fullscreen"
          >
            <Maximize2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Game Stream Container */}
      <div className="flex-1 relative overflow-hidden">
        <iframe
          id="slot-iframe"
          src={gameSession.launchUrl}
          className="w-full h-full border-none"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          title={gameInfo?.title ?? "Slot Game Stream"}
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-presentation"
        />
      </div>

      {/* Mobile hint */}
      <div className="md:hidden bg-slate-950 border-t border-white/10 py-2 text-center text-[11px] text-gray-500">
        Tap the fullscreen icon for the best experience
      </div>
    </div>
  );
}
