# Ideen für spannendes Gameplay

Sammlung aller Vorschläge, damit nichts verloren geht. Status: ✅ umgesetzt · 🚧 in Arbeit · 💡 offen.

## Kampf-Mechaniken (erste Runde, 2026-10-30)

| # | Idee | Status |
|---|---|---|
| 1 | **Boss-Phasen:** Unter 50 % LP Raserei oder Sammelruf | ✅ `bossMechanics.ts`, docs/boss-mechaniken.md |
| 2 | **Begleiter mit Aufgabe:** Heiler, Schildträger, Trommler | ✅ `bossMechanics.ts` |
| 3 | **Unterbrechbare Attacken:** Der Boss lädt 2 Runden lang auf. Genug Schaden oder eine Betäubung bricht sie ab, sonst kommt ein gewaltiger Treffer. Wertet Betäubung und das Aufsparen von Fähigkeiten auf. | 💡 |
| 4 | **Schwächen und Resistenzen:** Klingen, Wucht, Stich, Magie; Immunität gegen Gift, Feuer, Bluten | ✅ `matchups.ts`, docs/schwaechen-resistenzen.md |
| 5 | **Effekt-Synergien:** Feuer auf einen Eingefrorenen = „Schmelzen“ (doppelter Schaden), Enthaupten stärker gegen Blutende, eine Fähigkeit, die alle Gift-Stapel auf einmal auslöst. Ablauf: vorbereiten, dann auslösen. | 💡 |
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
| 14 | **Kopfgeld-Tafel:** Im Dorf täglich wechselnde Steckbriefe für bestimmte Elite-Gegner („Rasender, explosiver Schneewolf – 500 Gold“), die man gezielt sucht | ✅ Stufe 3 der Anschlagtafel (Dorf-Ausbau), docs/dorf-ausbau.md |
| 15 | **Heroische Bosse:** Besiegte Bosse auf einer höheren Stufe erneut fordern: mehr LP, eine Zusatzmechanik, höhere Chance auf Boss-Beute | 💡 |
| 16 | **Fähigkeiten auf der Waffe:** Statt im Skilltree freizuschalten liegen die Fähigkeiten auf der Waffe – Einhand 2 aus 4, Zweihand 3 aus 6. Jeder Drop wird so spannend. | ✅ `abilities.ts`, docs/waffen-faehigkeiten.md |
| 17 | **Dorf-Ausbau:** Das Dorf wird vom Spieler aufgebaut. Am Anfang nur ein Strassenhändler mit wenig Ware, Schmiede, Anschlagtafel (zusätzliche Aufträge) und Alchemist (Tränke) muss man bauen und in Stufen ausbauen. Kostet Gold und Material, das Monster im jeweiligen Gebiet fallen lassen. | ✅ `village.ts`, docs/dorf-ausbau.md |
