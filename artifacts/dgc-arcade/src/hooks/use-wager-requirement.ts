import { useAuth } from "@/hooks/use-auth";
import { formatCurrency } from "@/lib/format";

export function useWagerRequirement() {
  const { user } = useAuth();
  const totalWagered = parseFloat(String((user as { totalWageredAmount?: number })?.totalWageredAmount ?? 0));
  const signupBonus = parseFloat(String((user as { signupBonus?: number })?.signupBonus ?? 100));
  const depositWagerReq = parseFloat(String((user as { wagerRequirement?: number })?.wagerRequirement ?? 0));
  const wagerRequirement = Math.max(signupBonus, depositWagerReq);
  const wagerRemaining = Math.max(0, wagerRequirement - totalWagered);
  const wagerProgress = wagerRequirement > 0 ? totalWagered / wagerRequirement : 1;
  const wagerPercentage = Math.min(100, Math.round(wagerProgress * 100));
  const isWagerMet = wagerRemaining <= 0;

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
  };
}
