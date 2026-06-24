/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { setTheme, theme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Toggle color theme"
        className={cn(
          "touch-target border-border/60 bg-background/40 text-muted-foreground inline-flex size-11 items-center justify-center rounded-full border sm:size-9",
          "hover:text-foreground hover:bg-muted transition-colors",
          "focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
          "[&_svg]:size-4"
        )}
      >
        <span className="relative inline-flex size-4">
          <Sun
            aria-hidden
            className="absolute inset-0 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90"
          />
          <Moon
            aria-hidden
            className="absolute inset-0 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0"
          />
        </span>
        <span className="sr-only">Toggle theme</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        <DropdownMenuItem onClick={() => setTheme("light")} aria-current={theme === "light"}>
          <Sun className="size-4" aria-hidden />
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")} aria-current={theme === "dark"}>
          <Moon className="size-4" aria-hidden />
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")} aria-current={theme === "system"}>
          <Monitor className="size-4" aria-hidden />
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
