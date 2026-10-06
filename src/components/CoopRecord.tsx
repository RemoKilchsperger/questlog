import { COOP_BOSSES, EMPTY_COOP_STATS, type CoopStats } from "../domain/coopCombat";
import { getCreatureSprite } from "../game/creatureSprites";
import { PixelSprite } from "./PixelSprite";

/** Koop-Erfolge: Anzahl Siege und welche Koop-Bosse schon gefallen sind. */
export function CoopRecord({ stats = EMPTY_COOP_STATS }: { stats?: CoopStats }) {
  return (
    <section className="panel p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-pixel text-2xl">Koop-Raids</h2>
        <span className="text-sm text-muted">
          <span className="num text-legendary">{stats.wins}</span> {stats.wins === 1 ? "Sieg" : "Siege"}
        </span>
      </div>
      <ul className="grid grid-cols-3 gap-3">
        {COOP_BOSSES.map((boss) => {
          const defeated = stats.bosses.includes(boss.id);
          return (
            <li
              key={boss.id}
              className={`flex flex-col items-center gap-1 rounded-md border-2 bg-night-800 p-2 text-center ${
                defeated ? "border-legendary/70" : "border-night-700"
              }`}
              title={defeated ? `${boss.name} besiegt` : `${boss.name} – noch nicht besiegt`}
            >
              <PixelSprite sprite={getCreatureSprite(boss.sprite)} size={48} className={defeated ? "" : "opacity-30 grayscale"} />
              <span className={`text-xs ${defeated ? "text-legendary" : "text-muted"}`}>
                {defeated ? "✓ " : ""}
                {boss.name}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
