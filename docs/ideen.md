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
| 8 | **Segen (Roguelite):** Nach Kämpfen einen von 3 zufälligen Segen für den Rest des Durchgangs wählen, z. B. +15 % Feuerschaden, 20 % LP heilen, erste Fähigkeit pro Kampf ohne Mana | ✅ im Endlos-Turm (12 Segen) – für Dungeons noch offen |
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
| 33 | **Mehr Gabelungen und Erfolge:** Gabelung auch auf Stufe 4, Erfolge für Meisterschaften, Stapel (Zorn, Gift) im Kampfbild sichtbar | 💡 |
