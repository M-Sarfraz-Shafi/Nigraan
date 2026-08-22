const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const toHex = (n: number): string => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");

// Returns hex (not rgb()) so callers can keep appending a hex alpha suffix
// (e.g. `${lighten(c)}55`) the same way the rest of the codebase does with r.color.
const mix = (hex: string, target: [number, number, number], ratio: number): string => {
  const [r, g, b] = hexToRgb(hex);
  const nr = Math.round(r + (target[0] - r) * ratio);
  const ng = Math.round(g + (target[1] - g) * ratio);
  const nb = Math.round(b + (target[2] - b) * ratio);
  return `#${toHex(nr)}${toHex(ng)}${toHex(nb)}`;
};

/** Mixes a hex color toward white — used for subtask bars (lighter than their parent task). */
export const lighten = (hex: string, ratio = 0.42): string => mix(hex, [255, 255, 255], ratio);

/** Mixes a hex color toward black — used for top-level task / summary bars (darker than their subtasks). */
export const darken = (hex: string, ratio = 0.32): string => mix(hex, [0, 0, 0], ratio);

/** Picks readable near-black or white text for a given background, by perceived luminance. */
export const readableText = (hex: string, dark = "#0f172a", light = "#fff"): string => {
  const [r, g, b] = hexToRgb(hex);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 165 ? dark : light;
};
