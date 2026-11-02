# Dungeon-Wege

Solo-Dungeons sind kein fester Ablauf von acht Kämpfen mehr. An Gabelungen wählt man seinen Weg:
Kampf, Elite-Raum, Schrein, Händler, Falle oder Rätsel. So fühlt sich jeder Durchgang anders an, und
die Segen aus dem Endlos-Turm gibt es auch im Dungeon (Idee #8 und #37 in `ideen.md`).
Code: `src/domain/dungeonPaths.ts`, Store `gameStore.ts` (`dungeon`), Oberfläche `src/components/DungeonPath.tsx`.

Status: **Solo umgesetzt** auf Branch `feature/dungeon-wege`. Koop-Dungeons laufen noch linear.

## Entschiedene Regeln

| Thema | Entscheidung |
|---|---|
| Umfang | Erst solo, Koop später (Server muss die Wege kennen, der Host wählt) |
| Sichtbarkeit | Gemischt: Die Raumart steht auf der Tür, 20 % der Türen sind verschlossen (❓) |
| Rätsel | Kleine Entscheidung: Rätseltext und drei Antworten |
| Händler | Bezahlt wird mit dem eigenen Gold |

## Ablauf

Acht Schritte wie bisher, ohne Heilung dazwischen:

| Schritt | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Inhalt | Eingang (Kampf) | Gabelung | Gabelung | Zwischenboss | Gabelung | Gabelung | Gabelung | Endboss |

- An einer **Gabelung** stehen zwei oder drei verschiedene Türen. Hinter mindestens einer wartet ein
  Kampf (normal oder Elite).
- **Höchstens ein Raum ohne Kampf pro Abschnitt** (vor und nach dem Zwischenboss). Danach bietet der
  Abschnitt nur noch Kampf und Elite an. Darum hat ein Lauf mindestens sechs Kämpfe.
- Gegner in Kampf- und Elite-Räumen kommen zufällig aus den drei Gegnern des Dungeons.
- Aussteigen mit der Truhe geht nach jedem Sieg und in jedem Raum.
- Alles Zufällige (Türen, Gegner, Räume) hängt am Startwert des Laufs und bleibt beim Neuladen gleich.

## Räume

| Raum | Was passiert |
|---|---|
| ⚔️ Kampf | Ein Gegner des Dungeons, mit der normalen Elite-Chance |
| 💀 Elite-Raum | Sicher Elite: vor dem Zwischenboss ein Modifikator, danach zwei. Elite-Beute (sicher, doppelte XP und doppeltes Gold) |
| ⛩️ Schrein | Einen von drei Segen wählen (dieselben wie im Turm). Er gilt bis zum Ende des Dungeons |
| 🛒 Händler | Mit eigenem Gold, jedes Angebot einmal: Heiltrank des Dungeons (Mine klein, Tempel/Turm normal, Abgrund gross) und ein zufälliger Wurftrank zum 1,5-fachen Dorfpreis. Dazu Wundversorgung (heilt 40 %, 2× Trankpreis) und ein Segen (5× Trankpreis) |
| 🪤 Falle | Ausweichen oder Einstecken. Dahinter liegt Beute wie von einem Gegner, aber ohne XP |
| 🧩 Rätsel | Richtig: Elite-Beute ohne XP. Falsch: je nach Rätsel 20 % Schaden oder ein Wächter erwacht (Kampf) |

### Falle: die Rüstung entscheidet

Die Falle trifft voll mit 25 % der maximalen LP. Sie tötet nie, mindestens 1 LP bleibt. Gezählt wird die
Rüstungsklasse mit den meisten angelegten Teilen.

| Rüstung | Ausweichen gelingt | Einstecken: Schaden |
|---|---|---|
| Leicht | 70 % | 25 % (voll) |
| Mittel | 55 % | 17,5 % |
| Schwer | 30 % | 10 % |

Leichte Rüstung weicht aus, schwere steckt ein. Im Spiel stehen keine Zahlen, nur Hinweise
(„Wer flink ist …“, „Eine gute Rüstung fängt einiges ab“).

### Rätsel

Acht Rätsel mit fester Lösung, die Reihenfolge der Antworten ist gemischt. Keines kommt in einem Lauf
doppelt vor (Fallen ebenso). Man kann sie mit der Zeit lernen. Das ist gewollt, die Belohnung ist darum
nur Beute ohne XP.

## Abstimmung (Simulation)

Simuliert mit dem Champion bzw. Wächter aus dem Balance-Test (Boss-Level, Heiltränke unter 40 % LP),
mit Elite-Chance und Elite-Zwischenboss, 200 Läufe pro Zeile. Verglichen wurde der alte, lineare
Ablauf mit drei Arten, die Türen zu wählen. Angegeben ist der Anteil der Läufe, die den Dungeon schaffen:

| Seltene Ausrüstung, Tränke | linear (alt) | nur Kampf | Ruheräume zuerst | nur Elite |
|---|---|---|---|---|
| Verlassene Mine | 23 % | 20 % | 39 % | 4 % |
| Versunkener Tempel | 58 % | 45 % | 60 % | 14 % |
| Gewitterturm | 96 % | 91 % | 97 % | 80 % |
| Abgrund der Leere | 87 % | 85 % | 94 % | 77 % |

- Wer immer kämpft, hat es etwa so schwer wie bisher.
- Ruheräume machen den Dungeon sicherer, bringen aber zwei Kämpfe weniger Beute und XP.
- Elite-Räume sind deutlich riskanter, bringen dafür sichere Beute. Das ist die gewünschte Abwägung.
- Die Simulation liegt im Scratchpad (`sim/zzpaths.sim.test.ts`). Zum Ausführen nach `src/domain` kopieren.

## Offen / später

- Koop-Dungeons mit Wegen (Host wählt, Server würfelt Türen aus `runId`)
- Mehr Rätsel und Fallen, Räume je Dungeon (z. B. Erzader in der Mine)
- Erfolge: alle Raumarten in einem Lauf, Dungeon nur mit Elite-Räumen
