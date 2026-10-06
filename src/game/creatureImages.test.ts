import { describe, expect, it } from "vitest";
import { CREATURE_IMAGES } from "./creatureImages";
import { CREATURE_SPRITES } from "./creatureSprites";

describe("Gegner-Bilder", () => {
  it("jedes Bild gehört zu einer Kreatur (Dateiname = Grafik-Schlüssel)", () => {
    for (const key of Object.keys(CREATURE_IMAGES)) expect(CREATURE_SPRITES, `${key}.png`).toHaveProperty([key]);
  });
});
