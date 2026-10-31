// Test-Hilfen: Waffen tragen im Spiel nur einen zufälligen Teil ihres Fähigkeiten-Pools.
// Für Tests, die eine bestimmte Fähigkeit prüfen, gibt es Waffen mit dem ganzen Pool.

import { abilitiesOf } from "../domain/abilities";
import { createItem, getItem } from "../domain/items";
import type { OwnedItem, Rarity, WeaponType } from "../domain/types";

/** Eine Waffe mit allen Fähigkeiten ihres Typs. */
export function fullWeapon(itemId: string, rarity: Rarity = "common", uid = "w", rng?: () => number): OwnedItem {
  const item = createItem(itemId, rarity, uid, rng);
  return { ...item, abilities: abilitiesOf(getItem(itemId).type as WeaponType).map((a) => a.id) };
}
