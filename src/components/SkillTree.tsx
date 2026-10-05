import { motion } from "motion/react";
import { getAbility } from "../domain/abilities";
import { getItem, getItemType } from "../domain/items";
import {
  ABILITY_COST,
  abilityUnlockBlocker,
  hasAbility,
  MAX_SKILL_RANK,
  PREREQUISITE_RANK,
  SKILL_BONUS_PER_RANK,
  SKILL_POINTS_PER_LEVEL,
  SKILL_TREE,
  skillBlocker,
  skillRank,
  unspentSkillPoints,
  type SkillNode,
  type SkillWeapon,
} from "../domain/skills";
import { useGameStore } from "../store/gameStore";
import { ItemIcon } from "./ItemIcon";

const percent = (value: number) => `${Math.round(value * 100)} %`;

/** Waffen-Skilltree: Skillpunkte aus Level-ups in Schadensboni pro Waffentyp stecken. */
export function SkillTree() {
  const character = useGameStore((s) => s.character);
  const unspent = unspentSkillPoints(character);

  return (
    <div className="flex flex-col gap-4">
      <section className="panel flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="max-w-xl">
          <h2 className="font-pixel text-2xl">Skilltree</h2>
          <p className="text-sm text-muted">
            Pro Level-up erhältst du {SKILL_POINTS_PER_LEVEL} Skillpunkt. Jeder Rang erhöht den Schaden aller Waffen
            dieses Typs um {percent(SKILL_BONUS_PER_RANK)} (höchstens {MAX_SKILL_RANK} Ränge), beim Schild dessen
            Rüstung. Zweihand- und Magierwaffen bauen auf ihrer Einhand-Variante auf und brauchen dort zuerst Rang{" "}
            {PREREQUISITE_RANK}. Hast du eine Waffe gemeistert (Rang {MAX_SKILL_RANK}), kannst du für {ABILITY_COST}{" "}
            Skillpunkt ihre Kampf-Fähigkeit freischalten.
          </p>
        </div>
        <div
          className={`rounded-md border-2 px-4 py-2 text-center ${
            unspent > 0 ? "border-xp bg-xp/10 text-xp" : "border-night-700 text-muted"
          }`}
        >
          <div className="num text-3xl">{unspent}</div>
          <div className="text-xs">{unspent === 1 ? "Skillpunkt" : "Skillpunkte"} frei</div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {SKILL_TREE.map((branch) => (
          <section key={branch.id} className="panel flex flex-col gap-2 p-4">
            <h3 className="font-pixel text-xl">
              <span aria-hidden>{branch.icon}</span> {branch.name}
            </h3>
            {branch.nodes.map((node) => (
              <div key={node.weapon} className="flex flex-col items-stretch gap-2">
                {node.requires && (
                  <div className="text-center text-xs text-muted" aria-hidden>
                    │<br />▼ ab Rang {PREREQUISITE_RANK}
                  </div>
                )}
                <SkillCard node={node} />
                <div className="text-center text-xs text-muted" aria-hidden>
                  │<br />▼ gemeistert
                </div>
                <AbilityCard weapon={node.weapon} />
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function SkillCard({ node }: { node: SkillNode }) {
  const character = useGameStore((s) => s.character);
  const equipment = useGameStore((s) => s.equipment);
  const learn = useGameStore((s) => s.learnSkill);
  const info = getItemType(node.weapon);
  // Schilde machen keinen Schaden – ihr Skill verstärkt die Rüstung.
  const isShield = node.weapon === "shield";
  const stat = isShield ? "Rüstung" : "Schaden";
  const rank = skillRank(character, node.weapon);
  const blocker = skillBlocker(character, node.weapon);
  const locked = node.requires !== undefined && skillRank(character, node.requires) < PREREQUISITE_RANK;
  const equipped = [equipment.weapon1, equipment.weapon2].some(
    (owned) => owned && getItem(owned.itemId).type === node.weapon,
  );
  // Stahl-Variante als Beispielbild des Waffentyps
  const sample = getItem(`${node.weapon}-50`);

  return (
    <div
      className={`rounded-md border-2 bg-night-800 p-3 ${
        locked ? "border-night-700 opacity-60" : rank === MAX_SKILL_RANK ? "border-legendary/70" : "border-night-600"
      }`}
    >
      <div className="flex items-center gap-3">
        <ItemIcon def={sample} size={36} className={locked ? "grayscale" : ""} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {info.label}
            {info.twoHanded && <span className="ml-1 text-xs font-normal text-muted">Zweihand</span>}
          </p>
          <p className="text-xs">
            <span className={rank > 0 ? (isShield ? "text-intellect" : "text-strength") : "text-muted"}>
              +{percent(rank * SKILL_BONUS_PER_RANK)} {stat}
            </span>
            {equipped && <span className="ml-2 rounded bg-xp/15 px-1 text-xp">angelegt</span>}
          </p>
        </div>
        <motion.button
          whileTap={{ scale: 0.85 }}
          disabled={blocker !== null}
          onClick={() => learn(node.weapon)}
          title={blocker ?? `Rang ${rank + 1}: +${percent((rank + 1) * SKILL_BONUS_PER_RANK)} ${stat}`}
          aria-label={`${info.label} steigern`}
          className="num h-8 w-8 shrink-0 rounded-md border-2 border-xp bg-xp/15 text-lg leading-none text-xp hover:bg-xp/25 disabled:cursor-not-allowed disabled:opacity-30"
        >
          +
        </motion.button>
      </div>
      <div className="mt-2 flex gap-0.5" aria-label={`Rang ${rank} von ${MAX_SKILL_RANK}`}>
        {Array.from({ length: MAX_SKILL_RANK }, (_, i) => (
          <span key={i} className={`h-2 flex-1 rounded-sm ${i < rank ? "bg-strength" : "bg-night-700"}`} />
        ))}
      </div>
      <p className="mt-1 text-right text-xs text-muted">
        {locked
          ? `🔒 Rang ${PREREQUISITE_RANK} in ${getItemType(node.requires!).label} nötig`
          : `Rang ${rank}/${MAX_SKILL_RANK}`}
      </p>
    </div>
  );
}

/** Eigener Knoten unter jedem Waffen-Skill: die Kampf-Fähigkeit, freischaltbar nach dem Meistern. */
function AbilityCard({ weapon }: { weapon: SkillWeapon }) {
  const character = useGameStore((s) => s.character);
  const unlock = useGameStore((s) => s.unlockAbility);
  const ability = getAbility(weapon);
  const learned = hasAbility(character, weapon);
  const mastered = skillRank(character, weapon) >= MAX_SKILL_RANK;
  const blocker = abilityUnlockBlocker(character, weapon);

  return (
    <div
      className={`rounded-md border-2 border-dashed bg-night-800 p-3 ${
        learned ? "border-intellect/70" : mastered ? "border-night-600" : "border-night-700 opacity-60"
      }`}
    >
      <div className="flex items-center gap-3">
        <span aria-hidden className={`text-2xl ${learned || mastered ? "" : "grayscale"}`}>
          {ability.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-intellect">{ability.name}</p>
          <p className="text-xs text-muted">
            {ability.manaCost} Mana · {ability.description}
          </p>
        </div>
        {!learned && (
          <motion.button
            whileTap={{ scale: 0.85 }}
            disabled={blocker !== null}
            onClick={() => unlock(weapon)}
            title={blocker ?? `Für ${ABILITY_COST} Skillpunkt freischalten`}
            aria-label={`${ability.name} freischalten`}
            className="num h-8 w-8 shrink-0 rounded-md border-2 border-intellect bg-intellect/15 text-lg leading-none text-intellect hover:bg-intellect/25 disabled:cursor-not-allowed disabled:opacity-30"
          >
            +
          </motion.button>
        )}
      </div>
      <p className="mt-1 text-right text-xs text-muted">
        {learned
          ? "✨ Freigeschaltet"
          : mastered
            ? `Freischalten: ${ABILITY_COST} Skillpunkt`
            : `🔒 ${getItemType(weapon).label} meistern (Rang ${MAX_SKILL_RANK})`}
      </p>
    </div>
  );
}
