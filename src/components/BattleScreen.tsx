import { motion } from "motion/react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { getAbility, MANA_REGEN } from "../domain/abilities";
import { getBossAbility, roundsUntilBossAbility } from "../domain/bossAbilities";
import {
  abilityBlocker,
  BOSS_ITEM_DROP_CHANCE,
  BUFF_POTION_DROP_CHANCE,
  chestCount,
  fleeCost,
  getHeroCombatProfile,
  potionBlocker,
  type ActiveBuff,
  type BattleReward,
  type BattleState,
} from "../domain/combat";
import {
  AREAS,
  DUNGEONS,
  getCreature,
  getDungeon,
  getCreatureGoldDrop,
  getCreaturePotionDrop,
  getCreatureStats,
  getCreatureXp,
  isAreaUnlocked,
  type AreaDef,
  type CreatureDef,
} from "../domain/creatures";
import { BATTLE_COST, dungeonCost, MAX_BATTLE_POINTS, REGEN_HOURS } from "../domain/battlePoints";
import { formatCountdown, nextBoundary } from "../domain/calendar";
import { getBossItems, getItemStats } from "../domain/items";
import { POINTS_PER_LEVEL } from "../domain/leveling";
import { EFFORT_TIERS } from "../domain/rewards";
import { SKILL_POINTS_PER_LEVEL } from "../domain/skills";
import type { ItemStats } from "../domain/types";
import { BUFF_LABELS, getPotion, POTIONS, potionEffectText, potionHeal, type BuffKind } from "../domain/potions";
import { getCreatureSprite } from "../game/creatureSprites";
import { EventBus } from "../game/EventBus";
import { unlockAudio } from "../game/sfx";
import { useGameStore } from "../store/gameStore";
import { useSoundStore } from "../store/soundStore";
import { ConfirmDialog } from "./ConfirmDialog";
import { CoopPanel, CoopScreen } from "./CoopScreen";
import { useCoopStore } from "../coop/coopStore";
import { DungeonChest } from "./DungeonChest";
import { Gold } from "./Gold";
import { ItemIcon } from "./ItemIcon";
import { ItemTooltip } from "./ItemTooltip";
import { PixelSprite } from "./PixelSprite";
import { bonusText, mainStatText, RARITY_BORDER, RARITY_TEXT, rarityLabel } from "./itemUi";
import { PixelAvatar } from "./PixelAvatar";
import { POTION_BUTTONS, POTION_COLORS } from "./potionUi";
import { useNow } from "./useNow";

// Phaser ist gross – erst laden, wenn tatsächlich gekämpft wird.
const PhaserBattle = lazy(() => import("../game/PhaserBattle"));

export function BattleScreen() {
  const battle = useGameStore((s) => s.battle);
  const coop = useCoopStore((s) => s.phase !== "idle");
  if (coop) return <CoopScreen />;
  return battle ? <Battle battle={battle} /> : <AreaSelect />;
}

/* ───────────────────────── Gebietsauswahl ───────────────────────── */

function AreaSelect() {
  const character = useGameStore((s) => s.character);
  const equipment = useGameStore((s) => s.equipment);
  const hero = getHeroCombatProfile(character, equipment);
  const unlocked = AREAS.filter((a) => isAreaUnlocked(a, hero.level));
  const [areaId, setAreaId] = useState(unlocked[unlocked.length - 1].id);
  const area = AREAS.find((a) => a.id === areaId)!;

  return (
    <div className="grid gap-4 md:grid-cols-[280px_1fr]">
      <HeroPanel />

      <div className="flex flex-col gap-4">
        <section className="panel p-5">
          <h2 className="font-pixel mb-3 text-2xl">Gebiete</h2>
          <div className="flex flex-wrap gap-2">
            {AREAS.map((a) => {
              const open = isAreaUnlocked(a, hero.level);
              return (
                <button
                  key={a.id}
                  disabled={!open}
                  onClick={() => setAreaId(a.id)}
                  aria-pressed={a.id === areaId}
                  title={open ? a.description : `Ab Level ${a.minLevel}`}
                  className={`rounded-md border-2 px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-40 ${
                    a.id === areaId ? "border-gold text-gold" : "border-night-700 text-muted hover:text-parchment"
                  }`}
                >
                  {open ? "" : "🔒 "}
                  {a.name} <span className="text-xs opacity-70">Lv. {a.minLevel}–{a.maxLevel}</span>
                </button>
              );
            })}
          </div>
        </section>

        <AreaPanel area={area} heroLevel={hero.level} />
        <DungeonPanel heroLevel={hero.level} />
        <CoopPanel heroLevel={hero.level} />
      </div>
    </div>
  );
}

function AreaPanel({ area, heroLevel }: { area: AreaDef; heroLevel: number }) {
  return (
    <section className="panel p-5">
      <h2 className="font-pixel text-2xl">{area.name}</h2>
      <p className="mb-4 text-sm text-muted">{area.description}</p>
      <ul className="flex flex-col gap-2">
        {area.creatures.map((creature) => (
          <CreatureRow key={creature.id} creature={creature} heroLevel={heroLevel} />
        ))}
      </ul>
    </section>
  );
}

/** Dungeons: mehrere Gegner nacheinander, ohne Heilung dazwischen, Boss mit einzigartiger Beute. */
function DungeonPanel({ heroLevel }: { heroLevel: number }) {
  return (
    <section className="panel p-5">
      <h2 className="font-pixel text-2xl">Dungeons</h2>
      <p className="mb-4 text-sm text-muted">
        Mehrere Gegner hintereinander und ein Boss am Ende. Die Gegner sind stärker als draussen, und zwischen den
        Kämpfen heilst du nicht – nur dein Mana füllt sich wieder auf. Tränke helfen. Der Boss lässt mit{" "}
        {Math.round(BOSS_ITEM_DROP_CHANCE * 100)} % ein Teil seines einzigartigen Sets fallen.
      </p>
      <p className="mb-4 text-sm text-muted">
        🧰 Alle Beute landet in einer Truhe, die du am Ende öffnest. Nach einem Sieg kannst du auch mit der Truhe
        umkehren – wer verliert, verliert sie.
      </p>
      <ul className="flex flex-col gap-3">
        {DUNGEONS.map((dungeon) => (
          <DungeonCard key={dungeon.id} dungeon={dungeon} heroLevel={heroLevel} />
        ))}
      </ul>
    </section>
  );
}

function DungeonCard({ dungeon, heroLevel }: { dungeon: AreaDef; heroLevel: number }) {
  const startDungeon = useGameStore((s) => s.startDungeon);
  const battlePoints = useGameStore((s) => s.character.battlePoints);
  const open = isAreaUnlocked(dungeon, heroLevel);
  const cost = dungeonCost(dungeon.creatures.length);
  const boss = dungeon.creatures.at(-1)!;
  const bossAbility = getBossAbility(boss.id);
  const blocker = !open
    ? `Ab Level ${dungeon.minLevel}`
    : battlePoints < cost
      ? `Du brauchst ${cost} Kampfpunkte`
      : null;

  return (
    <li
      className={`rounded-md border-2 bg-night-800 p-3 ${open ? "border-legendary/60" : "border-night-700 opacity-60"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-pixel text-lg">
            {open ? "🏰" : "🔒"} {dungeon.name}{" "}
            <span className="font-sans text-xs text-muted">ab Lv. {dungeon.minLevel}</span>
          </p>
          <p className="text-xs text-muted">{dungeon.description}</p>
        </div>
        <motion.button
          whileTap={{ scale: 0.92 }}
          disabled={blocker !== null}
          onClick={() => startDungeon(dungeon.id)}
          title={blocker ?? `Kostet ${cost} Kampfpunkte (einen pro Kampf)`}
          className="font-pixel shrink-0 rounded-md border-2 border-legendary bg-legendary/15 px-3 py-1 text-legendary hover:bg-legendary/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Betreten <span className="num text-xs">−{cost} ⚔️</span>
        </motion.button>
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        {dungeon.creatures.map((creature, i) => (
          <div key={creature.id} className="flex flex-col items-center text-center" title={creature.name}>
            <PixelSprite sprite={getCreatureSprite(creature.sprite)} size={creature.boss ? 48 : 36} />
            <span className={`text-[10px] leading-tight ${creature.boss ? "text-legendary" : "text-muted"}`}>
              {i + 1}. Lv. {creature.level}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-1 text-xs">
        <span className="text-legendary">Boss: {boss.name}</span>
        {bossAbility && (
          <span className="text-danger">
            {" "}
            · {bossAbility.icon} {bossAbility.name} alle {bossAbility.every} Runden
          </span>
        )}
      </p>
      <BossDrops creature={boss} />
    </li>
  );
}

function CreatureRow({ creature, heroLevel }: { creature: CreatureDef; heroLevel: number }) {
  const startBattle = useGameStore((s) => s.startBattle);
  const canFight = useGameStore((s) => s.character.battlePoints >= BATTLE_COST);
  const bossAbility = getBossAbility(creature.id);
  const stats = getCreatureStats(creature);
  const potionDrop = getCreaturePotionDrop(creature);
  const goldDrop = getCreatureGoldDrop(creature);
  const danger = creature.level - heroLevel;
  const dangerText = danger >= 5 ? "Sehr gefährlich" : danger >= 2 ? "Gefährlich" : danger <= -5 ? "Leicht" : null;

  return (
    <li
      className={`flex items-center gap-3 rounded-md border-2 bg-night-800 p-3 ${
        creature.boss ? "border-legendary/70" : "border-night-700"
      }`}
    >
      <PixelSprite sprite={getCreatureSprite(creature.sprite)} size={creature.boss ? 64 : 52} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {creature.name}
          {creature.boss && <span className="ml-2 text-xs text-legendary">BOSS</span>}
        </p>
        <div className="flex flex-wrap gap-x-3 text-xs text-muted">
          <span>Lv. {creature.level}</span>
          <span className="text-xp">+{getCreatureXp(creature)} XP</span>
          <span className="text-xp">{stats.maxHp} LP</span>
          <span className="text-strength">~{Math.round(stats.damage)} Schaden</span>
          <span className="text-intellect">{stats.armor} Rüstung</span>
          <span className="font-sans whitespace-nowrap tabular-nums text-gold">
            {goldDrop.min}–{goldDrop.max} <span aria-label="Gold">🪙</span>{" "}
            {creature.boss ? "garantiert" : `${Math.round(goldDrop.chance * 100)} %`}
          </span>
          <span className="text-epic">🎁 {creature.boss ? "garantiert" : "35 %"}</span>
          <span className="text-xp">
            {getPotion(potionDrop.potionId).icon} {creature.boss ? `${potionDrop.count}× garantiert` : "25 %"}
          </span>
          <span className="text-strength" title="Seltene Chance auf einen Angriffs- oder Rüstungstrank">
            🔥/🪨 {Math.round(BUFF_POTION_DROP_CHANCE * 100)} %
          </span>
          {dangerText && <span className={danger > 0 ? "text-danger" : "text-xp"}>{dangerText}</span>}
        </div>
        {bossAbility && (
          <p className="mt-1 text-xs text-danger">
            Fähigkeit: {bossAbility.icon} {bossAbility.name} – alle {bossAbility.every} Runden.{" "}
            {bossAbility.description}
          </p>
        )}
        <BossDrops creature={creature} />
      </div>
      <motion.button
        whileTap={{ scale: 0.9 }}
        disabled={!canFight}
        onClick={() => startBattle(creature.id)}
        title={canFight ? `Kostet ${BATTLE_COST} Kampfpunkt` : "Keine Kampfpunkte – erledige Quests"}
        className="font-pixel shrink-0 rounded-md border-2 border-danger bg-danger/15 px-3 py-1 text-danger hover:bg-danger/25 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Kämpfen <span className="num text-xs">−{BATTLE_COST} ⚔️</span>
      </motion.button>
    </li>
  );
}

function HeroPanel() {
  const character = useGameStore((s) => s.character);
  const equipment = useGameStore((s) => s.equipment);
  const potions = useGameStore((s) => s.potions);
  const hero = getHeroCombatProfile(character, equipment);
  const now = useNow();

  return (
    <section className="panel flex flex-col items-center gap-3 self-start p-5 text-center">
      <div className="rounded-lg bg-night-800 p-3">
        <PixelAvatar size={96} />
      </div>
      <p className="font-pixel text-2xl">{character.name}</p>
      <p className="text-sm text-muted">Level {hero.level}</p>
      <div
        className={`w-full rounded-md border-2 p-2 ${
          character.battlePoints > 0 ? "border-strength/50 bg-strength/10" : "border-danger/60 bg-danger/10"
        }`}
      >
        <p className="num text-xl text-strength">
          ⚔️ {character.battlePoints}/{MAX_BATTLE_POINTS}
        </p>
        <p className="text-xs text-muted">
          Kampfpunkte – jeder Kampf kostet {BATTLE_COST}. Erledigte Quests füllen sie auf:{" "}
          {EFFORT_TIERS.map((t) => `${t.label} +${t.battlePoints}`).join(" · ")}. Dazu alle {REGEN_HOURS} Stunden
          einer gratis
          {character.battlePoints < MAX_BATTLE_POINTS && (
            <> – der nächste in {formatCountdown(now, nextBoundary(now, REGEN_HOURS))}</>
          )}
          .
        </p>
      </div>
      <div className="grid w-full grid-cols-2 gap-2">
        <Value label="Lebenspunkte" value={hero.maxHp} icon="❤️" accent="text-xp" />
        <Value label="Schaden" value={Math.round(hero.damage)} icon="⚔️" accent="text-strength" />
        <Value label="Rüstung" value={hero.armor} icon="🛡️" accent="text-intellect" />
        <Value label="Kritisch" value={`${Math.round(hero.critChance * 100)} %`} icon="💥" accent="text-gold" />
        <Value label="Mana" value={hero.maxMana} icon="💧" accent="text-intellect" />
        <Value
          label="Fähigkeiten"
          value={hero.abilities.map((w) => getAbility(w).icon).join(" ") || "–"}
          icon=""
          accent="text-intellect"
        />
      </div>
      <p className="text-xs text-muted">
        Stärke erhöht den Schaden, Ausdauer die Lebenspunkte, Intelligenz die kritische Trefferchance und das Mana,
        Charisma das Gold nach einem Sieg (+{Math.round(hero.goldBonus * 100)} %). Jede angelegte Waffe bringt eine
        Fähigkeit mit, die im Kampf Mana kostet.
      </p>
      <div className="w-full border-t border-night-700 pt-3 text-left">
        <h3 className="mb-1 text-xs uppercase tracking-wide text-muted">Tränke</h3>
        <ul className="text-sm">
          {POTIONS.map((p) => (
            <li key={p.id} className="flex justify-between py-0.5">
              <span>
                {p.icon} {p.name}
              </span>
              <span className="font-bold tabular-nums">× {potions[p.id] ?? 0}</span>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-xs text-muted">
          Kleine und normale Heiltränke gibt es beim Händler, alle anderen nur als Kampfbeute.
        </p>
      </div>
    </section>
  );
}

function Value({ label, value, icon, accent }: { label: string; value: number | string; icon: string; accent: string }) {
  return (
    <div className="rounded-md bg-night-800 p-2">
      <div className={`font-sans text-lg font-bold tabular-nums ${accent}`}>
        <span aria-hidden>{icon}</span> {value}
      </div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

/* ───────────────────────── Laufender Kampf ───────────────────────── */

function Battle({ battle }: { battle: BattleState }) {
  const potions = useGameStore((s) => s.potions);
  const attack = useGameStore((s) => s.battleAttack);
  const drink = useGameStore((s) => s.battleDrinkPotion);
  const battleFlee = useGameStore((s) => s.battleFlee);
  const gold = useGameStore((s) => s.character.gold);
  const { creature, area } = getCreature(battle.creatureId);
  const fleePrice = fleeCost(creature, gold);
  const [confirmFlee, setConfirmFlee] = useState(false);
  const cancelFlee = useCallback(() => setConfirmFlee(false), []);

  // Während Phaser animiert, sind die Buttons gesperrt.
  const [busy, setBusy] = useState(false);
  const fallback = useRef<number | undefined>(undefined);
  useEffect(
    () =>
      EventBus.on("battle:animation-done", ({ battleId }) => {
        if (battleId !== battle.id) return;
        window.clearTimeout(fallback.current);
        setBusy(false);
      }),
    [battle.id],
  );
  useEffect(() => () => window.clearTimeout(fallback.current), []);

  function act(action: () => void) {
    setBusy(true);
    // Sicherheitsnetz, falls die Szene (z. B. beim Tab-Wechsel) nicht antwortet.
    fallback.current = window.setTimeout(() => setBusy(false), 4000);
    unlockAudio();
    action();
  }

  const active = battle.status === "active";

  return (
    <div className="flex flex-col gap-4">
      <section className="panel p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-pixel text-2xl">
            {area.name} <span className="text-base text-muted">· {creature.name}</span>
          </h2>
          <div className="flex items-center gap-3">
            <SoundControl />
            <span className="font-pixel text-gold">
              Runde <span className="num">{battle.round}</span>
            </span>
          </div>
        </div>
        {area.dungeon && <DungeonProgress area={area} />}
        <Suspense
          fallback={
            <div className="flex aspect-[9/4] w-full items-center justify-center rounded-md bg-night-950 text-muted">
              Kampfszene wird geladen …
            </div>
          }
        >
          <PhaserBattle battleId={battle.id} />
        </Suspense>
      </section>

      {active || busy ? (
        <section className="panel flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <div className="flex min-w-48 flex-1 items-center gap-2" title={`+${MANA_REGEN} Mana pro Runde`}>
              <span className="text-intellect">💧 Mana</span>
              <div className="h-3 flex-1 overflow-hidden rounded-sm bg-night-700">
                <motion.div
                  className="h-full bg-intellect"
                  initial={false}
                  animate={{ width: `${(battle.mana / battle.maxMana) * 100}%` }}
                />
              </div>
              <span className="num text-intellect">
                {battle.mana}/{battle.maxMana}
              </span>
            </div>
            {battle.enemyEffects.poison && (
              <span className="rounded-md bg-night-800 px-2 py-0.5 text-xp">
                ☠️ Gift −{battle.enemyEffects.poison.damage} · noch{" "}
                <span className="num">{battle.enemyEffects.poison.roundsLeft}</span>{" "}
                {battle.enemyEffects.poison.roundsLeft === 1 ? "Runde" : "Runden"}
              </span>
            )}
            {battle.enemyEffects.burn && (
              <span className="rounded-md bg-night-800 px-2 py-0.5 text-strength">
                🔥 Feuer −{battle.enemyEffects.burn.damage} · noch{" "}
                <span className="num">{battle.enemyEffects.burn.roundsLeft}</span>{" "}
                {battle.enemyEffects.burn.roundsLeft === 1 ? "Runde" : "Runden"}
              </span>
            )}
            {battle.enemyEffects.bleed && (
              <span className="rounded-md bg-night-800 px-2 py-0.5 text-danger">
                🩸 Bluten −{battle.enemyEffects.bleed.damage} · noch{" "}
                <span className="num">{battle.enemyEffects.bleed.roundsLeft}</span>{" "}
                {battle.enemyEffects.bleed.roundsLeft === 1 ? "Runde" : "Runden"}
              </span>
            )}
            {battle.enemyEffects.armorBreak && (
              <span className="rounded-md bg-night-800 px-2 py-0.5 text-strength">
                💥 Gegner-Rüstung −{Math.round(battle.enemyEffects.armorBreak * 100)} %
              </span>
            )}
            {battle.heroEffects.bulwark && (
              <span className="rounded-md bg-night-800 px-2 py-0.5 text-intellect">
                🛡️ Bollwerk bereit
              </span>
            )}
            {battle.heroEffects.poison && (
              <span className="rounded-md bg-danger/15 px-2 py-0.5 text-danger">
                ☠️ Du bist vergiftet: −{battle.heroEffects.poison.damage} · noch{" "}
                <span className="num">{battle.heroEffects.poison.roundsLeft}</span>{" "}
                {battle.heroEffects.poison.roundsLeft === 1 ? "Runde" : "Runden"}
              </span>
            )}
            {battle.heroEffects.burn && (
              <span className="rounded-md bg-danger/15 px-2 py-0.5 text-danger">
                🔥 Du brennst: −{battle.heroEffects.burn.damage} · noch{" "}
                <span className="num">{battle.heroEffects.burn.roundsLeft}</span>{" "}
                {battle.heroEffects.burn.roundsLeft === 1 ? "Runde" : "Runden"}
              </span>
            )}
            {battle.heroEffects.bleed && (
              <span className="rounded-md bg-danger/15 px-2 py-0.5 text-danger">
                🩸 Du blutest: −{battle.heroEffects.bleed.damage} · noch{" "}
                <span className="num">{battle.heroEffects.bleed.roundsLeft}</span>{" "}
                {battle.heroEffects.bleed.roundsLeft === 1 ? "Runde" : "Runden"}
              </span>
            )}
          </div>
          <BossWarning battle={battle} />
          {battle.abilities.length === 0 && (
            <p className="text-xs text-muted">
              Fähigkeiten schaltest du im Skilltree frei, sobald du eine Waffe gemeistert hast – im Kampf brauchst du
              dann die passende Waffe.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <motion.button
              whileTap={{ scale: 0.92 }}
              disabled={busy || !active}
              onClick={() => act(() => attack())}
              className="font-pixel rounded-md border-2 border-danger bg-danger/20 px-5 py-2 text-xl text-danger hover:bg-danger/30 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ⚔️ Angreifen
            </motion.button>
            {battle.abilities.map((weapon) => {
              const ability = getAbility(weapon);
              const blocker = abilityBlocker(battle, weapon);
              return (
                <motion.button
                  key={weapon}
                  whileTap={{ scale: 0.92 }}
                  disabled={busy || blocker !== null}
                  onClick={() => act(() => attack(weapon))}
                  title={blocker ? `${ability.description}\n${blocker}` : ability.description}
                  className="font-pixel rounded-md border-2 border-intellect bg-intellect/15 px-3 py-2 text-lg text-intellect hover:bg-intellect/25 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {ability.icon} {ability.name} <span className="num text-xs">{ability.manaCost} 💧</span>
                </motion.button>
              );
            })}
            <span className="mx-1 hidden h-8 border-l-2 border-night-700 sm:block" aria-hidden />
            {POTIONS.map((p) => {
              const count = potions[p.id] ?? 0;
              const used = battle.potionsUsed.includes(p.id);
              const blocker = count === 0 ? "Keine mehr im Vorrat – Nachschub beim Händler." : potionBlocker(battle, p);
              const effect = p.effect.kind === "heal" ? `Heilt ${potionHeal(p, battle.hero.maxHp)} LP` : potionEffectText(p);
              return (
                <button
                  key={p.id}
                  disabled={busy || blocker !== null}
                  onClick={() => act(() => drink(p.id))}
                  title={blocker ? `${effect}\n${blocker}` : effect}
                  className={`rounded-md border-2 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40 ${POTION_BUTTONS[p.effect.kind]}`}
                >
                  {p.icon} {p.name} <span className="font-bold">× {count}</span>
                  {used && <span className="ml-1 text-xs">✓</span>}
                </button>
              );
            })}
            <button
              disabled={busy || !active}
              onClick={() => setConfirmFlee(true)}
              className="ml-auto rounded-md border-2 border-night-600 px-3 py-1.5 text-sm text-muted hover:border-muted hover:text-parchment disabled:cursor-not-allowed disabled:opacity-40"
            >
              🏃 Fliehen
            </button>
          </div>
          {Object.keys(battle.buffs).length > 0 && (
            <div className="flex flex-wrap gap-2 text-sm">
              {(Object.entries(battle.buffs) as [BuffKind, ActiveBuff][]).map(([kind, buff]) => (
                <span key={kind} className={`rounded-md bg-night-800 px-2 py-0.5 ${POTION_COLORS[kind]}`}>
                  {kind === "attack" ? "🔥" : "🪨"} +{Math.round(buff.percent * 100)} % {BUFF_LABELS[kind]} · noch{" "}
                  <span className="num">{buff.roundsLeft}</span> {buff.roundsLeft === 1 ? "Runde" : "Runden"}
                </span>
              ))}
            </div>
          )}
          <p className="text-xs text-muted">
            {battle.potionUsedThisRound
              ? "Trank für diese Runde verbraucht – jetzt angreifen."
              : "Pro Runde: optional einen Trank trinken (jede Sorte nur einmal pro Kampf), dann angreifen – normal oder mit einer Fähigkeit, die Mana kostet. Danach schlägt der Gegner zurück."}
          </p>
          <ConfirmDialog
            open={confirmFlee}
            title="Fliehen?"
            confirmLabel="Fliehen"
            onCancel={cancelFlee}
            onConfirm={() => {
              setConfirmFlee(false);
              act(battleFlee);
            }}
          >
            {fleePrice > 0 ? (
              <p>
                Auf der Flucht verlierst du <Gold amount={fleePrice} className="font-bold text-gold" />. Du bekommst
                keine Beute.
              </p>
            ) : (
              <p>Du bekommst keine Beute. Da du kein Gold hast, kostet die Flucht nichts.</p>
            )}
          </ConfirmDialog>
        </section>
      ) : (
        <BattleResult battle={battle} />
      )}

      <BattleLog battle={battle} />
    </div>
  );
}

/** Stummschalten und Lautstärke der Kampfgeräusche (pro Gerät gespeichert). */
function SoundControl() {
  const muted = useSoundStore((s) => s.muted);
  const volume = useSoundStore((s) => s.volume);
  const toggleMuted = useSoundStore((s) => s.toggleMuted);
  const musicOn = useSoundStore((s) => s.music);
  const toggleMusic = useSoundStore((s) => s.toggleMusic);
  const setVolume = useSoundStore((s) => s.setVolume);
  const silent = muted || volume === 0;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggleMusic}
        className={`rounded-md px-1 text-lg leading-none hover:bg-night-800 ${musicOn ? "" : "opacity-40"}`}
        title={musicOn ? "Musik ausschalten" : "Musik einschalten"}
        aria-label={musicOn ? "Musik ausschalten" : "Musik einschalten"}
        aria-pressed={musicOn}
      >
        🎵
      </button>
      <button
        type="button"
        onClick={() => {
          toggleMuted();
          unlockAudio();
        }}
        className="rounded-md px-1 text-lg leading-none hover:bg-night-800"
        title={silent ? "Ton einschalten" : "Ton ausschalten"}
        aria-label={silent ? "Ton einschalten" : "Ton ausschalten"}
      >
        {silent ? "🔇" : "🔊"}
      </button>
      <input
        type="range"
        min={0}
        max={100}
        value={silent ? 0 : Math.round(volume * 100)}
        onChange={(e) => setVolume(Number(e.target.value) / 100)}
        onPointerUp={unlockAudio}
        className="hidden w-20 accent-gold sm:block"
        aria-label="Lautstärke"
      />
    </div>
  );
}

function BattleResult({ battle }: { battle: BattleState }) {
  const reward = useGameStore((s) => s.battleReward);
  const startBattle = useGameStore((s) => s.startBattle);
  const leave = useGameStore((s) => s.leaveBattle);
  const battlePoints = useGameStore((s) => s.character.battlePoints);
  const dungeon = useGameStore((s) => s.dungeon);
  const won = battle.status === "won";
  // Im Dungeon geht die Beute in die Truhe – hier nur ein kurzer Hinweis, was dazukam.
  const toChest = dungeon !== null;
  const levelUp = reward !== null && reward.levelAfter > reward.levelBefore;
  const fled = battle.status === "fled";
  const loot = reward?.loot ? getItemStats(reward.loot) : null;
  const bossLoot = reward?.bossLoot ? getItemStats(reward.bossLoot) : null;
  const buffPotion = reward?.buffPotion ? getPotion(reward.buffPotion) : null;
  const potionDrop = reward?.potions ? { ...reward.potions, def: getPotion(reward.potions.potionId) } : null;
  const fledEvent = battle.log.find((e) => e.type === "fled");
  const goldLost = fledEvent?.type === "fled" ? fledEvent.goldLost : 0;

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`panel flex flex-col items-center gap-3 p-5 text-center ${
        won ? "border-gold" : fled ? "border-night-600" : "border-danger"
      }`}
    >
      <h2 className={`font-pixel text-3xl ${won ? "text-gold" : fled ? "text-muted" : "text-danger"}`}>
        {won ? "Sieg!" : fled ? "Geflohen" : "Niederlage"}
      </h2>
      {won && reward && toChest ? (
        dungeon.claimed ? null : <ChestDeposit reward={reward} />
      ) : won && reward ? (
        <>
          {levelUp && (
            <motion.p
              className="font-pixel text-2xl text-gold"
              initial={{ scale: 0.5 }}
              animate={{ scale: [0.5, 1.2, 1] }}
              transition={{ duration: 0.6 }}
            >
              LEVEL UP! → <span className="num">{reward.levelAfter}</span>
              <span className="block font-sans text-sm text-xp">
                +{(reward.levelAfter - reward.levelBefore) * POINTS_PER_LEVEL} Attributpunkte und +
                {(reward.levelAfter - reward.levelBefore) * SKILL_POINTS_PER_LEVEL} Skillpunkt
                {reward.levelAfter - reward.levelBefore > 1 ? "e" : ""}
              </span>
            </motion.p>
          )}
          <p>
            Du erhältst <span className="num text-xp">+{reward.xp} XP</span>
            {reward.gold > 0 && (
              <>
                ,{" "}
                <Gold amount={reward.gold} className="font-bold text-gold" />
              </>
            )}
            {potionDrop && (
              <>
                {" "}
                und{" "}
                <span className="font-bold text-xp">
                  {potionDrop.count}× {potionDrop.def.icon} {potionDrop.def.name}
                </span>
              </>
            )}
            {!loot && !bossLoot && " – diesmal ohne Item."}
          </p>
          {buffPotion && (
            <motion.p
              initial={{ scale: 0.6 }}
              animate={{ scale: 1 }}
              className={`rounded-md bg-night-800 px-3 py-1 font-bold ${POTION_COLORS[buffPotion.effect.kind]}`}
            >
              Seltener Fund: {buffPotion.icon} {buffPotion.name}{" "}
              <span className="text-xs font-normal">({potionEffectText(buffPotion)})</span>
            </motion.p>
          )}
          {bossLoot && (
            <motion.div
              initial={{ scale: 0.6, rotate: -4 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 220, damping: 12 }}
            >
              <LootCard loot={bossLoot} heading="👑 Boss-Beute! Ein einzigartiges Stück" />
            </motion.div>
          )}
          {loot && <LootCard loot={loot} heading="🎁 Beute" />}
        </>
      ) : fled ? (
        <p className="max-w-md text-sm text-muted">
          Du bist entkommen
          {goldLost > 0 ? (
            <>
              , hast dabei aber <Gold amount={goldLost} className="font-bold text-gold" /> verloren.
            </>
          ) : (
            "."
          )}
        </p>
      ) : (
        <p className="max-w-md text-sm text-muted">
          Du wurdest besiegt. Bessere Ausrüstung, mehr Ausdauer oder ein paar Heiltränke helfen beim nächsten Versuch.
        </p>
      )}
      {dungeon ? (
        <DungeonResultActions battle={battle} won={won} />
      ) : (
        <div className="flex gap-2">
          <button
            onClick={leave}
            className="rounded-md border-2 border-night-700 px-4 py-1.5 text-muted hover:text-parchment"
          >
            Zurück zur Gebietskarte
          </button>
          <button
            onClick={() => startBattle(battle.creatureId)}
            disabled={battlePoints < BATTLE_COST}
            title={battlePoints < BATTLE_COST ? "Keine Kampfpunkte – erledige Quests" : undefined}
            className="font-pixel rounded-md border-2 border-danger bg-danger/15 px-4 py-1.5 text-danger hover:bg-danger/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Nochmal kämpfen <span className="num text-xs">−{BATTLE_COST} ⚔️ ({battlePoints} übrig)</span>
          </button>
        </div>
      )}
    </motion.section>
  );
}

/** Kurzer Hinweis nach einem Dungeon-Sieg: Was in die Truhe gewandert ist. */
function ChestDeposit({ reward }: { reward: BattleReward }) {
  const things = [reward.bossLoot, reward.loot].filter((i) => i !== null).length;
  const potions = (reward.potions?.count ?? 0) + (reward.buffPotion ? 1 : 0);
  return (
    <motion.p
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-md bg-night-800 px-3 py-1.5 text-sm"
    >
      🧰 In die Truhe: <span className="num text-xp">+{reward.xp} XP</span>
      {reward.gold > 0 && (
        <>
          {" · "}
          <Gold amount={reward.gold} className="font-bold text-gold" />
        </>
      )}
      {potions > 0 && <span className="text-xp"> · {potions}× Trank</span>}
      {things > 0 && (
        <span className={reward.bossLoot ? "text-legendary" : "text-epic"}>
          {" · "}
          {things} {things === 1 ? "Item" : "Items"}
          {reward.bossLoot && " 👑"}
        </span>
      )}
    </motion.p>
  );
}

/** Nach einem Dungeon-Kampf: weiter, Truhe öffnen (Abschluss/Verlassen) oder Scheitern. */
function DungeonResultActions({ battle, won }: { battle: BattleState; won: boolean }) {
  const dungeon = useGameStore((s) => s.dungeon)!;
  const next = useGameStore((s) => s.nextDungeonFight);
  const leave = useGameStore((s) => s.leaveBattle);
  const leaveWithChest = useGameStore((s) => s.leaveDungeonWithChest);
  const { name, creatures } = getDungeon(dungeon.dungeonId);
  const finished = won && dungeon.stage === creatures.length - 1;
  const following = creatures[dungeon.stage + 1];
  const collected = chestCount(dungeon.chest);

  if (dungeon.claimed) {
    return (
      <div className="flex w-full flex-col items-center gap-3">
        <p className="font-pixel text-xl text-legendary">
          {dungeon.claimed.completed ? `🏆 ${name} abgeschlossen!` : `🧰 Du verlässt ${name} mit deiner Truhe.`}
        </p>
        <DungeonChest chest={dungeon.claimed} />
        <button
          onClick={leave}
          className="rounded-md border-2 border-night-700 px-4 py-1.5 text-muted hover:text-parchment"
        >
          Zurück zur Gebietskarte
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {finished ? (
        <p className="font-pixel text-xl text-legendary">🏆 {name} abgeschlossen!</p>
      ) : won ? (
        <p className="text-sm text-muted">
          Als Nächstes: <span className={following.boss ? "text-legendary" : "text-parchment"}>{following.name}</span>{" "}
          (Lv. {following.level}). Du gehst mit{" "}
          <span className="num text-xp">
            {battle.hero.hp}/{battle.hero.maxHp} LP
          </span>{" "}
          weiter – keine Heilung im Dungeon.
        </p>
      ) : (
        <p className="text-sm text-danger">
          Der Dungeon ist gescheitert. Die Kampfpunkte sind verbraucht
          {collected > 0 ? ` und die Truhe mit ${collected} Beutestück${collected === 1 ? "" : "en"} ist verloren.` : "."}
        </p>
      )}
      {won && !finished && collected > 0 && (
        <p className="text-xs text-muted">
          🧰 In der Truhe: {collected} Beutestück{collected === 1 ? "" : "e"} – bei einer Niederlage ist sie verloren.
        </p>
      )}
      <div className="flex gap-2">
        <button
          onClick={won && !finished ? leaveWithChest : leave}
          className="rounded-md border-2 border-night-700 px-4 py-1.5 text-muted hover:text-parchment"
        >
          {won && !finished ? "Verlassen & Truhe öffnen" : "Zurück zur Gebietskarte"}
        </button>
        {won && !finished && (
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={next}
            className="font-pixel rounded-md border-2 border-legendary bg-legendary/15 px-4 py-1.5 text-legendary hover:bg-legendary/25"
          >
            Weiter zu Gegner {dungeon.stage + 2}/{creatures.length} ▶
          </motion.button>
        )}
      </div>
    </div>
  );
}

/** Gegner des Dungeons als Leiste: besiegte abgehakt, aktueller hervorgehoben. */
function DungeonProgress({ area }: { area: AreaDef }) {
  const stage = useGameStore((s) => s.dungeon?.stage ?? 0);
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 text-xs" aria-label="Fortschritt im Dungeon">
      <span className="text-muted">
        Gegner <span className="num text-parchment">{stage + 1}</span>/{area.creatures.length} · keine Heilung
        zwischen den Kämpfen
      </span>
      {area.creatures.map((creature, i) => (
        <span
          key={creature.id}
          className={`rounded px-1.5 py-0.5 ${
            i < stage
              ? "bg-xp/15 text-xp line-through"
              : i === stage
                ? "bg-gold/20 text-gold"
                : creature.boss
                  ? "bg-night-800 text-legendary"
                  : "bg-night-800 text-muted"
          }`}
        >
          {i < stage ? "✓ " : ""}
          {creature.name}
        </span>
      ))}
    </div>
  );
}

/** Kündigt die Boss-Fähigkeit an – diese Runde (rot) oder nächste Runde (gelb). */
function BossWarning({ battle }: { battle: BattleState }) {
  const ability = getBossAbility(battle.creatureId);
  const inRounds = roundsUntilBossAbility(battle.creatureId, battle.round);
  if (!ability || inRounds === null || inRounds > 1) return null;
  const now = inRounds === 0;
  return (
    <motion.p
      key={`${battle.round}-${inRounds}`}
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`rounded-md border-2 px-3 py-1.5 text-sm ${
        now ? "border-danger bg-danger/15 text-danger" : "border-gold/70 bg-gold/10 text-gold"
      }`}
    >
      ⚠️ {now ? "Diese Runde" : "Nächste Runde"} setzt der Boss <strong>{ability.icon} {ability.name}</strong> ein:{" "}
      {ability.description}
      {now && " Bollwerk blockt sie, ein Betäubender Schlag verhindert sie."}
    </motion.p>
  );
}

function LootCard({ loot, heading }: { loot: ItemStats; heading: string }) {
  return (
    <div className={`rounded-md border-2 bg-night-800 px-4 py-2 ${RARITY_BORDER[loot.rarity]}`}>
      <p className="text-xs text-muted">{heading}</p>
      <p className={`font-pixel text-lg ${RARITY_TEXT[loot.rarity]}`}>
        <ItemIcon def={loot.def} rarity={loot.rarity} size={32} /> {loot.def.name}
      </p>
      <p className="text-xs">
        <span className={RARITY_TEXT[loot.rarity]}>{rarityLabel(loot.rarity)}</span> · {mainStatText(loot)} · ab Lv.{" "}
        {loot.def.requiredLevel}
        {bonusText(loot.bonuses) && <span className="text-xp"> · {bonusText(loot.bonuses)}</span>}
      </p>
    </div>
  );
}

/** Die vier Boss-Items als kleine Symbole – mit Werten beim Überfahren. */
/**
 * Mögliche Boss-Beute als kleine Symbole – wie in der Boss-Sammlung:
 * schon gefundene Stücke in Farbe mit Werten, unentdeckte nur als Schatten.
 */
export function BossDrops({ creature }: { creature: CreatureDef }) {
  const found = useGameStore((s) => s.bossCollection);
  const items = getBossItems(creature.id);
  if (items.length === 0) return null;
  const count = items.filter((i) => found.includes(i.id)).length;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-legendary">
        👑 {Math.round(BOSS_ITEM_DROP_CHANCE * 100)} % auf Boss-Beute ({count}/{items.length} gefunden):
      </span>
      {items.map((def) =>
        found.includes(def.id) ? (
          <ItemTooltip
            key={def.id}
            stats={getItemStats({ uid: def.id, itemId: def.id, rarity: "legendary", bonuses: {} })}
            hint="Nur von diesem Boss · legendär mit 3 zufälligen Attributboni"
          >
            <span className="rounded bg-night-950/70 p-0.5" tabIndex={0}>
              <ItemIcon def={def} rarity="legendary" size={24} />
            </span>
          </ItemTooltip>
        ) : (
          <span key={def.id} className="rounded bg-night-950/70 p-0.5" title="Noch nicht gefunden">
            <ItemIcon def={def} size={24} className="opacity-40 brightness-0" />
          </span>
        ),
      )}
    </div>
  );
}

function BattleLog({ battle }: { battle: BattleState }) {
  const entries = [...battle.log].reverse().slice(0, 10);
  if (entries.length === 0) return null;
  return (
    <section className="panel p-4">
      <h3 className="mb-2 text-xs uppercase tracking-wide text-muted">Kampfprotokoll</h3>
      <ol className="flex flex-col gap-1 text-sm">
        {entries.map((e, i) => (
          <li key={battle.log.length - i} className={i === 0 ? "" : "text-muted"}>
            <span className="mr-2 text-xs text-muted">R{e.round}</span>
            {describe(e, battle)}
          </li>
        ))}
      </ol>
    </section>
  );
}

function describe(e: BattleState["log"][number], battle: BattleState): string {
  const enemy = battle.enemy.name;
  switch (e.type) {
    case "potion":
      return e.buff
        ? `Du trinkst ${getPotion(e.potionId).name}: ${potionEffectText(getPotion(e.potionId))}.`
        : `Du trinkst ${getPotion(e.potionId).name} und heilst ${e.heal} LP.`;
    case "hit":
      return e.attacker === "hero"
        ? `${e.crit ? "Kritischer Treffer! " : ""}Du triffst ${enemy} für ${e.damage} Schaden.`
        : `${e.crit ? "Kritischer Treffer! " : ""}${enemy} trifft dich für ${e.damage} Schaden.`;
    case "defeated":
      return e.side === "enemy" ? `${enemy} ist besiegt!` : "Du wurdest besiegt.";
    case "fled":
      return e.goldLost > 0 ? `Du fliehst und verlierst ${e.goldLost} Gold.` : "Du fliehst.";
    case "ability":
      return `Du setzt ${getAbility(e.weapon).name} ein (−${e.manaCost} Mana).`;
    case "poison":
      return e.target === "enemy" ? `Gift fügt ${enemy} ${e.damage} Schaden zu.` : `Gift fügt dir ${e.damage} Schaden zu.`;
    case "bleed":
      return e.target === "enemy" ? `${enemy} blutet und erleidet ${e.damage} Schaden.` : `Du blutest und erleidest ${e.damage} Schaden.`;
    case "burn":
      return e.target === "enemy" ? `Feuer fügt ${enemy} ${e.damage} Schaden zu.` : `Feuer fügt dir ${e.damage} Schaden zu.`;
    case "stunned":
      return `${enemy} ist betäubt und kann nicht zurückschlagen.`;
    case "bossAbility":
      return `${enemy} setzt ${getBossAbility(e.bossId)?.name ?? "einen Spezialangriff"} ein!`;
    case "blocked":
      return `Dein Bollwerk blockt den Angriff von ${enemy} komplett.`;
    case "drain":
      return `${enemy} heilt sich um ${e.heal} LP.`;
    case "manaBurn":
      return `${enemy} raubt dir ${e.amount} Mana.`;
  }
}
