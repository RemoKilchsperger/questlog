# Rudel-Kämpfe

Manchmal kommt in einem Gebiet statt eines einzelnen Gegners ein Rudel aus drei schwächeren Artgenossen
(Idee 63 in `ideen.md`). Gewonnen ist erst, wenn alle liegen. Darum werden Zielwahl und Flächen-Fähigkeiten
wichtig. Code: `src/domain/packs.ts`, Kampf `combat.ts` (`BattleState.pack`), Store `gameStore.ts`
(`startBattle`, Sieg), Kampfbild `BattleScene.ts`, Kampfkopf und Siegmeldung in `BattleScreen.tsx`.

## Regeln

| Thema | Entscheidung |
|---|---|
| Wer | Jede gewöhnliche Kreatur der 6 Gebiete. Keine Bosse, keine Dungeon-Gegner, keine Mimics |
| Chance | 7 % pro Kampf (`PACK_CHANCE`). Nicht bei einem offenen Steckbrief, nicht heroisch, nicht als seltener Gegner |
| Grösse | Immer 3 Tiere (`PACK_SIZE`) |
| Stärke | Jedes Tier hat 40 % der LP und 40 % des Schadens eines einzelnen Gegners (`PACK_MEMBER`). Zusammen 120 % LP und anfangs 120 % Schaden |
| Elite | Ein Rudel ist nie Elite. Das Rudel wird vor dem Elite-Modifikator gewürfelt |
| Kampf | Das erste Tier ist der Gegner (`enemy`), die anderen beiden kämpfen als Begleiter mit (`adds`). Fällt das erste Tier, geht der Kampf weiter, und das Ziel springt auf den nächsten lebenden Artgenossen |
| Beute | Erfahrung und Gold ×1,4 (`PACK_REWARD_FACTOR`), ein Beutewurf mit 1,5-facher Item-Chance (`PACK_LOOT_FACTOR`, 35 % → 52,5 %). Die Artgenossen geben nicht noch einmal extra |
| Quests | Jedes Tier zählt als Kill der Kreatur (wie Begleiter eines Bosses) |
| Anzeige | „🐺 Rudel“ im Kampfkopf, alle drei Tiere ungefähr gleich gross, eigene Siegmeldung, „Das Rudel ist besiegt!“ im Protokoll |

## Kampfablauf

- Im Kampf läuft `attackRound` weiter, solange irgendein Tier steht (`standing()`), nicht nur der Gegner in der Mitte.
- Fällt das erste Tier vor den anderen, kommt das Ereignis `{ type: "defeated", side: "enemy", pack: true }`. Das
  Kampfbild lässt es wie einen Begleiter zusammensinken. Der Sieg (`defeated` ohne `add`) kommt erst mit dem letzten Tier.
- Ohne gewähltes Ziel geht es gegen das erste lebende Tier. Ist das erste Tier gefallen, lässt es sich nicht mehr
  als Ziel wählen (`setTarget`).

Nebenbei behoben: Das Aufstehen des Lichkönigs (Seelengefäss) konnte bei jedem Gegner mit Begleitern auslösen, wenn
in derselben Runde Begleiter fielen. Jetzt gilt es nur noch mit Seelengefäss.

## Abstimmung (Simulation)

Simuliert wurden alle gewöhnlichen Kreaturen der Gebiete auf ihrem Level, mit seltener Ausrüstung und zwei Waffen,
je 200 Kämpfe. Die Werte sind Siegquote und Runden, in Klammern die LP am Ende eines Sieges.

| Gebiet | einzeln, Normalangriff | Rudel, Normalangriff | einzeln, Hackwirbel | Rudel, Hackwirbel |
|---|---|---|---|---|
| Düsterwald | 100 %, 7,0 R. (44 %) | 100 %, 9,6 R. (40 %) | 100 %, 7,2 R. (41 %) | 100 %, 6,7 R. (54 %) |
| Nebelsümpfe | 100 %, 7,8 R. (33 %) | 100 %, 10,5 R. (29 %) | 100 %, 8,0 R. (31 %) | 100 %, 7,3 R. (47 %) |
| Kristallhöhlen | 100 %, 7,4 R. (36 %) | 100 %, 9,9 R. (32 %) | 87 %, 9,7 R. (14 %) | 100 %, 8,6 R. (34 %) |
| Frostgipfel | 100 %, 7,4 R. (35 %) | 100 %, 9,9 R. (32 %) | 87 %, 8,6 R. (25 %) | 100 %, 7,8 R. (40 %) |
| Schattenruinen | 98 %, 8,2 R. (26 %) | 99 %, 10,6 R. (25 %) | 89 %, 9,1 R. (18 %) | 100 %, 8,1 R. (37 %) |
| Drachenhort | 100 %, 7,5 R. (34 %) | 100 %, 9,9 R. (31 %) | 65 %, 9,4 R. (19 %) | 100 %, 8,7 R. (31 %) |

Mit Normalangriffen kostet ein Rudel etwa 2,5 Runden mehr und ein paar LP. Mit einer Flächen-Fähigkeit ist es
leichter als ein einzelner Gegner. Genau das soll es belohnen. Der erste Versuch (45 % LP, 40 % Schaden) war mit
Normalangriffen zu hart: 3,5 Runden mehr und in den Schattenruinen nur 75 % Siege.
