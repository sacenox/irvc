import type { Token } from "./theme";

// A terminal color scheme as emitted by scripts/schemes.mjs: background,
// foreground and the 16 ANSI colors (black..white, then the bright row).
export interface Scheme {
  n: string;
  bg: string;
  fg: string;
  c: string[];
}

type RGB = [number, number, number];

const rgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
const hex = (c: RGB) =>
  "#" +
  c
    .map((n) =>
      Math.round(Math.max(0, Math.min(255, n)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");

// mix blends a toward b; t=0 is a, t=1 is b.
const mix = (a: string, b: string, t: number) => {
  const [x, y] = [rgb(a), rgb(b)];
  return hex(x.map((v, i) => v + (y[i] - v) * t) as RGB);
};

function luminance(h: string) {
  const [r, g, b] = rgb(h).map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// chroma is how colorful a color is (0 = gray); used to prefer vivid colors.
const chroma = (h: string) => {
  const c = rgb(h);
  return (Math.max(...c) - Math.min(...c)) / 255;
};

export const isDark = (s: Scheme) => luminance(s.bg) < 0.3;

// The chromatic ANSI slots: red..cyan (and magenta), normal and bright.
// Black and white are skipped; they are the background/foreground's job.
const COLORED = [1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 14];

// toPalette maps a scheme onto our palette tokens. Surfaces are tints of the
// background toward the foreground, so any scheme gets a consistent stack.
export function toPalette(s: Scheme): Record<Token, string> {
  const { bg, fg, c } = s;
  const ok = (h: string) => contrast(h, bg) >= 3;
  const reds = [c[1], c[9]].sort((a, b) => contrast(b, bg) - contrast(a, bg));
  // The reds are the danger, never the accent: a grayscale scheme keeps its
  // gray accent and still gets a legible red.
  const accent =
    COLORED.map((i) => c[i])
      .filter((h) => ok(h) && !reds.includes(h))
      .sort((a, b) => chroma(b) - chroma(a))[0] ?? fg;
  return {
    bg,
    surface: mix(bg, fg, 0.05),
    raised: mix(bg, fg, 0.09),
    fg,
    muted: mix(fg, bg, 0.35),
    faint: mix(fg, bg, 0.6),
    line: mix(bg, fg, 0.18),
    accent,
    accentFg: contrast(bg, accent) >= contrast(fg, accent) ? bg : fg,
    danger: reds[0],
  };
}

// The colors a scheme contributes to skittles: its chromatic slots, deduped.
export const schemeColors = (s: Scheme) =>
  COLORED.map((i) => s.c[i]).filter((h, i, all) => all.indexOf(h) === i);

export const SKITTLES = 12;

const hsl = (h: number, s: number, l: number) => {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return hex([f(0) * 255, f(8) * 255, f(4) * 255]);
};

// presetWheel builds the skittles for a built-in palette: tuxedo is grayscale,
// so it gets a ramp of grays; anything else (nicotine) gets a muted hue wheel
// pulled toward the foreground, which gives it the same sepia cast as the UI.
function presetWheel(preset: string | undefined, dark: boolean, fg: string) {
  return Array.from({ length: SKITTLES }, (_, i) => {
    if (preset === "tuxedo") {
      const l = dark ? 0.42 + (0.5 * i) / (SKITTLES - 1) : 0.1 + (0.4 * i) / (SKITTLES - 1);
      return hsl(0, 0, l);
    }
    return mix(hsl(i * 30 + 8, 0.45, dark ? 0.66 : 0.36), fg, 0.25);
  });
}

// skittlesPalette returns exactly SKITTLES colors readable against bg: the
// scheme's own colors when it has them (nudged toward fg until legible),
// padded with an evenly spaced hue wheel so every scheme gets a full set.
export function skittlesPalette(
  source: string[] | undefined,
  bg: string,
  fg: string,
  preset?: string,
) {
  const dark = luminance(bg) < 0.3;
  // Without a scheme the preset supplies the whole set, in its own character.
  if (!source) return presetWheel(preset, dark, fg);
  const wheel = Array.from({ length: SKITTLES }, (_, i) =>
    hsl(i * 30 + 8, 0.6, dark ? 0.68 : 0.36),
  );
  const mine = (source ?? [])
    .filter((h) => chroma(h) > 0.15)
    .map((h) => {
      for (let t = 0; t < 1 && contrast(h, bg) < 3.5; t += 0.1) h = mix(h, fg, 0.1);
      return h;
    });
  const out = [...mine];
  for (let i = 0; out.length < SKITTLES; i++) out.push(wheel[i % wheel.length]);
  return out.slice(0, SKITTLES);
}

// userColor is a CSS color for a username: stable across messages, sessions and
// devices. It reads --user-N, which applyTheme only defines while skittles is on,
// so with it off the fallback applies and nothing else needs to know.
export function userColor(name: string, fallback = "inherit") {
  let h = 0x811c9dc5; // FNV-1a
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 0x01000193);
  return `var(--user-${(h >>> 0) % SKITTLES}, ${fallback})`;
}
