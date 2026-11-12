# Skilltree: vier Pfade

Der alte Skilltree war plumpes „+2 % Schaden pro Rang und Waffentyp“. Jetzt gibt es vier Pfade, die nicht an
einer Waffe hängen. Sie verändern, wie die vorhandenen Mechaniken wirken: Krit, Bluten, Gift, Feuer, Frost,
Betäubung, Abwehren, Mana und Tränke. Die Fähigkeiten bleiben auf den Waffen (docs/waffen-faehigkeiten.md).

Stand: Überarbeitung G2 umgesetzt (docs/skilltree-ueberarbeitung.md, Etappen 1–4; Spielstand v24). Brücken-
und Leisten-Knoten folgen in G4.

Code: `src/domain/skills.ts` (Baum, Regeln, `validateSkills`, alle Werte in `SKILL`, Hilfsfunktionen für den
Kampf), gemeinsamer Kern in `combatCore.ts`, Wirkung in `combat.ts` (solo) und `coopCombat.ts` (Koop), Anzeige
in `src/components/SkillTree.tsx`.

## Regeln

- **Skillpunkte:** alle 2 Level einer (`earnedSkillPoints`), Level 60: 30.
- **Stufen:** Eine Stufe öffnet sich mit 0 / 3 / 6 / 9 Punkten im selben Pfad, die Meisterschaft mit **12**
  (`TIER_POINTS`). Vor der Meisterschaft hat jeder Pfad 18–20 Ränge – wer meistert, lässt 6–8 bewusst liegen.
  Typisch bei Lv. 60: Meisterpfad 13 (12 + Meisterschaft) und Zweitpfad 17.
- **Voraussetzungen:** Jeder Knoten ab Stufe 2 braucht einen Rang in einem seiner Vorgänger (`requires`, einer
  genügt). Die neuen Knoten in der Mitte von Stufe 1 öffnen beide Knoten auf Stufe 2.
- **Gabelungen:** Auf Stufe 3 zwei Knoten, man nimmt einen (`fork: "<pfad>"`). Die Meisterschaft ist ebenfalls
  eine Gabel (`fork: "<pfad>-master"`).
- **Meisterschaft:** zwei pro Pfad, nur eine im ganzen Baum.
- **Prüfung (`validateSkills`):** verwirft Ränge gegen die Regeln, bis der Stand stabil ist: unbekannte Knoten,
  zu hohe Ränge, Stufen ohne genug Punkte in den Stufen darüber, fehlende Voraussetzung, beide Seiten einer
  Gabel, mehrere Meisterschaften, mit Level auch mehr Punkte als verdient (die tiefsten zuerst).
  `sanitizeSkills` ruft sie auf – in `repairSave` (Client) und `getHeroCombatProfile` (auch Koop-Server).
- **Spielstand v24:** Die Migration erstattet alle Skillpunkte kostenlos zurück (`character.skills = {}`) und
  setzt `character.skillTreeNotice` – ein Toast weist einmal darauf hin („Zum Skilltree“). Der Koop-Server
  zählt Cloud-Stände vor v24 ohne Ränge.
- **Zurücksetzen:** wie bisher am Trainingsplatz.

## Die Pfade

Werte pro Rang. **Neu** bzw. **geändert** gegenüber dem Baum vor G2.

### ⚔️ Klinge – Krit, Bluten, Mehrfachtreffer

| Stufe | Knoten | Ränge | Wirkung |
|---|---|---|---|
| 1 | 🔪 Scharfe Klingen | 3 | +3 % Krit-Chance (über die Grund-Obergrenze, gesamt höchstens 60 %) |
| 1 | 🌪️ **Wirbelnde Klingen** | 2 | Fähigkeiten mit mindestens 2 Treffern +8 % Schaden |
| 1 | 🩸 Gezahnte Klingen | 3 | Eigenes Bluten +20 % Schaden |
| 2 | ⚡ Adrenalin | 3 | +2 Mana pro kritischem Treffer |
| 2 | 🐺 Blutgeruch | 3 | +5 % Krit-Chance gegen Blutende |
| 3 | 🌾 Schnitter *oder* | 1 | Krits lassen 2 Runden bluten (15 % des Heldenschadens). **Blutet der Gegner schon stärker, hält jenes Bluten 1 Runde länger** (einmal pro Runde und Gegner) |
| 3 | 🎯 Durchschlag | 1 | Krits ignorieren die Rüstung |
| 4 | 🤺 **Klingentanz** | 2 | Nach einer Fähigkeit mit mindestens 2 Treffern: nächster normaler Angriff +10 % |
| 4 | 🪓 Hinrichter | 3 | **+10 %** Schaden gegen Gegner unter 30 % LP |
| ★ | 💥 Blutsturz *oder* | 1 | Läuft Bluten aus, platzt die Wunde: Blutschaden von 3 Runden auf einmal |
| ★ | 🗡️ **Tausend Schnitte** | 1 | Jeder Treffer einer Mehrfachtreffer-Fähigkeit legt einen Bluten-Stapel (8 % des Heldenschadens, 2 Runden), bis 5 Stapel, neue frischen die Dauer auf |

Offene Wunde ist entfernt (geht im Schnitter auf).

### 🛡️ Wehr – Abwehren, Konter, Betäubung

| Stufe | Knoten | Ränge | Wirkung |
|---|---|---|---|
| 1 | 🛡️ Eiserne Haut | 3 | **+4 %** Rüstung |
| 1 | 🧱 **Deckung** | 2 | −5 Mana für Fähigkeiten, die abwehren oder blocken (Parade, Vergeltung, Bollwerk, Schildwall, Ausweichschuss …), nie unter 5 |
| 1 | 🧘 Gefasst | 2 | Abwehren +5 Mana |
| 2 | 💫 Erschütterung | 3 | Wen man betäubt/einfriert, erleidet in der Runde danach +8 % Schaden |
| 2 | ⚔️ Gegenschlag | 3 | Nach dem Abwehren macht die nächste Aktion +15 % Schaden |
| 3 | 🪨 Fels *oder* | 1 | Beim Abwehren kommen nur 25 % statt 50 % durch |
| 3 | 🌵 Stachelwehr | 1 | Wer den Abwehrenden trifft, erleidet 50 % davon selbst |
| 4 | 🔨 Wuchtschlag | 3 | Betäuben/Einfrieren mit Chance gelingt +6 % öfter |
| 4 | ✋ Unterbrecher | 1 | +15 Mana für eine Betäubung, ein unterbrochenes Ritual oder einen taumelnden Boss |
| ★ | 🔥 Zorn des Bollwerks *oder* | 1 | Pro Runde mit Abwehren/Bollwerk/Parade, in der man getroffen wird: +8 % Schaden, höchstens 5 Stapel |
| ★ | 🔰 **Wächterschwur** | 1 | Abwehren heilt 4 % der LP. Koop: Abwehren ist ein Spott mit 60 % Anteil (`GUARD_OATH_SHARE`) |

### 🔮 Arkan – Mana, Abklingzeiten, Elemente

| Stufe | Knoten | Ränge | Wirkung |
|---|---|---|---|
| 1 | 💧 Tiefer Brunnen | 3 | +5 Mana |
| 1 | 🔋 **Konzentration** | 3 | Runde ohne Fähigkeit (Angriff oder Abwehren): +2 Mana |
| 1 | 🔥 Funkenflug | 3 | Eigenes Feuer +15 % Schaden |
| 2 | 🌊 Manafluss | 3 | +1 Mana pro Runde |
| 2 | ✨ Eröffnung | 2 | **In den Runden 1 und 2** kosten Fähigkeiten 25 % weniger |
| 3 | 🌋 Pyromant *oder* | 1 | Eigenes Feuer brennt 1 Runde länger, Brennende erleiden +15 % |
| 3 | ❄️ Kryomant | 1 | Einfrieren gelingt +20 % öfter, Eingefrorene erleiden in der Runde danach +25 %. **Eigene Betäubungen zählen als Einfrieren** (markieren `chilled`) |
| 4 | 💦 Schmelzen | 1 | Gegen Eingefrorene: Feuer-Fähigkeiten +60 % (tauen auf), **alle anderen Treffer +15 %** |
| 4 | 🔁 Nachhall | 3 | **8 % Chance, dass eine Fähigkeit kein Mana kostet** (vorher: keine Abklingzeit) |
| ★ | 🔮 Echo *oder* | 1 | Jede 3. Fähigkeit im Kampf kostet kein Mana und trifft ein zweites Mal mit 30 % Schaden |
| ★ | 🧛 **Blutmagie** | 1 | Reicht das Mana nicht, zahlt man den Rest mit 2 LP pro Mana – nicht, wenn man danach unter 25 % LP wäre. −15 % Mana-Maximum |

### ☠️ Plage – Gift, Tränke, Überleben

| Stufe | Knoten | Ränge | Wirkung |
|---|---|---|---|
| 1 | 💪 Zähigkeit | **2** | +2 % LP |
| 1 | 🦷 **Vergiftete Waffen** | 3 | Normale Angriffe vergiften mit 8 % Chance: 20 % des Heldenschadens pro Runde, 3 Runden |
| 1 | 🧪 Giftmischer | 3 | Eigenes Gift +20 % Schaden |
| 2 | 🌱 Kräuterkunde | 2 | Heiltränke **+8 %** |
| 2 | 🌿 Gegengift | 2 | Gift, Feuer und Bluten am Helden −10 % |
| 2 | 🐍 Schleichendes Gift | 1 | Eigenes Gift stapelt sich bis zu 3-mal |
| 3 | 🦇 Blutsauger *oder* | 1 | 2 % Lebensraub |
| 3 | 👻 Schemen | 1 | 3 % Chance, einem Angriff auszuweichen (samt Zusatzeffekten) |
| 4 | 🩹 Notverband | 3 | Einmal pro Kampf unter 30 % LP: +4 % LP Heilung |
| 4 | 🦠 Seuche | 1 | Fällt ein vergifteter Gegner, springt sein Gift über |
| ★ | ☠️ Fäulnis *oder* | 1 | Gift stapelt sich; bei 3 Stapeln platzt es mit dem ganzen restlichen Giftschaden |
| ★ | 🔗 **Lebensband** | 1 | Heilung über das Maximum wird zum Schild (Schild-Topf `ward`, höchstens 15 % der max. LP), er fängt Treffer vor den LP ab und verfällt am Kampfende. Koop: auch die Heilung des Helden bei Mitspielern |

## Umsetzung im Kampf

- Grundwerte (Krit, Rüstung, LP, Mana und der Mana-Faktor der Blutmagie) stecken im Heldenprofil
  (`skillStatBonus`) – sie wirken überall, auch im Koop und im Turm.
- Die Ränge reisen als `skills` im Profil und im Kampfzustand mit (`BattleState.skills`, `CoopHero.skills`).
- Zustände: am Gegner `dazed`/`chilled` (betäubt/eingefroren, zählt in der Runde danach), `stacks` beim Gift
  und beim Bluten (Tausend Schnitte); am Helden `riposte`, `wrath`, `bandaged`, `casts` (Echo), `bladeDance`
  (Klingentanz) und `ward` (Schild-Topf).
- Ereignisse: `dodged` (Schemen), `burst` bei Bluten/Gift (Blutsturz, Fäulnis), `echo` und `free` (Nachhall) an
  der Fähigkeit, `stacks` am Bluten, `bloodMagic` (LP-Kosten), `shieldGained` (mit `by` im Koop, wenn ein
  Mitspieler den Schild gibt), `warded` am Treffer (vom Schild geschluckt, zusätzlich zu `damage`).
- **Mehrfachtreffer** heisst: eine Fähigkeit mit mindestens 2 Treffern in dieser Runde (`abilityHits`, also mit
  Raserei unter halben LP), Flächenwirkung allein zählt nicht.
- **Schild-Topf:** Lebensband füllt `ward` (in G3 auch der Gruppenschild des Paladins), zusammen höchstens
  `WARD_MAX_SHARE` = 15 % der max. LP. Er schluckt Treffer von Boss und Begleitern; Explosion, Fluch sowie Gift,
  Feuer und Bluten am Helden gehen an ihm vorbei. Er liegt in den Wirkungen des Kampfs und ist darum in jedem
  neuen Kampf (Turm-Stockwerk, Dungeon-Raum, Koop-Dungeon-Kampf) wieder weg.
- **Tausend Schnitte, Stapelregel:** Nur die Stapel des Knotens stapeln sich. Ein liegendes Bluten ohne Stapel
  (Axtwurf, Plünderer, Schnitter) bleibt, solange es stärker ist als ein einzelner neuer Stapel; ein Bluten ohne
  Stapel ersetzt umgekehrt den Stapel nur, wenn es stärker ist als der ganze Stapel (`strongerDot`). So bleibt
  der Höchstwert bei 5 × 8 % = 40 % des Heldenschadens pro Runde.
- Koop: Gift, Feuer und Bluten zählen für den Helden, der sie gelegt hat (`sourceId`). Tausend Schnitte ist ein
  **gemeinsamer Stapel pro Gegner** (Deckel 5 für alle zusammen): `stacksBy` zählt die Stapel pro Held, die
  Bedrohung jedes Ticks verteilt sich danach (Paladin ×2), am Deckel geht ein Stapel vom Held mit den meisten
  über; `sourceId` ist, wer zuletzt gelegt hat (seine Skills gelten für Blutsturz). Unterbrecher belohnt den,
  der betäubt bzw. den Heiler getroffen hat; einen taumelnden Boss bringt die ganze Gruppe zustande.
- Koop-Spott: Bollwerk, Schildwall (0,75) und Wächterschwur (0,6) werden nach Anteil aufsteigend verrechnet –
  der höchste Anteil gewinnt, bei Gleichstand wer zuletzt handelt.
- Koop-Protokoll: Version 2 (`COOP_PROTOCOL_VERSION`) wegen der neuen Ereignisse; ältere Clients müssen neu laden.
- Zufall: Knoten mit Chance (Schemen, Nachhall, Vergiftete Waffen) würfeln nur, wenn man sie hat – ohne Skills
  laufen Kämpfe genau wie vorher.

## Abstimmung (Simulation)

`src/test/classSim.ts`, Bericht `SIM_MODE=master npx vitest run src/domain/zzClassSim.test.ts` (Verteilung
„Meisterpfad + Zweitpfad“ mit `CLASS_SKILL_PLANS`: bester und zweitbester Pfad je Klasse aus dem Review,
`SIM_MASTER=1` für die zweite Meisterschaft). Gebietsbosse Lv. 10–60, seltene Ausrüstung, N = 300.

| Klasse | ohne Skills | alter Baum (16 + 14) | neu, Meisterschaft A (13 + 17) | neu, Meisterschaft B |
|---|---|---|---|---|
| Magier | 42 | 66 | 68 | 64 |
| Hexer | 43 | 72 | 72 | 71 |
| Assassine | 69 | 84 | 84 | 83 |
| Waldläufer | 48 | 64 | 66 | 66 |
| Duellant | 17 | 51 | 63 | 61 |
| Plünderer | 43 | 77 | 81 | 76 |
| Kleriker | 53 | 83 | 85 | 85 |
| Paladin | 49 | 85 | 84 | 83 |
| Berserker | 23 | 53 | 61 | 63 |
| Champion | 54 | 78 | 83 | 82 |
| Wächter | 56 | 84 | 85 | 85 |
| **Mittel / Abstand** | | **73 / 34** | **76 / 25** | **75 / 24** |

Das Budget bleibt im Rahmen (+3 Punkte im Mittel). Gewonnen haben vor allem die Schwächsten mit
Mehrfachtreffer-Waffen (Duellant, Berserker) durch Wirbelnde Klingen, Klingentanz und Vergiftete Waffen; die
Spitze bleibt bei 85 %, der Abstand sinkt von 34 auf 25 Punkte. Beide Meisterschaften jedes Pfads liegen
nah beieinander. Leitplanke: `classBalance.test.ts` („voller Baum“: jede Klasse +5 Punkte, höchstens 95 %,
Abstand ≤ 35).

Im Playtest beobachten: Duellant und Berserker mit Klinge (Mehrfachtreffer-Knoten), Blutmagie mit viel
Lebensraub, Lebensband beim Kleriker im Koop, Wächterschwur als Ersatz-Tank im Koop.

## Ideen für später

- Brückenknoten und Leisten-Knoten (G4, docs/skilltree-ueberarbeitung.md 3.6 und 4).
- Erfolge für Meisterschaften („Blutsturz 10-mal ausgelöst“) – mit v25 (G4).
- Weitere Gabelungen auf Stufe 4.
