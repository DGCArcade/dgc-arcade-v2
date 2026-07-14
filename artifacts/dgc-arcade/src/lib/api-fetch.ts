/**
 * Shared API fetch utility to ensure VITE_API_URL is respected across all manual fetches.
 * This fixes production issues where relative /api paths fail on static hosting.
 */

export function getApiUrl(path: string): string {
  const baseUrl = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  
  // If we have a base URL and the path is relative, combine them
  if (baseUrl && cleanPath.startsWith("/api")) {
    return `${baseUrl}${cleanPath}`;
  }
  
  return cleanPath;
}

export function authHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("dgc_token") : null;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  
  return headers;
}

/**
 * A wrapper around native fetch that automatically prepends VITE_API_URL 
 * and adds Authorization headers if a token exists.
 */
export async function apiFetch(path: string, options: RequestInit = {}) {
  const url = getApiUrl(path);
  const headers = authHeaders((options.headers as Record<string, string>) || {});
  
  const response = await fetch(url, {
    ...options,
    headers,
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Request failed with status ${response.status}`);
  }
  
  return response.json();
}
