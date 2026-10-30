# Endlos-Turm

Ein Solo-Modus ohne Ende: Stockwerk für Stockwerk werden die Gegner stärker, bis man fällt oder mit
seiner Truhe aussteigt. Alle paar Stockwerke wählt man einen von drei Segen. Eine wöchentliche
Rangliste zeigt, wer am höchsten kommt. Code: `src/domain/tower.ts`, Store `gameStore.ts`
(`tower`), Oberfläche im Kampf-Tab und in der Rangliste.

Status: **erste Version fertig** auf Branch `feature/endlos-turm` (Solo, Segen, Truhe, Rekorde, Wochen-Rangliste).

## Ablauf

- **Zugang:** ab Level 10, im Kampf-Tab unter „Endlos-Turm“. Kein Eintritt, beliebig oft.
- **Stockwerk = ein Kampf.** Die Lebenspunkte werden mitgenommen wie im Dungeon, Mana und
  Abklingzeiten beginnen frisch. Tränke aus dem Vorrat sind erlaubt (je Sorte einmal pro Kampf).
- **Gegner:** zufällig aus allen normalen Kreaturen der Gebiete und Dungeons, immer **auf dem Level
  des Helden**. Darum ist der Turm auf jedem Level spannend. Die Stärke wächst mit dem Stockwerk
  (Faktor auf Lebenspunkte und Schaden, siehe `floorPower`). Schwächen und Resistenzen der Kreatur
  gelten wie überall.
- **Elite:** Die Chance steigt mit dem Stockwerk, ab Stockwerk 10 bis zu zwei Modifikatoren, ab 20
  bis zu drei.
- **Boss-Stockwerke:** Jedes 5. Stockwerk ist ein zufälliger Gebiets- oder Dungeon-Boss, samt
  Begleitern, Fähigkeiten und zweiter Phase.
- **Segen:** Nach jedem 3. Stockwerk wählt man einen von drei zufälligen Segen. Er gilt bis zum Ende
  des Laufs, und derselbe Segen kann sich stapeln.
- **Truhe:** Die Beute sammelt sich wie im Dungeon in einer Truhe. Nach jedem Sieg kann man aussteigen
  und bekommt die Truhe. Bei einer Niederlage ist sie verloren.
- **Belohnung bewusst knapp** (`towerReward`), der Turm ist für die Rangliste da, nicht zum Farmen:
  - 25 % der Erfahrung und 30 % des Golds eines normalen Kampfes, mit +5 % pro Stockwerk
  - Items und Tränke nur von Bossen, von Elite-Gegnern mit 20 % Chance ein Item
  - keine Verstärkungstränke und keine Boss-Items
- **Aufträge:** ab Level 10 ein Tagesauftrag („Turmaufstieg“, Stockwerk 5 in einem Lauf) und ein
  Wochenauftrag („Hoch hinaus“, Stockwerk 12). Normale Turm-Gegner zählen für Jagdaufträge,
  Turm-Bosse nicht für Boss-Aufträge und nicht als Bosssieg.
- **Erfolge** (Kategorie 🗼 Turm): Himmelsstürmer (Stockwerk 10/25/50), Turmbezwinger (3/20/60
  Turm-Bosse), Gesegnet (3/6/10 Segen in einem Lauf).
- **Hintergrund:** eigene Halle (`endless-tower` in backgrounds.ts) mit Quadermauern, Bogenfenstern
  mit Sternenhimmel, Säulen mit Kohlebecken, Wimpeln und einem Runenkreis auf dem Boden.
- **Rekorde:** bestes Stockwerk (für immer) und bestes Stockwerk der Woche (Montag bis Sonntag). Beides
  steht im Spielstand und im öffentlichen Profil.
- **Rangliste:** In der Rangliste gibt es neben der Erfahrung die Ansicht „Endlos-Turm – diese
  Woche“. Sie liest aus `public_profiles.snapshot.tower`, braucht also keine neue Tabelle.

## Segen

| Segen | Wirkung (pro Stapel) |
|---|---|
| ⚔️ Kraft | +15 % Schaden |
| 🛡️ Bollwerk der Ahnen | +20 % Rüstung |
| ❤️ Vitalität | +15 % maximale Lebenspunkte, und sofort um so viel geheilt |
| 🏕️ Rast | heilt sofort 40 % der Lebenspunkte |
| 🎯 Präzision | +8 % kritische Trefferchance |
| 💧 Fokus | Fähigkeiten kosten 25 % weniger Mana |
| 🧛 Blutdurst | heilt um 8 % des verursachten Schadens |
| 🪓 Henker | +40 % Schaden gegen Gegner unter 30 % LP |
| 🌵 Dornen | wirft 20 % des erlittenen Schadens zurück |
| ⚗️ Alchemie | Heiltränke heilen 50 % mehr |
| 💰 Schatzsucher | +25 % Erfahrung und Gold in der Truhe |
| 🕊️ Zweiter Atem | Fällt man, steht man einmal mit 30 % LP wieder auf (nur einmal pro Lauf wählbar) |

## Offen / später

- Koop-Turm (zu zweit), wöchentliche Belohnungen für die Rangliste.

## Abstimmung (Simulation)

Simuliert wurden alle 11 Klassen, mit der Ausrüstung auf ihrem Level und einem realistischen
Trankvorrat (5 kleine, 5 normale, ab Level 41 drei grosse). Die Segen wählt die Simulation nach einer
festen Reihenfolge. Gezählt wird, auf welchem Stockwerk der Lauf endet (Median über Klassen und
Läufe):

| Ausrüstung | Lv. 15 | Lv. 30 | Lv. 45 | Lv. 60 |
|---|---|---|---|---|
| gewöhnlich | 7 | 8 | 8 | 9 |
| selten | 10 | 11 | 12 | 13 |
| episch | 11 | 16 | 16 | 16 |
| legendär | 16 | 22 | 21 | 22 |

Die besten 10 % kommen etwa 4–6 Stockwerke weiter. Gute Ausrüstung bringt also klar höher, und auf
jedem Level ist der Turm etwa gleich lang.

Erkenntnisse:
- Bosse mit voller Stärke beendeten fast jeden Lauf auf Stockwerk 5, weil man angeschlagen ankommt.
  Darum kämpfen sie im Turm nur mit 45 % der Stockwerk-Stärke (`BOSS_FLOOR_FACTOR`).
- Die Stärke wächst um 4 % pro Stockwerk (`floorPower`), auf Lebenspunkte und Schaden.
