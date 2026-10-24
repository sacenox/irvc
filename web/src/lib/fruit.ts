import type { Scheme } from "./scheme";

// The built-in themes, written as fruit definitions: the same { bg, fg, c }
// shape as the terminal schemes in schemes.json. Nothing downstream knows a
// built-in is special — the palette is toPalette(scheme) like any other, so
// there is one path from a theme to the CSS variables.
//
// The ANSI slots are not meant to be used as a terminal: the accent comes from
// the most colorful slot, and the danger from the red that reads best on the
// background, so those two are the slots worth tuning.

type Variants = Record<"light" | "dark", Scheme>;

export const nicotine: Variants = {
  light: {
    n: "80s nicotine",
    bg: "#f6efe2",
    fg: "#4a3418",
    c: [
      "#2b1c0c",
      "#b4432f", // danger
      "#6d7a45",
      "#a9791f", // accent
      "#4f6b86",
      "#8a5570",
      "#4a7a74",
      "#ece2cf",
      "#8a6f4a",
      "#c9795f",
      "#8a9a5f",
      "#c9a04a",
      "#6f8fae",
      "#b07a94",
      "#6aa39b",
      "#fdfaf3",
    ],
  },
  dark: {
    n: "80s nicotine dark",
    bg: "#0b0906",
    fg: "#d8b98f",
    c: [
      "#1a130c",
      "#e0715a", // danger
      "#7d8a5a",
      "#ffcc55", // accent
      "#6f8fae",
      "#b07a94",
      "#6aa39b",
      "#d8b98f",
      "#6d583c",
      "#8f4030",
      "#9aad6a",
      "#e0b060",
      "#8fafc9",
      "#cf9ab4",
      "#8ac9c1",
      "#f3e6d2",
    ],
  },
};

export const tuxedo: Variants = {
  light: {
    n: "tuxedo",
    bg: "#ffffff",
    fg: "#141414",
    c: [
      "#000000",
      "#b3261e", // danger
      "#333333", // accent
      "#666666",
      "#4d4d4d",
      "#7a7a7a",
      "#8c8c8c",
      "#f1f1f1",
      "#a0a0a0",
      "#d07070",
      "#555555",
      "#777777",
      "#999999",
      "#b3b3b3",
      "#cccccc",
      "#ffffff",
    ],
  },
  dark: {
    n: "tuxedo dark",
    bg: "#000000",
    fg: "#e8e8e8",
    c: [
      "#0b0b0b",
      "#e07a6a", // danger
      "#d4d4d4", // accent
      "#9a9a9a",
      "#8a8a8a",
      "#7a7a7a",
      "#b0b0b0",
      "#272727",
      "#6b6b6b",
      "#8a4a3e",
      "#a0a0a0",
      "#c0c0c0",
      "#909090",
      "#b8b8b8",
      "#cccccc",
      "#ffffff",
    ],
  },
};
