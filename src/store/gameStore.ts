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
import { rollLoot } from "../domain/loot";
import { buyPotion, getPotion, STARTER_POTIONS, type PotionStock } from "../domain/potions";
import {
  dungeonCost,
  refillBattlePoints,
  regenerateBattlePoints,
  regenSlot,
  spendBattlePoint,
  START_BATTLE_POINTS,
} from "../domain/battlePoints";
import { getDailyBonusQuests } from "../domain/bonusQuests";
import {
  EMPTY_RECORDS,
  evaluateAchievements,
  getFrame,
  unlockedTitles,
  type AchievementTiers,
  type Records,
} from "../domain/achievements";
import { detectHeroClass } from "../domain/heroClasses";
import { gearScore } from "../domain/gearScore";
import { advanceRecurring, firstDue, isValidRecurrence, type Recurrence } from "../domain/recurrence";
import { clampSkills, learnSkill, resetSkills, unlockAbility, type SkillWeapon } from "../domain/skills";
import type { AbilityId } from "../domain/abilities";
import { dateKey } from "../domain/calendar";
import { calculateReward } from "../domain/rewards";
import { allocatePoint, getLevel } from "../domain/leveling";
import { buyOffer, EMPTY_SHOP, rerollShop, rollShopStock, shopSlot, type ShopStock } from "../domain/shop";
import type {
  Category,
  Character,
  Effort,
  EquipSlot,
  Equipment,
  Loot,
  OwnedItem,
  Quest,
  Reward,
  StatKey,
} from "../domain/types";
import { EventBus } from "../game/EventBus";

export interface NewQuestInput {
  title: string;
  description?: string;
  effort: Effort;
  category: Category;
  dueDate?: string;
  /** Wiederkehrend – dann ist `dueDate` der erste Termin (wird hier berechnet) */
  recurrence?: Recurrence;
}

export interface Cosmetics {
  title: string | null;
  frame: string;
}
export const DEFAULT_COSMETICS: Cosmetics = { title: null, frame: "none" };

/** Einblendung: eine neue Stufe – oder eine Zusammenfassung, was rückwirkend freigeschaltet wurde. */
export type AchievementNotice = { id: string; tier: number } | { retroactive: number };

/** Wird von der UI für Belohnungs-/Level-up-Animationen genutzt. */
export interface RewardEvent {
  id: string;
  questTitle: string;
  bonus: boolean;
  reward: Reward;
  loot: Loot;
  levelBefore: number;
  levelAfter: number;
}

/** Kampfbelohnung samt Level vorher/nachher – für die Level-up-Anzeige im Siegbildschirm. */
export type BattleRewardEvent = BattleReward & { levelBefore: number; levelAfter: number };

interface GameState {
  character: Character;
  quests: Quest[];
  inventory: OwnedItem[];
  equipment: Equipment;
  lastReward: RewardEvent | null;

  addQuest: (input: NewQuestInput) => void;
  completeQuest: (id: string) => void;

  /** Heute erledigte Bonusquests. Gehört `date` nicht zu heute, ist noch keine erledigt. */
  bonusDone: BonusProgress;
  /** Schliesst eine der heutigen Bonusquests ab und trägt sie als erledigt ins Questlog ein. */
  completeBonusQuest: (bonusId: string) => void;
  deleteQuest: (id: string) => void;
  renameCharacter: (name: string) => void;
  /** Verteilt einen Level-up-Punkt auf ein Attribut. */
  allocatePoint: (stat: StatKey) => void;
  /** Schreibt die Gratis-Kampfpunkte (alle 6 Stunden einer) gut, falls welche fällig sind. */
  tickBattlePoints: () => void;
  /** Steigert einen Waffen-Skill um einen Rang (kostet einen Skillpunkt). */
  learnSkill: (weapon: SkillWeapon) => void;
  /** Schaltet die Fähigkeit eines gemeisterten Waffentyps frei (kostet einen Skillpunkt). */
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
  /** Betritt einen Dungeon: bezahlt alle Kampfpunkte und startet den ersten Kampf. */
  startDungeon: (dungeonId: string) => void;
  /** Nach einem Sieg: nächster Gegner, mit den übrig gebliebenen Lebenspunkten. */
  nextDungeonFight: () => void;
  /** Dungeon nach einem Sieg freiwillig verlassen – die Truhe mit der bisherigen Beute wird gutgeschrieben. */
  leaveDungeonWithChest: () => void;

  // Koop-Kampf (der Kampf selbst läuft in src/coop/coopStore.ts)
  /** Zahlt die Kampfpunkte für einen Koop-Kampf – wirft, wenn sie nicht reichen. */
  payCoop: (cost: number) => void;
  /** Erstattet Kampfpunkte, wenn ein Koop-Kampf abgebrochen wurde. */
  refundCoop: (cost: number) => void;
  /** Ein im Koop-Kampf getrunkener (oder verabreichter) Trank verlässt den Vorrat. */
  consumePotion: (potionId: string) => void;
  /** Schreibt die eigene Koop-Beute gut und gibt die Truhe für die Anzeige zurück. */
  grantCoopReward: (reward: BattleReward, bossId: string) => ClaimedChest;
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

export interface BonusProgress {
  date: string;
  ids: string[];
}

const NO_BONUS_DONE: BonusProgress = { date: "", ids: [] };

/** Schlüssel des Spielstands im localStorage (wird auch in die Cloud gespiegelt). */
export const SAVE_KEY = "questlog-save";

/** Der Teil des Zustands, der im localStorage gespeichert wird. */
type SaveState = Pick<
  GameState,
  | "character"
  | "quests"
  | "inventory"
  | "equipment"
  | "potions"
  | "bonusDone"
  | "shop"
  | "lastShopReroll"
  | "shopRerolls"
  | "bossCollection"
  | "coopStats"
  | "records"
  | "achievements"
  | "cosmetics"
>;

/** Neuer Held – die Gratis-Kampfpunkte zählen ab dem aktuellen 6-Stunden-Abschnitt. */
const createCharacter = (): Character => ({
  name: "Held",
  totalXp: 0,
  gold: 0,
  essence: 0,
  stats: { strength: 1, intellect: 1, endurance: 1, charisma: 1 },
  spentPoints: 0,
  battlePoints: START_BATTLE_POINTS,
  battlePointSlot: regenSlot(),
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
  return {
    ...saved,
    ...(character && { character }),
    quests: saved.quests ?? [],
    inventory: saved.inventory ?? [],
    equipment: { ...EMPTY_EQUIPMENT, ...saved.equipment },
    potions: saved.potions ?? STARTER_POTIONS,
    bonusDone: saved.bonusDone ?? NO_BONUS_DONE,
    shop: saved.shop ?? EMPTY_SHOP,
    lastShopReroll: saved.lastShopReroll ?? "",
    // Ältere Stände kannten nur einen Wurf pro Tag
    shopRerolls: saved.shopRerolls ?? (saved.lastShopReroll ? 1 : 0),
    bossCollection: saved.bossCollection ?? [],
    coopStats: saved.coopStats ?? EMPTY_COOP_STATS,
    records: { ...EMPTY_RECORDS, ...saved.records },
    achievements: saved.achievements ?? {},
    cosmetics: { ...DEFAULT_COSMETICS, ...saved.cosmetics },
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
// Für Supabase später: dieselben Aktionen beibehalten, aber `completeQuest`
// an eine Edge Function schicken, die `calculateReward` serverseitig ausführt.
export const useGameStore = create<GameState>()(
  persist(
    (set, get) => {
      /**
       * Schreibt die Belohnung einer Quest gut und markiert sie als erledigt.
       * Steht die Quest noch nicht im Questlog (Bonusquest), wird sie vorne eingefügt.
       */
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
        if (levels.levelAfter > levels.levelBefore) {
          EventBus.emit("character:levelup", { from: levels.levelBefore, to: levels.levelAfter });
        }
      };

      /**
       * `recurring`: Die Quest wiederholt sich – sie bleibt als `next` (neuer Termin,
       * neue Serie) stehen, unter „Erledigt“ kommt ein eigener Eintrag dazu.
       */
      const finishQuest = (quest: Quest, extra: Partial<GameState> = {}, recurring?: { next: Quest; streak: number }) => {
        const { quests, inventory } = get();
        const character = regenerateBattlePoints(get().character);
        const bonus = quest.bonus === true;
        const reward = calculateReward(quest.effort, quest.category, bonus, recurring?.streak ?? 0);
        const levelBefore = getLevel(character.totalXp);
        const totalXp = character.totalXp + reward.xp;
        const levelAfter = getLevel(totalXp);
        const loot = rollLoot(quest.effort, levelAfter, newId(), Math.random, bonus);
        const completedAt = new Date().toISOString();
        const completed: Quest = recurring
          ? {
              id: newId(),
              title: quest.title,
              description: quest.description,
              effort: quest.effort,
              category: quest.category,
              status: "done",
              createdAt: completedAt,
              completedAt,
              reward,
              recurringId: quest.id,
            }
          : { ...quest, status: "done", completedAt, reward };
        const known = quests.some((q) => q.id === quest.id);

        set({
          ...extra,
          quests: recurring
            ? [completed, ...quests.map((q) => (q.id === quest.id ? recurring.next : q))]
            : known
              ? quests.map((q) => (q.id === quest.id ? completed : q))
              : [completed, ...quests],
          character: refillBattlePoints(
            {
              ...character,
              totalXp,
              gold: character.gold + reward.gold,
              stats: {
                ...character.stats,
                [reward.stat]: character.stats[reward.stat] + reward.statPoints,
              },
            },
            reward.battlePoints ?? 0,
          ),
          inventory: loot ? [...inventory, loot] : inventory,
          lastReward: { id: newId(), questTitle: quest.title, bonus, reward, loot, levelBefore, levelAfter },
        });

        EventBus.emit("quest:completed", { quest: completed, reward, loot });
        if (levelAfter > levelBefore) {
          EventBus.emit("character:levelup", { from: levelBefore, to: levelAfter });
        }
      };

      return {
      character: createCharacter(),
      quests: [],
      inventory: starterInventory(),
      equipment: EMPTY_EQUIPMENT,
      potions: STARTER_POTIONS,
      bonusDone: NO_BONUS_DONE,
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
          { character: s.character, quests: s.quests, bossCollection: s.bossCollection, coopStats: s.coopStats, records, today: dateKey() },
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

      addQuest: (input) =>
        set((s) => {
          const recurrence = input.recurrence && isValidRecurrence(input.recurrence) ? input.recurrence : undefined;
          return {
            quests: [
              {
                id: newId(),
                title: input.title.trim(),
                description: input.description?.trim() || undefined,
                effort: input.effort,
                category: input.category,
                dueDate: recurrence ? firstDue(recurrence, dateKey()) : input.dueDate || undefined,
                status: "open",
                createdAt: new Date().toISOString(),
                ...(recurrence && { recurrence, streak: 0 }),
              },
              ...s.quests,
            ],
          };
        }),

      completeQuest: (id) => {
        const quest = get().quests.find((q) => q.id === id);
        if (!quest || quest.status === "done") return;
        if (quest.recurrence) {
          // Wiederkehrend: erst am Termin erledigbar, dann springt sie zum nächsten
          attempt(() => finishQuest(quest, {}, advanceRecurring(quest, dateKey())));
          return;
        }
        finishQuest(quest);
      },

      completeBonusQuest: (bonusId) => {
        const today = dateKey();
        const template = getDailyBonusQuests(today).find((q) => q.id === bonusId);
        const { bonusDone } = get();
        const doneToday = bonusDone.date === today ? bonusDone.ids : [];
        if (!template || doneToday.includes(bonusId)) return;
        finishQuest(
          {
            id: newId(),
            title: template.title,
            effort: template.effort,
            category: template.category,
            status: "open",
            createdAt: new Date().toISOString(),
            bonus: true,
          },
          {
            bonusDone: { date: today, ids: [...doneToday, bonusId] },
            // Alle Bonusquests des Tages erledigt
            ...(doneToday.length + 1 === getDailyBonusQuests(today).length && {
              records: { ...get().records, perfectBonusDays: get().records.perfectBonusDays + 1 },
            }),
          },
        );
      },

      deleteQuest: (id) => set((s) => ({ quests: s.quests.filter((q) => q.id !== id) })),

      renameCharacter: (name) =>
        set((s) => ({ character: { ...s.character, name: name.trim() || s.character.name } })),

      allocatePoint: (stat) => attempt(() => set((s) => ({ character: allocatePoint(s.character, stat) }))),

      learnSkill: (weapon) => attempt(() => set((s) => ({ character: learnSkill(s.character, weapon) }))),

      unlockAbility: (id) => attempt(() => set((s) => ({ character: unlockAbility(s.character, id) }))),

      resetSkills: () => attempt(() => set((s) => ({ character: resetSkills(s.character) }))),

      tickBattlePoints: () => {
        const { character } = get();
        const next = regenerateBattlePoints(character);
        if (next !== character) set({ character: next });
      },

      dismissReward: () => set({ lastReward: null }),

      resetGame: () =>
        set({
          character: createCharacter(),
          quests: [],
          inventory: starterInventory(),
          equipment: EMPTY_EQUIPMENT,
          potions: STARTER_POTIONS,
          bonusDone: NO_BONUS_DONE,
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
          const paid = spendBattlePoint(regenerateBattlePoints(character));
          const battle = startBattle(newId(), character.name, hero, creature);
          set({ battle, battleReward: null, character: paid, dungeon: null });
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
          const paid = spendBattlePoint(regenerateBattlePoints(character), dungeonCost(dungeon.creatures.length));
          const battle = startBattle(newId(), character.name, hero, dungeon.creatures[0]);
          set({
            battle,
            battleReward: null,
            character: paid,
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

      payCoop: (cost) => set((s) => ({ character: spendBattlePoint(regenerateBattlePoints(s.character), cost) })),

      refundCoop: (cost) => set((s) => ({ character: refillBattlePoints(s.character, cost) })),

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
      };
    },
    {
      name: SAVE_KEY,
      version: 13,
      partialize: (s) => ({
        character: s.character,
        quests: s.quests,
        inventory: s.inventory,
        equipment: s.equipment,
        potions: s.potions,
        bonusDone: s.bonusDone,
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
      migrate: (persisted, version) => {
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
        // v5 → v6: tägliche Bonusquests – noch keine erledigt.
        if (version < 6) {
          state = { ...state, bonusDone: NO_BONUS_DONE };
        }
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
        // v9 → v10: Kampfpunkte – Startvorrat dazu.
        if (version < 10) {
          state = { ...state, character: { ...state.character, battlePoints: START_BATTLE_POINTS } };
        }
        // v10 → v11: alle 6 Stunden ein Gratis-Kampfpunkt – ab jetzt gezählt.
        if (version < 11) {
          state = { ...state, character: { ...state.character, battlePointSlot: regenSlot() } };
        }
        // v11 → v12: Skilltree – Skillpunkte bisheriger Level-ups sind sofort verfügbar.
        if (version < 12) {
          state = { ...state, character: { ...state.character, skills: {} } };
        }
        // v12 → v13: Fähigkeiten müssen nach dem Meistern einer Waffe freigeschaltet werden.
        if (version < 13) {
          state = { ...state, character: { ...state.character, abilities: [] } };
        }
        return state;
      },
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
