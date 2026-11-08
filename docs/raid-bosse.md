# Raid-Bosse mit Phasen – Entwurf

Die drei Koop-Bosse (Sumpfhydra, Frostriese Hrimgar, Weltenverschlinger) sind bisher
Schadensrennen: viel Leben, eine Fähigkeit alle 3 Runden. Sie sollen die schwersten Kämpfe
im Spiel werden, mit Phasen, die die Gruppe zwingen, sich abzusprechen.

Status: Sumpfhydra ✅ (`hydra.ts`), Frostriese und Weltenverschlinger 💡 Entwurf.

Grundsätze:

- **Phasen nach Lebenspunkten**, angekündigt im Kampfbild („Noch 1 Kopf bis …“).
- **Jede Phase stellt eine Aufgabe**, die man nicht ignorieren kann. Wer sie ignoriert, verliert,
  nicht nur etwas Schaden.
- **Koop-Aufgaben:** Jede Mechanik braucht mindestens zwei Helden oder eine Rollenteilung
  (einer hält den Boss, die anderen kümmern sich um die Köpfe).
- **Mehr Leben und Schaden als heute**, damit eine Gruppe ohne Plan scheitert. Ziel nach Simulation:
  eine gut ausgerüstete Gruppe gewinnt in etwa 2 von 3 Versuchen, ohne Absprache in höchstens 1 von 5.

---

## Sumpfhydra (Lv. 20): Köpfe abschlagen

Die Hydra hat vier Köpfe: drei sterbliche und den unsterblichen Mittelkopf (der Boss selbst).
Bei **75 %, 50 % und 25 %** ihrer Lebenspunkte schlägt die Gruppe einen Kopf ab. Er fällt in den
Kampf und kämpft als eigener Gegner (Begleiter) mit eigener Fähigkeit weiter.

| Schwelle | Kopf | Fähigkeit |
|---|---|---|
| 75 % | 🐍 Giftkopf | Beisst und vergiftet: 25 % seines Schadens pro Runde, stapelt sich bis 3-mal (3 Runden) |
| 50 % | 🫗 Säurekopf | Beisst und ätzt: Das Ziel erleidet 3 Runden lang 25 % mehr Schaden |
| 25 % | 🩸 Blutkopf | Beisst nicht, sondern heilt die Hydra jede Runde um 4 % ihrer max. LP |

Regeln:

- **Zwei wachsen nach:** Lebt ein abgeschlagener Kopf nach **3 Runden** noch, wächst aus dem
  Stumpf ein zweiter, gleicher Kopf (höchstens einmal pro Kopf). Der Zähler steht über dem Kopf.
- **Feuer brennt den Stumpf aus:** Brennt die Hydra in der Runde, in der ein Kopf fällt (Feuer-Fähigkeit,
  Brandflasche, Item-Effekt), wächst dieser Kopf nicht nach. Die Hydra ist schon schwach gegen Feuer,
  das macht Brandflasche und Pyromant zur Gruppenaufgabe.
- **Gepanzerter Hals:** Solange ein Kopf lebt, erleidet die Hydra **50 % weniger Schaden**. Die Gruppe
  kann die Köpfe also nicht einfach liegen lassen.
- **Phasen stauen sich nicht:** Ein Treffer, der über zwei Schwellen geht, schlägt nur einen Kopf ab.
  Die nächste Schwelle löst erst in der Runde danach aus.
- **Letzte Phase (unter 25 %):** Der unsterbliche Kopf rast. Giftatem alle 2 statt alle 3 Runden.
- Köpfe haben je **10 % der LP der Hydra** (mit der Gruppe skaliert) und **30 % ihres Schadens**.
  Sie handeln ab der Runde nach dem Abschlagen, lassen sich betäuben wie Begleiter und tragen die
  Schwächen und Resistenzen der Hydra (schwach gegen Klingen und Feuer, immun gegen Gift).
- Kampfbild: Die Köpfe fliegen beim Abschlagen an ihren Platz um die Hydra (bis zu sechs). Beim Ziel steht,
  was sie vorhaben und wann ein zweiter wächst; an der Hydra „Gepanzerter Hals“ und die nächste Schwelle.

**Simulation** (zwei bzw. vier Helden mit epischer Ausrüstung, nur normale Angriffe, 200 Kämpfe pro Zeile).
Vorher gewann diese Gruppe auf Lv. 40 jeden Kampf:

| Gruppe | Lv. 40, Köpfe zuerst | Lv. 40, nur die Hydra |
|---|---|---|
| 2 Helden | 14 % | 0 % |
| 4 Helden | 57 % | 0 % |

Auf Lv. 44 (nächste Ausrüstungsstufe) gewinnt das Duo mit Köpfen zuerst fast immer, ohne fast nie –
das prüft `hydra.test.ts`.

Echte Spieler haben Fähigkeiten, Tränke und Abwehren und kommen deutlich früher durch. Die Werte sind
bewusst hart; nach den ersten Testkämpfen eher an `HEAD_HP` drehen, der Schaden der Köpfe wirkt kaum,
weil eine Gruppe mit Plan sie schnell erledigt.

Rollen: Ein Held (Bollwerk, Paladin) hält die Hydra, die anderen schlagen die Köpfe. Wer Feuer
hat, hebt es für den Moment auf, in dem ein Kopf fällt.

## Frostriese Hrimgar (Lv. 40): Eiskerker und Lawine

| Phase | LP | Mechanik |
|---|---|---|
| 1 Gletscher | 100–60 % | Gletscherstampfer wie heute. Statt nur einzufrieren, sperrt er einen Helden in einen **Eiskerker** (Begleiter mit wenig LP). Er setzt aus, bis die anderen den Kerker zerschlagen, höchstens 3 Runden. Wucht (Hammer, Streitkolben) bricht doppelt |
| 2 Lawine | 60–25 % | Hrimgar lädt alle 4 Runden eine **Lawine** an (2 Runden Ansage). Genug Schaden in diesen 2 Runden bricht sie ab, sonst trifft sie alle mit dreifachem Schaden. Wer abwehrt, nimmt nur die Hälfte |
| 3 Zerbrechen | unter 25 % | Sein Eis bricht: Er erleidet 25 % mehr Schaden, macht aber 40 % mehr und stampft jede Runde. Wer jetzt noch Fähigkeiten aufgespart hat, setzt sie ein |

Koop-Aufgabe: In Phase 1 gemeinsam befreien, in Phase 2 gemeinsam genug Schaden für den Abbruch
bündeln (Fähigkeiten aufsparen!), in Phase 3 überleben.

## Weltenverschlinger (Lv. 60): Risse und Verschlingen

| Phase | LP | Mechanik |
|---|---|---|
| 1 Hunger | 100–66 % | Leerenstrudel und Lebensentzug wie heute |
| 2 Leerenrisse | 66–33 % | Öffnet **zwei Risse** (Begleiter). Jeder offene Riss heilt ihn jede Runde um 3 % und raubt allen 10 Mana. Fällt nur ein Riss, öffnet er sich nach 2 Runden mit vollen LP wieder. Beide müssen **in derselben Runde** fallen (Idee 7) |
| 3 Verschlingen | 33–10 % | Alle 4 Runden verschlingt er den Helden mit der höchsten Bedrohung. Im Bauch verliert der Held jede Runde 8 % LP, trifft aber „von innen“ mit doppeltem Schaden. Spuckt ihn aus, wenn die Gruppe 10 % seiner LP Schaden macht |
| 4 Kollaps | unter 10 % | Leerenstrudel jede 2. Runde, Risse öffnen sich nicht mehr. Reines Rennen |

Koop-Aufgabe: Schaden auf die beiden Risse aufteilen und zeitgleich abschliessen, den Verschlungenen
von aussen befreien.

---

## Was dafür gebaut werden muss

Mit der Hydra gebaut, darauf bauen Frostriese und Weltenverschlinger auf:

1. ✅ **Begleiter mitten im Kampf:** `adds` wächst während der Runde (`spawnHead` in `resolveRound`),
   `CoopBattleScene.ts` blendet neue Begleiter ein (`spawnAdd`) und macht sie anklickbar.
2. ✅ **Eigene Fähigkeiten der Begleiter** neben Heiler, Schildträger und Trommler: Feld `head` am
   Begleiter, Absichtstext in der Zielwahl (`headIntentText`).
3. ✅ Phasen nach Lebenspunkten für die Hydra (`heads` im Kampfzustand). Für Frostriese und
   Weltenverschlinger fehlt noch eine allgemeine Phase pro Raid-Boss.
4. Grafik: Die Köpfe haben Pixel-Raster, Bild-Prompts stehen in docs/gegner-prompts.md. Eiskerker und
   Leerenriss fehlen noch.
5. Laufende Koop-Kämpfe ohne `heads` starten bei null abgeschlagenen Köpfen – ein Kampf, der schon unter
   75 % steht, verliert in der nächsten Runde seinen ersten Kopf.
