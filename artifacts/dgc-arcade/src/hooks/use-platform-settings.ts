import { useQuery } from "@tanstack/react-query";

export interface PublicSettings {
  slotsEnabled: boolean;
  sportsbookEnabled: boolean;
  raceEnabled: boolean;
  leaderboardEnabled: boolean;
  gamesEnabled: boolean;
  maintenanceMode: boolean;
  disabledGameSlugs: string[];
  custom404Enabled: boolean;
  custom404Title: string;
  custom404Message: string;
  custom404ButtonText: string;
  custom404ButtonUrl: string;
}

const DEFAULTS: PublicSettings = {
  slotsEnabled: false,
  sportsbookEnabled: true,
  raceEnabled: true,
  leaderboardEnabled: true,
  gamesEnabled: true,
  maintenanceMode: false,
  disabledGameSlugs: [],
  custom404Enabled: false,
  custom404Title: "Page Not Found",
  custom404Message: "The page you're looking for doesn't exist or has been moved.",
  custom404ButtonText: "Back to Home",
  custom404ButtonUrl: "/",
};

export function usePlatformSettings() {
  const { data, isLoading, error } = useQuery<PublicSettings>({
    queryKey: ["/api/games/settings"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/games/settings");
        if (!res.ok) return DEFAULTS;
        return res.json();
      } catch (e) {
        return DEFAULTS;
      }
    },
    staleTime: 60000,
    retry: 1,
  });

  return {
    settings: data ?? DEFAULTS,
    isLoading: isLoading && !data,
    error,
  };
}
