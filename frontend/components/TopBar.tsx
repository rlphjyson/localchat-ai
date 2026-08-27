"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";

export function TopBar() {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="flex items-center justify-end gap-1 border-b px-4 py-2">
      <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle dark mode">
        {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </Button>
    </header>
  );
}
