// Berichte der Klassen-Simulation (Etappe G0) – nur zum Abstimmen, nicht Teil der normalen Testläufe.
// Laufen nur mit gesetztem SIM_MODE, z. B. in der Git-Bash:
//   SIM_MODE=spread npx vitest run src/domain/zzClassSim.test.ts
// in PowerShell:
//   $env:SIM_MODE="spread"; npx vitest run src/domain/zzClassSim.test.ts
//
// SIM_MODE:
//   spread  Klassenspreizung: Siegquote, Runden und D/Runde pro Klasse und Gebietsboss (Review Nr. 22)
//   budget  Budget-Messung: Schaden pro Runde in D mit Klasse und ohne, Mehrwert in % (klassen-neukonzept.md 4.2)
//   skills  Skilltree: Siegquote pro Klasse mit Haupt- und Zweitpfad (SIM_SKILLS, Standard: je Pfad A/B allein)
//   coop    Koop-Kampfdauer: Runden pro Raid-Boss mit 2/3/4 Helden (SIM_COOP_CLASSES, SIM_LEVEL_OFFSET,
//           SIM_DEFEND, SIM_ENRAGE – Vorschau der Boss-Raserei)
// Weitere Variablen: SIM_N (Kämpfe pro Zeile, Standard 100), SIM_RAR (Seltenheit, Standard rare),
// SIM_BOSSES (Indizes der Gebiete, z. B. "0,2,5"), SIM_SEED.

import { describe, it } from "vitest";
import { COOP_BOSSES } from "./coopCombat";
import type { HeroClassId } from "./heroClasses";
import { hash, seededRng } from "./random";
import type { SkillPath } from "./skills";
import type { Rarity } from "./types";
import {
  AREA_BOSSES,
  CLASS_BUILDS,
  classBudget,
  classSpread,
  coopPlayers,
  fightCoop,
  pct,
  simulateSolo,
} from "../test/classSim";

// Ohne Node-Typen im Projekt: die Umgebungsvariablen über globalThis lesen
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const MODE = env.SIM_MODE;
const N = Number(env.SIM_N ?? 100);
const RARITY = (env.SIM_RAR ?? "rare") as Rarity;
const SEED = Number(env.SIM_SEED ?? 1);
const BOSSES = env.SIM_BOSSES ? env.SIM_BOSSES.split(",").map((i) => AREA_BOSSES[Number(i)]) : AREA_BOSSES;
const pad = (v: string | number, n: number) => String(v).padStart(n);

describe.runIf(MODE)(`Klassen-Simulation (${MODE})`, () => {
  it.runIf(MODE === "spread")("Klassenspreizung", () => {
    const rows = classSpread({ n: N, rarity: RARITY, seed: SEED, bosses: BOSSES });
    const lines = rows.map(
      (r) =>
        `${r.id.padEnd(10)} Ø ${pad(pct(r.meanWin), 3)} % ${r.meanRounds.toFixed(1).padStart(5)} R ${r.meanD.toFixed(2)} D | ` +
        r.results.map((x) => `${pad(pct(x.win), 3)} % ${x.rounds.toFixed(1).padStart(4)} R`).join(" | "),
    );
    const wins = rows.map((r) => r.meanWin);
    console.log(
      [
        `Seltenheit ${RARITY}, N=${N}, Bosse: ${BOSSES.map((b) => b.name).join(" / ")}`,
        ...lines,
        `Abstand beste/schlechteste: ${pct(Math.max(...wins) - Math.min(...wins))} Punkte`,
      ].join("\n"),
    );
  });

  it.runIf(MODE === "budget")("Budget-Messung", () => {
    const lines = CLASS_BUILDS.map((build) => {
      const b = classBudget(build, { n: N, rarity: RARITY, seed: SEED, bosses: BOSSES });
      return (
        `${build.id.padEnd(10)} Klasse ${b.withClass.meanD.toFixed(3)} D/R (${pad(pct(b.withClass.meanWin), 3)} %)` +
        ` | klassenlos ${b.classless.meanD.toFixed(3)} D/R (${pad(pct(b.classless.meanWin), 3)} %)` +
        ` | Mehrwert ${b.value >= 0 ? "+" : ""}${pct(b.value)} %, Siege ${b.withClass.meanWin >= b.classless.meanWin ? "+" : ""}${pct(b.withClass.meanWin - b.classless.meanWin)} Punkte`
      );
    });
    console.log([`Budget: Seltenheit ${RARITY}, N=${N}`, ...lines].join("\n"));
  });

  it.runIf(MODE === "skills")("Skilltree pro Klasse", () => {
    // SIM_SKILLS="blade:0+plague:0" → Hauptpfad Klinge (Gabel A), Rest in Plage (Gabel A)
    const plans: [SkillPath, 0 | 1][][] = env.SIM_SKILLS
      ? env.SIM_SKILLS.split(",").map((plan) => plan.split("+").map((p) => p.split(":")).map(([path, fork]) => [path as SkillPath, Number(fork) as 0 | 1]))
      : [[], ...(["blade", "guard", "arcane", "plague"] as const).flatMap((p) => [[[p, 0]], [[p, 1]]] as [SkillPath, 0 | 1][][])];
    const label = (plan: [SkillPath, 0 | 1][]) => plan.map(([p, f]) => `${p}${"AB"[f]}`).join("+") || "ohne";
    const lines = CLASS_BUILDS.map((build) => {
      const cells = plans.map((skills) => {
        const results = BOSSES.map((boss) => simulateSolo(build, boss, { n: N, rarity: RARITY, seed: SEED, skills }));
        return pad(pct(results.reduce((s, r) => s + r.win, 0) / results.length), 4);
      });
      return `${build.id.padEnd(10)} ${cells.join(" ")}`;
    });
    console.log([`Skills: Seltenheit ${RARITY}, N=${N}; Spalten: ${plans.map(label).join(" | ")}`, ...lines].join("\n"));
  });

  it.runIf(MODE === "coop")("Koop-Kampfdauer", () => {
    // SIM_COOP_CLASSES="champion,assassin,warden,plunderer" – die ersten 2/3/4 bilden die Gruppe
    // SIM_LEVEL_OFFSET: Helden so viele Level über dem Boss (Standard 0)
    const classes = (env.SIM_COOP_CLASSES ?? "champion,assassin,warden,plunderer").split(",") as HeroClassId[];
    const offset = Number(env.SIM_LEVEL_OFFSET ?? 0);
    // SIM_ENRAGE="20:0.1" → Vorschau Boss-Raserei ab Runde 20, +10 % Schaden pro Runde
    const [from, step] = (env.SIM_ENRAGE ?? "").split(":").map(Number);
    const enrage = env.SIM_ENRAGE ? { from, step } : undefined;
    // SIM_DEFEND="0.5" → der erste Held wehrt mit dieser Chance pro Runde ab (Tank, der Zeit schindet)
    const defendChance = env.SIM_DEFEND ? { p0: Number(env.SIM_DEFEND) } : undefined;
    const lines: string[] = [];
    for (const boss of COOP_BOSSES) {
      for (const size of [2, 3, 4].filter((s) => s <= classes.length)) {
        const rng = seededRng(hash(`${boss.id}|${size}|${SEED}`));
        const level = Math.min(60, boss.level + offset);
        const results = Array.from({ length: N }, (_, i) =>
          fightCoop(boss.id, coopPlayers(classes.slice(0, size), level, `${boss.id}-${size}-${i}`, { rarity: RARITY }), rng, {
            enrage,
            defendChance,
          }),
        );
        const won = results.filter((r) => r.status === "won").map((r) => r.rounds).sort((a, b) => a - b);
        const q = (p: number) => (won.length ? won[Math.min(won.length - 1, Math.floor(p * won.length))] : NaN);
        lines.push(
          `${boss.name.padEnd(20)} ${size} Helden: Siege ${pad(pct(won.length / N), 3)} % | Runden (Siege) Median ${q(0.5)}, 90 % ${q(0.9)}, max ${won.at(-1) ?? NaN}`,
        );
      }
    }
    console.log([`Koop: ${classes.join(", ")}, Seltenheit ${RARITY}, N=${N}, Raserei ${env.SIM_ENRAGE ?? "aus"}, Abwehr ${env.SIM_DEFEND ?? "0"}`, ...lines].join("\n"));
  });
});
