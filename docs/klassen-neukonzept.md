# Klassen-Neukonzept

Stand: 2026-11-12, Code auf `main` (f91112d). Reines Konzept, am Spielcode wurde nichts geändert.
Grundlage: docs/balancing-review-waffen-klassen.md (im Folgenden „Review“), `heroClasses.ts`,
`armorClasses.ts`, `weaponScaling.ts`, `combat.ts` (`getHeroCombatProfile`), `combatCore.ts`,
`coopCombat.ts`, `abilities.ts`, `skills.ts`, `HeroClassInfo.tsx`, docs/waffen-faehigkeiten.md,
docs/attribut-skalierung.md, docs/skilltree.md, docs/koop-kampf.md.

Stellen, die den Skilltree betreffen (docs/skilltree-ueberarbeitung.md), sind mit **[Skilltree]** markiert
und in Abschnitt 8 gesammelt.

**Entschieden (2026-11-12): Modell C „Klassen mit Kern“.** Modell A und B bleiben unten als verworfene
Alternativen stehen. Der Abgleich mit der Skilltree-Überarbeitung ist erledigt; alle Konflikte, der gemeinsame
Etappenplan und die Entscheidungen zu allen offenen Fragen stehen in docs/klassen-skilltree-abgleich.md.
Eingearbeitet sind auch die Entscheidungen, die von den Empfehlungen abweichen: Paladin auch mit Schwert +
Schild (4.3, 4.7), Signatur immer sicher (4.1), rundenbasierte Boss-Raserei im Koop (4.5).

**Stand der Umsetzung:** G0 (Simulation als Test), G1 (Sofortkorrekturen) und **G3 (Klassen-Kern, Etappen 2–5)** sind
umgesetzt, siehe Abschnitt 9 und 11. Die Zahlen in 4.3 sind **Startwerte**; die abgestimmten Endwerte, Ergebnisse
und die bei der Umsetzung getroffenen Entscheidungen stehen in Abschnitt 11.

---

## Kurzfazit

1. **Heute ist eine Klasse ein Waffenbonus.** Sie entsteht aus 3 Rüstungsteilen + Waffe, und jede Klasse
   gehört zu genau einer Waffe. Fähigkeiten kommen von der Waffe, Schaden vom Attribut der Waffe, der Skilltree ist
   klassenlos. Die Klasse selbst gibt meist nur Prozente (Champion, Waldläufer, Duellant). Darum fühlen sich
   Klassen kaum verschieden an, das Balancing hängt an wenigen Prozentpunkten und am Würfelglück der Waffe.
2. **Was gut ist und bleiben soll:** Die Klasse aus der Ausrüstung abzuleiten (kein Charakter-Neustart, freier
   Wechsel gegen passende Bosse) und das Entdecken im Klassen-Kodex („???“, Erfolg „Wandelbar“).
3. **Drei Gesamtmodelle** (Abschnitt 3): A *Feinschliff* (Zahlen aus dem Review, wenig Risiko, ändert das
   Spielgefühl kaum), B *Berufung* (feste, gewählte Klasse mit eigenem Baum, radikal, teuer, zerstört das
   Entdecken und entwertet zwei Drittel der Beute), C *Klassen mit Kern* (Erkennung bleibt, jede Klasse bekommt
   Rolle, Klassenleiste, Signaturfähigkeit und ein mechanisches Passiv).
4. **Entschieden: Modell C.** Kern ist eine **einheitliche Klassenleiste mit 4 Ladungen**, die jede Klasse auf
   ihre eigene Art füllt (Krits, Abwehren, Gift-Ticks, erlittene Treffer …), und eine **Signaturfähigkeit**, die
   die volle Leiste verbraucht, kein Mana kostet und nicht von der Waffe abhängt. Das löst die
   Fähigkeiten-Lotterie (jede Klasse hat immer einen starken Knopf), schafft unterschiedliches Spielgefühl und
   gibt dem Koop echte Rollen, auch einen **Heiler** (Kleriker: Gruppengebet mit Wiederbelebung).
5. **Budget-Regel statt Prozent-Wettrüsten:** Passiv etwa +10 %, Signatur etwa +15 %, zusammen
   **+25 % (±5) über klassenlos** bei gleicher Ausrüstung. Tank und Heiler etwas weniger Schaden, dafür
   Überleben und Gruppenwert. Die heutigen Ausreisser werden dabei eingefangen: Assassine verliert den
   Krit-Überhang (Krit 2,25 → 2,0, +20 % → +10 %, Gesamt-Obergrenze 60 % **[Skilltree]**), Berserker, Duellant und
   Paladin bekommen Mechaniken, die ihre Schwäche direkt adressieren.
6. **Kaum Migration:** Die Klasse bleibt aus der Ausrüstung abgeleitet, die Leiste ist reiner Kampfzustand
   (Kämpfe werden nicht gespeichert). Eine neue Spielstand-Version (v25, nach der v24 des Skilltrees) braucht
   es erst für die optionalen Langzeit-Teile (Klassenränge, Statistik).
7. **Aufwand:** Etappe 0–1 (Test-Harness, Sofortkorrekturen) etwa 1–2 Tage, Kern solo (Etappe 2) 3–4 Tage,
   Koop (Etappe 3) 2–3 Tage, Darstellung (Etappe 4) 2 Tage, danach Simulation und Playtest. Grösstes
   Risiko: elf Signaturen gleichzeitig abstimmen. Die Reihenfolge mit dem Skilltree (beide ändern
   `combatCore.ts`) regelt der gemeinsame Plan: Sofortkorrekturen → Skilltree-Release → Klassen-Kern.

---

## 1. Ist-Zustand

### 1.1 Wie eine Klasse entsteht

- `detectHeroClass` (`heroClasses.ts`): mindestens **3 von 5 Rüstungsteilen** derselben Rüstungsklasse plus
  passende Waffe. Es ist immer höchstens eine Klasse aktiv, bei mehreren gewinnt die zuerst gelistete.
- Keine Wahl, kein Speicherfeld: Die Klasse ist eine Funktion der Ausrüstung. Der Koop-Server berechnet sie
  darum selbst aus dem Cloud-Spielstand (`getHeroCombatProfile`), Clients können sie nicht fälschen.
- Klassen sind versteckt, bis man sie einmal trägt (`ClassCodex`, `records.classesWorn`, Erfolg „Wandelbar“
  1/4/11).

### 1.2 Wie Klasse, Waffe, Attribute und Skilltree zusammenhängen

```
             ┌──────────► Attribut (weaponScaling.ts) ──► Bonusschaden
  Waffe ─────┼──────────► Fähigkeiten (2 aus 4 / 3 aus 6, gewürfelt)
             └──┐
                ├───────► Klasse (heroClasses.ts) ──► Prozente, 1–2 Sonderregeln
  Rüstung ──────┘           (3 Teile einer Rüstungsklasse)
         └──────────────► Rüstungswert, Mana bzw. Krit pro Teil

  Skilltree (skills.ts) ──► unabhängig von Klasse und Waffe
  Attributpunkte        ──► frei verteilt, Zurücksetzen kostet Gold
```

Folgen:

- **Die Waffe entscheidet fast alles:** Attribut, Schadensart, Knöpfe und Klasse. Die 11 Klassen sind
  11 Waffen-Konfigurationen. Es gibt keine Klasse, die zwei Waffentypen zulässt (ausser Paladin: Streitkolben
  *und* Schild; künftig auch Schwert + Schild, siehe 4.3).
- **Die Klasse ändert selten, *wie* man spielt.** Mechanik haben nur Duellant (Zweitschlag), Plünderer (Bluten,
  Lebensraub), Kleriker (Regeneration), Berserker (unter 50 % LP), Paladin (Bollwerk, Bedrohung) und Hexer
  (DoTs). Champion, Waldläufer und Wächter sind fast reine Prozente.
- **Keine Klassen-Ressource, keine Signatur.** Was eine Klasse kann, hängt an den gewürfelten
  Waffen-Fähigkeiten. Ein Magier ohne Feuerball und Meteor (20 % aller Stäbe) ist praktisch unspielbar
  (Review 1.5).
- **Skilltree und Klasse reden nicht miteinander,** ausser über Zufallssynergien (Assassine + Scharfe Klingen,
  Hexer + Plage) und Konflikte (Plünderer + Schnitter wirkt nie).

### 1.3 Identität und Rolle heute

| Klasse | Rüstung + Waffe | Attribut | Bonus heute | Rolle solo | Rolle Koop | Problem (Review) |
|---|---|---|---|---|---|---|
| Magier | leicht + Stab | Int | −20 % Mana, +5 % | Burst | Schaden | Fähigkeiten-Lotterie, Magie oft resistiert |
| Hexer | leicht + Zepter | Int | DoTs ×1,5, +1 Runde | DoT | Schaden, Fluch | DoTs zu effizient, 0 % gegen Gift-Immune |
| Assassine | leicht + Dolch | Cha | +20 % Krit, ×2,25 | Burst | Schaden | dominant (Krit über Obergrenze) |
| Waldläufer | mittel + Bogen | Cha | +12 %, 5 Pfeile | Fernkampf | Schaden, Jägermal | stark vom Boss abhängig, sonst ok |
| Duellant | mittel + 2 Schwerter | Str | +10 %, 35 % Zweitschlag | Nahkampf | Schaden | schwächste Klasse |
| Plünderer | mittel + Axt | Str | +20 %, 10 % Lebensraub, Krit-Bluten, Gold | Bruiser | Schaden | Mitte, Schnitter wirkungslos |
| Kleriker | mittel + Streitkolben | Aus | 2 % Regeneration, Tränke +15 % | zäh | heilt nur sich | kein Koop-Heiler, lange Kämpfe |
| Paladin | schwer + Streitkolben + Schild | Aus | +10 %, +20 % Rüstung, Bollwerk, Bedrohung ×2 | Tank | Tank | tiefster Schaden, 15–23 Runden |
| Berserker | schwer + Grossaxt | Str | unter 50 % LP +30 % | Risiko | Schaden | schlechterer Champion |
| Champion | schwer + Zweihandschwert | Str | +15 %, +10 % LP | Allrounder | Schaden | stark, aber langweilig |
| Wächter | schwer + Grosshammer | Str | +15 % LP, +10 % Rüstung, Schwächung +1 | Kontrolle | Kontrolle | gut |

**Überschneidungen:** Vier Stärke-Klingen-Nahkämpfer ohne klare Trennung (Champion, Berserker, Duellant,
Plünderer). Zwei Ausdauer-Streitkolben-Klassen (Kleriker, Paladin), die beide „überleben“ statt „heilen“
bzw. „schützen“. Zwei Charisma-Stich-Klassen (Assassine, Waldläufer), die gut getrennt sind (Krit gegen
Fernkampf).

**Fehlend:** ein Koop-Heiler, eine echte Unterstützungsklasse (Gruppenbuff) und ein Tank ohne Schild.
Fehlende Kombinationen (klassenlos): z. B. mittel + Stab, schwer + Schwert + Schild, leicht + Bogen.

---

## 2. Ziele für das neue Konzept

1. **Jede Klasse spielt sich anders,** nicht nur mit anderen Zahlen. Mindestens eine Entscheidung pro Kampf, die
   es nur in dieser Klasse gibt (wann die Signatur, wie man die Leiste füllt).
2. **Jede Klasse hat immer einen starken Knopf,** unabhängig vom Würfelglück der Waffe.
3. **Rollen im Koop:** Schaden, Tank, Heiler, Unterstützung, Kontrolle. Rollen helfen, sind aber **keine
   Pflicht**: Zwei Schadensklassen mit Tränken müssen jeden Koop-Boss weiterhin schaffen können.
4. **Lesbar:** Die Leiste ist sichtbar, die Signatur ist angekündigt (Leiste voll = Knopf leuchtet). Bosse
   können später darauf reagieren (ankündigen, kontern, belohnen).
5. **Balancing über ein festes Budget** statt über einzelne Prozente (Review: +10 % Schaden = +15–25 Punkte
   Siegquote).
6. **Bestehende Stände bleiben gültig,** Ausrüstung und Fortschritt behalten ihren Wert. Das Entdecken der
   Klassen bleibt.

---

## 3. Drei Gesamtmodelle

### Modell A: Feinschliff (verworfen)

Das heutige System bleibt, die Vorschläge aus dem Review werden umgesetzt: Duellant +15 % / 45 %, Berserker
+10 % immer und Lebensraub in Raserei, Schild 2,2, Paladin +15 %, Assassine ×2,1, Kleriker heilt im Koop mit,
dazu eine feste „Kernfähigkeit“ pro Klasse (Magier immer Feuerball usw., Review Nr. 20).

| Vorteile | Nachteile |
|---|---|
| Sehr wenig Risiko, 1–2 Tage | Klassen bleiben Prozentpakete, Champion bleibt langweilig |
| Keine neuen Systeme, keine UI | Kernfähigkeit aus dem Waffen-Pool: noch mehr Waffen-Knöpfe, keine Klassen-Knöpfe |
| Sofort messbar mit der Simulation des Reviews | Koop-Rollen bleiben dünn (Heiler = Kleriker mit halber Heilung) |
| | Das nächste Balancing dreht wieder an denselben Prozenten |

### Modell B: Berufung (radikaler Umbau, verworfen)

Der Spieler **wählt** am Trainingsplatz eine von sechs Berufungen (Krieger, Wächter, Schurke, Jäger, Magier,
Priester). Die Berufung legt die erlaubten Waffen fest (3–4 Typen), bringt eine eigene Ressource und einen
eigenen Klassenbaum mit, der den heutigen Skilltree ersetzt. Die Hälfte der Fähigkeiten kommt aus dem
Klassenbaum, die Waffe trägt nur noch eine. Rüstungsklassen geben nur noch Werte, keine Klasse mehr.

| Vorteile | Nachteile |
|---|---|
| Klare Rollen, leicht zu erklären („ich bin Priester“) | Das Entdecken der Klassen und der Erfolg „Wandelbar“ fallen weg |
| 6 statt 11 Klassen: viel einfacher abzustimmen | Freier Wechsel gegen Bosse (Bogen gegen Ignaroth) fällt weg oder kostet Gold |
| Fähigkeiten-Lotterie fast weg | **Zwei Drittel aller Drops sind für die eigene Berufung nutzlos:** Beutemotivation, Händler, Tausch und Begleiter-Ausrüstung leiden |
| Eigene Ressourcen pro Berufung, starkes Spielgefühl | Der Skilltree (gerade erst neu, parallel überarbeitet) würde wieder ersetzt |
| | Migration: jedem Charakter eine Berufung zuweisen, Skills erstatten, Waffen ohne Nutzen. Hohes Risiko für bestehende Spieler |
| | 2–3 Wochen Arbeit, alle Simulationen und der Golden Master neu |

### Modell C: Klassen mit Kern (entschieden)

Die Erkennung aus Ausrüstung bleibt, die 11 Klassen bleiben. Jede Klasse bekommt vier Bausteine:

1. **Rolle** (primär und sekundär), sichtbar im Kodex und in der Koop-Lobby.
2. **Passiv:** eine Regel, die zeigt, wie die Klasse kämpft (kleiner als heute, mehr Mechanik als Prozente).
3. **Klassenleiste:** dieselbe Anzeige für alle (4 Ladungen), aber jede Klasse füllt sie auf ihre Weise.
4. **Signaturfähigkeit:** verbraucht die volle Leiste, kostet kein Mana, gehört der Klasse, nicht der Waffe.

| Vorteile | Nachteile |
|---|---|
| Unterschiedliches Spielgefühl über die Füll-Regel und die Signatur | 11 Signaturen = 11 neue Mechaniken, die abgestimmt werden müssen |
| Lotterie entschärft, ohne Waffen-Pools oder gespeicherte Items anzufassen | Ein zusätzlicher Knopf und eine Leiste in der Aktionsleiste (Handy-Platz) |
| Koop-Rollen inklusive Heiler und Unterstützung | Neue Felder im Koop-Zustand und im Protokoll |
| Entdecken, freier Wechsel und Beutewert bleiben | Klassenlose Kombinationen werden relativ schwächer (gewollt) |
| Keine Spielstand-Migration für den Kern | |
| Skilltree bleibt unabhängig, es gibt klare Schnittstellen | |

**Verworfen:** *Haltungen* (vor jedem Kampf eine Rolle wählen, unabhängig von der Klasse). Das macht Rollen
beliebig und nimmt den Klassen die Identität. *Zwei aktive Klassen gleichzeitig* (Hybrid): Die Rüstungsregel
(3 von 5) lässt das nicht zu, und das Balancing würde quadratisch wachsen.

### Entscheidung

**Modell C** (vom Entwickler am 2026-11-12 gewählt). Es löst die drei Kernprobleme (Identität, Lotterie, Koop-Rollen) und behält, was das System
heute besonders macht (Klasse aus Beute, Entdecken, freier Wechsel). Die Zahlen-Sofortkorrekturen aus dem Review,
die unabhängig vom Modell richtig sind (Schild, Heiliger Hammer, Krit-Obergrenze), kommen als Etappe 1 vorweg.

---

## 4. Modell C im Detail

### 4.1 Grundregeln der Klassenleiste

| Regel | Wert | Begründung |
|---|---|---|
| Grösse | **4 Ladungen**, für alle Klassen gleich | eine Anzeige, ein Lernaufwand |
| Start | 0 zu jedem Kampf (auch im Turm, in Dungeons und im Koop) | kein Mitnehmen über Kämpfe, kein Exploit über leichte Kämpfe |
| Füllen | klassenspezifische Auslöser, **höchstens 2 Ladungen pro Runde** | Fülldauer planbar, keine Ketten |
| Ziel-Fülldauer | **3–5 Runden**, also 2–3 Signaturen pro Bosskampf (7–12 Runden) | spürbar, aber kein Dauerknopf |
| Signatur | braucht die volle Leiste, **kein Mana, keine Abklingzeit**, ersetzt den Angriff der Runde | die Leiste ist die Bremse |
| Klassenlos | keine Leiste, keine Signatur | die Klasse bleibt eine Belohnung |
| Auslöser | ein Ereignis löst höchstens **einen** Auslöser aus (z. B. eine Betäubung mit Kryomant zählt nicht zugleich als Betäubung und als Einfrieren) | keine Doppelzählung |
| Skilltree | Leisten-Knoten pro Pfad geben einen zusätzlichen Auslöser, nie denselben wie die Klasse (docs/skilltree-ueberarbeitung.md 3.6) | Abschnitt 8 |

**Was ist die Signatur für andere Systeme?**

- Für **Skills und Item-Effekte** ist sie **keine Fähigkeit:** Regel „Knoten und Effekte, die von
  *Fähigkeit*, Mana oder Abklingzeit sprechen, gelten nicht; die von *Treffer*, *Krit* oder *Aktion* sprechen,
  gelten“. Also kein Echo, kein Nachhall (8 % kein Mana), keine Blutmagie, keine Eröffnung oder Deckung,
  keine Flinke Hand, keine Mehrfachtreffer-Knoten (Wirbelnde Klingen, Klingentanz, Tausend Schnitte), und eine
  Signatur-Runde zählt nicht als „Runde ohne Fähigkeit“ für Konzentration. Es gelten Krit-Knoten, Hinrichter,
  Erschütterung, Gegenschlag, Zorn, Schmelzen, Kryomant, DoT-Knoten, Lebensband sowie Henkersbeil,
  Bossschlächter und Verwundbar. Die vollständige Liste steht in docs/skilltree-ueberarbeitung.md 5.1.
  Zählt nicht für Kaelthars Aufladung. **[Skilltree]**
- Für **Boss-Mechaniken** ist sie **immer sicher** (entschieden 2026-11-12): Das offene Höhlenauge wirft sie
  nicht zurück, Xal'Zar kann sie nicht verschlingen (sie ist an keine Waffe gebunden), Kaelthar lädt sich an
  ihr nicht auf. Die volle Leiste soll ein verlässlicher Knopf sein; die Entscheidung bleibt das Timing
  (Aufladen abbrechen, vor einer Phase oder der Koop-Raserei einsetzen). Spätere Boss-Absichten dürfen die
  *Leiste* angreifen (5.5, „Bannfluch“), nie die ausgelöste Signatur.
- Krit: würfelt normal, ausser die Signatur sagt „sicher kritisch“.

### 4.2 Budget

Einheit **D** = Schaden pro Treffer des Helden vor Rüstung (wie im Review). Ein normaler Angriff ist gegen
Bosse etwa **0,74 D** wert.

- **Mehrwert einer Signatur** = ihr Schaden bzw. Gegenwert minus 0,74 D (sie ersetzt einen Angriff).
- **Wert pro Runde** = Mehrwert / Fülldauer.
- Ziel: Signatur **0,12–0,18 D pro Runde** (≈ +15 %), Passiv ≈ +10 %. Zusammen **+25 % ±5** über klassenlos.
- Tank und Heiler: Schaden insgesamt eher +10–15 %, dafür Überleben bzw. Gruppenwert.
- Heutige Klassen liegen zwischen ≈ 0 % (Berserker über 50 % LP) und ≈ +45 % (Assassine auf normale Angriffe).

Die Zahlen unten sind **Startwerte für die Simulation**, nicht das Endergebnis.

### 4.3 Die elf Klassen

Legende Rollen: **S** Schaden, **T** Tank, **H** Heiler, **U** Unterstützung, **K** Kontrolle.

#### Magier (leicht + Stab), S / K

- *Fantasie:* Elementar-Burst, unterbricht Rituale und Aufladen.
- **Passiv „Arkane Effizienz“:** Fähigkeiten kosten 15 % weniger Mana (heute −20 % und +5 % Schaden).
- **Leiste „Arkane Ladung“:** +1 pro eingesetzter Fähigkeit, +1 wenn ein Gegner einfriert.
- **Signatur „Arkane Entladung“:** 1,6 D, ignoriert Rüstung, zählt als **Feuer oder Magie, was wirksamer ist**
  (wie Runenklinge), **bricht Aufladen immer ab** (wie Wuchtiger Schlag).
- *Rechnung:* Mehrwert 0,86 D, Fülldauer ≈ 4,5 Runden (Magier zaubert fast jede Runde) → 0,19 D/Runde.
- *Löst:* Ohne Feuerball und Meteor hat er trotzdem einen Burst-Knopf. Magie-Resistenz der Bosse wird
  über die Feuer-Wahl umgangen.
- *Koop:* Unterbrecher gegen angekündigte Boss-Fähigkeiten (Aufladen, Ritual).

#### Hexer (leicht + Zepter), S / U

- *Fantasie:* Verderbnis, die wächst und dann geerntet wird.
- **Passiv „Verderbnis“:** eigenes Gift, Feuer und Bluten **+25 %** (heute +50 %) und 1 Runde länger.
  **„Wandelbare Flüche“:** Ist das Ziel gegen Gift immun, legt der Hexer stattdessen Feuer mit 60 % der Stärke
  (und umgekehrt).
- **Leiste „Seelen“:** +1 pro Runde, in der mindestens einer seiner DoTs am Ziel tickt; +1 wenn ein vergifteter
  oder brennender Gegner fällt.
- **Signatur „Seelenernte“:** 0,3 D Treffer, danach schlägt **jeder eigene DoT am Ziel sofort mit einer Runde
  Schaden** zu (die Laufzeit bleibt). Der Hexer heilt sich um 25 % davon. Im Koop ist das Ziel 2 Runden
  „verflucht“: +10 % Schaden von allen (zählt als Verwundbar, nimmt den höheren Wert).
- *Rechnung:* Gift + Feuer à 0,5 D → 1,0 + 0,3 = 1,3 D, Mehrwert 0,56 D, Fülldauer ≈ 4,5 → 0,12 D/Runde,
  dazu Heilung.
- *Löst:* 0 % gegen die Sumpfechse (Gift wird schwächeres Feuer), zu effiziente DoTs (Bonus halbiert).
  Resistenzen bleiben relevant (60 %).
- *Koop:* Fluch als Gruppen-Verstärker.

#### Assassine (leicht + Dolch), S

- *Fantasie:* Schwachstellen sammeln, dann ein tödlicher Schnitt.
- **Passiv „Meuchler“:** +10 % Krit-Chance (heute +20 %), Krit-Faktor **2,0** (heute 2,25; das Review
  schlug 2,1 vor, mit Modell C und Halsschnitt gilt 2,0).
  Global neu: **Krit-Gesamtobergrenze 60 %** inklusive Klasse, Skilltree, Item-Effekte und Segen, geprüft beim
  Würfeln des Treffers (`CRIT_CAP_TOTAL`, kommt schon in Etappe 1). **[Skilltree]**
- **Leiste „Schwachstelle“:** +1 pro kritischem Treffer, +1 pro eingesetzter Dolch-Fähigkeit.
- **Signatur „Halsschnitt“:** 0,8 D, **sicher kritisch** (= 1,6 D), ignoriert Rüstung; gegen Ziele unter 30 % LP
  ×1,5.
- *Rechnung:* Passiv ≈ +15 % (Krit-Erwartung 1,21 statt 1,055). Signatur Mehrwert ≈ 0,7 D, Fülldauer ≈ 5 →
  0,14 D/Runde. Zusammen ≈ +30 % statt heute ≈ +45 %. Bleibt die Krit-Klasse, ist aber nicht mehr allein vorne.
- *Koop:* **„Schatten“:** Bedrohung aus ihren kritischen Treffern zählt nur halb. Sie wird nicht
  automatisch zum Ziel jedes Bosses.

#### Waldläufer (mittel + Bogen), S / U

- *Fantasie:* Jäger, der die Beute markiert und aus Distanz trifft.
- **Passiv „Fernkämpfer“:** +8 % Schaden (heute +12 %), Fernkampf (wie heute, z. B. gegen fliegende Bosse),
  Pfeilhagel mit 5 Pfeilen.
- **Leiste „Fokus“:** +1 pro Runde, in der er Schaden macht; +1, wenn er in der Vorrunde **nicht getroffen**
  wurde (Abwehren mit Ausweichschuss, Bollwerk eines Mitspielers, betäubter Boss).
- **Signatur „Beute markieren“:** 1,2 D Schuss, das Ziel ist 3 Runden **markiert:** +15 % erlittener Schaden
  (im Koop von allen; nimmt den höheren Wert mit Jägermal, stapelt nicht). Krits des Waldläufers gegen
  Markierte geben +1 Ladung.
- *Rechnung solo:* 0,15 D + 3 · 0,15 · 0,9 D ≈ 0,55 D Mehrwert, Fülldauer ≈ 3,5 → 0,16 D/Runde.
  Im Koop wächst der Wert mit jedem Mitspieler.
- *Koop:* Unterstützung über Markierung, belohnt einen Tank in der Gruppe (Fokus).

#### Duellant (mittel + 2 Schwerter), S / T (Ausweich-Tank)

- *Fantasie:* Tempo und Konter, das Schwert bekommt seine Identität.
- **Passiv „Fechtkunst“** (nicht „Klingentanz“, so heisst ein Klinge-Knoten): +10 % Schaden, **40 %** Zweitschlag bei normalen Angriffen (heute 35 %).
- **Leiste „Rhythmus“:** +1 pro Zweitschlag, +1 pro Konter (Parade, Konterstellung, Signatur), +1 pro
  Schwert-Fähigkeit.
- **Signatur „Duell“:** ein Hieb mit 1,0 D, danach **2 Runden Duellhaltung:** Einzelangriffe auf ihn machen
  30 % weniger Schaden, und er kontert jeden mit 0,6 D. Im Koop zieht die Duellhaltung die Bedrohung auf ihn
  (Spott mit Anteil 0,75 wie Bollwerk). Für Zorn des Bollwerks zählt die Duellhaltung wie eine Parade.
- *Rechnung:* 0,26 + 2 · 0,6 · 0,74 ≈ 1,15 D Mehrwert plus Schutz, Fülldauer ≈ 5 → 0,23 D/Runde. Bewusst
  über Budget, weil die Schwert-Fähigkeiten schwach sind (Review 3.2). Nach den Schwert-Korrekturen neu messen.
- *Koop:* Ausweich-Tank für Gruppen ohne Schild.

#### Plünderer (mittel + Axt), S (Bruiser)

- *Fantasie:* zäher Wilder, der von Wunden lebt.
- **Passiv „Beutezug“:** +12 % Schaden (heute +20 %), 8 % Lebensraub (heute 10 %), Krits lassen bluten
  (bleibt), +25 % Gold (bleibt).
- **Leiste „Gier“:** +1 pro Runde, in der das Ziel blutet; +1 pro Krit.
- **Signatur „Ausweiden“:** 1,4 D, gegen Blutende ×1,5, **heilt um 50 % des Schadens**.
- *Rechnung:* gegen Blutende 2,1 · 0,74 ≈ 1,55 D, Mehrwert 0,8 D, Fülldauer ≈ 3,5 → 0,23 D/Runde, dazu Heilung.
  Das Passiv sinkt dafür um ≈ 8 %.
- *Wechselwirkung:* Das Krit-Bluten des Plünderers verdrängt heute den Schnitter. Gelöst durch den
  Schnitter-Fix der Skilltree-Überarbeitung: Liegt ein stärkeres Bluten, verlängert der Schnitter es um
  1 Runde (höchstens einmal pro Runde). Keine eigene Plünderer-Regel. **[Skilltree]**
- *Koop:* Schadensklasse, die kaum Heilung braucht.

#### Kleriker (mittel + Streitkolben), H / U

- *Fantasie:* Der Heiler der Gruppe, solo zäh und gerecht.
- **Passiv „Frömmigkeit“** (nicht „Segen“, das sind die Turm-Segen): 2 % LP-Regeneration pro Runde
  (bleibt), Heiltränke +15 % (bleibt). Im Koop heilen Heiliges Licht und Läuterung beim Kleriker **alle
  Mitspieler mit 50 %** (`groupHeal`, Review Nr. 5).
  *Gestrichen:* die zuerst geplante „Gnade“ (Überheilung als Schild). Diese Mechanik gibt es nur einmal, als
  Plage-Meisterschaft **Lebensband** (15 %) im Skilltree; ein Kleriker mit Lebensband macht seine
  Gruppenheilung zum Schild der Mitspieler. **[Skilltree]**
- **Leiste „Glaube“:** +1 pro Runde, +1 pro eingesetzter Heilfähigkeit (Heiliges Licht, Läuterung, Arkane
  Heilung).
- **Signatur „Gebet“:** heilt sich um 20 % der LP und entfernt Gift, Feuer und Bluten, dazu ein Lichtschlag mit
  1,0 D (Wucht oder Magie, was wirksamer ist). **Im Koop:** heilt alle lebenden Mitspieler um 15 %, reinigt sie
  und **belebt einen Gefallenen mit 25 % LP** wieder (zählt als seine einmalige Wiederbelebung; ohne Gefallene
  entfällt das).
- *Rechnung solo:* Lichtschlag Mehrwert ≈ 0 bis 0,26 D, dazu 20 % LP alle ≈ 3 Runden. Bosskämpfe werden nicht
  kürzer, aber sicherer. Die Ausdauer-Waffen bleiben bei 0,15 Schaden pro Punkt (entschieden: lange Kämpfe
  sind Teil der Rolle). Nach G1 (Heiliger Hammer) braucht der Kleriker in der Simulation im Mittel 14,7 Runden;
  Ziel höchstens 16.
- *Koop:* **der Heiler.** Gruppenheilung ohne Zielwahl, darum keine neue Ziel-UI nötig.

#### Paladin (schwer + Streitkolben oder Schwert + Schild), T / H

- *Fantasie:* Schutzschild der Gruppe, der Schaden in Vergeltung verwandelt.
- **Zwei Waffen-Varianten** (entschieden 2026-11-12, Abweichung von der Empfehlung „erst nach Etappe 2“):
  Streitkolben + Schild wie heute, **neu auch Schwert + Schild**. Einzelheiten unten unter „Paladin mit
  Schwert“.
- **Passiv „Schildeid“** (nicht „Bollwerk“, so heisst die Schild-Fähigkeit): +10 % Schaden, +20 % Rüstung, Bollwerk halbe Kosten, Bollwerk und Vergeltung mit
  Schildstoss (bleibt), Bedrohung ×2 im Koop (bleibt). Dazu Waffen-Korrektur Schild-Basisangriff
  **1,5 → 2,2** (Etappe 1, umgesetzt: Paladin in der Simulation 30 → 49 % Siege, 18,3 → 17,0 Runden).
- **Leiste „Entschlossenheit“:** +1 pro Runde, in der er getroffen wird **oder** einen Angriff blockt bzw.
  abwehrt; +1 zusätzlich für einen Bollwerk-Block.
- **Signatur „Richtspruch“** (nicht „Schwur“, um den Wehr-Knoten „Wächterschwur“ nicht zu verwechseln):
  1,0 D Wucht **plus 40 % des Schadens, den er seit dem letzten Richtspruch abgewehrt, geblockt oder durch
  Schildwall gemindert hat** (höchstens +1,5 D). Im Koop bekommen alle Mitspieler zusätzlich einen Schild
  von 10 % ihrer LP. Er landet im **gemeinsamen Schild-Topf** des Helden (`ward`, wie Lebensband), alle
  Quellen zusammen höchstens 15 % der LP, verfällt am Kampfende. **[Skilltree]**
- *Rechnung:* typisch +0,8 D Mehrwert, mit viel Abwehr bis 1,8 D, Fülldauer ≈ 3,5 → 0,23–0,5 D/Runde. Er ist
  heute die schwächste Heavy-Klasse; die Signatur macht seinen Tank-Stil zum Schaden.
- *Exploit-Prüfung:* Dauer-Abwehren füllt die Leiste, macht aber keinen Schaden; die Obergrenze verhindert
  riesige Richtsprüche. Unbedenklich.
- *Koop:* Haupt-Tank mit Gruppenschild. Bedrohung ×2 bleibt; der Wehr-Knoten Wächterschwur macht jeden Helden
  zum Ersatz-Tank, aber nur mit 60 % Anteil gegen 0,75 bei Bollwerk und Schildwall. **[Skilltree]**

**Paladin mit Schwert** (entschieden, Umsetzung in G3 Etappe 2):

- *Erkennung:* `matches: (w) => w.includes("shield") && (w.includes("mace") || w.includes("sword"))`, dazu
  3 schwere Rüstungsteile wie bisher. Keine Überschneidung: Der Duellant braucht **zwei** Schwerter und
  **mittlere** Rüstung, und niemand trägt gleichzeitig 3 schwere und 3 mittlere Teile. Mittel + Streitkolben +
  Schild bleibt Kleriker, schwer + Streitkolben + Schwert bleibt klassenlos (ohne Schild kein Paladin). Heute
  klassenlose Helden mit schwer + Schwert + Schild werden automatisch Paladin. Keine Migration; der
  Koop-Server erkennt es aus dem Cloud-Spielstand wie jede Klasse. Der Kodex zeigt „Streitkolben oder Schwert
  und Schild“.
- *Attribute – das Problem:* Das Schwert skaliert mit Stärke (0,25 pro Punkt), der Schild mit Ausdauer (0,15).
  Bei zwei Waffen zählt jedes Attribut nach Anteil am Angriff (Schwert 3,0 : Schild 2,2 → 58 : 42). Rechnung
  Lv. 40 (78 Punkte): Streitkolben-Paladin alles in Ausdauer → +11,7 Schaden, +117 LP, +7,8 Schild-Rüstung.
  Schwert-Paladin alles in Stärke → +11,3 Schaden, keine LP; 60/40 verteilt → +8,7 Schaden, +46 LP. Die
  Schwert-Variante wäre bei gleichem Schaden deutlich zerbrechlicher: eine Falle für einen Tank.
- *Varianten:* (A) Stärke bleibt: einfach, aber eine Falle (siehe oben). (B) **„Geweihte Klinge“: Als Paladin
  skaliert das Schwert mit Ausdauer** (0,15 wie Streitkolben und Schild). Der Paladin bleibt eine
  Ein-Attribut-Klasse, beide Varianten haben dieselben Werte, der Unterschied liegt in Fähigkeiten und
  Schadensart. (C) Stärke, dafür mehr Klassenbonus mit Schwert: zwei Zahlensätze für eine Klasse, schwer
  abzustimmen. **Empfehlung: B.** Ort: `attributeDamage` in `weaponScaling.ts` bekommt die Klasse (sie wird in
  `getHeroCombatProfile` ohnehin zuerst bestimmt), Konstante `PALADIN_SWORD_STAT = "endurance"`. Charakterbogen
  und Hilfe nennen „Schwert (als Paladin: Ausdauer)“. Wer zwischen Schwert-Paladin und Duellant wechselt,
  verteilt seine Attribute neu, wie heute bei jedem Waffenwechsel.
- *Abgrenzung zum Duellanten:*

  | | Paladin mit Schwert | Duellant |
  |---|---|---|
  | Rüstung, Waffen | schwer, Schwert + Schild | mittel, zwei Schwerter |
  | Attribut | Ausdauer (Geweihte Klinge) | Stärke |
  | Rolle | Tank (Bedrohung ×2, Bollwerk, Gruppenschild) | Schaden, Ausweich-Tank |
  | Fähigkeiten | Schwert- und Schild-Pool | zweimal der Schwert-Pool (ohne Doppelte) |
  | Leiste, Signatur | Entschlossenheit → Richtspruch | Rhythmus → Duell |
  | Schaden | tief, wächst mit abgewehrtem Schaden | Zweitschlag 40 %, +10 % |

  Das Schwert bekommt eine Tank-Heimat, ohne dem Duellanten etwas zu nehmen. Normale Angriffe zählen mit der
  Hauptwaffe (der ersten, die kein Schild ist): Der Schwert-Paladin schlägt mit **Klinge**, der
  Streitkolben-Paladin mit **Wucht**. Das ist eine echte Wahl gegen Schwächen und Resistenzen (z. B. der
  Steingolem widersteht Klingen).
- *Signatur und Passiv:* unverändert. „Schildeid“ hängt am Schild (Bollwerk halbe Kosten, Schildstoss) und
  wirkt in beiden Varianten. Die **Parade** des Schwerts zählt für die Leiste „Entschlossenheit“ als Abwehren,
  ihr geminderter Schaden zählt für den Richtspruch wie geblockter. Der Richtspruch bleibt **Wucht**
  (Klassen-Fähigkeit, nicht an die Waffe gebunden). Der Schwert-Paladin verzichtet auf Heiliges Licht,
  Läuterung und Betäubung des Streitkolbens und bekommt Parade, Schwertwirbel und Konter: der offensivere Tank.
- *Koop:* unverändert (Bedrohung ×2, Gruppenschild, Spott 0,75 mit Bollwerk). Die Parade wirkt im Koop wie
  heute nur gegen den Boss. Neuer Server-Code nur für Erkennung und Attribut-Regel, beides läuft über
  `getHeroCombatProfile` auch auf dem Server (`npm run functions:build`).
- *Simulation (G3 Etappe 5):* beide Varianten mit eigener Zeile (`CLASS_BUILDS` in `src/test/classSim.ts` um
  einen Schwert-Paladin erweitern). Ziel: höchstens 5 Punkte Abstand zwischen den Varianten.

#### Berserker (schwer + Grossaxt), S

- *Fantasie:* Wird gefährlicher, je mehr er blutet, und zahlt mit Leben.
- **Passiv „Blutzorn“** (nicht „Raserei“, so heisst eine Grossaxt-Fähigkeit): **+10 % Schaden immer** (heute 0), unter 50 % LP +20 % Schaden (heute +30 %) und 8 %
  Lebensraub (Review Nr. 2).
- **Leiste „Wut“:** +1 pro erlittenem Treffer, +1 pro eigenem Krit. Unter 50 % LP zählt jeder Auslöser
  doppelt (Obergrenze 2 pro Runde gilt).
- **Signatur „Entfesseln“:** kostet 10 % der aktuellen LP, dann **3 Hiebe à 0,6 D** (unter 50 % LP: 4),
  jeder kann kritisch treffen, 20 % Lebensraub.
- *Rechnung:* 1,8 · 0,74 = 1,33 D, Mehrwert 0,6 D (4 Hiebe: 1,03 D), Fülldauer ≈ 3 → 0,2–0,34 D/Runde.
- *Skilltree:* Die LP-Kosten von Entfesseln sind keine Blutmagie und zählen nicht dafür; die
  Mehrfachtreffer-Knoten (Wirbelnde Klingen, Klingentanz, Tausend Schnitte) gelten für Entfesseln nicht. **[Skilltree]**
- *Koop:* reine Schadensklasse mit Selbstheilung.

#### Champion (schwer + Zweihandschwert), S / U

- *Fantasie:* Anführer, der die Gruppe mitreisst.
- **Passiv „Vorkämpfer“:** +8 % Schaden (heute +15 %), +10 % LP (bleibt).
- **Leiste „Ruhm“:** +1 pro Runde mit Treffer, +1 pro Krit, +1 wenn ein Gegner fällt.
- **Signatur „Kampfbanner“:** 1,2 D Hieb, dann steht 3 Runden ein Banner: **+15 % Schaden für ihn**, im Koop
  **+10 % für alle Mitspieler** (Banner mehrerer Champions stapeln nicht, der höhere zählt; stapelt mit
  Kriegsschrei).
- *Rechnung solo:* 0,15 + 3 · 0,15 · 0,9 ≈ 0,55 D, Fülldauer ≈ 3,5 → 0,16 D/Runde. Passiv sinkt um 7 %.
- *Koop:* Unterstützung über Gruppenschaden.

#### Wächter (schwer + Grosshammer), K / T

- *Fantasie:* Der Berg, der Gegner niederhält.
- **Passiv „Bergwacht“** (nicht „Fels“, so heisst ein Wehr-Knoten): +15 % LP, +10 % Rüstung, Schwächungen 1 Runde länger (bleibt).
- **Leiste „Beben“:** +1 pro Grosshammer-Fähigkeit, +1 pro gelandeter Betäubung oder Schwächung.
- **Signatur „Bergbrecher“:** 1,2 D Wucht an **alle** Gegner. Das Ziel ist **sicher betäubt**, ausser es ist
  betäubungsimmun; dann macht es stattdessen 2 Runden 30 % weniger Schaden. Bricht Aufladen immer ab.
- *Rechnung:* Mehrwert 0,15 D Schaden plus eine ausgesetzte Boss-Runde (≈ ein Bosstreffer), Fülldauer ≈ 4.
  Die Immunität (`STUN_IMMUNITY_ROUNDS`) bleibt die Bremse.
- *Koop:* Kontrolle, sekundär Tank.

### 4.4 Übersicht nach Rollen

| Rolle | Haupt | Neben | Koop-Werkzeug |
|---|---|---|---|
| Tank | Paladin | Wächter, Duellant | Bedrohung ×2, Duellhaltung (Spott), Gruppenschild |
| Heiler | Kleriker | Paladin, Hexer (selbst) | Gebet (Gruppe + Wiederbeleben), Heiliges Licht 50 % für alle |
| Unterstützung | Champion | Waldläufer, Hexer | Banner +10 %, Markieren +15 %, Fluch +10 % |
| Kontrolle | Wächter | Magier | Betäubung, Unterbrechen |
| Schaden | Assassine, Berserker, Plünderer | Magier, Hexer, Waldläufer, Duellant, Champion | – |

Jede Rolle hat mindestens zwei Klassen, ausser dem Heiler (siehe 4.6, Druide als Option).

### 4.5 Koop-Regeln zu den Rollen

- **Heilung erzeugt Bedrohung:** 50 % der geheilten LP bzw. des Schildwerts (heute 0). So zieht ein Heiler
  ohne Tank Angriffe auf sich, und Tanks haben einen Grund.
- **Gruppenwirkungen stapeln nicht mit sich selbst:** zwei Banner, zwei Markierungen, zwei Flüche → der
  höchste Wert zählt. Verschiedene Effekte stapeln (Banner + Markierung).
- **Gruppenheilung skaliert nicht mit der Spielerzahl,** sie wirkt einfach auf mehr Helden. Beobachten, ob
  ein Kleriker zu viert zu stark ist (Gebet heilt dann 4 · 15 %).
- **Kampfdauer: rundenbasierte Boss-Raserei** (entschieden 2026-11-12, Umsetzung G3 Etappe 3). Heute hängt
  Raserei nur an LP-Phasen; mit Heiler, Tank, Wächterschwur und Lebensband kann eine Gruppe Kämpfe sehr in
  die Länge ziehen. Das bringt keine Beute, kostet nur Zeit (30 Sekunden pro Zug).
  - **Regel:** Ab **Runde 20** macht der Gegner im Koop jede Runde **+10 % Schaden** (additiv: Runde 20 +10 %,
    Runde 25 +60 %, Runde 30 +110 %), ohne Obergrenze. Heroische Endbosse (+50 % LP) erst ab **Runde 30**
    (20 × `HEROIC_HP`). Konstanten `COOP_ENRAGE_ROUND = 20` und `COOP_ENRAGE_STEP = 0.1` in `coopCombat.ts`,
    Funktion `coopEnrageFactor(round, heroic)`.
  - **Wirkt auf** den Schaden des Gegners (`boss.c.damage`: normale Angriffe, Fähigkeiten und alles, was davon
    abhängt, z. B. sein Gift). Multipliziert sich mit der Phasen-Raserei (`bossMechanics.ts`) und dem Elite
    „Wütend“. Nicht auf Begleiter und Hydra-Köpfe: Sie sind zerbrechlich und fallen ohnehin früh. Im
    Koop-Dungeon zählt jeder Kampf für sich (die Runde beginnt wieder bei 1).
  - **Ankündigen:** ab Runde 17 Hinweis am Gegner „Raserei in 3 Runden“, ab Runde 20 Abzeichen „Raserei +X %“,
    Ereignis `enrage` (Faktor) für Log und Szene (roter Puls). **Kontern:** Signaturen aufsparen und vor
    Runde 20 entladen, Abwehren, Schwächung, Bergbrecher, Bollwerk und Gruppenschild. **Belohnen:** schneller
    Sieg.
  - **Server:** rein aus `state.round` berechnet, kein neues Feld im Kampf (laufende Kämpfe bleiben gültig).
    Das neue Ereignis braucht die Protokollerhöhung von G3.
  - **Solo:** keine Raserei (Kleriker und Paladin sollen solo langsam, aber sicher sein; Turm und Dungeons
    haben eigene Bremsen).
  - **Zahlen** (Simulation `src/domain/zzClassSim.test.ts`, `SIM_MODE=coop`, `SIM_ENRAGE`, epische Ausrüstung
    auf Boss-Level, nach G1): Schadensgruppen (Champion, Assassine, Wächter, Plünderer) siegen gegen Frostriese
    und Weltenverschlinger im Median nach 11–14 Runden, 90 % bis Runde 15, höchstens 18. Raserei ab 20 trifft
    sie nie. Tank-lastige Gruppen (Paladin, Kleriker, Wächter, Champion) brauchen 14–19 Runden (90 %: 16–20)
    und spüren sie kaum (Frostriese zu zweit 95 → 92 % Siege). Ein Paladin-Kleriker-Duo, das jede zweite
    Runde abwehrt, braucht gegen den Frostriesen im Median 23 Runden (bis 31): Die Raserei senkt seine Siege
    von 39 auf 23 % und kappt die Dauer bei 26. Ab Runde 15 träfe sie schon normale Tank-Gruppen (Duo
    95 → 69 %), ab Runde 25 bremst sie heute gar nicht und mit der stärkeren Heilung aus G3 erst recht nicht.
    Darum 20 (bei 15–30 Sekunden pro Runde 5–10 Minuten pro Kampf).
  - **Playtest:** Wie viele Koop-Siege enden nach Runde 20 (Ziel: unter 5 % bei normalen Gruppen)? Wird die
    Ankündigung bemerkt? In G3 Etappe 5 mit Gebet, Richtspruch-Schild und Lebensband neu simulieren.
- **Rollen sind keine Pflicht:** Simulation (Etappe 5) mit „2 Schadensklassen + Tränke“ gegen jeden Koop-Boss,
  Ziel ≥ 50 % Siege bei passender Ausrüstung.

### 4.6 Neue Klasse? (optional)

**Druide (mittel + Stab), H / K.** Heute klassenlose Kombination. Heilung über Zeit statt Sofortheilung,
Natur statt Licht:

- Passiv: Arkane Heilung heilt die Gruppe mit 75 % statt 50 %, Feuer der Stab-Fähigkeiten wird zu Gift
  („Ranken“) mit gleicher Stärke.
- Leiste: +1 pro Runde, in der eine Heilung über Zeit läuft; +1 pro Einfrieren.
- Signatur „Wildwuchs“: 4 Runden lang heilen sich alle Helden um je 5 % (Koop alle, solo er), dazu 0,8 D Gift.

**Entschieden (2026-11-12):** Der Druide ist in **G4** eingeplant; ob er kommt, entscheidet der Playtest des
Klerikers nach G3. Er nimmt dem Kleriker das Alleinstellungsmerkmal und lohnt sich nur, wenn Gruppen ohne
Kleriker zu oft scheitern. Mittel + Stab ist heute klassenlos, die Erkennung braucht keine Ausnahme
(Magier: leicht + Stab).

### 4.7 Was die Klasse beim Erkennen ändert

- Die Regel „3 von 5 + Waffe“ bleibt. **Entschieden:** Paladin auch mit **Schwert + Schild**, mit „Geweihter
  Klinge“ (das Schwert skaliert beim Paladin mit Ausdauer), siehe 4.3.
- **Klassenlose Helden** bekommen keine Grund-Signatur (entschieden). Dafür eine frühe Quest
  **„Finde deine Klasse“** (G3 Etappe 4): Story-Quest ab Lv. 5, Ziel „gewinne einen Kampf mit aktiver Klasse“
  (neuer Zieltyp `{ kind: "classWin" }`, Quest-Ereignis beim Sieg mit `heroClass !== null`). Der Text erklärt
  die Regel „3 Rüstungsteile + Waffe“ und verweist auf den Klassen-Kodex. Belohnung: Gold wie eine
  Gebietsquest des Levels und ein seltenes Rüstungsteil der Rüstungsklasse, die zur angelegten Hauptwaffe
  passt (hilft beim dritten Teil). Neue Quest-Id, voraussichtlich ohne Migration (beim Umsetzen prüfen). Warum
  G3 und nicht G4: Mit Leiste und Signatur wird der Abstand für Klassenlose erst richtig sichtbar; die Quest
  gehört zum selben Release.
- **Ausrüstungsglück für die Klasse senken:** Beim Schmied die Rüstungsklasse eines Teils **umschmieden**
  (z. B. leicht → mittel) gegen Gold und Essenz. Damit wird „ich will Kleriker spielen“ planbar. Eigenes
  kleines Projekt, passt zu docs/dorf-gebaeude-konzepte.md.

---

## 5. Auswirkungen auf andere Systeme

### 5.1 Waffen und Fähigkeiten

- **Schild** Basisangriff 1,5 → 2,2 (Review Nr. 3). Unabhängig vom Modell richtig. *Umgesetzt in G1.*
- **Heiliger Hammer:** zählt als Wucht oder Magie, was wirksamer ist, Faktor 1,4 → 1,5 (Review Nr. 6).
  *Umgesetzt in G1* (`altKind` in `AbilityDef`, `bestKind` in `matchups.ts`).
- **Fähigkeiten-Lotterie:** Die Signatur gibt jeder Klasse einen garantierten starken Knopf. Darum **keine**
  Änderung an `rollWeaponAbilities` und keine Kernfähigkeit pro Waffe nötig (das würde gespeicherte Waffen
  verändern). Der Schmied-Neuwurf gegen Essenz (docs/waffen-faehigkeiten.md, „Ideen für später“) bleibt als
  Komfort sinnvoll.
- **Pool-Korrekturen** aus Review Priorität 2 (Zertrümmern, Vergeltung, Hackwirbel, Schattenschritt,
  Konterstellung …) bleiben nötig, weil die Waffen-Knöpfe weiterhin den Grossteil der Runden ausmachen.
- `classAbility` bleibt für die Klassen-Varianten der Waffen-Fähigkeiten (Magier-Kosten, Pfeilhagel,
  Schildstoss, Wächter-Schwächung, Hexer-DoTs, neu Kleriker-`groupHeal`).

### 5.2 Skilltree **[Skilltree]**

Siehe Abschnitt 8. Kurz: Krit-Obergrenze, Schnitter-Fix statt Plünderer-Regel, Lebensband statt Gnade, Wächterschwur schwächer als Paladin,
mögliche Leisten-Knoten, Echo/Nachhall gelten nicht für die Signatur.

### 5.3 Items und Sets

- Boss-Sets bleiben, wie sie sind.
- **Klassen-Effekte** (Etappe 6, optional): ein neuer Pool legendärer Item-Effekte, die nur mit der passenden
  Klasse wirken, z. B. „Überladung: Die Leiste beginnt mit 1 Ladung“ (Magier), „Urteilsstein: Der
  Richtspruch heilt um 10 %“ (Paladin), „Blutfahne: Das Banner hält 1 Runde länger“ (Champion). Sie geben
  legendären Drops einen Klassenbezug und Langzeitziele pro Klasse. Neue Effekte brauchen Icons.
- Gear Score: Klassenleiste und Signatur gehen nicht in den Gear Score ein (er bewertet Items).

### 5.4 Koop-Server

- `CoopAction` bekommt `signature?: true` (geht vor `ability`, nach `defend`). Der Server prüft die volle
  Leiste selbst; was der Client behauptet, zählt nicht.
- `CoopHero` bekommt `charge`, `absorbedSinceVerdict` (Paladin), den Schild-Topf `ward` (gemeinsam mit Lebensband), Wirkungen `banner`, `duel`; Gegner bekommen
  `marked`/`cursed` (oder es wird `vulnerable` mit „höherer Wert zählt“ wiederverwendet).
- Die Klasse kommt wie heute aus `getHeroCombatProfile` auf dem Server (Cloud-Spielstand).
- Laufende Kämpfe in `coop_battles` (jsonb) haben die neuen Felder nicht: überall `?? 0` bzw. optional lesen.
- **Ältere Clients** kennen die neuen Ereignisse nicht. Seit G1 gibt es `COOP_PROTOCOL_VERSION` in
  `protocol.ts` (Version 1). Der Server lehnt Befehle älterer Clients mit „bitte neu laden“ ab (`checkProtocol`
  in `server.ts`, früh auch in der Edge Function). G3 erhöht die Version.
- Danach `npm run functions:build` (Deploy nur auf Anweisung).

### 5.5 Turm, Elites, heroische Bosse

- **Turm:** Leiste pro Stockwerk neu. Optionaler neuer Segen „Kampfbereit: Die Leiste beginnt mit
  1 Ladung“ (einmal wählbar). Turm-Rekorde werden durch die Klassenbalance beeinflusst; die Spreizung
  (Etappe 0) schützt die Wochenrangliste.
- **Elites:** Später ein Affix „Dämpfend: Deine Leiste füllt sich nur zur Hälfte“ (angekündigt am Namen).
  Nicht in der ersten Runde.
- **Heroische Bosse / Boss-Absichten:** Später Absichten, die auf die Leiste zielen, z. B. „Bannfluch: leert
  in 2 Runden alle Leisten“ → Konter: vorher die Signatur einsetzen. Das passt genau zu „ankündigen, kontern,
  belohnen“.

### 5.6 Ranglisten und Profile

- Das Klassen-Abzeichen kommt schon heute aus dem Ausrüstungs-Schnappschuss (`HeroClassBadge` in der
  Rangliste). Keine neuen öffentlichen Felder nötig.
- **Keine Rangliste nach Klasse** (entschieden 2026-11-12): Sie würde die Klassenbalance öffentlich
  vergleichbar machen, und die Klasse kommt wie der ganze Schnappschuss vom Client. Das Klassen-Abzeichen in
  der Rangliste bleibt.
- Rollen in der Koop-Lobby anzeigen (Icon der Rolle neben dem Namen), Freunde sehen die Rolle in der
  Lobby-Presence.

### 5.7 Erfolge

- „Wandelbar“ bleibt.
- Neu (Etappe 6; entschieden: zusammen mit den Meisterschafts-Erfolgen des Skilltrees in **einem** Schritt
  mit v25): „Signatur 50/250/1000-mal eingesetzt“, „Mit dem Gebet einen Gefallenen zurückgeholt“,
  „Richtspruch mit über 2 D“. Braucht neue Zähler in `records` (siehe Migration).

---

## 6. Technische Umsetzung (Skizze)

**Domain (`heroClasses.ts`):**

```ts
export type ClassRole = "damage" | "tank" | "healer" | "support" | "control";

export type ChargeTrigger =
  | "round" | "dealtDamage" | "crit" | "anyAbility" | "weaponAbility" | "healAbility"
  | "tookHit" | "notHitLastRound" | "blockedOrDefended" | "bulwarkBlock"
  | "dotTicked" | "targetBleeding" | "stunLanded" | "weakenLanded" | "freezeLanded"
  | "extraHit" | "counter" | "foeDown";

export interface ClassKit {
  roles: [ClassRole, ClassRole?];
  /** Ladungen pro Auslöser – höchstens CHARGE_PER_ROUND pro Runde */
  charge: Partial<Record<ChargeTrigger, number>>;
  signature: SignatureDef;
}

export const CHARGE_MAX = 4;
export const CHARGE_PER_ROUND = 2;
```

- `SignatureDef` erweitert die Felder von `AbilityDef` (Multiplikator, Treffer, `ignoreArmor`, `guaranteedCrit`,
  `interrupt`, `stun`, `weaken`, `lifesteal`, `heal`, `groupHeal`, `taunt`) um wenige neue:
  `bestKind` (Feuer/Magie bzw. Wucht/Magie), `harvestDots`, `banner`, `mark`, `groupShield`, `revive`,
  `vowShare`/`vowCap`, `selfCost`. So läuft der Treffer durch dieselben Wege in `combatCore.ts`
  (`heroVolley`, `afterHeroHit`) wie eine Fähigkeit.
- `chargeGain(kit, triggers): number` als reine Funktion, getestet; Solo und Koop rufen sie gleich auf.
- Werte als benannte Konstanten (`ASSASSIN_CRIT_MULTIPLIER`, `CLERIC_PRAYER`, `PALADIN_VOW` …).

**Solo (`combat.ts`):** `BattleState.charge`, neue Aktion `signatureRound(state, rng)` neben `attackRound`,
Ereignisse:

| Ereignis | Inhalt |
|---|---|
| `charge` | `gained`, `value` (für das Aufleuchten der Leiste) |
| `signature` | `classId` (Animation, Log) |
| `harvest` | Schaden der geernteten DoTs |
| `banner` / `marked` / `duel` | Beginn der Wirkung |
| `vow` | Zusatzschaden aus abgewehrtem Schaden |
| `enrage` | nur Koop: Boss-Raserei ab Runde 20, Faktor (4.5) |
| `shieldGained` | Schild im gemeinsamen Topf `ward` (Paladin-Gruppenschild, Lebensband), mit `by` bei fremdem Schild; dasselbe Ereignis wie im Skilltree |

**Koop (`coopCombat.ts`):** dieselben Ereignisse mit `heroId`, Gruppenwirkungen, Wiederbeleben durch das Gebet,
Bedrohung aus Heilung, Boss-Raserei (`coopEnrageFactor`).

**Erkennung und Attribute (`heroClasses.ts`, `weaponScaling.ts`):** Paladin-`matches` mit Schwert oder
Streitkolben, `attributeDamage` mit Klasse für die „Geweihte Klinge“ (4.3).

**Phaser:** Signatur-Animationen pro Klasse (anfangs: vorhandene Fähigkeits-Animationen wiederverwenden,
`abilityAnimations.ts`), Banner und Markierung als kleine Overlays.

**UI:** Leiste mit 4 Ladungen im `BattleStatus` bzw. in der Koop-Aktionsleiste, Signatur-Knopf mit eigener
Taste (`useHotkeys`), Kodex und `HeroClassPanel` zeigen Rolle, Passiv, Leiste und Signatur (bei unentdeckten
Klassen weiter „???“). Hilfe (`HelpScreen.tsx`) und README-Spielregeln nachziehen.

**Tests:** pro Klasse Füll-Regeln und Signatur (solo und Koop), Golden Master bewusst erneuern
(`npx vitest run -u`), Balance-Test für die Klassenspreizung (Review Nr. 22) mit Zielband.

---

## 7. Spielstand-Migration

**Kern (Etappen 1–5): keine Migration.**

- Die Klasse ist weiterhin eine Funktion der Ausrüstung, `Character` bleibt gleich.
- Die Leiste ist Kampfzustand; laufende Kämpfe werden nicht gespeichert (`partialize` enthält keinen Kampf).
- Items werden nicht verändert (keine neue Würfelregel für Fähigkeiten).
- Schild-Basisangriff kommt aus dem Katalog, bestehende Schilde werden automatisch stärker.
- Koop: laufende Kämpfe in `coop_battles` lesen neue Felder optional (siehe 5.4).

**Optional (Etappe 6):**

| Was | Änderung | Migration |
|---|---|---|
| Signatur-Erfolge | neue Zähler in `records` (z. B. `signaturesUsed`, `prayerRevives`) | `version` 24 → **25** (v24 gehört dem Skilltree), Schritt `if (version < 25)` setzt die Zähler auf 0; Test in den Migrationstests. Bestehende Erfolge bleiben |
| Klassenränge | `records.classFights: Partial<Record<HeroClassId, number>>` (Siege pro Klasse, Rang 1–5 daraus berechnet) | im selben Schritt leer anlegen; alte Stände starten bei 0, `classesWorn` bleibt unverändert |
| Rüstung umschmieden | neues Feld am `OwnedItem` (`armorClassOverride`) | optionales Feld, `repairSave` lässt es weg, wenn ungültig. Kein Versionsschritt nötig, aber Tausch-Server muss es prüfen (`src/trade/server.ts`) |

**Falls doch Modell B:** jeder Charakter bekommt die Berufung seiner aktuellen bzw. meistgetragenen Klasse,
eine kostenlose Neuwahl, alle Skillpunkte zurück; Waffen anderer Berufungen bleiben im Inventar (nicht
löschen), sind aber nur noch für Begleiter und Verkauf nützlich. Hohe Unzufriedenheit wahrscheinlich.

---

## 8. Berührungspunkte mit dem Skilltree **[Skilltree]**

Alle Punkte sind mit der Skilltree-Überarbeitung abgeglichen und entschieden (Einzelheiten und Begründungen:
docs/klassen-skilltree-abgleich.md).

| # | Thema | Entscheidung | Wo steht es im Skilltree |
|---|---|---|---|
| 1 | Krit-Obergrenze | **Gesamt-Obergrenze 60 %** für alles, geprüft beim Würfeln; kommt in Etappe 1 vor dem Skilltree | 3.1 |
| 2 | Schnitter / Plünderer | Schnitter-Fix des Skilltrees (verlängert stärkeres Bluten um 1 Runde), keine Plünderer-Sonderregel | 3.1 |
| 3 | Lebensband / Kleriker-Gnade | **Nur Lebensband** (15 %), Gnade gestrichen; ein Schild-Topf `ward` pro Held, auch für den Paladin-Gruppenschild, zusammen höchstens 15 % | 3.5 |
| 4 | Wächterschwur | Spott mit 60 % Anteil (`GUARD_OATH_SHARE`), Bollwerk/Schildwall/Duellhaltung 0,75 gewinnen; Paladin-Bedrohung ×2 bleibt | 3.5, 6 |
| 5 | Signatur und Skills | Regel „Fähigkeit/Mana/Abklingzeit gilt nicht, Treffer/Krit/Aktion gilt“: kein Echo, Nachhall, Blutmagie, Eröffnung, Deckung, keine Mehrfachtreffer-Knoten, keine Konzentration in Signatur-Runden | 5.1 |
| 6 | Leisten-Knoten | je Pfad einer (Jagdfieber, Sammlung, Resonanz, Zersetzung), Stufe 4 Spalte 1, 1 Rang, +1 Ladung höchstens alle 2 Runden, nie derselbe Auslöser wie die Klasse, erst nach dem Klassen-Kern | 3.6 |
| 7 | Zorn des Bollwerks | Duellhaltung zählt wie eine Parade | 3.2 |
| 8 | Kryomant | Bergbrecher (sichere Betäubung) zählt als Einfrieren; ein Ereignis = ein Leisten-Auslöser | 3.3, 5.1 |
| 9 | Plage als stärkster Pfad | Kleriker + Plage + Lebensband im Playtest beobachten, keine Vorab-Änderung | – |
| 10 | Hexer-DoT-Bonus halbiert | Giftmischer, Funkenflug, Fäulnis, Vergiftete Waffen in Etappe 5 mitsimulieren; „Wandelbare Flüche“ gilt auch für Gift aus Vergiftete Waffen | – |
| 11 | Namen | Klassen-Passive umbenannt, damit kein Name doppelt ist: Fechtkunst (statt Klingentanz), Bergwacht (statt Fels), Schildeid (statt Bollwerk), Blutzorn (statt Raserei), Frömmigkeit (statt Segen); Paladin-Signatur Richtspruch (statt Schwur); Turm-Segen „Kampfbereit“ | – |
| 12 | Ereignisse | ein gemeinsames `shieldGained` (mit `by`), kein eigenes `shieldGranted` | 3.5 |
| 13 | Versionen | Skilltree v24 (Rückerstattung), Klassen-Kern ohne Version, optionale Klassen-Teile v25 | 7.2 |
| 14 | Reihenfolge | Sofortkorrekturen → Skilltree-Release → Klassen-Kern; Klassen-Kern in eigenen Funktionen (`chargeGain`, `signatureStrike`), damit `combatCore.ts` wenig Konflikte hat | 8 |

---

## 9. Umsetzungsetappen

Die Etappen hier sind die Klassen-Etappen. Wie sie mit dem Skilltree verzahnt sind (G0–G4), steht im
gemeinsamen Plan in docs/klassen-skilltree-abgleich.md: Etappe 0 und 1 = G0/G1, danach der Skilltree-Release
(G2), dann Etappe 2–5 = G3, Etappe 6 mit den Leisten-Knoten = G4. Golden-Master-Erneuerungen nie über zwei
Etappen hinweg zusammenfassen.

| Etappe | Inhalt | Aufwand | Risiko |
|---|---|---|---|
| 0 | ✅ **Simulation als Test:** Klassenspreizung (Review Nr. 22) als Leitplanken-Test `src/domain/classBalance.test.ts`, Hilfsdatei `src/test/classSim.ts` (Klassen-Ausrüstung, KI, Solo und Koop, klassenloser Vergleich), Berichte `src/domain/zzClassSim.test.ts` mit `SIM_MODE` = `spread`, `budget` (D pro Runde je Klasse), `skills`, `coop` | M (1 Tag) | gering |
| 1 | ✅ **Sofortkorrekturen:** Schild 2,2, Heiliger Hammer, Krit-Gesamtobergrenze 60 %, Kleriker-`groupHeal` im Koop, Protokollversion in `src/coop/protocol.ts` (ältere Clients müssen neu laden) | S (½ Tag) | gering; Golden Master erneuert, `functions:build` |
| 2 | **Klassen-Kern solo:** `ClassKit`, Leiste, 11 Signaturen, neue Passive, Paladin mit Schwert (Erkennung, Geweihte Klinge), Ereignisse, Tests | L (3–4 Tage) | mittel: viele Mechaniken auf einmal. Gegenmittel: Signaturen in zwei Wellen (erst Assassine, Paladin, Berserker, Duellant, Kleriker, Magier; dann der Rest) |
| 3 | **Koop:** Aktion `signature`, Server, Gruppenwirkungen, Bedrohung aus Heilung, Wiederbeleben, Spott-Reihenfolge nach Anteil (mit Wächterschwur), **Boss-Raserei ab Runde 20** (4.5), Protokollversion erhöhen | M–L (2–3 Tage) | mittel: Desync mit alten Clients, laufende Kämpfe |
| 4 | **Darstellung:** Leiste, Knopf, Hotkey, Animationen (erst wiederverwendet), Kodex, Lobby-Rollen, Raserei-Anzeige, Quest „Finde deine Klasse“ (4.7), Hilfe, README | M (2–2,5 Tage) | gering; Platz auf dem Handy prüfen |
| 5 | **Abstimmen:** Simulation aller Klassen (selten/episch, Gebietsbosse, Dungeons, beide Paladin-Varianten), Koop 2/3/4 Spieler mit Raserei, Playtest | M (1–2 Tage + Spielzeit) | Zahlen werden sich deutlich bewegen |
| 6 | **Leisten-Knoten im Skilltree** (Skilltree-Etappe 6), dann optional: Klassen-Item-Effekte, Signatur- und Meisterschafts-Erfolge, Klassenränge (Migration v25), Rüstung umschmieden, Druide (nach Playtest des Klerikers), Turm-Segen, Elite-Affix, Boss-Absichten auf die Leiste | je M | je eigenes Projekt |

**Ergebnis G0/G1** (Simulation `SIM_MODE=spread`/`budget`, vor G1 N = 100, nach G1 N = 200, seltene Ausrüstung, alle Gebietsbosse, ohne
Skillpunkte; „Mehrwert“ = Schaden pro Runde gegenüber demselben Helden ohne Klasse):

| Klasse | Siege vor G1 | Siege nach G1 | Runden | Mehrwert Schaden | Klassenlos (Siege) |
|---|---|---|---|---|---|
| Magier | 41 | 42 | 9,3 | +7 % | 33 |
| Hexer | 43 | 43 | 8,6 | +24 % | 20 |
| Assassine | 69 | 68 | 8,6 | +44 % | 15 |
| Waldläufer | 47 | 48 | 8,4 | +15 % | 28 |
| Duellant | 17 | 17 | 9,3 | +30 % | 1 |
| Plünderer | 45 | 44 | 8,8 | +30 % | 9 |
| Kleriker | 44 | **52** | 14,7 | +1 % | 22 |
| Paladin | 30 | **49** | 17,0 | +6 % | 22 |
| Berserker | 23 | 23 | 9,0 | +12 % | 7 |
| Champion | 53 | 53 | 9,6 | +17 % | 17 |
| Wächter | 57 | 57 | 11,7 | +0 % | 26 |

Abstand beste/schlechteste: 52 → 50 Punkte. Schild 2,2 hebt den Paladin aus der Schlussgruppe, der Heilige
Hammer den Kleriker (beide haben Streitkolben). Die Krit-Obergrenze ändert ohne Skillpunkte nichts (die
Assassine liegt bei rund 41 %) und auch mit vollem Klinge-Pfad in der Simulation kaum (Assassine 77 % Siege
mit und ohne Deckel); sie ist die Leitplanke für die neuen Krit-Knoten des Skilltrees (G2). Offen bleiben
Duellant und Berserker (Klassen-Kern G3) und die Assassine vorne (Krit 2,25 → 2,0 in G3).

**Zielwerte für Etappe 5** (seltene Ausrüstung, Gebietsbosse, Simulation wie im Review, **ohne
Skillpunkte**; mit vollem Baum gewinnen laut Skilltree-Vorprüfung fast alle Klassen 80–98 %, das prüft ein
eigener Durchgang mit „Meisterpfad 13 + Zweitpfad 17“ auf Ausreisser):

- Jede Klasse 40–60 % Siege, Abstand beste/schlechteste ≤ 20 Punkte (heute 54).
- Klassenlos mit derselben Ausrüstung 20–30 Punkte unter dem Klassenmittel.
- Bosskampf-Dauer 8–14 Runden für alle Klassen, Kleriker und Paladin höchstens 16.
- Signatur 2–3-mal pro Bosskampf.
- Koop: 2 Schadensklassen ohne Rollen ≥ 50 % gegen jeden Koop-Boss; mit Tank + Heiler spürbar besser
  (+15–25 Punkte), aber nicht trivial.

**Was im Playtest beobachten:**

- Wird die Signatur bewusst getimt (gegen Aufladen, kurz vor Bossphasen) oder einfach sofort gedrückt? Wenn
  sofort: Leiste ist zu langsam oder Signaturen zu ähnlich.
- Spielen sich Champion, Berserker, Duellant und Plünderer jetzt unterschiedlich?
- Fühlt sich die Assassine mit 2,0 noch nach Krit an?
- Paladin solo: Kommt er auf unter 16 Runden? Wie viel macht der Richtspruch typischerweise?
- Koop: Wählen Gruppen den Kleriker freiwillig? Werden Gebete zum Wiederbeleben genutzt oder nur Tränke?
  Ziehen Heiler ohne Tank zu viel Bedrohung?
- Klassenlose Spieler (frühes Spiel bis zur ersten Klasse): Ist der Abstand frustrierend? Führt die Quest
  „Finde deine Klasse“ zur ersten Klasse, und wann wird sie im Schnitt abgeschlossen?
- Paladin mit Schwert: Wird er gespielt, und fühlt er sich anders an als der Streitkolben-Paladin?
- Koop: Enden Kämpfe nach Runde 20 (Raserei)? Wenn bei normalen Gruppen häufiger als 1 von 20: Schwelle
  prüfen.

---

## 10. Entscheidungen (früher: offene Fragen)

Alle Fragen sind am 2026-11-12 entschieden (gesammelt in docs/klassen-skilltree-abgleich.md, Abschnitt 3):

| # | Frage | Entscheidung | Wo eingearbeitet |
|---|---|---|---|
| 1 | Leiste und Signatur-Knopf auf dem Handy | passt, eigener Knopf neben Abwehren | 6 (UI), Etappe 4 |
| 2 | Paladin mit Schwert + Schild | **ja** (Abweichung von der Empfehlung), mit „Geweihter Klinge“ | 4.3, 4.7, Etappe 2 |
| 3 | Signatur gegen Boss-Mechaniken | **immer sicher** | 4.1 |
| 4 | Grund-Signatur für Klassenlose | nein, dafür Quest „Finde deine Klasse“ (G3) | 4.7, Etappe 4 |
| 5 | Ausdauer-Waffen | bleiben bei 0,15 (Teil der Rolle) | 4.3 Kleriker |
| 6 | Koop-Kampfdauer | **rundenbasierte Boss-Raserei** ab Runde 20, +10 % pro Runde | 4.5, Etappe 3 |
| 7 | Druide | in G4 eingeplant, Entscheidung nach dem Playtest des Klerikers | 4.6, Etappe 6 |
| 8 | Rangliste nach Klasse | nein | 5.6 |

Ausserdem entschieden: Modell C, Lebensband statt Gnade, Skilltree vor dem Klassen-Kern, G2 und G3 zusammen
ausliefern, Erfolge für Signaturen und Meisterschaften zusammen mit v25.


---

## 11. Umsetzung G3 (Klassen-Kern)

Code: `src/domain/classKit.ts` (Rollen, Leiste, Signaturen, `chargeGain`, `signatureAbility`), Passive in
`heroClasses.ts`, Solo in `combat.ts` (Aktion `SIGNATURE`, `signatureBlocker`), Koop in `coopCombat.ts`
(`CoopAction.signature`, `coopSignatureBlocker`, Gruppenwirkungen, `coopEnrageFactor`), Quest in `quests.ts`
(`CLASS_QUEST_ID`, `classQuestArmor`), Darstellung in `src/components/ClassGauge.tsx`, `HeroClassInfo.tsx`,
`src/game/signatureStyles.ts` und beiden Kampfszenen. Tests: `classKit.test.ts`, `classKitCoop.test.ts`,
`quests.test.ts`, `src/store/quests.test.ts`, `src/coop/server.test.ts`, Leitplanken in `classBalance.test.ts`.
Keine Spielstand-Migration (Kampfzustand wird nicht gespeichert, die Quest ist eine neue Id). Koop-Protokoll bleibt 2
(G2 und G3 werden zusammen ausgeliefert).

### 11.1 Endwerte nach dem Abstimmen

| Klasse | Passiv | Leiste (gewichtet) | Signatur |
|---|---|---|---|
| Magier | Mana −20 % (Start −15 %) | Fähigkeit +2, Einfrieren +1 | Arkane Entladung 1,8 D (Start 1,6) |
| Hexer | +5 % Schaden, eigene DoTs **+40 %** (Start +25 %), +1 Runde, Wandelbare Flüche 60 % | Runde mit DoT +1, **Zepter-Fähigkeit +2**, DoT-Gegner fällt +1 | Seelenernte 0,7 D (Start 0,3), DoTs einmal sofort, 25 % Heilung, Koop-Fluch +10 % |
| Assassine | +10 % Krit, ×2,0 | Krit +1, Dolch-Fähigkeit **+2** | Halsschnitt unverändert |
| Waldläufer | +8 % | Treffer-Runde +1, nicht getroffen +1, **Bogen-Fähigkeit +1**, Krit auf Markierte +1 | Beute markieren unverändert |
| Duellant | +10 %, 40 % Zweitschlag | Zweitschlag +1, Konter +1, Schwert-Fähigkeit **+2** | Duell unverändert (1 D, ×0,7, Konter 0,6 D) |
| Plünderer | **+15 %** (Start +12 %), 8 % Lebensraub | Bluten-Runde +1, Krit +1, **Axt-Fähigkeit +2** | Ausweiden unverändert |
| Kleriker | unverändert | Runde +1, Heilfähigkeit +1 | Gebet: **8 %** Heilung (Start 20 %), **0,6 D** (Start 1,0); Koop 15 % für alle, Wiederbeleben 25 % |
| Paladin | unverändert; **Geweihte Klinge: Schwert mit Ausdauer und 20 % Lebensraub** | Runde getroffen/abgewehrt +1, Bollwerk-Block +1 | Richtspruch unverändert, Koop-Schild 10 % |
| Berserker | +10 %, unter 50 % +20 %, 8 % Lebensraub | **Runde getroffen** +1 (Start: pro Treffer), Krit +1, unter 50 % doppelt | Entfesseln **3 × 0,45 D** (Start 0,6), 20 % Lebensraub |
| Champion | +8 %, +10 % LP | Treffer-Runde +1, Krit +1, Gegner fällt +1 | Kampfbanner unverändert |
| Wächter | **+10 % Rüstung, kein LP-Bonus** (Start +15 % LP), Schwächungen +1 Runde | Grosshammer-Fähigkeit **+2**, Betäubung/Schwächung +1 | Bergbrecher **0,8 D** (Start 1,2) |

**Warum die Gewichte:** Mit den Startauslösern füllten Magier, Hexer, Plünderer und Wächter die Leiste nur alle
13–21 Runden (Mana erlaubt etwa jede zweite bis dritte Runde eine Fähigkeit, nicht jede). Die Fähigkeits-Auslöser
zählen darum doppelt; jetzt kommt jede Klasse alle 4–7,5 Runden zur Signatur (1,3–2,9 Signaturen pro Bosskampf;
Kleriker und Paladin mit den längsten Kämpfen am häufigsten).

### 11.2 Simulation (Etappe 5)

Solo, seltene Ausrüstung, alle Gebietsbosse, N = 150, Saat 1 und 7, die KI setzt die Signatur sofort ein:

| | Siege ohne Skillpunkte | Runden | Mehrwert Schaden ggü. klassenlos | Voller Baum (13 + 17) |
|---|---|---|---|---|
| Magier | 51 % | 8,3 | +25 % | 72 % |
| Hexer | 42–45 % | 8,9 | +19 % | 70 % |
| Assassine | 58 % | 8,4 | +41 % | 74 % |
| Waldläufer | 46–48 % | 8,1 | +16 % | 66 % |
| Duellant | 52 % | 9,5 | +44 % | 86 % |
| Plünderer | 57 % | 8,8 | +35 % | 89 % |
| Kleriker | 54–56 % | 15,1 | −2 % | 78 % |
| Paladin (Streitkolben) | 58–59 % | 14,8 | +22 % | 83 % |
| Paladin (Schwert) | 53 % | 13,9 | +16 % | 77 % |
| Berserker | 56–58 % | 8,5 | +36 % | 81 % |
| Champion | 50–51 % | 9,3 | +14 % | 77 % |
| Wächter | 58–59 % | 11,6 | +1 % | 81 % |

- Abstand beste/schlechteste ohne Skillpunkte **13–17 Punkte** (vor G3: 50), alle Klassen 42–59 % (Ziel 40–60 % ✓).
- Paladin-Varianten 5–6 Punkte auseinander (Ziel ≤ 5, knapp).
- Klassenlos mit derselben Ausrüstung im Mittel 17 %, also **≈ 34 Punkte** unter dem Klassenmittel (Ziel 20–30,
  etwas darüber – gewollt spürbar; die Quest „Finde deine Klasse“ führt früh zur ersten Klasse).
- Kleriker 15 und Paladin 14–15 Runden (Ziel ≤ 16 ✓), alle anderen 8–12.
- Voller Baum: 66–89 %, Abstand 23 Punkte, kein Wert über 95 %. Spitze sind Plünderer (Klinge) und Duellant
  (Plage + Klinge) – die starken Klinge-Knoten aus G2 bleiben wie vereinbart vorerst unverändert.

**Koop mit Raserei** (epische Ausrüstung auf Boss-Level, N = 100; in Klammern: Raserei testweise ausgeschaltet):

| Gruppe | Boss | Helden | Siege mit Raserei (ohne) | Median Runden | Siege nach Runde 20 |
|---|---|---|---|---|---|
| Champion, Assassine, Wächter, Plünderer | alle drei | 2–4 | unverändert | 11–14 | 0 % |
| Paladin, Kleriker, Wächter | Sumpfhydra | 3 | 63 % (82 %) | 23 | 97 % |
| Paladin, Kleriker, Wächter | Weltenverschlinger | 3 | 79 % (82 %) | 20 | 43 % |
| Paladin, Kleriker | Frostriese | 2 | 100 % (99 %) | 19 | 17 % |
| Paladin + Kleriker, Paladin wehrt jede 2. Runde ab | Frostriese | 2 | 64 % (87 %) | 25 | 97 % |
| Berserker, Magier (2 Schadensklassen) | Hydra / Riese / Verschlinger | 2 | 47 / 86 / 92 % | 9–11 | 0 % |

Die Raserei trifft wie geplant nur Gruppen, die Kämpfe in die Länge ziehen; normale Gruppen enden nie nach Runde 20.
Ziel „2 Schadensklassen ≥ 50 %“: knapp verfehlt nur gegen die Sumpfhydra zu zweit (47 %) – das liegt an der Hydra
selbst (die Schadensgruppe Champion + Assassine schafft sie zu zweit nur zu 8 %), nicht an der Raserei.

### 11.3 Bei der Umsetzung entschieden

| # | Frage | Entscheidung | Grund |
|---|---|---|---|
| 1 | Wo steht der Kern? | Eigenes Modul `classKit.ts`; `heroClasses.ts` behält Erkennung und Passive, deren Texte aus dem Kit kommen | Übersicht |
| 2 | Wie zählt die Leiste? | Pro Runde ein `ChargeTally`; Auslöser **gewichtet** (`Partial<Record<ChargeTrigger, number>>`, wie in der Skizze in 6). Ereignisse mit Zähler (Krit, Treffer) pro Ereignis, Runden-Auslöser einmal | ungewichtet war die Leiste bei Fähigkeits-Klassen zu langsam (11.1) |
| 3 | Lädt die Runde der Signatur? | **Nein** | Sonst füllen sicher kritische (Halsschnitt) oder kontende (Duell) Signaturen die Leiste selbst wieder an |
| 4 | Fällt ein Held im Koop | Leiste auf 0 | Wiederbelebte beginnen neu |
| 5 | Schadensart der Signatur | Eigene, waffenunabhängige Art pro Klasse (Halsschnitt Stich, Duell Klinge, Richtspruch Wucht …); Arkane Entladung über `fireOrMagic` (Feuer-Schwäche statt Magie) | „waffenunabhängig“ |
| 6 | Lebensraub der Signatur | **Zusätzlich** zum Lebensraub der Klasse (Ausweiden 50 % + 8 %, Entfesseln 20 % + 8 %) | einfach |
| 7 | Hexer-Verderbnis | Wirkt beim **Legen jedes eigenen DoTs** (`layDot` mit `warlock`), auch Item-Effekte und Vergiftete Waffen; Wandelbare Flüche ebenda | „eigenes Gift“ (Abgleich #22) |
| 8 | Seelenernte | Erntet nur **eigene** DoTs (Koop: `sourceId` oder Stapel in `stacksBy`); Fluch im Koop als Verwundbar 10 %, 2 Runden, höherer Wert zählt | kein Ernten fremder DoTs |
| 9 | Markierung | `vulnerable` mit „höherer Wert zählt“ plus Feld `marked` für den Krit-Auslöser; 3 volle Runden nach dem Schuss | der Schuss selbst profitiert nicht (Rechnung 4.3) |
| 10 | Duellhaltung | 2 Gegnerzüge (Signatur-Runde und nächste), wie eine nicht verbrauchte Parade (×0,7, Konter 0,6 D), **nur gegen den Boss**; im Koop nur gegen Einzelangriffe, Spott 0,75 in beiden Runden | wie Parade |
| 11 | Kampfbanner | 3 Runden **ab der Runde danach**; Koop: Mitspieler +10 %, eigenes +15 %, mehrere Banner → höherer Wert | Rechnung 4.3 |
| 12 | Richtspruch: was ist „abgewehrt“? | Minderung durch Abwehren/Schildwall, Parade/Vergeltung (verhindert), Bollwerk-Block als **Schätzung ohne Zufall** (Angriff × Rüstungsfaktor); nicht der Schild-Topf. Zusatz als Faktor auf den Treffer | kein zusätzlicher Würfelwurf |
| 13 | Gruppenschild | Nur **Mitspieler**, nicht der Paladin selbst; gemeinsamer Topf `ward`, höchstens 15 % | „alle Mitspieler“ |
| 14 | Gebet im Koop | Sich 8 %, Mitspieler 15 %, reinigt alle, belebt den ersten Gefallenen ohne Wiederbelebung (25 %) | Konzept |
| 15 | Bergbrecher | Trifft alle; sichere Betäubung nur fürs Ziel; Immunität → Schwächung 30 %, 2 Runden; zählt für Kryomant als Einfrieren (ohne Einfrier-Anzeige) | Abgleich #12 |
| 16 | Heilung erzeugt Bedrohung | 50 % von Heilfähigkeiten, Gebet und Gruppenschild (ohne Paladin-Faktor); **nicht** Tränke, Regeneration, Lebensraub, Heilung über Zeit | nur aktive Heilung zieht Angriffe |
| 17 | Raserei | Faktor auf Angriffe, Fähigkeiten und Gift des Bosses (`abilityDots`, Elite „Giftig“), nicht auf Explosion, Fluch, Begleiter, Hydra-Köpfe. Ereignis `enrage` jede Runde ab 17 (`roundsLeft`) bzw. ab 20 (Faktor) | Konzept 4.5 |
| 18 | Paladin mit Schwert | Zusätzlich zur Ausdauer-Skalierung **20 % Lebensraub mit dem Schwert** („Geweihte Klinge“) | Der Schwert-Pool hat keine Heilung; ohne Ausgleich lag die Variante 30 Punkte unter dem Streitkolben-Paladin |
| 19 | Wächter | Passiv ohne LP-Bonus | Die sichere Betäubung trug ihn sonst auf 64–74 % |
| 20 | Quest | Ohne Gebiet, eigener Abschnitt über den Gebieten im Questbuch, `minLevel` 5; Belohnung fest (`dropChance` 0 + `classQuestArmor`), Schild in den Waffen → schwere Rüstung; erfüllt durch jeden Sieg mit Klasse (Gebiet, Dungeon, Turm, Überfall, Koop) | keine Migration nötig |
| 21 | Golden Master | Setzt die Signatur mit 70 % ein, wenn sie bereit ist – gewürfelt nur dann, damit Kämpfe ohne Klasse gleich bleiben | Gegenprobe möglich |
| 22 | Test-KI „gut gespielter Champion“ (`combat.test.ts`) | Setzt die Signatur ein und wirkt keine Fähigkeit ins offene Höhlenauge; Grenze der Verlassenen Mine 60 → 55 | Champion +8 % statt +15 % |
| 23 | Signatur-Knopf | Taste **F**, auf dem Handy über die volle Breite unter Angreifen/Abwehren, ab `sm` als dritter Knopf daneben | Entscheidung „Handy“ |

### 11.4 Offen / Playtest

- Fühlt sich das Gebet mit 8 % Eigenheilung noch nach Heiler an? (Solo bewusst klein, im Koop zählt die Gruppe.)
- Wächter ohne LP-Bonus: zu zerbrechlich in Dungeons?
- Klassenlose 34 Punkte unter dem Mittel – frustriert das frühe Spiel? Wann wird die Quest im Schnitt abgeschlossen?
- Schwert-Paladin: Wird der Lebensraub als „Geweihte Klinge“ verstanden?
- Sumpfhydra zu zweit ist für jede Gruppe schwer (8–47 %) – eigenes Raid-Balancing, nicht Teil von G3.
- Eigene Signatur-Animationen (heute geliehene Fähigkeits-Animationen, `signatureStyles.ts`).
