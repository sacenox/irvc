import type { Channel } from "./types";

export const byName = (a: Channel, b: Channel) => a.name.localeCompare(b.name);

const rank = (c: Channel) => (c.type === "text" ? 0 : c.type === "voice" ? 1 : 2);

export const firstChannel = (channels: Channel[]): Channel | null =>
  [...channels].sort((a, b) => rank(a) - rank(b) || byName(a, b))[0] ?? null;
