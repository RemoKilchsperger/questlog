import { motion } from "motion/react";
import { useCallback, useState } from "react";
import { getAbility } from "../domain/abilities";
import { getItem, getItemType } from "../domain/items";
import { getLevel } from "../domain/leveling";
import {
  ABILITY_COST,
  abilityUnlockBlocker,
  hasAbility,
  MAX_SKILL_RANK,
  SKILL_BONUS_PER_RANK,
  SKILL_POINTS_PER_LEVEL,
  SKILL_TREE,
  skillBlocker,
  skillRank,
  skillResetBlocker,
  skillResetCost,
  unspentSkillPoints,
  type SkillNode,
  type SkillWeapon,
} from "../domain/skills";
import { useGameStore } from "../store/gameStore";
import { ConfirmDialog } from "./ConfirmDialog";
import { Gold } from "./Gold";
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
            Rüstung. Jeder Waffentyp – auch Zweihandwaffen – lässt sich unabhängig lernen. Hast du eine Waffe gemeistert (Rang {MAX_SKILL_RANK}), kannst du für {ABILITY_COST}{" "}
            Skillpunkt ihre Kampf-Fähigkeit freischalten.
          </p>
        </div>
        <div className="flex flex-col items-center gap-2">
          <div
            className={`w-full rounded-md border-2 px-4 py-2 text-center ${
              unspent > 0 ? "border-xp bg-xp/10 text-xp" : "border-night-700 text-muted"
            }`}
          >
            <div className="num text-3xl">{unspent}</div>
            <div className="text-xs">{unspent === 1 ? "Skillpunkt" : "Skillpunkte"} frei</div>
          </div>
          <SkillReset />
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {SKILL_TREE.map((node) => (
          <section key={node.weapon} className="panel flex flex-col items-stretch gap-2 p-4">
            <SkillCard node={node} />
            <div className="text-center text-xs text-muted" aria-hidden>
              │<br />▼ gemeistert
            </div>
            <AbilityCard weapon={node.weapon} />
          </section>
        ))}
      </div>
    </div>
  );
}

/** Alle Skillpunkte gegen viel Gold zurücksetzen – mit Rückfrage. */
function SkillReset() {
  const character = useGameStore((s) => s.character);
  const reset = useGameStore((s) => s.resetSkills);
  const [confirm, setConfirm] = useState(false);
  const close = useCallback(() => setConfirm(false), []);
  const cost = skillResetCost(getLevel(character.totalXp));
  const blocker = skillResetBlocker(character);

  return (
    <>
      <motion.button
        whileTap={{ scale: 0.95 }}
        disabled={blocker !== null}
        onClick={() => setConfirm(true)}
        title={blocker ?? "Alle Ränge und Fähigkeiten zurücksetzen"}
        className="rounded-md border-2 border-danger/70 bg-danger/10 px-3 py-2 text-sm text-danger hover:bg-danger/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        ↺ Zurücksetzen <Gold amount={cost} className="font-bold" />
      </motion.button>
      <ConfirmDialog
        open={confirm}
        title="Skillpunkte zurücksetzen?"
        confirmLabel="Zurücksetzen"
        onCancel={close}
        onConfirm={() => {
          reset();
          setConfirm(false);
        }}
      >
        <p>
          Für <Gold amount={cost} className="font-bold text-gold" /> vergisst du alle Ränge und freigeschalteten
          Fähigkeiten. Alle Skillpunkte sind danach wieder frei und du kannst sie neu verteilen.
        </p>
      </ConfirmDialog>
    </>
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
  const equipped = [equipment.weapon1, equipment.weapon2].some(
    (owned) => owned && getItem(owned.itemId).type === node.weapon,
  );
  // Stahl-Variante als Beispielbild des Waffentyps
  const sample = getItem(`${node.weapon}-50`);

  return (
    <div
      className={`rounded-md border-2 bg-night-800 p-3 ${
        rank === MAX_SKILL_RANK ? "border-legendary/70" : "border-night-600"
      }`}
    >
      <div className="flex items-center gap-3">
        <ItemIcon def={sample} size={36} />
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
        Rang {rank}/{MAX_SKILL_RANK}
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
