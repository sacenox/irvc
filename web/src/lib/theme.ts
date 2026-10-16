import { useCallback, useEffect, useState } from "react";

export type Mode = "light" | "dark";

// Every color the UI uses. Palettes and user overrides are both just maps of
// these; the values live in index.css as CSS variables named "kebab of key".
export const TOKENS = [
  "bg",
  "surface",
  "raised",
  "fg",
  "muted",
  "faint",
  "line",
  "accent",
  "accentFg",
  "danger",
] as const;

export type Token = (typeof TOKENS)[number];

export const tokenLabels: Record<Token, string> = {
  bg: "background",
  surface: "sidebar",
  raised: "panels & inputs",
  fg: "text",
  muted: "muted text",
  faint: "faint text",
  line: "borders",
  accent: "accent",
  accentFg: "text on accent",
  danger: "danger",
};

export const presets = [
  { id: "nicotine", label: "80s nicotine" },
  { id: "tuxedo", label: "tuxedo" },
] as const;

export type PresetId = (typeof presets)[number]["id"];

export interface ThemePrefs {
  mode: Mode;
  preset: PresetId;
  overrides: Record<Mode, Partial<Record<Token, string>>>;
}

const key = "irvc.theme";

export const defaultPrefs: ThemePrefs = {
  mode: "light",
  preset: "nicotine",
  overrides: { light: {}, dark: {} },
};

const systemMode = (): Mode =>
  matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

const cssVar = (t: Token) => "--" + t.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());

// load reads prefs written by this module, and tolerates the old bare
// "light"/"dark" value stored by earlier versions.
export function loadPrefs(): ThemePrefs {
  let raw: unknown;
  try {
    raw = JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    raw = localStorage.getItem(key);
  }
  if (raw === "light" || raw === "dark") return { ...defaultPrefs, mode: raw };
  // Older releases stored the bare preset id under the same key.
  if (presets.some((p) => p.id === raw)) return { ...defaultPrefs, preset: raw as PresetId };
  if (!raw || typeof raw !== "object") return { ...defaultPrefs, mode: systemMode() };
  const p = raw as Partial<ThemePrefs>;
  return {
    mode: p.mode === "dark" ? "dark" : "light",
    preset: presets.some((x) => x.id === p.preset) ? (p.preset as PresetId) : defaultPrefs.preset,
    overrides: { light: p.overrides?.light ?? {}, dark: p.overrides?.dark ?? {} },
  };
}

// applyTheme writes the mode class, the preset attribute and the user's
// overrides onto <html>. The palettes themselves live in CSS, so switching
// preset is a single attribute change.
export function applyTheme(prefs: ThemePrefs) {
  const el = document.documentElement;
  el.classList.toggle("dark", prefs.mode === "dark");
  el.dataset.preset = prefs.preset;
  for (const t of TOKENS) {
    const v = prefs.overrides[prefs.mode][t];
    if (v) el.style.setProperty(cssVar(t), v);
    else el.style.removeProperty(cssVar(t));
  }
}

// effective returns the color a token currently resolves to, so the theme
// editor can seed its color inputs with the palette values.
export function effective(t: Token): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(cssVar(t)).trim();
  if (v.startsWith("#")) return v.length === 4 ? expand(v) : v;
  return rgbToHex(v);
}

function expand(hex: string) {
  return "#" + hex.slice(1).replace(/./g, (c) => c + c);
}

function rgbToHex(color: string) {
  const m = color.match(/(\d+)\D+(\d+)\D+(\d+)/);
  if (!m) return "#000000";
  return "#" + m.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, "0")).join("");
}

export function useTheme() {
  const [prefs, setPrefs] = useState<ThemePrefs>(loadPrefs);

  useEffect(() => {
    applyTheme(prefs);
    localStorage.setItem(key, JSON.stringify(prefs));
  }, [prefs]);

  // Also react to OS changes while the user has not picked a side explicitly;
  // the stored mode always wins once set.
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () =>
      setPrefs((p) =>
        localStorage.getItem(key) ? p : { ...p, mode: mq.matches ? "dark" : "light" },
      );
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const setMode = useCallback((mode: Mode) => setPrefs((p) => ({ ...p, mode })), []);
  const setPreset = useCallback(
    (preset: PresetId) =>
      setPrefs((p) => ({ ...p, preset, overrides: { light: {}, dark: {} } })),
    [],
  );
  const setToken = useCallback(
    (t: Token, color: string) =>
      setPrefs((p) => ({
        ...p,
        overrides: { ...p.overrides, [p.mode]: { ...p.overrides[p.mode], [t]: color } },
      })),
    [],
  );
  const resetTokens = useCallback(
    () => setPrefs((p) => ({ ...p, overrides: { ...p.overrides, [p.mode]: {} } })),
    [],
  );

  return { prefs, setMode, setPreset, setToken, resetTokens };
}
