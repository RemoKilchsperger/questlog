import { motion } from "motion/react";
import type { ReactNode } from "react";
import { displacedSlots, slotsFor } from "../domain/equipment";
import { getItemStats } from "../domain/items";
import type { CombatStats, Equipment, ItemStats } from "../domain/types";
import { ItemIcon } from "./ItemIcon";
import { ItemTooltip } from "./ItemTooltip";
import { bonusText, itemName, MAIN_STAT_TEXT, mainStatParts, RARITY_BORDER, RARITY_TEXT, rarityLabel, typeText } from "./itemUi";

/** Eine Item-Zeile mit Werten, Vergleich zum Angelegten und Aktions-Buttons. */
export function ItemRow({
  stats,
  equipment,
  tooLow,
  children,
}: {
  stats: ItemStats;
  equipment: Equipment;
  tooLow: boolean;
  children: ReactNode;
}) {
  const { def, rarity } = stats;
  const delta = compareToEquipped(stats, equipment);
  const deltas: [number, string][] = [
    [delta.attack, "Angriff"],
    [delta.armor, "Rüstung"],
  ];
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
          {deltas.map(
            ([value, label]) =>
              value !== 0 && (
                <span key={label} className={value > 0 ? "text-xp" : "text-danger"} title={`${label} gegenüber jetzt`}>
                  {value > 0 ? `▲ ${value}` : `▼ ${-value}`} {label}
                </span>
              ),
          )}
          <span className={tooLow ? "text-danger" : "text-muted"}>ab Lv. {def.requiredLevel}</span>
        </div>
        {bonuses && <p className="text-xs text-xp">{bonuses}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">{children}</div>
    </motion.li>
  );
}

/**
 * Veränderung von Angriff und Rüstung, wenn das Item angelegt wird – inklusive
 * allem, was dafür weichen müsste (z. B. ein Zweihänder für einen Schild).
 * Bei mehreren möglichen Slots zählt der günstigste.
 */
function compareToEquipped(stats: ItemStats, equipment: Equipment): CombatStats {
  const options = slotsFor(stats.def).map((slot) => {
    const delta = { attack: stats.attack, armor: stats.armor };
    for (const s of displacedSlots(stats.def, slot, equipment)) {
      const owned = equipment[s];
      if (!owned) continue;
      const lost = getItemStats(owned);
      delta.attack -= lost.attack;
      delta.armor -= lost.armor;
    }
    return delta;
  });
  return options.reduce((best, d) => (d.attack + d.armor > best.attack + best.armor ? d : best));
}
