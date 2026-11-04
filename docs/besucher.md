# Besucher im Dorf

Ab und zu kommt jemand ins Dorf, erzählt seine Geschichte und bittet um Hilfe (Idee #46 in `ideen.md`).
Es gibt zwei Arten von Besuchern: **feste Besucher** mit einer Geschichte, die zum Gebiet passt, und
**Durchreisende**, die nach Zeit kommen und nach einem Tag wieder weiterziehen.
Code: `src/domain/visitors.ts`, Store `gameStore.ts` (`visitors`), Oberfläche `src/components/VisitorDialog.tsx`.

Status: **Etappen 1–3 umgesetzt** (Spiellogik, Spielstand v20, Oberfläche). Kills im Koop zählen mit, weil sie dieselben
Quest-Ereignisse auslösen. Nach dem Merge Edge Functions deployen (`npm run functions:deploy`): Der Tausch-Server muss die
Unikate kennen.

## Entschiedene Regeln

| Thema | Entscheidung |
|---|---|
| Ankunft | Gemischt: feste Besucher kommen zu Level-Meilensteinen, Durchreisende nach Zeit |
| Aufenthalt | Feste Besucher bleiben, bis ihre Geschichte erledigt ist. Durchreisende ziehen nach 24 Stunden weiter |
| Entscheidungen | Nur bei wenigen festen Besuchern (2 von 6) |
| Belohnungen | Von allem etwas: ein Rezept, ein besonderer Begleiter oder ein Unikat (Ausrüstung). Essen gibt es immer als Rezept |

## Ablauf

1. Ein Besucher steht am Dorfeingang, über ihm ein ❗. Auf der Dorfseite erscheint ein Hinweis.
2. Klick auf den Besucher: Er erzählt seine Geschichte (Porträt und ein paar Sätze), dann **Annehmen** oder **Ablehnen**.
3. Die Quest erscheint im Questbuch unter „Besucher“. Fortschritt zählt wie bei den anderen Quests.
4. Ist ein Kapitel geschafft, geht man zum Besucher zurück. Er erzählt weiter und gibt das nächste Kapitel.
5. Im letzten Kapitel gibt es bei manchen Besuchern eine **Entscheidung**. Danach kommt die Belohnung und der Besucher geht.

## Feste Besucher

- Einer pro Gebiet, er kommt, sobald das Gebiet offen ist (Level 1, 11, 21, 31, 41, 51).
- Es ist immer nur **ein** fester Besucher da. Der nächste kommt erst, wenn der vorige fertig ist
  und das Level reicht. So ergibt sich eine Geschichte, die durch das ganze Spiel führt.
- Er bleibt, bis seine Geschichte erledigt ist. Ablehnen schiebt ihn nur auf: Er wartet weiter am Eingang.
- Drei Kapitel, jedes ein Ziel aus dem Questbuch (Kills, Boss, Dungeon, Elite) oder ein **Quest-Gegenstand**.

| Gebiet | Besucher | Geschichte | Entscheidung | Belohnung |
|---|---|---|---|---|
| Düsterwald | **Bram**, verwundeter Söldner | Krummzahns Goblins haben seine Truppe zerschlagen. Erst die Plünderer vertreiben, dann das Banner der Truppe zurückholen, das Krummzahn als Trophäe trägt. | – | Bram als **Begleiter** (fester Name, zwei Traits) |
| Nebelsümpfe | **Mirla**, Kräuterfrau | Sie braucht Moorlilien und Schlangengift für ein altes Rezept ihrer Grossmutter. | – | **Rezept:** „Moorlilien-Eintopf“ in der Taverne |
| Kristallhöhlen | **Torbin**, Zwergenprospektor | Seine Spitzhacke und sein Bruder sind in den Höhlen verschollen. Er findet den Bruder nicht, nur dessen Hacke. | – | **Unikat:** „Torbins Kristallhacke“ (Axt, Runenklinge) |
| Frostgipfel | **Yrla**, Jägerin | Sie jagt das Tier, das ihr Dorf verwüstet hat: Erst die Spur aufnehmen, dann Frosttrolle befragen, dann Graufrost stellen. | – | **Rezept:** „Jägerbraten“ in der Taverne |
| Schattenruinen | **Die Fremde** | Sie will Seelensplitter aus den Ruinen. Im letzten Kapitel zeigt sich: Sie ist Nekromantin. | Splitter übergeben **oder** verweigern | Übergeben: Unikat „Seelenfänger“ (Zepter). Verweigern: viel Gold, EP und ein Item mit Boss-Chancen |
| Drachenhort | **Aldric**, alter Drachentöter | Er will Ignaroth ein letztes Mal sehen. Man bringt ihm Drachenschuppen und besiegt den Drachen. | Ihn mitnehmen **oder** ihm die Lanze abnehmen | Begleiter Aldric **oder** Unikat „Aldrics Drachentöter“ (Zweihandschwert) |

Später möglich: Bei der Fremden führt „verweigern“ zu einem Kampf gegen sie. Dafür braucht es einen neuen Gegner.

## Durchreisende

- Kommen **12 bis 36 Stunden** nachdem der letzte gegangen ist und bleiben **24 Stunden**.
  Ob man die Quest angenommen hat oder nicht: Nach 24 Stunden ziehen sie weiter, unerledigte Quests verfallen.
- Ein Kapitel, ausgewürfelt nach dem Level wie die Tagesaufträge (eine Kreatur aus einem offenen Gebiet).
  Meistens ein Quest-Gegenstand.
- Belohnung: EP, Gold und **eines** aus Rezept, Tränken, Baumaterial, Item oder Gold.

| Besucher | Bitte | Belohnung |
|---|---|---|
| Fahrender Koch | Fleisch von {Kreatur} | Rezept für ein besonderes Gericht (Königsbrühe, Gewürzpastete oder Honigkuchen) |
| Wanderprediger | Reliquie, die ein {Kreatur} gestohlen hat | EP und ein Item |
| Alchemistenlehrling | Drüsen von {Kreatur} für Experimente | 3 Wurf- oder Verstärkungstränke |
| Baumeister auf Reisen | {Kreatur} vertreiben, die seinen Wagen überfallen haben | Baumaterial des Gebiets |
| Spielmann | Ein Lied über den Sieg gegen {Boss} | viel Gold |
| Kartograf | Einen Dungeon erkunden | Item mit besseren Chancen |

## Quest-Gegenstände

- Neues Ziel `fetch`: „Bringe 3 Moorlilien“. Jeder Sieg gegen die genannte Kreatur lässt den
  Gegenstand mit einer Chance fallen (normal 40 %, Elite 100 %, Boss immer).
- Quest-Gegenstände liegen nicht im Inventar. Sie zählen nur als Fortschritt der Quest, wie die Kills.
- Fällt einer, sagt es die Siegmeldung: „Quest-Gegenstand: 🌱 Moorlilie (2/4)“ – auch im Dungeon, im Turm und beim Koop-Ergebnis.
- Später möglich: eine eigene Tür in den Dungeon-Wegen („Verschüttete Kammer“), hinter der ein
  Quest-Gegenstand liegt.

## Belohnungen

| Art | Wie |
|---|---|
| Rezept | Schaltet ein neues Gericht in der Taverne dauerhaft frei (ab der Schankstube). Kennt man es schon, gibt es stattdessen doppelte EP |
| Begleiter | Fester Name und zwei Traits, legendär bzw. episch. Er belegt keinen Platz in der Taverne. Ohne Taverne wartet er, bis sie gebaut ist |
| Unikat | Eigenes Item mit festem Namen und festem Effekt, wie ein Boss-Item. Level = Gebiet des Besuchers |

## Zahlen

| Was | Wert |
|---|---|
| Ankunft der festen Besucher | Bram Lv. 3, Mirla 12, Torbin 22, Yrla 32, Die Fremde 42, Aldric 52 |
| Durchreisende | ab Level 5, bleiben 24 Std, der nächste 12–36 Std später. Wegschicken = er geht sofort |
| Quest-Gegenstand | 40 % pro Sieg, Elite und Boss immer |
| EP und Gold pro Kapitel | 1,5× so viel wie eine Questbuch-Quest gleichen Umfangs. Verweigern bei der Fremden: doppelt |
| Unikate | legendär, Werte wie ein Boss-Item gleichen Levels, fester Effekt, nicht tauschbar. Torbin Lv. 30 (Runenklinge), Seelenfänger Lv. 50 (Seelenraub), Drachentöter Lv. 60 (Drachenfeuer) |
| Rezepte | Moorlilien-Eintopf +15 % LP/+30 % Mana/+10 % Rüstung (Grundpreis 30). Für 50: Jägerbraten +20 % Schaden/LP, Königsbrühe +25 % LP/Rüstung, Gewürzpastete +15 % Schaden/+8 % Krit, Honigkuchen +40 % Gold/+15 % LP/Mana |
| Bekanntes Rezept | doppelte EP für die Quest |
| Begleiter | Bram: Kampferprobt (legendär), Glückspilz (episch). Aldric: Lehrmeister und Plünderer (legendär). Starten 2 Level unter dem Helden |

## Etappen

1. ✅ Domain `visitors.ts` mit Tests: feste Besucher, Durchreisende, Ziel `fetch`, Belohnungen
2. ✅ Store (Spielstand v20, v21: Vorrat wird zu Rezepten) und Quest-Ereignisse
3. ✅ Oberfläche: Besucher im Dorfbild (❗ neu, ❓ erfüllt), Gespräch, laufende Quests im Questbuch und im Kampf, Rezepte in der Taverne, Abzeichen am Dorf-Tab, Quest-Gegenstände in der Siegmeldung
4. 💡 Erfolge („Hilfsbereit“: 6 feste Besucher), Entscheidungen mit Kampf
