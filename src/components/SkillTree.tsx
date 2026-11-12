import { motion } from "motion/react";
import { useCallback, useState } from "react";
import { abilitiesOf, abilitySlots, type AbilityDef } from "../domain/abilities";
import { availableAbilities } from "../domain/combat";
import { getItem, getItemType } from "../domain/items";
import { getLevel } from "../domain/leveling";
import {
  earnedSkillPoints,
  forkRival,
  getSkillNode,
  SKILL_PATHS,
  SKILL_TREE,
  skillBlocker,
  skillRank,
  skillResetBlocker,
  skillResetCost,
  spentSkillPoints,
  TIER_POINTS,
  unspentSkillPoints,
  type SkillNode,
  type SkillPath,
  type SkillPathDef,
  type SkillTier,
} from "../domain/skills";
import type { Character, WeaponType } from "../domain/types";
import { activeVillage, useGameStore } from "../store/gameStore";
import { ConfirmDialog } from "./ConfirmDialog";
import { Gold } from "./Gold";
import { HoverCard } from "./HoverCard";
import { ItemIcon } from "./ItemIcon";
import { GameIcon } from "./GameIcon";

/** Farbe pro Pfad – Rahmen, Linien und Ränge. */
const PATH_COLOR: Record<SkillPath, { text: string; border: string; bg: string; stroke: string }> = {
  blade: { text: "text-strength", border: "border-strength", bg: "bg-strength/15", stroke: "var(--color-strength)" },
  guard: { text: "text-gold", border: "border-gold", bg: "bg-gold/15", stroke: "var(--color-gold)" },
  arcane: { text: "text-intellect", border: "border-intellect", bg: "bg-intellect/15", stroke: "var(--color-intellect)" },
  plague: { text: "text-xp", border: "border-xp", bg: "bg-xp/15", stroke: "var(--color-xp)" },
};

const TIERS: SkillTier[] = [1, 2, 3, 4, 5];
/** Höhe einer Stufe im Baum (px) – Knoten und Linien richten sich danach. */
const ROW = 92;

const WEAPON_TYPES: WeaponType[] = ["dagger", "sword", "greatsword", "axe", "greataxe", "mace", "greathammer", "scepter", "staff", "bow", "shield"];

/** Skilltree: vier Pfade, deren Knoten aufeinander aufbauen. */
export function SkillTree() {
  const character = useGameStore((s) => s.character);
  const unspent = unspentSkillPoints(character);
  const level = getLevel(character.totalXp);

  return (
    <div className="flex flex-col gap-4">
      <section className="panel flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="max-w-xl">
          <h2 className="font-pixel text-2xl">Skilltree</h2>
          <p className="text-sm text-muted">
            Alle 2 Level bekommst du einen Skillpunkt (bisher {earnedSkillPoints(level)}). Die vier Pfade verändern, wie
            deine Fähigkeiten wirken – mit jeder Waffe. Eine Stufe öffnet sich erst, wenn du genug Punkte im Pfad hast,
            viele Knoten brauchen den Knoten darüber. Bei einer Gabelung wählst du einen von zwei Wegen. Jeder Pfad hat
            zwei Meisterschaften, sie öffnen sich ab {TIER_POINTS[5]} Punkten im Pfad – lernen kannst du im ganzen Baum
            nur eine. Wer meistert, lässt also einige Ränge des Pfads liegen. Tippe auf einen Knoten, um zu sehen, was er
            kann.
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

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        {SKILL_PATHS.map((path) => (
          <PathPanel key={path.id} path={path} />
        ))}
      </div>

      <WeaponAbilities />
    </div>
  );
}

/** Ein Pfad: Kopf, Baum mit Linien und die Details des gewählten Knotens. */
function PathPanel({ path }: { path: SkillPathDef }) {
  const character = useGameStore((s) => s.character);
  const nodes = SKILL_TREE.filter((n) => n.path === path.id);
  const [selected, setSelected] = useState<SkillNode>(nodes[0]);
  const spent = spentSkillPoints(character, path.id);
  const color = PATH_COLOR[path.id];

  return (
    <section className="panel flex flex-col gap-3 p-4">
      <header className="flex items-center gap-3">
        <span className="text-3xl" aria-hidden>
          {path.icon}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className={`font-pixel text-xl ${color.text}`}>{path.name}</h3>
          <p className="text-xs text-muted">{path.theme}</p>
        </div>
        <div className="text-right">
          <div className={`num text-2xl ${spent > 0 ? color.text : "text-muted"}`}>{spent}</div>
          <div className="text-xs text-muted">Punkte</div>
        </div>
      </header>

      <div className="relative" style={{ height: ROW * TIERS.length }}>
        <Links nodes={nodes} character={character} stroke={color.stroke} />
        {TIERS.map((tier) => {
          const open = spent >= TIER_POINTS[tier];
          return (
            <div
              key={tier}
              className="absolute inset-x-0 grid grid-cols-3"
              style={{ top: (tier - 1) * ROW, height: ROW }}
            >
              <span className={`absolute -top-1.5 left-0 text-[10px] ${open ? "text-muted" : "text-muted/60"}`}>
                {tier === 5 ? `★ ab ${TIER_POINTS[tier]}` : tier > 1 ? `ab ${TIER_POINTS[tier]}` : ""}
              </span>
              {nodes
                .filter((n) => n.tier === tier)
                .map((node) => (
                  <div key={node.id} className="flex items-center justify-center" style={{ gridColumn: node.col + 1 }}>
                    <NodeButton node={node} active={selected.id === node.id} onSelect={() => setSelected(node)} />
                  </div>
                ))}
              {nodes.some((n) => n.tier === tier && n.fork) && (
                <span className="flex items-center justify-center text-xs uppercase tracking-wide text-muted" style={{ gridColumn: 2, gridRow: 1 }}>
                  oder
                </span>
              )}
            </div>
          );
        })}
      </div>

      <NodeDetails node={selected} />
    </section>
  );
}

/** Mittelpunkt eines Knotens im Baum – in Prozent der Breite bzw. in px. */
const centerX = (node: SkillNode) => ((node.col + 0.5) / 3) * 100;
const centerY = (node: SkillNode) => (node.tier - 1) * ROW + ROW / 2 - 8;

/** Linien von jedem Knoten zu seinen Voraussetzungen – farbig, wenn beide gelernt sind. */
function Links({ nodes, character, stroke }: { nodes: SkillNode[]; character: Character; stroke: string }) {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
      {nodes.flatMap((node) =>
        (node.requires ?? []).map((id) => {
          const parent = getSkillNode(id);
          const lit = skillRank(character, id) > 0 && skillRank(character, node.id) > 0;
          const ready = skillRank(character, id) > 0;
          return (
            <line
              key={`${id}-${node.id}`}
              x1={`${centerX(parent)}%`}
              y1={centerY(parent)}
              x2={`${centerX(node)}%`}
              y2={centerY(node)}
              stroke={lit ? stroke : ready ? "var(--color-muted)" : "var(--color-night-600)"}
              strokeWidth={lit ? 3 : 2}
              strokeDasharray={lit || ready ? undefined : "4 4"}
            />
          );
        }),
      )}
    </svg>
  );
}

/** Ein Knoten: Symbol, Name und Rang – leuchtet, wenn er gelernt werden kann. */
function NodeButton({ node, active, onSelect }: { node: SkillNode; active: boolean; onSelect: () => void }) {
  const character = useGameStore((s) => s.character);
  const rank = skillRank(character, node.id);
  const blocker = skillBlocker(character, node.id);
  const color = PATH_COLOR[node.path];
  const learnable = blocker === null;
  const rival = forkRival(node);
  const closed = rank === 0 && !learnable && (spentSkillPoints(character, node.path) < TIER_POINTS[node.tier] || (rival !== null && skillRank(character, rival.id) > 0));
  const mastery = node.tier === 5;

  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      onClick={onSelect}
      aria-pressed={active}
      aria-label={`${node.name}, Rang ${rank} von ${node.maxRank}`}
      className={`relative z-10 flex w-[5.5rem] flex-col items-center gap-0.5 rounded-md px-1 pb-1 pt-1.5 ${active ? "bg-night-700" : ""}`}
    >
      <span
        className={`flex h-12 w-12 items-center justify-center border-2 text-2xl ${mastery ? "rounded-full" : "rounded-md"} ${
          rank > 0
            ? `${rank >= node.maxRank ? (mastery ? "border-legendary bg-legendary/15" : `${color.border} ${color.bg}`) : `${color.border} bg-night-900`}`
            : learnable
              ? "animate-pulse border-xp bg-night-900"
              : "border-night-600 bg-night-900"
        }`}
      >
        <span aria-hidden className={closed ? "opacity-30 grayscale" : rank === 0 ? "opacity-70" : ""}>
          {node.icon}
        </span>
      </span>
      <span className={`line-clamp-2 text-center text-[10px] leading-tight ${rank > 0 ? "" : "text-muted"}`}>{node.name}</span>
      <span className={`num text-[10px] ${rank > 0 ? color.text : "text-muted"}`}>
        {rank}/{node.maxRank}
      </span>
    </motion.button>
  );
}

/** Was der gewählte Knoten kann – jetzt und mit dem nächsten Rang – und der Knopf zum Lernen. */
function NodeDetails({ node }: { node: SkillNode }) {
  const character = useGameStore((s) => s.character);
  const learn = useGameStore((s) => s.learnSkill);
  const rank = skillRank(character, node.id);
  const blocker = skillBlocker(character, node.id);
  const color = PATH_COLOR[node.path];
  const tierLabel = node.tier === 5 ? "Meisterschaft · Gabelung" : node.fork ? `Stufe ${node.tier} · Gabelung` : `Stufe ${node.tier}`;

  return (
    <div className="rounded-md border-2 border-night-700 bg-night-800 p-3">
      <div className="flex items-start gap-3">
        <span className="text-3xl" aria-hidden>
          {node.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`font-semibold ${color.text}`}>{node.name}</p>
          <p className="text-xs text-muted">
            {tierLabel} · Rang {rank}/{node.maxRank}
          </p>
        </div>
      </div>
      {rank > 0 && <p className="mt-2 text-sm">{node.text(rank)}</p>}
      {rank < node.maxRank && (
        <p className={`mt-2 text-sm ${rank > 0 ? "text-muted" : ""}`}>
          {rank > 0 ? "Nächster Rang: " : node.maxRank > 1 ? "Rang 1: " : ""}
          {node.text(rank + 1)}
        </p>
      )}
      {rank < node.maxRank && (
        <div className="mt-3 flex items-center gap-3">
          <motion.button
            whileTap={{ scale: 0.95 }}
            disabled={blocker !== null}
            onClick={() => learn(node.id)}
            className="rounded-md border-2 border-xp bg-xp/15 px-3 py-1.5 text-sm text-xp hover:bg-xp/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {rank > 0 ? "Steigern" : "Lernen"} (1 Punkt)
          </motion.button>
          {blocker && <span className="text-xs text-muted">{blocker}</span>}
        </div>
      )}
    </div>
  );
}

/** Welche Fähigkeiten jede Waffe tragen kann – leuchtend die der angelegten Waffen. */
function WeaponAbilities() {
  const equipment = useGameStore((s) => s.equipment);
  const equipped = availableAbilities(equipment);
  return (
    <section className="panel p-5">
      <h3 className="font-pixel text-xl">Fähigkeiten der Waffen</h3>
      <p className="mb-3 text-sm text-muted">
        Kampf-Fähigkeiten bringen die Waffen selbst mit: Einhandwaffen und Schilde je 2 aus ihren 4 möglichen,
        Zweihandwaffen 3 aus 6. Leuchtend sind die deiner angelegten Waffen – fahre über ein Symbol, um zu sehen, was es
        kann.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {WEAPON_TYPES.map((weapon) => {
          const info = getItemType(weapon);
          return (
            <div key={weapon} className="flex flex-col gap-1.5 rounded-md border-2 border-night-700 bg-night-800 p-3">
              <div className="flex items-center gap-2">
                <ItemIcon def={getItem(`${weapon}-50`)} size={28} />
                <span className="font-semibold">{info.label}</span>
                <span className="text-xs text-muted">
                  {info.twoHanded ? "Zweihand · " : ""}
                  {abilitySlots(weapon)} pro Waffe
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {abilitiesOf(weapon).map((ability) => (
                  <AbilityIcon key={ability.id} ability={ability} equipped={equipped.includes(ability.id)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Alle Skillpunkte gegen Gold zurücksetzen – mit Rückfrage. Braucht den Trainingsplatz im Dorf. */
export function SkillReset() {
  const character = useGameStore((s) => s.character);
  const training = useGameStore((s) => activeVillage(s).training);
  const reset = useGameStore((s) => s.resetSkills);
  const [confirm, setConfirm] = useState(false);
  const close = useCallback(() => setConfirm(false), []);
  const cost = skillResetCost(getLevel(character.totalXp), training);
  const blocker = skillResetBlocker(character, training);

  return (
    <>
      <motion.button
        whileTap={{ scale: 0.95 }}
        disabled={blocker !== null}
        onClick={() => setConfirm(true)}
        title={blocker ?? "Alle Ränge zurücksetzen"}
        className="rounded-md border-2 border-danger/70 bg-danger/10 px-3 py-2 text-sm text-danger hover:bg-danger/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {training === 0 ? (
          <>
            <GameIcon icon="🔒" /> Zurücksetzen
          </>
        ) : (
          <>
            ↺ Zurücksetzen {cost > 0 ? <Gold amount={cost} className="font-bold" /> : "(gratis)"}
          </>
        )}
      </motion.button>
      {training === 0 && <span className="text-center text-xs text-muted">Braucht den 🎯 Trainingsplatz im Dorf</span>}
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
          {cost > 0 ? (
            <>
              Für <Gold amount={cost} className="font-bold text-gold" /> vergisst du alle Ränge.
            </>
          ) : (
            "Du vergisst alle Ränge – die Kampfschule nimmt dafür nichts."
          )}{" "}
          Alle Skillpunkte sind danach wieder frei und du kannst sie neu verteilen.
        </p>
      </ConfirmDialog>
    </>
  );
}

/**
 * Symbol einer Kampf-Fähigkeit – leuchtend, wenn sie auf einer angelegten Waffe
 * liegt. Beim Überfahren erklärt eine Karte, was sie kann.
 */
function AbilityIcon({ ability, equipped }: { ability: AbilityDef; equipped: boolean }) {
  return (
    <HoverCard card={<AbilityCardContent ability={ability} equipped={equipped} />} border={equipped ? "border-intellect/70" : "border-night-700"}>
      <span
        aria-label={`${ability.name}${equipped ? " (auf deiner Waffe)" : ""}`}
        className={`flex h-10 w-10 cursor-default items-center justify-center rounded-md border-2 text-2xl ${
          equipped ? "border-intellect bg-intellect/15" : "border-night-700 bg-night-900"
        }`}
      >
        <span aria-hidden className={equipped ? "" : "opacity-60"}>
          {ability.icon}
        </span>
      </span>
    </HoverCard>
  );
}

/** Inhalt der Hover-Karte einer Fähigkeit. */
export function AbilityCardContent({ ability, equipped }: { ability: AbilityDef; equipped?: boolean }) {
  return (
    <>
      <div className="rounded-md bg-night-950/60 px-4 py-2 text-5xl" aria-hidden>
        {ability.icon}
      </div>
      <p className="font-pixel text-lg leading-tight text-intellect">{ability.name}</p>
      <p className="text-xs text-muted">Fähigkeit · {getItemType(ability.weapon).label}</p>
      <p className="num text-sm">
        <span className="text-intellect">💧 {ability.manaCost} Mana</span>
        <span className="text-muted"> · </span>
        <span className="text-gold">
          ⏳ {ability.cooldown} {ability.cooldown === 1 ? "Runde" : "Runden"}
        </span>
      </p>
      <p className="text-sm">{ability.description}</p>
      {equipped && <p className="mt-1 text-xs text-xp">✨ Auf deiner angelegten Waffe</p>}
    </>
  );
}
