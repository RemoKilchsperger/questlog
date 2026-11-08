import { describe, expect, it } from "vitest";
import { DEFAULT_LOOKS, LOOK_OPTIONS, LOOK_PARTS, randomLooks, sanitizeLooks, stepLook } from "./looks";
import { BEARDS, HAIR_COLORS, HAIR_STYLES, SHIRT_COLORS, SKIN_COLORS } from "../game/heroLooks";

describe("Aussehen", () => {
  it("jede Wahl hat Farben bzw. Pixel", () => {
    const art: Record<string, object> = { skin: SKIN_COLORS, hairColor: HAIR_COLORS, hairStyle: HAIR_STYLES, beard: BEARDS, shirt: SHIRT_COLORS };
    for (const part of LOOK_PARTS) {
      expect(Object.keys(art[part]).sort(), part).toEqual(LOOK_OPTIONS[part].map((o) => o.id).sort());
    }
  });

  it("Unbekanntes wird zum Standard, Gültiges bleibt", () => {
    expect(sanitizeLooks(undefined)).toEqual(DEFAULT_LOOKS);
    expect(sanitizeLooks("blau")).toEqual(DEFAULT_LOOKS);
    expect(sanitizeLooks({ skin: "dunkel", hairStyle: "<script>", beard: 3 })).toEqual({ ...DEFAULT_LOOKS, skin: "dunkel" });
  });

  it("Würfeln ergibt immer gültige Werte", () => {
    let seed = 1;
    const rng = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < 200; i++) {
      const looks = randomLooks(rng);
      expect(sanitizeLooks(looks)).toEqual(looks);
    }
  });

  it("die Pfeile laufen im Kreis", () => {
    const last = LOOK_OPTIONS.hairStyle.at(-1)!.id;
    expect(stepLook(DEFAULT_LOOKS, "hairStyle", -1).hairStyle).toBe(last);
    expect(stepLook({ ...DEFAULT_LOOKS, hairStyle: last }, "hairStyle", 1).hairStyle).toBe(LOOK_OPTIONS.hairStyle[0].id);
  });
});
