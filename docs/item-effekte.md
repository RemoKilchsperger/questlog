# Gegenstände mit Spezialeffekt

Legendäre Items aus der normalen Beute haben einen zufälligen Spezialeffekt, Boss-Items einen festen,
der zu ihrem Boss passt. Code: `src/domain/itemEffects.ts`, Wirkung in `combat.ts` und
`coopCombat.ts` (gilt solo und im Koop).

## Regeln

- **Legendäre Items:** Der Effekt wird aus der uid gewürfelt (`rollItemEffect`) und beim Erzeugen
  gespeichert (`OwnedItem.effect`). Waffen ziehen aus dem Waffen-Pool, Rüstungen aus dem
  Rüstungs-Pool, beide dazu aus den allgemeinen Effekten.
- **Bestehende Spielstände:** Legendäre Items ohne Effekt bekommen ihn beim Laden (`ensureEffect` in
  `repairSave`), genau den, den sie als neuer Drop bekommen hätten.
- **Boss-Items:** Sie haben einen festen Effekt pro Boss (`BOSS_EFFECTS`), ohne Eintrag am Item.
- **Kein Stapeln:** Derselbe Effekt zählt nur einmal (`equippedEffects`).
- **Episch und darunter:** kein Effekt.
- **Anzeige:** goldene Zeile im Tooltip, „Aktive Item-Effekte“ im Charakterbogen, Liste in der Hilfe.
  Im Kampf sieht man die Folgen (Brand, Gift, Einfrieren, Dornen, „UNBEUGSAM!“).

## Effekte

| Pool | Effekt | Wirkung |
|---|---|---|
| Waffe | 🔥 Glut | Kritische Treffer setzen 2 Runden in Brand (20 % des Schadens) |
| Waffe | 🐍 Giftzahn | 30 % Chance pro Treffer: 3 Runden Gift (25 %) |
| Waffe | ❄️ Frostbiss | 10 % Chance einzufrieren (Betäubungs-Immunität gilt) |
| Waffe | ⚡ Kettenblitz | Normale Angriffe springen mit 15 % auf einen zweiten Gegner über (60 % Schaden) |
| Waffe | 🪓 Henkersbeil | +30 % Schaden gegen Gegner unter 30 % LP |
| Waffe | 🩸 Aderlass | +20 % Schaden gegen blutende Gegner |
| Waffe | ★ Elitejäger | +25 % Schaden gegen Elite-Gegner |
| Waffe | 👑 Bossschlächter | +15 % Schaden gegen Bosse |
| Waffe | 🔮 Runenklinge | Treffer zählen als Magie, wenn das wirksamer ist |
| Waffe | 💧 Manadieb | +3 Mana pro Treffer |
| Rüstung | 🌵 Dornen | 10 % des erlittenen Schadens zurück |
| Rüstung | 🔰 Wachsam | Der erste gegnerische Angriff jedes Kampfes wird geblockt |
| Rüstung | 🧱 Letztes Gefecht | Unter 25 % LP +25 % Rüstung |
| Rüstung | 🌿 Lebensquell | 2 % LP Regeneration pro Runde |
| Rüstung | ✨ Reinheit | Gift, Feuer und Bluten auf dir wirken 1 Runde kürzer |
| Rüstung | 🗿 Standhaft | Boss-Fähigkeiten −15 % Schaden |
| Rüstung | 🕊️ Unbeugsam | Einmal pro Kampf einen tödlichen Treffer mit 1 LP überleben |
| Allgemein | ⚗️ Alchemist | Heiltränke +25 % |
| Allgemein | ⏳ Flinke Hand | Fähigkeiten klingen 1 Runde schneller ab |
| Allgemein | 🍀 Glücksbringer | +20 % Gold |
| Allgemein | 🔋 Vorbereitet | +20 maximales Mana |
| Allgemein | 🗼 Turmläufer | Im Endlos-Turm 4 statt 3 Segen zur Wahl |
| Boss | 🥁 Kriegstrommel | +15 % Schaden in den ersten 3 Runden |
| Boss | 👁️ Allsehend | +10 % Krit-Chance gegen Bosse |
| Boss | 💀 Seelenraub | 6 % Lebensraub |
| Boss | 🐉 Drachenfeuer | Kritische Treffer setzen in Brand, immun gegen Feuer |
| Boss | 🌀 Sog | Gegner erleiden durch dich 10 % mehr Schaden |

## Boss-Items

| Boss | Effekt |
|---|---|
| Goblinhäuptling | 🥁 Kriegstrommel |
| Uralte Sumpfechse | 🐍 Giftzahn |
| Höhlenauge | 👁️ Allsehend |
| Urmammut | 🗿 Standhaft |
| Lichkönig | 💀 Seelenraub |
| Ignaroth | 🐉 Drachenfeuer |
| Erzkönig | 🍀 Glücksbringer |
| Hohepriesterin | 🌿 Lebensquell |
| Sturmfürst | ⚡ Kettenblitz |
| Leerenfürst | 💧 Manadieb |
| Sumpfhydra (Raid) | ✨ Reinheit |
| Frostriese (Raid) | ❄️ Frostbiss |
| Weltenverschlinger (Raid) | 🌀 Sog |

## Abstimmung (Simulation)

Simuliert wurde die Boss-Simulation mit seltener Ausrüstung, Tränken und bester Zielwahl, gemittelt
über alle 11 Klassen und 5 Gebietsbosse. Gemessen wurde die Siegquote ohne Effekt und mit einem
Effekt:

| Effekt | Siegquote | Unterschied |
|---|---|---|
| ohne | 80 % | – |
| Kettenblitz | 83 % | +3 |
| Glut | 84 % | +3 |
| Kriegstrommel | 84 % | +3 |
| Manadieb | 84 % | +4 |
| Henkersbeil | 85 % | +4 |
| Seelenraub | 86 % | +5 |
| Giftzahn | 86 % | +6 |
| Frostbiss | 87 % | +7 |
| Standhaft | 87 % | +7 |
| Bossschlächter | 89 % | +8 |
| Dornen | 89 % | +9 |
| Lebensquell | 89 % | +9 |
| Wachsam | 89 % | +9 |
| Unbeugsam | 90 % | +9 |

Alle Effekte sind spürbar, keiner kippt das Spiel. Die defensiven Effekte sind etwas stärker als die
offensiven.
