// Kleiner, typisierter Event-Bus zwischen App (React) und Spielwelt.
// Später hört die Phaser-Kampfszene hier mit (z. B. auf "quest:completed",
// um eine Belohnungs-Animation zu starten), ohne dass
// React und Phaser direkt voneinander wissen müssen.

import type { BattleEvent, BattleState } from "../domain/combat";
import type { CoopBattleState, CoopEvent } from "../domain/coopCombat";
import type { QuestDef } from "../domain/quests";
import type { CombatStats, Loot } from "../domain/types";

export interface GameEvents {
  /** Eine Quest wurde abgegeben (Questbuch oder Tagesauftrag). */
  "quest:completed": { quest: QuestDef; loot: Loot };
  "character:levelup": { from: number; to: number };
  "equipment:changed": CombatStats;
  /** React → Phaser: ein neuer Kampf beginnt. */
  "battle:started": { battle: BattleState };
  /** React → Phaser: Ereignisse einer Aktion (Trank, Angriff), `battle` ist der Stand danach. */
  "battle:events": { battle: BattleState; events: BattleEvent[] };
  /** Phaser → React: Animationen sind fertig, die nächste Aktion ist möglich. */
  "battle:animation-done": { battleId: string };
  /** Koop → Phaser: neue Ereignisse einer Runde, `state` ist der Stand danach. */
  "coop:events": { state: CoopBattleState; events: CoopEvent[] };
  /** Phaser → React: Animationen sind fertig – `logLength` = Länge des Protokolls danach. */
  "coop:animation-done": { logLength: number };
}

type Handler<T> = (payload: T) => void;

class TypedEventBus<E> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(event: K, handler: Handler<E[K]>): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler as Handler<never>);
    return () => this.off(event, handler);
  }

  off<K extends keyof E>(event: K, handler: Handler<E[K]>): void {
    this.handlers.get(event)?.delete(handler as Handler<never>);
  }

  emit<K extends keyof E>(event: K, payload: E[K]): void {
    this.handlers.get(event)?.forEach((h) => (h as Handler<E[K]>)(payload));
  }
}

export const EventBus = new TypedEventBus<GameEvents>();
