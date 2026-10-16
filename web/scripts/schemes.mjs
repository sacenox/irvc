#!/usr/bin/env node
// Converts a directory of terminal color scheme .yml files into the compact
// JSON the settings page autocompletes against.
//
//   node scripts/schemes.mjs ../fruit src/lib/schemes.json
//
// Each file is flat "key: value" yaml; the scheme name is the file name. Output
// is a name-sorted array of { n: name, bg, fg, c: [16 ANSI colors] } with colors
// as lowercase #rrggbb.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [dir, out] = process.argv.slice(2);
if (!dir || !out) {
  console.error("usage: schemes.mjs <yaml-dir> <out.json>");
  process.exit(2);
}

// hex normalizes "#abc", "'AABBCC'", "aabbcc" and 8-digit alpha forms to #rrggbb.
function hex(v) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(v);
  if (!m) return null;
  let h = m[1].toLowerCase();
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  return "#" + h.slice(0, 6);
}

// value pulls the scalar off a "key: value  # comment" line.
function value(raw) {
  raw = raw.trim();
  const q = /^(["'])(.*?)\1/.exec(raw);
  return q ? q[2] : raw.split(/\s+#|\s/)[0];
}

const schemes = [];
for (const file of readdirSync(dir)
  .filter((f) => f.endsWith(".yml"))
  .sort()) {
  const kv = {};
  for (const line of readFileSync(join(dir, file), "utf8").split(/\r?\n/)) {
    const m = /^([a-z_0-9]+):\s*(.*)$/.exec(line);
    if (m) kv[m[1]] = value(m[2]);
  }
  const c = Array.from({ length: 16 }, (_, i) =>
    hex(kv[`color_${String(i + 1).padStart(2, "0")}`] ?? ""),
  );
  const bg = hex(kv.background ?? "");
  const fg = hex(kv.foreground ?? "");
  if (!bg || !fg || c.includes(null)) {
    console.error(`skipping ${file}: missing or invalid colors`);
    continue;
  }
  schemes.push({ n: file.replace(/\.yml$/, ""), bg, fg, c });
}

schemes.sort((a, b) => a.n.localeCompare(b.n, "en", { sensitivity: "base" }));
writeFileSync(out, JSON.stringify(schemes) + "\n");
console.error(`wrote ${schemes.length} schemes to ${out}`);
