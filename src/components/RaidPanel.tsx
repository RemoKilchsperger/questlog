import { motion } from "motion/react";
import { chestCount, type BattleState } from "../domain/combat";
import { isBusy } from "../domain/companions";
import {
  getBand,
  GUARD_WEAKEN,
  MAX_GUARDS,
  RAID_MIN_BUILDINGS,
  raidLineup,
  raidsUnlocked,
  WALL_WEAKEN,
  type RaidReport,
} from "../domain/raids";
import { getBuilding } from "../domain/village";
import { useGameStore } from "../store/gameStore";
import { formatMinutes } from "./CompanionScreen";
import { DungeonChest } from "./DungeonChest";
import { Gold } from "./Gold";
import { Hint } from "./HoverCard";
import { MaterialGain } from "./materialUi";
import { useNow } from "./useNow";

/** Begleiter, die gerade nicht auf Mission sind – sie stehen bei einem Überfall Wache. */
function useGuards(): number {
  return useGameStore((s) => s.companions.filter((c) => !isBusy(s.activeMissions, c.id)).length);
}

/**
 * Überfälle im Dorf: die angekündigte Bande mit Frist und Gegnern, der Knopf zum Verteidigen
 * und der Bericht des letzten Überfalls. `quiet`: auch zeigen, wenn gerade nichts los ist (Wehranlage).
 */
export function RaidPanel({ onDefend, quiet = false }: { onDefend: () => void; quiet?: boolean }) {
  const raids = useGameStore((s) => s.raids);
  const unlocked = useGameStore((s) => raidsUnlocked(s.village));
  const walls = useGameStore((s) => s.village.walls);
  const fighting = useGameStore((s) => s.battle !== null);
  const startRaid = useGameStore((s) => s.startRaid);
  const guards = useGuards();
  const now = useNow(60_000).getTime();
  const raid = raids.current;

  if (!raid && !raids.report && !quiet) return null;

  return (
    <section id={quiet ? undefined : "raid"} className={`panel flex scroll-mt-4 flex-col gap-3 p-4 ${raid ? "border-danger" : ""}`}>
      {raids.report && <RaidReportLine report={raids.report} />}
      {raid ? (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-pixel text-2xl text-danger">⚔️ Überfall: {getBand(raid.areaId).name}</h2>
            <span className="text-sm">
              Greift an in <span className="num font-bold text-danger">{formatMinutes(Math.max(0, raid.attackAt - now))}</span>
            </span>
          </div>
          <p className="text-sm">
            {getBand(raid.areaId).approach} Stell dich ihr, bevor sie das Dorf erreicht – sonst beschädigt sie ein Gebäude
            {walls >= 3 ? ", doch die Wachen deiner Festung halten sie auf" : ""}.
          </p>
          <ol className="flex flex-wrap gap-2 text-sm">
            {raidLineup(raid, walls, guards).map(({ creature, leader }, i) => (
              <li
                key={i}
                className={`rounded-md border-2 px-2 py-0.5 ${leader ? "border-legendary text-legendary" : "border-night-700"}`}
              >
                {leader ? `★ Anführer: ${creature.name}` : `Welle ${i + 1}: ${creature.name}`}
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted">
            Alle auf Level <span className="num">{raid.level}</span>, ohne Heilung zwischen den Kämpfen.{" "}
            <Strength walls={walls} guards={guards} /> Wer gewinnt, bekommt die Beute der Bande: viel Gold, Material und
            sicher ein Item.
          </p>
          <div className="flex justify-end">
            <motion.button
              whileTap={{ scale: 0.92 }}
              disabled={fighting}
              title={fighting ? "Beende zuerst deinen laufenden Kampf" : undefined}
              onClick={() => {
                startRaid();
                onDefend();
              }}
              className="font-pixel rounded-md border-2 border-danger bg-danger/15 px-4 py-1.5 text-danger hover:bg-danger/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              🛡️ Dorf verteidigen
            </motion.button>
          </div>
        </>
      ) : (
        quiet && (
          <p className="text-sm text-muted">
            {unlocked
              ? "Ruhig. Die Späher melden keine Bande – die nächste kündigt sich ein bis zwei Tage nach der letzten an."
              : `Noch ist dein Dorf zu klein, um Banden anzulocken. Überfälle gibt es ab ${RAID_MIN_BUILDINGS} Gebäuden.`}
          </p>
        )
      )}
    </section>
  );
}

/** Was die Angreifer schwächt: Wehranlage und Begleiter, die Wache stehen. */
function Strength({ walls, guards }: { walls: keyof typeof WALL_WEAKEN; guards: number }) {
  const counted = Math.min(guards, MAX_GUARDS);
  const parts = [
    WALL_WEAKEN[walls] > 0 && `Wehranlage −${Math.round(WALL_WEAKEN[walls] * 100)} %`,
    counted > 0 && `${counted} ${counted === 1 ? "Begleiter steht" : "Begleiter stehen"} Wache −${Math.round(counted * GUARD_WEAKEN * 100)} %`,
  ].filter(Boolean);
  if (parts.length === 0)
    return <span>Eine Wehranlage und Begleiter, die nicht auf Mission sind, würden die Angreifer schwächen.</span>;
  return (
    <Hint text="Weniger Lebenspunkte und Schaden der Angreifer.">
      <span className="text-xp">Geschwächt: {parts.join(", ")}.</span>
    </Hint>
  );
}

/** Wie der letzte Überfall ausging – bis man ihn wegklickt. */
function RaidReportLine({ report }: { report: RaidReport }) {
  const dismiss = useGameStore((s) => s.dismissRaidReport);
  const band = getBand(report.areaId).name;
  const good = report.kind === "defended" || report.kind === "repelled";
  return (
    <div className={`flex flex-wrap items-start gap-3 rounded-md border-2 p-3 text-sm ${good ? "border-xp/60" : "border-danger/60"}`}>
      <p className="min-w-0 flex-1">
        {report.kind === "defended" && <>🏰 Du hast die {band} zurückgeschlagen. Das Dorf ist sicher.</>}
        {report.kind === "repelled" && <>🏰 Die Wachen der Festung haben die {band} aufgehalten – diesmal ohne Beute.</>}
        {(report.kind === "lost" || report.kind === "missed") && (
          <>
            {report.kind === "missed" ? "Niemand hat das Dorf verteidigt. " : "Du hast gegen die Bande verloren. "}
            {report.building ? (
              <>
                🔥 Die {band} hat <strong>{getBuilding(report.building).name}</strong> beschädigt. Es wirkt eine Stufe tiefer,
                bis du es reparierst.
              </>
            ) : (
              <>
                Die {band} hat das Lager geplündert: <Gold amount={-report.gold} className="font-bold text-danger" />{" "}
                <MaterialGain materials={report.materials} sign="−" />
              </>
            )}
          </>
        )}
      </p>
      <button onClick={dismiss} className="rounded-md border-2 border-night-700 px-3 py-0.5 text-muted hover:text-parchment">
        OK
      </button>
    </div>
  );
}

/* ───────────── Im Kampf ───────────── */

/** Über der Kampfszene: welche Welle, was noch kommt und was in der Truhe liegt. */
export function RaidProgress() {
  const raid = useGameStore((s) => s.raid);
  if (!raid) return null;
  const left = raid.lineup.length - raid.wave - 1;
  const leader = raid.lineup[raid.wave].leader;
  return (
    <p className="mb-3 flex flex-wrap gap-x-4 text-sm text-muted">
      <span className={leader ? "font-bold text-legendary" : ""}>
        {leader ? "★ Der Anführer stellt sich dir!" : `★ Anführer nach ${left} weiteren Kampf${left === 1 ? "" : "en"}`}
      </span>
      <span>🧰 {chestCount(raid.chest)} in der Truhe</span>
    </p>
  );
}

/** Nach einem Kampf gegen die Bande: weiter, verteidigt (Truhe) oder verloren (Schaden). */
export function RaidResultActions({ battle, won }: { battle: BattleState; won: boolean }) {
  const raid = useGameStore((s) => s.raid)!;
  const next = useGameStore((s) => s.nextRaidWave);
  const leave = useGameStore((s) => s.leaveBattle);
  const back = (
    <button onClick={leave} className="rounded-md border-2 border-night-700 px-4 py-1.5 text-muted hover:text-parchment">
      Zurück
    </button>
  );

  if (raid.claimed) {
    return (
      <div className="flex w-full flex-col items-center gap-3">
        <p className="font-pixel text-xl text-legendary">🏰 Das Dorf ist sicher – die Bande flieht!</p>
        <DungeonChest chest={raid.claimed} />
        {back}
      </div>
    );
  }

  if (raid.report) {
    return (
      <div className="flex w-full flex-col items-center gap-2">
        <RaidReportLine report={raid.report} />
        {back}
      </div>
    );
  }

  if (!won) {
    // Geflohen: Die Bande wartet weiter vor dem Dorf
    return (
      <div className="flex flex-col items-center gap-2">
        <p className="text-sm text-muted">
          Die Bande wartet weiter vor dem Dorf – du kannst dich ihr bis zur Frist noch einmal stellen.
          {chestCount(raid.chest) > 0 && " Die Beute der gewonnenen Kämpfe ist verloren."}
        </p>
        {back}
      </div>
    );
  }

  const upcoming = raid.lineup[raid.wave + 1];
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <p className="text-sm text-muted">
        Welle geschlagen. Du gehst mit{" "}
        <span className="num text-xp">
          {battle.hero.hp}/{battle.hero.maxHp} LP
        </span>{" "}
        weiter{upcoming?.leader ? " – jetzt kommt der Anführer!" : "."}
      </p>
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={next}
        className="font-pixel rounded-md border-2 border-danger bg-danger/15 px-4 py-1.5 text-danger hover:bg-danger/25"
      >
        {upcoming?.leader ? "★ Gegen den Anführer" : "Nächste Welle"}
      </motion.button>
    </div>
  );
}
