import { motion } from "motion/react";
import { getDailyBonusQuests, type BonusQuest } from "../domain/bonusQuests";
import { dateKey, formatCountdown, nextBoundary } from "../domain/calendar";
import { BONUS_MULTIPLIER, calculateReward, dropChance, getCategory, getEffortTier, STAT_LABELS } from "../domain/rewards";
import { useGameStore } from "../store/gameStore";
import { Gold } from "./Gold";
import { useNow } from "./useNow";

/** Die fünf Bonusquests des Tages – eine pro Aufwandsstufe, mit besserer Belohnung. */
export function BonusQuests() {
  const now = useNow();
  const today = dateKey(now);
  const bonusDone = useGameStore((s) => s.bonusDone);
  const doneIds = bonusDone.date === today ? bonusDone.ids : [];
  const quests = getDailyBonusQuests(today);

  return (
    <section className="panel border-gold/50 p-4">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-pixel text-2xl text-gold">⭐ Bonusquests</h2>
        <span className="text-xs text-muted">Neue in {formatCountdown(now, nextBoundary(now, 24))}</span>
      </div>
      <p className="mb-3 text-xs text-muted">
        Jeden Tag neu: eine pro Stufe, mit <span className="text-gold">×{BONUS_MULTIPLIER}</span> XP, Gold und
        Drop-Chance – die epische gibt sogar 2 Attributpunkte.{" "}
        <span className="num text-parchment">
          {doneIds.length}/{quests.length}
        </span>{" "}
        erledigt.
      </p>
      <ul className="flex flex-col gap-2">
        {quests.map((q) => (
          <BonusQuestRow key={q.id} quest={q} done={doneIds.includes(q.id)} />
        ))}
      </ul>
    </section>
  );
}

function BonusQuestRow({ quest, done }: { quest: BonusQuest; done: boolean }) {
  const complete = useGameStore((s) => s.completeBonusQuest);
  const category = getCategory(quest.category);
  const tier = getEffortTier(quest.effort);
  const reward = calculateReward(quest.effort, quest.category, true);

  return (
    <li
      className={`flex items-center gap-3 rounded-md border-2 p-2.5 ${
        done ? "border-night-700 bg-night-950/60 opacity-60" : "border-gold/40 bg-night-800"
      }`}
    >
      <span className="text-2xl" aria-hidden title={category.label}>
        {category.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`font-semibold break-words ${done ? "text-muted line-through" : ""}`}>{quest.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="rounded bg-night-950 px-1.5 py-0.5 text-muted">
            {tier.label} · {tier.duration}
          </span>
          <span className="text-xp tabular-nums">+{reward.xp} XP</span>
          <Gold amount={reward.gold} sign className="text-gold" />
          <span className="text-strength tabular-nums" title="Kampfpunkte">
            +{reward.battlePoints} ⚔️
          </span>
          {reward.statPoints > 0 && (
            <span className="tabular-nums">
              +{reward.statPoints} {STAT_LABELS[reward.stat]}
            </span>
          )}
          <span className="text-epic tabular-nums" title="Chance auf einen Item-Drop">
            🎁 {Math.round(dropChance(quest.effort, true) * 100)}%
          </span>
        </div>
      </div>
      {done ? (
        <span className="font-pixel shrink-0 text-xp">✓ Erledigt</span>
      ) : (
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => complete(quest.id)}
          className="font-pixel shrink-0 rounded-md border-2 border-gold bg-gold/15 px-3 py-1 text-gold hover:bg-gold/25"
        >
          Erledigt
        </motion.button>
      )}
    </li>
  );
}
