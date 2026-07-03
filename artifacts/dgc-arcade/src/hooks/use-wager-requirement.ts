import { useAuth } from "./use-auth";

export function useWagerRequirement() {
  const { user } = useAuth();

  const totalWagered = parseFloat(String((user as any)?.totalWageredAmount ?? 0));
  const signupBonus = parseFloat(String((user as any)?.signupBonus ?? 100));
  const dbWagerReq = parseFloat(String((user as any)?.wagerRequirement ?? 0));

  // The actual requirement is the MAX of signup bonus or the explicit DB requirement
  const requirement = Math.max(signupBonus, dbWagerReq);
  const remaining = Math.max(0, requirement - totalWagered);
  const isWagerMet = totalWagered >= requirement;
  const wagerPercentage = requirement > 0 ? Math.min(100, Math.floor((totalWagered / requirement) * 100)) : 100;

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(val);
  };

  return {
    isWagerMet,
    wagerPercentage,
    remaining,
    requirement,
    formattedRemaining: formatCurrency(remaining),
    formattedRequirement: formatCurrency(requirement),
  };
}
