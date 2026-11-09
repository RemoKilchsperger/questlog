// Dungeon-Besucher (docs/dungeon-besucher.md): einer pro Dungeon. Er kommt, sobald man das
// Level des Dungeons hat, und bleibt, bis seine Geschichte erledigt ist. Kapitel 1 und 2 sind
// gewöhnliche Ziele, im dritten steht im Dungeon eine Geschichtstür mit einer Szene. Die Wahl
// in der Szene bestimmt das Geschenk – die Entscheidung fällt also im Dungeon, nicht im Dorf.

import type { QuestGoal } from "./quests";
import type { FixedVisitorDef } from "./visitors";

const kill = (creatureId: string, count: number): QuestGoal => ({ kind: "kill", creatureId, count });
const bring = (creatureId: string, count: number, item: string, icon: string): QuestGoal => ({ kind: "fetch", creatureId, count, item, icon });
const story = (dungeonId: string): QuestGoal => ({ kind: "dungeonStory", dungeonId });

export const DUNGEON_VISITORS: readonly FixedVisitorDef[] = [
  {
    id: "gerold",
    name: "Gerold",
    role: "alter Steiger",
    icon: "⛏️",
    areaId: "abandoned-mine",
    dungeonId: "abandoned-mine",
    level: 10,
    intro:
      "Ein gebeugter Mann mit kohlschwarzen Händen dreht seinen Helm in den Fingern. „Gerold. Dreissig Jahre Steiger in der alten Mine. Dann kamen die Kobolde, und ich bin gerannt. Mein Lehrling Pip hat sich für mich geschämt. Gestern ist er allein hineingegangen.“",
    chapters: [
      {
        title: "Spinnweben im Schacht",
        story: "„Die Grubenspinnen haben den Hauptschacht zugesponnen. Solange die da hängen, kommt keiner tiefer – Pip auch nicht. Hoffe ich.“",
        goal: kill("pit-spider", 4),
        thanks: "„Der Schacht ist frei. Und da – Kreide an der Wand. Ein Pfeil nach unten. Das ist Pips Zeichen.“",
      },
      {
        title: "Das Schichtbuch",
        story: "„Knorz, der Vorarbeiter der Kobolde, hat mein Schichtbuch. Darin steht, welche Stollen noch halten. Ohne das gräbt man sich sein eigenes Grab.“",
        goal: bring("mine-foreman", 1, "Gerolds Schichtbuch", "📖"),
        thanks: "Gerold blättert, bis er eine Seite findet, auf die jemand mit Kreide gekritzelt hat: „Bin im Westschacht. Komme nicht raus. – P.“ Seine Hände zittern.",
      },
      {
        title: "Verschüttet",
        story: "„Der Westschacht liegt hinter Knorz' Halle. Er ist eingestürzt, ich habe es gehört, damals. Hol ihn da raus. Und dann sorg dafür, dass Grimmbart das nie wieder tut.“",
        goal: story("abandoned-mine"),
        thanks: "Pip steht staubig hinter dir und grinst. Gerold packt ihn am Kragen, schüttelt ihn – und drückt ihn dann so fest an sich, dass der Junge nach Luft schnappt.",
      },
    ],
    scene: {
      title: "Eingestürzter Stollen",
      text: "Hinter einem Geröllhaufen klopft es. „Hallo? Ist da wer? Ich bin's, Pip!“ Am anderen Ende des Gangs schleppen zwei Kobolde ein Fass heran. Die Lunte ist schon zu sehen.",
      options: [
        {
          id: "dig",
          label: "Freigraben",
          hint: "Ein Kampf – der Sprengmeister lässt dich nicht in Ruhe graben.",
          result: "Du legst die Spitzhacke weg und ziehst die Waffe. Der Kobold-Sprengmeister kommt brüllend auf dich zu.",
          fight: "kobold-blaster",
        },
        {
          id: "charge",
          label: "Ladung umlegen",
          hint: "Wer flink ist, schafft es ungesehen. Eine gute Rüstung hält auch eine Explosion aus.",
          result: "Du schleichst zum Fass und rollst es vorsichtig in den Seitengang, aus dem die Kobolde gekommen sind.",
          test: {
            pass: "Niemand bemerkt dich. Das Fass geht weit weg von dir in die Luft, die Kobolde rennen schreiend davon.",
            fail: "Ein Kobold sieht dich und hält die Fackel an die Lunte. Du wirfst dich zur Seite, aber nicht weit genug.",
          },
        },
      ],
      after: "Gemeinsam räumt ihr die letzten Steine weg. Pip kriecht heraus, voller Staub, und fragt als Erstes: „Hat Gerold mich gesucht?“",
    },
    gift: { kind: "companion", name: "Pip", traits: [{ id: "gatherer", rarity: "epic" }, { id: "treasure", rarity: "epic" }] },
    farewell: "„Pip bleibt bei dir. Er hat mehr Mut als ich je hatte – und er soll lernen, wo man ihn braucht. Ich koche euch beiden Suppe, wenn ihr heimkommt.“",
  },
  {
    id: "samira",
    name: "Samira",
    role: "Schatzsucherin",
    icon: "🗺️",
    areaId: "sunken-temple",
    dungeonId: "sunken-temple",
    level: 25,
    intro:
      "Eine Frau mit sonnengegerbter Haut breitet eine zerknitterte Karte auf dem Tisch aus. „Alle reden von Neferets Schatz. Aber die Frau, gegen die man im Tempel kämpft, ist nicht Neferet. Die echte Hohepriesterin liegt woanders. Ich will wissen, wo.“",
    chapters: [
      {
        title: "Inschriften",
        story: "„Die Mumien tragen Tontafeln um den Hals – Grabbeigaben. Darauf steht mehr, als die Priester wollen, dass man liest.“",
        goal: bring("mummy", 3, "Tontafel", "📜"),
        thanks: "Samira fährt mit dem Finger über die Zeichen. „Eine Dienerin, die ihre Herrin vergiftet und ihren Namen gestohlen hat. Die Frau auf dem Thron ist eine Lügnerin.“",
      },
      {
        title: "Der Skarabäus",
        story: "„Anubek, der Grabhüter, trägt einen Skarabäus aus Bronze. Auf den Tafeln heisst er ‚der Schlüssel, der nicht lügt‘. Ich wette, er öffnet die wahre Kammer.“",
        goal: bring("tomb-warden", 1, "Skarabäusschlüssel", "🗝️"),
        thanks: "„Siehst du die Kerbe? Sie passt zu einer Wand hinter Anubeks Halle. Dort ist eine Kammer, die auf keiner Karte steht. Auf meiner jetzt schon.“",
      },
      {
        title: "Die wahre Kammer",
        story: "„Bring den Schlüssel zur Wand hinter Anubeks Halle. Was immer da drin ist – schau es dir genau an. Und dann zeig der falschen Neferet, dass ihre Zeit vorbei ist.“",
        goal: story("sunken-temple"),
        thanks: "Samira hört zu, ohne dich zu unterbrechen. Dann rollt sie ihre Karte zusammen. „Dann hat sie endlich ihren Namen zurück.“",
      },
    ],
    scene: {
      title: "Verborgene Grabkammer",
      text: "Der Skarabäus passt. Die Wand gleitet zur Seite, Sand rieselt. In der Kammer liegt ein schlichter Sarkophag, darauf ein Amulett, das im Dunkeln leuchtet wie die Sonne. Ein Schatten richtet sich auf: „Ich bin Neferet. Die Sonne hat mich beschützt, als ich starb. Nimmst du sie mir, wache ich nie mehr auf.“",
      options: [
        {
          id: "take",
          label: "Amulett nehmen",
          hint: "Ein Unikat – aber Neferet bleibt ohne Schutz.",
          result: "Du nimmst das Amulett. Der Schatten seufzt und sinkt zurück in den Sarkophag. Es wird sehr still.",
        },
        {
          id: "return",
          label: "Zurücklegen",
          hint: "Neferet segnet dich für den Rest dieses Laufs.",
          result: "Du legst das Amulett zurück. Neferet legt dir eine kalte Hand auf die Stirn, und eine Wärme läuft durch dich, die nicht vom Sand kommt.",
          blessing: "vitality",
        },
      ],
      after: "Die Wand schliesst sich hinter dir. Weiter vorne wartet die Frau, die sich Neferet nennt.",
    },
    choice: {
      prompt: "",
      options: [
        {
          id: "take",
          label: "Amulett nehmen",
          reply: "„Du hast es?“ Samira dreht das Amulett lange in den Händen. Dann setzt sie es in einen Schild aus Bronze. „Ein Schatz gehört dem, der ihn trägt. Pass auf ihn auf.“",
          gift: { kind: "unique", itemId: "unique-samira-shield" },
        },
        {
          id: "return",
          label: "Zurücklegen",
          reply: "„Zurückgelegt?“ Samira lacht leise. „Ich hätte es nicht gekonnt.“ Sie schreibt dir etwas auf. „Das backen die Tempeldiener seit tausend Jahren. Wenn schon kein Schatz, dann wenigstens Frühstück.“",
          gift: { kind: "recipe", foodId: "dateBread" },
        },
      ],
    },
    farewell: "",
  },
  {
    id: "vessa",
    name: "Vessa",
    role: "Kaelthars Schülerin",
    icon: "⚡",
    areaId: "storm-tower",
    dungeonId: "storm-tower",
    level: 40,
    intro:
      "Eine junge Frau mit versengtem Mantel und Haaren, die sich von allein aufrichten, wenn sie dich ansieht. „Mein Meister Kaelthar hat einen Sturm in einen Kristall gesperrt. Seitdem hört er nur noch den Donner. Was ihr Sturmfürst nennt, war einmal ein guter Lehrer.“",
    chapters: [
      {
        title: "Falsche Schüler",
        story: "„Die Blitzbeschwörer haben meinen Platz eingenommen. Sie füttern den Sturm, damit er Kaelthar ganz frisst. Halt sie auf.“",
        goal: kill("lightning-caller", 5),
        thanks: "„Spürst du das? Die Luft ist ruhiger. Er weiss jetzt, dass jemand kommt.“",
      },
      {
        title: "Der Sturmkern",
        story: "„Der Donnerkoloss trägt einen Splitter des Kristalls in der Brust. Damit kann ich den Käfig öffnen – oder ihn für immer verschliessen.“",
        goal: bring("thunder-colossus", 1, "Sturmkern", "⚡"),
        thanks: "Vessa hält den Splitter zwischen zwei Fingern, und kleine Blitze kriechen über ihre Hand. „Er ist wütend. Natürlich ist er wütend. Er sitzt seit zwanzig Jahren fest.“",
      },
      {
        title: "Der gefangene Sturm",
        story: "„Die Sturmkammer liegt hinter der Halle des Kolosses. Der Kern öffnet sie. Was du dort tust, entscheidest du. Ich habe es zwanzig Jahre lang nicht gekonnt.“",
        goal: story("storm-tower"),
        thanks: "Vessa schaut aus dem Fenster zum Turm, über dem sich zum ersten Mal seit Jahren keine Wolken drehen. „Er hat dich erkannt, am Ende. Nicht wahr? Sag, dass er dich erkannt hat.“",
      },
    ],
    scene: {
      title: "Sturmkammer",
      text: "In der Mitte der Kammer schwebt ein Kristall, so gross wie ein Mann. Darin tobt ein Sturm, der gegen die Wände schlägt. Der Sturmkern in deiner Hand wird warm. Man könnte den Käfig öffnen – oder den Sturm in die eigene Waffe leiten.",
      options: [
        {
          id: "free",
          label: "Sturm freilassen",
          hint: "Ein schwerer Kampf. Danach ist Kaelthar geschwächt.",
          result: "Der Kristall zerspringt. Der Sturm reisst sich los, ballt sich zusammen und stürzt sich auf dich.",
          fight: "thunder-elemental",
          weakenBoss: 0.15,
        },
        {
          id: "bind",
          label: "Sturm binden",
          hint: "Kein Kampf. Der Sturm gehört dir.",
          result: "Du hältst den Sturmkern an den Kristall. Der Sturm fliesst hinein, dann in deinen Arm, und von dort in deine Waffe. Es knistert.",
        },
      ],
      after: "Über dir grollt es. Kaelthar weiss jetzt, was du getan hast.",
    },
    choice: {
      prompt: "",
      options: [
        {
          id: "free",
          label: "Sturm freilassen",
          reply: "„Frei.“ Vessa schliesst die Augen. „Dann gibt es für mich auch keinen Grund mehr, hier zu warten. Nimmst du eine Schülerin, die weiss, wie man Blitze fängt?“",
          gift: { kind: "companion", name: "Vessa", traits: [{ id: "swift", rarity: "legendary" }, { id: "eager", rarity: "legendary" }] },
        },
        {
          id: "bind",
          label: "Sturm binden",
          reply: "„Gebunden.“ Vessa nickt langsam. „Dann soll er wenigstens etwas Gutes tun.“ Sie schnitzt Runen in einen Stab und hält ihn dir hin. „Er wird nicht gehorchen. Aber er wird für dich toben.“",
          gift: { kind: "unique", itemId: "unique-vessa-staff" },
        },
      ],
    },
    farewell: "",
  },
  {
    id: "orun",
    name: "Orun",
    role: "letzter Siegelhüter",
    icon: "🛡️",
    areaId: "void-abyss",
    dungeonId: "void-abyss",
    level: 60,
    intro:
      "Ein alter Mann in einer Rüstung, die älter ist als das Dorf, stützt sich auf einen Speer. „Mein Orden hat Xal'Zar vor tausend Jahren versiegelt. Ich bin der Letzte. Und das Siegel hat Risse.“",
    chapters: [
      {
        title: "Was durchsickert",
        story: "„Die Leerenkriecher sind nicht von hier. Sie kriechen durch die Risse. In ihnen stecken Splitter des Siegels – bring sie mir, dann sehe ich, wie schlimm es ist.“",
        goal: bring("void-crawler", 4, "Leerensplitter", "✨"),
        thanks: "Orun legt die Splitter zu einem Kreis. Es fehlt ein grosses Stück in der Mitte. „Schlimmer, als ich dachte.“",
      },
      {
        title: "Der Tyrann",
        story: "„Das Herzstück des Siegels trägt der Abgrundtyrann als Krone. Er glaubt, es macht ihn zum König. Es macht ihn nur zum Schlüssel.“",
        goal: bring("abyss-tyrant", 1, "Siegelstein", "🪨"),
        thanks: "Orun setzt den Siegelstein in die Mitte des Kreises. Die Splitter leuchten auf – kurz, schwach. „Er hält. Aber nur, wenn jemand darin wacht.“",
      },
      {
        title: "Das Siegel",
        story: "„Bring den Stein zur Siegelkammer hinter der Halle des Tyrannen. Ich gehe mit dir, so weit meine Beine tragen. Danach musst du Xal'Zar allein gegenübertreten.“",
        goal: story("void-abyss"),
        thanks: "Im Dorf ist es still, als du zurückkommst. Nur die Glocke am Brunnen schwingt, obwohl kein Wind geht.",
      },
    ],
    scene: {
      title: "Siegelkammer",
      text: "Die Kammer ist ein Kreis aus schwarzem Stein. In der Mitte klafft ein Riss, aus dem es flüstert. Orun setzt den Siegelstein ein. „Das Siegel braucht einen Wächter“, sagt er. „Oder jemanden, der das Echo zurückschlägt, das gleich herauskommt.“",
      options: [
        {
          id: "seal",
          label: "Orun wacht",
          hint: "Kein Kampf. Orun bleibt für immer im Siegel.",
          result: "Orun tritt in den Kreis. Der Stein schliesst sich um ihn, bis nur noch seine Stimme zu hören ist: „Gib im Dorf Bescheid, dass ich nicht wiederkomme.“",
          letter: true,
        },
        {
          id: "echo",
          label: "Echo stellen",
          hint: "Ein schwerer Kampf gegen das Echo von Xal'Zar. Orun überlebt.",
          result: "Du stellst dich vor Orun. Aus dem Riss steigt ein Schatten mit Xal'Zars Augen und schlägt nach dir.",
          fight: "shadow-demon",
        },
      ],
      after: "Das Flüstern verstummt. Vor dir liegt der Weg zu Xal'Zar.",
    },
    choice: {
      prompt: "",
      options: [
        {
          id: "seal",
          label: "Orun wacht",
          reply: "Am Brunnen liegt ein Mantel, sorgsam gefaltet, darauf ein Zettel in alter Schrift: „Für den, der mich hingebracht hat. Er hat tausend Jahre gehalten. Er hält auch dich.“",
          gift: { kind: "unique", itemId: "unique-orun-mantle" },
        },
        {
          id: "echo",
          label: "Echo stellen",
          reply: "Orun sitzt am Brunnen und lacht, als er dich sieht. „Tausend Jahre Wache, und dann rettet mich ein Abenteurer.“ Er drückt dir eine Axt in die Hand. „Damit hat mein Orden die Leere gespalten. Jetzt bist du dran.“",
          gift: { kind: "unique", itemId: "unique-orun-axe" },
        },
      ],
    },
    farewell: "",
  },
];
