# Skilltree-Überarbeitung – Konzept

Stand: 2026-11-12. Konzept, noch nicht umgesetzt (kommt in Etappe G2 des gemeinsamen Plans). Grundlage:
docs/balancing-review-waffen-klassen.md (Abschnitte 4 und 5), heutiger Baum in `src/domain/skills.ts` und
docs/skilltree.md. Alle offenen Fragen sind entschieden (Abschnitt 10); die Krit-Gesamtobergrenze (3.1) und die
Koop-Protokollversion (6) sind mit G1 schon umgesetzt.

Parallel entsteht ein neues Klassenkonzept (docs/klassen-neukonzept.md). Der Baum bleibt darum
**klassenunabhängig**: Kein Knoten nennt eine Klasse. Stellen, deren Wert vom Klassenkonzept abhängt, sind
mit **[K]** markiert. **Abgleich erledigt (2026-11-12):** Alle [K]-Stellen sind entschieden, die
Entscheidungen stehen direkt an der Stelle und gesammelt in docs/klassen-skilltree-abgleich.md. Der Entwickler hat
**Modell C „Klassen mit Kern“** gewählt (Klassenleiste + Signaturfähigkeit pro Klasse); der Baum ist darauf
ausgerichtet (Abschnitt 3.6 Leisten-Knoten, Abschnitt 5.1 Signatur-Regeln).

---

## 1. Ziel und Leitlinien

**Probleme heute** (Review, Abschnitt 4):

- Die Meisterschaft braucht 15 Punkte im Pfad, der Pfad hat aber nur 16–17 Ränge. Wer eine Meisterschaft
  will, nimmt fast alles. Entscheiden kann man nur den Pfad und eine Gabelung.
- Einige Knoten bringen kaum etwas (Hinrichter, Nachhall, Kräuterkunde, Eröffnung, Eiserne Haut).
- Einige Knoten wirken nur mit einer bestimmten Waffe: die Gift-Knoten der Plage nur mit Dolch oder Zepter,
  Kryomant und Schmelzen nur mit dem Stab. Das Thema „Mehrfachtreffer“ der Klinge hat keinen Knoten.
- Der Schnitter wirkt nie, solange ein stärkeres Bluten liegt (Axtwurf, Spalter, Plünderer-Krit).
- Plage ist schon heute für 5 von 11 Klassen der beste Pfad.

**Leitlinien**

1. **Echte Entscheidungen statt linearer Pfade.** Jeder Pfad hat 18–20 Ränge vor der Meisterschaft, die
   Meisterschaft öffnet bei **12** Punkten. Wer meistert, lässt also 6–8 Ränge des Pfads bewusst liegen.
2. **Zwei Meisterschaften pro Pfad zur Wahl.** Weiterhin nur eine Meisterschaft im ganzen Baum.
3. **Keine waffengebundenen Sackgassen.** Jede Mechanik eines Pfads (Bluten, Gift, Feuer, Einfrieren,
   Abwehr) braucht eine Quelle im Pfad selbst, die mit jeder Waffe funktioniert.
4. **Plage nicht stärker machen.** Was dort dazukommt, geht anderswo im Pfad weg.
5. **Gleiches Gesamtbudget.** Weiterhin 1 Punkt alle 2 Level (30 bei Lv. 60). Gesamtstärke ungefähr wie
   heute (siehe Simulation, Abschnitt 7).
6. **Zufall nur, wer den Knoten hat.** Knoten mit Chance würfeln nur bei Rang > 0. So bleiben Kämpfe ohne
   Skills gleich, und der Golden Master ändert sich nur bei Kämpfen mit Skillpfaden.

---

## 2. Regeln (neu)

| Regel | heute | neu |
|---|---|---|
| Skillpunkte | 1 alle 2 Level, Lv. 60: 30 | unverändert |
| Stufen (`TIER_POINTS`) | 0 / 3 / 6 / 9 / **15** | 0 / 3 / 6 / 9 / **12** |
| Ränge vor der Meisterschaft | 16–17 | 18–20 |
| Meisterschaften | 1 pro Pfad, 1 im Baum | **2 pro Pfad als Gabel** (`fork: "<pfad>-master"`), 1 im Baum |
| Brückenknoten | – | 6 Stück, je 6 Punkte in zwei Pfaden, **höchstens einer** (Abschnitt 4) |
| Gabelung Stufe 3 | 1 pro Pfad | unverändert |
| Spalten | 0–2 | Stufe 1 bekommt in allen Pfaden die Spalte 1, Stufe 5 nutzt Spalte 0 und 2 |

Typische Verteilung bei Lv. 60: Meisterpfad 13 (12 + Meisterschaft), Zweitpfad 17, oder zwei Pfade bis
Stufe 4 und eine Brücke.

---

## 3. Der neue Baum

Legende: **neu**, **geändert** (alt → neu), unverändert, **entfernt**. „braucht“ = mindestens einer der
genannten Knoten (`requires`). Werte als Konstanten in `SKILL` (`skills.ts:107`).

### 3.1 Klinge – Krit, Bluten, Mehrfachtreffer

| Stufe | Spalte | Knoten | Ränge | Wert pro Rang | braucht | Status |
|---|---|---|---|---|---|---|
| 1 | 0 | Scharfe Klingen | 3 | +3 % Krit (über der Grund-Obergrenze von 30 %, aber unter der **Gesamt-Obergrenze von 60 %**) **[K]** | – | Wert unverändert, Obergrenze neu |
| 1 | 1 | **Wirbelnde Klingen** | 2 | Fähigkeiten mit mindestens 2 Treffern: +8 % Schaden | – | **neu** |
| 1 | 2 | Gezahnte Klingen | 3 | eigenes Bluten +20 % | – | unverändert |
| 2 | 0 | Adrenalin | 3 | +2 Mana pro Krit | Scharfe Klingen, Wirbelnde Klingen | geändert (braucht) |
| 2 | 2 | Blutgeruch | 3 | +5 % Krit gegen Blutende (zählt in die Gesamt-Obergrenze von 60 %) **[K]** | Gezahnte Klingen, Wirbelnde Klingen | geändert (braucht) |
| 3 | 0 | **Schnitter** *oder* | 1 | Krit: 2 Runden Bluten mit 15 % des Heldenschadens. **Blutet der Gegner schon stärker, hält dieses Bluten 1 Runde länger.** | Adrenalin, Blutgeruch | **geändert** (Fix, übernimmt Offene Wunde) |
| 3 | 2 | Durchschlag | 1 | Krits ignorieren die Rüstung | Adrenalin, Blutgeruch | unverändert |
| 4 | 0 | **Klingentanz** | 2 | Nach einer Fähigkeit mit mindestens 2 Treffern macht der nächste normale Angriff +10 % Schaden | Schnitter, Durchschlag | **neu** |
| 4 | 2 | Hinrichter | 3 | Schaden gegen Gegner unter 30 % LP: **+6 % → +10 %** | Schnitter, Durchschlag | **geändert** |
| – | – | ~~Offene Wunde~~ | 1 | geht im Schnitter auf | – | **entfernt** |
| ★ | 0 | Blutsturz *oder* | 1 | Läuft Bluten aus, platzt es: Schaden von 3 Runden auf einmal | Klingentanz, Hinrichter | geändert (braucht) |
| ★ | 2 | **Tausend Schnitte** | 1 | siehe 3.5 | Klingentanz, Hinrichter | **neu** |

Ränge vor der Meisterschaft: 3 + 2 + 3 + 3 + 3 + 1 + 2 + 3 = **20**.

**Schnitter-Fix:** Heute legt der Schnitter nur, wenn kein Bluten ≥ 15 % liegt (`combatCore.ts:561`). Mit
Axtwurf (25 %), Spalter (25 %) oder dem Plünderer-Krit (25 %) **[K]** wirkt er darum nie. Neu verlängert er
in diesem Fall das stärkere Bluten um 1 Runde (höchstens einmal pro Runde, damit Mehrfachtreffer es nicht
endlos strecken). Das war bisher die Aufgabe der Offenen Wunde. Ein Knoten weniger, und der Schnitter hilft
gerade den Bluten-Builds.

**Krit-Gesamtobergrenze [K], entschieden:** Heute zählen Klasse, Skilltree, Item-Effekte und Segen über der
30-%-Grenze ohne Deckel; die Assassine kommt so auf 60–75 %. Neu gilt eine
Gesamt-Obergrenze von **60 %** (`CRIT_CAP_TOTAL`), geprüft beim Würfeln des Treffers (`strikeFactors`), weil
Blutgeruch, Allsehend und Präzision erst dort dazukommen. Die Grund-Obergrenze von 30 % (Grundwert, Charisma,
Rüstung) bleibt. Für Spieler ohne Assassine ändert sich praktisch nichts. Die Obergrenze kam mit den
Klassen-Sofortkorrekturen **vor** dieser Überarbeitung (G1, umgesetzt: `CRIT_CAP_BASE`/`CRIT_CAP_TOTAL` in
`combatCore.ts`). Die Anzeige im Charakter zeigt höchstens 60 %; sichere Krits (Schattenschritt, Halsschnitt)
gelten unabhängig davon.

**Plünderer [K], entschieden:** Das Klassenkonzept übernimmt diesen Fix. Eine eigene Plünderer-Regel für den
Schnitter gibt es nicht.

### 3.2 Wehr – Abwehren, Konter, Betäubung

| Stufe | Spalte | Knoten | Ränge | Wert pro Rang | braucht | Status |
|---|---|---|---|---|---|---|
| 1 | 0 | Eiserne Haut | 3 | Rüstung **+3 % → +4 %** | – | **geändert** |
| 1 | 1 | **Deckung** | 2 | −5 Mana für Fähigkeiten, die abwehren oder blocken (`guard`, `bulwark`, Schildwall) | – | **neu** |
| 1 | 2 | Gefasst | 2 | Abwehren +5 Mana | – | unverändert |
| 2 | 0 | Erschütterung | 3 | +8 % Schaden in der Runde nach einer Betäubung | Eiserne Haut, Deckung | geändert (braucht) |
| 2 | 2 | Gegenschlag | 3 | +15 % auf die Aktion nach dem Abwehren | Gefasst, Deckung | geändert (braucht) |
| 3 | 0 | Fels *oder* | 1 | Abwehren: 25 % statt 50 % Schaden | Erschütterung, Gegenschlag | unverändert |
| 3 | 2 | Stachelwehr | 1 | Abwehren: Angreifer erleidet 50 % | Erschütterung, Gegenschlag | unverändert |
| 4 | 0 | Wuchtschlag | 3 | +6 % Chance bei Betäubung/Einfrieren mit Chance | Fels, Stachelwehr | unverändert |
| 4 | 2 | Unterbrecher | 1 | +15 Mana für Betäubung, Unterbrechung, Taumeln | Fels, Stachelwehr | unverändert |
| ★ | 0 | Zorn des Bollwerks *oder* | 1 | +8 % pro Runde mit Abwehr/Block/Parade, höchstens 5 Stapel. Die Duellhaltung (Signatur des Duellanten) zählt des Duellanten wie eine Parade **[K]** | Wuchtschlag, Unterbrecher | unverändert |
| ★ | 2 | **Wächterschwur** | 1 | siehe 3.5 | Wuchtschlag, Unterbrecher | **neu** |

Ränge vor der Meisterschaft: 3 + 2 + 2 + 3 + 3 + 1 + 3 + 1 = **18**.

**Deckung** wirkt mit 9 von 11 Waffentypen: Dolch (Schattenschritt), Schwert (Parade), Zweihandschwert
(Konterstellung), Grosshammer (Unerschütterlich), Stab (Arkaner Schild), Bogen (Ausweichschuss), Schild
(Bollwerk, Vergeltung, Schildwall). Nur Axt und Grossaxt gehen leer aus, dort bleibt das Abwehren (Gefasst,
Gegenschlag). Mit Bollwerk für 20 Mana kostet es bei 2 Rängen 10 Mana. Untergrenze 5 Mana, sonst ist
Bollwerk mit halben Kosten **[K]** gratis. *Entschieden:* Das halbe Bollwerk des Paladins bleibt (Passiv
„Schildeid“); Paladin + Deckung 2 zahlt für Bollwerk 5 Mana (Untergrenze). Die Signaturen der Klassen
kosten kein Mana, Deckung wirkt auf sie nicht.

### 3.3 Arkan – Mana, Abklingzeiten, Elemente

| Stufe | Spalte | Knoten | Ränge | Wert pro Rang | braucht | Status |
|---|---|---|---|---|---|---|
| 1 | 0 | Tiefer Brunnen | 3 | +5 Mana | – | unverändert |
| 1 | 1 | **Konzentration** | 3 | Runde ohne Fähigkeit (Angriff oder Abwehren): +2 Mana | – | **neu** |
| 1 | 2 | Funkenflug | 3 | eigenes Feuer +15 % | – | unverändert |
| 2 | 0 | Manafluss | 3 | +1 Mana pro Runde | Tiefer Brunnen, Konzentration | geändert (braucht) |
| 2 | 2 | Eröffnung | 2 | **Runde 1 → Runden 1 und 2**: Fähigkeiten −25 % Mana | Funkenflug, Konzentration | **geändert** |
| 3 | 0 | Pyromant *oder* | 1 | eigenes Feuer +1 Runde, Brennende +15 % | Manafluss, Eröffnung | unverändert |
| 3 | 2 | Kryomant | 1 | Einfrieren +20 % öfter, Eingefrorene +25 %. **Neu: Deine Betäubungen zählen als Einfrieren.** | Manafluss, Eröffnung | **geändert** |
| 4 | 0 | Schmelzen | 1 | Gegen Eingefrorene: Feuer-Fähigkeiten +60 % (Eis schmilzt), **neu: alle anderen Treffer +15 %** | Pyromant, Kryomant | **geändert** |
| 4 | 2 | Nachhall | 3 | **5 % keine Abklingzeit → 8 % Chance: Die Fähigkeit kostet kein Mana** | Pyromant, Kryomant | **geändert** |
| ★ | 0 | Echo *oder* | 1 | Jede 3. Fähigkeit gratis und ein zweites Mal mit 30 % | Schmelzen, Nachhall | unverändert |
| ★ | 2 | **Blutmagie** | 1 | siehe 3.5 | Schmelzen, Nachhall | **neu** |

Ränge vor der Meisterschaft: 3 + 3 + 3 + 3 + 2 + 1 + 1 + 3 = **19**.

**Kryomant geöffnet:** „Betäubungen zählen als Einfrieren“ heisst: Sie setzen `chilled` wie der Eisstrahl, für
Kryomant (+25 %) und Schmelzen. Dazu kommen Streitkolben, Schild, Grosshammer, Zweihandschwert (Mordschlag)
und Frostbombe. Die Betäubungs-Immunität (`STUN_IMMUNITY_ROUNDS`, `abilities.ts:140`) bremst weiter: höchstens
jede 4. Runde. So entstehen Mischbuilds aus Feuer und Betäubung (z. B. Zepter + Streitkolben, Grosshammer +
Brandflasche).

**Schmelzen +15 % für alle Treffer:** damit der Knoten nicht nur mit Feuer-Fähigkeiten zählt.

**Nachhall neu:** Das Mana begrenzt, nicht die Abklingzeit (Review 3.1). Bei 3 Rängen ist jede vierte
Fähigkeit gratis, im Schnitt rund 8 Mana pro Einsatz. Gleiche Id `afterglow`, `cooldownSkipChance` wird zu
`freeCastChance`.

### 3.4 Plage – Gift, Tränke, Überleben

| Stufe | Spalte | Knoten | Ränge | Wert pro Rang | braucht | Status |
|---|---|---|---|---|---|---|
| 1 | 0 | Zähigkeit | **3 → 2** | +2 % LP | – | **geändert** |
| 1 | 1 | **Vergiftete Waffen** | 3 | Normale Angriffe vergiften mit 8 % Chance: 20 % des Heldenschadens pro Runde, 3 Runden | – | **neu** |
| 1 | 2 | Giftmischer | 3 | eigenes Gift +20 % | – | unverändert |
| 2 | 0 | Kräuterkunde | 2 | Heiltränke **+5 % → +8 %** | Zähigkeit | **geändert** |
| 2 | 1 | Gegengift | 2 | Gift, Feuer, Bluten am Helden −10 % | Zähigkeit, Vergiftete Waffen, Giftmischer | geändert (braucht) |
| 2 | 2 | Schleichendes Gift | 1 | eigenes Gift stapelt bis 3 | Giftmischer, Vergiftete Waffen | geändert (braucht) |
| 3 | 0 | Blutsauger *oder* | 1 | 2 % Lebensraub | Stufe 2 | unverändert |
| 3 | 2 | Schemen | 1 | 3 % Ausweichen | Stufe 2 | unverändert |
| 4 | 0 | Notverband | 3 | einmal pro Kampf unter 30 %: +4 % LP | Blutsauger, Schemen | unverändert |
| 4 | 2 | Seuche | 1 | Gift springt beim Tod über | Blutsauger, Schemen | unverändert |
| ★ | 0 | Fäulnis *oder* | 1 | 3 Giftstapel platzen | Notverband, Seuche | unverändert |
| ★ | 2 | **Lebensband** | 1 | siehe 3.5 | Notverband, Seuche | **neu** |

Ränge vor der Meisterschaft: 2 + 3 + 3 + 2 + 2 + 1 + 1 + 3 + 1 = **18**.

Stufe 1 hat die Spalte 1 frei. Vergiftete Waffen kommt dorthin, Gegengift bleibt auf Stufe 2 in der Mitte.

**Plage-Bilanz:** Zähigkeit −2 % LP, Kräuterkunde +6 % Heiltränke (2 Ränge), Vergiftete Waffen offensiv. Die
Überlebenswerte bleiben gleich (siehe Abschnitt 7). Vergiftete Waffen: bei 3 Rängen 24 % · 0,6 D ≈ +0,14 D pro
normalem Angriff gegen nicht immune Gegner (37 % aller Kreaturen sind gegen Gift immun). Wichtig ist vor
allem: Giftmischer, Schleichendes Gift, Seuche und Fäulnis wirken jetzt mit jeder Waffe.

### 3.5 Die zweiten Meisterschaften

Jede steht in ihrem Pfad auf Stufe 5 als Gabel zur heutigen Meisterschaft.

**Tausend Schnitte** (Klinge, Gabel zu Blutsturz)

- Dein Bluten **stapelt sich bis zu 5-mal** (wie Gift mit Schleichendem Gift: `stackPoison` wird zu
  `stackDot` für Gift und Bluten).
- Jeder Treffer einer Fähigkeit mit mindestens 2 Treffern legt **1 Stapel: 8 % des Heldenschadens pro
  Runde, 2 Runden**. Neue Stapel frischen die Dauer auf.
- Rechnung: Schwertwirbel (3 Treffer) → 24 % pro Runde, nach zwei Einsätzen 40 % (Maximum). Blutsturz mit
  Axtwurf zum Vergleich: 0,25 · 3 = 75 % auf einmal, alle paar Runden. Tausend Schnitte ist stetiger und
  trifft Mehrfach-Waffen (Schwert, Zweihandschwert, Grossaxt, Bogen, Axt-Zerfleischen).
- Bluten-Immunität (14 von 62 Kreaturen) gilt.
- **Koop (entschieden 2026-11-12): ein gemeinsamer Bluten-Stapel pro Gegner**, Deckel **5 für alle zusammen**
  (Abweichung vom Vorschlag „eigener Stapel pro Held“).
  - *Warum:* Mit eigenen Stapeln hätten vier Helden mit Tausend Schnitte 4 × 5 Stapel, also bis 160 % D pro
    Runde auf einem Gegner. Ein gemeinsamer Stapel hält den Höchstwert bei 40 % D wie solo; mehrere
    Schnitte-Helden erreichen ihn nur schneller. Der Deckel 5 bleibt darum gleich: Die Koop-Bosse haben mit
    der Gruppe ohnehin mehr LP (Raid ×n/2, Dungeon ×n·(1 + 0,1·(n − 1))), ein Stapel von 40 % ist dort
    relativ weniger wert als solo – ein höherer Deckel pro Spieler würde wieder auf das Problem oben führen.
  - *Regel:* Es bleibt **ein** Bluten pro Gegner (heute schon so, mit `sourceId`). Trifft ein Held mit Tausend
    Schnitte, stapelt er auf dieses Bluten, **egal wer es gelegt hat** (`stackDot` mit `own = foe.fx.bleed`
    statt nur dem eigenen). Wie solo: Stärke pro Stapel = max(neuer Stapel, bisherige Stärke pro Stapel),
    Dauer frischt auf 2 Runden auf, höchstens 5 Stapel. Ein Bluten **ohne** Tausend Schnitte (Axtwurf,
    Plünderer-Krit, Schnitter) ersetzt den Stapel nur, wenn es stärker ist als der ganze Stapel
    (`strongerDot`, wie heute). Der Schnitter-Fix verlängert auch einen Stapel um 1 Runde.
  - *Wem wird der Schaden zugeschrieben?* Neues optionales Feld am Bluten `stacksBy: Record<heroId, number>`
    (Stapel pro Held). Jeder Tick verteilt den Schaden für die **Bedrohung** nach Stapeln (Paladin ×2 wie
    bisher). `sourceId` bleibt der Held, der den **letzten** Stapel gelegt hat; seine Skills gelten für
    Blutsturz beim Auslaufen und für die Gezahnten Klingen des neuen Stapels (die Stärke wird beim Legen
    berechnet). Für den Leisten-Knoten „Zersetzung“ (G4) und die Hexer-Leiste zählt ein Tick für jeden Helden
    mit mindestens einem Stapel.
  - *Server:* alles in `resolveRound` (`coopCombat.ts`), der Server rechnet; Clients schicken nur ihre Aktion.
    Neue Felder optional lesen (laufende Kämpfe in `coop_battles`), das Ereignis `bleed` bekommt optional
    `stacks` für die Anzeige. Mit der Protokollerhöhung des Releases.
  - *Tests:* zwei Helden mit Tausend Schnitte → zusammen höchstens 5 Stapel; Axtwurf (25 %) ersetzt 3 Stapel
    à 8 % (24 %), aber nicht 5 Stapel (40 %); Bedrohung nach Stapeln verteilt; Blutsturz nach `sourceId`.

**Wächterschwur** (Wehr, Gabel zu Zorn des Bollwerks)

- Abwehren heilt **4 % deiner LP**.
- Koop: Abwehren zieht die Angriffe auf dich, aber **schwächer als Bollwerk:** Du hältst danach
  **60 %** der Bedrohung der Gruppe (`GUARD_OATH_SHARE` 0,6, gleiche Rechnung wie `BULWARK_SHARE` 0,75 in
  `coopCombat.ts:1549`). Jeder Held kann damit den Tank übernehmen, der Paladin bleibt aber der bessere
  Tank **[K]**, *entschieden:* Ziehen mehrere Helden in derselben Runde, wird nach Anteil aufsteigend
  verrechnet, der höchste Anteil gewinnt (Bollwerk, Schildwall und die Duellhaltung mit 0,75 vor
  Wächterschwur mit 0,6); bei gleichem Anteil gewinnt, wer zuletzt handelt. Die Paladin-Bedrohung ×2 bleibt.
- Solo bescheiden: Wer jede 3. Runde abwehrt, heilt ≈ 1,3 % LP pro Runde.
- Exploit-Prüfung: Dauer-Abwehren macht keinen Schaden, die Boss-Absichten (Aufladen, Ritual, Seelengefäss)
  bestrafen es. Unbedenklich.

**Blutmagie** (Arkan, Gabel zu Echo)

- Reicht das Mana nicht, zahlst du den Rest mit LP: **2 LP pro fehlendem Mana**. Nicht möglich, wenn du
  danach unter **25 % LP** wärst (Grund in `abilityBlocker`).
- Dafür **−15 % Mana-Maximum**.
- Rechnung Lv. 40, schwere Rüstung: Richterstoss (35) bei 0 Mana kostet 70 LP (≈ 10 %) für ≈ 190 Schaden.
  Ohne Heilung 2–3-mal pro Kampf. Synergie mit Lebensraub, Notverband und Regeneration **[K]**.
  *Entschieden:* keine Klassen-Ausnahme. Beobachten: Kleriker (Regeneration), Plünderer und Berserker
  (Lebensraub). Signaturen kosten kein Mana, Blutmagie spielt dort keine Rolle; die
  LP-Kosten von „Entfesseln“ (Berserker) sind davon getrennt und zählen nicht als Blutmagie.
- Neues Ereignis `bloodMagic` (LP-Kosten), damit Szene und Log es zeigen.
- Exploit-Prüfung: Die Grenze von 25 % verhindert den Selbstmord. Beobachten: hoher Lebensraub mit
  Blutmagie (Assassine + Blutsauger + Seelenraub **[K]**).

**Lebensband** (Plage, Gabel zu Fäulnis)

- Heilung über das LP-Maximum wird zu einem **Schild, höchstens 15 % der max. LP**. Er fängt Schaden vor
  den LP ab und verfällt am Kampfende (auch im Turm und zwischen Dungeon-Kämpfen).
- Gilt für Tränke, Regeneration, Lebensraub, Heilfähigkeiten und Notverband.
- Koop: Überschüssige Gruppenheilung (Arkane Heilung, Heiliges Licht und Läuterung des Klerikers sowie
  sein Gebet **[K]**) wird beim Mitspieler zum Schild, wenn **der Heiler** Lebensband hat.
  Unterstützungs-Meisterschaft.
- *Entschieden [K]:* Lebensband ist **der einzige** Überheilungs-Schild im Spiel. Das Klassenkonzept
  streicht die geplante Kleriker-Passive „Gnade“. Grund: eine Mechanik an einer Stelle, und der Baum bleibt
  klassenunabhängig.
- **Ein Schild-Topf pro Held** (`ward` am Helden bzw. `CoopHero`): Lebensband und der
  Gruppenschild des Paladins („Richtspruch“) füllen denselben Schild, **zusammen höchstens 15 % der max. LP**,
  er verfällt am Kampfende.
- Neue Ereignisse `shieldGained` (mit `by`, wenn ein Mitspieler ihn gibt) / Schild-Anteil an `hit` (wie
  `absorbed` beim Schildträger). Das Klassenkonzept nutzt dasselbe Ereignis.

### 3.6 Leisten-Knoten (Klassenleiste, Modell C)

Jede Klasse füllt ihre Klassenleiste (4 Ladungen, docs/klassen-neukonzept.md 4.1) mit eigenen Auslösern. Pro
Pfad gibt es einen Knoten, der **einen zusätzlichen Auslöser** im Thema des Pfads gibt. Die Knoten nennen
keine Klasse, sie wirken mit jeder.

| Pfad | Stufe | Spalte | Knoten | Ränge | Wirkung | braucht |
|---|---|---|---|---|---|---|
| Klinge | 4 | 1 | **Jagdfieber** | 1 | Ein kritischer Treffer gibt +1 Ladung | Schnitter, Durchschlag |
| Wehr | 4 | 1 | **Sammlung** | 1 | Abwehren (auch Bollwerk, Parade, Konterstellung) gibt +1 Ladung | Fels, Stachelwehr |
| Arkan | 4 | 1 | **Resonanz** | 1 | Eine Waffen-Fähigkeit gibt +1 Ladung | Pyromant, Kryomant |
| Plage | 4 | 1 | **Zersetzung** | 1 | Ein Tick deines Gifts, Feuers oder Blutens gibt +1 Ladung | Blutsauger, Schemen |

Regeln:

- **Höchstens alle 2 Runden** eine Ladung aus dem Knoten, und alles zählt in die Obergrenze der Leiste von
  2 Ladungen pro Runde.
- **Kein doppelter Auslöser:** Hat die Klasse denselben Auslöser schon (Assassine: Krit, Magier: Fähigkeit,
  Hexer: DoT-Tick, Paladin: Abwehren/Block), wirkt der Knoten nicht. Im Baum steht dann „Deine Klasse lädt
  schon so“. Grund: Sonst würden die naheliegenden Paare (Assassine + Klinge, Magier + Arkan, Hexer + Plage)
  zur Pflicht; so belohnt der Knoten gerade die ungewöhnlichen Kombinationen.
- **Ohne Klasse** wirkt der Knoten nicht (Hinweis im Tooltip).
- Wert: Bei einer Fülldauer von 3–5 Runden spart ein zusätzlicher Auslöser etwa 1 Runde pro Signatur, also
  ungefähr +0,03–0,05 D pro Runde. Das ist ein kleiner Knoten; der Reiz liegt im Rhythmus, nicht in der Zahl.
- Ränge vor der Meisterschaft steigen um 1: Klinge 21, Wehr 19, Arkan 20, Plage 19. Die Schwelle 12 bleibt.
- **Zeitpunkt:** erst mit dem Klassen-Kern (gemeinsamer Plan, Etappe G4). Neue Ids brauchen keine Migration,
  `sanitizeSkills`/`validateSkills` kennen sie dann einfach.

---

## 4. Brückenknoten

Sie belohnen den Zweitpfad. Bedingung: **je 6 Punkte in beiden Pfaden**, Kosten 1 Punkt, **höchstens eine
Brücke** im Baum. Anzeige: eigene Zeile unter den vier Pfaden in `SkillTree.tsx`.

| Brücke | Pfade | Wirkung |
|---|---|---|
| Klingenparade | Klinge + Wehr | Die Aktion nach dem Abwehren und jeder Konter (Parade, Konterstellung, Unerschütterlich): +15 % Krit-Chance |
| Funkenschlag | Klinge + Arkan | Kritische Treffer verlängern ein liegendes Feuer um 1 Runde (höchstens +2 pro Feuer) |
| Giftblut | Klinge + Plage | Blutet **und** ist vergiftet: Gift und Bluten auf diesem Gegner +20 % |
| Arkane Bastion | Wehr + Arkan | Nach dem Abwehren kostet die nächste Fähigkeit 30 % weniger Mana |
| Eiserner Wille | Wehr + Plage | Abwehren kürzt Gift, Feuer und Bluten am Helden um 1 Runde |
| Giftnebel | Arkan + Plage | Feuer auf einem vergifteten Gegner verlängert das Gift um 1 Runde |

Brücken sind die letzte Etappe (Abschnitt 8). Sie lohnen sich erst, wenn die Pfade selbst stimmen.

---

## 5. Was wo wirkt

| Knoten | Ort der Wirkung | Zufall |
|---|---|---|
| Wirbelnde Klingen, Klingentanz, Schmelzen (+15 %) | `skillDamageFactor` / `strikeFactors` (`combatCore.ts`) | – |
| Schnitter-Fix, Vergiftete Waffen, Tausend Schnitte | `afterHeroHit` (`combatCore.ts:538ff.`) | Vergiftete Waffen: nur bei Rang > 0 |
| Kryomant (Betäubung = Einfrieren) | Stelle, an der `dazed` gesetzt wird (solo `combat.ts`, Koop `coopCombat.ts`) | – |
| Deckung, Eröffnung, Nachhall, Blutmagie | `abilityCost` / `abilityBlocker` (`combat.ts:748–771`) und `coopAbilityBlocker` | Nachhall: nur bei Rang > 0 |
| Konzentration | Mana am Rundenende (`manaRegen`) | – |
| Wächterschwur | Abwehren (solo), Bedrohung und Spott (Koop) | – |
| Lebensband | `healShare`, `drainHeal`, `abilityHeal` → Überschuss als Schild, Abzug in `strikeHero` | – |
| Eiserne Haut, Zähigkeit | `skillStatBonus` (Profil) | – |
| Leisten-Knoten (3.6) | `chargeGain` (`heroClasses.ts`, Klassenkonzept) | – |

### 5.1 Signatur und Klassenleiste

Die Signaturfähigkeit einer Klasse kostet kein Mana und hat keine Abklingzeit (die volle Leiste ist die
Bremse). Für den Skilltree gilt die Regel: **Knoten, die von „Fähigkeit“, Mana oder Abklingzeit sprechen,
gelten nicht; Knoten, die von „Treffer“, „Krit“ oder „Aktion“ sprechen, gelten.**

| Gilt **nicht** für die Signatur | Grund |
|---|---|
| Echo (zählt sie nicht als 3. Fähigkeit, kein Zweittreffer) | sonst doppelte Signatur ohne Kosten |
| Nachhall (8 % kein Mana) | sie kostet kein Mana |
| Blutmagie | sie kostet kein Mana |
| Eröffnung, Deckung | Manakosten |
| Konzentration: Eine Signatur-Runde zählt **nicht** als „Runde ohne Fähigkeit“ | der Knoten belohnt Angriff und Abwehren, nicht die Signatur |
| Wirbelnde Klingen, Klingentanz, Tausend Schnitte (Mehrfachtreffer-Fähigkeiten) | Berserker „Entfesseln“ (3–4 Hiebe) würde sonst doppelt profitieren |

| Gilt für die Signatur | Bemerkung |
|---|---|
| Scharfe Klingen, Blutgeruch, Durchschlag, Schnitter, Hinrichter | Krit-Gesamtobergrenze 60 % gilt |
| Erschütterung, Gegenschlag, Zorn des Bollwerks, Schmelzen (+15 %) | Treffer-Modifikatoren |
| Kryomant | Die sichere Betäubung des Wächters („Bergbrecher“) zählt als Einfrieren; die Immunität gilt |
| Giftmischer, Funkenflug, Pyromant, Gezahnte Klingen | wirken auf DoTs, die eine Signatur legt oder erntet |
| Lebensband | Heilung der Signaturen (Gebet, Ausweiden, Seelenernte) füllt den Schild |

Für Boss-Mechaniken ist die Signatur **immer sicher** (entschieden): Das Höhlenauge wirft sie nicht zurück,
Xal'Zar verschlingt sie nicht, Kaelthar lädt sich an ihr nicht auf. Siehe docs/klassen-neukonzept.md 4.1.

---

## 6. Koop

Der Koop-Server berechnet die Profile selbst aus dem Cloud-Spielstand (`getHeroCombatProfile` →
`sanitizeSkills`). Alle Knoten wirken pro Held wie solo, Gift, Feuer und Bluten zählen für den Verursacher
(`sourceId`).

| Knoten | Koop-Besonderheit |
|---|---|
| Tausend Schnitte | **Ein gemeinsamer Stapel pro Gegner**, Deckel 5 für alle zusammen (entschieden, Abweichung vom Vorschlag). Stapelt auf jedes liegende Bluten, Bedrohung nach Stapeln (`stacksBy`), `sourceId` = letzter Stapel. Einzelheiten in 3.5 |
| Wächterschwur | Abwehren = Spott mit 60 % Anteil (`GUARD_OATH_SHARE`). Mehrere Spötter: nach Anteil aufsteigend verrechnet, Bollwerk/Schildwall/Duellhaltung (0,75) gewinnen, bei Gleichstand wer zuletzt handelt. Paladin-Bedrohung ×2 bleibt **[K]** entschieden (3.5) |
| Leisten-Knoten | Server rechnet die Ladungen selbst (`chargeGain`), der Client schickt nur die Aktion `signature` |
| Blutmagie | `coopAbilityBlocker` und Server prüfen LP-Kosten und die 25-%-Grenze. Der Client-Befehl bleibt die Fähigkeits-Id, der Server rechnet |
| Lebensband | Schild am `CoopHero`. Gruppenheilung des Heilers mit Lebensband füllt Schilde der Mitspieler |
| Konzentration | Runde ohne Fähigkeit: auch wenn die Zeit abläuft (`COOP_TURN_SECONDS`, automatisch normaler Angriff) |
| Kryomant | Betäubung = Einfrieren auch im Koop. Die Immunität gilt für alle Gegner, Kryomant ändert daran nichts |
| Vergiftete Waffen, Seuche | Gift des Helden mit `sourceId`, Seuche springt nur eigenes Gift |
| Brücken | pro Held, nichts Besonderes |

Nach jeder Etappe: `npm run functions:build`, damit `supabase/functions/_shared/*.js` die neue Logik hat.
Deployen nur auf ausdrücklichen Wunsch.

**Protokollversion:** Neue Ereignisse (`bloodMagic`, `shieldGained`) kennt ein alter Client nicht. Seit G1
gibt es `COOP_PROTOCOL_VERSION` (1) in `src/coop/protocol.ts`; der Server lehnt ältere Clients mit „bitte neu
laden“ ab. Diese Überarbeitung erhöht sie beim Release einmal (bei gemeinsamer Auslieferung mit G3 eine
einzige Erhöhung für beide).

**Übergang:** Solange ein Spieler mit altem Client spielt, liegen im Cloud-Spielstand Ränge nach den alten
Regeln. Darum braucht der Server eine Prüfung der Regeln (`validateSkills`, Abschnitt 7.2), nicht nur
das Kappen der Ränge.

---

## 7. Spielstand

### 7.1 Was sich ändert

| Änderung | Folge für gespeicherte Ränge |
|---|---|
| Offene Wunde entfernt | `sanitizeSkills` wirft die Id weg, der Punkt ist frei |
| Zähigkeit 3 → 2 Ränge | `sanitizeSkills` kappt auf 2, der Punkt ist frei |
| Neue `requires` (Blutsturz braucht Klingentanz oder Hinrichter) | Wer Blutsturz nur über Offene Wunde hatte, verstösst gegen die Regeln |
| Nachhall mit neuer Wirkung | gültig, aber ungefragt geändert |
| Meisterschaft ab 12, Meisterschafts-Gabel | alte Stände bleiben gültig |

### 7.2 Empfehlung: alles zurückerstatten

- **Version 23 → 24.** In `migrateSave` ein Schritt `if (version < 24)`: `character.skills = {}`. Alle
  Punkte sind frei, wie beim Umbau auf v12 (`gameStore.ts:785`).
- Dazu **ein Toast, kein Dialog** (entschieden): „Klassen und Talente: Der Skilltree wurde überarbeitet –
  deine Skillpunkte sind zurück.“ mit Knopf „Zum Skilltree“. Er erscheint einmal beim ersten Start nach der
  Migration (Motion-Toast wie bei Belohnungen). Dafür ein Feld `character.skillTreeNotice?: true`, das die
  Migration setzt und der Toast beim Anzeigen löscht. Es gehört in `partialize`, weil es den Neustart
  überleben muss. Bei gemeinsamer Auslieferung mit G3 nennt der Toast auch die Klassen (ein Text für beides).
- Test in einem Store-Test (wie `src/store/quests.test.ts`): Ein v23-Stand mit Rängen in mehreren Pfaden
  (inkl. Offene Wunde, Zähigkeit 3, Meisterschaft) → leere `skills`, Hinweis gesetzt. Gold, Items und XP
  unverändert.
- **Server:** neue Funktion `validateSkills(ranks)` in `skills.ts`. Sie verwirft Ränge, die gegen die
  Regeln verstossen (Stufen-Schwellen, `requires`, Gabeln, mehrere Meisterschaften, mehrere Brücken,
  mehr Punkte als verdient), so lange, bis der Stand stabil ist. `sanitizeSkills` ruft sie auf. Damit
  behandeln Client und Server alte Cloud-Stände gleich, und manipulierte Stände werden harmlos.
- Kein Gold zurück: Das Zurücksetzen ist ohnehin günstig und wird hier kostenlos erledigt.
- **Versionen abgestimmt:** v24 gehört dieser Überarbeitung. Der Klassen-Kern braucht keine eigene Version;
  die optionalen Klassen-Teile (Signatur-Zähler, Klassenränge) bekommen **v25**. Wer zuerst ausgeliefert
  wird, nimmt die nächste freie Nummer; die Reihenfolge im gemeinsamen Plan sieht v24 → v25 vor.
- **Keine zweite Rückerstattung:** Die Leisten-Knoten (3.6) kommen später als neue Ids dazu und brauchen
  keine Migration.

Alternative ohne Komplett-Rückerstattung: nur ungültige Ränge verwerfen (`validateSkills`). Das ist
billiger, ändert aber still die Wirkung von Nachhall, und viele Spieler hätten nach der Senkung auf 12
Punkte unnötig volle Pfade. Darum Rückerstattung empfohlen.

---

## 8. Umsetzungsplan

Alle Etappen in **einem** Zweig und als **eine** Veröffentlichung. Sonst würden die Punkte mehrfach
zurückerstattet. Die Reihenfolge innerhalb jeder Etappe: Domain + Tests → Store → Koop/Server → Szene und
Ereignisse → UI → Doku.

| Etappe | Inhalt | Dateien | Tests | Aufwand |
|---|---|---|---|---|
| 1 Struktur | `TIER_POINTS[5]` = 12, Meisterschafts-Gabel (`fork` auf Stufe 5), `validateSkills`, Migration v24 mit Hinweis | `skills.ts`, `gameStore.ts`, `SkillTree.tsx` (Gabel-Markierung auf Stufe 5, „★ ab 12“), `src/test/skills.ts` (`pathOrder` mit eigenem Parameter für die Meisterschafts-Gabel) | `skills.test.ts` (Schwellen, Gabeln, `validateSkills` mit kaputten Ständen), Migrationstest | M (1 Tag) |
| 2 Werte und Umbauten | Hinrichter, Eiserne Haut, Kräuterkunde, Zähigkeit, Eröffnung, Nachhall, Schnitter-Fix (Offene Wunde entfernt), Kryomant, Schmelzen | `skills.ts`, `combatCore.ts`, `combat.ts`, `coopCombat.ts` | `skillsCombat.test.ts`, `skillsCoop.test.ts`: Schnitter gegen stärkeres Bluten, Kryomant mit Streitkolben-Betäubung, Nachhall kostenlos | S–M (½–1 Tag) |
| 3 Neue Knoten | Wirbelnde Klingen, Klingentanz, Deckung, Konzentration, Vergiftete Waffen | wie Etappe 2, dazu `SkillTree.tsx` (Spalte 1 auf Stufe 1) | je ein Solo- und ein Koop-Test | M (1–1,5 Tage) |
| 4 Zweite Meisterschaften | Tausend Schnitte (`stackDot`), Wächterschwur, Blutmagie, Lebensband | `skills.ts`, `combatCore.ts`, `combat.ts`, `coopCombat.ts`, `EventBus.ts` (`bloodMagic`, `shieldGained`), `BattleScene.ts`, `CoopBattleScene.ts`, Kampflog | je Solo + Koop, Exploit-Tests (Blutmagie-Grenze, Schild nur bis 15 %, Schild verfällt) | L (2–3 Tage) |
| 5 Brücken | 6 Brückenknoten, eigene Zeile im Baum | `skills.ts`, `combatCore.ts`, `SkillTree.tsx` | Regel-Tests (6+6, höchstens eine) + Wirkung | L (1,5–2 Tage), kann später kommen |
| 6 Leisten-Knoten | Jagdfieber, Sammlung, Resonanz, Zersetzung (3.6), Signatur-Regeln (5.1) prüfen | `skills.ts`, `heroClasses.ts` (`chargeGain`), `SkillTree.tsx` (Spalte 1 auf Stufe 4) | je Solo + Koop, „kein doppelter Auslöser“, Obergrenze 2 pro Runde | S–M (½ Tag), **erst nach dem Klassen-Kern** |

**Einordnung in den gemeinsamen Plan** (docs/klassen-skilltree-abgleich.md): Etappen 1–4 bilden den
Skilltree-Release (G2), nach den Klassen-Sofortkorrekturen (G1, u. a. Krit-Gesamtobergrenze) und vor dem
Klassen-Kern (G3). Etappe 5 und 6 folgen in G4. Beide Projekte ändern `combatCore.ts`; der Skilltree wird
zuerst gemergt, der Klassen-Kern baut darauf auf.

**Nach jeder Etappe:**

- `npx vitest run` und `npx tsc -b`.
- **Golden Master** (`combatGolden.test.ts`): Die Abweichungen müssen auf Kämpfe mit Skillpfaden beschränkt
  sein. Kämpfe ohne Skills dürfen sich nicht ändern, weil der Zufall nur bei Rang > 0 gezogen wird. Erst dann
  den Snapshot mit `npx vitest run -u` erneuern. **Nie** in derselben Erneuerung wie eine Klassen-Etappe
  (G1, G3): Jede Snapshot-Änderung muss einer einzigen Etappe zuzuordnen sein.
- `npm run functions:build`.
- Simulation aus docs/skilltree.md (`sim/zzskill.test.ts`) mit der Verteilung „Meisterpfad 13 +
  Zweitpfad 17“ neu laufen lassen.

**Doku am Schluss:** docs/skilltree.md (neue Tabellen, Regeln), README-Spielregeln, `HelpScreen.tsx`,
docs/ideen.md (#33 „Mehr Gabelungen“ → ✅ bzw. 🚧, #87), dieses Dokument auf „umgesetzt“.

**Simulation:** Die Hilfsdatei des Klassen-Projekts (`src/test/classSim.ts`) ersetzt das Scratchpad-Skript
`sim/zzskill.test.ts`: `SIM_MODE=skills SIM_SKILLS="blade:0+plague:0" npx vitest run src/domain/zzClassSim.test.ts`
(Pfade der Reihe nach, Gabel 0/1). Für „Meisterpfad 13 + Zweitpfad 17“ in G2 einen Verteilungsmodus ergänzen.

---

## 9. Simulation (Vorprüfung)

Mit dem Simulations-Skript des Reviews (Scratchpad, `SIM_MODE=tree`). Gebietsbosse Lv. 40/50/60 (20/25/30
Punkte), seltene Ausrüstung, Heiltränke, 150 Kämpfe pro Klasse und Boss. Jede Klasse mit Haupt- und
Zweitpfad nach dem besten Ergebnis aus dem Review. Verglichen:

- **alt:** Hauptpfad bis 15 Punkte, dann Meisterschaft, Rest in den Zweitpfad.
- **neu (12):** Hauptpfad nur 12 Punkte, dann Meisterschaft, Rest in den Zweitpfad.
- **neu + Werte:** wie „neu (12)“, dazu Hinrichter 10 %, Eiserne Haut 4 %, Kräuterkunde 8 %, Zähigkeit 2 Ränge.

| Klasse | alt | neu (12) | neu + Werte |
|---|---|---|---|
| Magier | 80 | 80 | 82 |
| Hexer | 85 | 84 | 86 |
| Assassine | 98 | 96 | 96 |
| Waldläufer | 92 | 91 | 92 |
| Duellant | 60 | 53 | 60 |
| Plünderer | 91 | 90 | 90 |
| Kleriker | 86 | 89 | 89 |
| Paladin | 80 | 83 | 84 |
| Berserker | 65 | 61 | 64 |
| Champion | 90 | 89 | 89 |
| Wächter | 87 | 88 | 87 |

Ergebnis: Die Senkung auf 12 Punkte und die geänderten Werte verschieben die Siegquoten nur um ±3 Punkte
(Duellant −7 bei „neu (12)“ ist Streuung, mit den Werten wieder 60). Das Gesamtbudget bleibt also gleich,
wie gewollt.

Nicht simuliert, weil neuer Code nötig ist: die neuen Knoten, die zweiten Meisterschaften, der Schnitter-Fix,
Kryomant und die Brücken. Für sie gelten die Rechnungen in Abschnitt 3. Die Simulation dafür kommt in
Etappe 3/4 (siehe Plan).

Nebenbefund: Mit **zwei** Pfaden (20–30 Punkte) gewinnen fast alle Klassen gegen die Gebietsbosse ab Lv. 40
80–98 % mit seltener Ausrüstung. Der Balance-Test in `combat.test.ts` simuliert den Champion nur mit einem
Pfad. Ob die späten Bosse mit vollem Skilltree zu leicht sind, gehört ins Klassen- bzw. Boss-Balancing,
nicht in diese Überarbeitung. Das Klassenkonzept misst seine Zielwerte (40–60 % pro Klasse) darum **ohne
Skillpunkte** und prüft den vollen Baum in einem eigenen Durchgang (docs/klassen-neukonzept.md, Etappe 5).

---

## 10. Entscheidungen (früher: offene Fragen)

Alle am 2026-11-12 entschieden (gesammelt in docs/klassen-skilltree-abgleich.md, Abschnitt 3):

| # | Frage | Entscheidung | Wo eingearbeitet |
|---|---|---|---|
| 1 | Klassenkonzept [K] | Modell C, alle [K]-Stellen abgeglichen | ganzes Dokument |
| 2 | Tausend Schnitte im Koop | **ein gemeinsamer Bluten-Stapel pro Gegner**, Deckel 5 (Abweichung vom Vorschlag) | 3.5, 6 |
| 3 | Brücken | höchstens eine | 2, 4 |
| 4 | Hinweis nach der Rückerstattung | **Toast**, kein Dialog | 7.2 |
| 5 | Erfolge für Meisterschaften | ja, zusammen mit den Signatur-Erfolgen der Klassen in einem Schritt (v25, G4) | – |
