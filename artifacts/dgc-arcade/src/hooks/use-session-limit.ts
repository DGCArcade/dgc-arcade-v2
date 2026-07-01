import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

/** Polls session limit and shows a toast when the user's session cap is reached. */
export function useSessionLimit() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const alerted = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) {
      alerted.current = false;
      return;
    }

    const check = async () => {
      try {
        const token = localStorage.getItem("dgc_token");
        const res = await fetch("/api/users/me/limits", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        const limits = data.limits;
        if (!limits?.sessionLimitMinutes) return;

        const remaining = limits.sessionLimitMinutes - (limits.sessionMinutes ?? 0);
        if (remaining <= 0 && !alerted.current) {
          alerted.current = true;
          toast({
            title: "Session time limit reached",
            description: "You've hit your session limit. Take a break — new bets are blocked until you log in again.",
            variant: "destructive",
          });
        } else if (remaining > 0 && remaining <= 5 && !alerted.current) {
          toast({
            title: "Session ending soon",
            description: `${remaining} minute${remaining === 1 ? "" : "s"} left in your session.`,
          });
        }
      } catch {
        // ignore
      }
    };

    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [isAuthenticated, toast]);
}
