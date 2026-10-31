# Dorf-Ausbau

Das Dorf ist nicht von Anfang an fertig, der Spieler baut es selbst auf. Zu Beginn gibt es nur einen
Strassenhändler mit wenig Ware. Schmiede, Anschlagtafel, Alchemist, Taverne, Trainingsplatz und Statue
muss man erst bauen und kann sie danach in Stufen ausbauen. Bauen kostet Gold und Material, das Monster im jeweiligen Gebiet fallen lassen.

Status: **umgesetzt** (Idee #17 in docs/ideen.md). Code: `src/domain/village.ts` (Material, Gebäude,
Kosten, Wirkung der Stufen), Store `gameStore.ts` (`village`, `materials`, `build`), Oberfläche
`VillageScreen.tsx` (Dorf → Ausbau). Die Zahlen sind Richtwerte und noch nicht mit der
Balance-Simulation geprüft.

## Ziele

- **Gold bekommt einen Zweck**, auch wenn man mit der Ausrüstung zufrieden ist.
- **Sichtbarer Fortschritt im Dorf**, unabhängig vom Level des Helden.
- **Alte Gebiete bleiben interessant:** Für höhere Stufen braucht man Material aus bestimmten Gebieten.
- **Ein klarer Anfang:** Wenige Angebote am Start, damit neue Spieler nicht von allem auf einmal
  erschlagen werden.

## Material

Jedes Gebiet hat **ein** Material. Es fällt bei jedem Sieg in diesem Gebiet sicher, ohne Zufall:

| Gebiet | Level | Material |
|---|---|---|
| Düsterwald | 1–10 | 🐺 Wolfsfell |
| Nebelsümpfe | 11–20 | 🦎 Echsenschuppe |
| Kristallhöhlen | 21–30 | 💎 Kristallsplitter |
| Frostgipfel | 31–40 | ❄️ Frostpelz |
| Schattenruinen | 41–50 | 💀 Knochenstaub |
| Drachenhort | 51–60 | 🐉 Drachenschuppe |

- **Menge:** 1 pro normalem Sieg, 3 bei Elite-Gegnern, 5 beim Gebietsboss.
- **Dungeons** geben das Material des Gebiets, zu dem ihr Level passt (doppelte Menge in der Truhe).
  Der **Endlos-Turm** gibt das Material, das zum Level des Gegners gehört.
- Material liegt in einem eigenen Vorrat (wie Essenz) und nimmt keine Inventarplätze weg. Verkaufen
  kann man es nicht, damit es nicht zur zweiten Goldquelle wird.
- Die **Kopfgeld-Tafel** (Idee #14) und die **Weltbosse** (Idee #13) können später zusätzlich
  Material als Belohnung geben.

## Gebäude

Jedes Gebäude hat die Stufen 0 bis 3. Stufe 0 heisst „nicht gebaut“ bzw. beim Händler „Strassenhändler“.
**Stufe 2 entspricht jeweils dem, was das Spiel heute bietet.** Stufe 3 bringt etwas Neues dazu.

### 🛒 Händler

| Stufe | Name | Wirkung |
|---|---|---|
| 0 | Strassenhändler | 4 Stück, nur gewöhnlich und selten (10 %), kein Neuwürfeln, kleine Heiltränke |
| 1 | Krämerladen | 6 Stück, 20 % selten, 5 % episch, kein legendär, 2× Neuwürfeln am Tag |
| 2 | Handelshaus | heutiger Stand: 8 Stück, alle Chancen, 5× Neuwürfeln |
| 3 | Grosshandel | 10 Stück, 8 % episch, 0,5 % legendär, Verkaufspreise +10 % |

### ⚒️ Schmiede

| Stufe | Name | Wirkung |
|---|---|---|
| 0 | – | nicht vorhanden: kein Zerlegen, kein Verbessern |
| 1 | Esse | Zerlegen, Verbessern bis +2 |
| 2 | Schmiede | heutiger Stand: Verbessern bis +5 |
| 3 | Meisterschmiede | Verbessern kostet 20 % weniger Essenz, beim Zerlegen 75 % statt 50 % Rückerstattung |

Ohne Schmiede fehlt anfangs wenig, weil man zum Zerlegen ohnehin erst seltene Items braucht.

### 📜 Anschlagtafel

Das Questbuch mit den Gebiets-, Boss- und Dungeon-Quests gibt es immer. Die Tafel bringt die
zusätzlichen Aufträge.

| Stufe | Name | Wirkung |
|---|---|---|
| 0 | – | nur Questbuch |
| 1 | Anschlagtafel | 3 tägliche Jagdaufträge |
| 2 | Auftragsbrett | heutiger Stand: dazu Händler-Aufträge und Wochenaufträge |
| 3 | Kopfgeld-Tafel | täglich wechselnde Steckbriefe für Elite-Gegner (Idee #14) |

### ⚗️ Alchemist

| Stufe | Name | Wirkung |
|---|---|---|
| 0 | – | nur kleine Heiltränke beim Strassenhändler |
| 1 | Kräuterhütte | heutiger Stand: dazu Heiltränke |
| 2 | Alchemistenlabor | Angriffs- und Rüstungstränke kaufbar (je 120 Gold) |
| 3 | Meisteralchemist | grosse Heiltränke kaufbar (150 Gold), alle Tränke wirken 25 % stärker |

Hier ist Stufe 1 der heutige Stand, weil Angriffs- und Rüstungstränke heute nur als Beute fallen. Die
stärkere Wirkung gilt für Heilung und Verstärkung, aber nur im Solo-Kampf (Gebiete, Dungeons, Turm).

### 🍺 Taverne

| Stufe | Name | Wirkung |
|---|---|---|
| 0 | – | nicht vorhanden |
| 1 | Schankstube | einfache Gerichte |
| 2 | Gasthaus | kräftigere Gerichte |
| 3 | Festhalle | Festmahle mit mehreren Buffs |

Die Taverne verkauft später **Buff-Food**. Die Logik dafür fehlt noch: Gebäude, Stufen und Menü stehen,
das Menü zeigt vorerst nur „Die Speisekarte folgt bald“.

### 🎯 Trainingsplatz

| Stufe | Name | Wirkung |
|---|---|---|
| 0 | – | Skillpunkte zurücksetzen nicht möglich |
| 1 | Übungsplatz | Skillpunkte zurücksetzen gegen Gold (12.5 × Level × (1 + Level/10)) |
| 2 | Trainingsplatz | Zurücksetzen kostet 50 % weniger |
| 3 | Kampfschule | Zurücksetzen ist kostenlos |

Der Knopf im Skills-Tab bleibt, ist ohne Trainingsplatz aber gesperrt. Das Menü des Trainingsplatzes hat
denselben Knopf. Attribute zurücksetzen hängt nicht vom Trainingsplatz ab.

### 🗿 Statue

| Stufe | Name | Wirkung |
|---|---|---|
| 0 | – | kein XP-Bonus |
| 1 | Gedenkstein | +5 % XP |
| 2 | Heldenstatue | +10 % XP |
| 3 | Goldenes Denkmal | +15 % XP |

Der Bonus gilt für XP aus Solo-Kämpfen, Dungeons, dem Turm und abgegebenen Quests (`statueXp` in
village.ts). Kampf-Ergebnis und Truhen zeigen die XP schon mit Bonus. Im Koop gilt er nicht, wie das
übrige Dorf.

### 🎯 Steckbriefe (Kopfgeld-Tafel)

- Jeden Tag 2 Steckbriefe für Kreaturen aus den Tagesaufträgen deines Levels, jeder mit 2 festen
  Elite-Modifikatoren (z. B. Rasend und Explosiv).
- Solange ein Steckbrief offen ist, erscheint die Kreatur beim nächsten Kampf genau als dieser
  Elite-Gegner. Man muss sie also nur aufsuchen, nicht auf Glück hoffen.
- Belohnung: so viel wie 15 Siege, dazu immer ein Item mit den Seltenheiten einer Boss-Quest.

### Aufträge, die noch nicht sichtbar sind

Die Tages- und Wochenaufträge werden immer vollständig ausgewürfelt. Die Anschlagtafel zeigt davon nur,
was ihre Stufe freigibt (`visibleBoard` in quests.ts). Unsichtbare Aufträge kommen nicht voran. Wer
die Tafel mitten am Tag ausbaut, sieht die neuen Aufträge sofort, mit Fortschritt 0.

## Kosten

Gold fällt heute bei 40 % der Siege und beträgt im Schnitt `3 + Level` (Bosse ×4, immer). Pro Sieg
sind das auf Level 10 etwa 5 Gold, auf Level 30 etwa 13 und auf Level 55 etwa 23, dazu kommen
Quest-Belohnungen und Verkäufe. Die Kosten richten sich danach:

| Stufe | Gold | Material | Erreichbar ab etwa |
|---|---|---|---|
| 1 | 150–400 | 10–20 Wolfsfell (Alchemist: Echsenschuppe) | Level 5–12 |
| 2 | 1'500–2'500 | 25 Kristallsplitter oder Frostpelz, 10 Material aus Stufe 1 | Level 25–35 |
| 3 | 6'000–10'000 | 30 Knochenstaub oder Drachenschuppe, 15 Material aus Stufe 2 | Level 45–60 |

Vorschlag pro Gebäude:

| Gebäude | Stufe 1 | Stufe 2 | Stufe 3 |
|---|---|---|---|
| Händler | 300 G, 15 🐺 | 2'000 G, 25 💎, 10 🐺 | 8'000 G, 30 💀, 15 💎 |
| Schmiede | 400 G, 20 🐺 | 2'500 G, 25 ❄️, 10 🦎 | 10'000 G, 30 🐉, 15 ❄️ |
| Anschlagtafel | 150 G, 10 🐺 | 1'500 G, 25 💎, 10 🐺 | 6'000 G, 30 💀, 15 💎 |
| Alchemist | 300 G, 15 🦎 | 2'000 G, 25 ❄️, 10 🦎 | 8'000 G, 30 🐉, 15 ❄️ |
| Taverne | 250 G, 15 🐺 | 1'800 G, 25 💎, 10 🦎 | 7'000 G, 30 💀, 15 💎 |
| Trainingsplatz | 300 G, 20 🐺 | 2'000 G, 25 ❄️, 10 🐺 | 8'000 G, 30 💀, 15 ❄️ |
| Statue | 500 G, 20 🦎 | 3'000 G, 25 💎, 10 🦎 | 12'000 G, 30 🐉, 15 💀 |

Weil die Material-Stufen an Gebiete gebunden sind, braucht es **keine zusätzlichen Level-Sperren**.
Wer Stufe 3 bauen will, muss in den Schattenruinen oder im Drachenhort bestehen.

Gebaut wird **sofort**, ohne Wartezeit. Das passt besser zu kurzen Sitzungen.

## Bestehende Spielstände

Bestehende Spielstände beginnen wie neue: alle Gebäude auf Stufe 0, Material 0. Items, Gold und Essenz
bleiben, bereits verbesserte Items behalten ihre Stufe. Nur weiter verbessern geht erst wieder mit der
passenden Schmiede.

## Koop

Das Dorf gilt pro Spieler und wirkt nicht auf den Koop-Kampf. Material aus Koop-Kämpfen und
Koop-Dungeons bekommt jeder Spieler für sich. Die Koop-Beute würfelt jeder Spieler selbst
(`rollCoopReward`, `rollCoopDungeonChest`). Das Material kommt also auf dem Client dazu. Weil
`coopCombat.ts` geändert ist, gehört trotzdem ein `npm run functions:deploy` dazu.

## Oberfläche

- Der Dorf-Tab öffnet mit „🏗️ Ausbau“: oben der Materialvorrat, darunter die Gebäude als Karten. Ein
  nicht gebautes Gebäude erscheint als Bauplatz mit Kosten und dem Knopf „Bauen“, ein gebautes Gebäude
  mit der nächsten Stufe und deren Kosten.
- Die Kosten sind klar sichtbar, mit fehlenden Mengen in Rot („30 💀 – du hast 12“).
- Ganz oben steht das **Dorfbild** (`VillageScene.tsx`): ein Pixel-Hintergrund (`VILLAGE_WIDTH` = 300
  Pixel breit, breiter als die Kampfszene) mit den sieben Gebäuden auf ihrer aktuellen Stufe (Raster in
  `src/game/villageSprites.ts`, z. B. Bauplatz → Esse → Haus → Halle). Der Hintergrund (`paintVillage`
  in backgrounds.ts) wächst mit der Summe aller Stufen (0–21) mit: alle 2 Stufen ein Haus mehr auf dem
  Hügel, der Weg wird von Erde zu Kies (ab 7) und Pflaster (ab 14), der Zaun von Pflöcken zu Holzzaun
  (ab 5), Palisade (ab 12) und Steinmauer (ab 19). Dazu kommen Blumen (ab 3), Laternen (ab 9) und
  Wimpel (ab 18).
- Ein Klick auf ein gebautes Gebäude öffnet sein Menü als **Popup** über dem Dorf, so bleibt man im
  Ausbau-Tab. Händler, Schmied und Alchemist gibt es zusätzlich als Unter-Tab, die Anschlagtafel auch
  im Quest-Tab. Ein Klick auf einen Bauplatz öffnet den Bau-Dialog, wenn Gold und Material reichen,
  sonst springt er zur Karte mit den Kosten.
- Über Gebäuden, die man gerade ausbauen kann, hüpft ein 🔨. Ein Klick darauf öffnet den Bau-Dialog.
  Nach dem Bauen federt das neue Bild hoch und es staubt. Die Karten zeigen dasselbe Pixelbild.
- **Tränke gibt es beim Alchemisten** (eigener Unter-Tab, gesperrte Sorten mit der nötigen Stufe). Bis
  er gebaut ist, verkauft der Händler unter seiner Ware kleine Heiltränke, danach nicht mehr.
- Im Kampf-Ergebnis, in der Dungeon- und Turm-Truhe und in der Koop-Truhe steht das erhaltene Material,
  zum Beispiel „+1 🐺 Wolfsfell“.
- Ohne Schmiede zeigt der Schmied-Tab einen Bauplatz mit Link zum Ausbau, ohne Anschlagtafel zeigt der
  Quest-Tab einen Hinweis statt der Aufträge, ohne Alchemist zeigt der Alchemist-Tab einen Bauplatz.

## Erfolge

- **Grundstein:** erstes Gebäude gebaut
- **Dorfgründer:** alle Gebäude mindestens auf Stufe 1
- **Baumeister:** alle Gebäude auf Stufe 3

## Spätere Erweiterungen

- **Lagerhaus:** mehr Inventarplätze
- **Taverne:** Buff-Food (Logik folgt), später vielleicht Treffpunkt für den Koop oder ein Söldner als
  Begleiter

## Entscheidungen

- **Ein Material pro Gebiet** reicht vorerst, Bosse geben kein zusätzliches seltenes Material.
- **Keine Wartezeit:** Gebaut wird sofort.
- **Bestehende Spielstände** beginnen wie neue mit einem leeren Dorf.
