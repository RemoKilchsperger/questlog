# Elite-Gegner

Ziel: mehr Abwechslung bei den normalen Kreaturen. Code: `src/domain/elites.ts`, Wirkungen in
`combat.ts` und `coopCombat.ts`. Gilt solo in Gebieten und Dungeons und in Koop-Dungeons, nie für Bosse
(auch nicht für Raid-Bosse).

## Regeln

- Jede normale Kreatur ist mit **10 %** Chance Elite. Gewürfelt wird beim Kampfstart. In der
  Gebietsliste sieht man es nicht, es soll überraschen.
- **Ein Modifikator**, ab Kreatur-Level 30 mit 25 % Chance **zwei verschiedene**.
- **Belohnung:** doppelte Erfahrung, sicheres und doppeltes Gold, sichere Beute mit den
  Seltenheiten eines Bosses (Trank und Verstärkungstrank wie üblich, keine Boss-Items).
- Für Aufträge zählt ein Elite wie die normale Kreatur.
- **Koop-Dungeons:** Ob ein Gegner Elite ist, wird mit einem Startwert aus Durchgang und Kampf
  gewürfelt (`coopElite`). So wissen Server und die Truhe jedes Spielers ohne Speichern, welcher
  Kampf ein Elite war. Die Wirkungen sind dieselben. Was alle trifft, trifft jeden mit dem Schaden
  wie solo, ohne Gruppenzuschlag, so wie bei Gruppen-Fähigkeiten: Explosiv trifft alle stehenden
  Helden, Bollwerk blockt für den Schildträger. Fallen dabei alle, ist der Kampf verloren.
- **Darstellung:** goldenes Leuchten und ★ vor dem Namen in der Szene, „★ Elite“ im Titel,
  Plaketten mit den Modifikatoren.

## Modifikatoren

| Modifikator | Wirkung | Gegenmittel |
|---|---|---|
| 🪨 Gepanzert | +150 % Rüstung | Rüstungsbruch, Rüstung ignorieren, Gift/Feuer/Bluten |
| 🐘 Riesig | +60 % LP | Schaden, Finisher |
| 🌿 Regenerierend | heilt 8 % LP pro Runde, nicht wenn er brennt | Feuer, viel Schaden auf einmal |
| 💢 Rasend | +50 % Schaden, unter halben LP +100 % | Schnell erledigen, Bollwerk |
| 🧛 Vampirisch | heilt sich um 50 % seines Schadens | Schwächen, Bollwerk, Rüstung |
| ☠️ Giftig | jeder Treffer vergiftet: 50 % seines Schadens pro Runde, 3 Runden | Heilung, kurzer Kampf |
| ⚡ Flink | zwei Angriffe pro Runde mit je 75 % Schaden | Rüstung, Bollwerk |
| 💥 Explosiv | explodiert beim Tod: doppelter Schaden, kann den Helden mitreissen | genug LP für den letzten Schlag, Bollwerk |
| 🐺 Rudelführer | bringt einen Artgenossen mit (50 % LP, 50 % Schaden), der flieht, wenn der Rudelführer fällt | Ziel wählen, Flächen-Fähigkeiten |

## Abstimmung (Simulation)

Simuliert wurden alle 11 Klassen gegen jede normale Kreatur der Gebiete, auf deren Level, mit
Fähigkeiten. Die Werte sind Siegquote und Runden, in Klammern die LP am Ende eines Sieges. Ziel:
Ein Elite kostet 1–3 Runden mehr oder einen Trank, man gewinnt aber meistens noch.

| | gewöhnlich | 🪨 | 🐘 | 🌿 | 💢 | 🧛 | ☠️ | ⚡ | 💥 |
|---|---|---|---|---|---|---|---|---|---|
| selten + Tränke | 100 %, 4,9 R. (69 %) | 6,0 R. | 7,7 R. | 7,5 R. | (64 %) | 6,3 R. | (63 %) | (62 %) | (49 %) |
| gewöhnlich, ohne Tränke | 100 % (53 %) | 99 % | 85 % | 73 % | 68 % | 92 % | 85 % | 91 % | 97 % |

Die ersten Werte (Rüstung +60 %, Rasend +30/60 %, Gift 25 % für 2 Runden, Flink 2 × 60 %,
Regeneration 6 %) machten Gepanzert, Giftig und Flink fast wirkungslos.
