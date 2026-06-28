import { useQuery } from "@tanstack/react-query";
// The generated API doesn't have a generic apiClient, we use the customFetch utility
// which is exported from the workspace package
import { setBaseUrl } from "@workspace/api-client-react";

// Helper to perform manual fetch using the same logic as the generated hooks
async function manualFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem("dgc_token");
  const resp = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  
  if (!resp.ok) {
    const error = await resp.json().catch(() => ({ error: "Unknown error" }));
    throw error;
  }
  
  return resp.json();
}

export interface LiveDiceRound {
  roundId: string;
  state: "betting" | "rolling" | "results";
  startedAt: number;
  bettingEndsAt: number;
  timeRemaining: number;
  roll?: number;
  betCount: number;
  totalBetAmount: number;
}

export interface LiveDiceBet {
  username: string;
  amount: number;
  target: number;
  mode: "over" | "under";
  won?: boolean;
  payout?: number;
}

export interface DiceLiveRoundResponse {
  round: LiveDiceRound | null;
  bets: LiveDiceBet[];
}

/**
 * Hook to poll the current live Dice round state
 */
export function useDiceLiveRound() {
  return useQuery({
    queryKey: ["dice-live-round"],
    queryFn: async () => {
      return manualFetch<DiceLiveRoundResponse>("/api/dice/live/round");
    },
    refetchInterval: 500,
    refetchIntervalInBackground: true,
  });
}

/**
 * Hook to get round history
 */
export function useDiceLiveHistory(limit: number = 10) {
  return useQuery({
    queryKey: ["dice-live-history", limit],
    queryFn: async () => {
      return manualFetch<{ rounds: any[] }>(`/api/dice/live/history?limit=${limit}`);
    },
    refetchInterval: 5000,
  });
}
