# Ideen für spannendes Gameplay

Sammlung aller Vorschläge, damit nichts verloren geht. Status: ✅ umgesetzt · 🚧 in Arbeit · 💡 offen.

## Kampf-Mechaniken (erste Runde, 2026-10-30)

| # | Idee | Status |
|---|---|---|
| 1 | **Boss-Phasen:** Unter 50 % LP Raserei oder Sammelruf | ✅ `bossMechanics.ts`, docs/boss-mechaniken.md |
| 2 | **Begleiter mit Aufgabe:** Heiler, Schildträger, Trommler | ✅ `bossMechanics.ts` |
| 3 | **Unterbrechbare Attacken:** Der Boss lädt 2 Runden lang auf. Genug Schaden oder eine Betäubung bricht sie ab, sonst kommt ein gewaltiger Treffer. Wertet Betäubung und das Aufsparen von Fähigkeiten auf. | 💡 |
| 4 | **Schwächen und Resistenzen:** Klingen, Wucht, Stich, Magie; Immunität gegen Gift, Feuer, Bluten | ✅ `matchups.ts`, docs/schwaechen-resistenzen.md |
| 5 | **Effekt-Synergien:** Feuer auf einen Eingefrorenen = „Schmelzen“ (doppelter Schaden), Enthaupten stärker gegen Blutende, eine Fähigkeit, die alle Gift-Stapel auf einmal auslöst. Ablauf: vorbereiten, dann auslösen. | 🚧 Schmelzen, Gift-Stapel (Fäulnis) und Blutsturz im Skilltree (#32) |
| 6 | **Elite-Gegner:** 9 Modifikatoren, solo und im Koop-Dungeon | ✅ `elites.ts`, docs/elite-gegner.md |
| 7 | **Koop-Rollen:** Spott (Bedrohung an sich ziehen); Kombos über Spieler hinweg (einer macht verwundbar, der andere nutzt es aus); Mechaniken, die die Gruppe aufteilen (zwei Begleiter müssen in derselben Runde fallen) | 💡 |

### Weitere Elite-Modifikatoren

| Modifikator | Idee | Status |
|---|---|---|
| 🐺 Rudelführer | Bringt einen Artgenossen mit | ✅ |
| 🌵 Dornig | Wirft 20 % des Nahkampfschadens zurück. Gegenmittel: Bogen, Stab, Zepter, Gift/Feuer/Bluten | 💡 |
| 🗿 Unerschütterlich | Immun gegen Betäubung und Schwächung. Streitkolben und Grosshammer verlieren ihren Vorteil | 💡 |

## Langzeitmotivation (zweite Runde, 2026-10-30)

| # | Idee | Status |
|---|---|---|
| 8 | **Segen (Roguelite):** Nach Kämpfen einen von 3 zufälligen Segen für den Rest des Durchgangs wählen, z. B. +15 % Feuerschaden, 20 % LP heilen, erste Fähigkeit pro Kampf ohne Mana | ✅ im Endlos-Turm (12 Segen) und im Schrein der Dungeon-Wege (#37) |
| 9 | **Bestiarium mit Entdecken:** Schwächen und Resistenzen sind anfangs verdeckt („???“). Man deckt sie auf, wenn man einen Gegner mit dieser Schadensart trifft oder ihn mehrmals besiegt. Dazu Sammelfortschritt und Erfolge pro Gebiet. | 💡 |
| 10 | **Gegenstände mit Spezialeffekt:** Legendäre und Boss-Items bekommen einen Effekt („Kritische Treffer setzen in Brand“, „Bei Kampfbeginn Bollwerk“, „+50 % gegen Elite-Gegner“). Passt gut zu Idee 5. | ✅ `itemEffects.ts`, docs/item-effekte.md |
| 11 | **Wochen-Mutatoren für Dungeons:** Ein Modifikator pro Woche für alle Dungeons („Alle Gegner Elite“, „Bosse mit dritter Phase“, „Tränke doppelt, Gegner +30 % Schaden“), dafür mehr Beute | 💡 |
| 12 | **Endlos-Turm:** Stockwerke mit steigender Stärke, Elite-Modifikatoren, Segen alle paar Stockwerke, Rangliste nach höchstem Stockwerk | ✅ `tower.ts`, docs/endlos-turm.md |
| 13 | **Wandernde Weltbosse:** Ab und zu erscheint für ein paar Stunden ein seltener Boss in einem Gebiet, mit Ankündigung. Solo oder im Koop schaffbar, einzigartige Beute. | 💡 |
| 14 | **Kopfgeld-Tafel:** Im Dorf täglich wechselnde Steckbriefe für bestimmte Elite-Gegner („Rasender, explosiver Schneewolf – 500 Gold“), die man gezielt sucht | ✅ an der Anschlagtafel (Dorf-Ausbau), docs/dorf-ausbau.md |
| 15 | **Heroische Bosse:** Besiegte Bosse auf einer höheren Stufe erneut fordern: mehr LP, eine Zusatzmechanik, höhere Chance auf Boss-Beute | ✅ `heroic.ts` (Gebiets- und Dungeon-Bosse, solo und Koop-Dungeon) – Raid-Bosse noch offen |
| 16 | **Fähigkeiten auf der Waffe:** Statt im Skilltree freizuschalten liegen die Fähigkeiten auf der Waffe – Einhand 2 aus 4, Zweihand 3 aus 6. Jeder Drop wird so spannend. | ✅ `abilities.ts`, docs/waffen-faehigkeiten.md |
| 17 | **Dorf-Ausbau:** Das Dorf wird vom Spieler aufgebaut. Am Anfang nur ein Strassenhändler mit wenig Ware, Schmiede, Anschlagtafel (zusätzliche Aufträge) und Alchemist (Tränke) muss man bauen und in Stufen ausbauen. Kostet Gold und Material, das Monster im jeweiligen Gebiet fallen lassen. | ✅ `village.ts`, docs/dorf-ausbau.md |
| 18 | **Begleiter und Missionen:** In der Taverne Begleiter mit zufälligen Namen und Traits anwerben, aufleveln, ausrüsten und auf Missionen in Echtzeit schicken. Die Erfolgschance hängt vom Gearscore ab, bessere Taverne = bessere Traits. | ✅ `companions.ts`, docs/begleiter.md |

## Bosskämpfe mit Absichten (dritte Runde, 2026-11-02)

Bosskämpfe waren alle gleich: viel Schaden machen, jede 3. Runde kommt die Fähigkeit. Jetzt zeigt der Boss jede Runde, was er vorhat, und man antwortet darauf (docs/boss-absichten.md).

| # | Idee | Status |
|---|---|---|
| 19 | **Absichten und Abwehren:** Boss zeigt jede Runde seine Absicht, neue Grundaktion Abwehren (halber Schaden, +10 Mana) | ✅ `bossIntents.ts`, solo und Koop-Dungeon |
| 20 | **Begleiter mit Fähigkeiten:** Heilritual (unterbrechbar), Schild über dem Boss (Gift geht durch), Trommelwirbel (Betäubung setzt zurück) | ✅ `bossMechanics.ts`, solo und Koop |
| 21 | **Krummzahn:** Wut durch Treffer, volle Wut = Wutanfall | ✅ Prototyp |
| 22 | **Höhlenauge:** offen wirft es Fähigkeiten zurück, geschlossen verwundbar | ✅ Prototyp |
| 23 | **Urmammut:** Ansturm laden – genug Schaden oder Betäubung bricht ihn, dann taumelt er (Idee 3) | ✅ Prototyp |
| 24 | **Sumpfechse:** taucht ab – eine Runde nicht angreifbar, dann Hinterhalt mit Gift | ✅ Solo |
| 25 | **Lichkönig:** Seelengefäss – fallende Skelette laden es auf, mit Ladung steht der Lich einmal wieder auf | ✅ Solo |
| 26 | **Ignaroth:** hebt ab – 2 Runden treffen nur Bogen, Stab und Zepter voll, danach Feueratem mit Ansage | ✅ Solo |
| 27 | **Erzkönig:** Panzerplatten – jeder Treffer bricht eine ab (Hammer zwei), ohne Platten verwundbar, sie wachsen nach | ✅ Solo und Koop |
| 28 | **Neferet:** Fluch zählt herunter – reinigen oder ihr bis dahin genug Schaden machen; im Koop springt er beim Ausbruch über | ✅ Solo und Koop |
| 29 | **Kaelthar:** lädt sich mit jeder Fähigkeit des Helden auf, entlädt sich bei 3 Ladungen (Koop: 4 pro Held) | ✅ Solo und Koop |
| 30 | **Xal'Zar:** verschlingt die stärkste Fähigkeit und setzt sie gegen dich ein, bis du ihm genug Schaden machst | ✅ Solo und Koop |
| 31 | **Neue Begleiter:** Dieb (stiehlt Tränke), Bombenleger (Countdown), Kettenwächter (zwingt das Ziel), Fluchwirker (versiegelt eine Fähigkeit) | 💡 |

## Skilltree (2026-11-02)

| # | Idee | Status |
|---|---|---|
| 32 | **Vier Pfade statt +2 % Schaden:** Klinge, Wehr, Arkan, Plage – aufeinander aufbauend mit Stufen, Gabelung und einer Meisterschaft. Enthält Idee 5 (Schmelzen, Gift platzen lassen) | ✅ `skills.ts`, docs/skilltree.md, solo und Koop |
| 33 | **Mehr Gabelungen und Erfolge:** Gabelung auch auf Stufe 4, Erfolge für Meisterschaften, Stapel (Zorn, Gift) im Kampfbild sichtbar | 🚧 Meisterschafts-Gabel ✅ (G2), Stapel im Kampfbild ✅ (Bluten-Stapel, Schild); Erfolge mit v25 (G4) |

## Tränke (2026-11-02)

| # | Idee | Status |
|---|---|---|
| 34 | **Wurftränke:** Brandflasche, Giftphiole, Frostbombe, Säureflasche, Rauchbombe, Sprengflasche. Teilen sich das Limit „ein Trank pro Runde“ mit den Trinktränken | ✅ `potions.ts`, docs/wurftraenke.md, solo und Koop |
| 35 | **Mehr Trinktränke:** Gegengift (reinigt Gift/Feuer/Bluten, bricht Neferets Fluch), Manatrank | 💡 |
| 36 | **Wurf-Limit pro Kampf:** höchstens ein oder zwei Wurftränke pro Kampf, falls der volle Satz zu stark ist (siehe Sim in docs/wurftraenke.md) | 💡 |

## Vierte Runde (2026-11-02)

| # | Idee | Status |
|---|---|---|
| 37 | **Dungeons mit Weggabelungen:** Zwischen den Kämpfen den Weg wählen – Kampf, Elite-Raum, Schrein (Segen), Händler, Falle, Rätsel. Manche Türen verschlossen | ✅ Solo und Koop (Abstimmung), `dungeonPaths.ts`, `coopDungeonPaths.ts`, docs/dungeon-wege.md |
| 38 | **Begleiter im Kampf:** Einen Begleiter in Bosskämpfe mitnehmen, Traits werden zu kleinen Fähigkeiten (spotten, unterbrechen) | 💡 |
| 39 | **Wetter und Gelände im Kampf:** Regen schwächt Feuer, Frost erleichtert Schmelzen, Nebel senkt die Trefferchance von Bögen | 💡 |
| 40 | **Sockel und Edelsteine** beim Schmied, um Schadensarten und Resistenzen anzupassen | 💡 |
| 41 | **Prestige nach dem Maximallevel** und **Turm-Saisons** mit exklusivem Titel | 💡 |
| 42 | **Gilden mit Gildenprojekt:** gemeinsam Material für ein Gebäude sammeln | 💡 |
| 43 | **Komfort:** Ausrüstungs-Sets speichern, Schnellkampf gegen schwache Gegner, Statistik-Seite, Benachrichtigung bei fertiger Mission | 💡 |
| 44 | **Geführter Einstiegskampf**, der Absichten, Abwehren und Wurftränke zeigt | 💡 |

## Handel (2026-11-03)

| # | Idee | Status |
|---|---|---|
| 45 | **Item-Tausch zwischen zwei Spielern** statt Marktplatz: Code wie beim Koop, beide bestätigen, Server prüft gegen die Cloud-Spielstände. Alles handelbar ausser Boss-Items | ✅ alle vier Etappen, noch nicht deployt – docs/item-tausch.md |

## Besucher im Dorf (2026-11-04)

| # | Idee | Status |
|---|---|---|
| 46 | **Besucher mit Story-Quests:** Ab und zu kommt eine Person ins Dorf und erzählt ihre Geschichte. Sie vergibt eine kleine Questreihe (2–4 Schritte), z. B. ein Erbstück aus einem Dungeon holen, das ein bestimmter Gegner fallen lässt. Am Ende eine Entscheidung mit Folgen, als Belohnung etwas Einzigartiges (Item, Rezept, Begleiter, Titel) | ✅ `visitors.ts`, docs/besucher.md – Erfolge und Kampf gegen die Fremde noch offen |

## Überfälle (2026-11-05)

| # | Idee | Status |
|---|---|---|
| 47 | **Überfälle aufs Dorf:** Ab und zu kündigt sich eine Bande an. Bis zur Frist verteidigt man das Dorf (Wellen und Anführer), sonst wird ein Gebäude beschädigt und wirkt eine Stufe tiefer, bis man es repariert. Neues Gebäude Wehranlage, Begleiter im Dorf stehen Wache | ✅ `raids.ts`, docs/ueberfaelle.md |

## Fünfte Runde (2026-11-05)

| # | Idee | Status |
|---|---|---|
| 48 | **Gebiete befreien:** Bedrohung pro Gebiet sinkt mit Kills, bei 0 % das Lager der Bande – danach keine Überfälle mehr aus diesem Gebiet | 💡 |
| 49 | **Ruf bei Fraktionen:** Besucher-Entscheidungen und Quests geben Ruf (Händlergilde, Jägerbund, Orden) – Rabatte, eigene Kopfgelder, Fraktions-Items | 💡 |
| 50 | **Jahreszeiten und Feste:** Erntefest, Wintersonnenwende mit Saisonboss und begrenzter Questreihe | 💡 |
| 51 | **Schatzkarten:** sehr seltene Beute, führt zu einem Schatzraum im Solo-Dungeon mit garantiert legendärem Item oder Schatz-Rezept, bei den laufenden Quests aufgelistet | ✅ `treasureMaps.ts`, docs/schatzkarten.md – Schatzraum bewusst nur solo |
| 52 | **Einwohner und Zufriedenheit:** Gebäude ziehen Einwohner an, die Gold und Material abgeben; Überfälle senken die Zufriedenheit | 💡 |
| 53 | **Kräutergarten:** Beete wachsen in Echtzeit und liefern Zutaten, seltene Samen als Beute | 💡 |
| 54 | **Persönliche Begleiter-Quest:** ab einem Level erzählt ein Begleiter seine Geschichte, am Ende ein einzigartiger Trait | 💡 |
| 55 | **Verletzungen und Lazarett:** misslungene Missionen verletzen Begleiter für ein paar Stunden | 💡 |
| 56 | **Verfluchte Items:** starke Werte mit Nachteil, eine Besucher-Quest löst den Fluch | 💡 |
| 57 | **Absichten für Elite-Gegner:** leichte Version der Boss-Absichten für den Modifikator-Angriff | 💡 |
| 58 | **Mimik-Truhen** auf dem Dungeon-Weg | ✅ Raum „Alte Truhe“ solo und Koop, 30 % Mimic mit Elite-Beute, `dungeonPaths.ts`, docs/dungeon-wege.md |
| 59 | **Geister-Arena:** asynchrones PvP gegen die Kopie eines anderen Helden aus dem Cloud-Spielstand | 💡 |
| 60 | **Koop-Dorfverteidigung:** einen Freund per Code zur Überfall-Abwehr holen | 💡 |
| 61 | **Heldenchronik:** das Questbuch schreibt automatisch ein Tagebuch der wichtigen Momente | 💡 |

## Sechste Runde: Content-Vielfalt (2026-11-07)

| # | Idee | Status |
|---|---|---|
| 62 | **Seltene Gegner:** mit 1–2 % Chance statt eines normalen Gegners eine benannte Variante („Silberpelz, der Leitwolf“), mit eigener Beute und Sammlung | ✅ 24 seltene Gegner in den Gebieten, `rares.ts`, docs/seltene-gegner.md |
| 63 | **Rudel-Kämpfe:** ab und zu 2–3 schwache Gegner gleichzeitig statt einem starken – Zielwahl und Flächenfähigkeiten werden wichtig | ✅ 7 % Chance, immer 3 Tiere, alle gewöhnlichen Gebietskreaturen, `packs.ts`, docs/rudel-kaempfe.md |
| 64 | **Tag und Nacht (echte Uhrzeit):** nachts andere Gegner in manchen Gebieten (Untote im Düsterwald, Irrlichter in den Sümpfen) | 💡 |
| 65 | **Gegner mit Eigenheiten:** Goblin schnappt sich Gold und flieht (2 Runden Zeit), Kröte schluckt einen Trank, Spinne fesselt eine Runde | 💡 |
| 66 | **Umgebung im Kampf:** ein Objekt pro Gebiet, einmal nutzbar – Pulverfass in der Mine, Spiegel in der Kristallhöhle, einstürzende Säule in den Ruinen | 💡 |
| 67 | **Kampfwertung S–C:** nach Runden, verlorenen LP und Tränken – S gibt etwas mehr Beute und zählt für Erfolge | 💡 |
| 68 | **Herausforderung pro Kampf:** optionale Aufgabe vor dem Kampf („ohne Trank“, „in 4 Runden“) mit Bonus | 💡 |
| 69 | **Neue Dungeon-Räume:** Spiegelraum (gegen den eigenen Schatten), Blutbrunnen (LP gegen starken Segen), Gefangener (wird Begleiter oder Händler), Arena (drei Wellen) | 💡 |
| 70 | **Versteckter Boss:** mit einer Bedingung im Lauf (alle Elite-Räume, Rätsel fehlerfrei) wartet hinter dem Endboss ein geheimer Boss mit eigener Beute | 💡 |
| 71 | **Verfluchte Türen:** ein Fluch für den Rest des Laufs (Gegner +20 % Schaden), dafür eine Extra-Truhe am Ende | 💡 |
| 72 | **Waffen mit Geschichte:** Waffen zählen Siege, nach 100 Wölfen heisst sie „Wolfsbann“ und macht +10 % gegen Wölfe | 💡 |
| 73 | **Trophäenhalle im Dorf:** Boss-Trophäen aufhängen, jede mit kleinem dauerhaftem Bonus | 💡 |
| 74 | **Haustier aus seltenem Ei:** schlüpft nach einigen Kämpfen, läuft im Kampf mit, kleiner Effekt (findet Gold, warnt bei Absichten) | 💡 |
| 75 | **Rote Linie durch die Gebiete:** ein Gegenspieler (Kultist, der Xal'Zar befreien will) taucht überall kurz auf, Story-Kapitel nach jedem Gebietsboss, Finale im Abgrund | 💡 |
| 76 | **Entscheidungen mit Weltfolgen:** Krummzahn verschonen macht das Goblin-Lager zum Handelsposten, töten gibt mehr Beute und mehr Goblin-Überfälle | 💡 |
| 77 | **Täglicher Dungeon:** fester Seed für alle (gleicher Weg, gleiche Elite, gleiche Segen), Tages-Rangliste nach Zeit | 💡 |
| 78 | **Würfelpoker in der Taverne:** Minispiel gegen Gäste um Gold, mit Einsatzlimit | 💡 |
| 79 | **Hardcore-Held:** eigener Charakter mit nur einem Leben, eigene Rangliste | 💡 |

## Raid-Bosse mit Phasen (2026-11-08)

| # | Idee | Status |
|---|---|---|
| 80 | **Sumpfhydra:** Bei 75/50/25 % LP fällt ein Kopf ab und kämpft als Begleiter mit eigener Fähigkeit (Gift, Säure, Blut). Lebt er nach 3 Runden noch, wachsen zwei nach. Feuer brennt den Stumpf aus, solange Köpfe leben, erleidet die Hydra halben Schaden | ✅ `hydra.ts`, docs/raid-bosse.md |
| 81 | **Frostriese:** Eiskerker (Mitspieler befreien), Lawine mit Ansage (gemeinsam abbrechen), zerbrechender Riese unter 25 % | 💡 docs/raid-bosse.md |
| 82 | **Weltenverschlinger:** zwei Leerenrisse, die in derselben Runde fallen müssen; verschlingt den Helden mit der höchsten Bedrohung, der von innen kämpft | 💡 docs/raid-bosse.md |

## Freunde (2026-11-08)

| # | Idee | Status |
|---|---|---|
| 83 | **Freundesliste:** Freunde per Benutzername, live sehen, wer in einer Koop-Lobby wartet, und direkt beitreten (mit Level-Prüfung), sonst „zuletzt aktiv“ | ✅ `src/friends/`, docs/freunde.md |
| 84 | **Freunde zum Tausch einladen:** offenen Tausch eines Freundes in der Liste zeigen und direkt beitreten | 💡 |
| 85 | **Schnell-Nachrichten unter Freunden:** vorgefertigte Sätze und Emotes statt freiem Chat – keine Moderation nötig | 💡 |

## Klassen und Talente (2026-11-12)

| # | Idee | Status |
|---|---|---|
| 86 | **Klassen mit Kern (Modell C):** Rolle, Klassenleiste mit 4 Ladungen, Signaturfähigkeit ohne Mana und ein mechanisches Passiv pro Klasse; Paladin auch mit Schwert + Schild | ✅ G0, G1 und G3 (Klassen-Kern: Leiste, 11 Signaturen, neue Passive, Paladin mit Schwert, Koop-Rollen) umgesetzt; optionale Teile in G4 – docs/klassen-neukonzept.md, docs/klassen-skilltree-abgleich.md |
| 87 | **Skilltree-Überarbeitung:** Meisterschaft ab 12, zwei Meisterschaften pro Pfad, neue Knoten, Brücken, Leisten-Knoten | 🚧 G2 ✅ (Meisterschaft ab 12, zweite Meisterschaften, neue Knoten, v24) – Brücken und Leisten-Knoten in G4, docs/skilltree-ueberarbeitung.md |
| 88 | **Boss-Raserei im Koop:** ab Runde 20 +10 % Schaden pro Runde, angekündigt ab Runde 17 – bremst endlose Kämpfe mit Heiler und Tank | ✅ G3 (`coopEnrageFactor`, heroische Endbosse ab Runde 30) – docs/klassen-neukonzept.md 4.5 |
| 89 | **Quest „Finde deine Klasse“:** frühe Story-Quest, die zur ersten Klasse führt (Sieg mit aktiver Klasse) | ✅ G3 (Questbuch ohne Gebiet, Rüstungsteil passend zur Waffe) – docs/klassen-neukonzept.md 4.7 |
| 90 | **Druide** (mittel + Stab) als zweiter Heiler | 💡 G4, nach dem Playtest des Klerikers |
