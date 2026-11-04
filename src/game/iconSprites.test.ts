import { describe, expect, it } from "vitest";
import { ICON_SPRITES, iconSprite } from "./iconSprites";
import { SHARED_PALETTE } from "./sprites";

const EMOJI = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}️?)*/gu;

describe("Pixel-Icons", () => {
  it.each(Object.entries(ICON_SPRITES))("%s passt ins 12er-Raster und jedes Zeichen hat eine Farbe", (_, sprite) => {
    expect(sprite.grid.length).toBeLessThanOrEqual(12);
    for (const row of sprite.grid) {
      expect(row.length).toBeLessThanOrEqual(12);
      for (const ch of row) if (ch !== ".") expect(sprite.palette[ch] ?? SHARED_PALETTE[ch], `Zeichen ${ch}`).toBeDefined();
    }
  });

  it("jedes Emoji im Code hat ein Pixel-Icon", () => {
    const sources = import.meta.glob(["/src/**/*.{ts,tsx}", "!/src/**/*.test.{ts,tsx}"], { query: "?raw", import: "default", eager: true });
    expect(Object.keys(sources).length).toBeGreaterThan(50);
    const missing = new Set<string>();
    for (const source of Object.values(sources) as string[])
      for (const [emoji] of source.matchAll(EMOJI)) if (!iconSprite(emoji)) missing.add(emoji);
    expect([...missing]).toEqual([]);
  });

  it("findet Icons mit und ohne Variantenzeichen, unbekannte bleiben Emoji", () => {
    expect(iconSprite("⚔️")).toBe(iconSprite("⚔"));
    expect(iconSprite("🛡️")).toBeDefined();
    expect(iconSprite("🦄")).toBeUndefined();
  });
});
