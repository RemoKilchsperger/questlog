import { createContext, useContext, useState, type ReactNode } from "react";
import { MANA_REGEN } from "../domain/abilities";
import { ARMOR_CLASSES } from "../domain/armorClasses";
import { SET_GEAR_BONUS } from "../domain/bossSets";
import { BOSS_ITEM_DROP_CHANCE, BUFF_POTION_DROP_CHANCE } from "../domain/combat";
import {
  BULWARK_SHARE,
  COOP_BOSSES,
  COOP_MAX_PLAYERS,
  COOP_MIN_PLAYERS,
  COOP_REWARD_FACTOR,
  COOP_TURN_SECONDS,
  DUNGEON_REVIVE_HP,
  THREAT_DECAY,
} from "../domain/coopCombat";
import { AREA_BOSS_RESPAWN_MS, AREAS, DUNGEONS, XP_PENALTY_FREE_LEVELS } from "../domain/creatures";
import { FRAMES } from "../domain/achievements";
import { UPGRADE_REFUND } from "../domain/forge";
import { CLASS_ARMOR_PIECES } from "../domain/heroClasses";
import { MAX_UPGRADE, RARITIES, UPGRADE_STEP } from "../domain/items";
import { MAX_LEVEL, POINTS_PER_LEVEL, xpForNextLevel } from "../domain/leveling";
import { POTIONS, potionEffectText } from "../domain/potions";
import {
  DAILY_DROP_CHANCE,
  DAILY_HUNT_COUNT,
  DAILY_TRADE_COUNTS,
  KILL_QUEST_DROP_CHANCE,
  QUESTS,
  WEEKLY_BOSSES,
  WEEKLY_DUNGEON_LEVEL,
  WEEKLY_DUNGEONS,
  WEEKLY_KILLS,
  WEEKLY_TRADE_COUNTS,
} from "../domain/quests";
import { STAT_LABELS } from "../domain/stats";
import { SHOP_REROLLS_PER_DAY, SHOP_ROTATION_HOURS, SHOP_SIZE } from "../domain/shop";
import {
  ABILITY_UNLOCK_RANK,
  MAX_SKILL_RANK,
  SECOND_ABILITY_COST,
  SECOND_ABILITY_LEVEL,
  SKILL_BONUS_PER_RANK,
  SKILL_POINTS_PER_LEVEL,
} from "../domain/skills";
import { formatNumber, Gold } from "./Gold";

/** 0.05 → "5 %" */
const pct = (value: number) => `${formatNumber(Math.round(value * 1000) / 10)} %`;

/** XP von Level 1 bis zum Maximallevel */
const XP_TO_MAX = Array.from({ length: MAX_LEVEL - 1 }, (_, i) => xpForNextLevel(i + 1)).reduce((a, b) => a + b, 0);

/** Alle Themen – für „Alle aufklappen“ */
const TOPICS = [
  "quests",
  "character",
  "skills",
  "equipment",
  "village",
  "battle",
  "dungeons",
  "coop",
  "achievements",
] as const;

type TopicId = (typeof TOPICS)[number];

/** Hilfe-Tab: erklärt alle Spielmechaniken. Die Zahlen kommen direkt aus der Spiellogik. */
export function HelpScreen() {
  const [open, setOpen] = useState<ReadonlySet<TopicId>>(new Set());
  const allOpen = open.size === TOPICS.length;
  const toggle = (id: TopicId, isOpen: boolean) =>
    setOpen((prev) => {
      if (prev.has(id) === isOpen) return prev;
      const next = new Set(prev);
      if (isOpen) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <OpenTopics.Provider value={{ open, toggle }}>
      <div className="flex flex-col gap-3">
        <section className="panel flex flex-wrap items-start justify-between gap-3 p-4">
          <div>
            <h2 className="font-pixel text-2xl">❓ Hilfe</h2>
            <p className="mt-1 text-muted">
              Nimm Quests an, kämpf dich durch Gebiete und Dungeons und mach deinen Helden stärker. Klapp ein Thema auf,
              um zu sehen, wie es funktioniert.
            </p>
          </div>
          <button
            onClick={() => setOpen(allOpen ? new Set() : new Set(TOPICS))}
            className="font-pixel shrink-0 rounded-md border-2 border-night-700 bg-night-900 px-3 py-1 text-muted transition hover:border-gold/70 hover:text-parchment"
          >
            {allOpen ? "Alle zuklappen" : "Alle aufklappen"}
          </button>
        </section>

        <Topic id="quests" title="📜 Quests">
          <p>
            Im <b>Questbuch</b> stehen Aufträge für jedes Gebiet: Jage eine bestimmte Anzahl einer Kreatur, besiege den
            Gebietsboss oder schliesse einen Dungeon ab. Insgesamt gibt es {QUESTS.length} Quests, jede einmal.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Quests eines Gebiets kannst du annehmen, sobald das Gebiet offen ist.</li>
            <li>Nur Siege nach dem Annehmen zählen. Der Fortschritt steht im Quest-Tab und im Kampf-Tab bei der Kreatur.</li>
            <li>Ist das Ziel erreicht, gibst du die Quest im Quest-Tab ab und bekommst die Belohnung.</li>
            <li>Brichst du eine Quest ab, geht ihr Fortschritt verloren – du kannst sie später neu annehmen.</li>
          </ul>
          <Table
            head={["Quest", "Ziel", "Item beim Abgeben"]}
            rows={[
              ["Jagd", "5–8 Siege gegen eine Kreatur", pct(KILL_QUEST_DROP_CHANCE)],
              ["Boss", "Den Gebietsboss besiegen", "garantiert, eher selten"],
              ["Dungeon", "Den Dungeon bis zum Endboss abschliessen (solo oder Koop)", "garantiert, mindestens selten"],
            ]}
          />
          <p>XP und Gold hängen vom Level der Kreatur bzw. des Dungeons ab – je schwieriger, desto mehr.</p>
          <H>⭐ Tagesaufträge</H>
          <p>
            Jeden Tag gibt es {DAILY_HUNT_COUNT} neue Jagdaufträge passend zu deinem Level und einen Auftrag für Händler
            oder Schmied, der täglich wechselt: {DAILY_TRADE_COUNTS.sell} Ausrüstungsteile verkaufen,{" "}
            {DAILY_TRADE_COUNTS.salvage} zerlegen oder {DAILY_TRADE_COUNTS.upgrade}-mal eines verbessern. Aufträge laufen sofort, ohne
            Annehmen, und geben XP, Gold und mit {pct(DAILY_DROP_CHANCE)} ein Item. Um Mitternacht kommen neue – was bis
            dahin nicht abgegeben ist, verfällt.
          </p>
          <H>📅 Wochenaufträge</H>
          <p>Jeden Montag gibt es grössere Ziele für die ganze Woche – mit mehr XP und Gold und immer einem Item:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>{WEEKLY_KILLS} beliebige Kreaturen besiegen</li>
            <li>{WEEKLY_BOSSES} Bosse besiegen – Gebiets-, Dungeon- und Koop-Bosse zählen</li>
            <li>
              {WEEKLY_DUNGEONS} Dungeons abschliessen, solo oder im Koop (ab Level {WEEKLY_DUNGEON_LEVEL})
            </li>
            <li>
              Ein Auftrag für Händler oder Schmied, der wöchentlich wechselt: {WEEKLY_TRADE_COUNTS.sell} Ausrüstungsteile verkaufen,{" "}
              {WEEKLY_TRADE_COUNTS.salvage} zerlegen oder {WEEKLY_TRADE_COUNTS.upgrade}-mal verbessern
            </li>
          </ul>
          <p>Bei Händler und Schmied zählt jedes Ausrüstungsteil – Waffen, Schilde und Rüstung.</p>
        </Topic>

        <Topic id="character" title="🧙 Level & Attribute">
          <p>
            Für das erste Level-up braucht es {formatNumber(xpForNextLevel(1))} XP, für Level 30 schon{" "}
            {formatNumber(xpForNextLevel(30))} XP. Das Maximallevel {MAX_LEVEL} erreichst du nach insgesamt{" "}
            {formatNumber(XP_TO_MAX)} XP. XP gibt es aus Quests und Kämpfen – höhere Level brauchen deutlich mehr Siege.
          </p>
          <p>
            Gegner, die mehr als {XP_PENALTY_FREE_LEVELS} Level unter dir liegen, geben weniger Erfahrung: pro Level 15 %
            weniger, höchstens bis auf 10 %. Im Kampf-Tab steht bei jedem Gegner, wie viel er dir noch bringt.
          </p>
          <p>
            Jedes Level-up bringt <b>{POINTS_PER_LEVEL} Attributpunkte</b> (im Charakter-Tab frei verteilen) und{" "}
            <b>{SKILL_POINTS_PER_LEVEL} Skillpunkt</b> (im Skills-Tab).
          </p>
          <Table
            head={["Attribut", "Wirkung im Kampf"]}
            rows={[
              [STAT_LABELS.strength, "Schaden mit Schwert, Zweihandschwert, Axt, Grossaxt, Grosshammer (+0,25 pro Punkt)"],
              [STAT_LABELS.intellect, "Schaden mit Stab und Zepter (+0,25 pro Punkt), +1 Mana pro Punkt"],
              [
                STAT_LABELS.endurance,
                "+1,5 Lebenspunkte pro Punkt, Schaden mit Streitkolben und Schild (+0,15 pro Punkt), mehr Schild-Rüstung",
              ],
              [
                STAT_LABELS.charisma,
                "Schaden mit Dolch und Bogen (+0,25 pro Punkt), +0,2 % Krit-Chance (max. 30 %), +0,5 % Gold aus Kämpfen pro Punkt",
              ],
            ]}
          />
          <p>
            Attributboni auf Items und aus Boss-Sets zählen genauso wie verteilte Punkte. Im Charakter-Tab kannst du alle
            Attributpunkte zurücksetzen und neu verteilen – das erste Mal kostenlos, danach gegen Gold (je nach Level).
          </p>
        </Topic>

        <Topic id="skills" title="🌳 Skills & Fähigkeiten">
          <p>
            Jeder Waffentyp (und der Schild) hat einen eigenen Skill mit {MAX_SKILL_RANK} Rängen. Jeder Rang gibt{" "}
            {pct(SKILL_BONUS_PER_RANK)} Schaden mit Waffen dieses Typs – beim Schild {pct(SKILL_BONUS_PER_RANK)} mehr
            Schild-Rüstung.
          </p>
          <H>Fähigkeiten</H>
          <p>
            Ab Rang {ABILITY_UNLOCK_RANK} in einem Waffentyp schaltest du für einen weiteren Skillpunkt seine erste
            Kampf-Fähigkeit frei. Ab Level {SECOND_ABILITY_LEVEL} gibt es für {SECOND_ABILITY_COST} Skillpunkte die zweite – auch ohne die erste. Im
            Skilltree zeigt ein Symbol pro Fähigkeit, was sie kann, wenn du darüberfährst. Im Kampf stehen die Fähigkeiten der
            gerade angelegten Waffen bereit.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Eine Fähigkeit ersetzt den normalen Angriff einer Runde und kostet Mana.</li>
            <li>
              Mana ist zu Kampfbeginn voll und füllt sich um {MANA_REGEN} pro Runde. Das Maximum wächst mit Level und
              Intelligenz.
            </li>
            <li>Nach dem Einsatz ist eine Fähigkeit 1–4 Runden gesperrt – je stärker, desto länger.</li>
          </ul>
          <p>Gegen Gold kannst du alle Skillpunkte zurücksetzen und neu verteilen. Der Preis steigt mit deinem Level.</p>
        </Topic>

        <Topic id="equipment" title="🎒 Ausrüstung">
          <p>
            Du hast fünf Rüstungsplätze (Kopf, Brust, Arme, Beine, Füsse) und zwei Waffenhände. Rüstung schützt, Waffen
            machen Schaden. Zweihandwaffen belegen beide Hände. Ein Schild gehört in eine Waffenhand und gibt Angriff und
            Rüstung – mehr als ein Schild geht nicht. Jedes Item hat ein Mindestlevel.
          </p>
          <H>Seltenheit</H>
          <Table
            head={["Seltenheit", "Grundwerte", "Attributboni", "Wert"]}
            rows={RARITIES.map((r) => [
              r.label,
              `× ${formatNumber(r.statMultiplier)}`,
              r.bonusCount === 0 ? "–" : `${r.bonusCount}`,
              `× ${r.priceMultiplier}`,
            ])}
          />
          <H>Rüstungsklassen</H>
          <p>Jedes Rüstungsteil ist leicht, mittel oder schwer. Leichtere Rüstung schützt weniger, gibt dafür pro Teil etwas zurück:</p>
          <Table
            head={["Klasse", "Rüstung", "Ausgleich pro Teil"]}
            rows={ARMOR_CLASSES.map((c) => [
              `${c.icon} ${c.label}`,
              pct(c.armorFactor),
              [c.manaPerPiece > 0 && `+${c.manaPerPiece} Mana`, c.critPerPiece > 0 && `+${pct(c.critPerPiece)} Krit`]
                .filter(Boolean)
                .join(", ") || "–",
            ])}
          />
          <H>Klassen</H>
          <p>
            Trägst du mindestens {CLASS_ARMOR_PIECES} Rüstungsteile derselben Rüstungsklasse und die passende Waffe, wirst
            du zu einer Klasse mit eigenem Bonus – zum Beispiel leichte Rüstung und Stab: 🔮 Magier. Es gibt elf Klassen;
            welche Kombination was ergibt, findest du selbst heraus (oder schaust bei anderen Helden in der Rangliste). Entdeckte
            Klassen stehen im Charakter-Tab – mit dem, was sie brauchen.
          </p>
          <H>Boss-Items & Sets</H>
          <p>
            Jeder Boss hat eigene, immer legendäre Items, die nur er fallen lässt (Chance {pct(BOSS_ITEM_DROP_CHANCE)} pro
            Sieg). Trägst du mehrere Teile desselben Bosses, gibt es Set-Boni: ab 2 Teilen Attributpunkte, ab mehr Teilen{" "}
            {pct(SET_GEAR_BONUS)} mehr Angriff und Rüstung, bei Dungeon- und Koop-Sets ab 6 Teilen auch mehr Lebenspunkte.
            Die Boss-Sammlung im Charakter-Tab zeigt, was dir noch fehlt.
          </p>
          <H>Gear Score</H>
          <p>
            Eine Zahl für die Qualität deiner angelegten Ausrüstung: Durchschnitt aus Item-Level × Seltenheit über alle
            sieben Plätze, plus ein kleiner Aufschlag pro Schmied-Stufe. Leere Plätze zählen 0, eine Zweihandwaffe doppelt.
            Lauter gewöhnliche Items der Stufe 40 ergeben Gear Score 40.
          </p>
        </Topic>

        <Topic id="village" title="🏘️ Dorf">
          <H>🏪 Händler</H>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Alle {SHOP_ROTATION_HOURS} Stunden gibt es {SHOP_SIZE} neue Items passend zu deinem Level – mit etwas Glück
              seltene, epische oder sogar legendäre.
            </li>
            <li>Bis zu {SHOP_REROLLS_PER_DAY}-mal am Tag kannst du gegen Gold sofort neue Ware auswürfeln.</li>
            <li>Items, die du nicht brauchst, verkaufst du hier für einen Teil ihres Werts.</li>
            <li>Kleine und normale Heiltränke kannst du kaufen, alle anderen Tränke gibt es nur als Kampfbeute.</li>
          </ul>
          <Table
            head={["Trank", "Wirkung", "Preis"]}
            rows={POTIONS.map((p) => [
              `${p.icon} ${p.name}`,
              potionEffectText(p),
              p.price === null ? "nur Beute" : <Gold amount={p.price} />,
            ])}
          />
          <H>⚒️ Schmied</H>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <b>Zerlegen:</b> Items ab „selten“ werden zu Essenz 💠 – je seltener und höher das Level, desto mehr.
              Angelegte Items musst du vorher ablegen.
            </li>
            <li>
              <b>Verbessern:</b> Mit Essenz steigerst du den Hauptwert (Angriff oder Rüstung) eines Items um{" "}
              {pct(UPGRADE_STEP)} pro Stufe, bis +{MAX_UPGRADE}. Jede Stufe kostet mehr als die vorige.
            </li>
            <li>Zerlegst du ein verbessertes Item, bekommst du {pct(UPGRADE_REFUND)} der hineingesteckten Essenz zurück.</li>
          </ul>
        </Topic>

        <Topic id="battle" title="🗡️ Kampf">
          <p>Kämpfe sind rundenbasiert und beginnen immer mit vollen Lebenspunkten. Eine Runde läuft so ab:</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Optional ein Trank – höchstens einer pro Runde, jede Sorte einmal pro Kampf.</li>
            <li>Dein Angriff: normal oder mit einer Fähigkeit.</li>
            <li>Gift, Feuer und Bluten wirken, dann schlägt der Gegner zurück (ausser er ist betäubt).</li>
            <li>Du regenerierst etwas Mana.</li>
          </ol>
          <p>
            Rüstung fängt einen Teil des Schadens ab – gegen stärkere Gegner braucht es mehr Rüstung für denselben Schutz.
            Kritische Treffer machen 1,5-fachen Schaden.
          </p>
          <p>
            <b>Flucht</b> ist jederzeit möglich und kostet etwa so viel Gold, wie der Gegner im Schnitt fallen lässt.
            Niederlagen und Fluchten geben keine Beute.
          </p>
          <H>Beute</H>
          <ul className="list-disc space-y-1 pl-5">
            <li>Jeder Sieg gibt XP, oft Gold und manchmal ein Item oder einen Heiltrank.</li>
            <li>Bosse geben immer Gold, ein Item und zwei Heiltränke – dazu die Chance auf ein Boss-Item.</li>
            <li>
              Nach einem Sieg erscheint ein Gebietsboss erst nach {AREA_BOSS_RESPAWN_MS / 60_000} Minuten wieder. Der Kampf-Tab
              zeigt die Restzeit.
            </li>
            <li>Selten ({pct(BUFF_POTION_DROP_CHANCE)}) fällt ein Angriffs- oder Rüstungstrank.</li>
            <li>Je höher das Gebiet, desto stärker die Heiltränke.</li>
          </ul>
          <H>Gebiete</H>
          <p>Jedes Gebiet öffnet sich ab seinem Mindestlevel und hat vier Kreaturen und einen Boss.</p>
          <Table head={["Gebiet", "Level"]} rows={AREAS.map((a) => [a.name, `${a.minLevel}–${a.maxLevel}`])} />
          <H>Boss-Fähigkeiten</H>
          <p>
            Bosse setzen alle paar Runden eine besondere Attacke ein. Sie wird eine Runde vorher angekündigt: Ein Bollwerk
            (Schild) blockt sie komplett, ein Betäubender Schlag (Streitkolben) verhindert sie. Dungeon-Bosse haben zwei
            Fähigkeiten, die sich abwechseln.
          </p>
        </Topic>

        <Topic id="dungeons" title="🗝️ Dungeons">
          <p>
            Mehrere stärkere Gegner nacheinander, ohne Heilung dazwischen – am Ende wartet ein Boss mit eigenem Set. Kämpfe
            kosten nichts – du kannst so oft antreten, wie du willst.
          </p>
          <p>
            Die Beute sammelt sich in einer <b>Truhe</b> und wird erst am Ende gutgeschrieben. Du kannst zwischen zwei
            Kämpfen aussteigen und behältst, was drin ist. Verlierst du, ist die Truhe weg.
          </p>
          <Table
            head={["Dungeon", "ab Level", "Kämpfe"]}
            rows={DUNGEONS.map((d) => [d.name, `${d.minLevel}`, `${d.creatures.length}`])}
          />
        </Topic>

        <Topic id="coop" title="🤝 Koop">
          <p>
            {COOP_MIN_PLAYERS}–{COOP_MAX_PLAYERS} Helden kämpfen gemeinsam gegen einen Koop-Boss. Dafür brauchst du ein
            Cloud-Konto. Wer eine Lobby erstellt, bekommt einen Code und einen Einladungslink zum Teilen.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Alle wählen gleichzeitig ihre Aktion, {COOP_TURN_SECONDS} Sekunden lang. Wer nicht wählt, greift normal an.</li>
            <li>
              <b>Bedrohung:</b> Der Boss greift meist an, wer am meisten Schaden macht. Sie sinkt jede Runde um{" "}
              {pct(THREAT_DECAY)}. Mit Bollwerk zieht ein Schildträger {pct(BULWARK_SHARE)} der Angriffe auf sich.
            </li>
            <li>
              Die Fähigkeiten der Koop-Bosse treffen die ganze Gruppe. Dungeon-Bosse wechseln ab: eine Fähigkeit gegen ein
              Ziel, eine gegen alle.
            </li>
            <li>Gefallene Mitspieler belebst du mit einem Heiltrank wieder – jeden höchstens einmal pro Kampf.</li>
            <li>
              Bei einem Sieg würfelt jeder seine eigene Beute ({formatNumber(COOP_REWARD_FACTOR)}-fache XP und Gold eines
              Solo-Bosses) – auch wer gefallen ist. Fallen alle, gibt es nichts.
            </li>
          </ul>
          <Table head={["Koop-Boss", "Level"]} rows={COOP_BOSSES.map((b) => [b.name, `${b.level}`])} />
          <H>🏰 Koop-Dungeons</H>
          <p>Alle Dungeons lassen sich auch gemeinsam spielen – mit denselben Gegnern, die mit der Gruppe stärker werden.</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Zwischen den Kämpfen keine Heilung. Gefallene stehen mit {pct(DUNGEON_REVIVE_HP)} ihrer Lebenspunkte wieder
              auf, Mana ist wieder voll.
            </li>
            <li>Nach jedem Sieg entscheidet der Host: weiter zum nächsten Gegner oder mit der Truhe aussteigen.</li>
            <li>Jeder hat seine eigene Truhe mit der Beute wie solo. Fällt die ganze Gruppe, sind alle Truhen weg.</li>
          </ul>
        </Topic>

        <Topic id="achievements" title="🏆 Erfolge & Rangliste">
          <p>
            Erfolge gibt es für Meilensteine in Quests, Charakter, Kampf, Sammeln und Koop – meist in den Stufen Bronze,
            Silber und Gold. Jede Gold-Stufe schaltet einen <b>Titel</b> frei, den du unter deinem Namen zeigen kannst.
          </p>
          <p>
            Für die Gesamtzahl erreichter Stufen und für besondere Erfolge gibt es <b>Avatar-Rahmen</b> (
            {FRAMES.length - 1} insgesamt). Titel und Rahmen wählst du im Charakter-Tab unter Erfolge.
          </p>
          <p>
            Mit einem Cloud-Konto wird dein Spielstand gesichert und du erscheinst in der <b>Rangliste</b>, sortiert nach
            Gesamt-XP. Ein Klick auf einen Helden zeigt sein Profil samt Ausrüstung.
          </p>
        </Topic>
      </div>
    </OpenTopics.Provider>
  );
}

/** Welche Themen aufgeklappt sind – damit „Alle aufklappen“ jedes Thema steuern kann. */
const OpenTopics = createContext<{ open: ReadonlySet<TopicId>; toggle: (id: TopicId, isOpen: boolean) => void }>({
  open: new Set(),
  toggle: () => {},
});

/** Aufklappbares Thema – der Titel ist die Zeile zum Auf- und Zuklappen. */
function Topic({ id, title, children }: { id: TopicId; title: string; children: ReactNode }) {
  const { open, toggle } = useContext(OpenTopics);
  return (
    <details
      open={open.has(id)}
      onToggle={(e) => toggle(id, e.currentTarget.open)}
      className="panel group leading-relaxed"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md p-4 hover:bg-night-800 [&::-webkit-details-marker]:hidden">
        <h3 className="font-pixel text-xl text-gold">{title}</h3>
        <span aria-hidden className="font-pixel text-muted transition-transform group-open:rotate-90">
          ▶
        </span>
      </summary>
      <div className="flex flex-col gap-3 px-4 pb-4">{children}</div>
    </details>
  );
}

function H({ children }: { children: ReactNode }) {
  return <h4 className="font-pixel mt-1 text-lg">{children}</h4>;
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-muted">
          <tr>
            {head.map((h) => (
              <th key={h} className="border-b-2 border-night-700 px-2 py-1 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-night-800">
              {row.map((cell, j) => (
                <td key={j} className="tabular-nums px-2 py-1">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
