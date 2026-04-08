"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

type ThemeToggleProps = {
  isDark: boolean;
  onToggle: () => void;
};

export function ThemeToggle(props: ThemeToggleProps) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={props.onToggle}>
      {props.isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      <span className="ml-2">{props.isDark ? "Light" : "Dark"}</span>
    </Button>
  );
}
