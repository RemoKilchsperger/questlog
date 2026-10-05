import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { getItemStats } from "../domain/items";
import { POINTS_PER_LEVEL } from "../domain/leveling";
import { STAT_LABELS } from "../domain/rewards";
import { SKILL_POINTS_PER_LEVEL } from "../domain/skills";
import { useGameStore } from "../store/gameStore";
import { Gold } from "./Gold";
import { ItemIcon } from "./ItemIcon";
import { bonusText, mainStatText, RARITY_BORDER, RARITY_TEXT, rarityLabel } from "./itemUi";

/** Belohnungs-Popup nach Abschluss einer Quest, mit grossem Level-up-Banner. */
export function RewardToast() {
  const event = useGameStore((s) => s.lastReward);
  const dismiss = useGameStore((s) => s.dismissReward);
  const levelUp = event !== null && event.levelAfter > event.levelBefore;
  const loot = event?.loot ? getItemStats(event.loot) : null;
  const linger = levelUp || loot !== null;

  useEffect(() => {
    if (!event) return;
    const t = setTimeout(dismiss, linger ? 4000 : 2200);
    return () => clearTimeout(t);
  }, [event, linger, dismiss]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <AnimatePresence>
        {event && (
          <motion.div
            key={event.id}
            initial={{ y: 60, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
            className="panel pointer-events-auto w-full max-w-sm border-gold p-4 text-center"
            onClick={dismiss}
            role="status"
          >
            {levelUp && (
              <motion.p
                className="font-pixel mb-1 text-3xl text-gold"
                initial={{ scale: 0.5, rotate: -6 }}
                animate={{ scale: [0.5, 1.25, 1], rotate: [-6, 3, 0] }}
                transition={{ duration: 0.6 }}
              >
                LEVEL UP! → <span className="num">{event.levelAfter}</span>
              </motion.p>
            )}
            {levelUp && (
              <p className="mb-2 text-sm text-xp">
                +<span className="num">{(event.levelAfter - event.levelBefore) * POINTS_PER_LEVEL}</span> Attributpunkte
                und +<span className="num">{(event.levelAfter - event.levelBefore) * SKILL_POINTS_PER_LEVEL}</span>{" "}
                Skillpunkt{event.levelAfter - event.levelBefore > 1 ? "e" : ""}
              </p>
            )}
            <p className={`text-sm ${event.bonus ? "text-gold" : "text-muted"}`}>
              {event.bonus ? "⭐ Bonusquest abgeschlossen" : "Quest abgeschlossen"}
            </p>
            <p className="truncate font-semibold">{event.questTitle}</p>
            <div className="num mt-2 flex justify-center gap-4 text-base">
              <span className="text-xp">+{event.reward.xp} XP</span>
              <Gold amount={event.reward.gold} sign className="text-base font-bold text-gold" />
              {(event.reward.battlePoints ?? 0) > 0 && (
                <span className="text-strength">+{event.reward.battlePoints} ⚔️</span>
              )}
              {event.reward.statPoints > 0 && (
                <span>
                  +{event.reward.statPoints} {STAT_LABELS[event.reward.stat]}
                </span>
              )}
            </div>
            {loot && (
              <motion.div
                className={`mt-3 rounded-md border-2 bg-night-800 p-2 ${RARITY_BORDER[loot.rarity]}`}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.25, type: "spring", stiffness: 260, damping: 16 }}
              >
                <p className="text-xs text-muted">🎁 Beute gefunden!</p>
                <p className={`font-pixel text-lg ${RARITY_TEXT[loot.rarity]}`}>
                  <ItemIcon def={loot.def} rarity={loot.rarity} size={32} /> {loot.def.name}
                </p>
                <p className="text-xs">
                  <span className={RARITY_TEXT[loot.rarity]}>{rarityLabel(loot.rarity)}</span>
                  {" · "}
                  {mainStatText(loot)}
                  {bonusText(loot.bonuses) && <span className="text-xp"> · {bonusText(loot.bonuses)}</span>}
                </p>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
