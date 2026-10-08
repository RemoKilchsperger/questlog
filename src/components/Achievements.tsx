import { AnimatePresence, motion } from "motion/react";
import { useEffect, type ReactNode } from "react";
import {
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENTS,
  describe,
  FRAMES,
  getAchievement,
  getFrame,
  isMaxTier,
  MAX_TIERS,
  tierIcon,
  tierName,
  totalTiers,
  unlockedTitles,
  type AchievementDef,
} from "../domain/achievements";
import { useGameStore } from "../store/gameStore";
import { Hint } from "./HoverCard";

/** Rahmen um einen Avatar – \`frame\` ist die Id aus FRAMES. */
export function AvatarFrame({ frame, className = "", children }: { frame?: string; className?: string; children: ReactNode }) {
  const id = getFrame(frame).id;
  return <div className={`${id === "none" ? "" : `frame frame-${id}`} ${className}`}>{children}</div>;
}

/** Gewählter Titel – nichts, wenn keiner gewählt ist. */
export function TitleBadge({ achievementId, className = "" }: { achievementId?: string | null; className?: string }) {
  if (!achievementId) return null;
  const def = ACHIEVEMENTS.find((a) => a.id === achievementId);
  if (!def) return null;
  return <span className={`text-legendary italic ${className}`}>« {def.title} »</span>;
}

/** Titel und Rahmen auswählen (Charakter-Tab). */
export function CosmeticsPicker() {
  const tiers = useGameStore((s) => s.achievements);
  const cosmetics = useGameStore((s) => s.cosmetics);
  const setTitle = useGameStore((s) => s.setTitle);
  const setFrame = useGameStore((s) => s.setFrame);
  const titles = unlockedTitles(tiers);

  return (
    <div className="flex w-full flex-col gap-2 text-left">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Titel
        <select
          value={cosmetics.title ?? ""}
          onChange={(e) => setTitle(e.target.value || null)}
          className="rounded-md border-2 border-night-700 bg-night-950 px-2 py-1 text-sm text-parchment outline-none focus:border-gold"
        >
          <option value="">Kein Titel</option>
          {titles.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
        {titles.length === 0 && <span>Titel gibt es für jeden Erfolg in Gold.</span>}
      </label>
      <div className="flex flex-col gap-1 text-xs text-muted">
        Rahmen
        <div className="flex flex-wrap gap-1.5">
          {FRAMES.map((f) => {
            const unlocked = f.unlocked(tiers);
            const active = cosmetics.frame === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFrame(f.id)}
                disabled={!unlocked}
                title={`${f.name} – ${unlocked ? "freigeschaltet" : f.condition}`}
                aria-pressed={active}
                className={`h-8 w-8 rounded-md bg-night-800 disabled:cursor-not-allowed disabled:opacity-30 ${
                  f.id === "none" ? "border-2 border-dashed border-night-600" : `frame frame-${f.id}`
                } ${active ? "ring-2 ring-parchment ring-offset-2 ring-offset-night-900" : ""}`}
              >
                {!unlocked && <span aria-hidden>🔒</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Übersicht aller Erfolge mit Stufen und Fortschritt. */
export function AchievementsPanel() {
  const state = useGameStore((s) => s);
  const input = {
    character: state.character,
    questLog: state.questLog,
    bossCollection: state.bossCollection,
    coopStats: state.coopStats,
    records: state.records,
  };
  const done = totalTiers(state.achievements);

  return (
    <section className="panel p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-pixel text-2xl">Erfolge</h2>
        <span className="text-sm text-muted">
          <span className="num text-legendary">{done}</span> / <span className="num">{MAX_TIERS}</span> Stufen
        </span>
      </div>
      <div className="mb-4 h-2 overflow-hidden rounded-sm bg-night-700">
        <div className="h-full bg-legendary" style={{ width: `${(done / MAX_TIERS) * 100}%` }} />
      </div>
      <div className="flex flex-col gap-2">
        {ACHIEVEMENT_CATEGORIES.map((cat) => {
          const defs = ACHIEVEMENTS.filter((a) => a.category === cat.key);
          const reached = defs.reduce((sum, a) => sum + (state.achievements[a.id] ?? 0), 0);
          const max = defs.reduce((sum, a) => sum + a.tiers.length, 0);
          const gold = defs.filter((a) => isMaxTier(a, state.achievements[a.id] ?? 0)).length;
          return (
            <details key={cat.key} className="group rounded-md border-2 border-night-700 bg-night-900/60">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 hover:bg-night-800 [&::-webkit-details-marker]:hidden">
                <span className="text-muted transition-transform group-open:rotate-90" aria-hidden>
                  ▶
                </span>
                <span className="font-pixel text-lg">
                  {cat.icon} {cat.label}
                </span>
                <span className="ml-auto flex items-center gap-3 text-xs text-muted">
                  {gold > 0 && (
                    <Hint text="Erfolge in Gold – jeder schaltet einen Titel frei.">
                      <span>🥇 {gold}</span>
                    </Hint>
                  )}
                  <span>
                    <span className="num text-legendary">{reached}</span> / <span className="num">{max}</span> Stufen
                  </span>
                </span>
              </summary>
              <ul className="grid gap-2 p-3 pt-1 sm:grid-cols-2">
                {defs.map((def) => (
                  <AchievementCard key={def.id} def={def} tier={state.achievements[def.id] ?? 0} value={def.progress(input)} />
                ))}
              </ul>
            </details>
          );
        })}
      </div>
    </section>
  );
}

function AchievementCard({ def, tier, value }: { def: AchievementDef; tier: number; value: number }) {
  const complete = isMaxTier(def, tier);
  const target = def.tiers[Math.min(tier, def.tiers.length - 1)];
  const shown = Math.min(value, target);
  return (
    <li
      className={`flex gap-3 rounded-md border-2 p-2.5 ${complete ? "border-legendary/60 bg-legendary/5" : "border-night-700 bg-night-800"}`}
    >
      <span className={`text-2xl ${tier === 0 ? "grayscale opacity-50" : ""}`} aria-hidden>
        {def.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={`font-semibold ${complete ? "text-legendary" : ""}`}>{def.name}</span>
          <Hint text={tier > 0 ? `Erreicht: ${tierName(def, tier)}` : "Noch keine Stufe"}>
            <span className="text-sm">
              {def.tiers.map((_, i) => (
                <span key={i} className={i < tier ? "" : "opacity-25 grayscale"}>
                  {tierIcon(def, i + 1)}
                </span>
              ))}
            </span>
          </Hint>
        </div>
        <p className="text-xs text-muted">{describe(def, tier)}</p>
        {!complete && (
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-sm bg-night-700">
              <div className="h-full bg-xp" style={{ width: `${(shown / target) * 100}%` }} />
            </div>
            <span className="num text-xs text-muted">
              {shown.toLocaleString("de-CH")}/{target.toLocaleString("de-CH")}
            </span>
          </div>
        )}
        <p className={`mt-0.5 text-xs ${complete ? "text-legendary" : "text-muted/70"}`}>
          {complete ? "Titel freigeschaltet: " : "Titel in Gold: "}« {def.title} »
        </p>
      </div>
    </li>
  );
}

/** Einblendung beim Freischalten einer Erfolgsstufe. */
export function AchievementToast() {
  const notice = useGameStore((s) => s.achievementQueue[0] ?? null);
  const dismiss = useGameStore((s) => s.dismissAchievement);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(dismiss, 3500);
    return () => clearTimeout(t);
  }, [notice, dismiss]);

  const key = notice ? ("retroactive" in notice ? "retro" : `${notice.id}-${notice.tier}`) : null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <AnimatePresence>
        {notice && (
          <motion.div
            key={key}
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            onClick={dismiss}
            role="status"
            className="panel pointer-events-auto flex max-w-sm items-center gap-3 border-legendary px-4 py-2"
          >
            {"retroactive" in notice ? (
              <>
                <span className="text-2xl">🏆</span>
                <span className="text-sm">
                  <span className="font-semibold text-legendary">Erfolge freigeschaltet!</span>
                  <br />
                  {notice.retroactive} Stufen aus deinem bisherigen Fortschritt – schau im Charakter-Tab vorbei.
                </span>
              </>
            ) : (
              <Notice id={notice.id} tier={notice.tier} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Notice({ id, tier }: { id: string; tier: number }) {
  const def = getAchievement(id);
  return (
    <>
      <span className="text-2xl">{def.icon}</span>
      <span className="text-sm">
        <span className="font-semibold text-legendary">
          🏆 {def.name} {tierIcon(def, tier)} {tierName(def, tier)}
        </span>
        <br />
        {describe(def, tier - 1)}
        {isMaxTier(def, tier) && <span className="text-legendary"> · Titel « {def.title} »</span>}
      </span>
    </>
  );
}
