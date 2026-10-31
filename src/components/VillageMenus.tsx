import { motion } from "motion/react";
import type { ReactNode } from "react";
import { FOODS, foodEffectText, foodPrice, getFood } from "../domain/food";
import { getLevel } from "../domain/leveling";
import { skillResetCost } from "../domain/skills";
import { getBuilding, MAX_BUILDING_TIER, STATUE_XP_BONUS, type BuildingId } from "../domain/village";
import { getBuildingSprite } from "../game/villageSprites";
import { useGameStore } from "../store/gameStore";
import { Gold } from "./Gold";
import { PixelSprite } from "./PixelSprite";
import { SkillReset } from "./SkillTree";

// Menüs der kleineren Gebäude im Dorf: Taverne, Trainingsplatz und Statue.

/** Die Taverne – Buff-Food für den nächsten Kampf, Dungeon, Turm-Lauf oder Koop-Kampf. */
export function TavernScreen() {
  const tier = useGameStore((s) => s.village.tavern);
  const gold = useGameStore((s) => s.character.gold);
  const level = useGameStore((s) => getLevel(s.character.totalXp));
  const meal = useGameStore((s) => s.meal);
  const eat = useGameStore((s) => s.eat);
  const tavernTiers = getBuilding("tavern").tiers;
  const eaten = meal ? getFood(meal) : null;

  return (
    <BuildingIntro id="tavern">
      <p className="text-sm text-muted">
        Ein Gericht stärkt dich für den nächsten Einsatz: einen Kampf im Gebiet, einen ganzen Dungeon, einen Lauf im
        Endlos-Turm oder einen Koop-Kampf. Du kannst nur ein Gericht auf einmal essen – danach bist du satt, bis du
        wieder gekämpft hast.
      </p>
      {eaten ? (
        <p className="rounded-md border-2 border-xp/60 bg-xp/10 p-3 text-center text-sm">
          {eaten.icon} Du bist satt von <span className="font-semibold">{eaten.name}</span>:{" "}
          <span className="text-xp">{foodEffectText(eaten)}</span> im nächsten Einsatz.
        </p>
      ) : (
        <p className="rounded-md border-2 border-dashed border-night-700 p-3 text-center text-sm text-muted">
          🍽️ Du bist hungrig – such dir etwas aus.
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {FOODS.map((food) => {
          const locked = food.tavern > tier;
          const price = foodPrice(food, level);
          return (
            <li
              key={food.id}
              className={`flex items-center gap-3 rounded-md border-2 border-night-700 bg-night-800 p-2 ${locked ? "opacity-50" : ""}`}
            >
              <span className="text-2xl" aria-hidden>
                {food.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{food.name}</p>
                <p className="text-xs text-xp">{foodEffectText(food)}</p>
              </div>
              {locked ? (
                <span className="text-right text-xs text-muted">
                  🔒 {tavernTiers[food.tavern].name}
                  <br />
                  (Taverne Stufe {food.tavern})
                </span>
              ) : (
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  disabled={gold < price || meal !== null}
                  onClick={() => eat(food.id)}
                  title={meal !== null ? "Du bist noch satt" : gold < price ? "Nicht genug Gold" : "Essen"}
                  className="rounded-md border-2 border-gold bg-gold/15 px-2 py-0.5 text-sm text-gold hover:bg-gold/25 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Gold amount={price} className="font-bold" />
                </motion.button>
              )}
            </li>
          );
        })}
      </ul>
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
