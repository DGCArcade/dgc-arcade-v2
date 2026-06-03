import { useGetMe, getGetMeQueryKey, useLogout } from "@workspace/api-client-react";
import { clearAuthToken } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthModal } from "./use-auth-modal";

export function useAuth() {
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: false,
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

  return {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user,
    logout,
    requireAuth,
  };
}
