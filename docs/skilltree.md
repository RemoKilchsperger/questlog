# Skilltree: vier Pfade

Der alte Skilltree war plumpes „+2 % Schaden pro Rang und Waffentyp“. Jetzt gibt es vier Pfade, die nicht an
einer Waffe hängen. Sie verändern, wie die vorhandenen Mechaniken wirken: Krit, Bluten, Gift, Feuer, Frost,
Betäubung, Abwehren, Mana und Tränke. Die Fähigkeiten bleiben auf den Waffen (docs/waffen-faehigkeiten.md).

Code: `src/domain/skills.ts` (Baum, Regeln, alle Werte in `SKILL`, Hilfsfunktionen für den Kampf),
Wirkung in `combat.ts` (solo) und `coopCombat.ts` (Koop), Anzeige in `src/components/SkillTree.tsx`.

## Regeln

- **Skillpunkte:** alle 2 Level einer (`earnedSkillPoints`), Level 60: 30. Mit einem Punkt pro Level (59)
  hätte man am Ende fast jeden Knoten – dann gäbe es keine echten Entscheidungen mehr.
- **Stufen:** Eine Stufe öffnet sich mit 0 / 3 / 6 / 9 Punkten im selben Pfad, die Meisterschaft mit 15
  (`TIER_POINTS`). Bis zur Meisterschaft hat jeder Pfad 15–17 Ränge.
- **Voraussetzungen:** Jeder Knoten ab Stufe 2 braucht einen Rang in einem seiner Vorgänger (`requires`, einer
  genügt). Im Baum sind sie mit Linien verbunden.
- **Gabelung:** Auf Stufe 3 gibt es pro Pfad zwei Knoten, man nimmt einen (`fork`).
- **Meisterschaft:** nur eine im ganzen Baum. Mit 30 Punkten heisst das: ein voller Pfad und knapp ein
  halber zweiter.
- **Alte Stände:** Ränge des alten Baums (pro Waffentyp) fallen beim Laden weg (`sanitizeSkills` in
  `repairSave`), die Punkte sind wieder frei. `character.skills` behält seinen Namen, die Schlüssel sind jetzt
  Knoten-Ids. Der Koop-Server liest sie über `getHeroCombatProfile` genauso.
- **Zurücksetzen:** wie bisher am Trainingsplatz.

## Die Pfade

Werte pro Rang (Stand nach der Simulation).

### ⚔️ Klinge – Krit, Bluten, Mehrfachtreffer

| Stufe | Knoten | Ränge | Wirkung |
|---|---|---|---|
| 1 | 🔪 Scharfe Klingen | 3 | +3 % Krit-Chance (über die normale Obergrenze hinaus) |
| 1 | 🩸 Gezahnte Klingen | 3 | Eigenes Bluten +20 % Schaden |
| 2 | ⚡ Adrenalin | 3 | +2 Mana pro kritischem Treffer |
| 2 | 🐺 Blutgeruch | 3 | +5 % Krit-Chance gegen Blutende |
| 3 | 🌾 Schnitter *oder* | 1 | Krits lassen 2 Runden bluten (15 % des Heldenschadens) |
| 3 | 🎯 Durchschlag | 1 | Krits ignorieren die Rüstung |
| 4 | 🩹 Offene Wunde | 1 | Krit auf einen Blutenden: 1 Runde länger bluten |
| 4 | 🪓 Hinrichter | 3 | +6 % Schaden gegen Gegner unter 30 % LP |
| ★ | 💥 Blutsturz | 1 | Läuft Bluten aus, platzt die Wunde: Blutschaden von 3 Runden auf einmal |

### 🛡️ Wehr – Abwehren, Konter, Betäubung

| Stufe | Knoten | Ränge | Wirkung |
|---|---|---|---|
| 1 | 🛡️ Eiserne Haut | 3 | +3 % Rüstung |
| 1 | 🧘 Gefasst | 2 | Abwehren +5 Mana |
| 2 | 💫 Erschütterung | 3 | Wen man betäubt/einfriert, erleidet in der Runde danach +8 % Schaden |
| 2 | ⚔️ Gegenschlag | 3 | Nach dem Abwehren macht die nächste Aktion +15 % Schaden |
| 3 | 🪨 Fels *oder* | 1 | Beim Abwehren kommen nur 25 % statt 50 % durch |
| 3 | 🌵 Stachelwehr | 1 | Wer den Abwehrenden trifft, erleidet 50 % davon selbst |
| 4 | 🔨 Wuchtschlag | 3 | Betäuben/Einfrieren mit Chance gelingt +6 % öfter |
| 4 | ✋ Unterbrecher | 1 | +15 Mana für eine Betäubung, ein unterbrochenes Ritual oder einen taumelnden Boss |
| ★ | 🔥 Zorn des Bollwerks | 1 | Pro Runde mit Abwehren/Bollwerk/Parade, in der man getroffen wird: +8 % Schaden, höchstens 5 Stapel |

### 🔮 Arkan – Mana, Abklingzeiten, Elemente

| Stufe | Knoten | Ränge | Wirkung |
|---|---|---|---|
| 1 | 💧 Tiefer Brunnen | 3 | +5 Mana |
| 1 | 🔥 Funkenflug | 3 | Eigenes Feuer +15 % Schaden |
| 2 | 🌊 Manafluss | 3 | +1 Mana pro Runde |
| 2 | ✨ Eröffnung | 2 | In Runde 1 kosten Fähigkeiten 25 % weniger |
| 3 | 🌋 Pyromant *oder* | 1 | Eigenes Feuer brennt 1 Runde länger, Brennende erleiden +15 % |
| 3 | ❄️ Kryomant | 1 | Einfrieren gelingt +20 % öfter, Eingefrorene erleiden in der Runde danach +25 % |
| 4 | 💦 Schmelzen | 1 | Fähigkeiten mit Feuer machen gegen Eingefrorene +60 % Schaden und tauen sie auf |
| 4 | 🔁 Nachhall | 3 | 5 % Chance, dass eine Fähigkeit keine Abklingzeit auslöst |
| ★ | 🔮 Echo | 1 | Jede 3. Fähigkeit im Kampf kostet kein Mana und trifft ein zweites Mal mit 30 % Schaden |

### ☠️ Plage – Gift, Tränke, Überleben

| Stufe | Knoten | Ränge | Wirkung |
|---|---|---|---|
| 1 | 💪 Zähigkeit | 3 | +2 % LP |
| 1 | 🧪 Giftmischer | 3 | Eigenes Gift +20 % Schaden |
| 2 | 🌱 Kräuterkunde | 2 | Heiltränke +5 % |
| 2 | 🌿 Gegengift | 2 | Gift, Feuer und Bluten am Helden −10 % |
| 2 | 🐍 Schleichendes Gift | 1 | Eigenes Gift stapelt sich bis zu 3-mal |
| 3 | 🦇 Blutsauger *oder* | 1 | 2 % Lebensraub |
| 3 | 👻 Schemen | 1 | 3 % Chance, einem Angriff auszuweichen (samt Zusatzeffekten) |
| 4 | 🩹 Notverband | 3 | Einmal pro Kampf unter 30 % LP: +4 % LP Heilung |
| 4 | 🦠 Seuche | 1 | Fällt ein vergifteter Gegner, springt sein Gift über |
| ★ | ☠️ Fäulnis | 1 | Gift stapelt sich; bei 3 Stapeln platzt es mit dem ganzen restlichen Giftschaden |

## Umsetzung im Kampf

- Grundwerte (Krit, Rüstung, LP, Mana) stecken im Heldenprofil (`skillStatBonus`) – sie wirken überall, auch
  im Koop und im Turm.
- Die Ränge reisen als `skills` im Profil und im Kampfzustand mit (`BattleState.skills`, `CoopHero.skills`).
- Neue Zustände: am Gegner `dazed`/`chilled` (betäubt/eingefroren, zählt in der Runde danach), `stacks` beim
  Gift; am Helden `riposte`, `wrath`, `bandaged` und `casts` (für das Echo).
- Neue Ereignisse: `dodged` (Schemen), `burst` bei Bluten/Gift (Blutsturz, Fäulnis), `echo` an der Fähigkeit.
- Koop: Gift, Feuer und Bluten zählen für den Helden, der sie gelegt hat (`sourceId`) – seine Knoten machen sie
  stärker, lassen sein Gift stapeln und platzen. Unterbrecher belohnt den, der betäubt bzw. den Heiler
  getroffen hat; einen taumelnden Boss bringt die ganze Gruppe zustande.
- Zufall: Knoten mit Chance (Schemen, Nachhall) würfeln nur, wenn man sie hat – ohne Skills laufen Kämpfe
  genau wie vorher.

## Abstimmung (Simulation)

Gebietsbosse auf Boss-Level mit Heiltränken, gewöhnlicher und seltener Ausrüstung, reagierende KI (wehrt grosse
Fähigkeiten ab). Pro Klasse die mittlere Siegquote; „alt“ = der frühere Baum (+10 % Waffenschaden). Jeder Pfad
von oben nach unten gelernt, A/B = Weg der Gabelung.

| Klasse | ohne | alt | Klinge A/B | Wehr A/B | Arkan A/B | Plage A/B |
|---|---|---|---|---|---|---|
| Champion | 40 | 48 | 52 / 52 | 49 / 46 | 47 / 47 | 55 / 58 |
| Wächter | 40 | 51 | 59 / 55 | 62 / 63 | 58 / 58 | 58 / 59 |
| Paladin | 14 | 20 | 26 / 23 | 20 / 20 | 17 / 17 | 28 / 31 |
| Magier | 29 | 41 | 44 / 39 | 42 / 41 | 52 / 42 | 47 / 48 |

Die erste Fassung war deutlich zu stark: Plage (LP, Heiltränke) lag bei 81–84 %, Arkan hob den Magier auf 59 %
(Mana ist sein Engpass). Abgeschwächt wurden vor allem Zähigkeit (4 → 2 %), Kräuterkunde (15 → 5 %),
Notverband (10 → 4 %), Tiefer Brunnen (10 → 5), Manafluss (2 → 1), Eröffnung (50 → 25 %), Nachhall (8 → 5 %),
Echo (50 → 30 %) und Schmelzen (×2 → ×1,6). Jetzt liegt jeder Pfad zwischen gleichauf und etwa +12 Punkten
über dem alten Baum. Plage bleibt für alle ein guter Weg, die anderen Pfade passen zu „ihren“ Klassen
(Wächter: Wehr, Magier: Arkan mit Feuer und Eis).

Simulation: Scratchpad `sim/zzskill.test.ts` (nach `src/domain` kopieren, `SIM_N`, `SIM_RAR`, `SIM_CLASSES`,
`SIM_BOSSES`, `SIM_OUT`). Koop ist nicht eigens simuliert – die Knoten wirken pro Held wie solo.

## Ideen für später

- Pfad-Grafik im Kampf: z. B. Zorn-Stapel oder Gift-Stapel sichtbar am Helden bzw. Gegner.
- Weitere Gabelungen auf Stufe 4, damit sich auch volle Pfade unterscheiden.
- Erfolge für Meisterschaften („Blutsturz 10-mal ausgelöst“).
