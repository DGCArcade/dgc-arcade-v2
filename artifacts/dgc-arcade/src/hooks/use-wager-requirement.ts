import { useAuth } from "@/hooks/use-auth";
import { formatCurrency } from "@/lib/format";

export function useWagerRequirement() {
  const { user } = useAuth();
  const totalWagered = parseFloat(String((user as { totalWageredAmount?: number })?.totalWageredAmount ?? 0));
  // Prefer the account's stored signup bonus (synced from owner settings). Only fall back
  // when the field is missing entirely — never coerce an intentional 0 up to 100.
  const rawSignup = (user as { signupBonus?: number | string | null } | null)?.signupBonus;
  const signupBonus = rawSignup === undefined || rawSignup === null
    ? 0
    : parseFloat(String(rawSignup));
  const depositWagerReq = parseFloat(String((user as { wagerRequirement?: number })?.wagerRequirement ?? 0));
  const wagerRequirement = Math.max(signupBonus || 0, depositWagerReq || 0);
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
