// Test-Hilfe: im Koop-Dungeon zum nächsten Schritt – an einer Gabelung durch eine Kampf-Tür.

import { nextDungeonStage, type CoopBattleState } from "../domain/coopCombat";
import { coopDoors, voteDoor } from "../domain/coopDungeonPaths";

/**
 * Nach einem Sieg weiter: Steht der nächste Gegner fest, wie der Host mit „Weiter“, sonst stimmt
 * der erste Held allein für eine gewöhnliche Kampf-Tür (bzw. den Elite-Raum, wenn es keine gibt).
 */
export function advanceCoopDungeon(state: CoopBattleState, id: string, now = 0): CoopBattleState {
  const doors = coopDoors(state);
  if (!doors) return nextDungeonStage(state, id, now);
  const fight = doors.findIndex((d) => d.kind === "fight");
  const index = fight >= 0 ? fight : doors.findIndex((d) => d.kind === "elite");
  const heroId = state.heroes[0].id;
  return voteDoor(state, heroId, index, { present: [heroId], hostId: heroId }, () => id, now);
}
