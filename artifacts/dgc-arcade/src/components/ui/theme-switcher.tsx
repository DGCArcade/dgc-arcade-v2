import { useState } from "react";
import { THEMES, ThemeId, applyTheme, getTheme } from "@/lib/theme";
import { Button } from "./button";
import { Palette } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";

export function ThemeSwitcher() {
  const [current, setCurrent] = useState<ThemeId>(getTheme);

  const handleSelect = (id: ThemeId) => {
    applyTheme(id);
    setCurrent(id);
  };

  const activeTheme = THEMES.find(t => t.id === current) ?? THEMES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full relative" title="Switch theme">
          <Palette className="w-4 h-4" />
          <span
            className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-background"
            style={{ background: activeTheme.accent }}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 bg-card border-border/60 backdrop-blur-xl">
        <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">Theme</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {THEMES.map(t => (
          <DropdownMenuItem
            key={t.id}
            className={`cursor-pointer flex items-center gap-2 ${current === t.id ? "text-primary font-bold" : ""}`}
            onClick={() => handleSelect(t.id)}
          >
            <span
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ background: t.accent, boxShadow: current === t.id ? `0 0 6px ${t.accent}` : "none" }}
            />
            {t.emoji} {t.label}
            {current === t.id && <span className="ml-auto text-primary text-xs">✓</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
