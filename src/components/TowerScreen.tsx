// Endlos-Turm (docs/endlos-turm.md): Eingang im Kampf-Tab, Fortschritt während
// des Laufs, Segen-Wahl und Ende nach einem Kampf.

import { motion } from "motion/react";
import { chestCount, type BattleState } from "../domain/combat";
import {
  BLESSING_EVERY,
  BOSS_EVERY,
  getBlessing,
  isBossFloor,
  stacks,
  TOWER_MIN_LEVEL,
  weekBest,
  type BlessingId,
} from "../domain/tower";
import { useGameStore } from "../store/gameStore";
import { DungeonChest } from "./DungeonChest";
import { Hint } from "./HoverCard";

/** Eingang im Kampf-Tab: Beschreibung, Rekorde, Start. */
export function TowerPanel({ heroLevel }: { heroLevel: number }) {
  const start = useGameStore((s) => s.startTower);
  const record = useGameStore((s) => s.towerRecord);
  const open = heroLevel >= TOWER_MIN_LEVEL;
  return (
    <section className="panel flex flex-wrap items-center gap-4 p-5">
      <div className="min-w-0 flex-1">
        <h2 className="font-pixel text-2xl">🗼 Endlos-Turm</h2>
        <p className="mt-1 text-sm text-muted">
          Stockwerk für Stockwerk stärkere Gegner auf deinem Level, jedes {BOSS_EVERY}. ein Boss. Nach jedem {BLESSING_EVERY}.
          Stockwerk wählst du einen von drei Segen. Keine Heilung zwischen den Kämpfen – steig mit deiner Truhe aus,
          bevor du fällst.
        </p>
        <p className="mt-1 flex flex-wrap gap-x-4 text-sm">
          <span>
            Diese Woche: <span className="num font-bold text-gold">Stockwerk {weekBest(record)}</span>
          </span>
          <span className="text-muted">
            Rekord: <span className="num">Stockwerk {record.best}</span>
          </span>
        </p>
      </div>
      <motion.button
        whileTap={{ scale: 0.92 }}
        disabled={!open}
        onClick={start}
        title={open ? undefined : `Ab Level ${TOWER_MIN_LEVEL}`}
        className="font-pixel rounded-md border-2 border-legendary bg-legendary/15 px-4 py-1.5 text-legendary hover:bg-legendary/25 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {open ? "Turm betreten" : `🔒 ab Level ${TOWER_MIN_LEVEL}`}
      </motion.button>
    </section>
  );
}

/** Kleine Plakette eines Segens – gestapelte zeigen ×n. */
function BlessingChip({ id, count }: { id: BlessingId; count: number }) {
  const def = getBlessing(id);
  return (
    <Hint text={`${def.name}: ${def.description}`}>
      <span className="rounded border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-xs text-gold">
        {def.icon} {def.name}
        {count > 1 && <span className="num"> ×{count}</span>}
      </span>
    </Hint>
  );
}

/** Fortschritt während des Laufs: Stockwerk, nächster Boss und Segen, gewählte Segen. */
export function TowerProgress({ floor }: { floor: number }) {
  const tower = useGameStore((s) => s.tower);
  if (!tower) return null;
  const toBoss = BOSS_EVERY - (floor % BOSS_EVERY);
  const toBlessing = BLESSING_EVERY - (floor % BLESSING_EVERY);
  const unique = [...new Set(tower.blessings)];
  return (
    <div className="mb-3 flex flex-col gap-1.5 text-sm">
      <p className="flex flex-wrap gap-x-4 text-muted">
        <span className={isBossFloor(floor) ? "font-bold text-legendary" : ""}>
          {isBossFloor(floor) ? "👑 Boss-Stockwerk!" : `👑 Boss in ${toBoss === BOSS_EVERY ? BOSS_EVERY : toBoss} Stockwerk${toBoss === 1 ? "" : "en"}`}
        </span>
        <span>
          ✨ Segen {floor % BLESSING_EVERY === 0 ? "nach diesem Stockwerk" : `in ${toBlessing} Stockwerk${toBlessing === 1 ? "" : "en"}`}
        </span>
        <span>🧰 {chestCount(tower.chest)} in der Truhe</span>
      </p>
      {unique.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {unique.map((id) => (
            <BlessingChip key={id} id={id} count={stacks(tower.blessings, id)} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Nach einem Kampf im Turm: Segen wählen, weiter oder mit der Truhe aussteigen – bzw. das Ende des Laufs. */
export function TowerResultActions({ battle, won }: { battle: BattleState; won: boolean }) {
  const tower = useGameStore((s) => s.tower)!;
  const next = useGameStore((s) => s.nextTowerFloor);
  const choose = useGameStore((s) => s.chooseBlessing);
  const leave = useGameStore((s) => s.leaveBattle);
  const leaveWithChest = useGameStore((s) => s.leaveTowerWithChest);
  const record = useGameStore((s) => s.towerRecord);
  const collected = chestCount(tower.chest);
  const reached = won ? tower.floor : tower.floor - 1;

  if (tower.claimed) {
    return (
      <div className="flex w-full flex-col items-center gap-3">
        <p className="font-pixel text-xl text-legendary">🧰 Du verlässt den Turm nach Stockwerk {reached} mit deiner Truhe.</p>
        <DungeonChest chest={tower.claimed} />
        <button onClick={leave} className="rounded-md border-2 border-night-700 px-4 py-1.5 text-muted hover:text-parchment">
          Zurück zur Gebietskarte
        </button>
      </div>
    );
  }

  if (!won) {
    return (
      <div className="flex flex-col items-center gap-2">
        <p className="text-sm text-danger">
          Der Lauf endet auf Stockwerk {tower.floor}
          {collected > 0 ? ` – die Truhe mit ${collected} Beutestück${collected === 1 ? "" : "en"} ist verloren.` : "."}
        </p>
        <p className="text-sm text-muted">
          Erreicht: <span className="num text-gold">Stockwerk {reached}</span> · Diese Woche:{" "}
          <span className="num">{weekBest(record)}</span> · Rekord: <span className="num">{record.best}</span>
        </p>
        <button onClick={leave} className="rounded-md border-2 border-night-700 px-4 py-1.5 text-muted hover:text-parchment">
          Zurück zur Gebietskarte
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <p className="text-sm text-muted">
        Stockwerk <span className="num text-gold">{tower.floor}</span> geschafft. Du gehst mit{" "}
        <span className="num text-xp">
          {battle.hero.hp}/{battle.hero.maxHp} LP
        </span>{" "}
        weiter{isBossFloor(tower.floor + 1) ? " – oben wartet ein Boss!" : "."}
      </p>
      {tower.offer ? (
        <div className="flex w-full flex-col items-center gap-2">
          <p className="font-pixel text-lg text-gold">✨ Wähle einen Segen</p>
          <div className={`grid w-full gap-2 ${tower.offer.length > 3 ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
            {tower.offer.map((id) => {
              const def = getBlessing(id);
              const have = stacks(tower.blessings, id);
              return (
                <motion.button
                  key={id}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => choose(id)}
                  className="flex flex-col items-center gap-1 rounded-md border-2 border-gold/60 bg-gold/10 p-3 text-center hover:bg-gold/20"
                >
                  <span className="text-3xl" aria-hidden>
                    {def.icon}
                  </span>
                  <span className="font-pixel text-gold">{def.name}</span>
                  <span className="text-xs text-muted">{def.description}</span>
                  {have > 0 && <span className="text-xs text-xp">Schon {have}× – stapelt sich</span>}
                </motion.button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap justify-center gap-2">
          <button
            onClick={leaveWithChest}
            className="rounded-md border-2 border-night-700 px-4 py-1.5 text-muted hover:text-parchment"
          >
            Aussteigen & Truhe öffnen{collected > 0 && ` (${collected})`}
          </button>
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={next}
            className="font-pixel rounded-md border-2 border-legendary bg-legendary/15 px-4 py-1.5 text-legendary hover:bg-legendary/25"
          >
            Weiter zu Stockwerk {tower.floor + 1} ▶
          </motion.button>
        </div>
      )}
    </div>
  );
}
