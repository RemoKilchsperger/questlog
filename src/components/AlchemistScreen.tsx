import { motion } from "motion/react";
import { POTIONS, potionEffectText, type PotionDef } from "../domain/potions";
import { getBuilding } from "../domain/village";
import { getBuildingSprite } from "../game/villageSprites";
import { useGameStore } from "../store/gameStore";
import { Gold } from "./Gold";
import { PixelSprite } from "./PixelSprite";
import { POTION_COLORS } from "./potionUi";

/** Der Alchemist verkauft alle Tränke – je weiter ausgebaut, desto mehr Sorten. */
export function AlchemistScreen({ onOpenVillage }: { onOpenVillage: () => void }) {
  const gold = useGameStore((s) => s.character.gold);
  const tier = useGameStore((s) => s.village.alchemist);

  if (tier === 0) {
    return (
      <section className="panel mx-auto flex max-w-lg flex-col items-center gap-3 p-6 text-center">
        <PixelSprite sprite={getBuildingSprite("alchemist", 0)} size={80} className="grayscale" />
        <h2 className="font-pixel text-2xl">Noch kein Alchemist</h2>
        <p className="text-sm text-muted">
          Im Dorf steht erst ein leerer Bauplatz. Baue den Alchemisten, um Heil- und Verstärkungstränke zu kaufen. Bis
          dahin hat der Strassenhändler ein paar kleine Heiltränke.
        </p>
        <button
          onClick={onOpenVillage}
          className="font-pixel rounded-md border-2 border-gold bg-gold/15 px-4 py-1.5 text-gold hover:bg-gold/25"
        >
          🏗️ Zum Ausbau
        </button>
      </section>
    );
  }

  return (
    <section className="panel mx-auto max-w-2xl p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-pixel text-2xl">{getBuilding("alchemist").tiers[tier].name}</h2>
        <Gold amount={gold} className="text-lg font-bold text-gold" />
      </div>
      <p className="mb-2 text-xs text-muted">
        Heiltränke stellen im Kampf Lebenspunkte wieder her. Pro Runde darfst du einen Trank trinken – und jede Sorte nur
        einmal pro Kampf. Je weiter der Alchemist ausgebaut ist, desto mehr Sorten verkauft er. Sonst gibt es Tränke nur
        als Kampfbeute.
        {tier >= 3 && <span className="text-xp"> Beim Meisteralchemisten wirken alle Tränke 25 % stärker.</span>}
      </p>
      <PotionList potions={POTIONS} />
    </section>
  );
}

/** Tränke zum Kaufen – Sorten über der Stufe des Alchemisten stehen gesperrt da. */
export function PotionList({ potions: offers }: { potions: readonly PotionDef[] }) {
  const gold = useGameStore((s) => s.character.gold);
  const potions = useGameStore((s) => s.potions);
  const buyPotion = useGameStore((s) => s.buyPotion);
  const alchemist = useGameStore((s) => s.village.alchemist);
  const alchemistTiers = getBuilding("alchemist").tiers;

  return (
    <ul className="flex flex-col gap-2">
      {offers.map((p) => {
        const locked = p.alchemist > alchemist;
        return (
          <li
            key={p.id}
            className={`flex items-center gap-3 rounded-md border-2 border-night-700 bg-night-800 p-2 ${locked ? "opacity-50" : ""}`}
          >
            <span className="text-2xl" aria-hidden>
              {p.icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{p.name}</p>
              <p className="text-xs">
                <span className={POTION_COLORS[p.effect.kind]}>{potionEffectText(p)}</span>
                <span className="ml-2 text-muted">im Besitz: {potions[p.id] ?? 0}</span>
              </p>
            </div>
            {locked ? (
              <span className="text-right text-xs text-muted">
                🔒 {alchemistTiers[p.alchemist].name}
                <br />
                (Alchemist Stufe {p.alchemist})
              </span>
            ) : (
              <motion.button
                whileTap={{ scale: 0.9 }}
                disabled={gold < p.price}
                onClick={() => buyPotion(p.id)}
                title={gold < p.price ? "Nicht genug Gold" : "Kaufen"}
                className="rounded-md border-2 border-gold bg-gold/15 px-2 py-0.5 text-sm text-gold hover:bg-gold/25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Gold amount={p.price} className="font-bold" />
              </motion.button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
