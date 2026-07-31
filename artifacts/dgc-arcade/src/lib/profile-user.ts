import type { User } from "@workspace/api-client-react";
import type { CryptoBalance } from "@/hooks/use-auth";

/** Extended user fields returned by GET /api/auth/me but not in generated OpenAPI types. */
export interface ProfileUser extends User {
  cryptoBalances?: CryptoBalance[];
  totalWageredAmount?: number;
  rakebackClaimed?: number;
  signupBonus?: number;
  wagerRequirement?: number;
  bonusWagered?: number;
  telegramUsername?: string | null;
  lastLoginAt?: string | null;
  referralCode?: string | null;
}

export function asProfileUser(user: User | null | undefined): ProfileUser | null {
  if (!user) return null;
  return user as ProfileUser;
}
