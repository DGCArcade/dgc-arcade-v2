import React from "react";
import { Sportsbook } from "@/components/Sportsbook";

/**
 * Sportsbook Page
 * Full-width, mobile-first wrapper for the DGC Sports betting interface.
 * The Sportsbook component handles all state, odds fetching, and bet placement.
 */
export default function SportsBookPage() {
  return (
    <div className="min-h-screen bg-black w-full overflow-x-hidden">
      <div className="w-full max-w-[1600px] mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8">
        <Sportsbook />
      </div>
    </div>
  );
}
