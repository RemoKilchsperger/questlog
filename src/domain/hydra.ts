// Sumpfhydra (Raid-Boss, docs/raid-bosse.md): Köpfe abschlagen.
//
// Bei 75, 50 und 25 % ihrer Lebenspunkte schlägt die Gruppe der Hydra einen Kopf ab.
// Er fällt in den Kampf und kämpft als Begleiter mit eigener Fähigkeit weiter:
//   - Giftkopf: beisst und vergiftet, das Gift stapelt sich
//   - Säurekopf: beisst und ätzt, das Ziel erleidet mehr Schaden
//   - Blutkopf: beisst nicht, sondern heilt die Hydra jede Runde
// Solange ein Kopf lebt, schützt der gepanzerte Hals die Hydra (weniger Schaden).
// Lebt ein Kopf nach einigen Runden noch, wächst aus dem Stumpf ein zweiter, gleicher
// Kopf – ausser die Hydra brannte, als er fiel: Feuer brennt den Stumpf aus.
// Ein Treffer über mehrere Schwellen schlägt nur einen Kopf ab, der nächste fällt
// frühestens in der Runde danach. Sind alle drei ab, rast der unsterbliche Mittelkopf:
// Giftatem kommt öfter.

export const HYDRA_ID = "swamp-hydra";

export type HydraHeadKind = "venom" | "acid" | "blood";

export interface HydraHeadDef {
  kind: HydraHeadKind;
  /** Fällt, sobald die Hydra unter diesen Anteil ihrer Lebenspunkte sinkt */
  at: number;
  name: string;
  icon: string;
  /** Schlüssel der Grafik in creatureSprites.ts */
  sprite: string;
  description: string;
}

/** Lebenspunkte eines Kopfs: Anteil der max. LP der Hydra (mit der Gruppe skaliert). */
export const HEAD_HP = 0.1;
/** Schaden eines Kopfs: Anteil des Schadens der Hydra. */
export const HEAD_DAMAGE = 0.3;
/** So viele Runden nach dem Abschlagen wächst ein zweiter Kopf, wenn der erste noch lebt. */
export const HEAD_GROW_ROUNDS = 3;
/** Gepanzerter Hals: Solange ein Kopf lebt, erleidet die Hydra nur diesen Anteil des Schadens. */
export const NECK_TAKEN = 0.5;
/** Giftkopf: Gift pro Stapel (Anteil seines Schadens), höchstens so viele Stapel, so viele Runden. */
export const VENOM = { percent: 0.25, max: 3, rounds: 3 };
/** Säurekopf: Das Ziel erleidet so viel mehr Schaden, so viele Runden. */
export const ACID = { percent: 0.25, rounds: 3 };
/** Blutkopf: heilt die Hydra jede Runde um diesen Anteil ihrer max. LP. */
export const BLOOD_HEAL = 0.04;
/** Raserei ohne Köpfe: Giftatem alle so viele Runden (statt alle 3). */
export const FRENZY_EVERY = 2;

export const HYDRA_HEADS: readonly HydraHeadDef[] = [
  {
    kind: "venom",
    at: 0.75,
    name: "Giftkopf",
    icon: "🐍",
    sprite: "hydra-head-venom",
    description: `Beisst und vergiftet – das Gift stapelt sich bis ${VENOM.max}-mal.`,
  },
  {
    kind: "acid",
    at: 0.5,
    name: "Säurekopf",
    icon: "🫗",
    sprite: "hydra-head-acid",
    description: `Beisst und ätzt: Das Ziel erleidet ${ACID.rounds} Runden lang ${ACID.percent * 100} % mehr Schaden.`,
  },
  {
    kind: "blood",
    at: 0.25,
    name: "Blutkopf",
    icon: "🩸",
    sprite: "hydra-head-blood",
    description: `Beisst nicht, sondern heilt die Hydra jede Runde um ${BLOOD_HEAL * 100} % ihrer Lebenspunkte.`,
  },
];

export function getHydraHead(kind: HydraHeadKind): HydraHeadDef {
  return HYDRA_HEADS.find((h) => h.kind === kind)!;
}

/** Der nächste Kopf, der fällt, wenn die Hydra bei `hp` steht – `severed`: so viele sind schon ab. */
export function headDue(severed: number, hp: number, maxHp: number): HydraHeadDef | null {
  const next = HYDRA_HEADS[severed];
  return next && hp > 0 && hp <= maxHp * next.at ? next : null;
}

/** Ab der Raserei (alle Köpfe ab) setzt die Hydra ihren Giftatem öfter ein. */
export function hydraAbilityEvery(severed: number | undefined): number | null {
  return (severed ?? 0) >= HYDRA_HEADS.length ? FRENZY_EVERY : null;
}

/** Was der Kopf vorhat – für die Zielwahl. `grow`: Runden, bis ein zweiter wächst (fehlt: wächst keiner nach). */
export function headIntentText(kind: HydraHeadKind, grow: number | undefined): { text: string; urgent: boolean } {
  const what = kind === "blood" ? `Heilt die Hydra um ${BLOOD_HEAL * 100} %` : kind === "venom" ? "Giftbiss" : "Säurebiss";
  if (grow === undefined) return { text: what, urgent: kind === "blood" };
  return grow <= 1
    ? { text: `${what} · ein zweiter wächst diese Runde!`, urgent: true }
    : { text: `${what} · zweiter Kopf in ${grow} Runden`, urgent: false };
}
