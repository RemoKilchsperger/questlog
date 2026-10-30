# Boss-Mechaniken: Phasen und Begleiter mit Aufgabe

Ziel: Bosskämpfe sollen nicht mehr alle gleich ablaufen. Es soll sich lohnen, das Ziel bewusst zu
wählen, und in der Mitte des Kampfes soll sich etwas ändern. Code: `src/domain/bossMechanics.ts`,
gilt für Solo und Koop-Dungeons. Die Raid-Bosse haben (noch) weder Begleiter noch Phasen.

## 1. Begleiter mit Aufgabe

Jeder Gebiets- und Dungeon-Boss hat zwei Begleiter (`creatures.ts`, `withAdds`): einen
gewöhnlichen und einen mit Aufgabe. Beide haben 25 % LP und 50 % Schaden einer normalen Kreatur
auf dem Level des Bosses.

| Rolle | Wirkung, solange er steht |
|---|---|
| 💚 Heiler | heilt den Boss jede Runde um 7 % seiner maximalen LP, statt anzugreifen |
| 🛡️ Schildträger | der Boss erleidet nur 50 % des Schadens (Treffer, Gift/Feuer/Bluten, Konter) |
| 🥁 Trommler | der Boss macht 40 % mehr Schaden (Angriffe, Fähigkeiten, deren Gift/Feuer/Bluten) |

Betäubte Heiler heilen nicht. Bollwerk blockt keine Heilung.

| Boss | Begleiter | mit Aufgabe | Phase |
|---|---|---|---|
| Goblinhäuptling Krummzahn | Goblin-Plünderer | 🥁 Goblin-Trommler | 📣 Kriegsruf (Sammelruf) |
| Uralte Sumpfechse | Moorschlange | 💚 Sumpfkröte | 🦎 Urinstinkt (Raserei +30 %) |
| Das Höhlenauge | Höhlenfledermaus | 🛡️ Steingolem | 👁️ Weit aufgerissen (Raserei +30 %) |
| Urmammut Graufrost | Schneewolf | 🥁 Frosttroll | 📯 Herdenruf (Sammelruf) |
| Der Lichkönig | Skelettkrieger | 💚 Dunkler Hexer | ⚰️ Totenerweckung (Sammelruf) |
| Uralter Drache Ignaroth | Feuersalamander | 🛡️ Dämonenwächter | 🌋 Glühende Wut (Raserei +30 %) |
| Erzkönig Grimmbart | Kobold-Sprengmeister | 🥁 Kobold-Trommler | 🔔 Alarm! (Sammelruf) |
| Hohepriesterin Neferet | Kobra-Priester | 💚 Kobra-Priester | 🪲 Ewiges Leben (Sammelruf) |
| Sturmfürst Kaelthar | Blitzbeschwörer | 🛡️ Steingargoyle | 🌪️ Auge des Sturms (Raserei +30 %) |
| Leerenfürst Xal'Zar | Leerenkriecher | 💚 Seelenfresser | 🕳️ Leerenriss (Raserei +20 % und Sammelruf) |

## 2. Zweite Phase

Fällt der Boss unter 50 % seiner LP, wechselt er einmal pro Kampf in seine zweite Phase. Geprüft wird
nach der Heldenphase samt Gift, Feuer und Bluten. Die Phase wirkt also schon auf den Gegenangriff
derselben Runde. Ab 65 % LP kündigt die Aktionsleiste sie an.

- **Raserei:** Der Boss macht bis zum Kampfende mehr Schaden. Sein Grundschaden wird erhöht und
  gespeichert, das gilt auch für Fähigkeiten und deren Gift, Feuer oder Bluten.
- **Sammelruf:** Der gewöhnliche Begleiter steht mit vollen LP wieder da, ob er gefallen war oder
  nicht. **Der Begleiter mit Aufgabe kommt nicht zurück.** In einer ersten Version standen beide
  wieder auf. Dann war es laut Simulation am besten, die Begleiter ganz zu ignorieren. Damit war die
  neue Zielwahl wertlos.

Ereignisse: `bossPhase` (mit `rally`: uids der Begleiter, die wieder stehen), `addHeal`, und
`shielded` an Treffern auf den Boss.

## 3. Abstimmung (Simulation)

Simuliert wurden alle 11 Klassen auf Boss-Level, wie in der früheren Balance-Simulation:
Fähigkeiten, Heiltrank unter 40 % LP, Bollwerk bzw. Betäubung in Runden mit Boss-Fähigkeit. Auf
Begleiter gehen nur normale Angriffe, die Fähigkeiten spart der Held für den Boss auf. Pro Klasse
zählt die beste von drei Zielwahlen: nur Boss, Begleiter mit Aufgabe zuerst, alle Begleiter zuerst.
Der Wert ist der Mittelwert über die Klassen, mit seltener Ausrüstung und Heiltränken
(Leerenfürst: episch bzw. selten). Dungeons zählen als ganzer Durchgang.

| Boss | vorher | nachher | nachher, nur Boss angegriffen |
|---|---|---|---|
| Goblinhäuptling | 76 % | 78 % | 48 % |
| Uralte Sumpfechse | 59 % | 61 % | 4 % |
| Höhlenauge | 87 % | 88 % | 24 % |
| Urmammut | 73 % | 73 % | 53 % |
| Lichkönig | 91 % | 94 % | 34 % |
| Ignaroth | 66 % | 78 % | 29 % |
| Verlassene Mine | 51 % | 64 % | 56 % |
| Versunkener Tempel | 61 % | 57 % | 31 % |
| Gewitterturm | 94 % | 92 % | 30 % |
| Abgrund der Leere (episch / selten) | 98 / 71 % | 97 / 70 % | 71 / 31 % |

Damit die Siegquoten gleich bleiben, halten die Bosse weniger aus (LP-Faktor in `withAdds`). Mine
und Ignaroth liegen etwas höher, weil der Balance-Test in `combat.test.ts` (Champion ohne dritte
Fähigkeit) dort sonst unter 60 % fällt. Erkenntnisse:

- **Heiler mit 4 %** und **Trommler mit +25 %** lohnten sich in kurzen Dungeon-Kämpfen nicht. Es war
  besser, sie zu ignorieren. Mit 7 % bzw. +40 % ist der Heiler Pflicht, und der Trommler lohnt sich
  bei den Gebietsbossen klar. In der Mine ist es knapp: Dort ist der Trommler weiter eher Nebensache.
- Einfach nur den Boss anzugreifen bringt meist nur noch die Hälfte der Siege oder weniger.

### Koop-Dungeons

Im Koop fällt der Begleiter mit Aufgabe in einer Runde, weil die ganze Gruppe auf ihn geht. Mit den
gesenkten Solo-LP wurde der Koop deshalb deutlich leichter: Tempel mit gewöhnlicher Ausrüstung
5 → 60 % zu zweit. Darum haben Dungeon-Bosse im Koop einen eigenen LP-Faktor (`coopHp`):

| Dungeon | Solo-LP | Koop-LP |
|---|---|---|
| Verlassene Mine | 0,95 | 1,05 |
| Versunkener Tempel | 1,2 | 1,45 |
| Gewitterturm | 1,2 | 1,45 |
| Abgrund der Leere | 1,15 | 1,35 |

Simuliert mit Gruppen aus Champion, Kleriker, Magier und Assassine (die ersten n), Siegquote für den
ganzen Dungeon, vorher → nachher:

| Dungeon | Ausrüstung | Duo | Trio | Vier |
|---|---|---|---|---|
| Verlassene Mine | gewöhnlich | 31 → 32 % | 60 → 55 % | 86 → 82 % |
| Versunkener Tempel | gewöhnlich | 5 → 5 % | 18 → 24 % | 21 → 11 % |
| Gewitterturm | gewöhnlich | 99 → 95 % | 100 → 98 % | 99 → 99 % |
| Abgrund der Leere | gewöhnlich | 99 → 69 % | 100 → 100 % | 99 → 99 % |
| alle | selten (Abgrund: episch) | 100 % | 100 % | 100 % |
