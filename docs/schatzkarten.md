# Schatzkarten

Eine seltene Beute, die zu einem verborgenen Raum in einem Solo-Dungeon führt (Idee aus der fünften Runde in `ideen.md`).
Code: `src/domain/treasureMaps.ts`, Store `gameStore.ts` (`treasureMaps`, Raum `treasure` im Dungeon-Lauf),
Oberfläche `src/components/TreasureMaps.tsx` und `DungeonPath.tsx`.

## Regeln

| Thema | Entscheidung |
|---|---|
| Fundort | Jeder Sieg: Gebiet, Dungeon, Turm, Überfall und Koop (Raid-Boss, Koop-Dungeon) |
| Chance | 0,4 % pro gewöhnlichem Gegner, 2 % bei Elite, Zwischen- und Endboss, heroischem Boss und Koop-Sieg (Koop-Dungeon nur bis zum Endboss, wer vorher aussteigt, hat 0,4 %) |
| Ziel | Ein zufälliger offener Dungeon, für den man noch keine Karte hat |
| Anzahl | Höchstens 3 Karten auf einmal, danach fällt keine mehr |
| Anzeige | In der Siegmeldung, bei den laufenden Quests und auf der Dungeon-Karte |
| Schatzraum | Nur solo: an der ersten Gabelung hinter dem Zwischenboss eine zusätzliche Tür 🗺️ (nie verschlossen) |
| Inhalt | 75 % ein legendäres Item auf Heldenlevel (mit Spezialeffekt), 25 % ein Schatz-Rezept, solange man nicht alle kennt |
| Sicherheit | Der Fund wird beim Eintreten sofort gutgeschrieben und geht bei einer Niederlage nicht verloren |
| Weg | Der Schatzraum kostet den Schritt (ein Kampf weniger), zählt aber nicht als Raum ohne Kampf |
| Einlösen | Beim Betreten des Schatzraums. Wer vorher aussteigt oder fällt, behält die Karte |

Bei etwa 0,5 % im Mittel fällt ungefähr alle 200 Siege eine Karte. Wer viele Elite-Gegner und Bosse besiegt, findet sie öfter.

## Schatz-Rezepte

Es gibt sie nur im Schatzraum, der fahrende Koch verrät sie nie (`treasure` in `food.ts`). Sie sind etwas stärker als
die Rezepte der Besucher und gelten ab der Schankstube.

| Gericht | Wirkung |
|---|---|
| 🏴‍☠️ Kapitänspastete | +18 % Schaden, +6 % Krit, +20 % Gold |
| 🥩 Drachenpfeffer-Steak | +22 % Schaden, +20 % LP |
| 🫕 Goldene Brühe | +30 % LP, +20 % Rüstung, +20 % Mana |

## Spielstand

v23: `treasureMaps` (Liste mit `id`, `dungeonId`, `found`). Ältere Stände beginnen ohne Karten (`repairSave`).
Der Dungeon-Lauf merkt sich die Karte in `treasureMap`. Er wird wie bisher nicht gespeichert, die Karte bleibt bis
zum Betreten des Schatzraums in `treasureMaps`.

## Offen / später

- Schatzraum im Koop-Dungeon (der Server würfelt die Türen)
- Erfolg „Schatzjäger“ für eingelöste Karten
- Karten für Gebiete mit einem verborgenen Gegner
