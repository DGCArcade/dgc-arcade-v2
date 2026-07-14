import { useQuery } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/api-fetch";

export interface LiveCrashRound {
  roundId: string;
  state: "betting" | "flying" | "crashed" | "results";
  startedAt: number;
  bettingEndsAt: number;
  flyingStartedAt?: number;
  timeRemaining: number;
  currentMultiplier: number;
  crashPoint?: number;
  betCount: number;
  totalBetAmount: number;
  serverSeedHash?: string;
  serverSeed?: string;
  clientSeed?: string;
}

export interface LiveCrashBet {
  username: string;
  amount: number;
  cashoutAt: number;
  won?: boolean;
  payout?: number;
}

async function fetchCrashRound() {
  const token = localStorage.getItem("dgc_token");
  const resp = await fetch(getApiUrl("/api/crash/live/round"), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!resp.ok) throw new Error("Failed to fetch crash round");
  return resp.json() as Promise<{ round: LiveCrashRound | null; bets: LiveCrashBet[] }>;
}

export function useCrashLiveRound() {
  return useQuery({
    queryKey: ["crash-live-round"],
    queryFn: fetchCrashRound,
    refetchInterval: 150,
    refetchIntervalInBackground: true,
  });
}
