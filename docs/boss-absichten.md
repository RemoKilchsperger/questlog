# Boss-Absichten: Bosse mit eigener Taktik

Ziel: Bosskämpfe sollen sich unterscheiden und Entscheidungen verlangen. Bisher war es immer
dasselbe: so schnell wie möglich viel Schaden machen, jede 3. Runde kommt die Boss-Fähigkeit. Jetzt
zeigt der Boss jede Runde, was er vorhat, und der Held antwortet darauf: voll angreifen, abwehren,
unterbrechen oder das Ziel wechseln.

Code: `src/domain/bossIntents.ts` (Absichten und Abläufe), `src/domain/bossMechanics.ts`
(Begleiter mit Aufgabe), `src/domain/combat.ts` (Kampfrunde), `src/domain/coopCombat.ts`
(Koop-Kampf, siehe Abschnitt 6).

## 1. Absicht

Jeder Boss hat einen Zug für die laufende Runde (`BattleState.bossTurn`), sichtbar vor der Aktion des
Helden. Mögliche Absichten:

| Absicht | Was passiert |
|---|---|
| `attack` | normaler Angriff |
| `ability` | eine Fähigkeit aus `bossAbilities.ts` |
| `charging` | lädt auf und greift nicht an |
| `staggered` | taumelt nach einem abgebrochenen Aufladen: greift nicht an, erleidet +30 % Schaden |

Am Ende der Runde wählt der Boss seinen nächsten Zug (`nextBossTurn`) aus dem, was passiert ist:
Treffer des Helden auf den Boss, verlorene LP, Betäubung.

Bosse ohne eigenen Ablauf folgen dem alten Takt (alle `every` Runden die Fähigkeit). Die Oberfläche
warnt bei ihnen wie bisher eine Runde vorher. Ältere gespeicherte Kämpfe ohne `bossTurn` bekommen den
Zug der laufenden Runde.

Vor dem Kampf verraten Bosse mit eigenem Ablauf ihre Taktik nicht: „Kämpft mit eigener Taktik“.

**Selbst herausfinden:** Die Absicht beschreibt, was man dem Boss ansieht („Schäumt vor Wut“, „Scharrt
mit den Hufen …“), aber nicht, wie man kontert. Es gibt keine Tipps, keine Schwellen und keine Zahlen
wie „Wut 3/4“. Auch die Beschreibungen der Begleiter verraten keine Gegenmittel. Das Kampfprotokoll
zeigt hinterher, was passiert ist („Das offene Auge wirft deine Fähigkeit zurück“, „Du brichst den
Ansturm ab“).

**In der Kampfszene sichtbar** (`BattleScene.applyLooks`, nach jeder Runde): eine Farbschicht über
der Figur, dazu Haltung und Grösse.

| Wer | Zustand | Aussehen |
|---|---|---|
| Krummzahn | Wut | läuft rot an und bläht sich auf, kurz vor dem Wutanfall pulsierend |
| Höhlenauge | offen / geschlossen | glüht violett / dunkel und zusammengekniffen |
| Urmammut | Aufladen / Taumeln | glüht golden, bäumt sich auf, wirbelt Schnee auf / kippt nach vorn |
| Sumpfechse | abgetaucht | sinkt ab, nur noch ein dunkler Schatten |
| Lichkönig | Seelengefäss geladen | leuchtet grün, heller mit jeder Ladung |
| Ignaroth | in der Luft | steigt hoch, wird kleiner, von unten rot beschienen |
| Erzkönig | Panzerplatten / ungeschützt | grau und stumpf, je mehr Platten / glüht orange |
| Neferet | Fluch auf dem Helden | der Held schimmert türkis, kurz vor dem Ausbruch schnell pulsierend |
| Kaelthar | Ladungen | glüht gelb, kurz vor der Entladung flackernd |
| Xal'Zar | verschlingt / hält eine Fähigkeit | wird dunkel und grösser / flackert violett |
| jeder Boss | Fähigkeit diese Runde | pulsiert rot |
| Schildträger | Schild | Kuppel über dem Boss, er selbst glüht blau, bevor er ihn hebt |
| Heiler | Ritual | leuchtet mit jeder Runde stärker grün |
| Trommler | Wirbel | Noten steigen auf, je lauter, desto öfter |

**Statusbox rechts:** Sie zeigt den gewählten Gegner, also den Boss oder einen Begleiter, mit
Schwächen, Wirkungen und Absicht. In der Zielauswahl steht bei jedem Gegner mit Absicht eine Zeile
dazu. So sieht man auch dann, was der Boss vorhat, wenn man einen Begleiter angreift.

## 2. Abwehren

Neue Grundaktion für jeden Helden (`DEFEND`): kein Angriff, dafür **halber Schaden** in dieser Runde
(von Boss, Begleitern und Explosionen) und **+10 Mana**. Gift, Feuer und Bluten wirken normal.

Abwehren lohnt sich nur gegen grosse Treffer. Wer jede Boss-Fähigkeit abwehrt, auch einen Giftbiss
mit einfachem Schaden, verliert zu viel Zeit: In der Simulation sank die Siegquote des Champions an
der Sumpfechse dann von 87 % auf 21 %.

## 3. Bosse mit eigenem Ablauf

Alle Gebiets- und Dungeon-Bosse haben einen eigenen Ablauf. Die Dungeon-Bosse setzen ihre beiden
Fähigkeiten weiter im festen Takt ein (alle 3 Runden im Wechsel), ihr Ablauf kommt dazu.

### Goblinhäuptling Krummzahn: Wut

- Jeder direkte Treffer des Helden auf ihn staut 1 Wut. Gift, Feuer, Bluten und Treffer auf die
  Begleiter zählen nicht.
- Bei 4 Wut kündigt er den **Wutanfall** an: 4 Hiebe mit je 0,6-fachem Schaden. Danach ist die Wut leer.
- Gegenmittel: Abwehren (staut auch keine Wut), Bollwerk, Betäubung. Mehrfachtreffer wie
  Schwertwirbel stauen schneller Wut.

### Das Höhlenauge: offen und geschlossen

- Takt von 4 Runden: 2 Runden offen, 2 geschlossen. Beim Öffnen kommt der Lähmende Blick.
- **Offen** wirft es Fähigkeiten zurück, die es treffen: Der Held erleidet ihren vollen Schaden, das
  Auge nichts. Normale Angriffe treffen normal.
- **Geschlossen** erleidet es 25 % mehr Schaden.
- Gegenmittel: Fähigkeiten und Mana für die geschlossene Phase aufsparen.

### Urmammut Graufrost: Ansturm

- Nach 3 normalen Angriffen lädt er 1 Runde lang auf (greift nicht an), dann kommt der **Ansturm**
  mit 4-fachem Schaden.
- Nimmt er beim Aufladen 30 % seiner maximalen LP Schaden oder wird betäubt, bricht der Ansturm ab:
  Er taumelt eine Runde, greift nicht an und erleidet 30 % mehr Schaden.
- Gegenmittel: vorher verstärken (Kriegsschrei), im Aufladen den grossen Schlag zünden. Klassen mit
  Betäubung haben es leichter, oder abwehren bzw. Bollwerk.

### Uralte Sumpfechse: abtauchen

- Takt von 4 Runden: 2 normale Angriffe, dann taucht sie ab, dann der **Hinterhalt** (2-facher
  Schaden, 3 Runden Gift; vorher hiess die Fähigkeit Giftbiss und machte einfachen Schaden).
- Abgetaucht greift sie nicht an und ist nicht zu treffen, auch nicht mit Flächen-Fähigkeiten,
  Zusatzeffekten oder Betäubung. Das Wasser löscht ihr Feuer, Gift wirkt weiter.
- Gegenmittel: die Runde für die Sumpfkröte (Heiler) nutzen oder abwehren und Mana sammeln, den
  Hinterhalt abwehren bzw. mit Bollwerk blocken.

### Der Lichkönig: Seelengefäss

- Das Gefäss ist zu Beginn leer. Jeder gewöhnliche Begleiter (Skelettkrieger), der fällt, lädt es um
  1 auf, höchstens 3.
- Fällt der Lich mit geladenem Gefäss, steht er einmal wieder auf: 12 % seiner LP pro Ladung, ohne
  Gift, Feuer und Bluten. Danach ist das Gefäss zerbrochen.
- Gegenmittel: das Skelett nicht töten (oder es in Kauf nehmen). Flächen-Fähigkeiten wie der Meteor
  laden das Gefäss nebenbei auf. Der Lebensentzug kommt weiter alle 3 Runden.

### Uralter Drache Ignaroth: Flug

- Takt von 5 Runden: 2 Runden am Boden, 2 Runden in der Luft (greift normal an), dann landet er mit dem
  **Feueratem** (jetzt 2-fach statt 1,6-fach, dafür alle 5 statt alle 3 Runden).
- In der Luft machen direkte Treffer nur 50 % Schaden, ausser mit Bogen, Stab und Zepter. Gift, Feuer
  und Bluten wirken voll.
- Gegenmittel: Nahkämpfer sparen die Fähigkeiten für den Boden auf, schalten in der Luft den
  Dämonenwächter aus oder sammeln Mana. Fernkämpfer haben es leichter.

### Erzkönig Grimmbart: Panzerplatten

- Er beginnt mit 3 Platten. Mit Platten erleidet er von direkten Treffern nur 60 % Schaden. Jeder
  Treffer bricht eine Platte ab, Wucht (Streitkolben, Grosshammer, Schild) gleich zwei.
- Ohne Platten erleidet er 30 % mehr Schaden: ab dem Treffer, der die letzte bricht, und noch 2
  Runden. Dann wachsen alle Platten nach.
- Gift, Feuer und Bluten gehen unter den Platten durch und zählen nicht.
- Gegenmittel: Mehrfachtreffer und normale Angriffe brechen die Platten, die grossen Fähigkeiten
  gehören in die ungeschützten Runden.

### Hohepriesterin Neferet: Fluch

- Trifft ihr Fluch der Mumie (nicht geblockt), liegt ein Fluch auf dem Helden. Nach 2 Runden bricht er
  los: 25 % der LP des Helden, Rüstung hilft nicht.
- Gebrochen ist er, sobald sie seit dem Fluch 15 % ihrer LP verloren hat oder der Held sich läutert
  (Läuterung, Streitkolben).
- Bollwerk hilft nicht, Abwehren halbiert ihn. Er bricht auch los, wenn sie betäubt ist.
- Gegenmittel: in den beiden Runden voll auf sie gehen, sonst abwehren.

### Sturmfürst Kaelthar: Ladungen

- Jede Fähigkeit des Helden (auch Bollwerk oder Kriegsschrei) lädt ihn um 1 auf. Bei 3 Ladungen
  kündigt er die **Entladung** an: 3-facher Schaden, der Rüstung ignoriert. Danach ist er leer.
- Fällt die Entladung auf eine Runde seiner Fähigkeiten, geht die Entladung vor.
- Gegenmittel: Fähigkeiten gezielt einsetzen, die Entladung abwehren, blocken oder mit einer
  Betäubung verhindern (sie verpufft dann).

### Leerenfürst Xal'Zar: Verschlingen

- In Runde 2 verschlingt er statt anzugreifen die stärkste Schadens-Fähigkeit des Helden
  (Multiplikator × Treffer). Eine Betäubung verhindert es, dann versucht er es 3 Runden später wieder.
- Solange er sie hält, ist sie gesperrt, und seine normalen Angriffe werden zu Treffern mit ihr: 70 %
  ihrer Wucht, mindestens wie ein normaler Angriff, mit ihrer Trefferzahl.
- Wer ihm 20 % seiner LP nimmt, befreit sie. 3 Runden später verschlingt er wieder.
- Gegenmittel: nach dem Verschlingen voll auf ihn gehen, den Seelenfresser vielleicht kurz ignorieren.

## 4. Begleiter mit Fähigkeiten

Die Begleiter mit Aufgabe helfen nicht mehr passiv, sondern setzen Fähigkeiten ein. In der
Zielauswahl steht, was sie vorhaben (`addIntentText`), dringende Absichten rot.

| Rolle | Fähigkeit | Gegenmittel |
|---|---|---|
| 💚 Heiler | Heilritual: Nach 3 Runden heilt er den Boss um 20 %. Greift nie an. | Jeder Treffer auf ihn oder eine Betäubung unterbricht das Ritual, es beginnt von vorn. |
| 🛡️ Schildträger | Hebt jede 3. Runde einen Schild über den Boss, statt anzugreifen. Der Schild schluckt Treffer bis 15 % der Boss-LP. | Gift, Feuer und Bluten gehen durch. Betäubung verhindert den Schild. |
| 🥁 Trommler | Trommelt jede Runde lauter: +8 % Boss-Schaden pro Wirbel, bis ×5. Greift normal an. | Betäubung bringt ihn aus dem Takt (zurück auf 0), oder ihn ausschalten. |

Fortschritt: `BattleAdd.cast`. Schild: `BattleState.bossShield`. Neue Ereignisse: `defend`,
`reflected`, `charging`, `staggered`, `interrupted`, `bossShield`, `drumming`, `ritual`, `evaded`,
`submerged`, `platesBroken`, `platesRegrown`, `risen`, `cursed`, `curseBroken`, `curseBurst`,
`static`, `devoured`, `stolen`, `freed`; `absorbed`, `plated` und `grazed` an Treffern.

## 5. Abstimmung (Simulation)

Verglichen wurden zwei KIs auf Boss-Level (200 Kämpfe): **gierig** (wie der Balance-Test: Begleiter
mit Aufgabe zuerst, sonst die stärkste Fähigkeit) und **reagierend** (Bollwerk, Betäubung oder Abwehren
gegen grosse angekündigte Treffer, keine Fähigkeiten aufs offene Auge, beim Mammut vor dem Aufladen
verstärken und im Aufladen zuschlagen). Angaben: Siegquote mit seltener Ausrüstung und Heiltränken.

| Boss | Klasse | vorher | gierig | reagierend |
|---|---|---|---|---|
| Krummzahn | Champion | 99 % | 100 % | 100 % |
| Krummzahn | Paladin | 54 % | 59 % | 99 % |
| Höhlenauge | Champion | 88 % | 97 % | 100 % |
| Höhlenauge | Wächter | 97 % | 97 % | 100 % |
| Urmammut | Champion | 94 % | 88 % | 100 % |
| Urmammut | Wächter | 8 % | 12 % | 44 % |
| Urmammut | Paladin | 0 % | 0 % | 84 % |

Mit gewöhnlicher Ausrüstung und Tränken bleiben die Bosse schwer (Champion: Krummzahn 6 % gierig,
21 % reagierend; Mammut 10 % bzw. 9 %). Die Dungeon-Bosse ändern sich nur durch die Begleiter, und
das kaum. Der Erzkönig ist etwas leichter, weil der Trommler erst aufdrehen muss.

Was die Werte geformt hat:
- Mammut: Mit 2 Runden Aufladen und Schwelle 15 % war er viel zu leicht (gewöhnlich + Tränke 6 % →
  100 %). Der Richterstoss allein machte schon 25 % seiner LP. Jetzt 1 Runde und 30 %: Man muss
  verstärken und zünden.
- Höhlenauge: Mit +50 % im geschlossenen Zustand war es leichter als vorher. Jetzt +25 %, dafür
  wirft es den vollen Schaden zurück, sodass blindes Spiel weh tut.

### Die übrigen sieben Bosse

Vergleich mit dem Stand davor (nur Krummzahn, Höhlenauge und Urmammut mit Ablauf), 200 Kämpfe,
seltene Ausrüstung und Heiltränke, gierig / reagierend. Dungeon-Bosse als einzelner Kampf.

| Boss | Klasse | vorher | nachher |
|---|---|---|---|
| Sumpfechse | Champion | 87 / 93 % | 80 / 43 % |
| Sumpfechse | Wächter | 92 / 93 % | 80 / 100 % |
| Sumpfechse | Paladin | 0 / 0 % | 0 / 100 % |
| Sumpfechse | Magier | 8 / 8 % | 98 / 89 % |
| Lichkönig | Champion | 100 / 100 % | 100 / 100 % |
| Lichkönig | Magier | 94 / 94 % | 87 / 84 % |
| Ignaroth | Wächter | 100 / 100 % | 100 / 97 % |
| Ignaroth | Magier | 49 / 51 % | 89 / 57 % |
| Erzkönig | Wächter | 100 / 100 % | 100 / 100 % |
| Erzkönig | Paladin | 76 / 100 % | 68 / 100 % |
| Neferet | Wächter | 95 / 100 % | 95 / 97 % |
| Kaelthar | Champion | 99 / 100 % | 99 / 83 % |
| Kaelthar | Wächter | 100 / 100 % | 78 / 100 % |
| Xal'Zar | Champion | 100 / 100 % | 100 / 100 % |
| Xal'Zar | Wächter | 80 / 81 % | 91 / 100 % |

Die reagierende KI spielt einfache Regeln (grosse Treffer abwehren, in der Luft normal angreifen,
Platten mit Mehrfachtreffern brechen …). Wo sie schlechter abschneidet als die gierige, wehrt sie zu
oft ab: Abwehren kostet eine ganze Angriffsrunde und lohnt sich nur gegen sehr grosse Treffer.

Was die Werte geformt hat:
- Sumpfechse: Die verlorene Abtauch-Runde verlängert den Kampf um ein Viertel. Ohne Ausgleich sank der
  Champion auf 25 %. Jetzt hat sie weniger LP (Faktor 1,55 statt 1,7), dafür trifft der Hinterhalt
  hart. Der Balance-Test in `combat.test.ts` schlägt nicht mehr ins Wasser, sondern geht auf einen
  Begleiter oder wehrt ab.
- Lichkönig: Mit 1 Ladung von Beginn an und 15 % pro Ladung fiel der Magier von 94 % auf 1 %, weil der
  Meteor die Skelette nebenbei tötet. Jetzt startet das Gefäss leer, 12 % pro Ladung.
- Ignaroth: weniger LP (1,45 statt 1,6), weil Nahkämpfer in der Luft nur halb treffen.
- Erzkönig: Platten mit 50 % machten ihn mit gewöhnlicher Ausrüstung viel schwerer (Wächter 73 → 16 %).
  Jetzt 60 % und weniger LP (0,8 statt 0,9). Nur solo, der Koop hat einen eigenen LP-Faktor.
- Neferet: Ein Fluch mit 30 % und Bruch erst bei 20 % traf den Paladin hart (reagierend 65 → 3 %).
  Jetzt 25 % und Bruch bei 15 %.
- Kaelthar: Mit 4 Ladungen kam die Entladung in kurzen Kämpfen kaum. Jetzt 3.

## 6. Koop

Im Koop-Dungeon gilt dasselbe für die vier Dungeon-Bosse, mit ein paar Anpassungen an die Gruppe.
Raid-Bosse (Sumpfhydra, Frostriese, Weltenverschlinger) setzen ihre Fähigkeit weiter im festen Takt
ein, mit Ankündigung.

- **Abwehren:** `CoopAction.defend`. Wie solo halber Schaden in dieser Runde (vom Boss, von den
  Begleitern und vom Fluch) und +10 Mana.
- **Begleiter mit Aufgabe:** dieselben Fähigkeiten wie solo. Jeder Treffer eines Helden unterbricht
  das Heilritual.
- **Erzkönig:** 3 Panzerplatten **pro Held**. Mit 3 Platten für alle brach die Gruppe sie in der
  ersten Runde, und die Mine wurde zu dritt und zu viert deutlich leichter (gewöhnliche Ausrüstung
  53 → 79 %, 80 → 99 %).
- **Neferet:** Der Fluch der Mumie verflucht den Getroffenen mit der meisten Bedrohung. Bricht der Fluch
  los, **springt er auf einen anderen Helden über** und zählt neu herunter, bis die Gruppe ihr 15 %
  ihrer LP nimmt oder sich der Verfluchte läutert.
- **Kaelthar:** Jede Fähigkeit der Gruppe zählt, er braucht 4 Ladungen pro Held
  (`COOP_STATIC_PER_HERO`). Die Entladung trifft alle (wie eine Gruppen-Fähigkeit mit Faktor 0,75).
- **Xal'Zar:** verschlingt die stärkste Fähigkeit des Helden mit der meisten Bedrohung. Befreien kann
  sie die ganze Gruppe mit 20 % seiner LP. Die gestohlenen Treffer gehen wie normale Angriffe an ein
  Ziel nach Bedrohung.

Neue Koop-Ereignisse: `defend`, `interrupted`, `ritual`, `drumming`, `bossShield`, `platesBroken`,
`platesRegrown`, `cursed`, `curseBroken`, `curseBurst`, `static`, `devoured`, `stolen`, `freed`;
`absorbed` und `plated` an Treffern. Die alten passiven Rollen (Heiler 7 % pro Runde, Schild −50 %,
Trommler +40 %) sind entfernt.

**Simulation** (ganzer Dungeon, Gruppen aus Champion, Kleriker, Magier und Assassine, beste Zielwahl,
die KI wehrt nie ab), vorher → nachher:

| Dungeon | Ausrüstung | Duo | Trio | Vier |
|---|---|---|---|---|
| Verlassene Mine | gewöhnlich | 20 → 14 % | 53 → 45 % | 80 → 87 % |
| Versunkener Tempel | gewöhnlich | 2 → 1 % | 3 → 1 % | 1 → 0 % |
| Gewitterturm | gewöhnlich | 97 → 70 % | 100 → 93 % | 100 → 96 % |
| Abgrund der Leere | gewöhnlich | 9 → 34 % | 56 → 72 % | 94 → 95 % |
| alle | selten (Abgrund episch) | 96–100 % | 98–100 % | 95–100 % |

- Gewitterturm: Die Sim-KI setzt jede Runde Fähigkeiten ein, deshalb kommt die Entladung oft. Mit 3
  Ladungen pro Held fiel das Duo auf 64 %.
- Abgrund: leichter, weil die Gruppe das Heilritual des Seelenfressers ständig unterbricht. Für die
  vorgesehene epische Ausrüstung ändert sich nichts.

## Offen

- Neue Begleiter: Dieb, Bombenleger, Kettenwächter, Fluchwirker (ideen.md 31).
- Raid-Bosse mit eigenem Ablauf.
