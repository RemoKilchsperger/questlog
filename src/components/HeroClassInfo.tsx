import { CLASS_ARMOR_PIECES, detectHeroClass, getHeroClass } from "../domain/heroClasses";
import type { Equipment } from "../domain/types";

/** Kleines Abzeichen der aktiven Klasse – nichts, wenn keine aktiv ist. */
export function HeroClassBadge({ equipment }: { equipment: Equipment }) {
  const id = detectHeroClass(equipment);
  if (!id) return null;
  const cls = getHeroClass(id);
  return (
    <span className="rounded-md border-2 border-legendary/60 bg-legendary/10 px-2 py-0.5 text-sm text-legendary" title={cls.bonus}>
      {cls.icon} {cls.name}
    </span>
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
