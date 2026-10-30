# Schwächen und Resistenzen

Ziel: Es soll zählen, mit welcher Waffe man wohin geht. Manchmal lohnt es sich, Waffe oder Klasse zu
wechseln. Code: `src/domain/matchups.ts`, Wirkung in `combat.ts` und `coopCombat.ts`. Gilt für alle
Kreaturen, Bosse, Begleiter und Raid-Bosse.

## Regeln

- **Schadensarten:** ⚔️ Klingen (Schwert, Zweihandschwert, Axt, Grossaxt), 🔨 Wucht (Streitkolben,
  Grosshammer, Schild), 🏹 Stich (Dolch, Bogen), 🔮 Magie (Stab, Zepter). Dazu Gift, Feuer und Bluten.
- **Welche Waffe zählt:** Normale Angriffe und Konter zählen mit der Hauptwaffe (die erste Waffe, die
  kein Schild ist). Fähigkeiten zählen mit ihrer eigenen Waffe.
- **Wirkung:** Schwäche +30 % Schaden, Resistenz −20 %. Bei Gift, Feuer und Bluten wirkt der Faktor
  auf den Schaden pro Runde. Ist ein Gegner immun, wird der Zustand gar nicht erst angelegt
  (Ereignis `immune`).
- **Anzeige im Kampf:** Plaketten am Gegner, ▲/▼/✕ in der Zielwahl, „▲ wirksam“ bzw. „▼ resistent“
  an Angriff und Fähigkeiten gegen das gewählte Ziel, „SCHWACHPUNKT!“, „RESISTENT“ und „IMMUN“ in der
  Szene, ein Vermerk im Protokoll.

Die vollständige Liste steht in `CREATURE_MATCHUPS`. Wie oft eine Art Schwäche bzw. Resistenz ist:
Klingen 10/13, Wucht 13/6, Stich 11/10, Magie 11/10. Klingen haben es also am schwersten.

## Balance

Entschieden (2026-10-30): Resistenzen gelten auch bei Bossen, auch wenn einzelne Klassen dann schlecht
dastehen. Das soll zum Anpassen zwingen. Die ersten Werte (+50 % / −40 %) waren viel zu hart: Ein Held
mit zwei Schwertern gewann gegen den Steingolem nur noch 1 % statt über 90 %. Auch mit +30 % / −20 %
schwanken einzelne Klassen bei Bossen stark (Simulation, seltene Ausrüstung, beste Spielweise):

| Boss | Resistenz | Auswirkung |
|---|---|---|
| Ignaroth | Klingen, immun Feuer | Berserker 95 → 16 %, Plünderer 76 → 5 % |
| Lichkönig | Magie, immun Gift/Bluten | Hexer 97 → 0 % |
| Erzkönig | Klingen | Champion 99 → 48 % |
| Uralte Sumpfechse | – (schwach gegen Stich) | Waldläufer 26 → 97 % |

Der Mittelwert über alle Klassen sinkt vor allem, weil einzelne Klassen ausgesperrt werden. Darum
wurden die Boss-LP nicht pauschal gesenkt. Der Balance-Test in `combat.test.ts` spielt „angepasst“:
Gegen Bosse, die Klingen widerstehen, kommt ein Wächter mit Grosshammer statt des Champions. Gegen
normale Kreaturen nimmt der Test-Held eine Waffe, gegen die sie nicht resistent sind. Dafür nur zwei
kleine Korrekturen: Erzkönig LP-Faktor 0,95 → 0,9, Ignaroth 1,55 → 1,6.

Koop-Dungeons (gemischte Gruppe aus Champion, Kleriker, Magier, Assassine; gewöhnliche Ausrüstung)
bleiben ähnlich. Nur der Tempel zu zweit wird leichter (5 → 35 %), weil sich gemischte Gruppen
gegenseitig abdecken.
