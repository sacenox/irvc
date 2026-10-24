import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { nicotine, tuxedo } from "./fruit";
import { SKITTLES, isDark, schemeColors, skittlesPalette, toPalette, type Scheme } from "./scheme";

export type Mode = "light" | "dark";

// Every color the UI uses. Palettes and user overrides are both just maps of
// these; the values land as CSS variables named "kebab of key".
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

// "custom" is not a palette of its own: it layers the user's color overrides on
// top of `base`, the built-in theme that was active when custom was chosen.
export const presets = [
  { id: "nicotine", label: "80s nicotine" },
  { id: "tuxedo", label: "tuxedo" },
  { id: "custom", label: "custom" },
] as const;

export type PresetId = (typeof presets)[number]["id"];
export type BasePreset = Exclude<PresetId, "custom">;

// The built-in themes are fruit definitions like any terminal scheme, so they
// are only ever a source of a palette, never CSS of their own.
const builtin: Record<BasePreset, Record<Mode, Scheme>> = { nicotine, tuxedo };

export interface ThemePrefs {
  mode: Mode;
  preset: PresetId;
  base: BasePreset;
  overrides: Record<Mode, Partial<Record<Token, string>>>;
  // Experimental: the terminal scheme the palette was seeded from (name, plus
  // the colors it contributes to skittles), and per-username colors.
  scheme: { name: string; colors: string[] } | null;
  skittles: boolean;
}

const key = "irvc.theme";

export const defaultPrefs: ThemePrefs = {
  mode: "light",
  preset: "nicotine",
  base: "nicotine",
  overrides: { light: {}, dark: {} },
  scheme: null,
  skittles: false,
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
  const mode: Mode = p.mode === "dark" ? "dark" : "light";
  const overrides = { light: p.overrides?.light ?? {}, dark: p.overrides?.dark ?? {} };
  let preset: PresetId = presets.some((x) => x.id === p.preset) ? (p.preset as PresetId) : defaultPrefs.preset;
  let base: BasePreset = p.base === "tuxedo" || p.base === "nicotine" ? p.base : defaultPrefs.base;
  // Overrides used to sit on top of any preset. They now only exist under
  // "custom", so a saved palette with edits becomes a custom one.
  if (preset !== "custom" && Object.keys(overrides[mode]).length > 0) {
    base = preset;
    preset = "custom";
  }
  return {
    mode,
    preset,
    base,
    overrides,
    scheme: p.scheme?.name && Array.isArray(p.scheme.colors) ? p.scheme : null,
    skittles: p.skittles === true,
  };
}

// basePalette is the built-in theme the palette comes from.
const basePalette = (p: ThemePrefs): BasePreset => (p.preset === "custom" ? p.base : p.preset);

// palette is the scheme→tokens expansion of the built-in theme in effect.
const palette = (p: ThemePrefs) => toPalette(builtin[basePalette(p)][p.mode]);

// applyTheme writes the mode class and every token onto <html>: the built-in
// theme's palette, with the user's overrides on top when the preset is custom.
export function applyTheme(prefs: ThemePrefs) {
  const el = document.documentElement;
  el.classList.toggle("dark", prefs.mode === "dark");
  const p = palette(prefs);
  const over = prefs.preset === "custom" ? prefs.overrides[prefs.mode] : {};
  for (const t of TOKENS) el.style.setProperty(cssVar(t), over[t] ?? p[t]);
  // Skittles: --user-N are only defined while it is on; userColor() falls back
  // to the accent otherwise.
  const colors = prefs.skittles
    ? skittlesPalette(prefs.scheme?.colors, p.bg, p.fg, basePalette(prefs))
    : [];
  for (let i = 0; i < SKITTLES; i++) {
    if (colors[i]) el.style.setProperty(`--user-${i}`, colors[i]);
    else el.style.removeProperty(`--user-${i}`);
  }
}

// effective returns the color a token currently resolves to, so the theme
// editor can seed its color inputs with the palette values.
export function effective(t: Token): string {
  return getComputedStyle(document.documentElement).getPropertyValue(cssVar(t)).trim();
}

export function useTheme() {
  const [prefs, setPrefs] = useState<ThemePrefs>(loadPrefs);

  // Applied before the browser paints so anything reading the computed
  // palette (the settings color swatches) sees the new mode immediately.
  useLayoutEffect(() => {
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
      setPrefs((p) => {
        if (preset === p.preset) return p;
        // Custom starts from whatever built-in palette (and mode) is showing.
        const base = preset === "custom" ? basePalette(p) : p.base;
        return { ...p, preset, base, scheme: null, overrides: { light: {}, dark: {} } };
      }),
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
  // A scheme is dark or light by nature, so applying one switches to that mode
  // and overrides every token there; the other mode keeps its palette.
  const setScheme = useCallback(
    (s: Scheme) =>
      setPrefs((p) => {
        const mode: Mode = isDark(s) ? "dark" : "light";
        return {
          ...p,
          mode,
          preset: "custom",
          base: basePalette(p),
          scheme: { name: s.n, colors: schemeColors(s) },
          overrides: { ...p.overrides, [mode]: toPalette(s) },
        };
      }),
    [],
  );
  const setSkittles = useCallback((skittles: boolean) => setPrefs((p) => ({ ...p, skittles })), []);

  return { prefs, setMode, setPreset, setToken, setScheme, setSkittles };
}
