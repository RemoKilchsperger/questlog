import { getArmorClass } from "../domain/armorClasses";
import { CLASS_ARMOR_PIECES, detectHeroClass, getHeroClass, HERO_CLASSES } from "../domain/heroClasses";
import type { ArmorClass, Equipment } from "../domain/types";
import { useGameStore } from "../store/gameStore";
import { Hint } from "./HoverCard";

/** „3 Teile leichter Rüstung“ usw. – für die Voraussetzung einer Klasse */
const ARMOR_ADJECTIVE: Record<ArmorClass, string> = { light: "leichter", medium: "mittlerer", heavy: "schwerer" };

/** Kleines Abzeichen der aktiven Klasse – nichts, wenn keine aktiv ist. */
export function HeroClassBadge({ equipment }: { equipment: Equipment }) {
  const id = detectHeroClass(equipment);
  if (!id) return null;
  const cls = getHeroClass(id);
  return (
    <Hint heading={`${cls.icon} ${cls.name}`} text={cls.bonus}>
      <span className="rounded-md border-2 border-legendary/60 bg-legendary/10 px-2 py-0.5 text-sm text-legendary">
        {cls.icon} {cls.name}
      </span>
    </Hint>
  );
}

/** Aktive Klasse samt Bonus – die übrigen Klassen entdecken Spieler selbst (oder in der Rangliste). */
export function HeroClassPanel({ equipment }: { equipment: Equipment }) {
  const active = detectHeroClass(equipment);
  const cls = active ? getHeroClass(active) : null;

  return (
    <div className="rounded-md bg-night-800 p-2 text-sm">
      <div className="text-center text-xs text-muted">Klasse</div>
      {cls ? (
        <div className="text-center">
          <div className="font-pixel text-lg text-legendary">
            {cls.icon} {cls.name}
          </div>
          <div className="text-xs text-xp">{cls.bonus}</div>
        </div>
      ) : (
        <div className="text-center text-xs text-muted">
          Keine – trage mindestens {CLASS_ARMOR_PIECES} Rüstungsteile einer Klasse und die passende Waffe.
        </div>
      )}
    </div>
  );
}

/**
 * Alle Klassen im Charakter-Tab: entdeckte (einmal aktiv gewesen) mit Voraussetzung und Bonus,
 * die übrigen nur als „???“ – herausfinden bleibt Teil des Spiels.
 */
export function ClassCodex() {
  const equipment = useGameStore((s) => s.equipment);
  const worn = useGameStore((s) => s.records.classesWorn);
  const active = detectHeroClass(equipment);
  // Die aktive Klasse zählt sofort, auch bevor die Erfolge abgeglichen sind
  const discovered = new Set(active ? [...worn, active] : worn);

  return (
    <section className="panel p-5">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h2 className="font-pixel text-2xl">Klassen</h2>
        <span className="num text-legendary">
          {discovered.size}/{HERO_CLASSES.length} entdeckt
        </span>
      </div>
      <p className="mb-4 text-sm text-muted">
        Trägst du mindestens {CLASS_ARMOR_PIECES} Rüstungsteile derselben Rüstungsklasse und die passende Waffe, wirst du zu
        einer Klasse mit eigenem Bonus. Hier stehen alle, die du schon einmal warst – die übrigen findest du selbst heraus.
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {HERO_CLASSES.map((cls) => {
          if (!discovered.has(cls.id)) {
            return (
              <li key={cls.id} className="flex items-center gap-3 rounded-md border-2 border-dashed border-night-700 bg-night-800/50 p-3 text-muted">
                <span className="text-2xl opacity-40" aria-hidden>
                  ❔
                </span>
                <span className="font-pixel">???</span>
              </li>
            );
          }
          const armor = getArmorClass(cls.armorClass);
          const isActive = cls.id === active;
          return (
            <li
              key={cls.id}
              className={`rounded-md border-2 bg-night-800 p-3 ${isActive ? "border-legendary bg-legendary/10" : "border-night-700"}`}
            >
              <p className="font-pixel text-lg text-legendary">
                {cls.icon} {cls.name}
                {isActive && <span className="ml-2 font-sans text-xs text-xp">aktiv</span>}
              </p>
              <p className="text-xs text-muted">
                Braucht: {armor.icon} {CLASS_ARMOR_PIECES} Teile {ARMOR_ADJECTIVE[cls.armorClass]} Rüstung + {cls.weapons}
              </p>
              <p className="mt-1 text-xs text-xp">{cls.bonus}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
