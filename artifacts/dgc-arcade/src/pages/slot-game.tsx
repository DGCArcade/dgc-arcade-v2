import React from "react";
import { useRoute } from "wouter";
import { SlotGamePlayer } from "@/components/SlotGamePlayer";

export default function SlotGamePage() {
  const [, params] = useRoute("/slots/:slug");
  const slug = params?.slug;

  if (!slug) {
    return (
      <div className="flex items-center justify-center h-screen bg-black text-white font-display uppercase tracking-widest">
        Game not found
      </div>
    );
  }

  return <SlotGamePlayer gameId={slug} />;
}
