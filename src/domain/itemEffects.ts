// Gegenstände mit Spezialeffekt (docs/item-effekte.md): Legendäre Items aus der
// normalen Beute haben einen zufälligen Effekt (Waffen aus dem Waffen-Pool,
// Rüstung aus dem Rüstungs-Pool, dazu allgemeine Effekte), Boss-Items einen
// festen, der zu ihrem Boss passt. Derselbe Effekt zählt nur einmal, auch wenn
// man ihn doppelt trägt.
//
// Gewürfelt wird aus der uid des Items – so bekommen auch legendäre Items aus
// älteren Spielständen beim Laden ihren Effekt, und er ändert sich nie.

import { hash } from "./random";
import type { ItemDef, OwnedItem } from "./types";

export type ItemEffectId =
  // Waffen
  | "ember"
  | "venomFang"
  | "frostBite"
  | "chainLightning"
  | "headsman"
  | "bloodletting"
  | "eliteHunter"
  | "bossSlayer"
  | "runeblade"
  | "manaThief"
  // Rüstung
  | "thorns"
  | "vigilant"
  | "lastStand"
  | "wellspring"
  | "purity"
  | "steadfast"
  | "unyielding"
  // Überall
  | "alchemist"
  | "quickHands"
  | "lucky"
  | "prepared"
  | "towerRunner"
  // Nur auf Boss-Items
  | "warDrum"
  | "allSeeing"
  | "soulDrain"
  | "dragonfire"
  | "vortex";

type EffectPool = "weapon" | "armor" | "any" | "boss";

export interface ItemEffectDef {
  id: ItemEffectId;
  name: string;
  icon: string;
  description: string;
  pool: EffectPool;
}

/** Zahlen der Effekte. */
export const EFFECT = {
  ember: { percent: 0.2, rounds: 2 },
  venomFang: { chance: 0.3, percent: 0.25, rounds: 3 },
  frostBite: 0.1,
  chainLightning: { chance: 0.15, share: 0.6 },
  headsman: { threshold: 0.3, bonus: 0.3 },
  bloodletting: 0.2,
  eliteHunter: 0.25,
  bossSlayer: 0.15,
  manaThief: 3,
  thorns: 0.1,
  lastStand: { threshold: 0.25, armor: 0.25 },
  wellspring: 0.02,
  steadfast: 0.15,
  alchemist: 0.25,
  lucky: 0.2,
  prepared: 20,
  warDrum: { rounds: 3, bonus: 0.15 },
  allSeeing: 0.1,
  soulDrain: 0.06,
  vortex: 0.1,
} as const;

const pct = (v: number) => `${Math.round(v * 100)} %`;

export const ITEM_EFFECTS: readonly ItemEffectDef[] = [
  { id: "ember", name: "Glut", icon: "🔥", pool: "weapon", description: `Kritische Treffer setzen das Ziel ${EFFECT.ember.rounds} Runden in Brand.` },
  { id: "venomFang", name: "Giftzahn", icon: "🐍", pool: "weapon", description: `Treffer vergiften mit ${pct(EFFECT.venomFang.chance)} Chance für ${EFFECT.venomFang.rounds} Runden.` },
  { id: "frostBite", name: "Frostbiss", icon: "❄️", pool: "weapon", description: `${pct(EFFECT.frostBite)} Chance, das Ziel einzufrieren (Betäubungs-Immunität gilt).` },
  { id: "chainLightning", name: "Kettenblitz", icon: "⚡", pool: "weapon", description: `Normale Angriffe springen mit ${pct(EFFECT.chainLightning.chance)} Chance auf einen zweiten Gegner über.` },
  { id: "headsman", name: "Henkersbeil", icon: "🪓", pool: "weapon", description: `+${pct(EFFECT.headsman.bonus)} Schaden gegen Gegner unter ${pct(EFFECT.headsman.threshold)} Lebenspunkten.` },
  { id: "bloodletting", name: "Aderlass", icon: "🩸", pool: "weapon", description: `+${pct(EFFECT.bloodletting)} Schaden gegen blutende Gegner.` },
  { id: "eliteHunter", name: "Elitejäger", icon: "★", pool: "weapon", description: `+${pct(EFFECT.eliteHunter)} Schaden gegen Elite-Gegner.` },
  { id: "bossSlayer", name: "Bossschlächter", icon: "👑", pool: "weapon", description: `+${pct(EFFECT.bossSlayer)} Schaden gegen Bosse.` },
  { id: "runeblade", name: "Runenklinge", icon: "🔮", pool: "weapon", description: "Treffer zählen zusätzlich als Magie, wenn das wirksamer ist." },
  { id: "manaThief", name: "Manadieb", icon: "💧", pool: "weapon", description: `Jeder Treffer stellt ${EFFECT.manaThief} Mana wieder her.` },

  { id: "thorns", name: "Dornen", icon: "🌵", pool: "armor", description: `Wirft ${pct(EFFECT.thorns)} des erlittenen Schadens auf den Angreifer zurück.` },
  { id: "vigilant", name: "Wachsam", icon: "🔰", pool: "armor", description: "Der erste gegnerische Angriff jedes Kampfes wird geblockt." },
  { id: "lastStand", name: "Letztes Gefecht", icon: "🧱", pool: "armor", description: `Unter ${pct(EFFECT.lastStand.threshold)} Lebenspunkten +${pct(EFFECT.lastStand.armor)} Rüstung.` },
  { id: "wellspring", name: "Lebensquell", icon: "🌿", pool: "armor", description: `Regeneriert jede Runde ${pct(EFFECT.wellspring)} der Lebenspunkte.` },
  { id: "purity", name: "Reinheit", icon: "✨", pool: "armor", description: "Gift, Feuer und Bluten wirken auf dich 1 Runde kürzer." },
  { id: "steadfast", name: "Standhaft", icon: "🗿", pool: "armor", description: `Boss-Fähigkeiten machen dir ${pct(EFFECT.steadfast)} weniger Schaden.` },
  { id: "unyielding", name: "Unbeugsam", icon: "🕊️", pool: "armor", description: "Einmal pro Kampf überlebst du einen tödlichen Treffer mit 1 Lebenspunkt." },

  { id: "alchemist", name: "Alchemist", icon: "⚗️", pool: "any", description: `Heiltränke heilen ${pct(EFFECT.alchemist)} mehr.` },
  { id: "quickHands", name: "Flinke Hand", icon: "⏳", pool: "any", description: "Fähigkeiten klingen 1 Runde schneller ab." },
  { id: "lucky", name: "Glücksbringer", icon: "🍀", pool: "any", description: `+${pct(EFFECT.lucky)} Gold nach jedem Sieg.` },
  { id: "prepared", name: "Vorbereitet", icon: "🔋", pool: "any", description: `+${EFFECT.prepared} maximales Mana.` },
  { id: "towerRunner", name: "Turmläufer", icon: "🗼", pool: "any", description: "Im Endlos-Turm stehen 4 statt 3 Segen zur Wahl." },

  { id: "warDrum", name: "Kriegstrommel", icon: "🥁", pool: "boss", description: `+${pct(EFFECT.warDrum.bonus)} Schaden in den ersten ${EFFECT.warDrum.rounds} Runden jedes Kampfes.` },
  { id: "allSeeing", name: "Allsehend", icon: "👁️", pool: "boss", description: `+${pct(EFFECT.allSeeing)} kritische Trefferchance gegen Bosse.` },
  { id: "soulDrain", name: "Seelenraub", icon: "💀", pool: "boss", description: `Heilt dich um ${pct(EFFECT.soulDrain)} des Schadens, den du machst.` },
  { id: "dragonfire", name: "Drachenfeuer", icon: "🐉", pool: "boss", description: `Kritische Treffer setzen in Brand, und du bist immun gegen Feuer.` },
  { id: "vortex", name: "Sog", icon: "🌀", pool: "boss", description: `Gegner erleiden durch dich ${pct(EFFECT.vortex)} mehr Schaden.` },
];

/** Feste Effekte der Boss-Items – passend zum Boss. */
export const BOSS_EFFECTS: Record<string, ItemEffectId> = {
  "goblin-chief": "warDrum",
  "ancient-lizard": "venomFang",
  "cave-eye": "allSeeing",
  "primal-mammoth": "steadfast",
  "lich-king": "soulDrain",
  ignaroth: "dragonfire",
  "ore-king": "lucky",
  "high-priestess": "wellspring",
  "storm-lord": "chainLightning",
  "void-lord": "manaThief",
  "swamp-hydra": "purity",
  "frost-giant": "frostBite",
  "world-eater": "vortex",
};

export function getItemEffect(id: ItemEffectId): ItemEffectDef {
  const def = ITEM_EFFECTS.find((e) => e.id === id);
  if (!def) throw new Error(`Unbekannter Effekt: ${id}`);
  return def;
}

/** Zufälliger Effekt eines legendären Items – fest aus seiner uid, aus dem Pool seiner Art. */
export function rollItemEffect(uid: string, kind: ItemDef["kind"]): ItemEffectId {
  const pool = ITEM_EFFECTS.filter((e) => e.pool === "any" || e.pool === kind).map((e) => e.id);
  return pool[hash(`${uid}|effect`) % pool.length];
}

/** Effekt eines Exemplars: gespeichert (legendär) oder der feste seines Bosses. */
export function effectOf(item: OwnedItem, def: ItemDef): ItemEffectId | null {
  if (item.effect) return item.effect;
  return def.bossId ? (BOSS_EFFECTS[def.bossId] ?? null) : null;
}

/** Hat ein Item dieser Art und Seltenheit einen eigenen, gewürfelten Effekt? */
export const rollsEffect = (def: ItemDef, rarity: OwnedItem["rarity"]) => rarity === "legendary" && !def.bossId;

/* ───────────── Wirkung im Kampf (gemeinsam für Solo und Koop) ───────────── */

export const has = (effects: readonly ItemEffectId[] | undefined, id: ItemEffectId) => (effects ?? []).includes(id);

/** Lage eines Treffers – woraus sich die Schadens-Effekte berechnen. */
export interface StrikeContext {
  round: number;
  foeHp: number;
  foeMaxHp: number;
  foeBleeding: boolean;
  foeBoss: boolean;
  foeElite: boolean;
}

/** Faktor auf den Schaden des Helden durch seine Item-Effekte. */
export function effectDamageFactor(effects: readonly ItemEffectId[] | undefined, ctx: StrikeContext): number {
  let factor = 1;
  if (has(effects, "warDrum") && ctx.round <= EFFECT.warDrum.rounds) factor *= 1 + EFFECT.warDrum.bonus;
  if (has(effects, "headsman") && ctx.foeHp < ctx.foeMaxHp * EFFECT.headsman.threshold) factor *= 1 + EFFECT.headsman.bonus;
  if (has(effects, "bloodletting") && ctx.foeBleeding) factor *= 1 + EFFECT.bloodletting;
  if (has(effects, "eliteHunter") && ctx.foeElite) factor *= 1 + EFFECT.eliteHunter;
  if (has(effects, "bossSlayer") && ctx.foeBoss) factor *= 1 + EFFECT.bossSlayer;
  if (has(effects, "vortex")) factor *= 1 + EFFECT.vortex;
  return factor;
}

/** Zusätzliche Krit-Chance gegen dieses Ziel. */
export const effectCritBonus = (effects: readonly ItemEffectId[] | undefined, foeBoss: boolean) =>
  has(effects, "allSeeing") && foeBoss ? EFFECT.allSeeing : 0;

/** Kritische Treffer setzen in Brand (Glut, Drachenfeuer)? */
export const critBurns = (effects: readonly ItemEffectId[] | undefined) => has(effects, "ember") || has(effects, "dragonfire");

/** Gift, Feuer und Bluten auf dem Helden: Reinheit kürzt um eine Runde, Drachenfeuer macht gegen Feuer immun (0 = wirkt nicht). */
export function heroDotRounds(effects: readonly ItemEffectId[] | undefined, kind: "poison" | "burn" | "bleed", rounds: number): number {
  if (kind === "burn" && has(effects, "dragonfire")) return 0;
  return has(effects, "purity") ? Math.max(1, rounds - 1) : rounds;
}
