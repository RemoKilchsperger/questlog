# Wurftränke

Bisher gab es nur Tränke, die man selbst trinkt: drei Heiltränke, Angriff und Rüstung.
Wurftränke wirft man auf einen Gegner. Sie nutzen die Wirkungen, die es im Kampf schon gibt
(Feuer, Gift, Einfrieren, Rüstungsbruch, Schwächung). Darum greifen Schwächen, Resistenzen,
Immunitäten und die Skilltree-Synergien automatisch.

Code: `src/domain/potions.ts` (Daten), `combat.ts` (solo), `coopCombat.ts` (Koop),
Tests in `src/domain/throwPotions.test.ts`.

## Regeln

- Werfen ist eine Trank-Aktion: **pro Runde ein Trank**, getrunken oder geworfen, und **jede Sorte
  einmal pro Kampf**. Man entscheidet also jede Runde: heilen oder werfen.
- Werfen kostet keinen Zug. Solo hält man den Trank bereit (`BattleState.thrown`), er fliegt mit dem
  nächsten Zug vor der Aktion, auch beim Abwehren. Im Koop ist er Teil der Rundenaktion.
- Ziel ist das aktuelle Ziel des Helden (Boss oder Begleiter). Die Sprengflasche trifft alle Gegner.
- Schaden rechnet in **Prozent des Heldenschadens** (mit Angriffstrank, Berserker-Wut und Kriegsschrei),
  wie Gift und Feuer der Fähigkeiten. So bleiben die Tränke auf jedem Level nützlich.
- Der Meisteralchemist (+25 %) wirkt solo auch auf Wurftränke, im Koop wie bei allen Tränken nicht.
- Koop: Wurftränke gehen nur auf Gegner. Wiederbeleben bleibt bei den Heiltränken.
- Auf eine abgetauchte Sumpfechse kann man nur die Sprengflasche werfen (sie trifft dann die Begleiter).
- Feuer, Gift und Bluten laufen gleichzeitig. Trifft ein neues Feuer (Gift, Bluten) auf ein bestehendes, bleibt
  das mit mehr Schaden pro Runde, bei Gleichstand das neue. Das gilt für alle Quellen (Waffen, Items,
  Wurftränke) und im Koop auch über Spieler hinweg (`strongerDot` in combat.ts).

## Die Tränke

| Trank | Wirkung | Synergie / Konter | Alchemist | Preis |
|---|---|---|---|---|
| ☄️ Brandflasche | Feuer: 3 Runden je 30 % Heldenschaden, ignoriert Rüstung | Schwäche von Frosttroll, Mumie, Hydra …; Salamander und Flammenelementar immun; Pyromant, Schmelzen | Kräuterhütte (1) | 60 |
| ☠️ Giftphiole | Gift: 4 Runden je 25 % Heldenschaden | Geht durch den Schild des Schildträgers; stapelt und platzt mit dem Plage-Pfad; viele Untote und Golems immun | Kräuterhütte (1) | 60 |
| 🧊 Frostbombe | Friert das Ziel ein: es setzt 1 Runde aus (Bosse danach betäubungsimmun) | Bricht Aufladungen wie den Ansturm des Urmammuts; markiert für Kryomant/Schmelzen | Labor (2) | 140 |
| 🫗 Säureflasche | −25 % Rüstung für den Rest des Kampfes | Erzkönig: frisst zwei Panzerplatten weg | Labor (2) | 120 |
| 💨 Rauchbombe | Ziel macht 2 Runden 30 % weniger Schaden (Schwächung) | Gegen Wutanfall, Feueratem und andere angesagte Schläge | Labor (2) | 120 |
| 💥 Sprengflasche | Sofort 50 % Heldenschaden an **allen** Gegnern, ignoriert Rüstung | Unterbricht Heilrituale; der Schild des Schildträgers schluckt den Teil auf den Boss | Meister (3) | 250 |

Dazu fallen Wurftränke selten als Beute: Sie liegen mit Angriffs- und Rüstungstrank im Topf der
seltenen Trank-Drops (6 % pro Sieg, jede Sorte gleich wahrscheinlich).

## Darstellung

- Im Kampf stehen Wurftränke abgesetzt hinter den Trinktränken („🎯 Werfen“), nur die im Vorrat.
  Ein bereitgehaltener Wurftrank ist golden umrandet.
- Die Flasche fliegt im Bogen und zerplatzt in einer Wolke ihrer Farbe, dazu „RÜSTUNG ↓“ bzw. „GESCHWÄCHT“.
- Beim Alchemisten eine eigene Liste „Wurftränke“.

## Balance (Sim 2026-11-02)

Gebiets- und Dungeon-Bosse auf Bosslevel, Magier/Assassine/Duellant/Champion ohne Skillpunkte,
Heiltränke unter 40 % LP. Ø Siegquote ohne → mit Wurftränken:

| Tränke | seltene Ausrüstung | gewöhnliche Ausrüstung |
|---|---|---|
| Angriff + Rüstung (Vergleich, 240 Gold) | 53 % → 70 % | 13 % → 28 % |
| Brandflasche + Giftphiole + Säure (240 Gold) | 53 % → 63 % | 13 % → 23 % |
| Sprengflasche allein (250 Gold) | 53 % → 70 % | 13 % → 27 % |
| alle fünf ohne Sprengflasche | 53 % → 81 % | 13 % → 44 % |
| alle sechs | 53 % → 95 % | 13 % → 62 % |

Die erste Fassung (Feuer 40 %, Gift 35 %, Sprengflasche 120 %) war viel zu stark: Allein die
Sprengflasche hob die Siegquote auf 86 %, weil sie beide Begleiter in Runde 1 räumte. Pro Gold liegen
die Wurftränke jetzt auf dem Niveau von Angriffs- und Rüstungstrank. Wer alle Sorten mitnimmt, wird
aber deutlich stärker, weil er mehr Tränke pro Kampf einsetzen kann. Offene Stellschraube, falls das
zu viel ist: höchstens ein oder zwei Würfe pro Kampf.
