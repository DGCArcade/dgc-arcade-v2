export type ThemeId = "dgc" | "cyber" | "futuristic" | "blood" | "ocean";

export interface Theme {
  id: ThemeId;
  label: string;
  emoji: string;
  accent: string;
}

export const THEMES: Theme[] = [
  { id: "dgc",        label: "DGC Gold",    emoji: "⚡", accent: "#FFD700" },
  { id: "cyber",      label: "Cyber",       emoji: "💻", accent: "#00FF41" },
  { id: "futuristic", label: "Futuristic",  emoji: "🌌", accent: "#B44FFF" },
  { id: "blood",      label: "Blood",       emoji: "🔴", accent: "#FF1E1E" },
  { id: "ocean",      label: "Ocean",       emoji: "🌊", accent: "#00D4E8" },
];

const STORAGE_KEY = "dgc_theme";

export function getTheme(): ThemeId {
  if (typeof localStorage === "undefined") return "dgc";
  return (localStorage.getItem(STORAGE_KEY) as ThemeId) ?? "dgc";
}

export function applyTheme(id: ThemeId) {
  const html = document.documentElement;
  THEMES.forEach(t => html.classList.remove(`theme-${t.id}`));
  if (id !== "dgc") html.classList.add(`theme-${id}`);
  localStorage.setItem(STORAGE_KEY, id);
}

export function initTheme() {
  applyTheme(getTheme());
}
