import { useEffect, useState } from "react";
import {
  useGetMe,
  getGetMeQueryKey,
  useLogout,
  clearAuthToken,
  getApiErrorStatus,
  onSessionExpired,
  onAuthLogin,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthModal } from "./use-auth-modal";

export interface CryptoBalance {
  currency: string;
  amount: number;
  price: number;
  usdValue: number;
}

function readHasToken(): boolean {
  return typeof localStorage !== "undefined" && !!localStorage.getItem("dgc_token");
}

export function useAuth() {
  const queryClient = useQueryClient();
  const [hasToken, setHasToken] = useState(readHasToken);

  useEffect(() => {
    const syncToken = () => setHasToken(readHasToken());
    const clearSession = () => {
      clearAuthToken();
      queryClient.setQueryData(getGetMeQueryKey(), null);
      queryClient.cancelQueries({ queryKey: getGetMeQueryKey() });
      setHasToken(false);
    };
    const unsubExpired = onSessionExpired(clearSession);
    const unsubLogin = onAuthLogin(syncToken);
    return () => {
      unsubExpired();
      unsubLogin();
    };
  }, [queryClient]);

  const { data: user, isLoading, isPending, isFetching, isError } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      enabled: hasToken,
      retry: (count, error) => {
        const status = getApiErrorStatus(error);
        if (status === 401 || status === 403) return false;
        return count < 1;
      },
      staleTime: 30_000,
      gcTime: 1000 * 60 * 60,
      refetchInterval: (query) => {
        if (!readHasToken()) return false;
        if (query.state.status === "error") return false;
        if (!query.state.data) return false;
        return 30_000;
      },
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
    },
  });

  const logoutMutation = useLogout();
  const authModal = useAuthModal();

  const logout = () => {
    logoutMutation.mutate(undefined, {
      onSettled: () => {
        clearAuthToken();
        queryClient.cancelQueries({ queryKey: getGetMeQueryKey() });
        queryClient.setQueryData(getGetMeQueryKey(), null);
        setHasToken(false);
      },
    });
  };

  const requireAuth = (callback: () => void) => {
    if (!user) {
      authModal.open("login");
      return;
    }
    if (!(user as any).emailVerified) {
      window.dispatchEvent(new CustomEvent("openVerificationModal", { detail: { required: true } }));
      return;
    }
    callback();
  };

  const cryptoBalances: CryptoBalance[] = (user as any)?.cryptoBalances ?? [];
  const isInitialAuthLoading = hasToken && isPending && !user && !isError;

  return {
    user: user ?? null,
    isLoading: isInitialAuthLoading,
    isInitialAuthLoading,
    isFetching,
    isAuthenticated: !!user,
    logout,
    requireAuth,
    cryptoBalances,
  };
}
