import { useState, type FormEvent } from "react";
import { MAX_INTERVAL, recurrenceLabel, WEEKDAY_LABELS, type Recurrence } from "../domain/recurrence";
import { CATEGORIES, EFFORT_TIERS, STAT_LABELS, getCategory } from "../domain/rewards";
import type { Category, Effort } from "../domain/types";
import { useGameStore } from "../store/gameStore";

export function QuestForm() {
  const addQuest = useGameStore((s) => s.addQuest);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [effort, setEffort] = useState<Effort>("short");
  const [category, setCategory] = useState<Category>("daily");
  const [dueDate, setDueDate] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [repeat, setRepeat] = useState<"none" | Recurrence["kind"]>("none");
  const [days, setDays] = useState<number[]>([0, 2, 4]);
  const [every, setEvery] = useState(2);

  const recurrence: Recurrence | undefined =
    repeat === "daily"
      ? { kind: "daily" }
      : repeat === "weekdays"
        ? { kind: "weekdays", days }
        : repeat === "interval"
          ? { kind: "interval", every }
          : undefined;
  const canSubmit = title.trim().length > 0 && (repeat !== "weekdays" || days.length > 0);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    addQuest({ title, description, effort, category, dueDate, recurrence });
    setTitle("");
    setDescription("");
    setDueDate("");
  }

  const toggleDay = (day: number) =>
    setDays((current) => (current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort()));

  return (
    <form onSubmit={handleSubmit} className="panel flex flex-col gap-4 p-4 lg:sticky lg:top-4 lg:self-start">
      <h2 className="font-pixel text-2xl text-gold">Neue Quest</h2>

      <label className="flex flex-col gap-1">
        <span className="text-sm text-muted">Was ist zu tun?</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="z. B. Steuererklärung abschliessen"
          maxLength={120}
          className="rounded-md border-2 border-night-700 bg-night-950 px-3 py-2 outline-none focus:border-gold"
        />
      </label>

      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm text-muted">Bereich</legend>
        <div className="grid grid-cols-2 gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setCategory(c.key)}
              aria-pressed={category === c.key}
              className={`rounded-md border-2 px-2 py-2 text-left text-sm transition ${
                category === c.key
                  ? "border-gold bg-night-800"
                  : "border-night-700 hover:border-night-600"
              }`}
            >
              <span className="mr-1">{c.icon}</span>
              {c.label}
              <span className="block text-xs text-muted" title="Epische Quests geben 1 Punkt auf dieses Attribut">
                trainiert {STAT_LABELS[c.stat]}
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm text-muted">Zeitaufwand</legend>
        <div className="flex flex-col gap-1.5">
          {EFFORT_TIERS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setEffort(t.key)}
              aria-pressed={effort === t.key}
              className={`flex items-center justify-between rounded-md border-2 px-3 py-1.5 text-sm transition ${
                effort === t.key
                  ? "border-gold bg-night-800"
                  : "border-night-700 hover:border-night-600"
              }`}
            >
              <span>
                <span className="font-semibold">{t.label}</span>
                <span className="ml-2 text-muted">{t.duration}</span>
              </span>
              <span className="tabular-nums">
                <span className="text-xp">+{t.xp} XP</span>
                <span className="ml-2 text-gold">+{t.gold} 🪙</span>
                <span className="ml-2 text-strength" title="Kampfpunkte">
                  +{t.battlePoints} ⚔️
                </span>
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm text-muted">Wiederholen</legend>
        <div className="grid grid-cols-2 gap-1.5 text-sm">
          {(
            [
              ["none", "Einmalig"],
              ["daily", "Täglich"],
              ["weekdays", "Wochentage"],
              ["interval", "Alle X Tage"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setRepeat(key)}
              aria-pressed={repeat === key}
              className={`rounded-md border-2 px-1 py-1.5 transition ${
                repeat === key ? "border-gold bg-night-800" : "border-night-700 hover:border-night-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {repeat === "weekdays" && (
          <div className="flex gap-1" role="group" aria-label="Wochentage">
            {WEEKDAY_LABELS.map((label, day) => (
              <button
                key={label}
                type="button"
                onClick={() => toggleDay(day)}
                aria-pressed={days.includes(day)}
                className={`flex-1 rounded-md border-2 py-1 text-xs transition ${
                  days.includes(day) ? "border-gold bg-gold/15 text-gold" : "border-night-700 text-muted hover:border-night-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {repeat === "interval" && (
          <label className="flex items-center gap-2 text-sm text-muted">
            Alle
            <input
              type="number"
              min={1}
              max={MAX_INTERVAL}
              value={every}
              onChange={(e) => setEvery(Math.min(MAX_INTERVAL, Math.max(1, Math.round(Number(e.target.value) || 1))))}
              className="w-16 rounded-md border-2 border-night-700 bg-night-950 px-2 py-1 text-parchment outline-none focus:border-gold"
            />
            Tage
          </label>
        )}
        {recurrence && (
          <p className="text-xs text-muted">
            🔁 {recurrenceLabel(recurrence)} – pünktlich erledigt wächst deine Serie 🔥: +5 % XP und Gold pro Tag in Folge
            (bis +50 %).
          </p>
        )}
      </fieldset>

      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        className="self-start text-sm text-muted underline-offset-2 hover:text-parchment hover:underline"
      >
        {showMore ? "− Weniger" : recurrence ? "+ Beschreibung" : "+ Beschreibung & Fälligkeit"}
      </button>

      {showMore && (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-muted">Beschreibung</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="rounded-md border-2 border-night-700 bg-night-950 px-3 py-2 outline-none focus:border-gold"
            />
          </label>
          {!recurrence && (
          <label className="flex flex-col gap-1">
            <span className="text-sm text-muted">Fällig am</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="rounded-md border-2 border-night-700 bg-night-950 px-3 py-2 outline-none [color-scheme:dark] focus:border-gold"
            />
          </label>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="font-pixel rounded-md border-2 border-gold bg-gold px-4 py-2 text-lg text-night-950 transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Quest annehmen {getCategory(category).icon}
      </button>
    </form>
  );
}
