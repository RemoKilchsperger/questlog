import { motion } from "motion/react";
import type { ReactNode } from "react";
import { getHeroCombatProfile } from "../domain/combat";
import { displacedSlots, slotsFor } from "../domain/equipment";
import { getItemStats } from "../domain/items";
import type { Character, Equipment, ItemStats, OwnedItem } from "../domain/types";
import { useGameStore } from "../store/gameStore";
import { ItemIcon } from "./ItemIcon";
import { ItemTooltip } from "./ItemTooltip";
import { bonusText, itemName, MAIN_STAT_TEXT, mainStatParts, RARITY_BORDER, RARITY_TEXT, rarityLabel, typeText } from "./itemUi";
import { Hint } from "./HoverCard";

/** Eine Item-Zeile mit Werten, Vergleich zum Angelegten und Aktions-Buttons. */
export function ItemRow({
  owned,
  stats,
  equipment,
  tooLow,
  children,
}: {
  owned: OwnedItem;
  stats: ItemStats;
  equipment: Equipment;
  tooLow: boolean;
  children: ReactNode;
}) {
  const { def, rarity } = stats;
  const character = useGameStore((s) => s.character);
  const delta = compareToEquipped(owned, stats, equipment, character);
  const bonuses = bonusText(stats.bonuses);
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 40, transition: { duration: 0.15 } }}
      className={`flex items-center gap-3 rounded-md border-2 bg-night-800 p-2 ${RARITY_BORDER[rarity]}`}
    >
      <ItemTooltip stats={stats}>
        <ItemIcon def={def} rarity={rarity} size={36} />
      </ItemTooltip>
      <div className="min-w-0 flex-1">
        <p className={`truncate font-semibold ${RARITY_TEXT[rarity]}`}>
          {itemName(stats)}
          {rarity !== "common" && <span className="ml-2 text-xs font-normal">{rarityLabel(rarity)}</span>}
        </p>
        <div className="flex flex-wrap gap-x-2 text-xs">
          <span className="text-muted">{typeText(def)}</span>
          {mainStatParts(stats).map((part) => (
            <span key={part.kind} className={MAIN_STAT_TEXT[part.kind]}>
              {part.text}
            </span>
          ))}
          {delta.damage !== 0 && (
            <Hint text="Schaden pro Treffer gegenüber jetzt – mit Attribut-Skalierung, Klasse, Skills und Set-Bonus.">
              <span className={trend(delta.damage)}>{arrow(delta.damage)} Schaden</span>
            </Hint>
          )}
          {delta.armor !== 0 && (
            <Hint text="Rüstung der Ausrüstung gegenüber jetzt.">
              <span className={trend(delta.armor)}>{arrow(delta.armor)} Rüstung</span>
            </Hint>
          )}
          <span className={tooLow ? "text-danger" : "text-muted"}>ab Lv. {def.requiredLevel}</span>
        </div>
        {bonuses && <p className="text-xs text-xp">{bonuses}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">{children}</div>
    </motion.li>
  );
}

const trend = (value: number) => (value > 0 ? "text-xp" : value < 0 ? "text-danger" : "text-muted");
const arrow = (value: number) => (value > 0 ? `▲ ${value}` : value < 0 ? `▼ ${-value}` : "± 0");

interface Comparison {
  /** Rüstung der Ausrüstung – die Werte auf den Items */
  armor: number;
  /** Schaden pro Treffer mit allem: Attribut-Skalierung, Klasse, Skills, Set-Bonus */
  damage: number;
}

/**
 * Veränderung, wenn das Item angelegt wird – inklusive allem, was dafür weichen
 * müsste (z. B. ein Zweihänder für einen Schild). Der Schaden wird mit dem ganzen
 * Helden vorher und nachher berechnet, die Rüstung zählt nur die Werte der Items.
 * Bei mehreren möglichen Slots zählt der günstigste.
 */
function compareToEquipped(owned: OwnedItem, stats: ItemStats, equipment: Equipment, character: Character): Comparison {
  // Schon angelegt (z. B. beim Schmied) – nichts zu vergleichen
  if (Object.values(equipment).some((o) => o?.uid === owned.uid)) return { armor: 0, damage: 0 };
  const before = getHeroCombatProfile(character, equipment).damage;
  const options = slotsFor(stats.def).map((slot) => {
    let armor = stats.armor;
    const after: Equipment = { ...equipment };
    for (const s of displacedSlots(stats.def, slot, equipment)) {
      const current = equipment[s];
      after[s] = null;
      if (!current) continue;
      armor -= getItemStats(current).armor;
    }
    after[slot] = owned;
    return { armor, damage: Math.round(getHeroCombatProfile(character, after).damage - before) };
  });
  return options.reduce((best, d) => (d.damage + d.armor > best.damage + best.armor ? d : best));
}
