import { useCallback, useEffect, useState } from "react";

export type Mode = "light" | "dark";
export type Theme = "80s-nicotine" | "tuxedo";

function initialMode(): Mode {
  const saved = localStorage.getItem("theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function initialTheme(): Theme {
  return localStorage.getItem("irvc.theme") === "tuxedo" ? "tuxedo" : "80s-nicotine";
}

// useTheme keeps the `dark` class (light/dark mode) and the palette class
// (`theme-tuxedo`) on <html> in sync, seeding from the OS on first visit.
// index.html applies the same choices before paint.
export function useTheme() {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", mode === "dark");
    localStorage.setItem("theme", mode);
  }, [mode]);

  useEffect(() => {
    document.documentElement.classList.toggle("theme-tuxedo", theme === "tuxedo");
    localStorage.setItem("irvc.theme", theme);
  }, [theme]);

  const toggleMode = useCallback(() => setMode((m) => (m === "dark" ? "light" : "dark")), []);
  return { mode, toggleMode, theme, setTheme };
}
