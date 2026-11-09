# Dungeon-Besucher

Zu jedem Dungeon kommt ein eigener Besucher ins Dorf, sobald man das Level des Dungeons erreicht. Er erzählt eine
Geschichte in drei Kapiteln, die im Dungeon endet: Im letzten Kapitel steht auf dem Dungeon-Weg eine eigene
**Geschichtstür**, hinter der eine Szene mit einer Entscheidung oder einem Zusatzkampf wartet.
Baut auf den Besuchern auf (`docs/besucher.md`, `src/domain/visitors.ts`) und auf den Dungeon-Wegen (`docs/dungeon-wege.md`).

Status: **Solo umgesetzt** (Etappen 1–3). Code: `src/domain/dungeonVisitors.ts`, `visitors.ts` (Platz `dungeonStory`), Raum `story`
in `dungeonPaths.ts`, Store `dungeonStoryChoice`, Oberfläche `StoryRoom` in `DungeonPath.tsx`. Nach dem Merge Edge Functions
deployen (`npm run functions:deploy`): Der Tausch-Server muss die neuen Unikate kennen.

## Entschiedene Regeln

| Thema | Entscheidung |
|---|---|
| Ankunft | Sobald das Level des Dungeons erreicht ist (Mine 10, Tempel 25, Turm 40, Abgrund 60) |
| Aufenthalt | Bleibt, bis die Geschichte erledigt ist. Ablehnen schiebt nur auf |
| Platz im Dorf | **Eigener Platz**: Ein Dungeon-Besucher kann gleichzeitig mit dem Gebiets-Besucher da sein (höchstens zwei Geschichten gleichzeitig) |
| Ablauf | Kapitel 1 und 2 mit den bekannten Zielen, Kapitel 3 mit einer Geschichtstür im Dungeon |
| Belohnungen | Gemischt wie bei den Gebiets-Besuchern: Begleiter, Unikat, Rezept, teils mit Entscheidung |

## Ablauf

1. Der Dungeon-Besucher steht am Dorfeingang neben dem Gebiets-Besucher, mit eigenem ❗.
2. **Kapitel 1:** Gegner des Dungeons besiegen oder einen Quest-Gegenstand von ihnen holen (40 %, Elite immer).
3. **Kapitel 2:** Ein Quest-Gegenstand vom Zwischenboss (fällt immer).
4. **Kapitel 3:** Solange das Kapitel angenommen ist, steht in jedem Lauf dieses Dungeons an der **ersten Gabelung nach
   dem Zwischenboss** (Schritt 5) zusätzlich die Geschichtstür 📜. Sie ist nie verschlossen und zählt nicht als Ruheraum.
   Dahinter die Szene. Das Kapitel ist erfüllt, wenn man nach der Szene den **Endboss** besiegt.
   Stirbt man oder steigt man vorher aus, erscheint die Tür im nächsten Lauf wieder, und man entscheidet neu.
5. Zurück im Dorf erzählt der Besucher den Schluss und gibt die Belohnung. Die Entscheidung im Dungeon bestimmt sie.

Neu gegenüber den Gebiets-Besuchern: Die **Entscheidung fällt im Dungeon**, nicht im Dorf.
Manche Szenen enthalten einen **Zusatzkampf** (Elite mit zwei Modifikatoren, Elite-Beute) oder eine Probe, die wie die
Falle von der Rüstungsklasse abhängt.

## Die Besucher

| Dungeon | Besucher | Geschichte | Entscheidung im Dungeon | Belohnung |
|---|---|---|---|---|
| Verlassene Mine (Lv. 10) | **Gerold**, alter Steiger | Sein Lehrling Pip ist in die Mine gelaufen, um Gerolds Ehre zu retten | Wie man Pip befreit (beide Wege retten ihn) | Begleiter **Pip** |
| Versunkener Tempel (Lv. 25) | **Samira**, Schatzsucherin | Sie sucht die echte Grabkammer der Hohepriesterin | Sonnenamulett nehmen **oder** zurücklegen | Unikat **oder** Rezept |
| Gewitterturm (Lv. 40) | **Vessa**, Kaelthars Schülerin | Ihr Meister hat einen Sturm eingesperrt und ist daran verrückt geworden | Sturm freilassen **oder** an die Waffe binden | Begleiterin Vessa **oder** Unikat |
| Abgrund der Leere (Lv. 60) | **Orun**, letzter Siegelhüter | Das Siegel über Xal'Zar bricht | Orun versiegelt sich selbst **oder** man stellt sich dem Echo von Xal'Zar | Unikat (zwei verschiedene) |

### Gerold – Verlassene Mine

Intro: „Gerold, dreissig Jahre Steiger in dieser Mine. Dann kamen die Kobolde und ich bin gerannt. Mein Lehrling Pip
hat sich geschämt für mich. Gestern ist er allein hineingegangen.“

| Kapitel | Ziel | Inhalt |
|---|---|---|
| Spinnweben im Schacht | 4 Grubenspinnen | Die Spinnen haben den Hauptschacht zugesponnen |
| Das Schichtbuch | „Gerolds Schichtbuch“ vom Vorarbeiter Knorz | Darin steht, welche Stollen noch halten. Pips Kreidezeichen führen tiefer |
| Verschüttet | Geschichtstür „Eingestürzter Stollen“, dann Grimmbart | Pip sitzt hinter Geröll, die Kobolde legen gerade eine Sprengladung |

Szene: **Freigraben** (Zusatzkampf gegen einen Elite-Kobold-Sprengmeister, der stört) **oder** **Ladung umlegen**
(Probe wie die Falle: Leichte Rüstung schafft es eher ungesehen, schwere hält die Explosion aus).
Pip wird in beiden Fällen gerettet.
Belohnung: **Pip als Begleiter** (episch: Sammler, Schatzsucher), belegt keinen Platz in der Taverne.

### Samira – Versunkener Tempel

Intro: „Alle reden von Neferets Schatz. Aber die Frau, gegen die man im Tempel kämpft, ist nicht Neferet.
Die echte Hohepriesterin liegt woanders. Ich will wissen, wo.“

| Kapitel | Ziel | Inhalt |
|---|---|---|
| Inschriften | 3× „Tontafel“ von Mumien | Die Tafeln erzählen von einer Priesterin, die ihre Herrin verraten hat |
| Der Skarabäus | „Skarabäusschlüssel“ vom Grabhüter Anubek | Der Schlüssel öffnet eine Kammer, die auf keiner Karte steht |
| Die wahre Kammer | Geschichtstür „Verborgene Grabkammer“, dann Neferet | Der Geist der echten Neferet bittet, das Sonnenamulett nicht anzurühren |

Szene: **Amulett nehmen** → das Amulett ist in einen Schild eingelassen: Unikat-Schild **„Sonnenschild der Neferet“**
(Lv. 30, Effekt Reinheit) **oder** **zurücklegen** → Neferets Segen für den Rest des Laufs (ein Segen wie im
Schrein) und Samira gibt das Rezept **„Dattelbrot der Priester“** (+20 % LP, +20 % Mana, +10 % Krit).

### Vessa – Gewitterturm

Intro: „Mein Meister Kaelthar hat einen Sturm in einen Kristall gesperrt. Seitdem hört er nur noch den Donner.
Was ihr Sturmfürst nennt, war einmal ein guter Lehrer.“

| Kapitel | Ziel | Inhalt |
|---|---|---|
| Falsche Schüler | 5 Blitzbeschwörer | Sie haben ihren Platz eingenommen und füttern den Sturm |
| Der Sturmkern | „Sturmkern“ vom Donnerkoloss | Ein Splitter des Kristalls, Vessa kann damit den Käfig öffnen |
| Der gefangene Sturm | Geschichtstür „Sturmkammer“, dann Kaelthar | Der Kristall pulsiert, der Sturm will hinaus |

Szene: **Freilassen** → Zusatzkampf gegen den entfesselten Sturm (Elite-Gewitterelementar), danach ist Kaelthar
schwächer (−15 % LP in diesem Lauf). Belohnung: **Vessa als Begleiterin** (legendär: Flink, Lernbegierig).
**Oder binden** → kein Kampf. Belohnung: Unikat-Stab **„Sturmbinder“** (Lv. 45, Effekt Kettenblitz).

### Orun – Abgrund der Leere

Intro: „Mein Orden hat Xal'Zar vor tausend Jahren versiegelt. Ich bin der Letzte. Und das Siegel hat Risse.“

| Kapitel | Ziel | Inhalt |
|---|---|---|
| Was durchsickert | 4× „Leerensplitter“ von Leerenkriechern | Die Splitter sind Bruchstücke des Siegels |
| Der Tyrann | „Siegelstein“ vom Abgrundtyrann | Der Tyrann trägt das Herzstück des Siegels als Krone |
| Das Siegel | Geschichtstür „Siegelkammer“, dann Xal'Zar | Das Siegel lässt sich nur erneuern, wenn jemand darin wacht |

Szene: **Orun bleibt im Siegel** → kein Kampf, Unikat-Brustpanzer **„Oruns Siegelmantel“** (Lv. 60, Effekt Unbeugsam).
Orun kommt dann nicht zurück: An seinem Platz im Dorf liegt sein gefalteter Mantel mit einem **Brief** (`letter` in der Szene).
**Oder Echo stellen** → Zusatzkampf gegen das Echo von Xal'Zar (Elite-Schattendämon, zwei Modifikatoren), Orun überlebt
und gibt Unikat-Zweihandaxt **„Leerenspalter“** (Lv. 60, Effekt Sog).

## Koop

Kapitel 1 und 2 zählen im Koop wie bisher mit (Kills und Quest-Gegenstände). Die **Geschichtstür gibt es nur solo**, wie
der Schatzraum der Schatzkarten. So muss im Koop niemand abstimmen, wessen Geschichte gespielt wird.

## Zahlen

| Was | Wert |
|---|---|
| EP und Gold pro Kapitel | wie bei den Gebiets-Besuchern: 1,5× eine Questbuch-Quest gleichen Umfangs |
| Quest-Gegenstand Kapitel 1 | 40 %, Elite immer |
| Quest-Gegenstand Kapitel 2 | Zwischenboss, fällt immer |
| Zusatzkampf | Elite mit zwei Modifikatoren, Elite-Beute (doppelte EP und doppeltes Gold) |
| Probe (Gerold) | wie die Falle: Ausweichen leicht 70 %, mittel 55 %, schwer 30 %. Misslingt sie, 25 % der LP Schaden (schwere Rüstung weniger) |
| Unikate | legendär, Werte wie ein Boss-Item gleichen Levels, fester Effekt, nicht tauschbar |
| Begleiter | starten 2 Level unter dem Held, belegen keinen Platz in der Taverne |

## Technik (kurz)

- `dungeonVisitors.ts`: `DUNGEON_VISITORS` mit `dungeonId` und `scene`. `visitors.ts`: eigenes Feld `VisitorState.dungeonStory`.
  Kein neuer Spielstand nötig: Ältere Stände bekommen den leeren Platz beim Laden.
- Neues Kapitel-Ziel `dungeonStory`: erfüllt, wenn die Szene gespielt und danach der Endboss besiegt ist (`completeStoryScene`). Die Wahl wird
  in `VisitorState.choices` gespeichert.
- `dungeonPaths.ts`: neuer Raum `story`, nur in Schritt 5, nur solo, nur mit angenommenem Kapitel 3 dieses Dungeons.
- Neue Oberfläche `StoryRoom` im Dungeon-Weg (Text, zwei Knöpfe), Dorfbild mit zweitem Besucherplatz.
- Neue Unikate in `VISITOR_ITEM_SPECS`, danach Edge Functions deployen (Tausch-Server muss die Ids kennen).

## Etappen

1. ✅ Domain: Besucher, Ziel `dungeonStory`, Raum `story`, Unikate, Rezept, Tests
2. ✅ Store und Dungeon-Ablauf
3. ✅ Oberfläche: zweiter Besucher im Dorf, Geschichtstür und Szene, Questbuch
