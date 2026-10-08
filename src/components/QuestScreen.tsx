import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { dateKey, formatCountdown, nextBoundary } from "../domain/calendar";
import { AREAS, DUNGEONS, getCreature, getDungeon, isAreaUnlocked } from "../domain/creatures";
import { getLevel } from "../domain/leveling";
import {
  isQuestComplete,
  NO_DAILY_QUESTS,
  QUESTS,
  questGoalText,
  questTarget,
  trackedQuests,
  type QuestDef,
  type TrackedQuest,
} from "../domain/quests";
import { useGameStore } from "../store/gameStore";
import { CreatureSprite } from "./CreatureSprite";
import { Gold } from "./Gold";
import { Hint } from "./HoverCard";
import { useNow } from "./useNow";

/** Quest-Tab: Tagesaufträge und laufende Quests links, das Questbuch rechts. */
export function QuestScreen() {
  const now = useNow();
  const today = dateKey(now);
  const refreshDailyQuests = useGameStore((s) => s.refreshDailyQuests);
  useEffect(() => refreshDailyQuests(), [today, refreshDailyQuests]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-4">
        <DailyQuestPanel now={now} />
        <ActiveQuestPanel />
      </div>
      <QuestBook />
    </div>
  );
}

/** Wie viele Quests erfüllt sind und auf die Abgabe warten – für das Abzeichen am Tab. */
export function useReadyQuestCount(): number {
  return useGameStore((s) =>
    trackedQuests(s.questLog, s.dailyQuests, dateKey()).filter((q) => isQuestComplete(q.def, q.progress)).length,
  );
}

function DailyQuestPanel({ now }: { now: Date }) {
  const daily = useGameStore((s) => s.dailyQuests);
  const quests = daily.date === dateKey(now) ? daily.quests : [];
  const done = quests.filter((q) => q.turnedIn).length;

  return (
    <section className="panel border-gold/50 p-4">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-pixel text-2xl text-gold">⭐ Tagesaufträge</h2>
        <span className="text-xs text-muted">Neue in {formatCountdown(now, nextBoundary(now, 24))}</span>
      </div>
      <p className="mb-3 text-xs text-muted">
        Jeden Tag neue Jagdaufträge passend zu deinem Level – sie zählen sofort, ohne Annehmen.{" "}
        <span className="num text-parchment">
          {done}/{quests.length}
        </span>{" "}
        abgegeben.
      </p>
      <ul className="flex flex-col gap-2">
        {quests.map((q) => (
          <QuestRow key={q.def.id} def={q.def} progress={q.progress} state={q.turnedIn ? "done" : "active"} daily />
        ))}
      </ul>
    </section>
  );
}

function ActiveQuestPanel() {
  const questLog = useGameStore((s) => s.questLog);
  const active = trackedQuests(questLog, NO_DAILY_QUESTS, dateKey());

  return (
    <section className="panel p-4">
      <h2 className="font-pixel mb-1 text-2xl">📜 Laufende Quests</h2>
      {active.length === 0 ? (
        <p className="text-sm text-muted">
          Noch keine Quest angenommen. Im Questbuch findest du Aufträge für jedes Gebiet – Siege im Kampf-Tab bringen sie
          voran.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {active.map((q) => (
              <QuestRow key={q.def.id} def={q.def} progress={q.progress} state="active" />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}

/** Alle Quests nach Gebiet – annehmen, was offen ist. */
function QuestBook() {
  const level = useGameStore((s) => getLevel(s.character.totalXp));
  const questLog = useGameStore((s) => s.questLog);
  const areas = [...AREAS, ...DUNGEONS];
  const unlocked = AREAS.filter((a) => isAreaUnlocked(a, level));
  const [areaId, setAreaId] = useState(unlocked[unlocked.length - 1].id);
  const area = areas.find((a) => a.id === areaId)!;
  const quests = QUESTS.filter((q) => q.areaId === area.id);
  const open = isAreaUnlocked(area, level);

  return (
    <section className="panel min-w-0 self-start p-4">
      <h2 className="font-pixel text-2xl">📖 Questbuch</h2>
      <p className="mb-3 text-xs text-muted">
        <span className="num text-parchment">
          {questLog.completed.length}/{QUESTS.length}
        </span>{" "}
        Quests abgegeben. Jede Quest gibt es einmal – angenommen, erfüllt im Kampf, hier abgegeben.
      </p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {areas.map((a) => {
          const reachable = isAreaUnlocked(a, level);
          const ids = QUESTS.filter((q) => q.areaId === a.id).map((q) => q.id);
          const finished = ids.every((id) => questLog.completed.includes(id));
          return (
            <button
              key={a.id}
              onClick={() => setAreaId(a.id)}
              aria-pressed={a.id === areaId}
              title={reachable ? a.description : `Ab Level ${a.minLevel}`}
              className={`rounded-md border-2 px-2 py-0.5 text-sm ${
                a.id === areaId ? "border-gold text-gold" : "border-night-700 text-muted hover:text-parchment"
              } ${reachable ? "" : "opacity-50"}`}
            >
              {reachable ? (finished ? "✓ " : a.dungeon ? "🏰 " : "") : "🔒 "}
              {a.name}
            </button>
          );
        })}
      </div>
      <p className="mb-2 text-sm text-muted">
        {area.description} <span className="text-xs">Lv. {area.minLevel === area.maxLevel ? area.minLevel : `${area.minLevel}–${area.maxLevel}`}</span>
      </p>
      {!open && <p className="mb-2 text-sm text-danger">🔒 Ab Level {area.minLevel} – bis dahin kannst du die Quests nur ansehen.</p>}
      <ul className="flex flex-col gap-2">
        {quests.map((q) => (
          <QuestRow
            key={q.id}
            def={q}
            progress={questLog.active[q.id] ?? 0}
            state={
              questLog.completed.includes(q.id) ? "done" : q.id in questLog.active ? "active" : open ? "available" : "locked"
            }
            compact
          />
        ))}
      </ul>
    </section>
  );
}

type RowState = "available" | "active" | "done" | "locked";

/** Eine Quest: Ziel, Fortschritt, Belohnung und die passende Aktion. */
function QuestRow({
  def,
  progress,
  state,
  daily = false,
  compact = false,
}: {
  def: QuestDef;
  progress: number;
  state: RowState;
  daily?: boolean;
  /** Im Questbuch: laufende Quests nur als Hinweis, ohne Abgabe */
  compact?: boolean;
}) {
  const accept = useGameStore((s) => s.acceptQuest);
  const abandon = useGameStore((s) => s.abandonQuest);
  const turnIn = useGameStore((s) => s.turnInQuest);
  const target = questTarget(def);
  const complete = state === "active" && isQuestComplete(def, progress);
  const { reward } = def;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
      className={`flex items-start gap-3 rounded-md border-2 bg-night-800 p-3 ${
        complete ? "border-xp/70" : state === "done" || state === "locked" ? "border-night-700 opacity-60" : "border-night-700"
      }`}
    >
      <QuestIcon def={def} />
      <div className="min-w-0 flex-1">
        <p className={`font-semibold break-words ${state === "done" ? "text-muted line-through" : ""}`}>{def.title}</p>
        <p className="text-sm text-parchment">{questGoalText(def)}</p>
        {!compact && def.description && <p className="text-xs text-muted">{def.description}</p>}
        {state === "active" && !compact && <ProgressBar value={progress} max={target} />}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="text-xp tabular-nums">+{reward.xp} XP</span>
          <Gold amount={reward.gold} sign className="text-gold" />
          <Hint text="Chance auf ein Item beim Abgeben – auf deinem Level.">
            <span className="text-epic tabular-nums">
              🎁 {reward.dropChance >= 1 ? "garantiert" : `${Math.round(reward.dropChance * 100)} %`}
            </span>
          </Hint>
          {compact && state === "active" && (
            <span className={complete ? "text-xp" : "text-muted"}>
              {complete ? "✓ Erfüllt – links abgeben" : `Läuft: ${progress}/${target}`}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {state === "available" && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => accept(def.id)}
            className="font-pixel rounded-md border-2 border-gold bg-gold/15 px-3 py-1 text-gold hover:bg-gold/25"
          >
            Annehmen
          </motion.button>
        )}
        {state === "active" && !compact && (
          <>
            <motion.button
              whileTap={{ scale: 0.9 }}
              disabled={!complete}
              onClick={() => turnIn(def.id)}
              title={complete ? undefined : "Noch nicht erfüllt"}
              className="font-pixel rounded-md border-2 border-xp bg-xp/15 px-3 py-1 text-xp hover:bg-xp/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Abgeben
            </motion.button>
            {!daily && (
              <button
                onClick={() => abandon(def.id)}
                className="text-xs text-muted opacity-70 hover:text-danger hover:opacity-100"
                aria-label={`Quest „${def.title}“ abbrechen`}
              >
                Abbrechen
              </button>
            )}
          </>
        )}
        {state === "done" && <span className="text-xs text-xp">✓ Abgegeben</span>}
      </div>
    </motion.li>
  );
}

function QuestIcon({ def }: { def: QuestDef }) {
  const creature =
    def.goal.kind === "kill" ? getCreature(def.goal.creatureId).creature : getDungeon(def.goal.dungeonId).creatures.at(-1)!;
  return <CreatureSprite sprite={creature.sprite} size={40} className="shrink-0" />;
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div
        className="h-2.5 flex-1 overflow-hidden rounded-sm border-2 border-night-950 bg-night-700"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemax={max}
      >
        <motion.div
          className="h-full bg-xp"
          initial={false}
          animate={{ width: `${Math.max((value / max) * 100, 2)}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        />
      </div>
      <span className="num text-xs text-muted">
        {value}/{max}
      </span>
    </div>
  );
}

/** Kleiner Hinweis für den Kampf-Tab: laufende Quests gegen diese Kreatur. */
export function QuestProgressChips({ quests }: { quests: readonly TrackedQuest[] }) {
  if (quests.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {quests.map((q) => {
        const complete = isQuestComplete(q.def, q.progress);
        return (
          <Hint key={q.def.id} text={`${q.def.title}: ${questGoalText(q.def)}`}>
            <span
              className={`num rounded px-1.5 py-0.5 text-xs ${complete ? "bg-xp/20 text-xp" : "bg-gold/15 text-gold"}`}
            >
              {q.daily ? "⭐" : "📜"} {q.progress}/{questTarget(q.def)}
              {complete && " ✓"}
            </span>
          </Hint>
        );
      })}
    </span>
  );
}
