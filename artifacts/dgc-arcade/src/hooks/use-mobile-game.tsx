import type { ReactNode } from "react";

/** Kept for App.tsx compatibility — games now open via /games/:id navigation. */
export function MobileGameProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useMobileGame() {
  return null;
}
