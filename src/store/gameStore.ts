import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  EMPTY_EQUIPMENT,
  equipItem,
  getCombatStats,
  sellItem,
  unequipItem,
} from "../domain/equipment";
import {
  addToChest,
  attackRound,
  drinkPotion,
  EMPTY_CHEST,
  flee,
  fleeCost,
  getHeroCombatProfile,
  rollBattleReward,
  startBattle,
  type BattleReward,
  type BattleState,
  type DungeonChest,
} from "../domain/combat";
import { getCreature, getDungeon } from "../domain/creatures";
import { EMPTY_COOP_STATS, recordCoopWin, type CoopStats } from "../domain/coopCombat";
import { salvageItem, upgradeItem as forgeUpgrade } from "../domain/forge";
import { createItem, getItem, MAX_UPGRADE, migrateLegacyItemId, STARTER_ITEM_IDS } from "../domain/items";
import { buyPotion, getPotion, STARTER_POTIONS, type PotionStock } from "../domain/potions";
import {
  ACHIEVEMENTS,
  EMPTY_RECORDS,
  evaluateAchievements,
  getFrame,
  unlockedTitles,
  type AchievementTiers,
  type Records,
} from "../domain/achievements";
import { detectHeroClass } from "../domain/heroClasses";
import { gearScore } from "../domain/gearScore";
import {
  abandonQuest,
  acceptQuest,
  applyDailyEvent,
  applyQuestEvent,
  EMPTY_QUEST_LOG,
  getQuest,
  NO_DAILY_QUESTS,
  rollDailyQuests,
  rollQuestLoot,
  turnInDaily,
  turnInQuest,
  type DailyQuests,
  type QuestDef,
  type QuestEvent,
  type QuestLog,
} from "../domain/quests";
import { clampSkills, learnSkill, resetSkills, unlockAbility, type SkillWeapon } from "../domain/skills";
import type { AbilityId } from "../domain/abilities";
import { dateKey } from "../domain/calendar";
import { allocatePoint, getLevel, resetAttributes } from "../domain/leveling";
import { buyOffer, EMPTY_SHOP, rerollShop, rollShopStock, shopSlot, type ShopStock } from "../domain/shop";
import type { Character, EquipSlot, Equipment, Loot, OwnedItem, StatKey } from "../domain/types";
import { EventBus } from "../game/EventBus";

export interface Cosmetics {
  title: string | null;
  frame: string;
}
export const DEFAULT_COSMETICS: Cosmetics = { title: null, frame: "none" };

/** Einblendung: eine neue Stufe – oder eine Zusammenfassung, was rückwirkend freigeschaltet wurde. */
export type AchievementNotice = { id: string; tier: number } | { retroactive: number };

/** Abgegebene Quest – wird von der UI für Belohnungs-/Level-up-Animationen genutzt. */
export interface RewardEvent {
  id: string;
  questTitle: string;
  /** Tagesauftrag (sonst Quest aus dem Questbuch) */
  daily: boolean;
  xp: number;
  gold: number;
  loot: Loot;
  levelBefore: number;
  levelAfter: number;
}

/** Kampfbelohnung samt Level vorher/nachher – für die Level-up-Anzeige im Siegbildschirm. */
export type BattleRewardEvent = BattleReward & { levelBefore: number; levelAfter: number };

interface GameState {
  character: Character;
  inventory: OwnedItem[];
  equipment: Equipment;
  lastReward: RewardEvent | null;

  /** Questbuch: angenommene Quests mit Fortschritt und abgegebene Quests */
  questLog: QuestLog;
  acceptQuest: (id: string) => void;
  /** Bricht eine angenommene Quest ab – der Fortschritt geht verloren. */
  abandonQuest: (id: string) => void;
  /** Gibt eine erfüllte Quest ab (Questbuch oder Tagesauftrag) und schreibt die Belohnung gut. */
  turnInQuest: (id: string) => void;
  /** Tagesaufträge – gehört `date` nicht zu heute, sind sie veraltet. */
  dailyQuests: DailyQuests;
  /** Würfelt neue Tagesaufträge aus, sobald ein neuer Tag begonnen hat. */
  refreshDailyQuests: () => void;

  renameCharacter: (name: string) => void;
  /** Verteilt einen Level-up-Punkt auf ein Attribut. */
  allocatePoint: (stat: StatKey) => void;
  /** Alle Attributpunkte zurücksetzen – das erste Mal kostenlos, danach teuer. */
  resetAttributes: () => void;
  /** Steigert einen Waffen-Skill um einen Rang (kostet einen Skillpunkt). */
  learnSkill: (weapon: SkillWeapon) => void;
  /** Schaltet eine Fähigkeit frei – ab Rang 3 im Waffentyp (kostet Skillpunkte, siehe skills.ts). */
  unlockAbility: (id: AbilityId) => void;
  /** Setzt alle Skillpunkte gegen Gold zurück (siehe `skillResetCost`). */
  resetSkills: () => void;
  dismissReward: () => void;
  resetGame: () => void;

  /** Ohne `slot`: Rüstung in ihren Slot, Waffen in die erste freie Hand. */
  equip: (uid: string, slot?: EquipSlot) => void;
  unequip: (slot: EquipSlot) => void;
  /** Ware des Händlers; gehört sie nicht zum aktuellen 4-Stunden-Abschnitt, ist sie veraltet. */
  shop: ShopStock;
  /** Würfelt neue Ware aus, sobald ein neuer Abschnitt begonnen hat. */
  refreshShop: () => void;
  /** Datum ("yyyy-mm-dd") des letzten bezahlten Neuauswürfelns … */
  lastShopReroll: string;
  /** … und wie oft an diesem Tag schon ausgewürfelt wurde (höchstens SHOP_REROLLS_PER_DAY). */
  shopRerolls: number;
  rerollShop: () => void;
  buyOffer: (uid: string) => void;
  sell: (uid: string) => void;
  /** Zerlegt ein Item (ab selten) beim Schmied in Essenz. */
  salvage: (uid: string) => void;
  /** Verbessert ein Item (Inventar oder angelegt) beim Schmied um eine Stufe. */
  upgrade: (uid: string) => void;

  potions: PotionStock;
  buyPotion: (potionId: string) => void;

  /** IDs aller Boss-Items, die der Held je erbeutet hat – auch wenn sie inzwischen verkauft sind. */
  bossCollection: string[];

  /** Zähler für Erfolge (achievements.ts) */
  records: Records;
  /** Freigeschaltete Erfolgsstufen (Id → Stufe) */
  achievements: AchievementTiers;
  /** Gewählter Titel (Id des Erfolgs) und Avatar-Rahmen */
  cosmetics: Cosmetics;
  /** Neu freigeschaltete Stufen für die Einblendung (nicht gespeichert) */
  achievementQueue: AchievementNotice[];
  setTitle: (achievementId: string | null) => void;
  setFrame: (frameId: string) => void;
  dismissAchievement: () => void;
  /** Gleicht Zähler und Erfolge mit dem aktuellen Stand ab (läuft nach jeder Änderung). */
  syncAchievements: () => void;

  /** Laufender Kampf (wird nicht gespeichert – ein Neuladen bricht ihn ab). */
  battle: BattleState | null;
  /** Belohnung des zuletzt gewonnenen Kampfes. */
  battleReward: BattleRewardEvent | null;
  startBattle: (creatureId: string) => void;
  battleDrinkPotion: (potionId: string) => void;
  /** Angriff der Runde – ohne Argument normal, sonst mit der Fähigkeit dieses Waffentyps. */
  battleAttack: (ability?: AbilityId) => void;
  /** Flucht: kostet Gold (siehe `fleeCost`), beendet den Kampf ohne Gegenangriff. */
  battleFlee: () => void;
  leaveBattle: () => void;

  /** Laufender Dungeon (wird wie der Kampf nicht gespeichert). */
  dungeon: DungeonRun | null;
  /** Betritt einen Dungeon und startet den ersten Kampf. */
  startDungeon: (dungeonId: string) => void;
  /** Nach einem Sieg: nächster Gegner, mit den übrig gebliebenen Lebenspunkten. */
  nextDungeonFight: () => void;
  /** Dungeon nach einem Sieg freiwillig verlassen – die Truhe mit der bisherigen Beute wird gutgeschrieben. */
  leaveDungeonWithChest: () => void;

  // Koop-Kampf (der Kampf selbst läuft in src/coop/coopStore.ts)
  /** Ein im Koop-Kampf getrunkener (oder verabreichter) Trank verlässt den Vorrat. */
  consumePotion: (potionId: string) => void;
  /** Schreibt die eigene Koop-Beute gut und gibt die Truhe für die Anzeige zurück. */
  grantCoopReward: (reward: BattleReward, bossId: string) => ClaimedChest;
  /** Truhe eines Koop-Dungeons gutschreiben – `completed`: Endboss besiegt (zählt für Erfolge). */
  grantCoopDungeon: (chest: DungeonChest, dungeonId: string, completed: boolean) => ClaimedChest;
  /** Koop-Siege und besiegte Koop-Bosse (für Charakterbogen und Profil) */
  coopStats: CoopStats;
}

export interface DungeonRun {
  dungeonId: string;
  /** Index des aktuellen Gegners in `creatures` */
  stage: number;
  /** Gesammelte Beute – erst am Ende gutgeschrieben, bei einer Niederlage verloren. */
  chest: DungeonChest;
  /** Gutgeschriebene Truhe (Abschluss oder Verlassen) – die UI zeigt sie mit Animation. */
  claimed: ClaimedChest | null;
}

export type ClaimedChest = DungeonChest & {
  levelBefore: number;
  levelAfter: number;
  /** Endboss besiegt (sonst vorzeitig verlassen) */
  completed: boolean;
};

/** Schlüssel des Spielstands im localStorage (wird auch in die Cloud gespiegelt). */
export const SAVE_KEY = "questlog-save";

/** Der Teil des Zustands, der im localStorage gespeichert wird. */
type SaveState = Pick<
  GameState,
  | "character"
  | "questLog"
  | "dailyQuests"
  | "inventory"
  | "equipment"
  | "potions"
  | "shop"
  | "lastShopReroll"
  | "shopRerolls"
  | "bossCollection"
  | "coopStats"
  | "records"
  | "achievements"
  | "cosmetics"
>;

const createCharacter = (): Character => ({
  name: "Held",
  totalXp: 0,
  gold: 0,
  essence: 0,
  stats: { strength: 1, intellect: 1, endurance: 1, charisma: 1 },
  spentPoints: 0,
  skills: {},
  abilities: [],
});

const newId = () => crypto.randomUUID();

const starterInventory = (): OwnedItem[] =>
  STARTER_ITEM_IDS.map((itemId) => createItem(itemId, "common", newId()));

/** Items aus Spielständen vor v3 kannten noch keine Seltenheit. */
const upgradeItem = (item: Partial<OwnedItem> & Pick<OwnedItem, "uid" | "itemId">): OwnedItem => ({
  rarity: "common",
  bonuses: {},
  ...item,
});

/**
 * Ergänzt fehlende Felder eines geladenen Spielstands mit Standardwerten –
 * unabhängig von der gespeicherten Version. Schützt vor halb migrierten
 * Ständen (z. B. wenn die App während eines Updates neu geladen wurde und
 * die Versionsnummer schon neu war, die Migration aber noch fehlte).
 */
function repairSave(saved: Partial<SaveState>): Partial<SaveState> {
  const fresh = createCharacter();
  const character = saved.character && {
    ...fresh,
    ...saved.character,
    stats: { ...fresh.stats, ...saved.character.stats },
    // Ränge über dem aktuellen Maximum werden gekappt, die Punkte sind wieder frei.
    skills: clampSkills(saved.character.skills ?? {}),
  };
  // Erfolge, die es nicht mehr gibt (z. B. Serien der früheren To-dos), fallen weg – samt Titel.
  const achievements = Object.fromEntries(
    Object.entries(saved.achievements ?? {}).filter(([id]) => ACHIEVEMENTS.some((a) => a.id === id)),
  );
  const cosmetics = { ...DEFAULT_COSMETICS, ...saved.cosmetics };
  if (cosmetics.title !== null && !unlockedTitles(achievements).some((t) => t.id === cosmetics.title)) cosmetics.title = null;
  return {
    ...saved,
    ...(character && { character }),
    questLog: { ...EMPTY_QUEST_LOG, ...saved.questLog },
    dailyQuests: saved.dailyQuests ?? NO_DAILY_QUESTS,
    inventory: saved.inventory ?? [],
    equipment: { ...EMPTY_EQUIPMENT, ...saved.equipment },
    potions: saved.potions ?? STARTER_POTIONS,
    shop: saved.shop ?? EMPTY_SHOP,
    lastShopReroll: saved.lastShopReroll ?? "",
    // Ältere Stände kannten nur einen Wurf pro Tag
    shopRerolls: saved.shopRerolls ?? (saved.lastShopReroll ? 1 : 0),
    bossCollection: saved.bossCollection ?? [],
    coopStats: saved.coopStats ?? EMPTY_COOP_STATS,
    records: { ...EMPTY_RECORDS, ...saved.records },
    achievements,
    cosmetics,
  };
}

/** Legt erbeutete Tränke in den Vorrat. */
const addPotions = (stock: PotionStock, ...drops: (readonly [string, number])[]): PotionStock =>
  drops.reduce((acc, [id, count]) => ({ ...acc, [id]: (acc[id] ?? 0) + count }), stock);

/** Trägt Boss-Items in die Sammlung ein (jedes nur einmal). */
const addToCollection = (collection: string[], ...items: (OwnedItem | null)[]): string[] => {
  const ids = items.filter((i) => i !== null && getItem(i.itemId).bossId).map((i) => i!.itemId);
  const added = ids.filter((id, i) => !collection.includes(id) && ids.indexOf(id) === i);
  return added.length > 0 ? [...collection, ...added] : collection;
};

/** Bringt einen gespeicherten Spielstand einer älteren Version auf den aktuellen Stand. */
export function migrateSave(persisted: unknown, version: number): SaveState {
  let state = persisted as SaveState;
  // v1 → v2: Spielstände ohne Ausrüstung bekommen das Startpaket.
  if (version < 2) {
    state = { ...state, inventory: starterInventory(), equipment: EMPTY_EQUIPMENT };
  }
  // v2 → v3: vorhandene Items werden gewöhnlich, ohne Attributboni.
  if (version < 3) {
    state = {
      ...state,
      inventory: state.inventory.map(upgradeItem),
      equipment: Object.fromEntries(
        Object.entries(state.equipment).map(([slot, item]) => [slot, item && upgradeItem(item)]),
      ) as Equipment,
    };
  }
  // v3 → v4: neuer Katalog mit 3000 Items – alte Items auf vergleichbare neue umstellen.
  if (version < 4) {
    const convert = (item: OwnedItem | null): OwnedItem | null => {
      const itemId = item && migrateLegacyItemId(item.itemId);
      return item && itemId ? { ...item, itemId } : null;
    };
    state = {
      ...state,
      inventory: state.inventory.map(convert).filter((i) => i !== null),
      equipment: Object.fromEntries(
        Object.entries(state.equipment).map(([slot, item]) => [slot, convert(item)]),
      ) as Equipment,
    };
  }
  // v4 → v5: Tränke für das Kampfsystem – Startvorrat dazu.
  if (version < 5) {
    state = { ...state, potions: STARTER_POTIONS };
  }
  // v5 → v6: tägliche Bonusquests (entfallen mit v14)
  // v6 → v7: wechselnder Händler und frei verteilbare Level-up-Punkte.
  // Bisherige Level-ups werden nachträglich gutgeschrieben (noch nichts verteilt).
  if (version < 7) {
    state = { ...state, shop: EMPTY_SHOP, character: { ...state.character, spentPoints: 0 } };
  }
  // v7 → v8: Händlerware einmal pro Tag gegen Gold neu auswürfeln.
  if (version < 8) {
    state = { ...state, lastShopReroll: "" };
  }
  // v8 → v9: Boss-Sammlung – bereits vorhandene Boss-Items zählen als gefunden.
  if (version < 9) {
    state = {
      ...state,
      bossCollection: addToCollection([], ...state.inventory, ...Object.values(state.equipment)),
    };
  }
  // v9 → v11: Kampfpunkte (entfallen mit v14)
  // v11 → v12: Skilltree – Skillpunkte bisheriger Level-ups sind sofort verfügbar.
  if (version < 12) {
    state = { ...state, character: { ...state.character, skills: {} } };
  }
  // v12 → v13: Fähigkeiten müssen nach dem Meistern einer Waffe freigeschaltet werden.
  if (version < 13) {
    state = { ...state, character: { ...state.character, abilities: [] } };
  }
  // v13 → v14: To-dos, Bonusquests und Kampfpunkte entfallen – stattdessen Questbuch und Tagesaufträge.
  // Erledigte To-dos zählen weiter für „Questmeister“, erledigte Bonusquests für „Kopfgeldjäger“.
  if (version < 14) {
    const legacy = state as SaveState & { quests?: { status: string; bonus?: boolean }[]; bonusDone?: unknown };
    const { quests = [], bonusDone: _bonusDone, ...rest } = legacy;
    const oldCharacter = state.character as Character & { battlePoints?: number; battlePointSlot?: number };
    const { battlePoints: _points, battlePointSlot: _slot, ...character } = oldCharacter;
    const done = quests.filter((q) => q.status === "done");
    state = {
      ...rest,
      character,
      questLog: EMPTY_QUEST_LOG,
      dailyQuests: NO_DAILY_QUESTS,
      records: {
        ...EMPTY_RECORDS,
        ...rest.records,
        questsCompleted: done.length,
        dailyQuestsCompleted: done.filter((q) => q.bonus).length,
      },
    };
  }
  return state;
}

/**
 * Führt eine Domain-Aktion aus. Ungültige Aktionen (zu wenig Gold, Level zu
 * niedrig …) werden ignoriert – die UI deaktiviert solche Buttons ohnehin.
 */
function attempt(action: () => void) {
  try {
    action();
  } catch (e) {
    console.warn(e instanceof Error ? e.message : e);
  }
}

// Hinweis: Zustand wird vorerst im localStorage gespeichert.
// Für Supabase später: dieselben Aktionen beibehalten, aber `turnInQuest`
// an eine Edge Function schicken, die Fortschritt und Belohnung serverseitig prüft.
export const useGameStore = create<GameState>()(
  persist(
    (set, get) => {
      /** Ein Sieg oder ein abgeschlossener Dungeon bringt Questbuch und Tagesaufträge voran. */
      const questEvent = (event: QuestEvent) => {
        get().refreshDailyQuests(); // Aufträge von gestern zählen nicht mehr
        const { questLog, dailyQuests } = get();
        const nextLog = applyQuestEvent(questLog, event);
        const nextDaily = applyDailyEvent(dailyQuests, event);
        if (nextLog !== questLog || nextDaily !== dailyQuests) set({ questLog: nextLog, dailyQuests: nextDaily });
      };

      /** Schreibt die Belohnung einer abgegebenen Quest gut und zeigt sie an. */
      const grantQuestReward = (def: QuestDef, daily: boolean, extra: Partial<GameState>) => {
        const { character, inventory, bossCollection } = get();
        const levelBefore = getLevel(character.totalXp);
        const totalXp = character.totalXp + def.reward.xp;
        const levelAfter = getLevel(totalXp);
        const loot = rollQuestLoot(def.reward, levelAfter, newId());
        set({
          ...extra,
          character: { ...character, totalXp, gold: character.gold + def.reward.gold },
          inventory: loot ? [...inventory, loot] : inventory,
          bossCollection: addToCollection(bossCollection, loot),
          lastReward: {
            id: newId(),
            questTitle: def.title,
            daily,
            xp: def.reward.xp,
            gold: def.reward.gold,
            loot,
            levelBefore,
            levelAfter,
          },
        });
        EventBus.emit("quest:completed", { quest: def, loot });
        if (levelAfter > levelBefore) {
          EventBus.emit("character:levelup", { from: levelBefore, to: levelAfter });
        }
      };

      /**
       * Schreibt Kampfbeute gut: XP, Gold, Items (inkl. Boss-Sammlung) und Tränke.
       * Ein Level-up meldet der Aufrufer über den EventBus.
       */
      const grantRewards = (xp: number, gold: number, items: OwnedItem[], potionDrops: Record<string, number>) => {
        const { character, inventory, potions, bossCollection } = get();
        const levelBefore = getLevel(character.totalXp);
        const levelAfter = getLevel(character.totalXp + xp);
        set({
          character: { ...character, totalXp: character.totalXp + xp, gold: character.gold + gold },
          inventory: [...inventory, ...items],
          bossCollection: addToCollection(bossCollection, ...items),
          potions: addPotions(potions, ...Object.entries(potionDrops)),
        });
        return { levelBefore, levelAfter };
      };

      /** Schreibt die Dungeon-Truhe gut und merkt sie sich für die Truhen-Animation. */
      const claimChest = (completed: boolean) => {
        const { dungeon } = get();
        if (!dungeon || dungeon.claimed) return;
        const { chest } = dungeon;
        const levels = grantRewards(chest.xp, chest.gold, chest.items, chest.potions);
        const { records } = get();
        set({
          dungeon: { ...dungeon, claimed: { ...chest, ...levels, completed } },
          ...(completed &&
            !records.dungeonsCleared.includes(dungeon.dungeonId) && {
              records: { ...records, dungeonsCleared: [...records.dungeonsCleared, dungeon.dungeonId] },
            }),
        });
        if (completed) questEvent({ kind: "dungeon", dungeonId: dungeon.dungeonId });
        if (levels.levelAfter > levels.levelBefore) {
          EventBus.emit("character:levelup", { from: levels.levelBefore, to: levels.levelAfter });
        }
      };

      return {
      character: createCharacter(),
      questLog: EMPTY_QUEST_LOG,
      dailyQuests: NO_DAILY_QUESTS,
      inventory: starterInventory(),
      equipment: EMPTY_EQUIPMENT,
      potions: STARTER_POTIONS,
      shop: EMPTY_SHOP,
      lastShopReroll: "",
      shopRerolls: 0,
      bossCollection: [],
      coopStats: EMPTY_COOP_STATS,
      records: EMPTY_RECORDS,
      achievements: {},
      cosmetics: DEFAULT_COSMETICS,
      achievementQueue: [],
      battle: null,
      battleReward: null,
      dungeon: null,
      lastReward: null,

      setTitle: (achievementId) =>
        set((s) => {
          const allowed = achievementId === null || unlockedTitles(s.achievements).some((t) => t.id === achievementId);
          return allowed ? { cosmetics: { ...s.cosmetics, title: achievementId } } : {};
        }),
      setFrame: (frameId) =>
        set((s) => (getFrame(frameId).unlocked(s.achievements) ? { cosmetics: { ...s.cosmetics, frame: frameId } } : {})),
      dismissAchievement: () => set((s) => ({ achievementQueue: s.achievementQueue.slice(1) })),

      syncAchievements: () => {
        const s = get();
        // Abgeleitete Zähler: Klassen, legendäre und voll verbesserte Items, Goldrekord
        const owned = [...s.inventory, ...Object.values(s.equipment).filter((o) => o !== null)];
        const heroClass = detectHeroClass(s.equipment);
        const legendary = owned.filter((o) => o.rarity === "legendary").map((o) => o.uid);
        const maxed = owned.filter((o) => (o.upgrade ?? 0) >= MAX_UPGRADE).map((o) => o.uid);
        const r = s.records;
        const records: Records = {
          ...r,
          classesWorn: heroClass && !r.classesWorn.includes(heroClass) ? [...r.classesWorn, heroClass] : r.classesWorn,
          legendarySeen: legendary.some((u) => !r.legendarySeen.includes(u)) ? [...new Set([...r.legendarySeen, ...legendary])] : r.legendarySeen,
          maxedSeen: maxed.some((u) => !r.maxedSeen.includes(u)) ? [...new Set([...r.maxedSeen, ...maxed])] : r.maxedSeen,
          maxGold: Math.max(r.maxGold, s.character.gold),
          maxGearScore: Math.max(r.maxGearScore, gearScore(s.equipment)),
        };
        const changedRecords = Object.keys(records).some((k) => records[k as keyof Records] !== r[k as keyof Records]);
        const { tiers, unlocked } = evaluateAchievements(
          { character: s.character, questLog: s.questLog, bossCollection: s.bossCollection, coopStats: s.coopStats, records },
          s.achievements,
        );
        if (!changedRecords && unlocked.length === 0) return;
        // Erster Abgleich eines bestehenden Spielstands: rückwirkend Freigeschaltetes nur zusammengefasst zeigen
        const firstRun = Object.keys(s.achievements).length === 0 && unlocked.length > 3;
        set({
          records,
          achievements: tiers,
          achievementQueue: firstRun
            ? [...s.achievementQueue, { retroactive: unlocked.length }]
            : [...s.achievementQueue, ...unlocked],
        });
      },

      acceptQuest: (id) =>
        attempt(() => {
          const { questLog, character } = get();
          set({ questLog: acceptQuest(questLog, id, getLevel(character.totalXp)) });
        }),

      abandonQuest: (id) => set((s) => ({ questLog: abandonQuest(s.questLog, id) })),

      turnInQuest: (id) =>
        attempt(() => {
          const { questLog, dailyQuests, records } = get();
          const daily = dailyQuests.quests.find((q) => q.def.id === id);
          if (!daily) {
            grantQuestReward(getQuest(id), false, {
              questLog: turnInQuest(questLog, id),
              records: { ...records, questsCompleted: records.questsCompleted + 1 },
            });
            return;
          }
          if (dailyQuests.date !== dateKey()) throw new Error("Dieser Tagesauftrag ist abgelaufen.");
          const next = turnInDaily(dailyQuests, id);
          const perfect = next.quests.every((q) => q.turnedIn);
          grantQuestReward(daily.def, true, {
            dailyQuests: next,
            records: {
              ...records,
              questsCompleted: records.questsCompleted + 1,
              dailyQuestsCompleted: records.dailyQuestsCompleted + 1,
              perfectBonusDays: records.perfectBonusDays + (perfect ? 1 : 0),
            },
          });
        }),

      refreshDailyQuests: () => {
        const today = dateKey();
        const { dailyQuests, character } = get();
        if (dailyQuests.date !== today) set({ dailyQuests: rollDailyQuests(today, getLevel(character.totalXp)) });
      },

      renameCharacter: (name) =>
        set((s) => ({ character: { ...s.character, name: name.trim() || s.character.name } })),

      allocatePoint: (stat) => attempt(() => set((s) => ({ character: allocatePoint(s.character, stat) }))),

      resetAttributes: () => attempt(() => set((s) => ({ character: resetAttributes(s.character) }))),

      learnSkill: (weapon) => attempt(() => set((s) => ({ character: learnSkill(s.character, weapon) }))),

      unlockAbility: (id) => attempt(() => set((s) => ({ character: unlockAbility(s.character, id) }))),

      resetSkills: () => attempt(() => set((s) => ({ character: resetSkills(s.character) }))),

      dismissReward: () => set({ lastReward: null }),

      resetGame: () =>
        set({
          character: createCharacter(),
          questLog: EMPTY_QUEST_LOG,
          dailyQuests: NO_DAILY_QUESTS,
          inventory: starterInventory(),
          equipment: EMPTY_EQUIPMENT,
          potions: STARTER_POTIONS,
          shop: EMPTY_SHOP,
          lastShopReroll: "",
          shopRerolls: 0,
          bossCollection: [],
          coopStats: EMPTY_COOP_STATS,
          records: EMPTY_RECORDS,
          achievements: {},
          cosmetics: DEFAULT_COSMETICS,
          achievementQueue: [],
          battle: null,
          battleReward: null,
          dungeon: null,
          lastReward: null,
        }),

      equip: (uid, slot) =>
        attempt(() => {
          const { inventory, equipment, character } = get();
          const gear = equipItem({ inventory, equipment }, uid, getLevel(character.totalXp), slot);
          set(gear);
          EventBus.emit("equipment:changed", getCombatStats(gear.equipment));
        }),

      unequip: (slot) => {
        const { inventory, equipment } = get();
        const gear = unequipItem({ inventory, equipment }, slot);
        set(gear);
        EventBus.emit("equipment:changed", getCombatStats(gear.equipment));
      },

      refreshShop: () => {
        const slot = shopSlot();
        const { shop, character } = get();
        if (shop.slot !== slot) set({ shop: rollShopStock(slot, getLevel(character.totalXp), newId) });
      },

      rerollShop: () =>
        attempt(() => {
          const { character, lastShopReroll, shopRerolls } = get();
          const result = rerollShop(character.gold, getLevel(character.totalXp), lastShopReroll, shopRerolls, newId);
          set({
            shop: result.stock,
            lastShopReroll: result.lastReroll,
            shopRerolls: result.count,
            character: { ...character, gold: result.gold },
          });
        }),

      buyOffer: (uid) =>
        attempt(() => {
          const { inventory, equipment, character, shop } = get();
          if (shop.slot !== shopSlot()) throw new Error("Der Händler hat inzwischen neue Ware.");
          const result = buyOffer({ inventory, equipment }, character.gold, shop, uid, getLevel(character.totalXp));
          set({
            inventory: result.gear.inventory,
            shop: result.stock,
            character: { ...character, gold: result.gold },
          });
        }),

      sell: (uid) =>
        attempt(() => {
          const { inventory, equipment, character } = get();
          const result = sellItem({ inventory, equipment }, character.gold, uid);
          set({ inventory: result.gear.inventory, character: { ...character, gold: result.gold } });
        }),

      salvage: (uid) =>
        attempt(() => {
          const { inventory, equipment, character } = get();
          const result = salvageItem({ inventory, equipment }, character.essence, uid);
          set({ inventory: result.gear.inventory, character: { ...character, essence: result.essence } });
        }),

      upgrade: (uid) =>
        attempt(() => {
          const { inventory, equipment, character } = get();
          const result = forgeUpgrade({ inventory, equipment }, character.essence, uid);
          set({
            inventory: result.gear.inventory,
            equipment: result.gear.equipment,
            character: { ...character, essence: result.essence },
          });
        }),

      buyPotion: (potionId) =>
        attempt(() => {
          const { potions, character } = get();
          const result = buyPotion(potions, character.gold, potionId);
          set({ potions: result.stock, character: { ...character, gold: result.gold } });
        }),

      startBattle: (creatureId) =>
        attempt(() => {
          const { character, equipment } = get();
          const { creature, area } = getCreature(creatureId);
          const hero = getHeroCombatProfile(character, equipment);
          if (hero.level < area.minLevel) throw new Error(`${area.name} ist erst ab Level ${area.minLevel} zugänglich.`);
          if (area.dungeon) throw new Error("Dungeon-Gegner kämpfen nur im Dungeon.");
          const battle = startBattle(newId(), character.name, hero, creature);
          set({ battle, battleReward: null, dungeon: null });
          EventBus.emit("battle:started", { battle });
        }),

      startDungeon: (dungeonId) =>
        attempt(() => {
          const { character, equipment } = get();
          const dungeon = getDungeon(dungeonId);
          const hero = getHeroCombatProfile(character, equipment);
          if (hero.level < dungeon.minLevel) {
            throw new Error(`${dungeon.name} ist erst ab Level ${dungeon.minLevel} zugänglich.`);
          }
          const battle = startBattle(newId(), character.name, hero, dungeon.creatures[0]);
          set({
            battle,
            battleReward: null,
            dungeon: { dungeonId, stage: 0, chest: EMPTY_CHEST, claimed: null },
          });
          EventBus.emit("battle:started", { battle });
        }),

      nextDungeonFight: () =>
        attempt(() => {
          const { character, equipment, battle, dungeon } = get();
          if (!dungeon || !battle || battle.status !== "won") throw new Error("Kein Dungeon-Kampf gewonnen.");
          const { creatures } = getDungeon(dungeon.dungeonId);
          const stage = dungeon.stage + 1;
          if (stage >= creatures.length) throw new Error("Der Dungeon ist schon abgeschlossen.");
          // Keine Heilung zwischen den Kämpfen: die Lebenspunkte werden mitgenommen.
          const hero = getHeroCombatProfile(character, equipment);
          const next = startBattle(newId(), character.name, hero, creatures[stage], battle.hero.hp);
          set({ battle: next, battleReward: null, dungeon: { ...dungeon, stage } });
          EventBus.emit("battle:started", { battle: next });
        }),

      leaveDungeonWithChest: () =>
        attempt(() => {
          const { battle, dungeon } = get();
          if (!dungeon || !battle || battle.status !== "won") throw new Error("Nur nach einem Sieg möglich.");
          claimChest(false);
        }),

      battleDrinkPotion: (potionId) =>
        attempt(() => {
          const { battle, potions } = get();
          if (!battle) return;
          if ((potions[potionId] ?? 0) <= 0) throw new Error("Keine Tränke dieser Sorte mehr.");
          const result = drinkPotion(battle, getPotion(potionId));
          set({ battle: result.state, potions: { ...potions, [potionId]: potions[potionId] - 1 } });
          EventBus.emit("battle:events", { battle: result.state, events: result.events });
        }),

      battleAttack: (ability) =>
        attempt(() => {
          const { battle, character, equipment, dungeon } = get();
          if (!battle) return;
          const result = attackRound(battle, Math.random, ability);
          set({ battle: result.state, battleReward: null });
          EventBus.emit("battle:events", { battle: result.state, events: result.events });
          if (result.state.status !== "won") return;

          const { creature } = getCreature(battle.creatureId);
          const { records } = get();
          set({
            records: {
              ...records,
              battlesWon: records.battlesWon + 1,
              bossesDefeated:
                creature.boss && !records.bossesDefeated.includes(creature.id)
                  ? [...records.bossesDefeated, creature.id]
                  : records.bossesDefeated,
              closeCall: records.closeCall || result.state.hero.hp < result.state.hero.maxHp * 0.05,
            },
          });
          questEvent({ kind: "kill", creatureId: creature.id });
          const reward = rollBattleReward(creature, getHeroCombatProfile(character, equipment), newId());
          if (dungeon) {
            // Im Dungeon kommt die Beute in die Truhe – gutgeschrieben wird erst am Ende.
            const level = getLevel(character.totalXp);
            set({
              battleReward: { ...reward, levelBefore: level, levelAfter: level },
              dungeon: { ...dungeon, chest: addToChest(dungeon.chest, reward) },
            });
            if (dungeon.stage === getDungeon(dungeon.dungeonId).creatures.length - 1) claimChest(true);
            return;
          }
          const potionDrops: Record<string, number> = {};
          if (reward.potions) potionDrops[reward.potions.potionId] = reward.potions.count;
          if (reward.buffPotion) potionDrops[reward.buffPotion] = (potionDrops[reward.buffPotion] ?? 0) + 1;
          const items = [reward.loot, reward.bossLoot].filter((i) => i !== null);
          const levels = grantRewards(reward.xp, reward.gold, items, potionDrops);
          set({ battleReward: { ...reward, ...levels } });
          if (levels.levelAfter > levels.levelBefore) {
            EventBus.emit("character:levelup", { from: levels.levelBefore, to: levels.levelAfter });
          }
        }),

      battleFlee: () =>
        attempt(() => {
          const { battle, character } = get();
          if (!battle) return;
          const goldLost = fleeCost(getCreature(battle.creatureId).creature, character.gold);
          const result = flee(battle, goldLost);
          set({ battle: result.state, character: { ...character, gold: character.gold - goldLost } });
          EventBus.emit("battle:events", { battle: result.state, events: result.events });
          // Flucht ist kein Scheitern: Die Truhe mit der Beute der gewonnenen Kämpfe bleibt.
          claimChest(false);
        }),

      leaveBattle: () => set({ battle: null, battleReward: null, dungeon: null }),

      consumePotion: (potionId) =>
        set((s) => ({ potions: { ...s.potions, [potionId]: Math.max(0, (s.potions[potionId] ?? 0) - 1) } })),

      grantCoopReward: (reward, bossId) => {
        const chest = addToChest(EMPTY_CHEST, reward);
        const levels = grantRewards(chest.xp, chest.gold, chest.items, chest.potions);
        set((s) => ({ coopStats: recordCoopWin(s.coopStats, bossId) }));
        if (levels.levelAfter > levels.levelBefore) {
          EventBus.emit("character:levelup", { from: levels.levelBefore, to: levels.levelAfter });
        }
        return { ...chest, ...levels, completed: true };
      },

      grantCoopDungeon: (chest, dungeonId, completed) => {
        const levels = grantRewards(chest.xp, chest.gold, chest.items, chest.potions);
        if (completed) {
          // Zählt wie ein Solo-Dungeon (Dungeonläufer, besiegter Boss) und als Koop-Sieg –
          // aber nicht für „Raidbezwinger“, der nur die Raid-Bosse zählt.
          const { creatures } = getDungeon(dungeonId);
          const bossId = creatures[creatures.length - 1].id;
          set((s) => ({
            coopStats: { ...s.coopStats, wins: s.coopStats.wins + 1 },
            records: {
              ...s.records,
              dungeonsCleared: s.records.dungeonsCleared.includes(dungeonId) ? s.records.dungeonsCleared : [...s.records.dungeonsCleared, dungeonId],
              bossesDefeated: s.records.bossesDefeated.includes(bossId) ? s.records.bossesDefeated : [...s.records.bossesDefeated, bossId],
            },
          }));
          questEvent({ kind: "dungeon", dungeonId });
        }
        if (levels.levelAfter > levels.levelBefore) {
          EventBus.emit("character:levelup", { from: levels.levelBefore, to: levels.levelAfter });
        }
        return { ...chest, ...levels, completed };
      },
      };
    },
    {
      name: SAVE_KEY,
      version: 14,
      partialize: (s) => ({
        character: s.character,
        questLog: s.questLog,
        dailyQuests: s.dailyQuests,
        inventory: s.inventory,
        equipment: s.equipment,
        potions: s.potions,
        shop: s.shop,
        lastShopReroll: s.lastShopReroll,
        shopRerolls: s.shopRerolls,
        bossCollection: s.bossCollection,
        coopStats: s.coopStats,
        records: s.records,
        achievements: s.achievements,
        cosmetics: s.cosmetics,
      }),
      // Nach der Migration: fehlende Felder immer ergänzen (siehe repairSave).
      merge: (persisted, current) => ({ ...current, ...repairSave(persisted as Partial<SaveState>) }),
      migrate: migrateSave,
    },
  ),
);

// Erfolge: nach jeder Änderung (auch nach dem Laden des Spielstands) abgleichen.
let syncing = false;
useGameStore.subscribe(() => {
  if (syncing) return;
  syncing = true;
  try {
    useGameStore.getState().syncAchievements();
  } finally {
    syncing = false;
  }
});
