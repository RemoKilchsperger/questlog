# Neue Dorfgebäude – Konzepte

Entwurf für weitere Gebäude im Dorf. Nur Konzept, noch kein Code. Grundlage sind `village.ts`, `raids.ts`,
`companions.ts`, `forge.ts`, `potions.ts`, docs/dorf-ausbau.md (inkl. Gold-Balancing aus Commit 217f3af),
docs/besucher.md, docs/ueberfaelle.md und die offenen Ideen in docs/ideen.md.

Status: **💡 Entwurf** (2026-11-11). Alle Zahlen sind Startwerte für Simulation und Playtest.

## Kurzübersicht

| # | Gebäude | Icon | Kern in einem Satz | Ab etwa | Ökonomie | Ideen | Aufwand | Erste Welle |
|---|---|---|---|---|---|---|---|---|
| 1 | **Trophäenhalle** | 🏆 | Besiegte Bosse und seltene Gegner als Trophäen aufhängen, jede mit kleinem Dauer-Bonus | Lv. 10 | Senke (einmalig pro Trophäe, wächst bis ins Endgame) | #73 | mittel | ✅ **ja** |
| 2 | **Kräutergarten** | 🌿 | Beete in Echtzeit, Kräuter für neue Tränke (Gegengift, Manatrank, Phönixtrank) | Lv. 11 | Senke (Saatgut, laufend), füllt die Lücke Lv. 10–21 | #53, #35 | mittel | ✅ **ja** |
| 3 | **Rüstkammer** | 🛡️ | Ausrüstungs-Sets speichern und per Klick wechseln, später Aussehen übertragen | Lv. 8 | Senke (Transmog, endlos und rein kosmetisch) | #43 | klein → mittel | ✅ **ja** |
| 4 | **Juwelier** | 💍 | Sockel bohren, Edelsteine aus Gebietsmaterial schleifen | Lv. 15 | grosse Senke für Gold, Essenz und **altes Material** | #40 | gross (Server, Tausch) | nächste Welle |
| 5 | **Kartografenstube** | 🗺️ | Kartenfragmente zu Schatzkarten, Wochen-Verträge für Dungeons (Risiko gegen Beute) | Lv. 12 | Senke (Verträge) + kontrollierte Quelle | #11, #51, #70 | mittel | später |
| 6 | **Bibliothek** | 📚 | Bestiarium mit Wissensstufen pro Gegner, Forschung gegen Elite-Modifikatoren | Lv. 5 | Senke (Studium, laufend) | #9, #57 | mittel | später |
| 7 | **Ahnenschrein** | 🕯️ | Opfer gegen Truhenverlust, Segnung vor dem Dungeon, später Flüche lösen | Lv. 15 | Senke pro Lauf (Versicherung) | #56 | klein → mittel | später |
| 8 | **Stallungen** | 🐴 | Mehr Missionen, Expeditionen mit besonderer Beute, Begleiter schneller zurück | Lv. 12 | Quelle (gedeckelt) + Senke (Proviant) | Begleiter „offen“ | klein → mittel | später |
| 9 | **Arena** | 🏟️ | Tägliche Prüfungen mit festem Startwert, Wertung S–C, Ehrenmarken für Kosmetik | Lv. 10 | neutral (eigene Währung), kleine Gold-Senke | #67, #68, #59 | mittel → gross | später |

Bewusst **nicht** vorgeschlagen (siehe „Verworfen“ am Ende): Lagerhaus, Bank mit Zinsen, Marktplatz mit Steuern,
Materialtausch nach oben, eigene Kaserne für mitkämpfende Begleiter.

## Ausgangslage

### Was das Dorf heute hat

8 Gebäude (`BuildingId` in `village.ts`): Händler, Schmiede, Anschlagtafel (1 Stufe), Alchemist, Taverne,
Trainingsplatz, Statue, Wehranlage. Kosten 100 / 1'000 / 5'000 Gold plus Material des passenden Gebiets, gebaut
wird sofort. Zusammen kostet das ganze Dorf **42'850 Gold**.

### Gold nach dem neuen Balancing

Aus docs/dorf-ausbau.md, Abschnitt „Gold-Balancing“:

| Level | Gold pro Kampf | 1'000 Gold sind … |
|---|---|---|
| 10 | ~14 | ~70 Kämpfe |
| 30 | ~40 | ~25 Kämpfe |
| 60 | ~82 | ~12 Kämpfe |

Bis Level 60 kommen ~83'000 Gold aus Kämpfen zusammen, dazu Quests, Missionen (~700 Gold/Tag auf Lv. 30)
und Überfälle. Die wiederkehrenden Senken sind heute Tränke (Lv. 30: Heiltrank 110), Verbessern (Lv. 30
bis +5: 990 pro Item), Gerichte, Anwerben, Zurücksetzen und Flucht. Offen im Plan: **eine Senke zwischen Level 10
und 21** und was **nach Level 60** mit dem Gold passiert.

### Material

1 pro Sieg (Elite 3, Boss 5, Dungeon doppelt), nur des eigenen Gebiets. Grob geschätzt sammelt man pro
Gebiet 200–300 Einheiten, das Dorf braucht davon pro Material nur etwa 60–100. **Altes Material häuft sich an
und hat keinen Zweck.** Es lässt sich bewusst nicht verkaufen.

### Was daraus folgt

1. **Wiederkehrende, mit dem Level wachsende Senken** sind besser als hohe Baukosten (gleiche Logik wie beim
   Verbessern: `k · (3 + Level)`). Alle Laufkosten unten nutzen diese Form, dann bleiben sie auf jedem Level
   gleich viele Kämpfe wert.
2. **Endgame-Senken ohne Machtzuwachs** (Kosmetik, Sammeln) lösen das Gold-Problem nach Level 60, ohne die
   Balance zu verbiegen.
3. **Altes Material braucht einen Abnehmer** (Juwelier, Trophäen, Proviant).
4. **Neue Quellen nur mit Deckel** (pro Tag, pro Woche oder an knappe Ereignisse gebunden).

## Gemeinsame Voraussetzungen (für jedes neue Gebäude)

Gilt unabhängig davon, welches Gebäude zuerst kommt. Einmal sauber lösen, dann sind alle weiteren billig.

| Thema | Heute | Vorschlag |
|---|---|---|
| **Typ und Spielstand** | `BuildingId`-Union, `EMPTY_VILLAGE`, `Village = Record<BuildingId, BuildingTier>` | Neue Ids ergänzen, Spielstand **v24**: `migrateSave` setzt fehlende Schlüssel auf 0 (Test: alter Stand v23 behält alle Stufen, neue Gebäude 0). Gebäude-eigene Daten (Trophäen, Beete, Sets) als eigene Felder neben `village` |
| **Freischaltung** | Keine Level-Sperre, die Material-Stufen regeln das | Neues optionales Feld `requires` in `BuildingDef` (z. B. Juwelier braucht Schmiede 2, Kräutergarten Alchemist 1). Material bleibt die Hauptsperre |
| **Dorfbild** | 300 px breit, 7 Plätze vorne + Wehranlage hinten (`VILLAGE_SLOTS`), voll | Variante A: Dorfbild breiter und horizontal scrollbar. Variante B: zweite Reihe auf dem Hügel (kleinere Sprites). Variante C: „Oberdorf“ als zweite Ansicht. **Empfehlung A**, weil die Bau-Animation und die 🔨-Hinweise gleich bleiben. `paintVillage` rechnet mit der Stufen-Summe 0–21, die Schwellen müssen mitwachsen (relativ statt absolut) |
| **Erfolge** | „Dorfgründer“ und „Baumeister“ zählen `BUILDINGS.length` | Auf die 8 Kerngebäude festschreiben (sonst wird ein erreichter Erfolg in der Beschreibung plötzlich „unvollständig“). Für neue Gebäude ein eigener Erfolg „Stadtbaumeister“ |
| **Überfälle** | `damageable`: Gebäude ab Stufe 2, nicht Wehranlage | Neue Gebäude können beschädigt werden, „eine Stufe tiefer“ ist pro Gebäude unten definiert. `RAID_MIN_BUILDINGS` bleibt bei 3 |
| **Koop** | Dorf wirkt nicht im Koop, ausser das Gericht (`meal` im Cloud-Spielstand) | Bleibt die Regel. Ausnahmen nur, wo der Effekt am **Item** hängt (Juwelier) oder rein kosmetisch ist (Transmog). Beides liest der Server aus dem Cloud-Spielstand |
| **Hilfe und Doku** | – | Pro Gebäude README „Dorf“, docs/dorf-ausbau.md, `HelpScreen.tsx`, Status in docs/ideen.md |

---

## 1. 🏆 Trophäenhalle

**Stimmung:** Eine dunkle Holzhalle, an den Wänden Krummzahns zerfetztes Banner, das ausgestopfte Höhlenauge,
eine Schuppe von Ignaroth. Heroische Trophäen hängen in goldenen Rahmen. Wer reinkommt, sieht auf einen Blick,
was der Held geschafft hat.

**Kern:** Jeder erstmals besiegte Boss und jeder seltene Gegner hinterlässt eine Trophäe. Trophäen muss man
**präparieren** (einmalig Gold und Material), dann kann man sie an einen der wenigen **Wandplätze** hängen.
Jede Trophäe gibt einen kleinen, eigenen Dauer-Bonus. Die Plätze sind knapp, man wählt also aus.

**Anbindung:** Trophäen ergeben sich aus bestehenden Rekorden (`records.bossesDefeated`, `heroicDefeated`,
`raresDefeated`, `coopStats.bosses`). Alte Spielstände bekommen ihre Trophäen also **rückwirkend**, ohne
Migration der Rekorde.

### Stufen

| Stufe | Name | Wirkung | Kosten |
|---|---|---|---|
| 1 | Jagdstube | 2 Wandplätze, Gebietsbosse und seltene Gegner präparierbar | 250 G, 20 Düsterholz, 10 Lehm |
| 2 | Trophäenhalle | 4 Wandplätze, dazu Dungeon- und Raid-Bosse | 2'000 G, 25 Kristallsplitter, 15 Lehm |
| 3 | Ruhmeshalle | 6 Wandplätze, heroische Trophäen im Goldrahmen (Wirkung × 1,5) | 8'000 G, 30 Drachenerz, 20 Obsidian |

Freischaltung: nach dem ersten Gebietsboss (Krummzahn, Lv. 10).

### Trophäen und Wirkung

Jede Trophäe hat eine **eigene** Wirkung, gleiche Wirkungen gibt es nicht doppelt. Seltene Gegner geben
„kleine Trophäen“ mit halber Wirkung, sie füllen Plätze, wenn man noch wenige Bosse hat.

| Trophäe | Wirkung | Idee dahinter |
|---|---|---|
| Krummzahns Banner | +4 % Gold aus Kämpfen | erster Boss, nützlich für Neue |
| Schuppe der Sumpfechse | −15 % Giftschaden gegen dich | Gegenmittel-Denken |
| Linse des Höhlenauges | +3 % kritische Trefferchance | |
| Stosszahn von Graufrost | +5 % Schaden gegen Bosse | |
| Krone des Lichkönigs | +8 % Heilung durch Tränke | |
| Ignaroths Schuppe | −15 % Feuerschaden gegen dich | |
| Grimmbarts Erzplatte | +4 % Rüstung | Dungeon-Boss |
| Neferets Kopfschmuck | Flüche zählen eine Runde langsamer herunter | trifft genau ihre Mechanik |
| Kaelthars Sturmkern | +6 Mana zu Kampfbeginn | |
| Xal'Zars Leerenauge | +5 % Schaden gegen Elite-Gegner | |
| Kopf der Sumpfhydra / Hrimgars Horn / Splitter des Verschlingers | je +3 % LP, +3 % Rüstung, +3 % Schaden | Raid-Bosse, je eine Wirkung |
| Seltene Gegner (24) | halbe Wirkung, z. B. „Silberpelz: +2 % Gold“ | Sammlung |

Summe im besten Fall (6 Plätze, alles heroisch): etwa so viel wie ein gutes Gericht, aber dauerhaft und nur in
Teilen kampfwirksam. Grenze: Kein Bonus auf XP (dafür ist die Statue da) und keiner über +8 % pro Trophäe.

### Kosten fürs Präparieren

- Boss: `20 · (3 + Boss-Level)` Gold + 10 Material seines Gebiets. Krummzahn 260 G, Neferet 600 G, Ignaroth 1'260 G.
- Heroisch (eigene Trophäe, eigener Goldrahmen): das 1,5-Fache.
- Seltener Gegner: `5 · (3 + Level)` Gold + 3 Material.
- Umhängen zwischen den Plätzen ist kostenlos, präpariert ist präpariert.

Über alles (13 Bosse, 10 heroische, 24 seltene) rund **27'000 Gold**, verteilt bis weit ins Endgame.

### Solo und Koop

Wirkt nur im Solo-Kampf (Gebiet, Dungeon, Turm, Überfall), wie Statue und Alchemist. Im Turm hebt der Bonus die
Wochen-Rangliste leicht an. Das ist vertretbar, Ausrüstung wirkt genauso.

### Überfall

Beschädigt: die Wirkung der Trophäen halbiert sich, bis repariert.

### Ökonomie

Reine Senke, einmalig pro Trophäe. Weil neue Trophäen mit dem Fortschritt kommen, ist es eine gleichmässige
Senke über das ganze Spiel. Die heroischen Trophäen geben Level-60-Spielern ein Ziel für Gold.

### Risiken

- Bonus-Summe auf Schaden darf nicht ausufern: Wirkungen bewusst verschieden halten, in `combat.test.ts` einmal
  mit 6 starken Trophäen simulieren (Ziel: Siegquote Lv. 30 selten höchstens +3 Prozentpunkte).
- „Pflicht-Trophäen“ vermeiden: Keine Trophäe soll in allen Builds die beste sein. Die Resistenzen (Gift, Feuer)
  sind absichtlich situativ.

### Aufwand

- **Daten:** `trophies.ts` (Liste aus Rekorden ableiten, Wirkung als Profil-Modifikator wie `withMeal`), Tests.
- **Store:** `trophies: { prepared: string[]; mounted: string[] }`, Migration v24.
- **UI:** Wand mit Plätzen, Trophäen-Liste. Bilder: die vorhandenen Gegner-PNGs verkleinert im Holzrahmen,
  also kaum neue Grafik.
- **Phaser:** keine. **Supabase:** keine (optional später im öffentlichen Profil, dann explizit in `publicProfile.ts`).

---

## 2. 🌿 Kräutergarten

**Stimmung:** Ein umzäunter Garten neben der Kräuterhütte, Vogelscheuche, ein Bienenstock, später ein kleines
Glashaus. Mirla aus den Nebelsümpfen hat ihn angeregt.

**Kern:** Beete wachsen in **Echtzeit** (wie die Missionen, auch wenn das Spiel zu ist). Man kauft Saatgut, pflanzt,
erntet Kräuter. Beim Alchemisten braut man daraus **Tränke, die man nicht kaufen kann**. So kommen Gegengift und
Manatrank (Idee #35) ins Spiel, ohne den Kauf von Heiltränken als Gold-Senke zu untergraben.

### Stufen

| Stufe | Name | Wirkung | Kosten |
|---|---|---|---|
| 1 | Kräuterbeet | 2 Beete, Heilkraut und Mondblume | 200 G, 25 Lehm |
| 2 | Kräutergarten | 4 Beete, dazu Feuerwurz, seltene Samen pflanzbar | 1'500 G, 25 Kristallsplitter, 10 Lehm |
| 3 | Glashaus | 6 Beete, alles wächst 25 % schneller, 4 statt 3 Kräuter pro Ernte | 6'000 G, 30 Obsidian, 15 Hartholz |

Freischaltung: Alchemist mindestens Stufe 1. Stufe 1 kostet Lehm, liegt also genau in der **Lücke Lv. 11–20**.

### Saat, Ernte, Brauen

| Saat | Wächst | Saatpreis (Grundpreis × `1 + (L − 1)/20`) | Ernte |
|---|---|---|---|
| Heilkraut | 4 Std. | 20 | 3 Heilkraut |
| Mondblume | 8 Std. | 30 | 3 Mondblüten |
| Feuerwurz | 8 Std. | 30 | 3 Feuerwurz |
| Phönixfarn (selten) | 24 Std. | – (nur als Beute) | 1 Phönixfeder |

| Trank (beim Alchemisten) | Zutaten | Wirkung | Solo / Koop |
|---|---|---|---|
| Gegengift | 2 Heilkraut | reinigt Gift, Feuer und Bluten, 2 Runden immun dagegen, **bricht Neferets Fluch** | beide |
| Manatrank | 2 Mondblüten | +50 % des maximalen Manas sofort | beide |
| Feuerwurz-Öl | 2 Feuerwurz | nächste 3 Angriffe setzen in Brand (wie Brandflasche, 15 %) | beide |
| Phönixtrank | 1 Phönixfeder, 2 Heilkraut | fällt man, steht man einmal mit 30 % LP auf. Höchstens 1 im Vorrat | nur Gebiet, Dungeon, Überfall – **nicht Turm** (Rangliste), nicht Koop (dort gibt es Wiederbeleben) |

Alle zählen als Trank der Runde (Limit „ein Trank pro Runde“, jede Sorte einmal pro Kampf).

**Seltene Samen** fallen nicht im normalen Kampf, sondern nur: 25 % bei seltenen Gegnern, als Belohnung des
Durchreisenden „Alchemistenlehrling“, im Schatzraum (neben Rezept und Item) und auf Expeditionen der
Stallungen. So bleiben Phönixtränke etwas Besonderes.

### Anbindung

- **Bosse:** Gegengift ist ein lesbares Gegenmittel gegen Neferet, Sumpfechse und Hydra-Gift, Manatrank
  gegen Kaelthar (Fähigkeiten-Rotation), Feuerwurz-Öl hilft beim Ausbrennen der Hydra-Stümpfe.
- **Skills:** Plage-Pfad (Gift-Stapel) und Arkan-Pfad (Schmelzen) bekommen ein Werkzeug.
- **Besucher:** Mirla kann künftig eine Samen-Belohnung statt nur ein Rezept geben.

### Ökonomie

Laufende Senke: 6 Beete × ~2 Ernten/Tag × Saatpreis. Lv. 30: höchstens ~700 Gold am Tag, realistisch die
Hälfte. Keine Konkurrenz zu Heiltränken, weil es nur neue Sorten gibt.

### Risiken

- **Gegengift entwertet Boss-Mechaniken:** Neferets Fluch soll ein Gegenmittel haben (Absicht ist „ankündigen,
  kontern, belohnen“), aber nicht trivial werden. Vorschlag: Gegengift bricht den Fluch nur, solange er noch
  ≥ 2 Runden hat. Im Simulationstest Neferet mit und ohne Gegengift vergleichen.
- **Manatrank und Kaelthar:** Mehr Fähigkeiten = mehr Ladungen für ihn. Das ist eher ein schöner Zielkonflikt.
- **Echtzeit-Druck:** keine verwelkenden Pflanzen. Reifes bleibt liegen, bis man erntet.

### Überfall

Beschädigt: eine Stufe tiefer (weniger Beete). Was in den gesperrten Beeten wächst, wartet.

### Aufwand

- **Daten:** `garden.ts` (Beete, Wachstum, Ernte, Rezepte), neue `PotionDef`-Arten in `potions.ts`; neue Effekte
  in `combat.ts` **und** `coopCombat.ts` (Reinigen, Mana, Waffenöl, Aufstehen) mit eigenen `BattleEvent`s.
- **Store:** `garden: { beds: { seed, plantedAt }[] }`, `herbs`, Migration v24.
- **Server:** Koop nutzt die neuen Tränke → `npm run functions:build`, Deploy nötig.
- **Phaser:** Animationen für Reinigen, Mana, Aufstehen.
- **UI:** Garten im Dorfbild (wachsende Pflanzen als Pixel), Garten-Popup, Tab „Brauen“ beim Alchemisten.

---

## 3. 🛡️ Rüstkammer

**Stimmung:** Ein Gewölbe mit Waffenständern und Rüstungspuppen, auf denen die gespeicherten Sets hängen.
Ganz hinten ein Spiegel und ein Schneider.

**Kern:** Schwächen und Resistenzen sollen zum Waffenwechsel zwingen. Heute heisst das: viele Klicks. Die
Rüstkammer speichert **Ausrüstungs-Sets** (Idee #43) und wechselt sie per Klick. Auf Stufe 3 überträgt sie das
**Aussehen** eines Items auf ein anderes, eine endlose, rein kosmetische Gold-Senke.

### Stufen

| Stufe | Name | Wirkung | Kosten |
|---|---|---|---|
| 1 | Waffenständer | 2 Sets (7 Plätze) speichern und wechseln | 150 G, 20 Düsterholz |
| 2 | Rüstkammer | 4 Sets, ein Set kann eine Skill-Verteilung mitnehmen | 2'000 G, 25 Hartholz, 10 Kristallsplitter |
| 3 | Zeugmeisterei | Aussehen übertragen (Transmog), 6 Sets | 8'000 G, 30 Drachenerz, 15 Obsidian |

Freischaltung: sofort (Stufe 1 ist billig und hilft schon früh beim Wechsel zwischen Klingen und Wucht).

### Regeln

- **Sets** speichern nur Verweise (`uid`) auf Items. Fehlt ein Item (verkauft, zerlegt, beim Begleiter), bleibt der
  Platz leer und das Set zeigt einen Hinweis. Kein Item wird doppelt belegt.
- Wechseln geht dort, wo man heute die Ausrüstung ändern darf, nicht mitten im Kampf.
- **Skill-Verteilung im Set (Stufe 2):** Wechseln kostet 25 % der Rücksetzkosten des Trainingsplatzes, mit Kampfschule
  nichts. Attribute bleiben fest, sonst verliert die Attributwahl ihr Gewicht.
- **Transmog (Stufe 3):** Aussehen aller Items, die man je besessen hat (neues Feld `seenLooks`, alte Stände
  starten mit Inventar, Ausrüstung und `bossCollection`). Kosten: `5 · (3 + Item-Level des Aussehens) ·
  Seltenheitsfaktor`. Ein legendäres Lv.-60-Aussehen kostet 2'520 Gold. Zurücksetzen auf das Original ist
  kostenlos. Zählt nur fürs Bild, nie für Werte oder Klassen.

### Anbindung

Matchups (Waffe zählt), Klassen (Rüstungsklasse + Waffe), Skilltree, Begleiter (Set-Items, die ein Begleiter trägt,
werden angezeigt), öffentliches Profil und Koop-Bild (Transmog sichtbar).

### Ökonomie

Stufen 1–2: kaum Senke, viel Komfort. Stufe 3: die wichtigste **Endgame-Senke ohne Machtzuwachs**.

### Risiken

- Sets mit Skills machen den Trainingsplatz billiger: darum der 25-%-Preis.
- Transmog im Koop und Profil: der Server muss die Aussehen-Ids prüfen (nur bekannte Item-Ids, nur Items aus
  `seenLooks`), wie heute `sanitizeLooks`.

### Überfall

Beschädigt: eine Stufe tiefer (Sets über der Grenze sind gesperrt, nicht gelöscht; Transmog bleibt sichtbar, neues
geht nicht).

### Aufwand

- **Daten:** `armory.ts` (Set anlegen, anwenden, prüfen), Tests mit fehlenden Items.
- **Store:** `gearSets`, `seenLooks`, `transmog` pro Item (`OwnedItem.look?`), Migration v24.
- **UI:** Sets in der Ausrüstung und im Kampf-Vorbereitungsbildschirm, Rüstkammer-Popup.
- **Phaser:** Sprites lesen `look ?? itemId`. **Supabase:** keine Tabelle; Koop-Server und `publicProfile.ts` lesen
  `look` (functions:build).

---

## 4. 💍 Juwelier

**Stimmung:** Torbins Bruder ist doch nicht verschollen: Er hat sich im Dorf als Steinschleifer niedergelassen.
Lupe, Schleifrad, Kristallstaub.

**Kern:** Items bekommen **Sockel**, in die man **Edelsteine** setzt (Idee #40). Jeder Stein entsteht aus dem
Material eines Gebiets. Damit hat altes Material endlich einen Zweck, und Essenz eine zweite Verwendung.

### Stufen

| Stufe | Name | Wirkung | Kosten |
|---|---|---|---|
| 1 | Schleiferei | Steine Stufe I schleifen, Sockel in **Waffen** bohren | 400 G, 25 Lehm, 10 Düsterholz |
| 2 | Juwelier | Steine Stufe II, Sockel auch in **Rüstung**, Ausfassen | 2'500 G, 30 Hartholz, 15 Kristallsplitter |
| 3 | Edelsteinmeister | Steine Stufe III, legendäre und Boss-**Waffen** bekommen einen zweiten Sockel | 10'000 G, 40 Drachenerz, 20 Obsidian |

Freischaltung: Schmiede mindestens Stufe 2.

### Steine

| Stein | Aus | Sockel | I / II / III |
|---|---|---|---|
| Waldjade | Düsterholz | Rüstung | +2 / +3 / +4 % maximale LP |
| Moorachat | Lehm | Rüstung | −5 / −10 / −15 % Schaden durch Gift, Feuer, Bluten |
| Kristallauge | Kristallsplitter | Rüstung | +4 / +8 / +12 Mana |
| Frostbernstein | Hartholz | Rüstung | +2 / +3 / +4 % Rüstung |
| Schattenonyx | Obsidian | Waffe | +1 / +1,5 / +2 % Krit |
| Drachenrubin | Drachenerz | Waffe | +2 / +3 / +4 % Schaden |

**Deckel:** Höchstens 3 Steine derselben Art wirken, der Rest zeigt „wirkungslos“. Damit liegt jede Wirkung bei
höchstens +12 % und man mischt (Build-Vielfalt statt eines besten Steins).

### Kosten

Mit `G = 3 + Level des Helden`, `E = 1 + Level/10`:

| Was | Kosten | Lv. 30 | Lv. 60 |
|---|---|---|---|
| Stein I | 10 Material + `3 · E` Essenz + `2 · G` Gold | 12 Essenz, 66 G | 21 Essenz, 126 G |
| Stein II | 3 Steine I + `8 · G` Gold | 462 G gesamt | 882 G gesamt |
| Stein III | 3 Steine II + `25 · G` Gold | ~2'200 G, 90 Material | ~4'200 G, 90 Material |
| Sockel bohren | `3 · (3 + Item-Level) · Seltenheitsfaktor / 2` (gewöhnlich ×1 … legendär ×4) | legendär 396 G | legendär 756 G |
| Ausfassen | `1 · (3 + Item-Level)` Gold, der Stein bleibt | 33 G | 63 G |

Beim Zerlegen und Verkaufen kommen die Steine automatisch zurück. **Tauschwaage:** 1 Material eines höheren
Gebiets gibt 2 eines tieferen (nur nach unten), damit niemand 90 Düsterholz auf Level 60 farmen muss.

### Solo und Koop

Steine hängen am Item, sie wirken **überall**, auch im Koop, wie Verbesserungen. Der Koop-Server berechnet die
Kampfwerte aus der Ausrüstung im Cloud-Spielstand, die Steine kommen über die gemeinsame Werte-Rechnung
(`equipment.ts`) mit. Der Tausch-Server übernimmt das Item samt Steinen und prüft sie wie das Item selbst.

### Ökonomie

Grösste Senke im Vorschlag: Gold, Essenz **und** Material. Ein voller Satz (3 Waffensteine III, 5 Rüstungssteine II–III)
kostet auf Lv. 60 grob 25'000–30'000 Gold, ~700 Material und ~170 Essenz. Weil Steine erhalten bleiben, ist es
keine Strafe für neue Items, nur Sockel bohren kehrt wieder.

### Risiken

- **Power Creep:** zusammen mit +5, Set-Boni, Gericht und Trophäen. Pflicht: Balance-Simulation mit vollem Satz
  III und Anpassung der Ziele in `combat.test.ts`. Im Koop zusätzlich 2/3/4 Spieler gegen Hydra.
- **Turm-Rangliste** steigt mit. Vertretbar, aber messen (Median-Stockwerk Lv. 60 legendär heute 22).
- **Server/Tausch:** neues Feld am Item → `sanitize` im Tausch, Werte-Rechnung im Koop, `functions:build` und Deploy.
- **Kristallauge** wirkt nur für Arkan-Builds stark. Gewollt (Builds unterscheiden), aber im Playtest beobachten.

### Überfall

Beschädigt: kein Schleifen und Bohren über der tieferen Stufe. Eingesetzte Steine wirken weiter.

### Aufwand

Gross: `gems.ts` (Steine, Deckel, Kosten), `OwnedItem.gems?: GemId[]`, Werte-Rechnung, Tooltips, Juwelier-Screen,
Steine als Pixel-Icons, Tausch- und Koop-Server, Migration v24 (Items ohne Feld = keine Sockel).

---

## 5. 🗺️ Kartografenstube

**Stimmung:** Der durchreisende Kartograf bleibt. Eine enge Stube mit Karten an der Wand, Zirkeln und einer
Laterne. Er kauft Kartenfragmente und verkauft „Verträge“ für Dungeons.

**Kern:** Mehr Kontrolle und Risiko im Dungeon. Wöchentliche **Verträge** (Idee #11, Wochen-Mutatoren) machen
einen Lauf härter oder anders und füllen dafür die Truhe. **Kartenfragmente** führen zu Schatzkarten.

### Stufen

| Stufe | Name | Wirkung | Kosten |
|---|---|---|---|
| 1 | Kartentisch | einmal pro Lauf eine verschlossene Tür (❓) aufdecken; Kartenfragmente sammeln | 300 G, 20 Lehm, 15 Düsterholz |
| 2 | Kartografenstube | 3 Wochen-Verträge zur Auswahl, einer pro Lauf | 2'000 G, 25 Hartholz, 15 Kristallsplitter |
| 3 | Kartenhaus | zwei Verträge gleichzeitig, Fragmente doppelt | 8'000 G, 30 Drachenerz, 15 Obsidian |

Freischaltung: erster Dungeon abgeschlossen (Verlassene Mine, ab Lv. 10).

### Kartenfragmente

- 1 Fragment pro **bis zum Endboss** abgeschlossenem Dungeon (solo oder Koop), sonst keins.
- 10 Fragmente → eine Schatzkarte (das bestehende Limit von 3 Karten gilt weiter).
- Höchstens 2 Karten pro Woche aus Fragmenten.
- Damit kommt etwa alle 70 Dungeon-Kämpfe eine Karte dazu, zusätzlich zur Zufallsbeute (~1 auf 200 Siege).

### Verträge (Wochen-Mutatoren)

Für alle Spieler gleich, ausgewählt mit `seededRng(hash(Wochenschlüssel))`. Preis: `10 · (3 + Dungeon-Level)` Gold
(Mine 130, Tempel 280, Gewitterturm 430, Abgrund 630).

| Vertrag | Erschwernis | Belohnung |
|---|---|---|
| Blutmond | Gegner +25 % Schaden | +1 Item in der Truhe (Dungeon-Quest-Chancen) |
| Elitepfad | alle Kampfräume sind Elite-Räume | Truhe +40 % Gold und XP |
| Dürre | keine Händler, keine Schreine | Endboss: Boss-Item-Chance 15 % statt 10 % |
| Labyrinth | 40 % statt 20 % verschlossene Türen | jede Truhe/Falle gibt Elite-Beute |
| Glasscherben | keine Heiltränke im Lauf | +2 Kartenfragmente |
| Schatzfieber | Mimic-Chance 60 % | Mimics geben doppelte Beute |

### Solo und Koop

Etappe 1 nur solo. Später: Der **Host** wählt den Vertrag, der Server prüft die Stufe der Stube im Cloud-Spielstand
des Hosts und baut die Räume in `coopDungeonPaths.ts` danach. Die Gegner-Skalierung nach Spielerzahl bleibt.

### Ökonomie

Senke pro Lauf (Vertrag) und bewusst gedeckelte Quelle (Fragmente). Verträge lohnen sich nur, wenn man den Lauf
auch schafft, die Truhe geht bei Niederlage wie immer verloren.

### Risiken

- **Dürre** und **Boss-Item-Chance:** Boss-Items sind ein Langzeitziel. +5 Prozentpunkte gegen echten Verzicht ist
  okay, heroisch (15 %) wird **nicht** weiter erhöht (Deckel 15 %).
- Mit Glasscherben und Ahnenschrein-Versicherung zusammen auf Exploits prüfen.

### Überfall

Beschädigt: Verträge erst wieder nach der Reparatur, Fragmente zählen weiter.

### Aufwand

Mittel: Vertrags-Modifikatoren in `dungeonPaths.ts` (Gewichte, Gegner-Stärke, Truhenbonus), `cartography.ts`,
Fragmente im Store, UI in der Stube und auf der Dungeon-Karte. Koop später mit Server-Änderung.

---

## 6. 📚 Bibliothek

**Stimmung:** Ein Turmzimmer mit Pergamentstapeln, ein Gelehrter zeichnet Gegner nach Beschreibungen des Helden.

**Kern:** Ein **Bestiarium** (Idee #9) mit Wissensstufen pro Gegner. Wissen wächst durch Siege und wird gegen Gold
„studiert“. Jede Stufe gibt einen kleinen Bonus gegen genau diesen Gegner. Später Forschung gegen Elite-Modifikatoren.

### Stufen

| Stufe | Name | Wirkung | Kosten |
|---|---|---|---|
| 1 | Schreibstube | Bestiarium, Wissensstufen 1–2 | 150 G, 15 Düsterholz, 10 Lehm |
| 2 | Bibliothek | Wissensstufe 3, Forschung an Elite-Modifikatoren | 1'500 G, 25 Kristallsplitter, 10 Lehm |
| 3 | Akademie | „Vorausschau“: bei Bossen auch die Absicht der nächsten Runde (nur solo) | 6'000 G, 30 Obsidian, 15 Hartholz |

### Wissensstufen pro Gegner

| Stufe | Siege nötig (Boss) | Studium | Wirkung gegen diesen Gegner |
|---|---|---|---|
| 1 Eintrag | 10 (1) | – | Werte, Beute, Fundorte, Sammelfortschritt |
| 2 Kenner | 50 (5) | `5 · (3 + Level)` G | +4 % Schaden |
| 3 Meister | 150 (15) | `15 · (3 + Level)` G + 5 Material | zusätzlich −4 % erlittener Schaden |

Rund 50 Einträge (Gebiets- und Dungeon-Gegner, Zwischen- und Endbosse). Der Bonus gilt auch im Turm und bei
Überfällen, weil dort dieselben Kreaturen kämpfen. Das hält ihn auf jedem Level nützlich.

**Elite-Forschung (Stufe 2):** pro Modifikator einmal `300 · (1 + Level/10)` Gold, dann wirkt er gegen dich
10 % schwächer. Passt zu den Steckbriefen.

**Neue Zählung:** Siege pro Kreatur gibt es heute nicht in `records`. Alte Stände starten bei 0, Bosse werden aus
`bossesDefeated` mit 1 vorbelegt.

### Ökonomie

Laufende Senke, gleichmässig über alle Level. Voll ausgeschöpft grob 30'000–40'000 Gold, aber freiwillig und
stückweise.

### Risiken

- „Vorausschau“ kann die Boss-Absichten zu leicht machen. Gegenidee: nur Art der Absicht („Angriff“, „Laden“), keine
  Zahlen. In der Simulation mit „perfekt reagierendem“ Helden prüfen.
- Grind-Anreiz in alten Gebieten: Bosse zählen nur bis Stufe 3, normale Gegner auch im Turm, darum kein Zwang.

### Aufwand

Mittel: `bestiary.ts`, Kill-Zähler pro Kreatur im Store, Bonus im Profil (solo), Bestiarium-Screen (nutzt die
vorhandenen Gegner-PNGs), Migration v24.

---

## 7. 🕯️ Ahnenschrein

**Stimmung:** Ein stiller Steinkreis hinter der Statue, Kerzen, Opferschalen. Die Ahnen des Dorfes wachen über
den Helden, wenn er hinabsteigt.

**Kern:** Risiko-Management gegen Gold. Der Schrein versichert die Dungeon-Truhe, segnet den nächsten Lauf und
löst später Flüche.

### Stufen

| Stufe | Name | Wirkung | Kosten |
|---|---|---|---|
| 1 | Opferstein | **Truhenschutz:** vor dem Lauf opfern, bei einer Niederlage bleibt die Hälfte der Truhe (Gold, Material, XP; Items nur, wenn eine Münze wirft: 50 %) | 250 G, 20 Lehm, 10 Düsterholz |
| 2 | Ahnenaltar | **Segnung:** einen von 3 Segen (Turm-Segen) schon vor dem ersten Kampf wählen | 2'000 G, 25 Hartholz, 10 Kristallsplitter |
| 3 | Ahnenhalle | **Läuterung** verfluchter Items (setzt Idee #56 voraus) | 8'000 G, 30 Drachenerz, 20 Obsidian |

Freischaltung: erster verlorener Dungeon-Lauf („Die Ahnen haben dich gesehen …“) oder Lv. 15.

### Preise

- Truhenschutz: `6 · (3 + Dungeon-Level)` Gold. Mine 78, Abgrund 378.
- Segnung: 5× Heiltrankpreis des Dungeons, wie der Segen beim Dungeon-Händler.
- Nur Solo-Dungeons und Koop-Dungeons (eigene Truhe, liegt auf dem Client). **Nicht** im Turm: die Truhe ist dort
  knapp und der Turm ist für die Rangliste da.

### Ökonomie

Senke pro Lauf, die vor allem Gelegenheitsspieler gern zahlen. Erwarteter Verlust ohne Schutz ≈ Truhenwert ×
Niederlagenquote. Der Preis liegt bewusst darüber, dass Versichern sich im Schnitt nicht „lohnt“, nur beruhigt.

### Risiken

- **Exploit Verträge + Schutz:** Blutmond-Vertrag mit Truhenschutz macht harte Läufe risikoarm. Gewollt, solange der
  Schutz nur die Hälfte rettet und Items würfelt.
- Stufe 3 hängt an einem anderen Feature, darum sollte die Ahnenhalle erst kommen, wenn verfluchte Items da sind.

### Aufwand

Klein bis mittel: Flag am Dungeon-Lauf, Rechnung beim Verlieren (`dungeonPaths.ts`), Segen-Wahl vor dem Start,
Popup. Koop: rein clientseitig, kein Server.

---

## 8. 🐴 Stallungen

**Stimmung:** Pferde, Packesel, ein Stallbursche, der Missionstafel und Proviantsäcke verwaltet.

**Kern:** Die Begleiter sitzen oft herum (docs/begleiter.md, „Offen für später“). Die Stallungen geben mehr
Missionen und **Expeditionen**: lange Reisen mit Beute, die es sonst nur selten gibt.

### Stufen

| Stufe | Name | Wirkung | Kosten |
|---|---|---|---|
| 1 | Stall | +1 Mission auf der Tafel (5 statt 4) | 200 G, 25 Düsterholz, 10 Lehm |
| 2 | Gestüt | **Expedition:** eine pro Tag, 12 Std., genau 3 Begleiter | 1'500 G, 25 Kristallsplitter, 15 Lehm |
| 3 | Pferdezucht | Missionen −20 % Dauer (zusammen mit Flink multipliziert), +1 Mission (6) | 6'000 G, 30 Obsidian, 15 Hartholz |

Freischaltung: Taverne Stufe 1 und mindestens 2 Begleiter.

### Expedition

- Missionslevel = Grundlevel der Tafel + 4, geforderter Gearscore × 1,35.
- **Proviant** vor dem Start: `100 · (1 + Level/10)` Gold + 15 Material des Zielgebiets (Lv. 30: 400 G).
- Beute: 15 Sieg-Äquivalente pro Begleiter (45 gesamt), 2 Items mit Boss-Quest-Chancen, dazu je einmal
  gewürfelt: 3 % Boss-Item des Gebietsbosses, 5 % Schatzkarte (Limit 3), 15 % seltener Samen.
- Misserfolg: 25 % der EP, Proviant ist weg.

### Ökonomie

Die einzige **Quelle** im Vorschlag. Heute bringt die Tafel ~60 Sieg-Äquivalente am Tag. Mit Stufe 3 und Expedition
werden es ~110. Proviant und Material gehen wieder raus. Das ist noch „Zubrot“, aber an der Grenze.

### Risiken

- **Idle-Einkommen:** Deckel ist die Zahl der Missionen pro Tag. Nicht weiter erhöhen. Im Playtest prüfen, ob Spieler
  aktives Spielen durch Abholen ersetzen (Ziel: nein).
- **Boss-Items aus Expeditionen:** 3 % pro Tag ≈ eins pro Monat. Nicht für Raid-Bosse.

### Aufwand

Klein bis mittel: Konstanten in `companions.ts` (Tafelgrösse nach Stufe), Expedition als neue Missionsart mit
vorab gewürfeltem Ergebnis (wie bisher), Tab in der Taverne. Kein Server.

---

## 9. 🏟️ Arena

**Stimmung:** Ein Holzring am Dorfrand, Zuschauer auf Strohballen, ein Herold mit Tafel.

**Kern:** Tägliche **Prüfungen** (Idee #68) mit festem Startwert für alle: dieselbe Kreatur, dieselben
Elite-Modifikatoren, eine Bedingung. Wertung S–C (Idee #67) nach Runden, verlorenen LP und Tränken. Die Belohnung
ist eine eigene Währung, **Ehrenmarken**, für Kosmetik und Titel. Damit gibt es ein tägliches Ziel ohne
Machtzuwachs.

### Stufen

| Stufe | Name | Wirkung | Kosten |
|---|---|---|---|
| 1 | Kampfgrube | 1 Prüfung pro Tag, Marken-Händler mit Grundangebot | 300 G, 25 Lehm |
| 2 | Arena | 3 Prüfungen pro Tag, Wochen-Prüfung mit Rangliste unter Freunden | 2'000 G, 25 Hartholz, 15 Kristallsplitter |
| 3 | Kolosseum | **Geister-Arena** (Idee #59): gegen die Kopie eines anderen Helden | 8'000 G, 30 Drachenerz, 20 Obsidian |

### Prüfungen

- Startwert `seededRng(hash(Datum, Prüfungs-Nr.))`, Gegner auf Heldenlevel, damit alle Level fair sind.
- Bedingungen z. B. „ohne Trank“, „in höchstens 5 Runden“, „nur Fähigkeiten“, „gegen Elite mit 3 Modifikatoren“,
  „mit Schild“.
- Wertung: S 3 Marken, A 2, B 1, C 0. Erster Versuch frei, jeder weitere `3 · (3 + Level)` Gold.
- Marken-Händler: Hemdfarben, Umhänge, Frisuren (neue `LOOK_OPTIONS`), Titel, Profilrahmen. Keine Werte.

### Rangliste und Server

Die Wertung kommt vom Client und ist manipulierbar. Weil der Kampf mit festem Startwert deterministisch ist,
kann der Server den Kampf aus der Liste der Aktionen **nachrechnen** (`combat.ts` läuft auf dem Server). Erst damit
gibt es eine Rangliste. Bis dahin nur lokal und unter Freunden ohne Belohnung.

### Ökonomie

Neutral für Gold (eigene Währung), kleine Senke über Wiederholungen. Gut gegen Langeweile auf Level 60.

### Risiken

- Wertung muss für alle Klassen erreichbar sein: S-Schwelle pro Klasse in der Simulation prüfen.
- Geister-Arena braucht Server-Simulation und Schutz vor manipulierten Cloud-Ständen. Darum Stufe 3 zuletzt.

### Aufwand

Mittel (Stufe 1–2 lokal) bis gross (Rangliste, Geister-Arena, Edge Function, Tabelle mit RLS, Migration).

---

## Ökonomie im Überblick

### Baukosten

| Gebäude | Stufe 1 | Stufe 2 | Stufe 3 | Summe |
|---|---|---|---|---|
| Trophäenhalle | 250 | 2'000 | 8'000 | 10'250 |
| Kräutergarten | 200 | 1'500 | 6'000 | 7'700 |
| Rüstkammer | 150 | 2'000 | 8'000 | 10'150 |
| Juwelier | 400 | 2'500 | 10'000 | 12'900 |
| Kartografenstube | 300 | 2'000 | 8'000 | 10'300 |
| Bibliothek | 150 | 1'500 | 6'000 | 7'650 |
| Ahnenschrein | 250 | 2'000 | 8'000 | 10'250 |
| Stallungen | 200 | 1'500 | 6'000 | 7'700 |
| Arena | 300 | 2'000 | 8'000 | 10'300 |

Alle neun zusammen: ~87'000 Gold, mehr als das ganze Einkommen bis Level 60. Das ist Absicht **nur für Stufe 3**,
die als Endgame-Ziel gedacht ist. Stufe 1 aller neuen Gebäude kostet zusammen nur ~2'200 Gold und liegt bei
Level 8–20 (füllt die Lücke). Mit der empfohlenen ersten Welle (3 Gebäude) steigt das Dorf von 42'850 auf ~71'000.

### Laufende Senken und Quellen (Lv. 30, grob pro aktivem Spieltag)

| Gebäude | Senke | Quelle |
|---|---|---|
| Trophäenhalle | 0–1'000 G (je nach neuen Trophäen) | – |
| Kräutergarten | 300–700 G Saat | neue Tränke (keine Gold-Quelle) |
| Rüstkammer | Lv. 60: beliebig viel (Transmog) | – |
| Juwelier | 500–3'000 G, Material, Essenz | – |
| Kartografenstube | 280 G pro Vertrag | Fragmente, Truhenbonus |
| Bibliothek | 100–600 G Studium | – |
| Ahnenschrein | 150–400 G pro geschütztem Lauf | – |
| Stallungen | 400 G Proviant | ~+50 Sieg-Äquivalente |
| Arena | Wiederholungen | Ehrenmarken |

### Im Playtest messen

- Gold auf der Hand auf Lv. 30 und Lv. 50 (Ziel aus dem Gold-Balancing: 2–3 Stunden Einkommen).
- Anteil der Spieler, die Lv. 15–20 etwas bauen (Kräutergarten, Trophäenhalle Stufe 1).
- Materialvorrat pro Gebiet nach Lv. 40 (Ziel: wächst nicht mehr endlos, sobald der Juwelier da ist).

---

## Empfehlung: erste Welle

### 1. Trophäenhalle

- **Rückwirkend:** Bestehende Spieler sehen sofort ihre Erfolge an der Wand. Das ist der stärkste
  „Wow“-Moment pro Aufwand.
- **Langzeitziel und Endgame-Senke** in einem, ohne neue Drops und ohne Server.
- Grafik fast geschenkt (vorhandene Gegner-PNGs im Rahmen).
- Geringes Balance-Risiko, weil die Wirkungen klein und verschieden sind.

### 2. Kräutergarten

- Füllt die im Gold-Balancing genannte **Lücke Lv. 10–21** mit einer laufenden Senke.
- Bringt Gegengift und Manatrank (Idee #35) und damit **Gegenmittel** für bestehende Boss-Mechaniken (Neferet,
  Gift, Kaelthar). Das passt genau zum Leitbild „ankündigen, kontern, belohnen“.
- Echtzeit-Beete geben wie Missionen einen Grund, kurz reinzuschauen.
- Berührt den Koop (neue Tränke), ist aber im gewohnten Muster: Domain → Store → Server → Szene → UI.

### 3. Rüstkammer (Stufe 1–2 zuerst, Transmog danach)

- Kleiner Aufwand, sofort spürbar: Waffenwechsel wegen Schwächen und Resistenzen wird bequem. Das stärkt ein
  Kernziel („Builds sollen sich unterscheiden“).
- Stufe 3 (Transmog) ist die beste **Gold-Senke ohne Machtzuwachs** für Level 60 und kann als eigene Etappe folgen.

### Danach

**Juwelier** als nächstes grosses Projekt: grösster systemischer Nutzen (altes Material, Essenz, Build-Vielfalt),
aber auch das grösste Risiko (Power Creep, Tausch- und Koop-Server). Vorher sollten die erste Welle und ihre
Gold-Daten aus dem Playtest da sein. Kartografenstube und Ahnenschrein passen gut zusammen in eine „Dungeon-Welle“.
Stallungen und Arena sind unabhängig und können jederzeit kommen.

### Vorschlag für die Etappen der ersten Welle

1. Gemeinsame Voraussetzungen: `requires`, Spielstand v24, Dorfbild scrollbar, Erfolge festschreiben.
2. Trophäenhalle (Domain + Tests → Store → UI).
3. Rüstkammer Stufe 1–2.
4. Kräutergarten mit Gegengift und Manatrank (inkl. `coopCombat.ts`, `functions:build`), Phönixtrank zuletzt.
5. Rüstkammer Stufe 3 (Transmog, Server-Prüfung der Aussehen).

---

## Verworfen

| Idee | Warum nicht |
|---|---|
| **Lagerhaus** (mehr Inventarplätze, steht in docs/dorf-ausbau.md) | Das Inventar hat heute keine Grenze. Ein Lagerhaus müsste erst eine Grenze einführen, das wäre ein Rückschritt für die Spieler |
| **Bank mit Zinsen** | Erzeugt Gold aus Gold, also Inflation. Genau das Gegenteil des Gold-Balancings |
| **Marktplatz mit Steuern / Einwohner** (Idee #52) | Passives Gold ohne Spielen. Wenn überhaupt, dann als Teil der Stallungen mit Deckel |
| **Materialtausch nach oben** | Hebelt die Gebiets-Sperre der Baustufen aus. Nur nach unten erlaubt (Tauschwaage beim Juwelier) |
| **Kaserne für mitkämpfende Begleiter** (Idee #38) | Eher ein Kampf-System als ein Gebäude, mit grossem Koop- und Balance-Aufwand. Gehört in einen eigenen Plan |
| **Zweite Statue / XP-Gebäude** | Dupliziert die Statue |

## Offene Fragen

1. Sollen neue Gebäude im Koop wirken (Trophäen, Bibliothek)? Vorschlag: nein, wie das übrige Dorf.
2. Dorfbild: scrollbar (Variante A) oder zweite Reihe (B)?
3. Neferets Fluch: Gegengift bricht ihn ganz, nur früh, oder verlängert nur die Frist?
4. Brauchen Trophäen eine öffentliche Ansicht im Profil (Motivation durch Zeigen)?
5. Sollen Stufe-3-Gebäude eine Level-Sperre (Lv. 60) bekommen, oder reicht Drachenerz als Sperre?
