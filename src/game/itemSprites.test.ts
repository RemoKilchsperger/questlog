import { describe, expect, it } from "vitest";
import { EMPTY_EQUIPMENT } from "../domain/equipment";
import { BOSS_ITEMS, createItem, getItem, ITEMS } from "../domain/items";
import { getHeroSprite, getMainWeapon, HERO_SPRITE } from "./heroSprite";
import { getItemSprite, getWornHelmet, getWornWeapon } from "./itemSprites";
import { composeSprites, renderSprite } from "./sprites";

const own = (itemId: string) => createItem(itemId, "common", itemId);

describe("Item-Grafiken", () => {
  it("jedes Item hat eine Grafik, deren Zeichen alle eine Farbe haben", () => {
    for (const def of [...ITEMS, ...BOSS_ITEMS]) {
      const sprite = getItemSprite(def);
      const used = new Set(sprite.grid.join("").replaceAll(".", ""));
      for (const ch of used) expect(sprite.palette[ch] ?? (ch === "k" || ch === "w"), `${def.id}: ${ch}`).toBeTruthy();
    }
  });

  it("Kupfer- und Eisenbeinschienen sehen unterschiedlich aus", () => {
    // legs-10 = Kupfer, legs-30 = Eisen, beide "beinschienen"
    const copper = getItemSprite(getItem("legs-10"));
    const iron = getItemSprite(getItem("legs-30"));
    expect(copper.grid).toEqual(iron.grid);
    expect(copper.palette.m).not.toBe(iron.palette.m);
  });

  it("jedes Boss-Item sieht anders aus (Form oder Farben) und ist am Helden zu sehen", () => {
    // Waffen und Helme haben eigene Formen; Dungeon-Rüstungsteile nutzen Standardformen in Set-Farben.
    const looks = BOSS_ITEMS.map((def) => JSON.stringify(getItemSprite(def)));
    expect(new Set(looks).size).toBe(BOSS_ITEMS.length);
    const shaped = BOSS_ITEMS.filter((d) => d.kind === "weapon" || d.type === "head");
    expect(new Set(shaped.map((d) => getItemSprite(d).grid.join("\n"))).size).toBe(shaped.length);
    for (const def of BOSS_ITEMS) {
      const slot = def.kind === "armor" ? def.type : "weapon1";
      const hero = renderSprite(getHeroSprite({ ...EMPTY_EQUIPMENT, [slot]: own(def.id) }));
      const shown = new Set(hero.pixels.flat());
      // Material-Farbe des Boss-Items ist am Helden zu sehen
      expect(shown.has(getItemSprite(def).palette.m) || shown.has(getItemSprite(def).palette.D), def.id).toBe(true);
    }
  });

  it("Boss-Waffen haben in der Hand eine eigene, fein gezeichnete Form mit Griff", () => {
    const weapons = BOSS_ITEMS.filter((d) => d.kind === "weapon");
    const grids = weapons.map((d) => getWornWeapon(d).sprite.grid.join("\n"));
    expect(new Set(grids).size).toBe(weapons.length);
    for (const def of weapons) {
      const worn = getWornWeapon(def);
      const { grid } = worn.sprite;
      expect(worn.scale, def.id).toBe(1);
      expect(new Set(grid.map((r) => r.length)).size, def.id).toBe(1);
      // Jedes Zeichen hat eine Farbe (Boss-Palette oder gemeinsame Farben)
      const known = new Set([...Object.keys(worn.sprite.palette), "k", "w", "."]);
      expect([...grid.join("")].filter((ch) => !known.has(ch)), def.id).toEqual([]);
      // Schilde werden vor der Hand getragen und haben keinen Griffpunkt; sonst liegt die Hand auf 2 × 2 Pixeln Griff.
      if (def.type !== "shield") {
        expect(grid[worn.grip.y].slice(worn.grip.x, worn.grip.x + 2), def.id).toBe("GG");
        expect(grid[worn.grip.y + 1].slice(worn.grip.x, worn.grip.x + 2), def.id).toBe("GG");
      }
      // passt ins Heldenbild: höchstens 18 Zeilen über und 8 unter der Hand, 8 Spalten rechts daneben
      expect(worn.grip.y, def.id).toBeLessThanOrEqual(18);
      expect(grid.length - worn.grip.y - 2, def.id).toBeLessThanOrEqual(8);
      expect(grid[0].length - worn.grip.x - 2, def.id).toBeLessThanOrEqual(8);
    }
  });

  it("normale Waffen, Schilde und Helme sind im 24er-Raster des Helden gezeichnet", () => {
    const held = ["dagger", "sword", "greatsword", "axe", "greataxe", "staff", "scepter", "mace", "greathammer", "bow"].map((t) => `${t}-0`);
    for (const id of [...held, "shield-0", "shield-1", "shield-2"]) {
      const worn = getWornWeapon(getItem(id));
      const { grid } = worn.sprite;
      expect(worn.scale, id).toBe(1);
      expect(new Set(grid.map((r) => r.length)).size, id).toBe(1);
      // Die Hand ist ein 2 × 2-Block – bei Waffen liegt darunter der Griff
      if (!id.startsWith("shield")) {
        expect(grid[worn.grip.y].slice(worn.grip.x, worn.grip.x + 2), id).toBe("GG");
        expect(grid[worn.grip.y + 1].slice(worn.grip.x, worn.grip.x + 2), id).toBe("GG");
      }
      // passt ins Heldenbild: höchstens 18 Zeilen über und 8 unter der Hand
      expect(worn.grip.y, id).toBeLessThanOrEqual(18);
      expect(grid.length - worn.grip.y - 2, id).toBeLessThanOrEqual(8);
    }
    for (const id of ["head-0", "head-1", "head-light-0", "head-light-1", "head-medium-0", "head-medium-1"]) {
      const worn = getWornHelmet(getItem(id));
      expect(worn.scale, id).toBe(1);
      expect(worn.sprite.grid.every((r) => r.length === 24), id).toBe(true);
    }
  });

  it("Schwert, Klinge und Säbel haben verschiedene Formen", () => {
    const grids = ["sword-0", "sword-1", "sword-2"].map((id) => getItemSprite(getItem(id)).grid.join("\n"));
    expect(new Set(grids).size).toBe(3);
  });
});

describe("Held mit Ausrüstung", () => {
  const colors = (equipment = EMPTY_EQUIPMENT) =>
    new Set(renderSprite(getHeroSprite(equipment)).pixels.flat().filter(Boolean));

  it("ohne Ausrüstung entspricht er der Grundgrafik", () => {
    expect(colors()).toEqual(new Set(renderSprite(HERO_SPRITE).pixels.flat().filter(Boolean)));
  });

  it("zeigt Helm, Waffe und Schild in deren Materialfarben", () => {
    const equipment = { ...EMPTY_EQUIPMENT, head: own("head-190"), weapon1: own("sword-60"), weapon2: own("shield-130") };
    const shown = colors(equipment);
    for (const id of ["head-190", "sword-60", "shield-130"]) {
      expect(shown.has(getItemSprite(getItem(id)).palette.m), id).toBe(true);
    }
  });

  it("färbt Brust, Arme, Beine und Schuhe in den Materialfarben ein", () => {
    const equipment = {
      ...EMPTY_EQUIPMENT,
      chest: own("chest-160"),
      arms: own("arms-100"),
      legs: own("legs-130"),
      feet: own("feet-190"),
    };
    const shown = colors(equipment);
    expect(shown.has(getItemSprite(getItem("chest-160")).palette.m)).toBe(true);
    expect(shown.has(getItemSprite(getItem("arms-100")).palette.m)).toBe(true);
    expect(shown.has(getItemSprite(getItem("legs-130")).palette.m)).toBe(true);
    expect(shown.has(getItemSprite(getItem("feet-190")).palette.D)).toBe(true);
    expect(shown.has(HERO_SPRITE.palette.a)).toBe(false); // blaues Hemd ist verdeckt
  });

  it("die separat gezeichnete Kampfwaffe sitzt genau dort, wo sie im Gesamtbild ist", () => {
    const equipment = { ...EMPTY_EQUIPMENT, head: own("head-0"), weapon1: own("greataxe-50"), weapon2: null };
    const full = getHeroSprite(equipment);
    const body = getHeroSprite(equipment, { withoutMainWeapon: true });
    const weapon = getMainWeapon(equipment)!;
    // Die Waffe liegt vor dem Körper
    const rebuilt = composeSprites(full.grid[0].length, full.grid.length, [
      { sprite: body, x: 0, y: 0 },
      { sprite: weapon.sprite, x: weapon.hand.x - weapon.grip.x, y: weapon.hand.y - weapon.grip.y },
    ]);
    expect(renderSprite(rebuilt).pixels).toEqual(renderSprite(full).pixels);
    expect(getMainWeapon(EMPTY_EQUIPMENT)).toBeNull();
  });

  it("bleibt gleich gross, egal was er trägt", () => {
    const bare = getHeroSprite(EMPTY_EQUIPMENT);
    const armed = getHeroSprite({ ...EMPTY_EQUIPMENT, head: own("head-0"), weapon1: own("greatsword-0") });
    expect([armed.grid.length, armed.grid[0].length]).toEqual([bare.grid.length, bare.grid[0].length]);
  });
});
