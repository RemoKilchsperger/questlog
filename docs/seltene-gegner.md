# Seltene Gegner

Statt einer gewöhnlichen Kreatur erscheint manchmal ihre benannte Variante, z. B. „Silberpelz, der Leitwolf“ statt
des Grauwolfs (Idee 62 in `ideen.md`). Code: `src/domain/rares.ts`, Store `gameStore.ts` (`startBattle`, Sieg),
Kampfbild `BattleScene.ts` (Farbe und Schimmer), Kampfkopf und Siegmeldung in `BattleScreen.tsx`.

## Regeln

| Thema | Entscheidung |
|---|---|
| Anzahl | 24, einer pro gewöhnlicher Kreatur der 6 Gebiete. Bosse und Dungeon-Gegner haben keinen |
| Chance | 1 % pro Kampf gegen die Kreatur im Gebiet (`RARE_CHANCE`). Nicht bei einem offenen Steckbrief für sie und nicht heroisch |
| Stärke | 30 % mehr LP und Schaden (`RARE_POWER`), dazu feste Elite-Modifikatoren: in Düsterwald und Nebelsümpfen einer, ab den Kristallhöhlen zwei |
| Beute | Wie ein Elite-Gegner, aber dreifache statt doppelte Erfahrung und dreifaches Gold, dazu sicher ein Item, 75 % episch und 25 % legendär |
| Quests | Er kämpft unter der Id der Grundkreatur und zählt für Aufträge wie sie (auch als Elite) |
| Sammlung | `records.raresDefeated` – sichtbar über den Erfolg. Die Gegnerliste verrät nichts |
| Erfolg | „Seltenheitenjäger“ für 1, 12 und alle 24, mit gleichnamigem Titel |
| Anzeige | ✦ vor dem Namen, eigene Farbe (Farbfilter auf dem Bild der Grundkreatur) mit violettem Schimmer, „✦ Selten“ im Kampfkopf, eigene Siegmeldung mit „Neu in deiner Sammlung!“ |

Bei 1 % trifft man ungefähr alle 100 Kämpfe in einem Gebiet einen seltenen Gegner. Wer eine bestimmte Variante sucht,
muss gezielt die passende Kreatur bekämpfen.

## Die seltenen Gegner

| Gebiet | Kreatur | Seltener Gegner | Modifikatoren | Farbe |
|---|---|---|---|---|
| Düsterwald | Riesenratte | Rattenkönigin Fettwanst | Riesig | Gold |
| | Grauwolf | Silberpelz, der Leitwolf | Rudelführer | Silber |
| | Waldspinne | Weberin Schattenfaden | Giftig | Schatten |
| | Goblin-Plünderer | Goldzahn, der Plünderer | Flink | Gold |
| Nebelsümpfe | Sumpfkröte | Die Goldene Kröte | Regenerierend | Gold |
| | Moorschlange | Moorkönigin Sssira | Giftig | Jade |
| | Moorleiche | Der Ertrunkene Ritter | Gepanzert | Frost |
| | Blutmückenschwarm | Die Schwarmmutter | Vampirisch | Purpur |
| Kristallhöhlen | Höhlenfledermaus | Kristallflügel | Flink, Vampirisch | Amethyst |
| | Steingolem | Edelsteingolem Funkel | Gepanzert, Riesig | Amethyst |
| | Kristallskorpion | Amethyststachel | Giftig, Gepanzert | Amethyst |
| | Felswurm | Der Grosse Schlund | Riesig, Regenerierend | Schatten |
| Frostgipfel | Eisbär | Weissklaue | Rasend, Riesig | Silber |
| | Frostelementar | Ewiges Eis | Gepanzert, Explosiv | Frost |
| | Schneewolf | Mondheuler | Rudelführer, Flink | Silber |
| | Frosttroll | Gletscherzahn | Regenerierend, Rasend | Frost |
| Schattenruinen | Skelettkrieger | Knochenfürst Morrak | Gepanzert, Rudelführer | Gold |
| | Klagegeist | Die Weisse Dame | Vampirisch, Flink | Silber |
| | Blutsauger | Graf Sangvin | Vampirisch, Regenerierend | Purpur |
| | Dunkler Hexer | Zirkelmeister Vex | Explosiv, Rasend | Jade |
| Drachenhort | Feuersalamander | Glutschuppe | Explosiv, Flink | Purpur |
| | Flammenelementar | Herz des Vulkans | Riesig, Explosiv | Gold |
| | Jungdrache | Rubinschwinge | Gepanzert, Rasend | Purpur |
| | Dämonenwächter | Torwächter Azgor | Gepanzert, Vampirisch | Schatten |

Die Hilfe nennt nur die Regeln, nicht die Namen. Die soll man selbst entdecken.

## Spielstand

Keine neue Version: `records.raresDefeated` ergänzt `repairSave` über `EMPTY_RECORDS` mit einer leeren Liste. Der
Kampf (`BattleState.rare`) wird wie bisher nicht gespeichert.

## Offen / später

- Seltene Gegner in Dungeons (eigene Varianten der Dungeon-Gegner)
- Eigene Beute pro seltenem Gegner (Unikat oder Kosmetik)
- Sammlungsseite mit allen 24 im Erfolgs- oder Charakter-Tab
- Hinweis-Gerüchte an der Anschlagtafel („Ein silberner Wolf wurde gesehen“ – Chance für einen Tag erhöht)
