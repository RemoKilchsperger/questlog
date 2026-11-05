# Dungeon-Wege

Dungeons sind kein fester Ablauf von acht Kämpfen mehr – solo und im Koop. An Gabelungen wählt man seinen Weg:
Kampf, Elite-Raum, Schrein, Händler, Falle, Rätsel oder eine alte Truhe. So fühlt sich jeder Durchgang anders an, und
die Segen aus dem Endlos-Turm gibt es auch im Dungeon (Idee #8 und #37 in `ideen.md`).
Code: `src/domain/dungeonPaths.ts`, Store `gameStore.ts` (`dungeon`), Oberfläche `src/components/DungeonPath.tsx`.
Koop: `src/domain/coopDungeonPaths.ts` (Türen, Räume, Abstimmung), Server `src/coop/server.ts`, Oberfläche
`src/components/CoopDungeonPath.tsx`.

Status: **Solo und Koop umgesetzt.** Nach Änderungen am Koop: Edge Function neu deployen (`npm run functions:deploy`).

## Entschiedene Regeln

| Thema | Entscheidung |
|---|---|
| Umfang | Erst solo, danach Koop (siehe unten) |
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
| 📦 Alte Truhe | Öffnen oder weitergehen. Echte Truhe: Beute wie von einem Gegner, ohne XP. 30 % sind ein Mimic (Kampf, siehe unten) |

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

### Alte Truhe und Mimic

Ein Raum ohne sicheren Kampf, zählt also als Ruheraum (höchstens einer pro Abschnitt), Gewicht 12 wie Schrein und
Händler. Man sieht nur die Truhe und entscheidet:

- **Weitergehen:** nichts passiert.
- **Öffnen:** Mit 30 % (`MIMIC_CHANCE`) ist sie ein **Mimic**. Ob, steht mit Startwert und Schritt fest
  (`isMimicChest`), Neuladen ändert nichts. Sonst liegt darin Beute wie von einem Gegner des Dungeons, ohne XP.

Der Mimic ist ein eigener Gegner pro Dungeon (`AreaDef.mimic`, Ids `mimic-mine`, `mimic-temple`, `mimic-storm`,
`mimic-void`). Er ist kein Schritt des Wegs, darum taucht er nicht in Turm, Aufträgen oder Bestiarium auf.

| | Mimic |
|---|---|
| Level | Höchstes Level des Dungeons |
| Stärke | ×1,25 auf LP und Schaden (übrige Dungeon-Gegner ×1,1), kein Elite-Modifikator |
| Fähigkeit | 🦷 Zuschnappen alle 3 Runden: 1,8-facher Schaden, Bluten 2 Runden (30 %). Wird angekündigt wie bei Bossen |
| Schwächen | Schwach gegen Feuer und Wucht, resistent gegen Klingen, immun gegen Gift |
| Beute | Elite-Beute (sicheres Item mit Boss-Seltenheiten, doppelte XP) und das Elite-Gold ×1,5 (`MIMIC_GOLD_FACTOR`). Zählt für Schatzkarten wie ein Elite |

Grafik: Bild `src/assets/creatures/mimic.png` (Prompt in `gegner-prompts.md`), als Rückfall das Pixel-Sprite
`mimic` in `creatureSprites.ts`.

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

## Koop

Der Server kennt den Weg (`CoopDungeonRun`: `path`, `calm`, `seen`, `votes`, `room`, `riddles`, `chests`, `treasure`). Türen,
Gegner und Räume würfelt er aus der `runId` – wie die Beute. So bleibt die Truhe jedes Spielers wiederholbar.

| Entscheidung | Wer |
|---|---|
| Tür an der Gabelung | Abstimmung aller Anwesenden, bei Gleichstand zählt der Host |
| Schrein | Jeder wählt aus seinen eigenen drei Segen |
| Falle | Jeder weicht aus oder steckt ein – mit seiner eigenen Rüstung |
| Händler | Jeder kauft mit seinem Gold. Gold und Tränke bucht sein Browser, Wundversorgung und Segen der Server |
| Rätsel | Mehrheit, bei Gleichstand zählt der Host |
| Alte Truhe | Mehrheit, bei Gleichstand zählt der Host. Ist sie ein Mimic, kämpft die ganze Gruppe |
| Weiter vor Zwischen- und Endboss, Aussteigen | Der Host |

- **Frist:** 60 Sekunden (`COOP_DECIDE_SECONDS`). Danach gilt eine Vorgabe: die abgegebenen Stimmen, beim
  Schrein der erste Segen, bei der Falle Einstecken. Bei der Truhe zählen die abgegebenen Stimmen; ohne Stimme
  (oder bei Gleichstand ohne Host-Stimme) bleibt sie zu. So blockiert niemand die Gruppe.
- Wer den Kampf verlassen hat, stimmt nicht mit.
- Beim Betreten eines Raums stehen Gefallene mit 25 % LP wieder auf, wie vor einem Kampf.
- Beim Händler ist der Raum sofort erledigt: Man kauft, während die Gruppe über die nächste Tür abstimmt.
- **Segen im Koop-Kampf:** Alle 12 Segen wirken auch im Koop (`CoopHero.blessings`). Kraft, Ahnen, Vitalität und
  Präzision ändern die Werte direkt, die übrigen wirken in `resolveRound` (Fokus, Blutdurst, Henker, Dornen,
  Alchemie, Zweiter Atem). Schatzsucher zählt für die Beute der Schritte danach.
- **Truhe:** Kämpfe und Elite-Räume wie bisher, Fallen, gelöste Rätsel und geöffnete alte Truhen ohne XP, ein
  Wächter-Kampf wie ein Kampf, ein Mimic mit seiner Beute (siehe oben). Jeder würfelt seine eigene Beute.
- Ältere Läufe ohne `path` zählen jeden bisherigen Schritt als Kampf.

## Offen / später

- Mehr Rätsel und Fallen, Räume je Dungeon (z. B. Erzader in der Mine)
- Erfolge: alle Raumarten in einem Lauf, Dungeon nur mit Elite-Räumen
