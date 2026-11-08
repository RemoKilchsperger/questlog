// Aussehen des Helden aus der Charaktererstellung: Haut, Haare, Bart und Hemd.
// Nur Ids und Namen – die Farben und Pixel stehen in src/game/heroLooks.ts.
// Wird auch vom Koop-Server genutzt (sanitizeLooks), darum ohne Grafik.

const option = <Id extends string>(id: Id, label: string) => ({ id, label });

export const LOOK_OPTIONS = {
  skin: [
    option("hell", "Hell"),
    option("rosig", "Rosig"),
    option("oliv", "Oliv"),
    option("braun", "Braun"),
    option("dunkel", "Dunkel"),
  ],
  hairColor: [
    option("braun", "Braun"),
    option("schwarz", "Schwarz"),
    option("blond", "Blond"),
    option("rot", "Rot"),
    option("grau", "Grau"),
    option("weiss", "Weiss"),
    option("blau", "Blau"),
    option("gruen", "Grün"),
  ],
  hairStyle: [
    option("kurz", "Kurz"),
    option("lang", "Lang"),
    option("zopf", "Zopf"),
    option("stachel", "Stacheln"),
    option("iro", "Irokese"),
    option("glatze", "Glatze"),
  ],
  beard: [
    option("keiner", "Kein Bart"),
    option("schnauz", "Schnauz"),
    option("kinnbart", "Kinnbart"),
    option("vollbart", "Vollbart"),
  ],
  shirt: [
    option("blau", "Blau"),
    option("rot", "Rot"),
    option("gruen", "Grün"),
    option("violett", "Violett"),
    option("braun", "Braun"),
    option("weiss", "Weiss"),
  ],
} as const;

export type LookPart = keyof typeof LOOK_OPTIONS;
type IdOf<P extends LookPart> = (typeof LOOK_OPTIONS)[P][number]["id"];

export interface HeroLooks {
  skin: IdOf<"skin">;
  hairColor: IdOf<"hairColor">;
  hairStyle: IdOf<"hairStyle">;
  beard: IdOf<"beard">;
  /** Nur sichtbar, solange keine Brustrüstung angelegt ist */
  shirt: IdOf<"shirt">;
}

export const LOOK_PARTS = Object.keys(LOOK_OPTIONS) as LookPart[];

/** So sah der Held vor der Charaktererstellung aus. */
export const DEFAULT_LOOKS: HeroLooks = { skin: "hell", hairColor: "braun", hairStyle: "kurz", beard: "keiner", shirt: "blau" };

/** Aussehen aus Spielstand, Profil oder Lobby – Unbekanntes wird zum Standard. */
export function sanitizeLooks(raw: unknown): HeroLooks {
  const saved = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = <P extends LookPart>(part: P): HeroLooks[P] => {
    const value = saved[part];
    return (LOOK_OPTIONS[part].some((o) => o.id === value) ? value : DEFAULT_LOOKS[part]) as HeroLooks[P];
  };
  return { skin: pick("skin"), hairColor: pick("hairColor"), hairStyle: pick("hairStyle"), beard: pick("beard"), shirt: pick("shirt") };
}

/** Würfelt ein Aussehen – bunte Haare (blau, grün) eher selten. */
export function randomLooks(rng: () => number = Math.random): HeroLooks {
  const roll = <P extends LookPart>(part: P, skip: readonly string[] = []): HeroLooks[P] => {
    const pool = LOOK_OPTIONS[part].filter((o) => !skip.includes(o.id));
    return pool[Math.floor(rng() * pool.length)].id as HeroLooks[P];
  };
  return {
    skin: roll("skin"),
    hairColor: rng() < 0.15 ? roll("hairColor") : roll("hairColor", ["blau", "gruen"]),
    hairStyle: roll("hairStyle"),
    beard: rng() < 0.5 ? "keiner" : roll("beard"),
    shirt: roll("shirt"),
  };
}

/** Nächste bzw. vorherige Wahl (für die Pfeile im Editor). */
export function stepLook<P extends LookPart>(looks: HeroLooks, part: P, step: 1 | -1): HeroLooks {
  const options = LOOK_OPTIONS[part];
  const index = options.findIndex((o) => o.id === looks[part]);
  const next = options[(index + step + options.length) % options.length];
  return { ...looks, [part]: next.id };
}
