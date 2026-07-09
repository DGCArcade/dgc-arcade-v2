import React, { useState, useEffect } from "react";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Badge } from "@workspace/ui/components/badge";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Maximize2, Volume2, VolumeX } from "lucide-react";
import { useNavigate } from "wouter";

interface SlotGamePlayerProps {
  gameId: string;
  onBack?: () => void;
}

export function SlotGamePlayer({ gameId, onBack }: SlotGamePlayerProps) {
  const navigate = useNavigate();
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Fetch game launch URL from backend
  const { data: gameSession, isLoading, error } = useQuery({
    queryKey: ["slot-game", gameId],
    queryFn: async () => {
      const response = await fetch(`/api/slots/launch?game_id=${gameId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("dgc_token")}`,
        },
      });
      if (!response.ok) throw new Error("Failed to launch game");
      return response.json();
    },
  });

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
      navigate("/slots");
    }
  };

  if (isLoading) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4" />
          <p className="text-white">Loading game...</p>
        </div>
      </div>
    );
  }

  if (error || !gameSession?.launchUrl) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <p className="text-white mb-4">Failed to load game. Please try again.</p>
          <Button onClick={handleBack} variant="outline">
            Back to Slots
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen bg-black flex flex-col">
      {/* Header Controls */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="text-white hover:bg-slate-700"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-white font-semibold">Premium Slot Game</h2>
            <p className="text-xs text-gray-400">Game ID: {gameId}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsMuted(!isMuted)}
            className="text-white hover:bg-slate-700"
          >
            {isMuted ? (
              <VolumeX className="w-5 h-5" />
            ) : (
              <Volume2 className="w-5 h-5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleFullscreen}
            className="text-white hover:bg-slate-700"
          >
            <Maximize2 className="w-5 h-5" />
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
          title="Slot Game Stream"
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-presentation"
        />
      </div>

      {/* Mobile Bottom Navigation Indicator */}
      <div className="md:hidden bg-slate-900 p-2 text-center text-xs text-gray-400">
        Tap the fullscreen icon for immersive gameplay
      </div>
    </div>
  );
}
