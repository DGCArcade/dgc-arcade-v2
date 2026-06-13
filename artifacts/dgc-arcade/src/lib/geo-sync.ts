const PENDING_GEO_KEY = "dgc_pending_geo";

// Persist a geo payload collected by the location gate when the visitor is not
// yet logged in (no token), so it can be flushed to their account right after
// they authenticate. This is what makes locationVerified — and therefore
// withdrawals — work for brand-new users in their very first session.
export function savePendingGeo(payload: Record<string, unknown>) {
  try {
    localStorage.setItem(PENDING_GEO_KEY, JSON.stringify(payload));
  } catch {
    /* ignore storage failures */
  }
}

// Post any pending geo payload to the logged-in user's account, then clear it.
// Safe to call repeatedly; no-op when there is nothing pending or no token.
export async function flushPendingGeo() {
  try {
    const raw = localStorage.getItem(PENDING_GEO_KEY);
    if (!raw) return;
    const token = localStorage.getItem("dgc_token");
    if (!token) return;
    const apiUrl = (import.meta.env.VITE_API_URL ?? "") + "/api/users/geo";
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: raw,
    });
    if (res.ok) localStorage.removeItem(PENDING_GEO_KEY);
  } catch {
    /* non-blocking */
  }
}
