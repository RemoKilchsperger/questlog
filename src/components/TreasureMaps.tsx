// Schatzkarten (docs/schatzkarten.md): Fund nach einem Sieg, Liste bei den laufenden Quests
// und was im Schatzraum lag.

import { motion } from "motion/react";
import { getDungeon } from "../domain/creatures";
import { foodEffectText, getFood } from "../domain/food";
import { getItemEffect } from "../domain/itemEffects";
import { getItemStats } from "../domain/items";
import { MAX_MAPS, type TreasureFind, type TreasureMap } from "../domain/treasureMaps";
import { useGameStore } from "../store/gameStore";
import { ItemIcon } from "./ItemIcon";
import { itemName, mainStatText, RARITY_BORDER, RARITY_TEXT, rarityLabel } from "./itemUi";

/** Siegmeldung: Eine Schatzkarte ist gefallen. */
export function TreasureMapFind({ map }: { map: TreasureMap }) {
  return (
    <motion.p
      initial={{ scale: 0.6, rotate: -3 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 220, damping: 12 }}
      className="rounded-md border-2 border-legendary/70 bg-legendary/10 px-3 py-1.5 font-bold text-legendary"
    >
      🗺️ Schatzkarte gefunden!{" "}
      <span className="font-normal text-parchment">
        Sie zeigt einen verborgenen Raum in {getDungeon(map.dungeonId).name} – hinter dem Zwischenboss.
      </span>
    </motion.p>
  );
}

/** Laufende Quests: die Schatzkarten, die man bei sich trägt. */
export function TreasureMapList() {
  const maps = useGameStore((s) => s.treasureMaps);
  if (maps.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-col gap-2">
      {maps.map((map) => {
        const dungeon = getDungeon(map.dungeonId);
        return (
          <motion.li
            key={map.id}
            layout
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-3 rounded-md border-2 border-legendary/60 bg-night-800 p-3"
          >
            <span className="text-3xl" aria-hidden>
              🗺️
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-legendary">Schatzkarte: {dungeon.name}</p>
              <p className="text-sm text-parchment">
                Betritt {dungeon.name} und besiege den Zwischenboss. An der Gabelung danach führt eine Tür in den Schatzraum.
              </p>
              <p className="mt-1 text-xs text-epic">🎁 Garantiert ein legendäres Item oder ein seltenes Rezept</p>
            </div>
          </motion.li>
        );
      })}
      {maps.length >= MAX_MAPS && (
        <p className="text-xs text-muted">Mehr als {MAX_MAPS} Karten trägst du nicht bei dir – löse zuerst eine ein.</p>
      )}
    </ul>
  );
}

/** Was im Schatzraum lag – schon gutgeschrieben. */
export function TreasureFindCard({ find }: { find: TreasureFind }) {
  if (find.kind === "recipe") {
    const food = getFood(find.foodId);
    return (
      <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} className="rounded-md border-2 border-epic bg-night-800 px-4 py-2">
        <p className="text-xs text-muted">📜 Ein vergilbtes Rezept</p>
        <p className="font-pixel text-lg text-epic">
          {food.icon} {food.name}
        </p>
        <p className="text-xs text-xp">{foodEffectText(food)}</p>
        <p className="text-xs text-muted">Ab jetzt kocht es dir die Taverne.</p>
      </motion.div>
    );
  }
  const stats = getItemStats(find.item);
  const effect = stats.effect ? getItemEffect(stats.effect) : null;
  return (
    <motion.div
      initial={{ scale: 0.6, rotate: -4 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 220, damping: 12 }}
      className={`rounded-md border-2 bg-night-800 px-4 py-2 ${RARITY_BORDER[stats.rarity]}`}
    >
      <p className={`font-pixel text-lg ${RARITY_TEXT[stats.rarity]}`}>
        <ItemIcon def={stats.def} rarity={stats.rarity} size={32} /> {itemName(stats)}
      </p>
      <p className="text-xs">
        <span className={RARITY_TEXT[stats.rarity]}>{rarityLabel(stats.rarity)}</span> · {mainStatText(stats)} · ab Lv.{" "}
        {stats.def.requiredLevel}
      </p>
      {effect && (
        <p className="text-xs text-legendary">
          {effect.icon} {effect.name}: <span className="text-muted">{effect.description}</span>
        </p>
      )}
    </motion.div>
  );
}
