import type { ReactNode } from "react";
import { getLevel } from "../domain/leveling";
import { skillResetCost } from "../domain/skills";
import { getBuilding, MAX_BUILDING_TIER, STATUE_XP_BONUS, type BuildingId } from "../domain/village";
import { getBuildingSprite } from "../game/villageSprites";
import { useGameStore } from "../store/gameStore";
import { Gold } from "./Gold";
import { PixelSprite } from "./PixelSprite";
import { SkillReset } from "./SkillTree";

// Menüs der kleineren Gebäude im Dorf: Taverne, Trainingsplatz und Statue.

/** Die Taverne – Buff-Food kommt später, bis dahin zeigt sie, was ihre Stufen bringen werden. */
export function TavernScreen() {
  return (
    <BuildingIntro id="tavern">
      <p className="text-sm text-muted">
        Der Wirt heizt den Ofen noch an: Bald gibt es hier <span className="text-parchment">Buff-Food</span> – Gerichte,
        die dich eine Weile stärken. Je weiter die Taverne ausgebaut ist, desto besser die Küche.
      </p>
      <p className="rounded-md border-2 border-dashed border-night-700 p-3 text-center text-sm text-muted">
        🍲 Die Speisekarte folgt bald.
      </p>
    </BuildingIntro>
  );
}

/** Der Trainingsplatz – hier werden die Skillpunkte zurückgesetzt. */
export function TrainingScreen() {
  const tier = useGameStore((s) => s.village.training);
  const level = useGameStore((s) => getLevel(s.character.totalXp));
  const fullCost = skillResetCost(level, 1);

  return (
    <BuildingIntro id="training">
      <p className="text-sm text-muted">
        Hier lernst du um: Alle Skillpunkte zurücksetzen und neu verteilen, um eine andere Waffe oder einen anderen
        Build auszuprobieren.{" "}
        {tier === 2 && (
          <>
            Statt <Gold amount={fullCost} /> zahlst du nur die Hälfte.
          </>
        )}
        {tier === 3 && <span className="text-xp">In der Kampfschule kostet das Zurücksetzen nichts.</span>}
      </p>
      <div className="flex justify-center">
        <div className="flex flex-col items-center gap-2">
          <SkillReset />
        </div>
      </div>
    </BuildingIntro>
  );
}

/** Die Statue – zeigt den XP-Bonus. */
export function StatueScreen() {
  const tier = useGameStore((s) => s.village.statue);
  return (
    <BuildingIntro id="statue">
      <p className="text-sm text-muted">
        Ein Denkmal deiner Taten spornt dich an. Du bekommst{" "}
        <span className="font-bold text-xp">+{Math.round(STATUE_XP_BONUS[tier] * 100)} % XP</span> aus allen Kämpfen,
        Dungeons, dem Turm und abgegebenen Quests. Im Koop gilt das Dorf nicht.
      </p>
    </BuildingIntro>
  );
}

/** Kopf mit Bild und Beschreibung, darunter der Inhalt und alle Stufen mit ihrer Wirkung. */
function BuildingIntro({ id, children }: { id: BuildingId; children: ReactNode }) {
  const tier = useGameStore((s) => s.village[id]);
  const def = getBuilding(id);

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex items-center gap-4">
        <PixelSprite sprite={getBuildingSprite(id, tier)} size={88} className="shrink-0" />
        <p className="text-sm">{def.description}</p>
      </div>
      {children}
      <ul className="flex flex-col gap-1.5">
        {def.tiers.slice(1).map((t, i) => {
          const level = i + 1;
          return (
            <li
              key={t.name}
              className={`flex items-baseline gap-2 rounded-md border-2 px-3 py-1.5 text-sm ${
                level === tier ? "border-gold bg-gold/10" : "border-night-700"
              } ${level > tier ? "opacity-50" : ""}`}
            >
              <span className="font-pixel shrink-0 text-gold">
                {t.icon} {t.name}
              </span>
              <span className="min-w-0 flex-1">{t.effect}</span>
              {level > tier && <span className="shrink-0 text-xs text-muted">Stufe {level}</span>}
              {level === tier && level === MAX_BUILDING_TIER && <span className="shrink-0 text-xs text-xp">✓</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
