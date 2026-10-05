import { useState, type FormEvent } from "react";
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

  const canSubmit = title.trim().length > 0;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    addQuest({ title, description, effort, category, dueDate });
    setTitle("");
    setDescription("");
    setDueDate("");
  }

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

      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        className="self-start text-sm text-muted underline-offset-2 hover:text-parchment hover:underline"
      >
        {showMore ? "− Weniger" : "+ Beschreibung & Fälligkeit"}
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
          <label className="flex flex-col gap-1">
            <span className="text-sm text-muted">Fällig am</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="rounded-md border-2 border-night-700 bg-night-950 px-3 py-2 outline-none [color-scheme:dark] focus:border-gold"
            />
          </label>
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
