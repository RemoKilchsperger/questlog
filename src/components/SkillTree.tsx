import { motion } from "motion/react";
import { useCallback, useState } from "react";
import { abilitiesOf, type AbilityDef } from "../domain/abilities";
import { getItem, getItemType } from "../domain/items";
import { getLevel } from "../domain/leveling";
import {
  ABILITY_COST,
  ABILITY_UNLOCK_RANK,
  abilityCost,
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
  SECOND_ABILITY_COST,
  SECOND_ABILITY_LEVEL,
  type SkillNode,
} from "../domain/skills";
import { useGameStore } from "../store/gameStore";
import { ConfirmDialog } from "./ConfirmDialog";
import { Gold } from "./Gold";
import { HoverCard } from "./HoverCard";
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
            Rüstung. Jeder Waffentyp – auch Zweihandwaffen – lässt sich unabhängig lernen. Ab Rang {ABILITY_UNLOCK_RANK} kannst du für{" "}
            {ABILITY_COST} Skillpunkt die erste Kampf-Fähigkeit der Waffe freischalten – ab Level {SECOND_ABILITY_LEVEL} für{" "}
            {SECOND_ABILITY_COST} Skillpunkte auch die zweite, unabhängig von der ersten. Fahre über ein Symbol, um zu sehen, was es kann.
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
            <div className="flex items-center gap-2">
              <span className="flex-1 text-xs text-muted">Fähigkeiten ab Rang {ABILITY_UNLOCK_RANK}</span>
              {abilitiesOf(node.weapon).map((ability) => (
                <AbilityIcon key={ability.id} ability={ability} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/** Alle Skillpunkte gegen Gold zurücksetzen – mit Rückfrage. */
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

/**
 * Symbol einer Kampf-Fähigkeit unter dem Waffen-Skill: freigeschaltet, jetzt
 * freischaltbar (Klick) oder noch gesperrt. Beim Überfahren erklärt eine Karte,
 * was die Fähigkeit kann und was sie braucht.
 */
function AbilityIcon({ ability }: { ability: AbilityDef }) {
  const character = useGameStore((s) => s.character);
  const unlock = useGameStore((s) => s.unlockAbility);
  const learned = hasAbility(character, ability.id);
  const blocker = abilityUnlockBlocker(character, ability.id);
  const ready = !learned && blocker === null;
  const look = learned
    ? "border-intellect bg-intellect/15"
    : ready
      ? "border-xp bg-xp/10 hover:bg-xp/20"
      : "border-night-700 bg-night-900";

  return (
    <HoverCard card={<AbilityCardContent ability={ability} learned={learned} blocker={blocker} />} border={learned ? "border-intellect/70" : "border-night-700"}>
      <motion.button
        whileTap={ready ? { scale: 0.85 } : undefined}
        onClick={() => ready && unlock(ability.id)}
        aria-label={`${ability.name}${learned ? " (freigeschaltet)" : ready ? " freischalten" : " (gesperrt)"}`}
        className={`relative flex h-11 w-11 items-center justify-center rounded-md border-2 text-2xl ${look} ${ready ? "cursor-pointer" : "cursor-default"}`}
      >
        <span aria-hidden className={learned || ready ? "" : "opacity-40 grayscale"}>
          {ability.icon}
        </span>
        {ready && (
          <span aria-hidden className="num absolute -right-1.5 -top-1.5 rounded-full bg-xp px-1 text-xs leading-4 text-night-950">
            +
          </span>
        )}
        {!learned && !ready && (
          <span aria-hidden className="absolute -bottom-1 -right-1 text-xs">
            🔒
          </span>
        )}
      </motion.button>
    </HoverCard>
  );
}

/** Inhalt der Hover-Karte einer Fähigkeit. */
function AbilityCardContent({ ability, learned, blocker }: { ability: AbilityDef; learned: boolean; blocker: string | null }) {
  const cost = abilityCost(ability.id);
  const costText = `${cost} Skillpunkt${cost > 1 ? "e" : ""}`;
  const weapon = getItemType(ability.weapon).label;
  const needs =
    ability.tier === 1
      ? `${weapon} auf Rang ${ABILITY_UNLOCK_RANK}`
      : `${weapon} auf Rang ${ABILITY_UNLOCK_RANK} und Level ${SECOND_ABILITY_LEVEL}`;

  return (
    <>
      <div className="rounded-md bg-night-950/60 px-4 py-2 text-5xl" aria-hidden>
        {ability.icon}
      </div>
      <p className="font-pixel text-lg leading-tight text-intellect">{ability.name}</p>
      <p className="text-xs text-muted">
        {["Erste", "Zweite", "Dritte"][ability.tier - 1]} Fähigkeit · {weapon}
      </p>
      <p className="num text-sm">
        <span className="text-intellect">💧 {ability.manaCost} Mana</span>
        <span className="text-muted"> · </span>
        <span className="text-gold">
          ⏳ {ability.cooldown} {ability.cooldown === 1 ? "Runde" : "Runden"}
        </span>
      </p>
      <p className="text-sm">{ability.description}</p>
      {learned ? (
        <p className="mt-1 text-xs text-xp">✨ Freigeschaltet</p>
      ) : blocker === null ? (
        <p className="mt-1 text-xs text-gold">Klicken zum Freischalten: {costText}</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted">
            Braucht: {needs} · {costText}
          </p>
          <p className="text-xs text-danger">🔒 {blocker}</p>
        </>
      )}
    </>
  );
}
