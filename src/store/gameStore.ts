import { DEFAULT_LOOKS, sanitizeLooks, type HeroLooks } from "../domain/looks";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  EMPTY_EQUIPMENT,
  equipItem,
  getArmorClassSummary,
  getCombatStats,
  sellCommonItems,
  sellItem,
  unequipItem,
} from "../domain/equipment";
import {
  addToChest,
  attackRound,
  defeatedAdds,
  drinkPotion,
  EMPTY_CHEST,
  flee,
  fleeCost,
  getHeroCombatProfile,
  rollBattleReward,
  setTarget,
  startBattle,
  type BattleReward,
  type BattleState,
  type DungeonChest,
  type HeroAction,
} from "../domain/combat";
import { formatRespawn, getCreature, getDungeon, respawnLeft, startRespawn, type AreaDef, type BossRespawns, type CreatureDef } from "../domain/creatures";
import { rollElite, type EliteAffix } from "../domain/elites";
import { getAreaMimic, rollAreaChest, type AreaChest } from "../domain/areaChests";
import { packReward, rollPack } from "../domain/packs";
import { getRare, rareCreature, rareReward, rollRare } from "../domain/rares";
import {
  chestReward,
  eliteRoomAffixes,
  forkDoors,
  getMimic,
  getRiddle,
  isCalm,
  isMimic,
  isMimicChest,
  mainArmorClass,
  merchantOffers,
  mimicReward,
  pickRiddle,
  pickTrap,
  RIDDLE_DAMAGE,
  sceneTestOutcome,
  sectionOf,
  shrineOffer,
  stepCreature,
  stepKind,
  trapOutcome,
  type ChestChoice,
  type Door,
  type MerchantOffer,
  type RoomKind,
  type TrapChoice,
} from "../domain/dungeonPaths";
import {
  BLESSING,
  blessedProfile,
  blessingOffer,
  EMPTY_TOWER_RECORD,
  floorCreature,
  floorElite,
  towerReward,
  isBlessingFloor,
  recordFloor,
  stacks,
  TOWER_MIN_LEVEL,
  type BlessingId,
  type TowerRecord,
} from "../domain/tower";
import { EMPTY_COOP_STATS, recordCoopWin, type CoopStats } from "../domain/coopCombat";
import { forgeItem, salvageItem, upgradeItem as forgeUpgrade, type ForgeTarget } from "../domain/forge";
import { createItem, ensureItemExtras, getItem, MAX_UPGRADE, weaponAbilities, migrateLegacyItemId, rescaleBonuses, STARTER_ITEM_IDS } from "../domain/items";
import { buyPotion, getPotion, STARTER_POTIONS, type PotionStock } from "../domain/potions";
import { eatMeal, withMeal } from "../domain/food";
import { rollDrop } from "../domain/loot";
import { totalXpForLevel } from "../domain/leveling";
import {
  acceptVisitor,
  applyVisitorEvent,
  completeStoryScene,
  dismissWanderer,
  EMPTY_VISITORS,
  getSceneOption,
  refreshVisitors,
  storySceneFor,
  turnInStory,
  turnInWanderer,
  foundQuestItems,
  type QuestItemFind,
  type VisitorGift,
  type VisitorKind,
  type VisitorState,
} from "../domain/visitors";
import {
  applyMissionXp,
  dismissCompanion,
  EMPTY_MISSION_BOARD,
  EMPTY_RECRUIT_POOL,
  equipBest,
  equipCompanion,
  isBusy,
  isMissionDone,
  migrateActiveMission,
  missionBaseLevel,
  recruit,
  rerollRecruits,
  rollMissionBoard,
  rollRecruitPool,
  startMission,
  unequipCompanion,
  type ActiveMission,
  type Companion,
  type MissionBoard,
  type MissionOutcome,
  type RecruitPool,
} from "../domain/companions";
import { heroicAffixes, isHeroicUnlocked, makeHeroic } from "../domain/heroic";
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
  applyBoardEvent,
  applyQuestEvent,
  EMPTY_QUEST_LOG,
  getQuest,
  EMPTY_BOARD,
  openBounty,
  rollDailyQuests,
  rollWeeklyQuests,
  rollQuestLoot,
  turnInBoardQuest,
  turnInQuest,
  visibleBoard,
  type QuestBoard,
  type QuestSource,
  type TradeAction,
  type QuestDef,
  type QuestEvent,
  type QuestLog,
} from "../domain/quests";
import { learnSkill, resetSkills, sanitizeSkills, type SkillId } from "../domain/skills";
import { dateKey, weekKey } from "../domain/calendar";
import { allocatePoint, convertLinearCurveXp, getLevel, resetAttributes } from "../domain/leveling";
import { buyOffer, EMPTY_SHOP, rerollShop, rollShopStock, shopSlot, type ShopStock } from "../domain/shop";
import {
  addMaterials,
  build,
  DUNGEON_MATERIAL_FACTOR,
  EMPTY_VILLAGE,
  statueXp,
  MERCHANT_RULES,
  potionPower,
  scaleMaterials,
  SMITH_RULES,
  type BuildingId,
  type MaterialId,
  type MaterialStock,
  type Village,
} from "../domain/village";
import {
  defendRaid,
  EMPTY_RAIDS,
  effectiveVillage,
  failRaid,
  raidBounty,
  raidLineup,
  refreshRaids,
  repair,
  repairedByBuild,
  type RaidFight,
  type RaidReport,
  type RaidState,
} from "../domain/raids";
import { applyTrade } from "../domain/trade";
import { rollTreasure, rollTreasureMap, treasureStep, type TreasureFind, type TreasureMap } from "../domain/treasureMaps";
import type { Character, EquipSlot, Equipment, Loot, OwnedItem, Rarity, StatKey } from "../domain/types";
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
  /** Questbuch, Tages- oder Wochenauftrag */
  source: QuestSource;
  xp: number;
  gold: number;
  loot: Loot;
  levelBefore: number;
  levelAfter: number;
}

/** Ergebnis beim Abgeben bei einem Besucher – für das Gespräch. */
export interface VisitorOutcome {
  title: string;
  /** Was der Besucher sagt */
  text: string;
  xp: number;
  gold: number;
  gift: VisitorGift | null;
  /** Item aus dem Geschenk (Unikat oder Beute) */
  item: OwnedItem | null;
  finished: boolean;
  /** Das geschenkte Rezept kannte man schon – dafür gab es mehr EP */
  recipeKnown: boolean;
}

/** Kampfbelohnung samt Level vorher/nachher – für die Level-up-Anzeige im Siegbildschirm. */
export type BattleRewardEvent = BattleReward & {
  levelBefore: number;
  levelAfter: number;
  /** Quest-Gegenstände für Besucher, die in diesem Kampf gefallen sind */
  questItems?: QuestItemFind[];
  /** Gefundene Schatzkarte (treasureMaps.ts) */
  treasureMap?: TreasureMap;
  /** Besiegter seltener Gegner (rares.ts) – `first`: neu in der Sammlung */
  rare?: { id: string; first: boolean };
};

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
  dailyQuests: QuestBoard;
  /** Wochenaufträge – `date` ist der Montag der Woche. */
  weeklyQuests: QuestBoard;
  /** Würfelt neue Tages- bzw. Wochenaufträge aus, sobald ein neuer Tag bzw. eine neue Woche begonnen hat. */
  refreshQuestBoards: () => void;

  renameCharacter: (name: string) => void;
  /** Aussehen aus der Charaktererstellung ändern */
  setLooks: (looks: HeroLooks) => void;
  /** Verteilt einen Level-up-Punkt auf ein Attribut. */
  allocatePoint: (stat: StatKey) => void;
  /** Alle Attributpunkte zurücksetzen – das erste Mal kostenlos, danach teuer. */
  resetAttributes: () => void;
  /** Steigert einen Waffen-Skill um einen Rang (kostet einen Skillpunkt). */
  learnSkill: (id: SkillId) => void;
  /** Setzt alle Skillpunkte gegen Gold zurück (siehe `skillResetCost`) – braucht den Trainingsplatz. */
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
  /** Verkauft alle gewöhnlichen, nicht verbesserten Items im Inventar auf einmal. */
  sellCommon: () => void;
  /** Zerlegt ein Item (ab selten) beim Schmied in Essenz. */
  salvage: (uid: string) => void;
  /** Verbessert ein Item (Inventar oder angelegt) beim Schmied um eine Stufe. */
  upgrade: (uid: string) => void;
  /** Schmiedet ein neues Item auf Heldenlevel und gibt es zurück (null, wenn es nicht geklappt hat). */
  forge: (target: ForgeTarget, rarity: Rarity) => OwnedItem | null;

  potions: PotionStock;
  buyPotion: (potionId: string) => void;

  /** Gegessenes Gericht aus der Taverne (food.ts) – wirkt beim nächsten Kampf, Dungeon, Turm-Lauf oder Koop-Kampf */
  meal: string | null;
  /** Gericht, das im laufenden Kampf, Dungeon oder Turm-Lauf wirkt (wird nicht gespeichert) */
  mealInUse: string | null;
  /** Isst ein Gericht in der Taverne – nur, wenn man nicht mehr satt ist. */
  eat: (foodId: string) => void;
  /** Gericht, das im laufenden Koop-Kampf wirkt – nur für die Anzeige (wird nicht gespeichert) */
  coopMeal: string | null;
  /** Ein Koop-Kampf hat begonnen: das Gericht ist aufgegessen (der Server hat es schon eingerechnet). */
  finishMealInCoop: () => void;

  /** Besucher im Dorf (visitors.ts) */
  visitors: VisitorState;
  /** Lässt Besucher kommen und gehen – beim Öffnen des Dorfs und regelmässig. */
  refreshVisitors: () => void;
  acceptVisitor: (who: VisitorKind) => void;
  /** Schickt den Durchreisenden weg (der feste Besucher wartet einfach weiter). */
  dismissWanderer: () => void;
  /** Gibt beim Besucher ab – im letzten Kapitel mit Entscheidung braucht es `choiceId` (beim Dungeon-Besucher zählt die Szene). */
  turnInVisitor: (who: VisitorKind, choiceId?: string) => VisitorOutcome | null;

  /** Ausbaustufen der Gebäude im Dorf (village.ts) */
  village: Village;
  /** Baumaterial aus Kämpfen */
  materials: MaterialStock;
  /** Baut die nächste Stufe eines Gebäudes – sofort, gegen Gold und Material. */
  build: (id: BuildingId) => void;

  /** Überfälle aufs Dorf (raids.ts) – angekündigte Bande, beschädigte Gebäude, letzter Bericht */
  raids: RaidState;
  /** Lässt Banden kommen und angreifen – regelmässig, auch während man woanders ist. */
  refreshRaids: () => void;
  /** Laufende Verteidigung des Dorfs (wird wie der Kampf nicht gespeichert) */
  raid: RaidRun | null;
  /** Stellt sich der angekündigten Bande: erste Welle. */
  startRaid: () => void;
  /** Nach einem Sieg: nächste Welle bzw. der Anführer, mit den übrigen Lebenspunkten. */
  nextRaidWave: () => void;
  /** Repariert ein beschädigtes Gebäude gegen Gold und Material. */
  repairBuilding: (id: BuildingId) => void;
  /** Der Bericht des letzten Überfalls ist gelesen. */
  dismissRaidReport: () => void;

  /** Begleiter aus der Taverne (companions.ts) */
  companions: Companion[];
  /** Kandidaten des Tages in der Taverne */
  recruitPool: RecruitPool;
  /** Missionstafel des Tages */
  missionBoard: MissionBoard;
  /** Laufende Missionen – das Ergebnis steht schon fest */
  activeMissions: ActiveMission[];

  /** Item-Tausch: uids im eigenen Angebot eines offenen Tauschs – nicht verkaufen, zerlegen, verbessern, anlegen (nicht gespeichert) */
  tradeLocked: string[];
  setTradeLocked: (uids: string[]) => void;
  /** Schon ausgeführte Tausche (Ids) – keiner wird doppelt ausgeführt */
  appliedTrades: string[];
  /** Führt einen abgeschlossenen Tausch am Inventar aus. false = war schon ausgeführt. */
  applyCompletedTrade: (id: string, give: OwnedItem[], receive: OwnedItem[]) => boolean;
  /** Entfernt weggetauschte Items (Inventar, Ausrüstung, Begleiter) – gibt zurück, wie viele es waren. */
  removeTradedItems: (uids: string[]) => number;
  /** Würfelt Kandidaten und Missionstafel neu aus, sobald ein neuer Tag begonnen hat (nur mit Taverne). */
  refreshTavern: () => void;
  recruitCompanion: (id: string) => void;
  /** Kandidaten einmal am Tag gegen Gold neu würfeln */
  rerollRecruits: () => void;
  /** Entlässt einen Begleiter – seine Items kommen zurück ins Inventar. */
  dismissCompanion: (id: string) => void;
  /** Legt einem Begleiter ein Item aus dem Inventar an. */
  companionEquip: (companionId: string, uid: string, slot?: EquipSlot) => void;
  companionUnequip: (companionId: string, slot: EquipSlot) => void;
  /** „Bestes anlegen“ aus Inventar und bisheriger Ausrüstung */
  companionEquipBest: (companionId: string) => void;
  startMission: (missionId: string, companionIds: string[]) => void;
  /** Bricht eine laufende Mission ab – ohne Beute. */
  cancelMission: (missionId: string) => void;
  /** Holt das Ergebnis einer fertigen Mission ab und gibt es für die Anzeige zurück. */
  claimMission: (missionId: string) => MissionOutcome | null;

  /** IDs aller Boss-Items, die der Held je erbeutet hat – auch wenn sie inzwischen verkauft sind. */
  bossCollection: string[];
  /** Wann besiegte Gebietsbosse wieder erscheinen (siehe AREA_BOSS_RESPAWN_MS) */
  bossRespawns: BossRespawns;

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
  /** Startet einen Kampf im Gebiet – `heroic`: ein besiegter Boss auf heroischer Stufe (heroic.ts). */
  startBattle: (creatureId: string, heroic?: boolean) => void;
  battleDrinkPotion: (potionId: string) => void;
  /** Angriff der Runde – ohne Argument normal, sonst mit der Fähigkeit dieses Waffentyps. */
  /** Angriff, Fähigkeit oder Abwehren (DEFEND) */
  battleAttack: (action?: HeroAction) => void;
  /** Wählt das Ziel: einen Begleiter (uid) oder den Boss (undefined). */
  battleTarget: (target: string | undefined) => void;
  /** Flucht: kostet Gold (siehe `fleeCost`), beendet den Kampf ohne Gegenangriff. */
  battleFlee: () => void;
  leaveBattle: () => void;
  /** Alte Truhe nach einem normalen Sieg (areaChests.ts) – wird wie der Kampf nicht gespeichert. */
  areaChest: AreaChest | null;
  /** Truhe nach einem normalen Sieg: öffnen (vielleicht ein Mimic) oder liegen lassen */
  openAreaChest: (choice: ChestChoice) => void;

  /** Laufender Dungeon (wird wie der Kampf nicht gespeichert). */
  dungeon: DungeonRun | null;
  /** Schatzkarten: je ein verborgener Raum in einem Solo-Dungeon (treasureMaps.ts) */
  treasureMaps: TreasureMap[];
  /** Betritt einen Dungeon und startet den ersten Kampf. */
  startDungeon: (dungeonId: string, heroic?: boolean) => void;
  /** Nach einem Sieg oder Raum: Zwischen- bzw. Endboss, mit den übrigen Lebenspunkten (nicht an einer Gabelung). */
  nextDungeonFight: () => void;
  /** An einer Gabelung: durch die Tür `index` gehen – Kampf oder Raum ohne Kampf. */
  chooseDungeonDoor: (index: number) => void;
  /** Schrein: einen der Segen wählen */
  dungeonBlessing: (id: BlessingId) => void;
  /** Händler: Angebot `index` mit eigenem Gold kaufen */
  dungeonBuy: (index: number) => void;
  /** Falle: ausweichen oder einstecken */
  dungeonTrap: (choice: TrapChoice) => void;
  /** Rätsel: eine der Antworten wählen */
  dungeonRiddle: (answer: string) => void;
  /** Truhe: öffnen (vielleicht ein Mimic) oder liegen lassen */
  dungeonChest: (choice: ChestChoice) => void;
  /** Geschichtstür eines Dungeon-Besuchers: eine Wahl in der Szene treffen */
  dungeonStoryChoice: (optionId: string) => void;
  /** Koop-Dungeon: Kauf beim Händler mit eigenem Gold bezahlen, Tränke kommen in den Vorrat (die Wirkung rechnet der Server) */
  payDungeonMerchant: (offer: MerchantOffer) => void;
  /** Dungeon nach einem Sieg freiwillig verlassen – die Truhe mit der bisherigen Beute wird gutgeschrieben. */
  leaveDungeonWithChest: () => void;

  /** Endlos-Turm: laufender Lauf (wird wie der Kampf nicht gespeichert) */
  tower: TowerRun | null;
  /** Bestes Stockwerk aller Zeiten und dieser Woche (gespeichert, im öffentlichen Profil) */
  towerRecord: TowerRecord;
  /** Betritt den Turm: Stockwerk 1 */
  startTower: () => void;
  /** Nach einem Sieg (und gewähltem Segen): nächstes Stockwerk mit den übrigen Lebenspunkten */
  nextTowerFloor: () => void;
  /** Wählt einen der angebotenen Segen */
  chooseBlessing: (id: BlessingId) => void;
  /** Turm nach einem Sieg verlassen – die Truhe wird gutgeschrieben */
  leaveTowerWithChest: () => void;

  // Koop-Kampf (der Kampf selbst läuft in src/coop/coopStore.ts)
  /** Ein im Koop-Kampf getrunkener (oder verabreichter) Trank verlässt den Vorrat. */
  consumePotion: (potionId: string) => void;
  /** Schreibt die eigene Koop-Beute gut und gibt die Truhe für die Anzeige zurück. */
  grantCoopReward: (reward: BattleReward, bossId: string) => ClaimedChest;
  /** Truhe eines Koop-Dungeons gutschreiben – `completed`: Endboss besiegt (zählt für Erfolge). */
  /** `heroic`: heroischer Koop-Dungeon – der Endboss zählt dann auch für „Heroisch“ */
  grantCoopDungeon: (chest: DungeonChest, dungeonId: string, completed: boolean, heroic?: boolean) => ClaimedChest;
  /** Koop-Siege und besiegte Koop-Bosse (für Charakterbogen und Profil) */
  coopStats: CoopStats;
}

export interface DungeonRun {
  dungeonId: string;
  /** Aktueller Schritt (Index in `creatures` – Zwischen- und Endboss stehen dort an ihrem Platz) */
  stage: number;
  /** Startwert des Laufs – bestimmt Türen, Gegner und Räume (dungeonPaths.ts) */
  seed: string;
  /** Gewählte Räume, einer pro Schritt (Eingang, Zwischen- und Endboss zählen als Kampf) */
  path: RoomKind[];
  /** Türen für den nächsten Schritt – null: der nächste Schritt steht fest (oder es war der letzte) */
  doors: Door[] | null;
  /** Raum ohne Kampf, in dem man gerade steht */
  room: DungeonRoom | null;
  /** Pro Abschnitt (bis und nach dem Zwischenboss): schon ein Raum ohne Kampf gewählt? */
  calm: [boolean, boolean];
  /** Fallen und Rätsel, die schon vorkamen – keines doppelt */
  seen: string[];
  /** Segen aus Schrein und Händler (wie im Endlos-Turm) */
  blessings: BlessingId[];
  secondWindUsed: boolean;
  /** Gesammelte Beute – erst am Ende gutgeschrieben, bei einer Niederlage verloren. */
  chest: DungeonChest;
  /** Gutgeschriebene Truhe (Abschluss oder Verlassen) – die UI zeigt sie mit Animation. */
  claimed: ClaimedChest | null;
  /** Heroischer Dungeon: der Endboss kämpft auf heroischer Stufe */
  heroic?: boolean;
  /** Schatzkarte für diesen Dungeon – hinter dem Zwischenboss wartet der Schatzraum, bis man ihn betritt */
  treasureMap?: string;
  /** Wahl in der Szene des Dungeon-Besuchers – fällt danach der Endboss, ist sein letztes Kapitel erfüllt */
  storyChoice?: string;
  /** Aus der Szene: Der Endboss hat so viel weniger Lebenspunkte (0..1) */
  bossWeaken?: number;
}

/** Frischer Dungeon-Lauf am Eingang (Schritt 0, ein Kampf). */
export function newDungeonRun(dungeonId: string, seed: string, heroic = false, treasureMap?: string): DungeonRun {
  return {
    dungeonId,
    stage: 0,
    seed,
    path: ["fight"],
    doors: null,
    room: null,
    calm: [false, false],
    seen: [],
    blessings: [],
    secondWindUsed: false,
    chest: EMPTY_CHEST,
    claimed: null,
    ...(heroic && { heroic: true }),
    ...(treasureMap && { treasureMap }),
  };
}

/** Raum ohne Kampf im Dungeon – mit `chosen` bzw. `outcome` erledigt, dann geht es weiter. */
export type DungeonRoom =
  | { kind: "shrine"; offer: BlessingId[]; chosen: BlessingId | null }
  | { kind: "merchant"; offers: MerchantOffer[]; bought: number[] }
  | { kind: "trap"; trapId: string; outcome: { choice: TrapChoice; dodged: boolean; damage: number; reward: BattleReward } | null }
  | {
      kind: "riddle";
      riddleId: string;
      options: string[];
      outcome: { answer: string; correct: boolean; damage: number; reward: BattleReward | null } | null;
    }
  /** Truhe: liegen gelassen oder geöffnet – ist sie ein Mimic, beginnt stattdessen ein Kampf (der Raum ist dann weg) */
  | { kind: "chest"; outcome: { choice: "leave" } | { choice: "open"; reward: BattleReward } | null }
  /** Schatzraum: der Fund ist beim Eintreten schon gutgeschrieben */
  | { kind: "treasure"; find: TreasureFind }
  /**
   * Szene eines Dungeon-Besuchers. Führt die Wahl in einen Kampf, ist der Raum danach weg (wie beim Mimic).
   * `damage`: Schaden aus einer Probe, `dodged`: die Probe ist gelungen.
   */
  | { kind: "story"; visitorId: string; outcome: { optionId: string; dodged?: boolean; damage?: number } | null };

/** Ist der Raum erledigt? Beim Händler kann man jederzeit weiter. */
export function isRoomDone(room: DungeonRoom): boolean {
  if (room.kind === "shrine") return room.chosen !== null;
  if (room.kind === "merchant" || room.kind === "treasure") return true;
  return room.outcome !== null;
}

export interface TowerRun {
  /** Startwert des Laufs – bestimmt Gegner, Elite und Segen-Angebote */
  seed: string;
  floor: number;
  /** Gesammelte Beute – bei einer Niederlage verloren */
  chest: DungeonChest;
  /** Gewählte Segen (gleiche können sich stapeln) */
  blessings: BlessingId[];
  secondWindUsed: boolean;
  /** Segen zur Wahl nach diesem Stockwerk – erst wählen, dann weiter */
  offer: BlessingId[] | null;
  /** Gutgeschriebene Truhe (Aussteigen oder Flucht) – die UI zeigt sie mit Animation */
  claimed: ClaimedChest | null;
}

/** Verteidigung des Dorfs: Wellen und Anführer nacheinander, ohne Heilung dazwischen. */
export interface RaidRun {
  /** Alle Kämpfe – beim Start festgelegt, mit Wehranlage und Wachen von diesem Moment */
  lineup: RaidFight[];
  /** Aktueller Kampf (Index in `lineup`) */
  wave: number;
  /** Gesammelte Beute – bei einer Niederlage oder Flucht verloren */
  chest: DungeonChest;
  /** Gutgeschriebene Truhe nach dem Sieg über den Anführer */
  claimed: ClaimedChest | null;
  /** Wie der Überfall ausging (verteidigt oder verloren) – fehlt, solange er läuft oder nach einer Flucht */
  report: RaidReport | null;
}

export type ClaimedChest = DungeonChest & {
  levelBefore: number;
  levelAfter: number;
  /** Endboss besiegt (sonst vorzeitig verlassen) */
  completed: boolean;
  /** Quest-Gegenstände für Besucher, die dabei gefallen sind (nur im Koop – solo stehen sie in der Siegmeldung) */
  questItems?: QuestItemFind[];
  /** Gefundene Schatzkarte (nur im Koop – solo steht sie in der Siegmeldung) */
  treasureMap?: TreasureMap;
};

/** Schlüssel des Spielstands im localStorage (wird auch in die Cloud gespiegelt). */
export const SAVE_KEY = "questlog-save";

/** Der Teil des Zustands, der im localStorage gespeichert wird. */
type SaveState = Pick<
  GameState,
  | "character"
  | "questLog"
  | "dailyQuests"
  | "weeklyQuests"
  | "inventory"
  | "equipment"
  | "potions"
  | "shop"
  | "lastShopReroll"
  | "shopRerolls"
  | "bossCollection"
  | "bossRespawns"
  | "coopStats"
  | "records"
  | "achievements"
  | "cosmetics"
  | "towerRecord"
  | "village"
  | "materials"
  | "meal"
  | "companions"
  | "recruitPool"
  | "missionBoard"
  | "activeMissions"
  | "appliedTrades"
  | "visitors"
  | "raids"
  | "treasureMaps"
>;

const createCharacter = (): Character => ({
  name: "Held",
  named: false,
  looks: DEFAULT_LOOKS,
  totalXp: 0,
  gold: 0,
  essence: 0,
  stats: { strength: 1, intellect: 1, endurance: 1, charisma: 1 },
  spentPoints: 0,
  skills: {},
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
export function repairSave(saved: Partial<SaveState>): Partial<SaveState> {
  const fresh = createCharacter();
  // Freigeschaltete Fähigkeiten gibt es nicht mehr – sie liegen auf den Waffen, die Skillpunkte sind wieder frei
  const { abilities: _abilities, ...savedCharacter } = (saved.character ?? {}) as Character & { abilities?: unknown };
  const character = saved.character && {
    ...fresh,
    ...savedCharacter,
    // Wer schon vor dem Namensdialog spielte, wird nicht mehr gefragt
    named: savedCharacter.named ?? true,
    looks: sanitizeLooks(savedCharacter.looks),
    stats: { ...fresh.stats, ...saved.character.stats },
    // Neuer Skilltree: Ränge des alten (pro Waffentyp) fallen weg, zu hohe werden gekappt – die Punkte sind wieder frei.
    skills: sanitizeSkills(saved.character.skills),
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
    dailyQuests: saved.dailyQuests ?? EMPTY_BOARD,
    weeklyQuests: saved.weeklyQuests ?? EMPTY_BOARD,
    // Items älterer Stände bekommen ihren Spezialeffekt (itemEffects.ts) bzw. ihre Fähigkeiten (abilities.ts)
    inventory: (saved.inventory ?? []).map(ensureItemExtras),
    equipment: Object.fromEntries(
      Object.entries({ ...EMPTY_EQUIPMENT, ...saved.equipment }).map(([slot, item]) => [slot, item && ensureItemExtras(item)]),
    ) as Equipment,
    potions: saved.potions ?? STARTER_POTIONS,
    shop: saved.shop ?? EMPTY_SHOP,
    lastShopReroll: saved.lastShopReroll ?? "",
    // Ältere Stände kannten nur einen Wurf pro Tag
    shopRerolls: saved.shopRerolls ?? (saved.lastShopReroll ? 1 : 0),
    bossCollection: saved.bossCollection ?? [],
    bossRespawns: saved.bossRespawns ?? {},
    coopStats: saved.coopStats ?? EMPTY_COOP_STATS,
    records: { ...EMPTY_RECORDS, ...saved.records },
    achievements,
    cosmetics,
    towerRecord: saved.towerRecord ?? EMPTY_TOWER_RECORD,
    // Dorf-Ausbau: auch bestehende Spielstände beginnen mit einem leeren Dorf
    village: { ...EMPTY_VILLAGE, ...saved.village },
    materials: saved.materials ?? {},
    meal: saved.meal ?? null,
    companions: saved.companions ?? [],
    recruitPool: saved.recruitPool ?? EMPTY_RECRUIT_POOL,
    missionBoard: saved.missionBoard ?? EMPTY_MISSION_BOARD,
    activeMissions: (saved.activeMissions ?? []).map(migrateActiveMission),
    appliedTrades: saved.appliedTrades ?? [],
    visitors: { ...EMPTY_VISITORS, ...saved.visitors },
    raids: { ...EMPTY_RAIDS, ...saved.raids },
    treasureMaps: saved.treasureMaps ?? [],
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
      dailyQuests: EMPTY_BOARD,
      weeklyQuests: EMPTY_BOARD,
      records: {
        ...EMPTY_RECORDS,
        ...rest.records,
        questsCompleted: done.length,
        dailyQuestsCompleted: done.filter((q) => q.bonus).length,
      },
    };
  }
  // v14 → v15: steilere Level-Kurve – die XP werden umgerechnet, das Level bleibt gleich.
  if (version < 15) {
    state = { ...state, character: { ...state.character, totalXp: convertLinearCurveXp(state.character.totalXp) } };
  }
  // v15 → v16: epische und legendäre Items geben weniger Attributpunkte – vorhandene Items umrechnen.
  if (version < 16) {
    state = {
      ...state,
      inventory: state.inventory.map(rescaleBonuses),
      equipment: Object.fromEntries(
        Object.entries(state.equipment).map(([slot, item]) => [slot, item && rescaleBonuses(item)]),
      ) as Equipment,
      ...(state.shop && { shop: { ...state.shop, offers: state.shop.offers.map(rescaleBonuses) } }),
    };
  }
  // v16 → v17: neue Baumaterialien – der Vorrat wird 1:1 auf das Material desselben Gebiets umgebucht.
  if (version < 17 && state.materials) {
    const renamed: Record<string, MaterialId> = {
      wolfPelt: "darkwood",
      lizardScale: "clay",
      frostFur: "hardwood",
      boneDust: "obsidian",
      dragonScale: "dragonOre",
    };
    state = {
      ...state,
      materials: Object.fromEntries(Object.entries(state.materials).map(([id, n]) => [renamed[id] ?? id, n])),
    };
  }
  // v17 → v18: die Anschlagtafel hat nur noch Stufe 1 – die bezahlten Stufen 2 und 3 gibt es zurück.
  if (version < 18 && state.village && state.village.board > 1) {
    const refunds: [number, MaterialStock][] = [
      [1500, { crystalShard: 25, darkwood: 10 }],
      [6000, { obsidian: 30, crystalShard: 15 }],
    ];
    const paid = refunds.slice(0, state.village.board - 1);
    state = {
      ...state,
      character: { ...state.character, gold: state.character.gold + paid.reduce((sum, [gold]) => sum + gold, 0) },
      materials: paid.reduce((stock, [, materials]) => addMaterials(stock, materials), state.materials ?? {}),
      village: { ...state.village, board: 1 },
    };
  }
  // v18 → v19: Begleiter und Missionen – die leeren Listen ergänzt repairSave.
  // v19 → v20: Besucher und Vorrat – ebenfalls repairSave.
  // v20 → v21: Essen von Besuchern gibt es nur noch als Rezept – wer Portionen im Vorrat hatte, bekommt das Rezept.
  if (version < 21 && "pantry" in state) {
    const { pantry = {}, ...rest } = state as SaveState & { pantry?: Record<string, number> };
    const visitors = { ...EMPTY_VISITORS, ...rest.visitors };
    const recipes = [...visitors.recipes, ...Object.keys(pantry).filter((id) => !visitors.recipes.includes(id))];
    state = { ...rest, visitors: { ...visitors, recipes } };
  }
  // v21 → v22: Überfälle und Wehranlage – `raids` und `village.walls` ergänzt repairSave.
  // v22 → v23: Schatzkarten – die leere Liste ergänzt repairSave.
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

/** Ausbaustufen, wie sie gerade wirken – beschädigte Gebäude eine Stufe tiefer (raids.ts). */
export function activeVillage(s: Pick<GameState, "village" | "raids">): Village {
  return effectiveVillage(s.village, s.raids.damaged);
}

// Hinweis: Zustand wird vorerst im localStorage gespeichert.
// Für Supabase später: dieselben Aktionen beibehalten, aber `turnInQuest`
// an eine Edge Function schicken, die Fortschritt und Belohnung serverseitig prüft.
export const useGameStore = create<GameState>()(
  persist(
    (set, get) => {
      /**
       * Ein Sieg oder ein abgeschlossener Dungeon bringt Questbuch und Tagesaufträge voran.
       * Gibt die Quest-Gegenstände für Besucher zurück, die dabei gefallen sind.
       */
      const questEvent = (event: QuestEvent): QuestItemFind[] => {
        get().refreshQuestBoards(); // Aufträge von gestern bzw. letzter Woche zählen nicht mehr
        const { questLog, dailyQuests, weeklyQuests, village } = get();
        const nextLog = applyQuestEvent(questLog, event);
        const { visitors } = get();
        const nextVisitors = applyVisitorEvent(visitors, event);
        if (nextVisitors !== visitors) set({ visitors: nextVisitors });
        // Nur Aufträge, die die Anschlagtafel schon zeigt, kommen voran
        const nextDaily = applyBoardEvent(dailyQuests, event, village.board);
        const nextWeekly = applyBoardEvent(weeklyQuests, event, village.board);
        if (nextLog !== questLog || nextDaily !== dailyQuests || nextWeekly !== weeklyQuests) {
          set({ questLog: nextLog, dailyQuests: nextDaily, weeklyQuests: nextWeekly });
        }
        return foundQuestItems(visitors, nextVisitors);
      };

      /** Nach einem Sieg: Fällt eine Schatzkarte? `strong`: Elite, Boss oder Koop-Sieg. */
      const findTreasureMap = (strong: boolean): TreasureMap | undefined => {
        const { treasureMaps, character } = get();
        const map = rollTreasureMap(treasureMaps, getLevel(character.totalXp), strong, newId(), Date.now());
        if (!map) return undefined;
        set({ treasureMaps: [...treasureMaps, map] });
        return map;
      };

      /** Legt das Geschenk eines Besuchers (`visitorId`) in den Spielstand – gibt das Item zurück, falls es eines war. */
      const grantGift = (gift: VisitorGift, level: number, visitorId: string): OwnedItem | null => {
        const { inventory, companions, potions, materials, character, bossCollection } = get();
        switch (gift.kind) {
          case "companion":
            set({
              companions: [
                ...companions,
                {
                  id: newId(),
                  name: gift.name,
                  // Er stösst ein paar Level unter dem Helden dazu, wie neue Begleiter aus der Taverne
                  totalXp: totalXpForLevel(Math.max(1, level - 2)),
                  traits: gift.traits,
                  equipment: EMPTY_EQUIPMENT,
                  visitorId,
                },
              ],
            });
            return null;
          case "unique": {
            const item = createItem(gift.itemId, "legendary", newId());
            set({ inventory: [...inventory, item] });
            return item;
          }
          case "recipe":
            return null; // steht schon im Besucher-Zustand
          case "potions":
            set({ potions: addPotions(potions, ...Object.entries(gift.potions)) });
            return null;
          case "materials":
            set({ materials: addMaterials(materials, gift.materials) });
            return null;
          case "loot": {
            const item = rollDrop(1, gift.weights, level, newId());
            if (item) set({ inventory: [...inventory, item], bossCollection: addToCollection(bossCollection, item) });
            return item;
          }
          case "gold":
            set({ character: { ...character, gold: character.gold + gift.gold } });
            return null;
        }
      };

      /** Ausbaustufen, wie sie gerade wirken (beschädigte Gebäude eine Stufe tiefer). */
      const tiers = () => activeVillage(get());

      /** Händler und Schmied: jedes Ausrüstungsteil zählt für die Händler-Aufträge. */
      const tradeEvent = (action: TradeAction, item: OwnedItem | undefined) => {
        if (item) questEvent({ kind: "trade", action });
      };

      /** Ein Item im Rucksack oder angelegt – vor dem Verkaufen, Zerlegen oder Verbessern nachgeschlagen. */
      const findItem = (uid: string): OwnedItem | undefined => {
        const { inventory, equipment } = get();
        return [...inventory, ...Object.values(equipment)].find((o): o is OwnedItem => o !== null && o.uid === uid);
      };

      /** Schreibt die Belohnung einer abgegebenen Quest gut und zeigt sie an. */
      const grantQuestReward = (def: QuestDef, source: QuestSource, extra: Partial<GameState>) => {
        const { character, inventory, bossCollection } = get();
        const xp = statueXp(def.reward.xp, tiers().statue);
        const levelBefore = getLevel(character.totalXp);
        const totalXp = character.totalXp + xp;
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
            source,
            xp,
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
       * Schreibt Kampfbeute gut: XP, Gold, Items (inkl. Boss-Sammlung), Tränke und Baumaterial.
       * Ein Level-up meldet der Aufrufer über den EventBus.
       */
      const grantRewards = (
        xp: number,
        gold: number,
        items: OwnedItem[],
        potionDrops: Record<string, number>,
        materialDrops?: MaterialStock,
      ) => {
        const { character, inventory, potions, bossCollection, materials } = get();
        const levelBefore = getLevel(character.totalXp);
        const levelAfter = getLevel(character.totalXp + xp);
        set({
          character: { ...character, totalXp: character.totalXp + xp, gold: character.gold + gold },
          inventory: [...inventory, ...items],
          bossCollection: addToCollection(bossCollection, ...items),
          potions: addPotions(potions, ...Object.entries(potionDrops)),
          materials: addMaterials(materials, materialDrops),
        });
        return { levelBefore, levelAfter };
      };

      /** Items im eigenen Angebot eines offenen Tauschs bleiben, wie sie sind – sonst passt das Angebot nicht mehr. */
      const assertNotInTrade = (uid: string) => {
        if (get().tradeLocked.includes(uid)) throw new Error("Das Item liegt in einem offenen Tausch.");
      };

      /** Ändert die Ausrüstung eines Begleiters – nicht, solange er unterwegs ist. */
      const changeCompanionGear = (
        companionId: string,
        change: (companion: Companion, inventory: OwnedItem[]) => { companion: Companion; inventory: OwnedItem[] },
      ) => {
        const { companions, inventory, activeMissions } = get();
        const companion = companions.find((c) => c.id === companionId);
        if (!companion) throw new Error("Diesen Begleiter gibt es nicht.");
        if (isBusy(activeMissions, companionId)) throw new Error(`${companion.name} ist unterwegs – die Ausrüstung bleibt, wie sie ist.`);
        const result = change(companion, inventory);
        set({ companions: companions.map((c) => (c.id === companionId ? result.companion : c)), inventory: result.inventory });
      };

      /** Kampfwerte für Solo-Kämpfe – mit der Trankwirkung des Alchemisten (im Koop gilt das Dorf nicht). */
      const soloHero = (meal = get().mealInUse) => {
        const { character, equipment } = get();
        return withMeal({ ...getHeroCombatProfile(character, equipment), potionPower: potionPower(tiers().alchemist) }, meal);
      };

      /** Schreibt die Dungeon-Truhe gut und merkt sie sich für die Truhen-Animation. */
      const claimChest = (completed: boolean) => {
        const { dungeon } = get();
        if (!dungeon || dungeon.claimed) return;
        const { chest } = dungeon;
        const levels = grantRewards(chest.xp, chest.gold, chest.items, chest.potions, chest.materials);
        const { records } = get();
        set({
          dungeon: { ...dungeon, claimed: { ...chest, ...levels, completed } },
          ...(completed &&
            !records.dungeonsCleared.includes(dungeon.dungeonId) && {
              records: { ...records, dungeonsCleared: [...records.dungeonsCleared, dungeon.dungeonId] },
            }),
        });
        if (completed) questEvent({ kind: "dungeon", dungeonId: dungeon.dungeonId });
        // Szene gespielt und danach den Endboss besiegt: das letzte Kapitel des Dungeon-Besuchers ist erfüllt
        if (completed && dungeon.storyChoice) {
          set((s) => ({ visitors: completeStoryScene(s.visitors, dungeon.dungeonId, dungeon.storyChoice!) }));
        }
        if (levels.levelAfter > levels.levelBefore) {
          EventBus.emit("character:levelup", { from: levels.levelBefore, to: levels.levelAfter });
        }
      };

      /** Turm: Truhe gutschreiben (Aussteigen oder Flucht) – bei einer Niederlage bleibt sie verloren. */
      const claimTowerChest = () => {
        const { tower } = get();
        if (!tower || tower.claimed) return;
        const { chest } = tower;
        const levels = grantRewards(chest.xp, chest.gold, chest.items, chest.potions, chest.materials);
        set({ tower: { ...tower, claimed: { ...chest, ...levels, completed: false } } });
        if (levels.levelAfter > levels.levelBefore) {
          EventBus.emit("character:levelup", { from: levels.levelBefore, to: levels.levelAfter });
        }
      };

      /** Kampf gegen die aktuelle Welle des Überfalls – mit den mitgenommenen LP. */
      const raidBattle = (run: RaidRun, heroHp: number | null) => {
        const { character } = get();
        const hero = soloHero();
        const { creature, elite } = run.lineup[run.wave];
        const battle = startBattle(newId(), character.name, hero, creature, heroHp ?? hero.maxHp, elite);
        return { ...battle, raidWave: run.wave + 1 };
      };

      /** Anführer besiegt: Die Beute der Bande kommt in die Truhe, alles wird gutgeschrieben. */
      const claimRaid = () => {
        const { raid, raids, character } = get();
        if (!raid || raid.claimed || !raids.current) return;
        const bounty = raidBounty(raids.current, getLevel(character.totalXp), newId());
        const chest = addToChest(raid.chest, { ...bounty, xp: statueXp(bounty.xp, tiers().statue) });
        const levels = grantRewards(chest.xp, chest.gold, chest.items, chest.potions, chest.materials);
        const defended = defendRaid(raids, Date.now());
        const { records } = get();
        set({
          raids: defended,
          raid: { ...raid, chest, claimed: { ...chest, ...levels, completed: true }, report: defended.report },
          records: { ...records, raidsDefended: records.raidsDefended + 1 },
        });
        if (levels.levelAfter > levels.levelBefore) {
          EventBus.emit("character:levelup", { from: levels.levelBefore, to: levels.levelAfter });
        }
      };

      /** Gegen die Bande verloren: ein Gebäude beschädigt oder das Lager geplündert – die Truhe ist weg. */
      const loseRaid = () => {
        const { raid, raids, village, character, materials } = get();
        if (!raid || raid.report || !raids.current) return;
        const change = failRaid(raids, "lost", village, character.gold, materials, Date.now());
        set({
          raids: change.raids,
          raid: { ...raid, report: change.raids.report },
          character: { ...character, gold: change.gold },
          materials: change.materials,
        });
      };

      /** Kampf auf dem aktuellen Stockwerk des Turms – mit den Segen des Laufs und den mitgenommenen LP. */
      const towerBattle = (run: TowerRun, heroHp: number | null) => {
        const { character } = get();
        const hero = blessedProfile(soloHero(), run.blessings);
        const creature = floorCreature(run.seed, run.floor, hero.level);
        const battle = startBattle(newId(), character.name, hero, creature, heroHp ?? hero.maxHp, floorElite(run.seed, run.floor));
        return { ...battle, towerFloor: run.floor, blessings: run.blessings, secondWindUsed: run.secondWindUsed };
      };

      /** Neuer Segen (Turm oder Dungeon): Rast und Vitalität wirken sofort auf die mitgenommenen Lebenspunkte. */
      const blessBattle = (battle: BattleState, before: readonly BlessingId[], id: BlessingId): BattleState => {
        const { character, equipment } = get();
        const base = withMeal(getHeroCombatProfile(character, equipment), get().mealInUse);
        const maxBefore = blessedProfile(base, before).maxHp;
        const maxAfter = blessedProfile(base, [...before, id]).maxHp;
        const healed = id === "rest" ? Math.round(maxAfter * BLESSING.rest) : id === "vitality" ? maxAfter - maxBefore : 0;
        return { ...battle, hero: { ...battle.hero, hp: Math.min(maxAfter, battle.hero.hp + healed), maxHp: maxAfter } };
      };

      /** Kampf im Dungeon – mit den Segen des Laufs; der heroische Endboss kommt mit Zusatzmechanik. */
      const dungeonBattle = (run: DungeonRun, creature: CreatureDef, heroHp: number | null, elite?: EliteAffix[]) => {
        const { character } = get();
        const hero = blessedProfile(soloHero(), run.blessings);
        const heroicBoss = !!run.heroic && creature.boss;
        const affixes = heroicBoss ? heroicAffixes(creature.id) : (elite ?? rollElite(creature));
        const started = startBattle(newId(), character.name, hero, creature, heroHp ?? hero.maxHp, affixes);
        const heroicBattle = heroicBoss ? makeHeroic(started) : started;
        // Szene des Dungeon-Besuchers: der Endboss kann geschwächt sein
        const weaken = creature.boss ? (run.bossWeaken ?? 0) : 0;
        const enemyHp = Math.round(heroicBattle.enemy.maxHp * (1 - weaken));
        const battle = weaken > 0 ? { ...heroicBattle, enemy: { ...heroicBattle.enemy, hp: enemyHp, maxHp: enemyHp } } : heroicBattle;
        return { ...battle, blessings: run.blessings, secondWindUsed: run.secondWindUsed };
      };

      /** Türen für den Schritt nach `run.stage` – null, wenn dort Zwischen- oder Endboss warten. */
      const nextDoors = (dungeon: AreaDef, run: DungeonRun): Door[] | null => {
        const step = run.stage + 1;
        if (step >= dungeon.creatures.length || stepKind(dungeon, step) !== "fork") return null;
        const doors = forkDoors(run.seed, step, !run.calm[sectionOf(dungeon, step)]);
        if (step !== treasureStep(dungeon)) return doors;
        // An der ersten Gabelung hinter dem Zwischenboss: mit Schatzkarte der Schatzraum,
        // im letzten Kapitel des Dungeon-Besuchers die Geschichtstür
        const extra: Door[] = [];
        if (run.treasureMap) extra.push({ kind: "treasure", hidden: false });
        if (!run.storyChoice && storySceneFor(get().visitors, dungeon.id)) extra.push({ kind: "story", hidden: false });
        return [...doors, ...extra];
      };

      /** Beute aus Kampf oder Raum für die Dungeon-Truhe: Material doppelt, „Schatzsucher“ gibt mehr Erfahrung und Gold. */
      const dungeonLoot = (reward: BattleReward, blessings: readonly BlessingId[]): BattleReward => {
        const factor = 1 + BLESSING.treasure * stacks(blessings, "treasure");
        return {
          ...reward,
          xp: Math.round(reward.xp * factor),
          gold: Math.round(reward.gold * factor),
          materials: scaleMaterials(reward.materials, DUNGEON_MATERIAL_FACTOR),
        };
      };

      /** Raum ohne Kampf, der gerade offen ist – sonst ein Fehler. */
      const currentRoom = <K extends DungeonRoom["kind"]>(kind: K) => {
        const { dungeon, battle } = get();
        const room = dungeon?.room;
        if (!dungeon || !battle || !room || room.kind !== kind || dungeon.claimed) throw new Error("Du bist gerade nicht in so einem Raum.");
        return { dungeon, battle, room: room as Extract<DungeonRoom, { kind: K }> };
      };

      return {
      character: createCharacter(),
      questLog: EMPTY_QUEST_LOG,
      dailyQuests: EMPTY_BOARD,
      weeklyQuests: EMPTY_BOARD,
      inventory: starterInventory(),
      equipment: EMPTY_EQUIPMENT,
      potions: STARTER_POTIONS,
      shop: EMPTY_SHOP,
      lastShopReroll: "",
      shopRerolls: 0,
      bossCollection: [],
      bossRespawns: {},
      coopStats: EMPTY_COOP_STATS,
      records: EMPTY_RECORDS,
      achievements: {},
      cosmetics: DEFAULT_COSMETICS,
      achievementQueue: [],
      battle: null,
      battleReward: null,
      areaChest: null,
      dungeon: null,
      treasureMaps: [],
      tower: null,
      towerRecord: EMPTY_TOWER_RECORD,
      village: EMPTY_VILLAGE,
      materials: {},
      meal: null,
      mealInUse: null,
      coopMeal: null,
      lastReward: null,
      companions: [],
      recruitPool: EMPTY_RECRUIT_POOL,
      missionBoard: EMPTY_MISSION_BOARD,
      activeMissions: [],
      tradeLocked: [],
      appliedTrades: [],
      visitors: EMPTY_VISITORS,
      raids: EMPTY_RAIDS,
      raid: null,

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
        const abilities = owned.flatMap(weaponAbilities);
        const r = s.records;
        const records: Records = {
          ...r,
          classesWorn: heroClass && !r.classesWorn.includes(heroClass) ? [...r.classesWorn, heroClass] : r.classesWorn,
          legendarySeen: legendary.some((u) => !r.legendarySeen.includes(u)) ? [...new Set([...r.legendarySeen, ...legendary])] : r.legendarySeen,
          maxedSeen: maxed.some((u) => !r.maxedSeen.includes(u)) ? [...new Set([...r.maxedSeen, ...maxed])] : r.maxedSeen,
          abilitiesSeen: abilities.some((a) => !r.abilitiesSeen.includes(a)) ? [...new Set([...r.abilitiesSeen, ...abilities])] : r.abilitiesSeen,
          maxGold: Math.max(r.maxGold, s.character.gold),
          maxGearScore: Math.max(r.maxGearScore, gearScore(s.equipment)),
        };
        const changedRecords = Object.keys(records).some((k) => records[k as keyof Records] !== r[k as keyof Records]);
        const { tiers, unlocked } = evaluateAchievements(
          { character: s.character, questLog: s.questLog, bossCollection: s.bossCollection, coopStats: s.coopStats, records, village: s.village },
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
          const { questLog, dailyQuests, weeklyQuests, records, village } = get();
          const weekly = weeklyQuests.quests.find((q) => q.def.id === id);
          if (weekly) {
            if (weeklyQuests.date !== weekKey()) throw new Error("Dieser Wochenauftrag ist abgelaufen.");
            grantQuestReward(weekly.def, "weekly", {
              weeklyQuests: turnInBoardQuest(weeklyQuests, id, village.board),
              records: { ...records, questsCompleted: records.questsCompleted + 1 },
            });
            return;
          }
          const daily = dailyQuests.quests.find((q) => q.def.id === id);
          if (!daily) {
            grantQuestReward(getQuest(id), "story", {
              questLog: turnInQuest(questLog, id),
              records: { ...records, questsCompleted: records.questsCompleted + 1 },
            });
            return;
          }
          if (dailyQuests.date !== dateKey()) throw new Error("Dieser Tagesauftrag ist abgelaufen.");
          const next = turnInBoardQuest(dailyQuests, id, village.board);
          // Perfekter Tag: alle Aufträge, die die Anschlagtafel zeigt
          const perfect = visibleBoard(next, village.board).quests.every((q) => q.turnedIn);
          grantQuestReward(daily.def, "daily", {
            dailyQuests: next,
            records: {
              ...records,
              questsCompleted: records.questsCompleted + 1,
              dailyQuestsCompleted: records.dailyQuestsCompleted + 1,
              perfectBonusDays: records.perfectBonusDays + (perfect ? 1 : 0),
            },
          });
        }),

      refreshQuestBoards: () => {
        const today = dateKey();
        const week = weekKey();
        const { dailyQuests, weeklyQuests, character } = get();
        const level = getLevel(character.totalXp);
        if (dailyQuests.date !== today) set({ dailyQuests: rollDailyQuests(today, level) });
        if (weeklyQuests.date !== week) set({ weeklyQuests: rollWeeklyQuests(week, level) });
      },

      renameCharacter: (name) =>
        set((s) => (name.trim() ? { character: { ...s.character, name: name.trim(), named: true } } : {})),

      setLooks: (looks) => set((s) => ({ character: { ...s.character, looks: sanitizeLooks(looks) } })),

      allocatePoint: (stat) => attempt(() => set((s) => ({ character: allocatePoint(s.character, stat) }))),

      resetAttributes: () => attempt(() => set((s) => ({ character: resetAttributes(s.character) }))),

      learnSkill: (id) => attempt(() => set((s) => ({ character: learnSkill(s.character, id) }))),


      resetSkills: () => attempt(() => set((s) => ({ character: resetSkills(s.character, activeVillage(s).training) }))),

      dismissReward: () => set({ lastReward: null }),

      setTradeLocked: (uids) => set({ tradeLocked: uids }),

      applyCompletedTrade: (id, give, receive) => {
        const { inventory, appliedTrades } = get();
        if (appliedTrades.includes(id)) return false;
        // Fehlt ein abgegebenes Item schon (z. B. vom Abgleich entfernt), geht nur weg, was noch da ist
        const present = give.filter((g) => inventory.some((i) => i.uid === g.uid));
        set({
          inventory: applyTrade(inventory, present, receive.map(ensureItemExtras)),
          appliedTrades: [...appliedTrades, id].slice(-200),
          tradeLocked: [],
        });
        return true;
      },

      removeTradedItems: (uids) => {
        const gone = new Set(uids);
        const { inventory, equipment, companions } = get();
        let removed = 0;
        const keep = (item: OwnedItem | null) => {
          if (item && gone.has(item.uid)) {
            removed++;
            return null;
          }
          return item;
        };
        const stripped = (gear: Equipment) =>
          Object.fromEntries(Object.entries(gear).map(([slot, item]) => [slot, keep(item)])) as Equipment;
        const next = {
          inventory: inventory.filter((item) => keep(item) !== null),
          equipment: stripped(equipment),
          companions: companions.map((c) => ({ ...c, equipment: stripped(c.equipment) })),
        };
        if (removed > 0) {
          set(next);
          EventBus.emit("equipment:changed", getCombatStats(next.equipment));
        }
        return removed;
      },

      resetGame: () =>
        set({
          character: createCharacter(),
          questLog: EMPTY_QUEST_LOG,
          dailyQuests: EMPTY_BOARD,
          weeklyQuests: EMPTY_BOARD,
          inventory: starterInventory(),
          equipment: EMPTY_EQUIPMENT,
          potions: STARTER_POTIONS,
          shop: EMPTY_SHOP,
          lastShopReroll: "",
          shopRerolls: 0,
          bossCollection: [],
          bossRespawns: {},
          coopStats: EMPTY_COOP_STATS,
          records: EMPTY_RECORDS,
          achievements: {},
          cosmetics: DEFAULT_COSMETICS,
          achievementQueue: [],
          battle: null,
          battleReward: null,
          dungeon: null,
          tower: null,
          towerRecord: EMPTY_TOWER_RECORD,
          village: EMPTY_VILLAGE,
          materials: {},
          meal: null,
          mealInUse: null,
          coopMeal: null,
          lastReward: null,
          companions: [],
          recruitPool: EMPTY_RECRUIT_POOL,
          missionBoard: EMPTY_MISSION_BOARD,
          activeMissions: [],
          tradeLocked: [],
          appliedTrades: [],
          visitors: EMPTY_VISITORS,
          raids: EMPTY_RAIDS,
          raid: null,
          treasureMaps: [],
        }),

      equip: (uid, slot) =>
        attempt(() => {
          assertNotInTrade(uid);
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
        if (shop.slot !== slot) {
          set({ shop: rollShopStock(slot, getLevel(character.totalXp), newId, Math.random, MERCHANT_RULES[tiers().merchant]) });
        }
      },

      rerollShop: () =>
        attempt(() => {
          const { character, lastShopReroll, shopRerolls } = get();
          const result = rerollShop(
            character.gold,
            getLevel(character.totalXp),
            lastShopReroll,
            shopRerolls,
            newId,
            new Date(),
            Math.random,
            MERCHANT_RULES[tiers().merchant],
          );
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
          assertNotInTrade(uid);
          const { inventory, equipment, character } = get();
          const item = findItem(uid);
          const result = sellItem({ inventory, equipment }, character.gold, uid, MERCHANT_RULES[tiers().merchant].sellBonus);
          set({ inventory: result.gear.inventory, character: { ...character, gold: result.gold } });
          tradeEvent("sell", item);
        }),

      sellCommon: () =>
        attempt(() => {
          const { inventory, equipment, character, tradeLocked } = get();
          // Items im offenen Tausch bleiben liegen
          const locked = inventory.filter((i) => tradeLocked.includes(i.uid));
          const free = inventory.filter((i) => !tradeLocked.includes(i.uid));
          const result = sellCommonItems({ inventory: free, equipment }, character.gold, MERCHANT_RULES[tiers().merchant].sellBonus);
          set({ inventory: [...result.gear.inventory, ...locked], character: { ...character, gold: result.gold } });
          // Jedes Item zählt einzeln für Verkaufs-Aufträge
          for (const item of result.sold) tradeEvent("sell", item);
        }),

      salvage: (uid) =>
        attempt(() => {
          assertNotInTrade(uid);
          const { inventory, equipment, character } = get();
          const smith = SMITH_RULES[tiers().smith];
          if (!smith.open) throw new Error("Im Dorf gibt es noch keine Schmiede.");
          const item = findItem(uid);
          const result = salvageItem({ inventory, equipment }, character.essence, uid, smith.refund);
          set({ inventory: result.gear.inventory, character: { ...character, essence: result.essence } });
          tradeEvent("salvage", item);
        }),

      upgrade: (uid) =>
        attempt(() => {
          assertNotInTrade(uid);
          const { inventory, equipment, character } = get();
          const smith = SMITH_RULES[tiers().smith];
          if (!smith.open) throw new Error("Im Dorf gibt es noch keine Schmiede.");
          const result = forgeUpgrade({ inventory, equipment }, character.essence, uid, smith);
          set({
            inventory: result.gear.inventory,
            equipment: result.gear.equipment,
            character: { ...character, essence: result.essence },
          });
          tradeEvent("upgrade", findItem(uid));
        }),

      forge: (target, rarity) => {
        let forged: OwnedItem | null = null;
        attempt(() => {
          const { inventory, character } = get();
          const smith = SMITH_RULES[tiers().smith];
          if (!smith.open) throw new Error("Im Dorf gibt es noch keine Schmiede.");
          const level = getLevel(character.totalXp);
          const result = forgeItem(inventory, character.essence, target, rarity, level, newId(), smith.discount);
          set({ inventory: result.inventory, character: { ...character, essence: result.essence } });
          forged = result.item;
        });
        return forged;
      },

      buyPotion: (potionId) =>
        attempt(() => {
          const { potions, character } = get();
          const result = buyPotion(potions, character.gold, potionId, tiers().alchemist);
          set({ potions: result.stock, character: { ...character, gold: result.gold } });
        }),

      eat: (foodId) =>
        attempt(() => {
          const { meal, character, visitors } = get();
          const result = eatMeal(meal, character.gold, foodId, getLevel(character.totalXp), tiers().tavern, visitors.recipes);
          set({ meal: result.meal, character: { ...character, gold: result.gold } });
        }),

      refreshVisitors: () => {
        const { visitors, character } = get();
        const next = refreshVisitors(visitors, getLevel(character.totalXp), Date.now());
        if (next !== visitors) set({ visitors: next });
      },

      acceptVisitor: (who) => attempt(() => set({ visitors: acceptVisitor(get().visitors, who) })),

      dismissWanderer: () => set((s) => ({ visitors: dismissWanderer(s.visitors, Date.now()) })),

      turnInVisitor: (who, choiceId) => {
        let outcome: VisitorOutcome | null = null;
        attempt(() => {
          const { visitors, character, records } = get();
          const result = who === "wanderer" ? turnInWanderer(visitors, Date.now()) : turnInStory(visitors, choiceId, who);
          const xp = statueXp(result.reward.xp, tiers().statue);
          const levelBefore = getLevel(character.totalXp);
          const totalXp = character.totalXp + xp;
          const levelAfter = getLevel(totalXp);
          set({
            visitors: result.state,
            character: { ...character, totalXp, gold: character.gold + result.reward.gold },
            records: { ...records, questsCompleted: records.questsCompleted + 1 },
          });
          const item = result.gift ? grantGift(result.gift, levelAfter, who === "wanderer" ? "wanderer" : (visitors[who]?.id ?? "wanderer")) : null;
          const gold = result.reward.gold + (result.gift?.kind === "gold" ? result.gift.gold : 0);
          set({
            lastReward: { id: newId(), questTitle: result.title, source: "visitor", xp, gold, loot: item, levelBefore, levelAfter },
          });
          if (levelAfter > levelBefore) EventBus.emit("character:levelup", { from: levelBefore, to: levelAfter });
          outcome = {
            title: result.title,
            text: result.text,
            xp,
            gold,
            gift: result.gift,
            item,
            finished: result.finished,
            recipeKnown: result.recipeKnown,
          };
        });
        return outcome;
      },

      finishMealInCoop: () => set((s) => ({ meal: null, coopMeal: s.meal })),

      build: (id) =>
        attempt(() => {
          const { village, character, materials } = get();
          const result = build(village, id, character.gold, materials);
          set({
            village: result.village,
            materials: result.materials,
            character: { ...character, gold: result.gold },
            raids: repairedByBuild(get().raids, id),
          });
          // Ein ausgebauter Händler holt sofort neue Ware – passend zu seiner neuen Stufe
          if (id === "merchant") {
            set({ shop: rollShopStock(shopSlot(), getLevel(character.totalXp), newId, Math.random, MERCHANT_RULES[result.village.merchant]) });
          }
        }),

      refreshRaids: () => {
        const { raids, raid, village, character, materials } = get();
        const change = refreshRaids(
          raids,
          {
            village,
            heroLevel: getLevel(character.totalXp),
            gold: character.gold,
            materials,
            now: Date.now(),
            // Wer gerade gegen die Bande kämpft, darf zu Ende kämpfen
            fighting: raid !== null && raid.report === null,
          },
          newId,
        );
        if (change.raids === raids) return;
        set({ raids: change.raids, character: { ...character, gold: change.gold }, materials: change.materials });
      },

      startRaid: () =>
        attempt(() => {
          get().refreshRaids();
          const { raids, village, companions, activeMissions, meal } = get();
          if (!raids.current) throw new Error("Gerade greift niemand an.");
          // Begleiter, die nicht auf Mission sind, stehen Wache
          const guards = companions.filter((c) => !isBusy(activeMissions, c.id)).length;
          const run: RaidRun = { lineup: raidLineup(raids.current, village.walls, guards), wave: 0, chest: EMPTY_CHEST, claimed: null, report: null };
          // Das Gericht wirkt bei allen Wellen
          set({ meal: null, mealInUse: meal });
          const battle = raidBattle(run, null);
          set({ battle, battleReward: null, dungeon: null, tower: null, raid: run });
          EventBus.emit("battle:started", { battle });
        }),

      nextRaidWave: () =>
        attempt(() => {
          const { battle, raid } = get();
          if (!raid || !battle || battle.status !== "won" || raid.report) throw new Error("Keine Welle gewonnen.");
          // Keine Heilung zwischen den Wellen: die Lebenspunkte werden mitgenommen
          const next: RaidRun = { ...raid, wave: raid.wave + 1 };
          const nextBattle = raidBattle(next, battle.hero.hp);
          set({ battle: nextBattle, battleReward: null, raid: next });
          EventBus.emit("battle:started", { battle: nextBattle });
        }),

      repairBuilding: (id) =>
        attempt(() => {
          const { raids, village, character, materials } = get();
          const change = repair(raids, village, id, character.gold, materials);
          set({ raids: change.raids, character: { ...character, gold: change.gold }, materials: change.materials });
        }),

      dismissRaidReport: () => set((s) => ({ raids: { ...s.raids, report: null } })),

      refreshTavern: () => {
        const { village, recruitPool, missionBoard, companions, character } = get();
        if (village.tavern === 0) return;
        const today = dateKey();
        const level = getLevel(character.totalXp);
        if (recruitPool.date !== today) {
          set({ recruitPool: rollRecruitPool(today, tiers().tavern, level, companions.map((c) => c.name), newId) });
        }
        if (missionBoard.date !== today) {
          set({ missionBoard: rollMissionBoard(today, missionBaseLevel(level, companions), tiers().tavern) });
        }
      },

      recruitCompanion: (id) =>
        attempt(() => {
          const { recruitPool, companions, character } = get();
          const result = recruit(recruitPool, companions, character.gold, id, tiers().tavern);
          set({ recruitPool: result.pool, companions: result.companions, character: { ...character, gold: result.gold } });
        }),

      rerollRecruits: () =>
        attempt(() => {
          const { recruitPool, companions, character } = get();
          const result = rerollRecruits(
            recruitPool,
            character.gold,
            dateKey(),
            tiers().tavern,
            getLevel(character.totalXp),
            companions.map((c) => c.name),
            newId,
          );
          set({ recruitPool: result.pool, character: { ...character, gold: result.gold } });
        }),

      dismissCompanion: (id) =>
        attempt(() => {
          const { companions, inventory, activeMissions } = get();
          set(dismissCompanion(companions, inventory, id, activeMissions));
        }),

      companionEquip: (companionId, uid, slot) =>
        attempt(() => {
          assertNotInTrade(uid);
          changeCompanionGear(companionId, (c, inv) => equipCompanion(c, inv, uid, slot));
        }),
      companionUnequip: (companionId, slot) =>
        attempt(() => changeCompanionGear(companionId, (c, inv) => unequipCompanion(c, inv, slot))),
      companionEquipBest: (companionId) => attempt(() => changeCompanionGear(companionId, equipBest)),

      startMission: (missionId, companionIds) =>
        attempt(() => {
          const { missionBoard, activeMissions, companions, character } = get();
          const heroLevel = getLevel(character.totalXp);
          const result = startMission(missionBoard, activeMissions, companions, missionId, companionIds, dateKey(), Date.now(), heroLevel, newId());
          set({ missionBoard: result.board, activeMissions: result.active });
        }),

      cancelMission: (missionId) => set((s) => ({ activeMissions: s.activeMissions.filter((a) => a.mission.id !== missionId) })),

      claimMission: (missionId) => {
        const { activeMissions, companions, character, inventory, materials } = get();
        const active = activeMissions.find((a) => a.mission.id === missionId);
        if (!active || !isMissionDone(active)) return null;
        const { outcome } = active;
        set({
          activeMissions: activeMissions.filter((a) => a !== active),
          companions: applyMissionXp(companions, outcome, getLevel(character.totalXp)),
          character: { ...character, gold: character.gold + outcome.gold, essence: character.essence + outcome.essence },
          inventory: [...inventory, ...outcome.items],
          materials: addMaterials(materials, outcome.materials),
        });
        return outcome;
      },

      startBattle: (creatureId, heroic = false) =>
        attempt(() => {
          get().refreshQuestBoards();
          const { character, dailyQuests, village } = get();
          const { creature, area } = getCreature(creatureId);
          const { meal } = get();
          const hero = soloHero(meal);
          if (hero.level < area.minLevel) throw new Error(`${area.name} ist erst ab Level ${area.minLevel} zugänglich.`);
          if (area.dungeon) throw new Error("Dungeon-Gegner kämpfen nur im Dungeon.");
          if (isMimic(creatureId)) throw new Error("Mimics warten in Truhen – herausfordern kann man sie nicht.");
          const wait = respawnLeft(get().bossRespawns, creatureId);
          if (wait > 0) throw new Error(`${creature.name} erscheint erst in ${formatRespawn(wait)} wieder.`);
          if (heroic && !isHeroicUnlocked(creatureId, get().records.bossesDefeated)) {
            throw new Error(`Besiege ${creature.name} zuerst, dann kannst du ihn heroisch fordern.`);
          }
          // Offener Steckbrief: die gesuchte Kreatur erscheint genau so als Elite
          const bounty = heroic ? null : openBounty(dailyQuests, creatureId, village.board);
          // Selten erscheint statt der Kreatur ihre benannte Variante (nicht bei einem Steckbrief)
          const rare = heroic || bounty ? null : rollRare(creatureId);
          // Manchmal kommt ein Rudel aus drei schwächeren Artgenossen – nie als Elite
          const pack = !heroic && !bounty && !rare && rollPack(creatureId);
          const elite = heroic ? heroicAffixes(creatureId) : (bounty ?? (rare ? [...rare.affixes] : pack ? [] : rollElite(creature)));
          const started = startBattle(newId(), character.name, hero, rare ? rareCreature(rare) : creature, hero.maxHp, elite, pack);
          const battle = heroic ? makeHeroic(started) : rare ? { ...started, rare: rare.id } : started;
          set({ battle, battleReward: null, areaChest: null, dungeon: null, tower: null, raid: null, meal: null, mealInUse: meal });
          EventBus.emit("battle:started", { battle });
        }),

      startDungeon: (dungeonId, heroic = false) =>
        attempt(() => {
          const dungeon = getDungeon(dungeonId);
          const { meal } = get();
          const hero = soloHero(meal);
          if (hero.level < dungeon.minLevel) {
            throw new Error(`${dungeon.name} ist erst ab Level ${dungeon.minLevel} zugänglich.`);
          }
          const boss = dungeon.creatures.at(-1)!;
          if (heroic && !isHeroicUnlocked(boss.id, get().records.bossesDefeated)) {
            throw new Error(`Besiege ${boss.name} zuerst, dann kannst du den Dungeon heroisch betreten.`);
          }
          const map = get().treasureMaps.find((m) => m.dungeonId === dungeonId);
          const run = newDungeonRun(dungeonId, newId(), heroic, map?.id);
          // Das Gericht gilt ab dem ersten Kampf (soloHero liest mealInUse)
          set({ mealInUse: meal });
          const battle = dungeonBattle(run, stepCreature(dungeon, run.seed, 0), null);
          set({
            battle,
            battleReward: null,
            dungeon: run,
            tower: null,
            raid: null,
            // Das Gericht wirkt im ganzen Dungeon
            meal: null,
            mealInUse: meal,
          });
          EventBus.emit("battle:started", { battle });
        }),

      startTower: () =>
        attempt(() => {
          const { meal } = get();
          const hero = soloHero(meal);
          if (hero.level < TOWER_MIN_LEVEL) throw new Error(`Der Endlos-Turm ist erst ab Level ${TOWER_MIN_LEVEL} zugänglich.`);
          const tower: TowerRun = { seed: newId(), floor: 1, chest: EMPTY_CHEST, blessings: [], secondWindUsed: false, offer: null, claimed: null };
          // Das Gericht wirkt den ganzen Lauf über
          set({ meal: null, mealInUse: meal });
          const battle = towerBattle(tower, null);
          set({ battle, battleReward: null, dungeon: null, tower, raid: null });
          EventBus.emit("battle:started", { battle });
        }),

      nextTowerFloor: () =>
        attempt(() => {
          const { battle, tower } = get();
          if (!tower || !battle || battle.status !== "won" || tower.claimed) throw new Error("Kein Stockwerk gewonnen.");
          if (tower.offer) throw new Error("Wähle zuerst einen Segen.");
          const next = { ...tower, floor: tower.floor + 1 };
          const nextBattle = towerBattle(next, battle.hero.hp);
          set({ battle: nextBattle, battleReward: null, tower: next });
          EventBus.emit("battle:started", { battle: nextBattle });
        }),

      chooseBlessing: (id) =>
        attempt(() => {
          const { battle, tower } = get();
          if (!tower?.offer || !battle) throw new Error("Gerade gibt es keinen Segen zur Wahl.");
          if (!tower.offer.includes(id)) throw new Error("Dieser Segen steht nicht zur Wahl.");
          const blessings = [...tower.blessings, id];
          const { records } = get();
          set({
            records: { ...records, towerBlessings: Math.max(records.towerBlessings, blessings.length) },
            tower: { ...tower, blessings, offer: null },
            battle: blessBattle(battle, tower.blessings, id),
          });
        }),

      leaveTowerWithChest: () =>
        attempt(() => {
          const { battle, tower } = get();
          if (!tower || !battle || battle.status !== "won") throw new Error("Nur nach einem Sieg möglich.");
          claimTowerChest();
        }),

      nextDungeonFight: () =>
        attempt(() => {
          const { battle, dungeon } = get();
          if (!dungeon || !battle || battle.status !== "won" || dungeon.claimed) throw new Error("Kein Dungeon-Kampf gewonnen.");
          if (dungeon.room && !isRoomDone(dungeon.room)) throw new Error("Schliesse zuerst den Raum ab.");
          if (dungeon.doors) throw new Error("Wähle zuerst eine Tür.");
          const area = getDungeon(dungeon.dungeonId);
          const stage = dungeon.stage + 1;
          if (stage >= area.creatures.length) throw new Error("Der Dungeon ist schon abgeschlossen.");
          // Keine Heilung zwischen den Kämpfen: die Lebenspunkte werden mitgenommen.
          const run: DungeonRun = { ...dungeon, stage, path: [...dungeon.path, "fight"], room: null };
          const next = dungeonBattle(run, stepCreature(area, run.seed, stage), battle.hero.hp);
          set({ battle: next, battleReward: null, dungeon: run });
          EventBus.emit("battle:started", { battle: next });
        }),

      chooseDungeonDoor: (index) =>
        attempt(() => {
          const { battle, dungeon } = get();
          if (!dungeon || !battle || battle.status !== "won" || dungeon.claimed) throw new Error("Kein Dungeon-Kampf gewonnen.");
          if (dungeon.room && !isRoomDone(dungeon.room)) throw new Error("Schliesse zuerst den Raum ab.");
          const door = dungeon.doors?.[index];
          if (!door) throw new Error("Diese Tür gibt es nicht.");
          const area = getDungeon(dungeon.dungeonId);
          const stage = dungeon.stage + 1;
          const { seed } = dungeon;
          const moved: DungeonRun = { ...dungeon, stage, path: [...dungeon.path, door.kind], doors: null, room: null };

          if (door.kind === "treasure") {
            // Der Schatz gehört sofort dir – auch wenn du danach fällst. Er zählt nicht als Raum ohne Kampf.
            const { treasureMaps, inventory, bossCollection, visitors, character } = get();
            const find = rollTreasure(getLevel(character.totalXp), visitors.recipes, newId());
            if (find.kind === "item") set({ inventory: [...inventory, find.item], bossCollection: addToCollection(bossCollection, find.item) });
            else set({ visitors: { ...visitors, recipes: [...visitors.recipes, find.foodId] } });
            const run: DungeonRun = { ...moved, treasureMap: undefined, room: { kind: "treasure", find } };
            set({
              treasureMaps: treasureMaps.filter((m) => m.id !== dungeon.treasureMap),
              dungeon: { ...run, doors: nextDoors(area, run) },
              battleReward: null,
            });
            return;
          }

          if (door.kind === "story") {
            // Geschichtstür: zählt nicht als Raum ohne Kampf, die Wahl fällt im Raum
            const found = storySceneFor(get().visitors, area.id);
            if (!found) throw new Error("Hier geht gerade keine Geschichte weiter.");
            const run: DungeonRun = { ...moved, room: { kind: "story", visitorId: found.visitor.id, outcome: null } };
            set({ dungeon: { ...run, doors: nextDoors(area, run) }, battleReward: null });
            return;
          }

          if (!isCalm(door.kind)) {
            const creature = stepCreature(area, seed, stage);
            const elite = door.kind === "elite" ? eliteRoomAffixes(area, seed, stage) : undefined;
            const next = dungeonBattle(moved, creature, battle.hero.hp, elite);
            set({ battle: next, battleReward: null, dungeon: moved });
            EventBus.emit("battle:started", { battle: next });
            return;
          }

          // Raum ohne Kampf: höchstens einer pro Abschnitt
          const calm: [boolean, boolean] = [...moved.calm];
          calm[sectionOf(area, stage)] = true;
          let seen = moved.seen;
          let room: DungeonRoom;
          if (door.kind === "shrine") room = { kind: "shrine", offer: shrineOffer(seed, stage, moved.blessings), chosen: null };
          else if (door.kind === "merchant") room = { kind: "merchant", offers: merchantOffers(area, seed, stage, moved.blessings), bought: [] };
          else if (door.kind === "trap") {
            const trap = pickTrap(seed, stage, seen);
            seen = [...seen, trap.id];
            room = { kind: "trap", trapId: trap.id, outcome: null };
          } else if (door.kind === "chest") room = { kind: "chest", outcome: null };
          else {
            const { riddle, options } = pickRiddle(seed, stage, seen);
            seen = [...seen, riddle.id];
            room = { kind: "riddle", riddleId: riddle.id, options, outcome: null };
          }
          const run: DungeonRun = { ...moved, calm, seen, room };
          set({ dungeon: { ...run, doors: nextDoors(area, run) }, battleReward: null });
        }),

      dungeonBlessing: (id) =>
        attempt(() => {
          const { dungeon, battle, room } = currentRoom("shrine");
          if (room.chosen) throw new Error("Du hast hier schon einen Segen gewählt.");
          if (!room.offer.includes(id)) throw new Error("Dieser Segen steht nicht zur Wahl.");
          set({
            battle: blessBattle(battle, dungeon.blessings, id),
            dungeon: { ...dungeon, blessings: [...dungeon.blessings, id], room: { ...room, chosen: id } },
          });
        }),

      dungeonBuy: (index) =>
        attempt(() => {
          const { dungeon, battle, room } = currentRoom("merchant");
          const offer = room.offers[index];
          if (!offer) throw new Error("Dieses Angebot gibt es nicht.");
          if (room.bought.includes(index)) throw new Error("Das hast du schon gekauft.");
          const { character, potions } = get();
          if (character.gold < offer.price) throw new Error("Nicht genug Gold.");
          const bought = { ...dungeon, room: { ...room, bought: [...room.bought, index] } };
          set({ character: { ...character, gold: character.gold - offer.price } });
          if (offer.kind === "potion") {
            set({ dungeon: bought, potions: { ...potions, [offer.potionId]: (potions[offer.potionId] ?? 0) + 1 } });
          } else if (offer.kind === "care") {
            const hp = Math.min(battle.hero.maxHp, battle.hero.hp + Math.round(battle.hero.maxHp * offer.percent));
            set({ dungeon: bought, battle: { ...battle, hero: { ...battle.hero, hp } } });
          } else {
            set({
              dungeon: { ...bought, blessings: [...dungeon.blessings, offer.blessing] },
              battle: blessBattle(battle, dungeon.blessings, offer.blessing),
            });
          }
        }),

      payDungeonMerchant: (offer) =>
        set((s) => ({
          character: { ...s.character, gold: Math.max(0, s.character.gold - offer.price) },
          ...(offer.kind === "potion" && { potions: { ...s.potions, [offer.potionId]: (s.potions[offer.potionId] ?? 0) + 1 } }),
        })),

      dungeonTrap: (choice) =>
        attempt(() => {
          const { dungeon, battle, room } = currentRoom("trap");
          if (room.outcome) throw new Error("Die Falle ist schon ausgelöst.");
          const armorClass = mainArmorClass(getArmorClassSummary(get().equipment).pieces);
          const { dodged, damage } = trapOutcome(choice, armorClass, battle.hero.maxHp, battle.hero.hp, Math.random);
          // Hinter der Falle: Beute wie von einem Gegner des Dungeons, aber ohne Erfahrung
          const creature = stepCreature(getDungeon(dungeon.dungeonId), dungeon.seed, dungeon.stage);
          const reward = dungeonLoot({ ...rollBattleReward(creature, soloHero(), newId()), xp: 0 }, dungeon.blessings);
          set({
            battle: { ...battle, hero: { ...battle.hero, hp: battle.hero.hp - damage } },
            dungeon: { ...dungeon, chest: addToChest(dungeon.chest, reward), room: { ...room, outcome: { choice, dodged, damage, reward } } },
          });
        }),

      dungeonRiddle: (answer) =>
        attempt(() => {
          const { dungeon, battle, room } = currentRoom("riddle");
          if (room.outcome) throw new Error("Das Rätsel ist schon beantwortet.");
          if (!room.options.includes(answer)) throw new Error("Diese Antwort steht nicht zur Wahl.");
          const riddle = getRiddle(room.riddleId);
          const area = getDungeon(dungeon.dungeonId);
          const creature = stepCreature(area, dungeon.seed, dungeon.stage);
          if (answer === riddle.answer) {
            // Richtig: Beute wie von einem Elite-Gegner, aber ohne Erfahrung
            const reward = dungeonLoot({ ...rollBattleReward(creature, soloHero(), newId(), Math.random, [], true), xp: 0 }, dungeon.blessings);
            set({
              dungeon: {
                ...dungeon,
                chest: addToChest(dungeon.chest, reward),
                room: { ...room, outcome: { answer, correct: true, damage: 0, reward } },
              },
            });
            return;
          }
          if (riddle.failure === "guardian") {
            // Falsch: ein Wächter erwacht – ein Kampf, danach geht es weiter wie nach jedem Sieg
            const run: DungeonRun = { ...dungeon, room: null, doors: null };
            const next = dungeonBattle(run, creature, battle.hero.hp);
            set({ battle: next, battleReward: null, dungeon: run });
            EventBus.emit("battle:started", { battle: next });
            return;
          }
          const damage = Math.min(Math.round(battle.hero.maxHp * RIDDLE_DAMAGE), battle.hero.hp - 1);
          set({
            battle: { ...battle, hero: { ...battle.hero, hp: battle.hero.hp - damage } },
            dungeon: { ...dungeon, room: { ...room, outcome: { answer, correct: false, damage, reward: null } } },
          });
        }),

      dungeonChest: (choice) =>
        attempt(() => {
          const { dungeon, battle, room } = currentRoom("chest");
          if (room.outcome) throw new Error("Mit der Truhe bist du schon fertig.");
          if (choice === "leave") {
            set({ dungeon: { ...dungeon, room: { ...room, outcome: { choice } } } });
            return;
          }
          const area = getDungeon(dungeon.dungeonId);
          if (isMimicChest(dungeon.seed, dungeon.stage)) {
            // Die Truhe beisst zurück: ein Kampf gegen den Mimic, danach geht es weiter wie nach jedem Sieg
            const run: DungeonRun = { ...dungeon, room: null, doors: null };
            const next = dungeonBattle(run, getMimic(area), battle.hero.hp, []);
            set({ battle: next, battleReward: null, dungeon: run });
            EventBus.emit("battle:started", { battle: next });
            return;
          }
          const creature = stepCreature(area, dungeon.seed, dungeon.stage);
          const reward = dungeonLoot(chestReward(creature, soloHero(), newId()), dungeon.blessings);
          set({
            dungeon: { ...dungeon, chest: addToChest(dungeon.chest, reward), room: { ...room, outcome: { choice, reward } } },
          });
        }),

      dungeonStoryChoice: (optionId) =>
        attempt(() => {
          const { dungeon, battle, room } = currentRoom("story");
          if (room.outcome) throw new Error("Hier hast du dich schon entschieden.");
          const found = storySceneFor(get().visitors, dungeon.dungeonId);
          if (!found || found.visitor.id !== room.visitorId) throw new Error("Diese Geschichte geht gerade nicht weiter.");
          const option = getSceneOption(found.scene, optionId);
          const area = getDungeon(dungeon.dungeonId);
          const chosen: DungeonRun = {
            ...dungeon,
            storyChoice: option.id,
            ...(option.weakenBoss && { bossWeaken: option.weakenBoss }),
            ...(option.blessing && { blessings: [...dungeon.blessings, option.blessing] }),
          };
          if (option.fight) {
            // Zusatzkampf: Elite mit zwei Modifikatoren, danach geht es weiter wie nach jedem Sieg
            const run: DungeonRun = { ...chosen, room: null, doors: null };
            const next = dungeonBattle(run, getCreature(option.fight).creature, battle.hero.hp, eliteRoomAffixes(area, dungeon.seed, dungeon.stage));
            set({ battle: next, battleReward: null, dungeon: run });
            EventBus.emit("battle:started", { battle: next });
            return;
          }
          let hero = option.blessing ? blessBattle(battle, dungeon.blessings, option.blessing) : battle;
          let test: { dodged: boolean; damage: number } | null = null;
          if (option.test) {
            const armorClass = mainArmorClass(getArmorClassSummary(get().equipment).pieces);
            test = sceneTestOutcome(armorClass, hero.hero.maxHp, hero.hero.hp, Math.random);
            hero = { ...hero, hero: { ...hero.hero, hp: hero.hero.hp - test.damage } };
          }
          set({
            battle: hero,
            dungeon: { ...chosen, room: { ...room, outcome: { optionId: option.id, ...(test && { dodged: test.dodged, damage: test.damage }) } } },
          });
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
          const { battle, character, dungeon } = get();
          if (!battle) return;
          const result = attackRound(battle, Math.random, ability);
          set({ battle: result.state, battleReward: null });
          EventBus.emit("battle:events", { battle: result.state, events: result.events });
          if (result.state.status === "lost") loseRaid();
          if (result.state.status !== "won") return;

          const { raid } = get();
          if (raid && battle.raidWave) {
            // Überfall: Beute in die Truhe, nach dem Anführer wird alles gutgeschrieben
            const { creature } = raid.lineup[raid.wave];
            const { records } = get();
            set({
              records: {
                ...records,
                battlesWon: records.battlesWon + 1,
                closeCall: records.closeCall || result.state.hero.hp < result.state.hero.maxHp * 0.05,
              },
            });
            const elite = (result.state.elite?.length ?? 0) > 0;
            const questItems = questEvent({ kind: "kill", creatureId: creature.id, boss: false, elite });
            const treasureMap = findTreasureMap(elite);
            const raw = rollBattleReward(creature, soloHero(), newId(), Math.random, [], elite);
            const reward = { ...raw, xp: statueXp(raw.xp, tiers().statue) };
            const level = getLevel(character.totalXp);
            set({
              battleReward: { ...reward, levelBefore: level, levelAfter: level, questItems, treasureMap },
              raid: { ...raid, chest: addToChest(raid.chest, reward) },
            });
            if (raid.wave === raid.lineup.length - 1) claimRaid();
            return;
          }

          const { tower } = get();
          if (tower && battle.towerFloor) {
            // Turm: Beute in die Truhe (mit Stockwerk-Bonus, ohne Boss-Items), Rekord, Segen zur Wahl.
            // Turm-Bosse zählen nicht als Bosssiege – sie kämpfen schwächer und haben keinen Respawn.
            const { records, towerRecord } = get();
            const hero = soloHero();
            const creature = floorCreature(tower.seed, tower.floor, hero.level);
            set({
              records: {
                ...records,
                battlesWon: records.battlesWon + 1,
                closeCall: records.closeCall || result.state.hero.hp < result.state.hero.maxHp * 0.05,
                towerBest: Math.max(records.towerBest, tower.floor),
                towerBosses: records.towerBosses + (creature.boss ? 1 : 0),
              },
            });
            const questItems = creature.boss ? [] : questEvent({ kind: "kill", creatureId: creature.id, boss: false });
            questEvent({ kind: "towerFloor", floor: tower.floor });
            const elite = (result.state.elite?.length ?? 0) > 0;
            const rolled = rollBattleReward(creature, hero, newId(), Math.random, defeatedAdds(result.state), elite);
            const reward = { ...rolled, xp: statueXp(rolled.xp, tiers().statue) };
            const scaled = towerReward(reward, tower.floor, tower.blessings, elite);
            const treasureMap = findTreasureMap(elite || !!creature.boss);
            const level = getLevel(character.totalXp);
            set({
              battleReward: { ...scaled, levelBefore: level, levelAfter: level, questItems, treasureMap },
              tower: {
                ...tower,
                chest: addToChest(tower.chest, scaled),
                secondWindUsed: !!result.state.secondWindUsed,
                // Item-Effekt „Turmläufer“: ein Segen mehr zur Wahl
                offer: isBlessingFloor(tower.floor)
                  ? blessingOffer(tower.seed, tower.floor, tower.blessings, hero.itemEffects?.includes("towerRunner") ? 4 : 3)
                  : null,
              },
              towerRecord: recordFloor(towerRecord, tower.floor),
            });
            return;
          }

          const { creature } = getCreature(battle.creatureId);
          const heroic = !!result.state.heroic;
          const rare = result.state.rare ? getRare(result.state.rare) : null;
          const { records } = get();
          const rareFirst = !!rare && !records.raresDefeated.includes(rare.id);
          set({
            records: {
              ...records,
              battlesWon: records.battlesWon + 1,
              ...(rareFirst && { raresDefeated: [...records.raresDefeated, rare.id] }),
              bossesDefeated:
                creature.boss && !records.bossesDefeated.includes(creature.id)
                  ? [...records.bossesDefeated, creature.id]
                  : records.bossesDefeated,
              closeCall: records.closeCall || result.state.hero.hp < result.state.hero.maxHp * 0.05,
              heroicDefeated:
                heroic && !records.heroicDefeated.includes(creature.id)
                  ? [...records.heroicDefeated, creature.id]
                  : records.heroicDefeated,
            },
            bossRespawns: startRespawn(get().bossRespawns, creature.id),
          });
          // Die Zusatzmechanik eines heroischen Bosses macht ihn nicht zum Elite-Gegner
          const elite = (result.state.elite?.length ?? 0) > 0 && !heroic;
          const questItems = questEvent({ kind: "kill", creatureId: creature.id, boss: creature.boss, elite });
          // Besiegte Begleiter zählen für Aufträge und geben etwas XP und Gold
          const adds = defeatedAdds(result.state);
          for (const add of adds) questItems.push(...questEvent({ kind: "kill", creatureId: add.id, boss: false }));
          // Ein Mimic gibt Elite-Beute, auch ohne Elite-Modifikator
          const mimic = isMimic(creature.id);
          const treasureMap = findTreasureMap(elite || heroic || mimic || !!creature.boss || !!creature.midBoss);
          const uid = newId();
          const raw = mimic
            ? mimicReward(creature, soloHero(), uid)
            : rare
              ? rareReward(rare, soloHero(), uid)
              : result.state.pack
                ? packReward(rollBattleReward(creature, soloHero(), uid), creature, uid)
                : rollBattleReward(creature, soloHero(), uid, Math.random, adds, elite, heroic);
          // Statue im Dorf: mehr XP aus Solo-Kämpfen (der Koop bleibt unberührt)
          const rolled = { ...raw, xp: statueXp(raw.xp, tiers().statue) };
          if (dungeon) {
            // Im Dungeon kommt die Beute in die Truhe – gutgeschrieben wird erst am Ende. Material gibt es doppelt.
            const reward = dungeonLoot(rolled, dungeon.blessings);
            const level = getLevel(character.totalXp);
            const run: DungeonRun = {
              ...dungeon,
              chest: addToChest(dungeon.chest, reward),
              secondWindUsed: !!result.state.secondWindUsed,
            };
            set({
              battleReward: { ...reward, levelBefore: level, levelAfter: level, questItems, treasureMap },
              dungeon: { ...run, doors: nextDoors(getDungeon(dungeon.dungeonId), run) },
            });
            if (dungeon.stage === getDungeon(dungeon.dungeonId).creatures.length - 1) claimChest(true);
            return;
          }
          const reward = rolled;
          const potionDrops: Record<string, number> = {};
          if (reward.potions) potionDrops[reward.potions.potionId] = reward.potions.count;
          if (reward.buffPotion) potionDrops[reward.buffPotion] = (potionDrops[reward.buffPotion] ?? 0) + 1;
          const items = [reward.loot, reward.bossLoot].filter((i) => i !== null);
          const levels = grantRewards(reward.xp, reward.gold, items, potionDrops, reward.materials);
          // Selten bleibt eine alte Truhe zurück – nach einem Mimic nicht noch eine
          set({
            battleReward: { ...reward, ...levels, questItems, treasureMap, ...(rare && { rare: { id: rare.id, first: rareFirst } }) },
            areaChest: mimic ? get().areaChest : rollAreaChest(creature.id),
          });
          if (levels.levelAfter > levels.levelBefore) {
            EventBus.emit("character:levelup", { from: levels.levelBefore, to: levels.levelAfter });
          }
        }),

      battleTarget: (target) =>
        attempt(() => {
          const { battle } = get();
          if (!battle || battle.status !== "active") return;
          set({ battle: setTarget(battle, target) });
          EventBus.emit("battle:target", { battleId: battle.id, target });
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
          claimTowerChest();
        }),

      openAreaChest: (choice) =>
        attempt(() => {
          const { areaChest, battle, character } = get();
          if (!areaChest || !battle || battle.status !== "won" || battle.creatureId !== areaChest.creatureId) {
            throw new Error("Hier steht keine Truhe.");
          }
          if (areaChest.outcome) throw new Error("Mit der Truhe bist du schon fertig.");
          if (choice === "leave") {
            set({ areaChest: { ...areaChest, outcome: { choice, reward: null } } });
            return;
          }
          if (areaChest.mimic) {
            // Die Truhe beisst zurück: Kampf mit den LP, die vom Kampf davor übrig sind
            const next = startBattle(newId(), character.name, soloHero(), getAreaMimic(areaChest.creatureId), battle.hero.hp, []);
            set({ battle: next, battleReward: null, areaChest: { ...areaChest, outcome: { choice, reward: null } } });
            EventBus.emit("battle:started", { battle: next });
            return;
          }
          // Echte Truhe: Beute wie von der besiegten Kreatur, aber ohne Erfahrung – sofort gutgeschrieben
          const reward = chestReward(getCreature(areaChest.creatureId).creature, soloHero(), newId());
          const potionDrops: Record<string, number> = {};
          if (reward.potions) potionDrops[reward.potions.potionId] = reward.potions.count;
          if (reward.buffPotion) potionDrops[reward.buffPotion] = (potionDrops[reward.buffPotion] ?? 0) + 1;
          const items = [reward.loot, reward.bossLoot].filter((i) => i !== null);
          grantRewards(0, reward.gold, items, potionDrops, reward.materials);
          set({ areaChest: { ...areaChest, outcome: { choice, reward } } });
        }),

      leaveBattle: () =>
        set((s) => ({
          battle: null,
          battleReward: null,
          areaChest: null,
          dungeon: null,
          tower: null,
          raid: null,
          // Den Ausgang des Überfalls hat man im Kampf gesehen – das Dorf muss ihn nicht noch einmal melden
          ...(s.raid?.report && { raids: { ...s.raids, report: null } }),
        })),

      consumePotion: (potionId) =>
        set((s) => ({ potions: { ...s.potions, [potionId]: Math.max(0, (s.potions[potionId] ?? 0) - 1) } })),

      grantCoopReward: (reward, bossId) => {
        const chest = addToChest(EMPTY_CHEST, reward);
        const levels = grantRewards(chest.xp, chest.gold, chest.items, chest.potions, chest.materials);
        set((s) => ({ coopStats: recordCoopWin(s.coopStats, bossId) }));
        const questItems = questEvent({ kind: "kill", creatureId: bossId, boss: true });
        const treasureMap = findTreasureMap(true);
        if (levels.levelAfter > levels.levelBefore) {
          EventBus.emit("character:levelup", { from: levels.levelBefore, to: levels.levelAfter });
        }
        return { ...chest, ...levels, completed: true, questItems, treasureMap };
      },

      grantCoopDungeon: (chest, dungeonId, completed, heroic = false) => {
        const levels = grantRewards(chest.xp, chest.gold, chest.items, chest.potions, chest.materials);
        const questItems: QuestItemFind[] = [];
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
              heroicDefeated:
                heroic && !s.records.heroicDefeated.includes(bossId) ? [...s.records.heroicDefeated, bossId] : s.records.heroicDefeated,
            },
          }));
          // Im Koop zählt der Endboss als besiegter Boss, dazu der abgeschlossene Dungeon
          questItems.push(...questEvent({ kind: "kill", creatureId: bossId, boss: true }));
          questEvent({ kind: "dungeon", dungeonId });
        }
        // Wer bis zum Endboss dabei war, hat die Chance eines Bosssiegs – wer vorher aussteigt, die eines gewöhnlichen
        const treasureMap = findTreasureMap(completed);
        if (levels.levelAfter > levels.levelBefore) {
          EventBus.emit("character:levelup", { from: levels.levelBefore, to: levels.levelAfter });
        }
        return { ...chest, ...levels, completed, questItems, treasureMap };
      },
      };
    },
    {
      name: SAVE_KEY,
      version: 23,
      partialize: (s) => ({
        character: s.character,
        questLog: s.questLog,
        dailyQuests: s.dailyQuests,
        weeklyQuests: s.weeklyQuests,
        inventory: s.inventory,
        equipment: s.equipment,
        potions: s.potions,
        shop: s.shop,
        lastShopReroll: s.lastShopReroll,
        shopRerolls: s.shopRerolls,
        bossCollection: s.bossCollection,
        bossRespawns: s.bossRespawns,
        coopStats: s.coopStats,
        records: s.records,
        achievements: s.achievements,
        cosmetics: s.cosmetics,
        towerRecord: s.towerRecord,
        village: s.village,
        materials: s.materials,
        meal: s.meal,
        companions: s.companions,
        recruitPool: s.recruitPool,
        missionBoard: s.missionBoard,
        activeMissions: s.activeMissions,
        appliedTrades: s.appliedTrades,
        visitors: s.visitors,
        raids: s.raids,
        treasureMaps: s.treasureMaps,
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
