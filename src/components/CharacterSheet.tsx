import { motion } from "motion/react";
import { useCallback, useState } from "react";
import { BOSS_SETS } from "../domain/bossSets";
import { BOSS_ITEM_DROP_CHANCE, getHeroCombatProfile } from "../domain/combat";
import { bossName } from "../domain/bosses";
import { BOSS_ITEMS, getBossItems, getItemStats, getItemType } from "../domain/items";
import { getCombatStats, getStatBonuses } from "../domain/equipment";
import {
  attributeResetBlocker,
  attributeResetCost,
  getLevelProgress,
  POINTS_PER_LEVEL,
  resettablePoints,
  unspentPoints,
} from "../domain/leveling";
import { WEAPON_STAT } from "../domain/weaponScaling";
import { STAT_LABELS } from "../domain/stats";
import type { StatKey, WeaponType } from "../domain/types";
import { useGameStore } from "../store/gameStore";
import { ConfirmDialog } from "./ConfirmDialog";
import { formatNumber, Gold } from "./Gold";
import { ItemIcon } from "./ItemIcon";
import { ItemTooltip } from "./ItemTooltip";
import { PixelAvatar } from "./PixelAvatar";
import { AchievementsPanel, AvatarFrame, CosmeticsPicker, TitleBadge } from "./Achievements";
import { XpBar } from "./XpBar";
import { ClassCodex, HeroClassBadge } from "./HeroClassInfo";
import { Hint } from "./HoverCard";

const STAT_COLORS: Record<StatKey, string> = {
  strength: "bg-strength",
  intellect: "bg-intellect",
  endurance: "bg-endurance",
  charisma: "bg-charisma",
};

/** Was jedes Attribut bewirkt – die Waffen kommen aus der Zuordnung in weaponScaling.ts. */
const weaponsOf = (stat: StatKey) =>
  (Object.keys(WEAPON_STAT) as WeaponType[])
    .filter((type) => WEAPON_STAT[type] === stat)
    .map((type) => getItemType(type).label)
    .join(", ");
const ATTRIBUTE_EFFECTS: Record<StatKey, string> = {
  strength: `Schaden mit ${weaponsOf("strength")}`,
  intellect: `Schaden mit ${weaponsOf("intellect")} · Mana`,
  endurance: `Lebenspunkte · Schaden mit ${weaponsOf("endurance")} · Rüstung des Schilds`,
  charisma: `Kritische Treffer · Schaden mit ${weaponsOf("charisma")} · Gold nach Kämpfen`,
};

export type CharacterView = "details" | "achievements" | "collection";

/** Charakter-Tab: `details` (Porträt, Kennzahlen, Attribute), `achievements` (Erfolge) oder `collection` (Boss-Sammlung). */
export function CharacterSheet({ view = "details" }: { view?: CharacterView }) {
  const character = useGameStore((s) => s.character);
  const questsDone = useGameStore((s) => s.records.questsCompleted);
  const renameCharacter = useGameStore((s) => s.renameCharacter);
  const resetGame = useGameStore((s) => s.resetGame);
  const allocatePoint = useGameStore((s) => s.allocatePoint);
  const unspent = unspentPoints(character);
  const equipment = useGameStore((s) => s.equipment);
  const combat = getCombatStats(equipment);
  const bonuses = getStatBonuses(equipment);
  const { maxHp } = getHeroCombatProfile(character, equipment);

  const cosmetics = useGameStore((s) => s.cosmetics);
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(character.name);

  const { level } = getLevelProgress(character.totalXp);
  const statEntries = Object.entries(character.stats) as [StatKey, number][];
  const maxStat = Math.max(10, ...statEntries.map(([key, v]) => v + bonuses[key]));

  function saveName() {
    renameCharacter(nameDraft);
    setEditing(false);
  }

  if (view === "achievements") return <AchievementsPanel />;
  if (view === "collection") return <BossCollection />;

  return (
    <div className="grid gap-4 md:grid-cols-[280px_1fr]">
      {/* Porträt */}
      <section className="panel flex flex-col items-center gap-3 p-5 text-center">
        <motion.div animate={{ y: [0, -4, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}>
          <AvatarFrame frame={cosmetics.frame} className="rounded-lg bg-night-800 p-4">
            <PixelAvatar size={144} />
          </AvatarFrame>
        </motion.div>

        {editing ? (
          <form
            className="flex w-full gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              saveName();
            }}
          >
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              maxLength={24}
              className="min-w-0 flex-1 rounded-md border-2 border-night-700 bg-night-950 px-2 py-1 outline-none focus:border-gold"
            />
            <button className="rounded-md bg-gold px-3 text-night-950">OK</button>
          </form>
        ) : (
          <button
            onClick={() => {
              setNameDraft(character.name);
              setEditing(true);
            }}
            className="font-pixel text-3xl hover:text-gold"
            title="Namen ändern"
          >
            {character.name}
          </button>
        )}

        <TitleBadge achievementId={cosmetics.title} className="-mt-2 text-sm" />
        <p className="font-pixel text-lg text-gold">
          Level <span className="num">{level}</span>
          <span className="mt-1 block">
            <HeroClassBadge equipment={equipment} />
          </span>
        </p>
        <XpBar totalXp={character.totalXp} />
        <CosmeticsPicker />
      </section>

      <div className="flex flex-col gap-4">
        {/* Kennzahlen */}
        <section className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          <StatTile label="Gold" value={character.gold} icon="🪙" accent="text-gold" />
          <StatTile label="Gesamt-XP" value={character.totalXp} icon="✨" accent="text-xp" />
          <StatTile label="Quests" value={questsDone} icon="📜" accent="text-parchment" />
          <StatTile label="Lebenspunkte" value={maxHp} icon="❤️" accent="text-xp" />
          <StatTile label="Rüstung" value={combat.armor} icon="🛡️" accent="text-intellect" />
          <StatTile label="Angriff" value={combat.attack} icon="⚔️" accent="text-strength" />
        </section>

        {/* Attribute – Basis für das spätere Kampfsystem */}
        <section className="panel p-5">
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-pixel text-2xl">Attribute</h2>
            <AttributeReset />
          </div>
          <p className="mb-4 text-sm text-muted">
            Bestimmen deine Stärke im Kampf – jede Waffe macht mehr Schaden mit ihrem Attribut. Pro Level-up verteilst du{" "}
            {POINTS_PER_LEVEL} Punkte frei. Seltene
            Ausrüstung gibt weitere Boni (heller Teil des Balkens).
          </p>
          {unspent > 0 && (
            <motion.p
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="mb-4 rounded-md border-2 border-xp/60 bg-xp/10 px-3 py-2 text-sm text-xp"
            >
              Du hast <span className="num">{unspent}</span> {unspent === 1 ? "Punkt" : "Punkte"} zu verteilen – klicke
              auf <span className="font-bold">+</span>.
            </motion.p>
          )}
          <ul className="flex flex-col gap-3">
            {statEntries.map(([key, value]) => (
              <li key={key} className="grid grid-cols-[100px_1fr_64px_28px] items-center gap-x-3 gap-y-0.5">
                <span className="text-sm">{STAT_LABELS[key]}</span>
                <div className="flex h-3 overflow-hidden rounded-sm bg-night-700">
                  <motion.div
                    className={`h-full ${STAT_COLORS[key]}`}
                    initial={false}
                    animate={{ width: `${(value / maxStat) * 100}%` }}
                  />
                  <motion.div
                    className={`h-full ${STAT_COLORS[key]} opacity-45`}
                    initial={false}
                    animate={{ width: `${(bonuses[key] / maxStat) * 100}%` }}
                  />
                </div>
                <span className="num text-right">
                  {value + bonuses[key]}
                  {bonuses[key] > 0 && <span className="ml-1 text-xs text-xp">(+{bonuses[key]})</span>}
                </span>
                {unspent > 0 ? (
                  <motion.button
                    whileTap={{ scale: 0.85 }}
                    onClick={() => allocatePoint(key)}
                    aria-label={`1 Punkt auf ${STAT_LABELS[key]} verteilen`}
                    className="num h-7 w-7 rounded-md border-2 border-xp bg-xp/15 leading-none text-xp hover:bg-xp/25"
                  >
                    +
                  </motion.button>
                ) : (
                  <span />
                )}
                <span className="col-span-4 text-xs text-muted">{ATTRIBUTE_EFFECTS[key]}</span>
              </li>
            ))}
          </ul>
        </section>

        <ClassCodex />

        <button
          onClick={() => {
            if (confirm("Spielstand wirklich zurücksetzen?")) resetGame();
          }}
          className="self-end text-xs text-muted hover:text-danger"
        >
          Spielstand zurücksetzen
        </button>
      </div>
    </div>
  );
}

/** Alle 24 Boss-Items nach Boss – gefundene in Farbe, unentdeckte als Schatten. */
/** Ohne `collection` die eigene Sammlung, sonst die eines anderen Spielers (Profilseite). */
export function BossCollection({ collection }: { collection?: string[] }) {
  const own = useGameStore((s) => s.bossCollection);
  const found = collection ?? own;

  return (
    <section className="panel p-5">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h2 className="font-pixel text-2xl">Boss-Sammlung</h2>
        <span className="num text-legendary">
          {found.length}/{BOSS_ITEMS.length}
        </span>
      </div>
      <p className="mb-4 text-sm text-muted">
        Einzigartige Stücke, die nur Bosse fallen lassen – Gebiets-, Dungeon- und Koop-Bosse ({Math.round(BOSS_ITEM_DROP_CHANCE * 100)} % pro Sieg).
        Mehrere Teile desselben Bosses geben einen Set-Bonus. Unentdeckte Stücke siehst du nur als Schatten.
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {BOSS_SETS.map((set) => {
          const items = getBossItems(set.bossId);
          const count = items.filter((i) => found.includes(i.id)).length;
          const complete = count === items.length;
          return (
            <li
              key={set.bossId}
              className={`rounded-md border-2 bg-night-800 p-2 ${complete ? "border-legendary/80" : "border-night-700"}`}
            >
              <p className="text-sm">
                <span className="text-legendary">{set.name}</span>
                {complete && " ✓"}
              </p>
              <p className="text-xs text-muted">
                {bossName(set.bossId)} · <span className="num">{count}/{items.length}</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {items.map((def) =>
                  found.includes(def.id) ? (
                    <ItemTooltip
                      key={def.id}
                      stats={getItemStats({ uid: def.id, itemId: def.id, rarity: "legendary", bonuses: {} })}
                      hint="Gefunden · Attributboni werden beim Drop ausgewürfelt"
                    >
                      <span className="rounded bg-night-950/70 p-0.5" tabIndex={0}>
                        <ItemIcon def={def} rarity="legendary" size={36} />
                      </span>
                    </ItemTooltip>
                  ) : (
                    <Hint key={def.id} text="Noch nicht gefunden">
                      <span className="rounded bg-night-950/70 p-0.5">
                        <ItemIcon def={def} size={36} className="opacity-40 brightness-0" />
                      </span>
                    </Hint>
                  ),
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Alle Attributpunkte zurücksetzen – das erste Mal kostenlos, danach teuer. Mit Rückfrage. */
function AttributeReset() {
  const character = useGameStore((s) => s.character);
  const reset = useGameStore((s) => s.resetAttributes);
  const [confirm, setConfirm] = useState(false);
  const close = useCallback(() => setConfirm(false), []);
  const cost = attributeResetCost(character);
  const blocker = attributeResetBlocker(character);
  const points = resettablePoints(character);

  return (
    <>
      <motion.button
        whileTap={{ scale: 0.95 }}
        disabled={blocker !== null}
        onClick={() => setConfirm(true)}
        title={blocker ?? "Alle Attributpunkte zurücksetzen und neu verteilen"}
        className="rounded-md border-2 border-danger/70 bg-danger/10 px-3 py-1 text-sm text-danger hover:bg-danger/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        ↺ Zurücksetzen {cost === 0 ? <span className="font-bold text-xp">kostenlos</span> : <Gold amount={cost} className="font-bold" />}
      </motion.button>
      <ConfirmDialog
        open={confirm}
        title="Attributpunkte zurücksetzen?"
        confirmLabel="Zurücksetzen"
        onCancel={close}
        onConfirm={() => {
          reset();
          setConfirm(false);
        }}
      >
        <p>
          Alle Attribute fallen auf 1 zurück, und du kannst <b>{points} Punkte</b> neu verteilen.{" "}
          {cost === 0 ? (
            <>Das erste Mal ist kostenlos, danach kostet es viel Gold.</>
          ) : (
            <>
              Kosten: <Gold amount={cost} className="font-bold text-gold" />.
            </>
          )}
        </p>
      </ConfirmDialog>
    </>
  );
}

function StatTile({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon: string;
  accent: string;
}) {
  return (
    <div className="panel p-3 text-center">
      <div className="text-xl" aria-hidden>
        {icon}
      </div>
      <div className={`num text-xl leading-8 ${accent}`}>{formatNumber(value)}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}
