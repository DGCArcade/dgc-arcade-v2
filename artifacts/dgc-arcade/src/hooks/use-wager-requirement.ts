import { useAuth } from "@/hooks/use-auth";
import { formatCurrency } from "@/lib/format";
import type { ProfileUser } from "@/lib/profile-user";

export function useWagerRequirement() {
  const { user } = useAuth();
  const profileUser = user as ProfileUser | null;
  const totalWagered = parseFloat(String(profileUser?.totalWageredAmount ?? 0));
  const signupBonus = parseFloat(String(profileUser?.signupBonus ?? 0));
  const depositWagerReq = parseFloat(String(profileUser?.wagerRequirement ?? 0));
  const wagerRequirement = Math.max(signupBonus, depositWagerReq);
  const wagerRemaining = wagerRequirement > 0 ? Math.max(0, wagerRequirement - totalWagered) : 0;
  const wagerProgress = wagerRequirement > 0 ? totalWagered / wagerRequirement : 1;
  const wagerPercentage = wagerRequirement > 0 ? Math.min(100, Math.round(wagerProgress * 100)) : 100;
  const isWagerMet = wagerRequirement <= 0 || wagerRemaining <= 0;

  return {
    totalWagered,
    signupBonus,
    depositWagerReq,
    wagerRequirement,
    wagerRemaining,
    wagerPercentage,
    isWagerMet,
    formattedRemaining: formatCurrency(wagerRemaining),
    formattedRequirement: formatCurrency(wagerRequirement),
    formattedWagered: formatCurrency(totalWagered),
  };
}
