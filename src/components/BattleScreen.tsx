import { motion } from "motion/react";
import { GameIcon } from "./GameIcon";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { getAbility, MANA_REGEN } from "../domain/abilities";
import { getBossAbilities, getBossAbilityById, roundsUntilBossAbility, upcomingBossAbility } from "../domain/bossAbilities";
import { describeIntent, hasBossScript, turnAbility, type IntentView } from "../domain/bossIntents";
import {
  abilityBlocker,
  abilityCost,
  BOSS_ITEM_DROP_CHANCE,
  bossTurnOf,
  BUFF_POTION_DROP_CHANCE,
  chestCount,
  DEFEND,
  defendEffect,
  fleeCost,
  getHeroCombatProfile,
  potionBlocker,
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
  formatRespawn,
  isAreaUnlocked,
  respawnLeft,
  xpLevelFactor,
  type AreaDef,
  type CreatureDef,
} from "../domain/creatures";
import { dateKey, weekKey } from "../domain/calendar";
import { dungeonMobs, ROOMS } from "../domain/dungeonPaths";
import { foodEffectText, getFood, withMeal } from "../domain/food";
import { trackedVisitorQuests } from "../domain/visitors";
import { heroicDescription as heroicText, HEROIC_REWARD_FACTOR, isHeroicUnlocked } from "../domain/heroic";
import { getBossItems, getItemStats } from "../domain/items";
import { POINTS_PER_LEVEL } from "../domain/leveling";
import { questsForCreature, trackedQuests } from "../domain/quests";
import { skillPointsNote } from "../domain/skills";
import type { ItemStats } from "../domain/types";
import { DRINK_POTIONS, getPotion, isThrowable, potionEffectText, potionHeal, THROW_POTIONS } from "../domain/potions";
import { MaterialGain } from "./materialUi";
import { EventBus } from "../game/EventBus";
import { unlockAudio } from "../game/sfx";
import { useGameStore } from "../store/gameStore";
import { useSoundStore } from "../store/soundStore";
import { ConfirmDialog } from "./ConfirmDialog";
import { CoopDungeonList, CoopJoinForm, CoopPanel, CoopScreen } from "./CoopScreen";
import { useCoopStore } from "../coop/coopStore";
import { DungeonChest } from "./DungeonChest";
import { ChestDeposit, DungeonOnward, DungeonProgress, DungeonRoomView } from "./DungeonPath";
import { TowerPanel, TowerProgress, TowerResultActions } from "./TowerScreen";
import { Gold } from "./Gold";
import { ItemIcon } from "./ItemIcon";
import { ItemTooltip } from "./ItemTooltip";
import { CreatureSprite } from "./CreatureSprite";
import { bonusText, mainStatText, RARITY_BORDER, RARITY_TEXT, rarityLabel } from "./itemUi";
import { PixelAvatar } from "./PixelAvatar";
import { AvatarFrame } from "./Achievements";
import { POTION_BUTTONS, POTION_COLORS } from "./potionUi";
import {
  AbilityButton,
  ActionGroup,
  eliteChips,
  enemyStatusChips,
  heroStatusChips,
  MatchupBadge,
  matchupChips,
  PhaseWarning,
  soloBossChips,
  StatusSide,
  TargetPicker,
} from "./BattleStatus";
import { ADD_SKILLS, addIntentText, getBossPhase } from "../domain/bossMechanics";
import { abilityKind, MATCHUP_LABELS, matchupOf, WEAPON_KIND, type DamageKind } from "../domain/matchups";
import { classAbility } from "../domain/heroClasses";
import { Hint } from "./HoverCard";
import { QuestItemFinds } from "./QuestItemFinds";
import { QuestProgressChips } from "./QuestScreen";
import { useNow } from "./useNow";

// Phaser ist gross – erst laden, wenn tatsächlich gekämpft wird.
const PhaserBattle = lazy(() => import("../game/PhaserBattle"));

export function BattleScreen() {
  const battle = useGameStore((s) => s.battle);
  const dungeon = useGameStore((s) => s.dungeon);
  const coop = useCoopStore((s) => s.phase !== "idle");
  if (coop) return <CoopScreen />;
  if (!battle) return <AreaSelect />;
  // Raum ohne Kampf im Dungeon: ersetzt die Kampfansicht
  if (dungeon?.room) return <DungeonRoomView battle={battle} run={{ ...dungeon, room: dungeon.room }} />;
  return <Battle battle={battle} />;
}

/* ───────────────────────── Gebietsauswahl ───────────────────────── */

type BattleView = "areas" | "dungeons" | "tower" | "coop";

/** Gewählte Ansicht im Kampf-Tab – nur eine Bequemlichkeit pro Browser. */
const BATTLE_VIEW_KEY = "questlog-battle-view";

const BATTLE_VIEWS: Record<BattleView, { label: string; intro: string }> = {
  areas: { label: "🌲 Gebiete", intro: "Kreaturen und Bosse der Gebiete – jedes öffnet sich ab seinem Mindestlevel." },
  dungeons: { label: "🗝️ Dungeons", intro: "Ein Weg ohne Heilung mit Gabelungen – Kampf, Elite, Schrein, Händler, Falle oder Rätsel. In der Mitte ein Zwischenboss, am Ende ein Boss mit eigenem Set – solo oder im Koop." },
  tower: { label: "🗼 Endlos-Turm", intro: "So hoch wie möglich: Stockwerk für Stockwerk stärkere Gegner, Segen und eine Wochen-Rangliste." },
  coop: { label: "🤝 Koop-Bosse", intro: "Raid-Bosse für 2–4 Helden – mit eigenen Sets." },
};
const BATTLE_VIEW_ORDER: readonly BattleView[] = ["areas", "dungeons", "tower", "coop"];

function AreaSelect() {
  const character = useGameStore((s) => s.character);
  const equipment = useGameStore((s) => s.equipment);
  const hero = getHeroCombatProfile(character, equipment);
  const unlocked = AREAS.filter((a) => isAreaUnlocked(a, hero.level));
  const [areaId, setAreaId] = useState(unlocked[unlocked.length - 1].id);
  const area = AREAS.find((a) => a.id === areaId)!;
  const [view, setView] = useState<BattleView>(() => {
    try {
      const saved = localStorage.getItem(BATTLE_VIEW_KEY);
      return BATTLE_VIEW_ORDER.includes(saved as BattleView) ? (saved as BattleView) : "areas";
    } catch {
      return "areas";
    }
  });
  const choose = (next: BattleView) => {
    setView(next);
    try {
      localStorage.setItem(BATTLE_VIEW_KEY, next);
    } catch {
      // ohne Speicher gilt die Wahl nur bis zum Neuladen
    }
  };
  // Läuft noch ein Koop-Kampf (z. B. nach dem Neuladen)? Am Koop-Knopf zeigen, auch wenn eine andere Ansicht offen ist.
  const rejoin = useCoopStore((s) => s.rejoin);
  const checkRejoin = useCoopStore((s) => s.checkRejoin);
  useEffect(() => void checkRejoin(), [checkRejoin]);

  return (
    <div className="grid gap-4 md:grid-cols-[280px_1fr]">
      <HeroPanel />

      <div className="flex flex-col gap-4">
        <section className="panel p-4">
          <div className="flex flex-wrap rounded-md border-2 border-night-700 bg-night-900 p-0.5" role="group" aria-label="Kampfart">
            {BATTLE_VIEW_ORDER.map((v) => (
              <button
                key={v}
                onClick={() => choose(v)}
                aria-pressed={view === v}
                className={`font-pixel flex-1 whitespace-nowrap rounded px-3 py-1 transition ${
                  view === v ? "bg-night-700 text-gold" : "text-muted hover:text-parchment"
                }`}
              >
                {BATTLE_VIEWS[v].label}
                {v === "coop" && rejoin && <span className="ml-1.5 rounded-full bg-xp px-1.5 text-xs text-night-950">!</span>}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">{BATTLE_VIEWS[view].intro}</p>
        </section>

        {view === "areas" && (
          <>
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
                      {!open && <GameIcon icon="🔒" className="mr-1" />}
                      {a.name} <span className="text-xs opacity-70">Lv. {a.minLevel}–{a.maxLevel}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <AreaPanel area={area} heroLevel={hero.level} />
          </>
        )}
        {view === "dungeons" && <DungeonPanel heroLevel={hero.level} />}
        {view === "tower" && <TowerPanel heroLevel={hero.level} />}
        {view === "coop" && <CoopPanel heroLevel={hero.level} />}
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

/** Dungeons: mehrere Gegner nacheinander, ohne Heilung dazwischen, Boss mit einzigartiger Beute – solo oder im Koop. */
function DungeonPanel({ heroLevel }: { heroLevel: number }) {
  const [mode, setMode] = useState<"solo" | "coop">(() => {
    try {
      return localStorage.getItem(DUNGEON_MODE_KEY) === "coop" ? "coop" : "solo";
    } catch {
      return "solo";
    }
  });
  const choose = (next: "solo" | "coop") => {
    setMode(next);
    try {
      localStorage.setItem(DUNGEON_MODE_KEY, next);
    } catch {
      // ohne Speicher gilt die Wahl nur bis zum Neuladen
    }
  };

  return (
    <section className="panel p-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-pixel text-2xl">Dungeons</h2>
        <div className="flex rounded-md border-2 border-night-700 bg-night-900 p-0.5" role="group" aria-label="Dungeon-Modus">
          {(["solo", "coop"] as const).map((m) => (
            <button
              key={m}
              onClick={() => choose(m)}
              aria-pressed={mode === m}
              className={`font-pixel rounded px-3 py-0.5 transition ${
                mode === m ? "bg-night-700 text-gold" : "text-muted hover:text-parchment"
              }`}
            >
              {m === "solo" ? "🧍 Solo" : "🤝 Koop"}
            </button>
          ))}
        </div>
      </div>
      {mode === "coop" ? (
        <CoopDungeonList heroLevel={heroLevel} />
      ) : (
        <SoloDungeons heroLevel={heroLevel} />
      )}
    </section>
  );
}

/** Gewählter Dungeon-Modus – nur eine Bequemlichkeit pro Browser. */
const DUNGEON_MODE_KEY = "questlog-dungeon-mode";

function SoloDungeons({ heroLevel }: { heroLevel: number }) {
  return (
    <>
      <p className="mb-4 text-sm text-muted">
        Acht Gegner hintereinander: nach drei Kämpfen ein Zwischenboss (Elite mit zwei Modifikatoren), am Ende der
        Boss. Die Gegner sind stärker als draussen, und zwischen den
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
    </>
  );
}

function DungeonCard({ dungeon, heroLevel }: { dungeon: AreaDef; heroLevel: number }) {
  const startDungeon = useGameStore((s) => s.startDungeon);
  const open = isAreaUnlocked(dungeon, heroLevel);
  const boss = dungeon.creatures.at(-1)!;
  const bossAbilities = getBossAbilities(boss.id);
  const questActive = useGameStore((s) => `dungeon-${dungeon.id}` in s.questLog.active);
  const heroicOpen = useGameStore((s) => open && isHeroicUnlocked(boss.id, s.records.bossesDefeated));

  return (
    <li
      className={`rounded-md border-2 bg-night-800 p-3 ${open ? "border-legendary/60" : "border-night-700 opacity-60"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-pixel text-lg">
            <GameIcon icon={open ? "🏰" : "🔒"} /> {dungeon.name}{" "}
            <span className="font-sans text-xs text-muted">ab Lv. {dungeon.minLevel}</span>
          </p>
          <p className="text-xs text-muted">{dungeon.description}</p>
          {questActive && <p className="text-xs text-gold">📜 Quest läuft: Schliesse den Dungeon ab</p>}
        </div>
        <motion.button
          whileTap={{ scale: 0.92 }}
          disabled={!open}
          onClick={() => startDungeon(dungeon.id)}
          title={open ? undefined : `Ab Level ${dungeon.minLevel}`}
          className="font-pixel shrink-0 rounded-md border-2 border-legendary bg-legendary/15 px-3 py-1 text-legendary hover:bg-legendary/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Betreten
        </motion.button>
        {heroicOpen && (
          <Hint text={heroicText(boss.id)} className="shrink-0">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => startDungeon(dungeon.id, true)}
              className="font-pixel shrink-0 rounded-md border-2 border-epic bg-epic/15 px-3 py-1 text-epic hover:bg-epic/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ☠️ Heroisch
            </motion.button>
          </Hint>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        {[...dungeonMobs(dungeon), ...dungeon.creatures.filter((c) => c.midBoss || c.boss)].map((creature) => (
          <Hint
            key={creature.id}
            text={`${creature.name}${creature.boss ? " (Endboss)" : creature.midBoss ? " (Zwischenboss: Elite mit zwei Modifikatoren)" : ""} · Lv. ${creature.level}`}
          >
            <div className="flex flex-col items-center text-center">
              <CreatureSprite sprite={creature.sprite} size={creature.boss ? 48 : creature.midBoss ? 42 : 36} />
              <span className={`text-[10px] leading-tight ${creature.boss ? "text-legendary" : creature.midBoss ? "text-epic" : "text-muted"}`}>
                Lv. {creature.level}
              </span>
            </div>
          </Hint>
        ))}
      </div>
      <p className="mt-1 text-xs text-muted">
        🔀 An den Gabelungen wählst du deinen Weg:{" "}
        {Object.values(ROOMS)
          .map((r) => `${r.icon} ${r.name}`)
          .join(" · ")}
      </p>
      <p className="mt-1 text-xs">
        <span className="text-legendary">Boss: {boss.name}</span>
        {bossAbilities.length > 0 && (
          <span className="text-danger">
            {" "}
            · {bossAbilities.map((a) => `${a.icon} ${a.name}`).join(" und ")}{" "}
            {bossAbilities.length > 1 ? "im Wechsel" : ""} alle {bossAbilities[0].every} Runden
          </span>
        )}
      </p>
      <BossDrops creature={boss} />
    </li>
  );
}

function CreatureRow({ creature, heroLevel }: { creature: CreatureDef; heroLevel: number }) {
  const startBattle = useGameStore((s) => s.startBattle);
  const heroicOpen = useGameStore((s) => isHeroicUnlocked(creature.id, s.records.bossesDefeated));
  const quests = useCreatureQuests(creature.id);
  const respawn = useRespawn(creature.id);
  const bossAbilities = getBossAbilities(creature.id);
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
      <CreatureSprite sprite={creature.sprite} size={creature.boss ? 64 : 52} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 font-semibold">
          {creature.name}
          {creature.boss && <span className="text-xs text-legendary">BOSS</span>}
          <QuestProgressChips quests={quests} />
        </p>
        <div className="flex flex-wrap gap-x-3 text-xs text-muted">
          <span>Lv. {creature.level}</span>
          {xpLevelFactor(creature.level, heroLevel) < 1 ? (
            <Hint text="Dieser Gegner ist für dich zu leicht – er gibt weniger Erfahrung.">
              <span className="text-muted">
                +{getCreatureXp(creature, heroLevel)} XP ({Math.round(xpLevelFactor(creature.level, heroLevel) * 100)} %)
              </span>
            </Hint>
          ) : (
            <span className="text-xp">+{getCreatureXp(creature, heroLevel)} XP</span>
          )}
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
          <Hint text="Seltene Chance auf einen Angriffs- oder Rüstungstrank.">
            <span className="text-strength">🔥/🪨 {Math.round(BUFF_POTION_DROP_CHANCE * 100)} %</span>
          </Hint>
          {dangerText && <span className={danger > 0 ? "text-danger" : "text-xp"}>{dangerText}</span>}
        </div>
        {hasBossScript(creature.id) ? (
          <p className="mt-1 text-xs text-danger">❓ Kämpft mit eigener Taktik – im Kampf siehst du jede Runde, was er vorhat.</p>
        ) : (
          bossAbilities.map((a) => (
            <p key={a.id} className="mt-1 text-xs text-danger">
              Fähigkeit: {a.icon} {a.name} – {bossAbilities.length > 1 ? "im Wechsel " : ""}alle {a.every} Runden.{" "}
              {a.description}
            </p>
          ))
        )}
        <BossDrops creature={creature} />
      </div>
      <div className="flex shrink-0 flex-col items-stretch gap-1.5">
        <motion.button
          whileTap={{ scale: 0.9 }}
          disabled={respawn > 0}
          onClick={() => startBattle(creature.id)}
          title={respawn > 0 ? `Der Boss erscheint in ${formatRespawn(respawn)} wieder` : undefined}
          className="font-pixel shrink-0 rounded-md border-2 border-danger bg-danger/15 px-3 py-1 text-danger hover:bg-danger/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {respawn > 0 ? <>⏳ <span className="num">{formatRespawn(respawn)}</span></> : "Kämpfen"}
        </motion.button>
        {heroicOpen && (
          <Hint text={heroicText(creature.id)} className="block">
            <motion.button
              whileTap={{ scale: 0.9 }}
              disabled={respawn > 0}
              onClick={() => startBattle(creature.id, true)}
              className="font-pixel w-full rounded-md border-2 border-epic bg-epic/15 px-3 py-1 text-epic hover:bg-epic/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ☠️ Heroisch
            </motion.button>
          </Hint>
        )}
      </div>
    </li>
  );
}

/** Millisekunden bis zum Respawn eines Gebietsbosses (0 = bereit) – sekündlich aktualisiert, solange er läuft. */
function useRespawn(creatureId: string): number {
  const respawnAt = useGameStore((s) => s.bossRespawns[creatureId] ?? 0);
  const now = useNow(respawnAt > Date.now() ? 1000 : 60_000);
  return respawnLeft({ [creatureId]: respawnAt }, creatureId, now.getTime());
}

/** Laufende Quests und Tagesaufträge, die ein Sieg gegen diese Kreatur voranbringt. */
function useCreatureQuests(creatureId: string) {
  const questLog = useGameStore((s) => s.questLog);
  const dailyQuests = useGameStore((s) => s.dailyQuests);
  const weeklyQuests = useGameStore((s) => s.weeklyQuests);
  const boardTier = useGameStore((s) => s.village.board);
  const visitors = useGameStore((s) => s.visitors);
  return questsForCreature(
    [...trackedQuests(questLog, dailyQuests, weeklyQuests, dateKey(), weekKey(), boardTier), ...trackedVisitorQuests(visitors)],
    creatureId,
  );
}

function HeroPanel() {
  const character = useGameStore((s) => s.character);
  const equipment = useGameStore((s) => s.equipment);
  const potions = useGameStore((s) => s.potions);
  const meal = useGameStore((s) => s.meal);
  // Die Werte zeigen das gegessene Gericht schon mit – so wirkt es im nächsten Einsatz
  const hero = withMeal(getHeroCombatProfile(character, equipment), meal);
  const frame = useGameStore((s) => s.cosmetics.frame);
  const food = meal ? getFood(meal) : null;

  return (
    <section className="panel flex flex-col items-center gap-3 self-start p-5 text-center">
      <AvatarFrame frame={frame} className="rounded-lg bg-night-800 p-3">
        <PixelAvatar size={96} />
      </AvatarFrame>
      <p className="font-pixel text-2xl">{character.name}</p>
      <p className="text-sm text-muted">Level {hero.level}</p>
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
      {food && (
        <p className="w-full rounded-md border-2 border-xp/60 bg-xp/10 px-2 py-1 text-xs">
          {food.icon} Satt von <span className="font-semibold">{food.name}</span>:{" "}
          <span className="text-xp">{foodEffectText(food)}</span> im nächsten Kampf, Dungeon, Turm-Lauf oder Koop-Kampf
        </p>
      )}
      <p className="text-xs text-muted">
        Jede Waffe macht mehr Schaden mit ihrem Attribut (siehe Charakter-Tab). Ausdauer gibt dazu Lebenspunkte,
        Intelligenz Mana, Charisma kritische Treffer und Gold nach einem Sieg (+{Math.round(hero.goldBonus * 100)} %).
        Jede angelegte Waffe bringt ihre eigenen Fähigkeiten mit, die im Kampf Mana kosten.
      </p>
      <div className="w-full border-t border-night-700 pt-3 text-left">
        <h3 className="mb-1 text-xs uppercase tracking-wide text-muted">Tränke</h3>
        <ul className="text-sm">
          {[...DRINK_POTIONS, ...THROW_POTIONS.filter((p) => (potions[p.id] ?? 0) > 0)].map((p) => (
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
      <CoopJoinForm />
    </section>
  );
}

function Value({ label, value, icon, accent }: { label: string; value: number | string; icon: string; accent: string }) {
  return (
    <div className="rounded-md bg-night-800 p-2">
      <div className={`font-sans text-lg font-bold tabular-nums ${accent}`}>
        <GameIcon icon={icon} /> {value}
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
  const mealInUse = useGameStore((s) => s.mealInUse);
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
  // Nur Tränke im Vorrat (oder schon in diesem Kampf benutzt) – leere Sorten machen die Leiste nur voll
  const battlePotions = [...DRINK_POTIONS, ...THROW_POTIONS].filter(
    (p) => (potions[p.id] ?? 0) > 0 || battle.potionsUsed.includes(p.id),
  );

  return (
    <div className="flex flex-col gap-4">
      <section className="panel p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-pixel text-2xl">
            {battle.towerFloor ? (
              <>
                🗼 Endlos-Turm <span className="num text-gold">· Stockwerk {battle.towerFloor}</span>
              </>
            ) : (
              area.name
            )}{" "}
            <span className="text-base text-muted">· {creature.name}</span>
            {battle.heroic ? (
              <Hint text={heroicText(battle.creatureId)}>
                <span className="ml-2 text-base text-epic">☠️ Heroisch</span>
              </Hint>
            ) : (
              battle.elite && (
                <Hint text="Elite-Gegner: stärker als sonst, dafür doppelte Erfahrung, doppeltes Gold und sichere Beute.">
                  <span className="ml-2 text-base text-legendary">★ Elite</span>
                </Hint>
              )
            )}
          </h2>
          <div className="flex items-center gap-3">
            <SoundControl />
            <span className="font-pixel text-gold">
              Runde <span className="num">{battle.round}</span>
            </span>
            {active && (
              <button
                disabled={busy}
                onClick={() => setConfirmFlee(true)}
                className="rounded-md border-2 border-night-600 px-2 py-0.5 text-sm text-muted hover:border-muted hover:text-parchment disabled:cursor-not-allowed disabled:opacity-40"
              >
                🏃 Fliehen
              </button>
            )}
          </div>
        </div>
        {area.dungeon && !battle.towerFloor && <DungeonProgress area={area} />}
        {battle.towerFloor && <TowerProgress floor={battle.towerFloor} />}
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
        <section className="panel flex flex-col gap-4 p-4">
          {/* Zustand: links du, rechts der Gegner */}
          <div className="grid gap-2 sm:grid-cols-2">
            <StatusSide title="Du" chips={heroStatusChips(battle.buffs, battle.heroEffects, mealInUse)}>
              <Hint text={`Mana für Fähigkeiten – füllt sich um ${MANA_REGEN} pro Runde auf.`} className="block">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-intellect">💧</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-sm bg-night-700">
                    <motion.div
                      className="h-full bg-intellect"
                      initial={false}
                      animate={{ width: `${(battle.mana / battle.maxMana) * 100}%` }}
                    />
                  </div>
                  <span className="num text-xs text-intellect">
                    {battle.mana}/{battle.maxMana}
                  </span>
                </div>
              </Hint>
            </StatusSide>
            <FocusSide battle={battle} />
          </div>
          {(battle.adds?.length ?? 0) > 0 && <BattleTargets battle={battle} disabled={!active} />}
          <PhaseWarning bossId={battle.creatureId} phase={battle.phase} boss={battle.enemy} />

          <div className="grid grid-cols-2 gap-2">
            <Hint heading="⚔️ Angreifen" text="Normaler Angriff mit deiner Waffe – danach schlägt der Gegner zurück." className="flex">
              <motion.button
                whileTap={{ scale: 0.95 }}
                disabled={busy || !active}
                onClick={() => act(() => attack())}
                className="font-pixel w-full rounded-md border-2 border-danger bg-danger/20 px-4 py-2 text-xl text-danger hover:bg-danger/30 disabled:pointer-events-none disabled:opacity-40"
              >
                ⚔️ Angreifen <MatchupBadge matchup={matchupAgainst(battle, battle.heroWeapon ? WEAPON_KIND[battle.heroWeapon] : null)} />
              </motion.button>
            </Hint>
            <Hint
              heading="🛡️ Abwehren"
              text={`Kein Angriff – dafür erleidest du diese Runde nur ${Math.round(defendEffect(battle.skills).taken * 100)} % Schaden und bekommst ${defendEffect(battle.skills).mana} Mana zusätzlich.`}
              className="flex"
            >
              <motion.button
                whileTap={{ scale: 0.95 }}
                disabled={busy || !active}
                onClick={() => act(() => attack(DEFEND))}
                className="font-pixel w-full rounded-md border-2 border-intellect bg-intellect/15 px-4 py-2 text-xl text-intellect hover:bg-intellect/25 disabled:pointer-events-none disabled:opacity-40"
              >
                🛡️ Abwehren
              </motion.button>
            </Hint>
          </div>

          <ActionGroup label="Fähigkeiten">
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
              {battle.abilities.map((id) => (
                <AbilityButton
                  key={id}
                  ability={{ ...classAbility(id, battle.heroClass), manaCost: abilityCost(battle, id) }}
                  blocker={abilityBlocker(battle, id)}
                  disabled={busy}
                  onClick={() => act(() => attack(id))}
                  matchup={matchupAgainst(battle, abilityKind(getAbility(id)))}
                />
              ))}
            </div>
            {battle.abilities.length === 0 && (
              <p className="text-xs text-muted">
                Fähigkeiten bringen deine Waffen mit – lege eine Waffe an, um ihre Fähigkeiten zu nutzen.
              </p>
            )}
          </ActionGroup>

          <ActionGroup
            label="Tränke"
            hint={
              battle.thrown
                ? `${getPotion(battle.thrown).name} liegt bereit – sie fliegt mit deinem Zug auf ${
                    battle.adds?.find((a) => a.uid === battle.thrownAt)?.combatant.name ?? battle.enemy.name
                  }. Angreifen kannst du ein anderes Ziel.`
                : battle.potionUsedThisRound
                  ? "Trank für diese Runde verbraucht – jetzt angreifen."
                  : "1 pro Runde · jede Sorte 1× pro Kampf · Wurftränke fliegen auf das gewählte Ziel"
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              {battlePotions.length === 0 && <span className="text-xs text-muted">Keine Tränke im Vorrat.</span>}
              {battlePotions.map((p, i) => {
                const count = potions[p.id] ?? 0;
                const used = battle.potionsUsed.includes(p.id);
                const blocker = count === 0 && !used ? "Keine mehr im Vorrat – Nachschub beim Händler." : potionBlocker(battle, p);
                const effect = p.effect.kind === "heal" ? `Heilt ${potionHeal(p, battle.hero.maxHp)} LP` : potionEffectText(p);
                // Wurftränke (nur die im Vorrat) stehen abgesetzt hinter den Trinktränken
                const thrown = isThrowable(p);
                const label = thrown ? `${p.name} werfen` : p.name;
                return [
                  thrown && (i === 0 || !isThrowable(battlePotions[i - 1])) && (
                    <span key="throw" className="text-xs text-muted">
                      🎯 Werfen:
                    </span>
                  ),
                  <Hint
                    key={p.id}
                    heading={`${p.icon} ${label}`}
                    text={
                      <>
                        {effect}
                        {blocker && <span className="mt-1 block text-xs text-danger">{blocker}</span>}
                      </>
                    }
                  >
                    <button
                      disabled={busy || blocker !== null}
                      onClick={() => act(() => drink(p.id))}
                      className={`rounded-md border-2 px-2.5 py-1 text-sm disabled:pointer-events-none disabled:opacity-40 ${POTION_BUTTONS[p.effect.kind]} ${battle.thrown === p.id ? "ring-2 ring-gold" : ""}`}
                    >
                      {p.icon} <span className="hidden text-xs sm:inline">{p.name}</span> <span className="num font-bold">× {count}</span>
                      {used && <span className="ml-1 text-xs">✓</span>}
                    </button>
                  </Hint>,
                ];
              })}
            </div>
          </ActionGroup>
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

/** Wie wirkt eine Schadensart gegen das aktuelle Ziel (Boss oder gewählter Begleiter)? */
function matchupAgainst(battle: BattleState, kind: DamageKind | null) {
  if (!kind) return null;
  const target = battle.adds?.find((a) => a.uid === battle.target)?.creatureId ?? battle.creatureId;
  return matchupOf(target, kind);
}

/** Boss und Begleiter: Ziel wählen (auch per Klick in der Szene). */
function BattleTargets({ battle, disabled }: { battle: BattleState; disabled: boolean }) {
  const choose = useGameStore((s) => s.battleTarget);
  const intent = bossIntent(battle);
  return (
    <TargetPicker
      foes={[
        {
          combatant: battle.enemy,
          effects: battle.enemyEffects,
          boss: getCreature(battle.creatureId).creature.boss,
          creatureId: battle.creatureId,
          ...(intent && { intent: { text: `${intent.icon} ${intent.title}`, urgent: intent.tone === "danger" } }),
        },
        ...(battle.adds ?? []).map((a) => ({
          uid: a.uid,
          combatant: a.combatant,
          effects: a.effects,
          boss: false,
          role: a.role,
          creatureId: a.creatureId,
          ...(a.role && { intent: addIntentText(a.role, a.cast) }),
        })),
      ]}
      selected={battle.target}
      disabled={disabled}
      onChoose={choose}
      roles={ADD_SKILLS}
    />
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
  const dungeon = useGameStore((s) => s.dungeon);
  const tower = useGameStore((s) => s.tower);
  const quests = useCreatureQuests(battle.creatureId);
  const respawn = useRespawn(battle.creatureId);
  const won = battle.status === "won";
  // Im Dungeon geht die Beute in die Truhe – hier nur ein kurzer Hinweis, was dazukam.
  const run = dungeon ?? tower;
  const toChest = run !== null;
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
        run.claimed ? null : <ChestDeposit reward={reward} />
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
                +{(reward.levelAfter - reward.levelBefore) * POINTS_PER_LEVEL} Attributpunkte
                {skillPointsNote(reward.levelBefore, reward.levelAfter)}
              </span>
            </motion.p>
          )}
          {battle.heroic ? (
            <p className="text-epic">
              ☠️ Heroischer Boss besiegt: {Math.round((HEROIC_REWARD_FACTOR - 1) * 100)} % mehr Erfahrung und Gold.
            </p>
          ) : (
            battle.elite && (
              <p className="text-legendary">★ Elite besiegt: doppelte Erfahrung, doppeltes Gold und sichere Beute.</p>
            )
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
          <MaterialGain materials={reward.materials} className="font-semibold" />
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
      {won && reward?.questItems && <QuestItemFinds finds={reward.questItems} />}
      {won && quests.length > 0 && (
        <p className="flex flex-wrap items-center justify-center gap-2 text-sm text-muted">
          Quest-Fortschritt <QuestProgressChips quests={quests} />
        </p>
      )}
      {dungeon ? (
        <DungeonResultActions battle={battle} won={won} />
      ) : tower ? (
        <TowerResultActions battle={battle} won={won} />
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
            disabled={respawn > 0}
            title={respawn > 0 ? "Gebietsbosse erscheinen 5 Minuten nach einem Sieg wieder" : undefined}
            className="font-pixel rounded-md border-2 border-danger bg-danger/15 px-4 py-1.5 text-danger hover:bg-danger/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {respawn > 0 ? <>Respawn in <span className="num">{formatRespawn(respawn)}</span></> : "Nochmal kämpfen"}
          </button>
        </div>
      )}
    </motion.section>
  );
}

/** Nach einem Dungeon-Kampf: Gabelung bzw. weiter, Truhe öffnen (Abschluss/Verlassen) oder Scheitern. */
function DungeonResultActions({ battle, won }: { battle: BattleState; won: boolean }) {
  const dungeon = useGameStore((s) => s.dungeon)!;
  const leave = useGameStore((s) => s.leaveBattle);
  const { name, creatures } = getDungeon(dungeon.dungeonId);
  const finished = won && dungeon.stage === creatures.length - 1;
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

  if (won && !finished) return <DungeonOnward battle={battle} />;

  return (
    <div className="flex flex-col items-center gap-2">
      {finished ? (
        <p className="font-pixel text-xl text-legendary">🏆 {name} abgeschlossen!</p>
      ) : (
        <p className="text-sm text-danger">
          Der Dungeon ist gescheitert
          {collected > 0 ? ` – die Truhe mit ${collected} Beutestück${collected === 1 ? "" : "en"} ist verloren.` : "."}
        </p>
      )}
      <button onClick={leave} className="rounded-md border-2 border-night-700 px-4 py-1.5 text-muted hover:text-parchment">
        Zurück zur Gebietskarte
      </button>
    </div>
  );
}

const INTENT_STYLE: Record<IntentView["tone"], string> = {
  danger: "border-danger bg-danger/15 text-danger",
  warn: "border-gold/70 bg-gold/10 text-gold",
  chance: "border-xp/70 bg-xp/10 text-xp",
  calm: "border-night-600 bg-night-800 text-muted",
};

/** Die Absicht des Bosses in dieser Runde – null bei Gegnern ohne Absichten. */
function bossIntent(battle: BattleState): IntentView | null {
  const turn = bossTurnOf(battle);
  return turn ? describeIntent(battle.creatureId, turn) : null;
}

/** Bosse im festen Takt: die Fähigkeit der nächsten Runde (Vorwarnung) – sonst null. */
function nextCadenceAbility(battle: BattleState) {
  const turn = bossTurnOf(battle);
  if (!turn || hasBossScript(battle.creatureId) || turnAbility(turn)) return null;
  return roundsUntilBossAbility(battle.creatureId, battle.round) === 1 ? upcomingBossAbility(battle.creatureId, battle.round) : null;
}

/** Was der Gegner diese Runde vorhat – vor deiner Aktion (auch im Koop). */
export function IntentLine({ view, round }: { view: IntentView; round: number }) {
  return (
    <motion.p
      key={`${round}-${view.title}`}
      initial={{ scale: 0.97, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`rounded border px-2 py-1 text-sm ${INTENT_STYLE[view.tone]}`}
    >
      {view.icon} <strong>{view.title}</strong>
      {view.text && <span className="opacity-90"> – {view.text}</span>}
    </motion.p>
  );
}

/**
 * Rechts neben dir steht der gewählte Gegner – der Boss oder ein Begleiter – mit
 * Schwächen, Wirkungen und dem, was er diese Runde vorhat.
 */
function FocusSide({ battle }: { battle: BattleState }) {
  const add = battle.adds?.find((a) => a.uid === battle.target && a.combatant.hp > 0);
  if (add) {
    const role = add.role && ADD_SKILLS[add.role];
    const intent = add.role ? addIntentText(add.role, add.cast) : null;
    const view: IntentView = intent
      ? { icon: role!.icon, title: intent.text, text: "", tone: intent.urgent ? "danger" : "warn" }
      : { icon: "🗡️", title: "Greift an", text: "", tone: "calm" };
    return (
      <StatusSide
        title={`${role ? `${role.icon} ` : ""}${add.combatant.name}`}
        chips={[...matchupChips(add.creatureId), ...enemyStatusChips(add.effects)]}
      >
        <IntentLine view={view} round={battle.round} />
      </StatusSide>
    );
  }
  const view = bossIntent(battle);
  const next = nextCadenceAbility(battle);
  return (
    <StatusSide
      title={battle.enemy.name}
      chips={[
        ...eliteChips(battle.elite),
        ...matchupChips(battle.creatureId),
        ...soloBossChips(battle.creatureId, battle.phase, battle.bossShield, battle.adds ?? []),
        ...enemyStatusChips(battle.enemyEffects),
      ]}
    >
      {view && <IntentLine view={view} round={battle.round} />}
      {next && (
        <p className="text-xs text-gold">
          ⚠️ Nächste Runde: <strong>{next.icon} {next.name}</strong> – {next.description}
        </p>
      )}
    </StatusSide>
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
          <Hint key={def.id} text="Noch nicht gefunden">
            <span className="rounded bg-night-950/70 p-0.5">
              <ItemIcon def={def} size={24} className="opacity-40 brightness-0" />
            </span>
          </Hint>
        ),
      )}
    </div>
  );
}

/** So viele Einträge zeigt das Protokoll eingeklappt bzw. aufgeklappt. */
const LOG_SHORT = 3;
const LOG_LONG = 12;

function BattleLog({ battle }: { battle: BattleState }) {
  const [expanded, setExpanded] = useState(false);
  const all = [...battle.log].reverse();
  const entries = all.slice(0, expanded ? LOG_LONG : LOG_SHORT);
  if (entries.length === 0) return null;
  return (
    <section className="panel p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-xs uppercase tracking-wide text-muted">Kampfprotokoll</h3>
        {all.length > LOG_SHORT && (
          <button onClick={() => setExpanded((v) => !v)} className="text-xs text-muted hover:text-parchment">
            {expanded ? "▲ weniger" : "▼ mehr"}
          </button>
        )}
      </div>
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
  // Ereignisse eines Begleiters tragen seine uid – sonst geht es um den Boss
  const named = (add: string | undefined) =>
    (add && battle.adds?.find((a) => a.uid === add)?.combatant.name) || battle.enemy.name;
  const enemy = named("add" in e ? e.add : undefined);
  switch (e.type) {
    case "potion":
      return e.buff
        ? `Du trinkst ${getPotion(e.potionId).name}: ${potionEffectText(getPotion(e.potionId))}.`
        : `Du trinkst ${getPotion(e.potionId).name} und heilst ${e.heal} LP.`;
    case "thrown":
      return e.missed
        ? `${getPotion(e.potionId).name} platscht ins Wasser – ${enemy} ist abgetaucht.`
        : e.potionId === "blast"
          ? `Du wirfst eine ${getPotion(e.potionId).name} mitten unter die Gegner.`
          : `Du wirfst eine ${getPotion(e.potionId).name} auf ${enemy}.`;
    case "blast":
      return `💥 Die Explosion trifft ${enemy} für ${e.damage} Schaden${e.absorbed ? ` – der Schild schluckt ${e.absorbed}` : ""}.`;
    case "corroded":
      return `🫗 Die Säure frisst sich in die Rüstung von ${enemy}.`;
    case "smoked":
      return `💨 ${enemy} tappt im Rauch umher und trifft schlechter.`;
    case "hit":
      return e.attacker === "hero"
        ? `${e.crit ? "Kritischer Treffer! " : ""}Du triffst ${enemy} für ${e.damage} Schaden${e.matchup === "weak" ? " (Schwachpunkt!)" : e.matchup === "resist" ? " (resistent)" : ""}${e.shielded ? " – der Schildträger schützt ihn" : ""}${e.absorbed ? ` – der Schild schluckt ${e.absorbed}` : ""}${e.plated ? " – eine Panzerplatte fängt ab" : ""}${e.grazed ? " – in der Luft streifst du ihn nur" : ""}.`
        : `${e.crit ? "Kritischer Treffer! " : ""}${enemy} trifft dich für ${e.damage} Schaden.`;
    case "addHeal":
      return `${enemy} heilt ${battle.enemy.name} um ${e.heal} LP.`;
    case "enemyRegen":
      return `${enemy} regeneriert ${e.heal} LP.`;
    case "thorns":
      return `Deine Dornen treffen ${enemy} für ${e.damage} Schaden.`;
    case "secondWind":
      return `🕊️ Zweiter Atem! Du stehst mit ${e.heal} LP wieder auf.`;
    case "endured":
      return "🕊️ Unbeugsam! Du überlebst den tödlichen Treffer mit 1 LP.";
    case "immune":
      return `${enemy} ist immun gegen ${MATCHUP_LABELS[e.kind].name}.`;
    case "explosion":
      return e.blocked
        ? `${enemy} explodiert – dein Bollwerk fängt die Explosion ab.`
        : `${enemy} explodiert und trifft dich für ${e.damage} Schaden!`;
    case "bossPhase": {
      const phase = getBossPhase(e.bossId);
      return phase ? `${battle.enemy.name}: ${phase.icon} ${phase.name}! ${phase.description}` : `${battle.enemy.name} wird wütend!`;
    }
    case "defeated":
      return e.side === "hero" ? "Du wurdest besiegt." : e.add ? `${enemy} geht zu Boden.` : `${enemy} ist besiegt!`;
    case "fled":
      return e.goldLost > 0 ? `Du fliehst und verlierst ${e.goldLost} Gold.` : "Du fliehst.";
    case "ability":
      return e.echo
        ? `🔮 Echo! Du setzt ${getAbility(e.ability).name} ein – ohne Mana, und es hallt nach.`
        : `Du setzt ${getAbility(e.ability).name} ein (−${e.manaCost} Mana).`;
    case "dodged":
      return `👻 Du weichst dem Angriff von ${enemy} aus.`;
    case "selfHeal":
      return `Du heilst dich um ${e.heal} LP.`;
    case "cleansed":
      return "Du bist geläutert – Gift, Feuer und Bluten sind weg.";
    case "guarded":
      return `Du wehrst ${e.prevented} Schaden ab.`;
    case "counter":
      return `Dein Gegenschlag trifft ${enemy} für ${e.damage} Schaden.`;
    case "poison":
      if (e.burst) return `☠️ Fäulnis! Das Gift in ${enemy} platzt: ${e.damage} Schaden.`;
      return e.target === "enemy" ? `Gift fügt ${enemy} ${e.damage} Schaden zu.` : `Gift fügt dir ${e.damage} Schaden zu.`;
    case "bleed":
      if (e.burst) return `💥 Blutsturz! Die Wunde von ${enemy} platzt: ${e.damage} Schaden.`;
      return e.target === "enemy" ? `${enemy} blutet und erleidet ${e.damage} Schaden.` : `Du blutest und erleidest ${e.damage} Schaden.`;
    case "burn":
      return e.target === "enemy" ? `Feuer fügt ${enemy} ${e.damage} Schaden zu.` : `Feuer fügt dir ${e.damage} Schaden zu.`;
    case "stunned":
      return `${enemy} ist ${e.freeze ? "eingefroren" : "betäubt"} und kann nicht zurückschlagen.`;
    case "stunResisted":
      return `${enemy} ist noch immun gegen Betäubung.`;
    case "bossAbility":
      return `${enemy} setzt ${getBossAbilityById(e.abilityId)?.name ?? "einen Spezialangriff"} ein!`;
    case "blocked":
      return `Dein Bollwerk blockt den Angriff von ${enemy} komplett.`;
    case "drain":
      return `${enemy} heilt sich um ${e.heal} LP.`;
    case "manaBurn":
      return `${enemy} raubt dir ${e.amount} Mana.`;
    case "regen":
      return `Du regenerierst ${e.heal} LP.`;
    case "defend":
      return `Du wehrst ab${e.mana > 0 ? ` und sammelst ${e.mana} Mana` : ""}.`;
    case "reflected":
      return `Das offene Auge wirft deine Fähigkeit zurück – du erleidest ${e.damage} Schaden!`;
    case "charging":
      return `${enemy} lädt auf – Ansturm ${e.roundsLeft > 1 ? `in ${e.roundsLeft} Runden` : "nächste Runde"}!`;
    case "interrupted":
      return e.add ? `Du unterbrichst ${enemy}!` : `Du brichst den Ansturm von ${enemy} ab!`;
    case "staggered":
      return `${enemy} taumelt und kann nicht angreifen.`;
    case "bossShield":
      return `${enemy} hebt einen Schild über ${battle.enemy.name} (${e.shield} LP).`;
    case "drumming":
      return `${enemy} trommelt lauter (×${e.stacks}).`;
    case "ritual":
      return `${enemy} setzt sein Heilritual fort – Heilung in ${e.roundsLeft} ${e.roundsLeft === 1 ? "Runde" : "Runden"}.`;
    case "evaded":
      return `${enemy} ist abgetaucht – dein Angriff geht ins Leere.`;
    case "submerged":
      return `${enemy} taucht ab${e.extinguished ? " – das Wasser löscht das Feuer" : ""}.`;
    case "platesBroken":
      return `Die letzte Panzerplatte von ${enemy} fällt!`;
    case "platesRegrown":
      return `Die Panzerplatten von ${enemy} sind nachgewachsen.`;
    case "risen":
      return `Das Seelengefäss zerspringt – ${enemy} erhebt sich wieder (${e.heal} LP)!`;
    case "cursed":
      return `Ein Fluch legt sich auf dich – er zählt herunter …`;
    case "curseBroken":
      return e.cleansed ? "Du läuterst dich – der Fluch ist gebrochen." : `Du schwächst ${enemy} – der Fluch ist gebrochen.`;
    case "curseBurst":
      return `Der Fluch bricht los: ${e.damage} Schaden!`;
    case "static":
      return `${enemy} saugt die Kraft deiner Fähigkeit auf (${e.charges}).`;
    case "devoured":
      return `${enemy} verschlingt ${getAbility(e.ability).name}!`;
    case "stolen":
      return `${enemy} schlägt mit ${getAbility(e.ability).name} zu!`;
    case "freed":
      return `Du entreisst ${enemy} ${getAbility(e.ability).name}!`;
  }
}
