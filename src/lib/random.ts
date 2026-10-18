/* src/lib/random.ts — the only source of pretend-data in the app.
 *
 * Both the demo seed and the `/preview` sample day draw from here, so a
 * screenshot or a Playwright layout assertion is byte-identical on every run:
 * same seed, same sequence. No `Math.random()`, no clock, no dependency.
 */

/** mulberry32 — 32-bit, fast, deterministic, no dependency. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One already-drawn [0, 1) number → the bin whose ascending cut it falls under. */
export function pickBin(draw: number, values: readonly number[], cuts: readonly number[]): number {
  for (let i = 0; i < cuts.length; i++) {
    if (draw < cuts[i]!) return values[i]!;
  }
  return values[values.length - 1]!;
}

/** One draw from a list. The list must not be empty at the call site. */
export function pick<T>(rng: () => number, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length)] as T;
}
