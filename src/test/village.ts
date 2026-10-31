import type { Village } from "../domain/village";

/** Das Dorf, wie es vor dem Dorf-Ausbau fest war: Händler, Schmiede und Anschlagtafel auf 2, Alchemist auf 1. */
export const CLASSIC_VILLAGE: Village = { merchant: 2, smith: 2, board: 2, alchemist: 1 };
