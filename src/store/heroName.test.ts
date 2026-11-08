import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_LOOKS } from "../domain/looks";
import type { Character } from "../domain/types";
import { repairSave, useGameStore } from "./gameStore";

const store = useGameStore.getState;

describe("Heldenname beim ersten Start", () => {
  beforeEach(() => store().resetGame());

  it("ein neuer Held wartet auf seinen Namen", () => {
    expect(store().character.named).toBe(false);
  });

  it("benennen setzt den Namen und schliesst den Dialog", () => {
    store().renameCharacter("  Aldric ");
    expect(store().character).toMatchObject({ name: "Aldric", named: true });
  });

  it("ein leerer Name zählt nicht", () => {
    store().renameCharacter("   ");
    expect(store().character).toMatchObject({ name: "Held", named: false });
  });

  it("ältere Spielstände gelten als benannt", () => {
    const { named: _named, ...old } = store().character;
    expect(repairSave({ character: old as Character }).character?.named).toBe(true);
    expect(repairSave({ character: { ...old, named: false } }).character?.named).toBe(false);
  });

  it("das Aussehen wird gespeichert, ältere Stände bekommen den Standardhelden", () => {
    store().setLooks({ ...DEFAULT_LOOKS, hairStyle: "iro", beard: "vollbart" });
    expect(store().character.looks).toMatchObject({ hairStyle: "iro", beard: "vollbart" });
    const { looks: _looks, ...old } = store().character;
    expect(repairSave({ character: old as Character }).character?.looks).toEqual(DEFAULT_LOOKS);
  });
});
