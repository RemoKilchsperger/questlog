// Besucher im Dorf (docs/besucher.md): Feste Besucher kommen zu Level-Meilensteinen,
// einer nach dem anderen, und bleiben, bis ihre Geschichte erledigt ist – drei
// Kapitel, bei manchen am Ende eine Entscheidung. Durchreisende kommen nach Zeit,
// bleiben 24 Stunden und haben eine kurze Bitte. Quest-Gegenstände (Ziel `fetch`)
// fallen mit einer Chance bei Siegen gegen eine bestimmte Kreatur. Reine Logik ohne
// UI, der Zufall kommt über `rng` herein.

import { getCreature, AREAS, DUNGEONS, isAreaUnlocked, type CreatureDef } from "./creatures";
import { FOODS } from "./food";
import { BUFF_POTIONS } from "./potions";
import {
  BOSS_WEIGHTS,
  dailyCandidates,
  advanceQuest,
  isQuestComplete,
  questReward,
  type QuestDef,
  type QuestEvent,
  type QuestGoal,
  type QuestReward,
  type TrackedQuest,
} from "./quests";
import { materialForLevel, type MaterialStock } from "./village";
import type { CompanionTrait } from "./companions";
import type { Rarity } from "./types";

/* ───────────── Geschenke ───────────── */

/** Was ein Besucher am Ende gibt – zusätzlich zu EP und Gold. */
export type VisitorGift =
  /** Er schliesst sich als Begleiter an (belegt keinen Platz in der Taverne) */
  | { kind: "companion"; name: string; traits: CompanionTrait[] }
  /** Ein Unikat aus items.ts (`VISITOR_ITEMS`), legendär mit festem Effekt */
  | { kind: "unique"; itemId: string }
  /** Schaltet ein Gericht in der Taverne frei (food.ts, `recipe`) */
  | { kind: "recipe"; foodId: string }
  | { kind: "potions"; potions: Record<string, number> }
  | { kind: "materials"; materials: MaterialStock }
  /** Ein ausgewürfeltes Item mit diesen Seltenheits-Gewichten */
  | { kind: "loot"; weights: Record<Rarity, number> }
  | { kind: "gold"; gold: number };

/* ───────────── Feste Besucher ───────────── */

export interface VisitorChapter {
  title: string;
  /** Was der Besucher erzählt, wenn er das Kapitel vergibt */
  story: string;
  goal: QuestGoal;
  /** Was er sagt, wenn man das Kapitel erfüllt zurückbringt */
  thanks: string;
}

export interface VisitorChoiceOption {
  id: string;
  /** Text auf dem Knopf */
  label: string;
  /** Antwort des Besuchers */
  reply: string;
  gift: VisitorGift;
  /** Faktor auf EP und Gold des letzten Kapitels */
  rewardFactor?: number;
}

export interface FixedVisitorDef {
  id: string;
  name: string;
  /** „verwundeter Söldner“ */
  role: string;
  icon: string;
  /** Gebiet, in dem die Geschichte spielt */
  areaId: string;
  /** Ab diesem Level kommt er ins Dorf */
  level: number;
  /** Erste Begegnung */
  intro: string;
  chapters: VisitorChapter[];
  /** Ohne Entscheidung: das Geschenk am Ende */
  gift?: VisitorGift;
  /** Entscheidung beim Abgeben des letzten Kapitels */
  choice?: { prompt: string; options: VisitorChoiceOption[] };
  /** Abschied, wenn es keine Entscheidung gibt */
  farewell: string;
}

/** Chance auf den Quest-Gegenstand bei einem normalen Gegner – Elite und Bosse lassen ihn immer fallen. */
export const FETCH_CHANCE = 0.4;

const kill = (creatureId: string, count: number): QuestGoal => ({ kind: "kill", creatureId, count });
const bring = (creatureId: string, count: number, item: string, icon: string): QuestGoal => ({ kind: "fetch", creatureId, count, item, icon });

export const FIXED_VISITORS: readonly FixedVisitorDef[] = [
  {
    id: "bram",
    name: "Bram",
    role: "verwundeter Söldner",
    icon: "🤺",
    areaId: "darkwood",
    level: 3,
    intro:
      "Ein Mann mit verbundenem Arm lehnt am Brunnen. „Bram, Söldner der Grauen Lanzen. Was davon übrig ist. Krummzahns Goblins haben uns im Düsterwald überrannt. Ich kann kaum ein Schwert halten – aber du siehst aus, als könntest du es.“",
    chapters: [
      {
        title: "Wölfe auf der Fährte",
        story: "„Die Grauwölfe wittern das Blut meiner Leute. Bevor ich zurück in den Wald kann, müssen sie weg.“",
        goal: kill("grey-wolf", 4),
        thanks: "„Gut. Jetzt kann ich wenigstens nach den Gefallenen sehen.“",
      },
      {
        title: "Die Plünderer",
        story: "„Die Plünderer haben unsere Waffen genommen und tragen sie jetzt selbst. Zeig ihnen, dass sie ihnen nicht gehören.“",
        goal: kill("goblin-raider", 5),
        thanks: "„Das war die Klinge von Hennes. Er hätte gelacht, wenn er dich gesehen hätte.“",
      },
      {
        title: "Das Banner der Grauen Lanzen",
        story: "„Krummzahn trägt unser Banner als Umhang. Hol es zurück. Solange er es hat, sind wir nichts als Beute.“",
        goal: bring("goblin-chief", 1, "Banner der Grauen Lanzen", "🏳️"),
        thanks: "Bram streicht über den zerrissenen Stoff. „Die Grauen Lanzen gibt es noch. Zwei Mann stark – du und ich.“",
      },
    ],
    gift: { kind: "companion", name: "Bram", traits: [{ id: "veteran", rarity: "legendary" }, { id: "lucky", rarity: "epic" }] },
    farewell: "„Ich warte in der Taverne. Wann immer du eine Klinge brauchst, die für dich kämpft.“",
  },
  {
    id: "mirla",
    name: "Mirla",
    role: "Kräuterfrau",
    icon: "🌿",
    areaId: "mistmarsh",
    level: 12,
    intro:
      "Eine alte Frau mit einem Korb voller getrockneter Blüten sieht dich prüfend an. „Meine Grossmutter hat einen Eintopf gekocht, von dem die Holzfäller drei Tage satt waren. Ich habe das Rezept. Was mir fehlt, wächst in den Nebelsümpfen – und dort wohnt nichts Freundliches.“",
    chapters: [
      {
        title: "Moorlilien",
        story: "„Moorlilien blühen nur, wo die Sumpfkröten laichen. Die Kröten lassen dich nicht freiwillig ran.“",
        goal: bring("marsh-toad", 4, "Moorlilie", "🌱"),
        thanks: "„Riech mal. So riecht der Sumpf, wenn er gute Laune hat.“",
      },
      {
        title: "Ein Hauch Gift",
        story: "„Ein Tropfen Schlangengift macht den Eintopf scharf. Zwei Tropfen machen ihn tödlich. Bring mir genug für beides – ich zähle selbst ab.“",
        goal: bring("bog-serpent", 3, "Schlangengift", "🐍"),
        thanks: "„Vorsichtig, vorsichtig … Die Flasche nicht schütteln.“",
      },
      {
        title: "Die alte Schuppe",
        story: "„Das Geheimnis meiner Grossmutter: eine Schuppe der uralten Sumpfechse, im Topf mitgekocht. Ja, wirklich. Nein, ich weiss auch nicht, wie sie darauf kam.“",
        goal: bring("ancient-lizard", 1, "Schuppe der Uralten", "🦎"),
        thanks: "Mirla legt die Schuppe in den Korb und kritzelt etwas auf ein Stück Pergament. „Hier. Gib das dem Wirt. Und sag ihm, er soll nicht am Gift sparen.“",
      },
    ],
    gift: { kind: "recipe", foodId: "lilyStew" },
    farewell: "„Der Sumpf hat mir genug Jahre geschenkt. Jetzt koche ich für meine Enkel.“",
  },
  {
    id: "torbin",
    name: "Torbin",
    role: "Zwergenprospektor",
    icon: "⛏️",
    areaId: "crystal-caves",
    level: 22,
    intro:
      "Ein Zwerg mit russverschmiertem Bart stapft durchs Tor. „Torbin. Mein Bruder Durim und ich haben in den Kristallhöhlen eine Ader gefunden, so rein wie Quellwasser. Dann ist der Stollen eingestürzt. Ich bin raus. Er nicht.“",
    chapters: [
      {
        title: "Verschüttete Gänge",
        story: "„Felswürmer haben die Gänge zum Einsturz gebracht. Solange sie wühlen, kommt keiner zu Durim durch.“",
        goal: kill("rock-worm", 6),
        thanks: "„Die Stollen halten wieder. Ich höre nichts – aber das heisst nichts. Durim war nie laut.“",
      },
      {
        title: "Durims Notizen",
        story: "„Die Golems haben unser Lager zertrampelt. Durim hat alles aufgeschrieben, jeden Gang. Wenn wir seine Notizen finden, finden wir ihn.“",
        goal: bring("stone-golem", 2, "Durims Notizen", "📖"),
        thanks: "Torbin blättert lange. „Die letzte Seite … er ist tiefer gegangen. Zum Auge.“",
      },
      {
        title: "Das Auge in der Tiefe",
        story: "„Das Höhlenauge. Wir haben es ausgelacht, als die Bergleute davon erzählt haben. Bring mich zu ihm – oder bring mir, was davon übrig ist.“",
        goal: bring("cave-eye", 1, "Durims Spitzhacke", "⛏️"),
        thanks: "Torbin nimmt die Spitzhacke und schweigt lange. Dann schlägt er sie auf den Amboss, bis ein Kristall in der Klinge sitzt. „Er hätte gewollt, dass sie weiter gräbt. Nimm sie.“",
      },
    ],
    gift: { kind: "unique", itemId: "unique-torbin-axe" },
    farewell: "„Ich gehe zurück in die Berge. Wenn du einen Zwerg singen hörst – das bin ich, und es geht mir gut.“",
  },
  {
    id: "yrla",
    name: "Yrla",
    role: "Jägerin",
    icon: "🏹",
    areaId: "frost-peaks",
    level: 32,
    intro:
      "Eine Frau in weissem Fell lässt einen Sack Knochen vor dir fallen. „Mein Dorf auf dem Pass. Plattgetrampelt in einer Nacht. Ich jage, was das getan hat. Ich brauche jemanden, der mir den Rücken freihält.“",
    chapters: [
      {
        title: "Das Rudel",
        story: "„Die Schneewölfe folgen der Herde und fressen, was sie liegen lässt. Wo sie sind, ist das Biest nicht weit. Dünn das Rudel aus.“",
        goal: kill("snow-wolf", 6),
        thanks: "„Die Spur führt nach oben, zur Trollbrücke.“",
      },
      {
        title: "Die Trollbrücke",
        story: "„Die Frosttrolle sehen alles, was über ihre Brücke geht. Freiwillig reden die nicht. Überzeug sie.“",
        goal: kill("frost-troll", 4),
        thanks: "„Der letzte hat es ausgespuckt, bevor er umfiel: Graufrost. Das Urmammut.“",
      },
      {
        title: "Graufrost",
        story: "„Ich wusste es. Niemand jagt Graufrost. Heute schon.“",
        goal: kill("primal-mammoth", 1),
        thanks: "Yrla zieht ihr Messer und schneidet ein Stück aus der Flanke des Mammuts. „Bei uns isst der Jäger zuerst. Und damit du nicht für jeden Braten ein Mammut erlegen musst: So macht man ihn bei uns. Gib das dem Wirt.“",
      },
    ],
    gift: { kind: "recipe", foodId: "hunterRoast" },
    farewell: "„Mein Dorf baue ich wieder auf. Wenn du vorbeikommst, gibt es Braten.“",
  },
  {
    id: "stranger",
    name: "Die Fremde",
    role: "Gelehrte aus dem Süden",
    icon: "🎭",
    areaId: "shadow-ruins",
    level: 42,
    intro:
      "Eine Frau in einem dunklen Reisemantel lächelt dich an, als würde sie dich schon kennen. „Ich erforsche die Schattenruinen. Die Seelen dort leiden – ich möchte sie befreien. Dafür brauche ich etwas, das nur jemand wie du beschaffen kann.“",
    chapters: [
      {
        title: "Seelensplitter",
        story: "„Wenn ein Klagegeist vergeht, bleibt ein Splitter seiner Seele zurück. Sammle sie für mich. Vorsichtig – sie sind wertvoll.“",
        goal: bring("wailing-ghost", 4, "Seelensplitter", "👻"),
        thanks: "Sie hält die Splitter gegen das Licht. Für einen Moment glaubst du, ein Gesicht darin zu sehen. „Wunderschön.“",
      },
      {
        title: "Die Bücher der Hexer",
        story: "„Die Hexer haben die Rituale aufgeschrieben, mit denen man Seelen bindet. Und löst, natürlich. Bring mir ihre Bücher.“",
        goal: bring("dark-sorcerer", 2, "Ritualbuch", "📜"),
        thanks: "Sie blättert schnell, zu schnell. Ihre Finger bleiben an einer Seite hängen, die sie dir nicht zeigt.",
      },
      {
        title: "Das Seelengefäss",
        story: "„Der Lichkönig hütet ein Gefäss, in dem er tausend Seelen gefangen hält. Bring es mir – und ich mache allem ein Ende.“",
        goal: bring("lich-king", 1, "Seelengefäss", "⚱️"),
        thanks: "Als du ihr das Gefäss hinhältst, fällt ihre Kapuze zurück. Unter dem Mantel trägt sie dieselben Zeichen wie die Hexer. „Du hast es also bemerkt. Ja – ich will die Seelen nicht befreien. Ich will sie haben.“",
      },
    ],
    choice: {
      prompt: "Gibst du ihr das Seelengefäss?",
      options: [
        {
          id: "give",
          label: "Gefäss übergeben",
          reply: "Sie nimmt das Gefäss und drückt dir ein Zepter in die Hand, kalt wie Grabstein. „Ein Andenken. Es trinkt, was du ihm gibst.“ Dann ist sie fort.",
          gift: { kind: "unique", itemId: "unique-stranger-scepter" },
        },
        {
          id: "refuse",
          label: "Gefäss zerschlagen",
          reply: "Das Gefäss zerspringt auf dem Pflaster. Ein Seufzen geht durch das Dorf, dann ist es still. Die Fremde flucht und verschwindet im Nebel. Am nächsten Morgen bringen die Leute aus dem Dorf dir, was sie entbehren können.",
          gift: { kind: "loot", weights: BOSS_WEIGHTS },
          rewardFactor: 2,
        },
      ],
    },
    farewell: "",
  },
  {
    id: "aldric",
    name: "Aldric",
    role: "alter Drachentöter",
    icon: "🐉",
    areaId: "dragon-hoard",
    level: 52,
    intro:
      "Ein grauhaariger Hüne mit einer Klinge, so lang wie er selbst, setzt sich zu dir. „Vor vierzig Jahren habe ich Ignaroth verwundet. Er hat mich am Leben gelassen. Ich will ihn ein letztes Mal sehen, bevor einer von uns stirbt.“",
    chapters: [
      {
        title: "Drachenbrut",
        story: "„Die Jungdrachen sind Ignaroths Kinder. Ihre Schuppen verraten mir, wie stark er heute ist.“",
        goal: bring("young-dragon", 3, "Drachenschuppe", "🐲"),
        thanks: "„Hart wie damals. Er ist nicht alt geworden. Nur ich.“",
      },
      {
        title: "Die Höllenwacht",
        story: "„Die Dämonenwächter stehen vor dem Hort. Damals waren es zwei. Heute sind es viele mehr.“",
        goal: kill("demon-guard", 5),
        thanks: "„Der Weg ist frei. Jetzt gibt es kein Zurück.“",
      },
      {
        title: "Der letzte Flug",
        story: "„Ich bin zu alt, um ihn allein zu besiegen. Aber ich werde dabei sein.“",
        goal: kill("ignaroth", 1),
        thanks: "Aldric steht lange vor dem gefallenen Drachen. „Vierzig Jahre. Und am Ende warst du es, nicht ich.“ Er hält dir seine Klinge hin. „Nimm sie – oder nimm mich mit. Für das eine bin ich zu alt, für das andere zu stur.“",
      },
    ],
    choice: {
      prompt: "Was nimmst du mit?",
      options: [
        {
          id: "companion",
          label: "Aldric mitnehmen",
          reply: "„Dann kämpfe ich eben noch ein paar Jahre.“ Aldric lacht zum ersten Mal.",
          gift: { kind: "companion", name: "Aldric", traits: [{ id: "mentor", rarity: "legendary" }, { id: "plunder", rarity: "legendary" }] },
        },
        {
          id: "blade",
          label: "Die Klinge nehmen",
          reply: "„Sie hat einen Drachen verwundet. Bei dir wird sie einen töten.“ Aldric geht ohne Waffe, aber aufrecht.",
          gift: { kind: "unique", itemId: "unique-aldric-greatsword" },
        },
      ],
    },
    farewell: "",
  },
];

export function getFixedVisitor(id: string): FixedVisitorDef {
  const def = FIXED_VISITORS.find((v) => v.id === id);
  if (!def) throw new Error(`Unbekannter Besucher: ${id}`);
  return def;
}

/* ───────────── Belohnungen pro Kapitel ───────────── */

/** Einheiten wie in quests.ts: ein Sieg 1, ein Boss 8, ein Dungeon 12 – ein Quest-Gegenstand so viele Siege, wie er im Schnitt braucht. */
function goalUnits(goal: QuestGoal): { level: number; units: number } {
  switch (goal.kind) {
    case "kill": {
      const { creature } = getCreature(goal.creatureId);
      return { level: creature.level, units: creature.boss ? 8 * goal.count : goal.count };
    }
    case "fetch": {
      const { creature } = getCreature(goal.creatureId);
      return { level: creature.level, units: creature.boss ? 8 * goal.count : goal.count / FETCH_CHANCE };
    }
    case "dungeon": {
      const dungeon = DUNGEONS.find((d) => d.id === goal.dungeonId);
      return { level: dungeon?.maxLevel ?? 1, units: 12 };
    }
    default:
      throw new Error(`Ziel ${goal.kind} gibt es bei Besuchern nicht.`);
  }
}

/** Besucher-Kapitel geben etwas mehr als das Questbuch – sie erzählen ja auch etwas. */
const VISITOR_REWARD_FACTOR = 1.5;

function chapterReward(goal: QuestGoal, factor = 1): QuestReward {
  const { level, units } = goalUnits(goal);
  return questReward(level, units * VISITOR_REWARD_FACTOR * factor, 0, BOSS_WEIGHTS);
}

/** Ein Kapitel als Quest – für Questbuch und Fortschritt. */
export function chapterQuest(def: FixedVisitorDef, index: number): QuestDef {
  const chapter = def.chapters[index];
  return {
    id: `visitor-${def.id}-${index}`,
    title: `${def.name}: ${chapter.title}`,
    description: chapter.story,
    areaId: def.areaId,
    goal: chapter.goal,
    reward: chapterReward(chapter.goal),
  };
}

/* ───────────── Durchreisende ───────────── */

export type WandererKind = "cook" | "preacher" | "apprentice" | "builder" | "minstrel" | "cartographer";

interface WandererTemplate {
  kind: WandererKind;
  name: string;
  role: string;
  icon: string;
  /** Begrüssung – {creature} und {area} werden ersetzt */
  intro: string;
  thanks: string;
}

const WANDERER_TEMPLATES: Readonly<Record<WandererKind, WandererTemplate>> = {
  cook: {
    kind: "cook",
    name: "Benno",
    role: "fahrender Koch",
    icon: "🍲",
    intro: "„Ich koche auf jedem Markt zwischen hier und dem Meer. Für mein bestes Gericht fehlt mir Fleisch aus dem Gebiet ‚{area}‘. {creature} – sagt man – schmeckt am besten.“",
    thanks: "„Herrlich! Dafür bekommst du mein Rezept – der Wirt soll es dir kochen, so oft du willst.“",
  },
  preacher: {
    kind: "preacher",
    name: "Bruder Anselm",
    role: "Wanderprediger",
    icon: "🕯️",
    intro: "„Die Reliquie meines Ordens wurde gestohlen. Ich bin dem Dieb bis ins Gebiet ‚{area}‘ gefolgt – es war ein Biest, das ihr hier {creature} nennt. Weiter tragen mich meine Füsse nicht.“",
    thanks: "„Der Orden wird sich erkenntlich zeigen. Nimm das – es lag zu lange in unserer Schatzkammer.“",
  },
  apprentice: {
    kind: "apprentice",
    name: "Pia",
    role: "Alchemistenlehrling",
    icon: "🧪",
    intro: "„Mein Meister will Drüsen für ein Experiment, und zwar genau von diesem Biest: {creature}. Ich habe ihm gesagt, dass ich das kann. Kann ich nicht.“",
    thanks: "„Du rettest mir die Lehre! Ich habe ein paar Flaschen abgezweigt – nicht verraten.“",
  },
  builder: {
    kind: "builder",
    name: "Hedwig",
    role: "Baumeisterin auf Reisen",
    icon: "🪵",
    intro: "„Im Gebiet ‚{area}‘ haben mich Bestien überfallen und meinen Wagen umgeworfen – {creature}, ein ganzes Rudel. Vertreib sie, dann gehört dir die Ladung.“",
    thanks: "„Der Wagen ist hin, aber die Ladung ist heil. Bau etwas Schönes damit.“",
  },
  minstrel: {
    kind: "minstrel",
    name: "Fidelius",
    role: "Spielmann",
    icon: "🎵",
    intro: "„Mein neues Lied heisst ‚Der Held und {creature}‘. Mir fehlt nur noch … der Sieg. Und ein Held.“",
    thanks: "„Was für eine Strophe! Die Wirtshäuser werden zahlen, um das zu hören – und du bekommst deinen Anteil im Voraus.“",
  },
  cartographer: {
    kind: "cartographer",
    name: "Elske",
    role: "Kartografin",
    icon: "🗺️",
    intro: "„Auf meiner Karte ist der Dungeon ‚{area}‘ ein weisser Fleck. Geh hinein und komm wieder heraus – den Rest zeichne ich.“",
    thanks: "„Jetzt ist die Karte vollständig. Das habe ich am Grund einer alten Kiste gefunden – du kannst es eher brauchen als ich.“",
  },
};

export function wandererTemplate(kind: WandererKind): WandererTemplate {
  return WANDERER_TEMPLATES[kind];
}

export interface Wanderer {
  kind: WandererKind;
  /** Begrüssung mit eingesetzter Kreatur bzw. Gebiet */
  intro: string;
  quest: QuestDef;
  gift: VisitorGift;
  /** Zeitpunkte in ms */
  arrives: number;
  leaves: number;
  accepted: boolean;
  progress: number;
}

/** Durchreisende kommen ab diesem Level … */
export const WANDERER_MIN_LEVEL = 5;
/** … bleiben einen Tag … */
export const WANDERER_STAY_MS = 24 * 3_600_000;
/** … und der nächste kommt 12 bis 36 Stunden, nachdem der letzte gegangen ist. */
export const WANDERER_GAP_MS: readonly [number, number] = [12 * 3_600_000, 36 * 3_600_000];

/** Tränke vom Lehrling, Material von der Baumeisterin. */
export const APPRENTICE_POTIONS = 3;
export const BUILDER_MATERIALS = 15;

/** Rezepte, die der fahrende Koch verrät – alle, die kein fester Besucher schenkt. */
export const COOK_RECIPES: readonly string[] = FOODS.filter(
  (food) =>
    food.recipe &&
    !FIXED_VISITORS.some((v) =>
      [v.gift, ...(v.choice?.options.map((o) => o.gift) ?? [])].some((g) => g?.kind === "recipe" && g.foodId === food.id),
    ),
).map((food) => food.id);

/** Kennt man ein geschenktes Rezept schon, gibt es stattdessen so viel mehr EP. */
export const RECIPE_KNOWN_XP_FACTOR = 2;

const pick = <T>(list: readonly T[], rng: () => number): T => list[Math.floor(rng() * list.length)];

/** Der stärkste Boss eines offenen Gebiets, der nicht viel über dem Helden liegt. */
function minstrelBoss(heroLevel: number): CreatureDef | null {
  const bosses = AREAS.filter((a) => isAreaUnlocked(a, heroLevel))
    .flatMap((a) => a.creatures)
    .filter((c) => c.boss && c.level <= heroLevel + 2);
  return bosses.length > 0 ? bosses[bosses.length - 1] : null;
}

/** Würfelt einen Durchreisenden aus, passend zum Level des Helden. */
export function rollWanderer(heroLevel: number, arrives: number, rng: () => number = Math.random): Wanderer {
  const openDungeons = DUNGEONS.filter((d) => isAreaUnlocked(d, heroLevel));
  const boss = minstrelBoss(heroLevel);
  const kinds: WandererKind[] = ["cook", "preacher", "apprentice", "builder"];
  if (boss) kinds.push("minstrel");
  if (openDungeons.length > 0) kinds.push("cartographer");
  const kind = pick(kinds, rng);
  const template = WANDERER_TEMPLATES[kind];
  const id = `wanderer-${arrives}`;
  const base = { id, title: `${template.name}: ${template.role}` };

  let goal: QuestGoal;
  let gift: VisitorGift;
  let creatureName: string;
  let areaName: string;
  if (kind === "cartographer") {
    const dungeon = openDungeons[openDungeons.length - 1];
    goal = { kind: "dungeon", dungeonId: dungeon.id };
    gift = { kind: "loot", weights: { common: 0, rare: 45, epic: 45, legendary: 10 } };
    creatureName = "";
    areaName = dungeon.name;
  } else {
    const creature = kind === "minstrel" ? boss! : pick(dailyCandidates(heroLevel), rng);
    const { area } = getCreature(creature.id);
    creatureName = creature.name;
    areaName = area.name;
    switch (kind) {
      case "cook":
        goal = bring(creature.id, 3, "Wildfleisch", "🍖");
        gift = { kind: "recipe", foodId: pick(COOK_RECIPES, rng) };
        break;
      case "preacher":
        goal = bring(creature.id, 1, "Reliquie des Ordens", "🔔");
        gift = { kind: "loot", weights: BOSS_WEIGHTS };
        break;
      case "apprentice": {
        goal = bring(creature.id, 4, "Drüse", "🧪");
        const potions: Record<string, number> = {};
        for (let i = 0; i < APPRENTICE_POTIONS; i++) {
          const potion = pick(BUFF_POTIONS, rng).id;
          potions[potion] = (potions[potion] ?? 0) + 1;
        }
        gift = { kind: "potions", potions };
        break;
      }
      case "builder":
        goal = kill(creature.id, 8);
        gift = { kind: "materials", materials: { [materialForLevel(creature.level)]: BUILDER_MATERIALS } };
        break;
      case "minstrel":
        goal = kill(creature.id, 1);
        gift = { kind: "gold", gold: chapterReward(goal).gold };
        break;
    }
  }
  const fill = (text: string) => text.replace("{creature}", creatureName).replace("{area}", areaName);
  const area = goal.kind === "dungeon" ? goal.dungeonId : getCreature((goal as { creatureId: string }).creatureId).area.id;
  return {
    kind,
    intro: fill(template.intro),
    quest: { ...base, description: fill(template.intro), areaId: area, goal, reward: chapterReward(goal) },
    gift,
    arrives,
    leaves: arrives + WANDERER_STAY_MS,
    accepted: false,
    progress: 0,
  };
}

/* ───────────── Zustand ───────────── */

export interface StoryVisit {
  id: string;
  /** Aktuelles Kapitel (0-basiert) */
  chapter: number;
  /** Hat man das aktuelle Kapitel angenommen? */
  accepted: boolean;
  progress: number;
}

/** Besucher – wird gespeichert. */
export interface VisitorState {
  /** Der feste Besucher, der gerade im Dorf ist */
  story: StoryVisit | null;
  /** Feste Besucher, deren Geschichte erledigt ist */
  done: string[];
  /** Entscheidungen am Ende: Besucher → gewählte Option */
  choices: Record<string, string>;
  /** Freigeschaltete Rezepte (Ids aus food.ts) */
  recipes: string[];
  wanderer: Wanderer | null;
  /** Ab hier (ms) kommt der nächste Durchreisende */
  nextWanderer: number;
}

export const EMPTY_VISITORS: VisitorState = { story: null, done: [], choices: {}, recipes: [], wanderer: null, nextWanderer: 0 };

/**
 * Lässt Besucher kommen und gehen: der nächste feste Besucher, sobald das Level reicht,
 * Durchreisende nach Zeit. Ohne Änderung kommt dasselbe Objekt zurück.
 */
export function refreshVisitors(state: VisitorState, heroLevel: number, now: number, rng: () => number = Math.random): VisitorState {
  let next = state;
  if (!next.story) {
    const def = FIXED_VISITORS.find((v) => !next.done.includes(v.id) && v.level <= heroLevel);
    if (def) next = { ...next, story: { id: def.id, chapter: 0, accepted: false, progress: 0 } };
  }
  if (next.wanderer && now >= next.wanderer.leaves) {
    const [min, max] = WANDERER_GAP_MS;
    next = { ...next, wanderer: null, nextWanderer: next.wanderer.leaves + min + Math.floor(rng() * (max - min)) };
  }
  if (!next.wanderer && heroLevel >= WANDERER_MIN_LEVEL && now >= next.nextWanderer) {
    // Er kommt, wenn man ins Dorf schaut – wer lange weg war, verpasst ihn so nicht
    next = { ...next, wanderer: rollWanderer(heroLevel, now, rng) };
  }
  return next;
}

/** Nimmt das aktuelle Kapitel des festen Besuchers bzw. die Bitte des Durchreisenden an. */
export function acceptVisitor(state: VisitorState, who: "story" | "wanderer"): VisitorState {
  if (who === "story") {
    if (!state.story) throw new Error("Gerade ist kein Besucher im Dorf.");
    if (state.story.accepted) throw new Error("Das hast du schon angenommen.");
    return { ...state, story: { ...state.story, accepted: true } };
  }
  if (!state.wanderer) throw new Error("Gerade ist kein Durchreisender im Dorf.");
  if (state.wanderer.accepted) throw new Error("Das hast du schon angenommen.");
  return { ...state, wanderer: { ...state.wanderer, accepted: true } };
}

/** Fällt der Quest-Gegenstand? Elite und Bosse lassen ihn immer fallen. */
function rollFetch(event: QuestEvent, rng: () => number): boolean {
  return event.kind === "kill" && (event.boss || !!event.elite || rng() < FETCH_CHANCE);
}

function advance(def: QuestDef, progress: number, event: QuestEvent, rng: () => number): number {
  if (def.goal.kind === "fetch") {
    const next = advanceQuest(def, progress, event);
    return next !== progress && rollFetch(event, rng) ? next : progress;
  }
  return advanceQuest(def, progress, event);
}

/** Ein Sieg oder Dungeon bringt die angenommenen Besucher-Quests voran. Ohne Änderung dasselbe Objekt. */
export function applyVisitorEvent(state: VisitorState, event: QuestEvent, rng: () => number = Math.random): VisitorState {
  let next = state;
  const { story, wanderer } = state;
  if (story?.accepted) {
    const progress = advance(chapterQuest(getFixedVisitor(story.id), story.chapter), story.progress, event, rng);
    if (progress !== story.progress) next = { ...next, story: { ...story, progress } };
  }
  if (wanderer?.accepted) {
    const progress = advance(wanderer.quest, wanderer.progress, event, rng);
    if (progress !== wanderer.progress) next = { ...next, wanderer: { ...wanderer, progress } };
  }
  return next;
}

/** Ein Quest-Gegenstand, der in einem Kampf gefallen ist – für die Siegmeldung. */
export interface QuestItemFind {
  item: string;
  icon: string;
  progress: number;
  count: number;
}

/** Welche Quest-Gegenstände zwischen zwei Ständen gefallen sind. */
export function foundQuestItems(before: VisitorState, after: VisitorState): QuestItemFind[] {
  const finds: QuestItemFind[] = [];
  const check = (goal: QuestGoal, from: number, to: number) => {
    if (goal.kind === "fetch" && to > from) finds.push({ item: goal.item, icon: goal.icon, progress: Math.min(to, goal.count), count: goal.count });
  };
  const { story, wanderer } = before;
  if (story && after.story?.id === story.id && after.story.chapter === story.chapter) {
    check(getFixedVisitor(story.id).chapters[story.chapter].goal, story.progress, after.story.progress);
  }
  if (wanderer && after.wanderer?.arrives === wanderer.arrives) check(wanderer.quest.goal, wanderer.progress, after.wanderer.progress);
  return finds;
}

export interface VisitorTurnIn {
  state: VisitorState;
  /** EP und Gold (ohne Item-Chance) */
  reward: QuestReward;
  /** Geschenk am Ende – null bei Zwischenkapiteln */
  gift: VisitorGift | null;
  /** Was der Besucher dazu sagt */
  text: string;
  /** Die Geschichte ist zu Ende, der Besucher geht */
  finished: boolean;
  title: string;
  /** Das geschenkte Rezept kannte man schon – dafür gab es mehr EP */
  recipeKnown: boolean;
}

/** Lernt ein geschenktes Rezept – kennt man es schon, gibt es stattdessen mehr EP. */
function learnRecipe(state: VisitorState, gift: VisitorGift | null, reward: QuestReward): Pick<VisitorTurnIn, "state" | "reward" | "recipeKnown"> {
  if (gift?.kind !== "recipe") return { state, reward, recipeKnown: false };
  if (state.recipes.includes(gift.foodId)) {
    return { state, reward: { ...reward, xp: Math.round(reward.xp * RECIPE_KNOWN_XP_FACTOR) }, recipeKnown: true };
  }
  return { state: { ...state, recipes: [...state.recipes, gift.foodId] }, reward, recipeKnown: false };
}

/** Ist das aktuelle Kapitel des festen Besuchers erfüllt? */
export function storyChapterComplete(state: VisitorState): boolean {
  const { story } = state;
  return !!story?.accepted && isQuestComplete(chapterQuest(getFixedVisitor(story.id), story.chapter), story.progress);
}

/**
 * Gibt das aktuelle Kapitel beim festen Besucher ab. Im letzten Kapitel mit
 * Entscheidung braucht es `choiceId`.
 */
export function turnInStory(state: VisitorState, choiceId?: string): VisitorTurnIn {
  const { story } = state;
  if (!story) throw new Error("Gerade ist kein Besucher im Dorf.");
  const def = getFixedVisitor(story.id);
  const quest = chapterQuest(def, story.chapter);
  if (!story.accepted || !isQuestComplete(quest, story.progress)) throw new Error("Das Kapitel ist noch nicht erfüllt.");
  const last = story.chapter === def.chapters.length - 1;
  if (!last) {
    return {
      state: { ...state, story: { id: def.id, chapter: story.chapter + 1, accepted: false, progress: 0 } },
      reward: quest.reward,
      gift: null,
      text: def.chapters[story.chapter].thanks,
      finished: false,
      title: quest.title,
      recipeKnown: false,
    };
  }
  let gift = def.gift ?? null;
  let reward = quest.reward;
  let text = `${def.chapters[story.chapter].thanks}\n\n${def.farewell}`;
  const choices = { ...state.choices };
  if (def.choice) {
    const option = def.choice.options.find((o) => o.id === choiceId);
    if (!option) throw new Error("Triff zuerst eine Entscheidung.");
    gift = option.gift;
    reward = chapterReward(quest.goal, option.rewardFactor);
    text = option.reply;
    choices[def.id] = option.id;
  }
  return {
    ...learnRecipe({ ...state, story: null, done: [...state.done, def.id], choices }, gift, reward),
    gift,
    text,
    finished: true,
    title: quest.title,
  };
}

/** Gibt die Bitte des Durchreisenden ab – danach zieht er weiter. */
export function turnInWanderer(state: VisitorState, now: number, rng: () => number = Math.random): VisitorTurnIn {
  const { wanderer } = state;
  if (!wanderer) throw new Error("Gerade ist kein Durchreisender im Dorf.");
  if (!wanderer.accepted || !isQuestComplete(wanderer.quest, wanderer.progress)) throw new Error("Die Bitte ist noch nicht erfüllt.");
  const [min, max] = WANDERER_GAP_MS;
  return {
    ...learnRecipe({ ...state, wanderer: null, nextWanderer: now + min + Math.floor(rng() * (max - min)) }, wanderer.gift, wanderer.quest.reward),
    gift: wanderer.gift,
    text: WANDERER_TEMPLATES[wanderer.kind].thanks,
    finished: true,
    title: wanderer.quest.title,
  };
}

/** Schickt den Durchreisenden weg – der nächste kommt wie nach einem normalen Abschied. */
export function dismissWanderer(state: VisitorState, now: number, rng: () => number = Math.random): VisitorState {
  if (!state.wanderer) return state;
  const [min, max] = WANDERER_GAP_MS;
  return { ...state, wanderer: null, nextWanderer: now + min + Math.floor(rng() * (max - min)) };
}

/** Angenommene Besucher-Quests für Questbuch und Kampfanzeige. */
export function trackedVisitorQuests(state: VisitorState): TrackedQuest[] {
  const tracked: TrackedQuest[] = [];
  if (state.story?.accepted) {
    tracked.push({ def: chapterQuest(getFixedVisitor(state.story.id), state.story.chapter), progress: state.story.progress, source: "visitor" });
  }
  if (state.wanderer?.accepted) tracked.push({ def: state.wanderer.quest, progress: state.wanderer.progress, source: "visitor" });
  return tracked;
}

/** Ein Besucher wartet auf dich: neu angekommen oder ein Kapitel ist erfüllt. */
export function visitorNeedsAttention(state: VisitorState): boolean {
  const wanderer = state.wanderer;
  return (
    (!!state.story && (!state.story.accepted || storyChapterComplete(state))) ||
    (!!wanderer && (!wanderer.accepted || isQuestComplete(wanderer.quest, wanderer.progress)))
  );
}

/** „ein Rezept für die Taverne“, „2 Portionen besonderes Essen“ – kurzer Text für ein Geschenk. */
export function giftText(gift: VisitorGift): string {
  switch (gift.kind) {
    case "companion":
      return `${gift.name} wird dein Begleiter`;
    case "unique":
      return "ein Unikat";
    case "recipe":
      return "ein Rezept für die Taverne";
    case "potions":
      return `${Object.values(gift.potions).reduce((a, b) => a + b, 0)} Tränke`;
    case "materials":
      return "Baumaterial";
    case "loot":
      return "ein Item";
    case "gold":
      return `${gift.gold} Gold`;
  }
}

