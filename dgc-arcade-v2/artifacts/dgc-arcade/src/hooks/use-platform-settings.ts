import { useQuery } from "@tanstack/react-query";

export interface PublicSettings {
  slotsEnabled: boolean;
  raceEnabled: boolean;
  leaderboardEnabled: boolean;
  gamesEnabled: boolean;
  maintenanceMode: boolean;
}

export function usePlatformSettings() {
  const { data, isLoading, error } = useQuery<PublicSettings>({
    queryKey: ["/api/games/settings"],
    queryFn: async () => {
      const res = await fetch("/api/games/settings");
      if (!res.ok) throw new Error("Failed to fetch settings");
      return res.json();
    },
    staleTime: 60000, // 1 minute
  });

  return {
    settings: data ?? {
      slotsEnabled: true,
      raceEnabled: true,
      leaderboardEnabled: true,
      gamesEnabled: true,
      maintenanceMode: false,
    },
    isLoading,
    error,
  };
}
