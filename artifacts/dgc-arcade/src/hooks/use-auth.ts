import { useGetMe, getGetMeQueryKey, useLogout } from "@workspace/api-client-react";
import { clearAuthToken } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthModal } from "./use-auth-modal";

export interface CryptoBalance {
  currency: string;
  amount: number;
  price: number;
  usdValue: number;
}

export function useAuth() {
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: (count, error: any) => {
        // Only retry if it's a network error, not a 401/403
        if (error?.response?.status === 401 || error?.response?.status === 403) return false;
        return count < 2;
      },
      staleTime: 30000, // Keep user data fresh for 30s to prevent flickering on refresh
      gcTime: 1000 * 60 * 60, // Cache user data for 1 hour
      refetchInterval: 5000,
      refetchOnWindowFocus: true,
      refetchOnMount: false, // Don't refetch on every mount if we have cached data
    },
  });

  const logoutMutation = useLogout();
  
  const authModal = useAuthModal();

  const logout = () => {
    logoutMutation.mutate(undefined, {
      onSettled: () => {
        clearAuthToken();
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        queryClient.setQueryData(getGetMeQueryKey(), null);
      }
    });
  };

  const requireAuth = (callback: () => void) => {
    if (!user) {
      authModal.open("login");
    } else {
      callback();
    }
  };

  const cryptoBalances: CryptoBalance[] = (user as any)?.cryptoBalances ?? [];

  return {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user,
    logout,
    requireAuth,
    cryptoBalances,
  };
}
