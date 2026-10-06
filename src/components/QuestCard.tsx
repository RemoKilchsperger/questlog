import { motion } from "motion/react";
import { currentStreak, isMissed, isWaiting, recurrenceLabel, streakAfterCompletion, streakBonus } from "../domain/recurrence";
import { calculateReward, dropChance, getCategory, getEffortTier } from "../domain/rewards";
import type { Quest } from "../domain/types";
import { useGameStore } from "../store/gameStore";
import { Gold } from "./Gold";

export function QuestCard({ quest }: { quest: Quest }) {
  const completeQuest = useGameStore((s) => s.completeQuest);
  const deleteQuest = useGameStore((s) => s.deleteQuest);

  const category = getCategory(quest.category);
  const tier = getEffortTier(quest.effort);
  const isDone = quest.status === "done";
  const now = today();
  const recurring = quest.recurrence !== undefined && !isDone;
  const waiting = recurring && isWaiting(quest, now);
  const missed = recurring && isMissed(quest, now);
  // Vorschau: die Serie, mit der die Quest jetzt erledigt würde
  const nextStreak = recurring ? streakAfterCompletion(quest, now) : 0;
  const reward = quest.reward ?? calculateReward(quest.effort, quest.category, quest.bonus, nextStreak);
  const overdue = !isDone && !recurring && quest.dueDate !== undefined && quest.dueDate < now;
  const streak = recurring ? currentStreak(quest, now) : 0;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
      className={`group flex items-start gap-3 rounded-md border-2 bg-night-800 p-3 ${
        overdue ? "border-danger/70" : waiting ? "border-night-700 opacity-60" : "border-night-700"
      }`}
    >
      <div className="mt-0.5 text-2xl" aria-hidden>
        {category.icon}
      </div>

      <div className="min-w-0 flex-1">
        <p className={`font-semibold break-words ${isDone ? "text-muted line-through" : ""}`}>
          {quest.bonus && (
            // inline-block, damit das Durchstreichen erledigter Quests das Abzeichen nicht trifft
            <span className="mr-1.5 inline-block rounded bg-gold/15 px-1.5 py-0.5 text-xs font-normal text-gold">
              ⭐ Bonus
            </span>
          )}
          {quest.title}
        </p>
        {recurring && (
          <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs">
            <span className="text-intellect">🔁 {recurrenceLabel(quest.recurrence!)}</span>
            <span
              className={streak > 0 ? "text-legendary" : "text-muted"}
              title={`Serie: pünktlich erledigte Termine in Folge (Rekord: ${quest.bestStreak ?? 0})`}
            >
              🔥 {streak}
              {missed && (quest.streak ?? 0) > 0 && " · Serie gerissen"}
            </span>
            {!waiting && nextStreak > 1 && (
              <span className="text-legendary">+{Math.round(streakBonus(nextStreak) * 100)} % Serienbonus</span>
            )}
          </p>
        )}
        {quest.reward?.streak !== undefined && quest.reward.streak > 1 && (
          <p className="mt-0.5 text-xs text-legendary">🔥 Serie {quest.reward.streak}</p>
        )}
        {quest.description && <p className="mt-0.5 text-sm break-words text-muted">{quest.description}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="rounded bg-night-950 px-1.5 py-0.5 text-muted">
            {tier.label} · {tier.duration}
          </span>
          <span className="text-xp tabular-nums">+{reward.xp} XP</span>
          <Gold amount={reward.gold} sign className="text-gold" />
          {reward.battlePoints !== undefined && (
            <span className="text-strength tabular-nums" title="Kampfpunkte">
              +{reward.battlePoints} ⚔️
            </span>
          )}
          {!isDone && (
            <span className="text-epic tabular-nums" title="Chance auf einen Item-Drop">
              🎁 {Math.round(dropChance(quest.effort, quest.bonus) * 100)}%
            </span>
          )}
          {quest.dueDate && !isDone && (
            <span className={overdue || missed ? "text-danger" : "text-muted"}>
              {waiting ? "Wieder fällig: " : overdue ? "Überfällig: " : missed ? "Verpasst: " : "Fällig: "}
              {quest.dueDate === now ? "heute" : formatDate(quest.dueDate)}
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        {!isDone && !waiting && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => completeQuest(quest.id)}
            className="font-pixel rounded-md border-2 border-xp bg-xp/15 px-3 py-1 text-xp hover:bg-xp/25"
          >
            Erledigt
          </motion.button>
        )}
        {waiting && <span className="text-xs text-xp">✓ Erledigt</span>}
        <button
          onClick={() => deleteQuest(quest.id)}
          className="text-xs text-muted opacity-70 hover:text-danger hover:opacity-100"
          aria-label={`Quest „${quest.title}“ löschen`}
        >
          Löschen
        </button>
      </div>
    </motion.li>
  );
}

function today(): string {
  // Lokales Datum (nicht UTC), passend zum <input type="date">
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}
