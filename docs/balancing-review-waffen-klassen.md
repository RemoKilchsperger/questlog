# Balancing-Review: Waffen, Klassen, Fertigkeiten, Skilltree

Stand: 2026-11-11, Code auf `main` (f91112d). Reine Analyse, am Spielcode wurde nichts geändert.

**Nachtrag 2026-11-12:** Umgesetzt in G1 (docs/klassen-skilltree-abgleich.md): Schild 2,2 (Nr. 3, ohne die
+15 % für den Paladin), Kleriker-Gruppenheilung im Koop (Nr. 5), Heiliger Hammer (Nr. 6), Krit-Gesamtobergrenze
60 % (statt Nr. 4; Krit-Faktor 2,0 kommt mit dem Klassen-Kern), Balance-Test für die Klassenspreizung (Nr. 22,
als Leitplanke `src/domain/classBalance.test.ts`) und die Kommentare aus „Kleinigkeiten“. Das Simulations-Skript
liegt jetzt im Repo: `src/test/classSim.ts` und `src/domain/zzClassSim.test.ts`.

Grundlage: Kampfformeln und Daten im Code (`items.ts`, `heroClasses.ts`, `weaponScaling.ts`, `abilities.ts`,
`skills.ts`, `combat.ts`, `combatCore.ts`, `matchups.ts`, `coopCombat.ts`), die bestehenden Pläne
(docs/waffen-faehigkeiten.md, docs/skilltree.md, docs/attribut-skalierung.md, docs/item-effekte.md),
Handrechnungen und eine eigene Simulation (siehe „Methode“).

---

## Kurzfazit (priorisiert)

1. **Drei Klassen fallen deutlich ab: Duellant, Berserker, Paladin.** In der Simulation (alle 6 Gebietsbosse,
   seltene Ausrüstung, Heiltränke, Einhand-Klassen mit zwei Waffen) gewinnen sie 18 %, 23 % und 29 %, die Mitte
   liegt bei 40–48 %, Champion und Wächter bei 55–56 %. Die Ursachen sind einfach: Der Duellant hat schwache
   Schwert-Fähigkeiten und nur einen kleinen Bonus, der Berserker hat ausser über 50 % LP **gar keinen**
   Schadensbonus (er ist ein schlechterer Champion), der Paladin hat den tiefsten Schaden aller Klassen, weil
   der Schild nur 1,5 Basisangriff hat.
2. **Die Assassine ist die stärkste Klasse** (72 % selten, 86 % episch). Ihre +20 % Krit und die
   Skilltree-Krits zählen über der 30-%-Obergrenze, Krits machen 2,25-fachen Schaden, und Stich ist bei
   5 von 10 Bossen eine Schwäche. Mit dem Klinge-Pfad kommt sie bei Level 60 auf 60–75 % Krit-Chance.
3. **Bosskämpfe hängen extrem stark an kleinen Schadensunterschieden:** +10 % Schaden bringen in der Simulation
   15–25 Prozentpunkte mehr Siege. Klassenboni, die sich um 10 % unterscheiden, sind also riesig. Vorschläge
   darum in kleinen Schritten (5–10 %) umsetzen und jeweils neu simulieren.
4. **Gift, Feuer und Bluten sind pro Mana 2–3-mal so effizient wie Direktschaden.** Sie rechnen mit dem vollen
   Heldenschaden, ignorieren Rüstung und hängen nicht am Multiplikator der Fähigkeit (`combat.ts:1017`). Ein
   Giftstrahl des Hexers bringt rund 9 Heldenschaden pro 100 Mana über einem normalen Angriff, ein Richterstoss
   2,7. Dafür ist der Hexer stark vom Gegner abhängig (37 % aller Kreaturen sind gegen Gift immun):
   0 % gegen die Sumpfechse, 100 % gegen Krummzahn.
5. **Die Fähigkeiten sind ein Glücksspiel, besonders beim Magier.** Ohne Fähigkeiten gewinnen Magier und Hexer
   0 %. 20 % aller Stäbe haben weder Feuerball noch Meteor, damit ist der Magier praktisch unspielbar.
   Zweihandwaffen tragen 3 Fähigkeiten (je 50 % Chance pro Fähigkeit), zwei Einhandwaffen bis zu 4 (75 %).
6. **Mehrere Fähigkeiten sind tot oder schaden sogar:** Der Heilige Hammer ist schlechter als gar keine
   Fähigkeit, weil Magie bei 5 von 10 Bossen resistiert wird, Wucht nur bei einem. Ebenfalls zu schwach:
   Zertrümmern, Entwaffnen, Hackwirbel, Vergeltung, Giftklinge und Kettenblitz. Zu stark sind Schattenschritt
   und Konterstellung.
7. **Der Skilltree läuft fast linear.** Für die Meisterschaft braucht man 15 der 16–17 Ränge eines Pfads. Die
   einzigen echten Entscheidungen sind der Pfad und eine Gabelung. Mehrere Knoten bringen kaum etwas
   (Hinrichter, Nachhall, Kräuterkunde), das Klinge-Thema „Mehrfachtreffer“ hat keinen Knoten, die
   Gift-Knoten der Plage nützen nur mit Dolch oder Zepter, Kryomant und Schmelzen nur mit dem Stab.
8. **Im Koop fehlt die Heiler-Rolle.** Tank geht (Paladin, Bollwerk, Schildwall), Unterstützung auch
   (Jägermal, Fluch, Erdbeben). Gruppenheilung gibt es aber nur über eine einzige Stab-Fähigkeit
   (Arkane Heilung), und der Kleriker heilt nur sich selbst.

---

## Methode und Grenzen

**Handrechnung.** Einheit „D“ = Schaden pro Treffer des Helden (`profile.damage`) vor Rüstung. Gegen
Boss-Rüstung (`3 · Level · 1,3`, `creatures.ts:380`) gehen bei jedem Level etwa 26 % verloren
(`armorReduction`, `combatCore.ts:52`). Ein normaler Angriff ist gegen Bosse also etwa 0,74 D wert.

**Simulation** (Skript `sim.ts` im Scratchpad dieser Sitzung, nicht im Repo, mit `npx vite-node` laufen lassen.
Der Aufbau ist hier beschrieben, damit man ihn als `zz*.test.ts` nachbauen kann):

- Alle 11 Klassen mit passender Rüstung (5 Teile) und Waffe. Einhand-Klassen tragen **zwei** Waffen
  (Hexer 2× Zepter, Assassine 2× Dolch, Duellant 2× Schwert, Plünderer 2× Axt, Kleriker 2× Streitkolben,
  Paladin Streitkolben + Schild).
- Level = Boss-Level, Attributpunkte zu 60 % ins Waffen-Attribut und zu 40 % in Ausdauer
  (Kleriker und Paladin alles in Ausdauer). Item-Boni und **Fähigkeiten zufällig gewürfelt** wie im Spiel.
- Heiltränke unter 40 % LP. Begleiter mit Rolle zuerst, wie im Balance-Test. Eine einfache, für alle
  gleiche KI: Sie nimmt die Fähigkeit mit der höchsten groben Bewertung und greift nach Finte und
  Titanenschlag normal an.
- 200 Kämpfe pro Klasse und Boss, ohne Item-Effekte, Wurftränke und Begleiter.

Grenzen: Die KI spielt nicht optimal, Synergien (Fluch → Gift, Axtwurf → Ausbluten, Eisstrahl → Schmelzen)
nutzt sie nur zufällig. Die absoluten Zahlen sind deshalb weniger wichtig als die Reihenfolge der Klassen.
Die Klassentabelle in docs/waffen-faehigkeiten.md („Abstimmung“) gab Einhand-Klassen nur einer Waffe
Fähigkeiten. Dort sind Hexer, Assassine und Plünderer unterschätzt (Plünderer 20 % dort, hier 40 %).

---

## 1. Waffen

### 1.1 Grundwerte

Angriff = `Basis · (1 + (Level − 1) · 0,25) · Streuung · Seltenheit` (`items.ts:114`, `items.ts:151`).
Bonusschaden `0,25` pro Punkt im Waffen-Attribut, Ausdauer nur `0,15` (`weaponScaling.ts:28`).

| Waffe | Basis (`items.ts:81–91`) | Angriff Lv. 40 selten | Attribut | Schadensart | Pool | Bemerkung |
|---|---|---|---|---|---|---|
| Dolch | 3 | ≈ 39 | Charisma | Stich | 2 aus 4 | zu zweit 77 |
| Schwert | 3 | ≈ 39 | Stärke | Klinge | 2 aus 4 | zu zweit 77 |
| Axt | 3 | ≈ 39 | Stärke | Klinge | 2 aus 4 | zu zweit 77 |
| Zepter | 2,8 | ≈ 36 | Intelligenz | Magie | 2 aus 4 | zu zweit 72 |
| Streitkolben | 3,1 | ≈ 40 | Ausdauer (0,15) | Wucht | 2 aus 4 | zu zweit 80 |
| Schild | 1,5 (+3 Rüstung) | ≈ 19 | Ausdauer (0,15) | Wucht | 2 aus 4 | mit Streitkolben 59 |
| Zweihandschwert | 6,5 | ≈ 84 | Stärke | Klinge | 3 aus 6 | |
| Grossaxt | 6,8 | ≈ 88 | Stärke | Klinge | 3 aus 6 | |
| Grosshammer | 7,2 | ≈ 93 | Stärke | Wucht | 3 aus 6 | |
| Stab | 6 | ≈ 77 | Intelligenz | Magie | 3 aus 6 | Fernkampf (Ignaroth) |
| Bogen | 6,4 | ≈ 83 | Charisma | Stich | 3 aus 6 | Fernkampf (Ignaroth) |

**Schadensarten gegen Bosse** (10 Gebiets- und Dungeon-Bosse, `matchups.ts`): Stich 5× Schwäche / 1×
Resistenz, Magie 2× / **5×**, Klinge 2× / 2×, Wucht 1× / 1×. Gift: 23 von 62 Kreaturen immun, Bluten
14 von 62, Feuer 5 von 62 (dafür 11× Schwäche). Dolch und Bogen sind gegen Bosse also klar im Vorteil,
Stab, Zepter und der Heilige Hammer klar im Nachteil.

### 1.2 Zwei Einhandwaffen gegen eine Zweihandwaffe

| | 2 Einhand | 1 Zweihand |
|---|---|---|
| Basisangriff | 5,6–6,2 | 6,0–7,2 |
| Fähigkeiten | bis 4, je **75 %** Chance pro Fähigkeit | 3, je **50 %** |
| Attributboni der Waffen | 2 Items | 1 Item |
| Item-Effekte (legendär) | bis 2 | 1 |
| Schmied-Verbesserungen | 2 Items | 1 Item |

Zweihandwaffen gleichen das heute über etwa 10 % mehr Basisangriff und die starken Klassen (Champion,
Wächter) aus. Ab legendärer Ausrüstung kippt es wahrscheinlich zu den Einhändern: 3 Attributboni à 20 und
ein zweiter Effekt mehr. Das sollte man beobachten (Vorschlag 18), aber nicht sofort ändern.

### 1.3 Seltenheit

Gewöhnlich → selten → episch → legendär: Angriff ×1 / 1,2 / 1,45 / 1,75 (`items.ts:458–463`). In der
Simulation steigt die mittlere Siegquote von selten zu episch von 42 % auf 76 %. Die Seltenheit wirkt also
viel stärker als jede Klassen- oder Skillwahl. Das passt zum Plan, dass Bosse seltene Ausrüstung verlangen.
Es heisst aber auch: Klassenunterschiede fallen vor allem mit seltener Ausrüstung auf, also im
mittleren Spiel.

### 1.4 Identität der Waffen

- **Schwert: die Waffe ohne Identität.** Gleicher Basisangriff, gleiches Attribut und gleiche Schadensart
  wie die Axt, aber der schwächere Pool (siehe 3.2). Alleine (ohne Duellant) gibt es keinen Grund für ein
  Schwert statt einer Axt. Vorschlag: Das Schwert als Waffe für **Tempo und Konter** schärfen (Parade, Finte,
  Duellant-Zweitschlag), siehe Vorschläge 1 und 7.
- **Schild:** Mit 1,5 Angriff zieht er jeden Kampf in die Länge. Als Zweithand für Hexer oder Kleriker ist
  er eine sinnvolle Defensiv-Option, für den Paladin ist er die Hauptursache seiner Schwäche.
- **Streitkolben gegen Grosshammer:** beide Wucht und Betäubung. Sie unterscheiden sich aber über
  Ausdauer bzw. Stärke und Heilung bzw. Kontrolle. Das ist in Ordnung.
- **Zepter gegen Stab:** Zepter ist Schaden über Zeit, Stab ist Wucht und Elemente. Klar getrennt.
- **Dolch gegen Bogen:** beide Charisma und Stich. Der Bogen hat dazu Fernkampf, der Dolch Krit. Gut.
- **Ausdauer-Waffen** (Streitkolben, Schild): Kleriker und Paladin machen etwa halb so viel Schaden pro Runde
  wie die anderen Klassen. Ihre Bosskämpfe dauern 15–23 statt 7–12 Runden. Die Siegquote geht beim Kleriker
  auf, das Spielgefühl ist aber zäh.

---

## 2. Klassen

### 2.1 Kampfwerte im Vergleich

Mittel über 200 Würfe der Item-Boni, Lv. 40, seltene Ausrüstung. „Angriff vs. Boss“ = normaler Angriff mit
erwartetem Krit nach Boss-Rüstung (156, −26 %).

| Klasse | Schaden | Krit | Angriff vs. Boss | LP | Rüstung (Minderung) | eff. LP | Mana |
|---|---|---|---|---|---|---|---|
| Magier | 92 | 11 % | 72 | 620 | 70 (−13 %) | 717 | 203 |
| Hexer | 90 | 12 % | 71 | 625 | 70 (−13 %) | 722 | 205 |
| Assassine | 92 | **41 % ×2,25** | **103** | 625 | 70 (−13 %) | 722 | 158 |
| Waldläufer | 109 | 20 % | 89 | 620 | 105 (−19 %) | 765 | 136 |
| Duellant | 101 | 11 % | 79 (107 mit Zweitschlag) | 625 | 105 (−19 %) | 771 | 138 |
| Plünderer | 110 | 11 % | 86 (+Bluten, +10 % Lebensraub) | 625 | 105 (−19 %) | 771 | 138 |
| Kleriker | 92 | 11 % | 72 (+2 % LP/Runde) | 695 | 105 (−19 %) | 858 | 138 |
| Paladin | **81** | 9 % | **63** | 695 | 224 (−33 %) | **1042** | 138 |
| Berserker | 101 | 8 % | 78 (101 unter 50 % LP) | 620 | 142 (−24 %) | 816 | 136 |
| Champion | 113 | 8 % | 88 | 682 | 142 (−24 %) | 898 | 136 |
| Wächter | 105 | 8 % | 82 | 713 | 156 (−26 %) | 960 | 136 |

Bei Lv. 60 mit epischer Ausrüstung bleibt das Bild gleich. Assassine: Angriff vs. Boss 191, Champion 156,
Paladin 112 (eff. LP Paladin 1692, Magier 1110).

### 2.2 Siegquoten (Simulation, Gebietsbosse)

| Klasse | Ø selten | Krummzahn 10 | Sumpfechse 20 | Höhlenauge 30 | Urmammut 40 | Lichkönig 50 | Ignaroth 60 | Ø episch |
|---|---|---|---|---|---|---|---|---|
| Assassine | **72** | 83 | 44 | 42 | 80 | 92 | 88 | 86 |
| Wächter | 56 | 90 | 27 | 48 | 32 | 100 | 41 | 90 |
| Champion | 55 | 89 | 28 | 35 | 73 | 89 | 17 | **93** |
| Waldläufer | 48 | 2 | 16 | 53 | 88 | 41 | 90 | 85 |
| Kleriker | 44 | 84 | 51 | 13 | 32 | 80 | 5 | 78 |
| Magier | 42 | 96 | 9 | 28 | 55 | 11 | 55 | 76 |
| Hexer | 42 | 100 | **0** | 20 | 40 | 28 | 63 | 73 |
| Plünderer | 40 | 95 | 11 | 21 | 82 | 30 | 2 | 84 |
| Paladin | **29** | 47 | 18 | 3 | 14 | 88 | 3 | 79 |
| Berserker | **23** | 72 | 4 | 8 | 27 | 26 | 3 | 72 |
| Duellant | **18** | 45 | 16 | 7 | 25 | 15 | 1 | **66** |

Starke Schwankungen pro Boss sind gewollt (Schwächen, Fernkampf gegen Ignaroth, Fähigkeiten gegen das
Höhlenauge). Das Mittel zeigt trotzdem drei Gruppen: **Assassine** vorne, dann **Champion und Wächter**,
die Mitte bei 40–48 %, und **Paladin, Berserker, Duellant** abgeschlagen.

**Empfindlichkeit** (Schaden bzw. LP des fertigen Profils nachträglich skaliert, selten):

| Änderung | vorher | nachher |
|---|---|---|
| Duellant Schaden ×1,14 | 19 | 42 |
| Duellant Schaden ×1,25 | 19 | 57 |
| Berserker Schaden ×1,10 | 23 | 36 |
| Berserker Schaden ×1,10, LP ×1,05 | 23 | 45 |
| Paladin Schaden ×1,165 | 27 | 51 |
| Paladin Schaden ×1,25 | 27 | 66 |
| Assassine Schaden ×0,95 | 70 | 64 |
| Kleriker Schaden ×1,10 | 45 | 59 |
| Magier Schaden ×1,10 | 45 | 56 |

### 2.3 Die Klassen einzeln

**Assassine (dominant).** `classStatBonus` gibt +20 % Krit und ×2,25 (`heroClasses.ts:91`). Die
Krit-Obergrenze von 30 % gilt nur für Grundwert, Charisma und Rüstung. Klasse, Skilltree und Item-Effekte
kommen darüber (`combat.ts:221`, `combatCore.ts` `strikeFactors`). Rechnung Lv. 40: 41 % Krit →
Erwartungswert ×1,51 auf jeden Treffer. Mit Klinge (Scharfe Klingen +9 %, Blutgeruch +15 % gegen Blutende,
Durchschlag) kommt sie auf 50–65 % Krit, und die Krits ignorieren die Rüstung: Ein normaler Angriff steigt
von 103 auf etwa 137, der Hinterhältige Stoss auf 92 · 1,4 · 2,25 = **290**, das sind 3,9 normale Angriffe
eines Champions. Dazu kommt Schattenschritt (blockt einen Angriff, nächster Treffer sicher kritisch) für
25 Mana. Spielgefühl: knackig, aber zerbrechlich (eff. LP am tiefsten). Im Koop zieht ihr Schaden die
Bedrohung auf sie (`coopCombat.ts:1062`).

**Champion (Referenz, stark).** +15 % Schaden und +10 % LP gelten immer. Der Klassenbonus ist
reine Statistik ohne Mechanik. Stark, aber die langweiligste Klasse. Die Konterstellung (siehe 3.2) ist sein
bester Knopf.

**Wächter (stark).** +15 % LP, +10 % Rüstung, Schwächungen 1 Runde länger. Erdbeben, Schockwelle und
Titanenschlag tragen ihn. Gute Identität (Kontrolle). Im Koop wertvoll, weil Erdbeben alle Gegner schwächt.

**Waldläufer (Mitte, oben).** +12 % Schaden, 5 Pfeile, Fernkampf. Er hängt stark am Boss: 2 % gegen
Krummzahn (Goblins widerstehen Stich), 90 % gegen Ignaroth. Durchbohrender Schuss ist ein sehr guter Knopf.

**Magier (Mitte).** Er steht und fällt mit Feuerball und Meteor (Einzelfähigkeit: Feuerball 42 %, Meteor
55 %, Eisstrahl 10 %, Kettenblitz 4 %, keine 0 %). 20 % der Stäbe haben keine der beiden. Magie wird von
5 von 10 Bossen resistiert.

**Hexer (Mitte, extrem schwankend).** Rechnung Lv. 40, Schaden 90: Giftstrahl macht 0,6 · 90 = 54 sofort
plus Gift `0,4 · 1,5 = 0,6` · 90 = 54 pro Runde über **4** Runden (Hexer +1 Runde), zusammen 270 für
25 Mana. Seelenfeuer macht 63 + 216 = 279 für 30 Mana. Gift und Feuer laufen nebeneinander, das gibt dauerhaft
rund 108 Schaden pro Runde ohne Rüstung, dazu der normale Angriff. Gegen immune Gegner (Sumpfechse:
Gift, Lichkönig: Gift, Drachenhort: Feuer) bleibt nur ein schwacher Treffer. Das ist thematisch
schlüssig, aber 0 % gegen die Sumpfechse ist hart. Vorschlag: nichts ändern, Lebensentzug ist der Ausweg.
Beobachten, ob Spieler dort feststecken.

**Plünderer (Mitte).** Er hat das grösste Bonuspaket: +20 % Schaden, 10 % Lebensraub, Bluten bei Krit,
+25 % Gold. Mit zwei Äxten liegt er im Mittelfeld. Schwach gegen Ignaroth (Klinge resistiert, Nahkampf
in der Luft halbiert). Achtung Wechselwirkung: Der Skill **Schnitter wirkt beim Plünderer nie**. Sein eigenes
Bluten (25 %) ist stärker als das des Schnitters (15 %), und der Schnitter legt nur, wenn kein stärkeres
Bluten liegt (`combatCore.ts:553–562`).

**Kleriker (Mitte, zäh).** 2 % LP pro Runde und Tränke +15 %. Wenig Schaden, lange Kämpfe. Klasse für
Geduldige. Im Koop heilt er **nur sich selbst**: Heiliges Licht und Läuterung haben kein `groupHeal`
(`abilities.ts:359`, Gruppenheilung nur bei Arkane Heilung, `abilities.ts:796`).

**Paladin (fällt ab).** Er hat den tiefsten Schaden: Streitkolben + Schild = 59 Angriff gegen 84–93 bei
Zweihändern. Die +10 % Schaden gleichen das nicht aus. Bollwerk und Vergeltung machen selbst keinen Schaden
(Schildstoss nur 0,5). Die Kämpfe dauern 17–23 Runden. Er überlebt alles (eff. LP 1042), schafft den Schaden
aber nicht vor dem Enrage der Mechaniken. Im Koop ist er der beste Tank (Bedrohung ×2, `heroClasses.ts:147`),
solo der schwächste Held mit Heavy-Rüstung.

**Berserker (fällt ab).** Ein Bonus nur unter 50 % LP (`heroClasses.ts:58`, `141–142`). Die meiste Zeit
ist er ein Champion ohne +15 % Schaden und ohne +10 % LP. Seine Raserei liegt im selben Bereich, in dem die KI
(und viele Spieler) schon Tränke trinken. Der Bonus ist zu selten aktiv, um das auszugleichen.

**Duellant (fällt ab, schwächste Klasse).** +10 % Schaden und 35 % Zweitschlag nur bei normalen Angriffen
(`heroClasses.ts:54`, `132`). Erwartet etwa +35 % auf normale Angriffe, gleichzeitig der schwächste Pool
(Schwert), mittlere Rüstung, keine Heilung. Klingen sind gegen Ignaroth resistiert. Er kommt nie über die
Mitte hinaus, auch nicht episch (66 %, alle anderen ≥ 72 %).

### 2.4 Koop

- **Tank:** Paladin (Bedrohung ×2), Bollwerk und Schildwall ziehen 75 % der Angriffe (`coopCombat.ts:177`).
  Funktioniert.
- **Unterstützung:** Jägermal und Fluch (Verwundbar gilt für alle), Erdbeben, Entwaffnen und Fluch
  (Schwächung schützt alle), Klingensturm (+10 % für alle). Funktioniert, hängt aber am Würfelglück.
- **Heiler:** nur Arkane Heilung (Stab, 50 %-Chance auf der Waffe). Die Klasse mit „Heil“-Thema, der Kleriker,
  kann im Koop niemanden heilen. **Grösste Lücke im Koop.**
- **Betäubung:** Die Immunität von 3 Runden gilt im Koop für alle Gegner (`abilities.ts:140`). Zwei Betäuber
  in einer Gruppe nehmen sich gegenseitig den Wert weg. Gewollt, sollte aber in der Hilfe stehen.
- **Bedrohung:** Assassine und Hexer haben die tiefsten eff. LP und den höchsten Schaden, sie werden darum am
  meisten angegriffen. Gut, solange ein Tank in der Gruppe ist. Ohne Tank sterben sie zuerst.

---

## 3. Fertigkeiten (Waffen-Fähigkeiten)

### 3.1 Wirtschaft: Mana gegen Abklingzeit

- Mana: `40 + 2 · (Level − 1) + Intelligenz` (`abilities.ts:151`), leichte Rüstung +4 pro Teil, Regeneration
  6 pro Runde (`abilities.ts:133`).
- Abklingzeit n heisst: wieder einsetzbar in Runde n+1 (`tickCooldowns`). Abklingzeit 2 = jede 3. Runde.
- Bosskämpfe dauern 7–12 Runden. Ein Krieger hat Lv. 40 rund 136 + 60 = 196 Mana im Kampf, das sind 5–6
  Fähigkeiten. Ein Magier hat 203 + 60 bei 80 % Kosten, also 8 und damit fast jede Runde eine.
- Folge: Bei Kriegern begrenzt das **Mana**, nicht die Abklingzeit. Darum sind Abklingzeit-Effekte
  (Nachhall, Item-Effekt „Flinke Hand“) schwach, Mana-Effekte (Tiefer Brunnen, Adrenalin, Unterbrecher,
  Manadieb) stark. Intelligenz ist für Krieger fast wertlos (+1 Mana pro Punkt).

### 3.2 Bewertung pro Pool

„Mehrwert“ = Schaden der Fähigkeit minus normaler Angriff (0,74 D), gegen Boss-Rüstung, ohne Klasse.
Gift, Feuer und Bluten mit allen Runden gerechnet. „Einzeln“ = Siegquote in der Simulation, wenn die Waffe
**nur** diese Fähigkeit trägt (episch, Bosse Lv. 20–60), daneben die Quote ganz ohne Fähigkeit. Synergien
erscheinen in der Spalte nicht.

| Waffe | Fähigkeit | Mana/AZ | Mehrwert (D) | pro 10 Mana | Einzeln (ohne) | Urteil |
|---|---|---|---|---|---|---|
| Dolch | Hinterhältiger Stoss | 20/2 | 0,81 (Assassine 1,59) | 0,41 | 76 (44) | gut |
| | Meucheln | 30/2 | 0 / +1,48 unter 30 % | – | 60 | gut als Finisher |
| | Giftklinge | 25/2 | 0,90 | 0,36 | **46** (44) | schwach: ein schwächerer Giftstrahl ohne Rüstung-Ignorieren |
| | Schattenschritt | 25/3 | −0,15 + Block + Krit | – | **90** | zu stark |
| Schwert | Schwertwirbel | 25/2 | 0,93 | 0,37 | 45 (34) | knapp |
| | Parade | 25/2 | −0,30 + Konter 1,0 | – | 59 | ok |
| | Finte | 20/2 | −0,15 + 1 Angriff | – | 46 | ok für Duellant |
| | Entwaffnen | 25/3 | 0 + Schwächung | – | **31** (34) | tot |
| Axt | Axtwurf | 25/2 | **1,16** | **0,46** | 59 (15) | sehr gut |
| | Zerfleischen | 30/2 | 0,90 | 0,30 | 48 | gut |
| | Hackwirbel | 30/2 | −0,07 (einzeln) | – | **15** (15) | tot gegen Bosse |
| | Ausbluten | 30/2 | 0,30 / 0,92 gegen Blutende | 0,10 | 27 | schwach ohne Partner |
| Streitkolben | Betäubender Schlag | 30/3 | 0,15 + Betäubung | – | 62 (29) | sehr gut |
| | Heiliges Licht | 35/4 | Heilung 25 % | – | 38 | ok |
| | Läuterung | 25/3 | Heilung 15 % + Reinigen | – | 33 | knapp |
| | Heiliger Hammer | 30/2 | 0,30, als **Magie** | 0,10 | **18** (29) | **schädlich** |
| Zepter | Giftstrahl | 25/2 | 1,06 (Hexer **2,26**) | 0,42 (**0,90**) | 40 (0) | sehr gut |
| | Fluch der Schwäche | 30/4 | Schwächung + Verwundbar | – | 0 einzeln | Synergie-Knopf, ok |
| | Seelenfeuer | 30/2 | 1,16 (Hexer 2,36) | 0,39 (0,79) | 32 | sehr gut |
| | Lebensentzug | 35/3 | 0,76 + Heilung | 0,22 | 24 | ok, Ausweg gegen Immune |
| Schild | Bollwerk | 20/3 | Block | – | 41 (13) | gut |
| | Vergeltung | 25/3 | Rückwurf, kein Treffer | – | **13** (13) | tot |
| | Schildstoss | 25/3 | 0 + 60 % Betäubung | – | 26 | ok |
| | Schildwall | 30/4 | −50 % Schaden, 3 Runden | – | 37 | gut |
| Zweihandschwert | Richterstoss | 35/2 | 0,96 | 0,27 | 61 (21) | gut |
| | Kriegsschrei | 30/4 | +25 % für 3 Runden | – | 46 | ok |
| | Klingensturm | 40/4 | 0,30 + Verwundbar, alle | 0,07 | 74 | gut gegen Bosse mit Begleitern |
| | Kreuzhieb | 35/2 | 0,74 | 0,21 | 57 | ok |
| | Konterstellung | 30/3 | 0 + Konter 1,5 + −40 % | – | **88** | zu stark |
| | Mordschlag | 30/3 | 0,15 + 30 % Betäubung | – | 46 | ok |
| Grossaxt | Spalter | 30/3 | 1,05 | 0,35 | 53 (8) | gut |
| | Blutrausch | 35/3 | 0,44 + 40 % Lebensraub | 0,13 | 61 | gut |
| | Enthaupten | 35/3 | 0,22 / 1,66 unter 30 % | – | 33 | schwach |
| | Wirbelwind | 40/3 | 0,30 (einzeln) | 0,07 | 48 | ok mit Begleitern |
| | Wutschrei | 25/4 | +40 % für 3 Runden, +20 % erlitten | – | **20** | schwach |
| | Raserei | 35/3 | 0,59 (4 Hiebe: 1,04) | 0,17 | 58 | gut |
| Grosshammer | Wuchtiger Schlag | 40/2 | 0,89 | 0,22 | 69 (37) | gut |
| | Erdbeben | 40/3 | 0,26 + Schwächung, alle | – | 72 | sehr gut |
| | Schockwelle | 40/3 | 0,37 + 30 % Betäubung, alle | – | 67 | gut |
| | Zertrümmern | 35/3 | 0,15 + −25 % Rüstung | 0,04 | **35** (37) | tot |
| | Unerschütterlich | 30/4 | Heilung 15 %, Abwehr | – | 47 | ok |
| | Titanenschlag | 45/4 | 1,11 über 2 Runden | 0,25 | 75 | gut |
| Stab | Feuerball | 40/2 | **1,76** | 0,44 | 42 (0) | Pflicht |
| | Meteor | 60/4 | **2,46** | 0,41 | 55 | Pflicht |
| | Eisstrahl | 40/3 | 0,76 + 40 % Einfrieren | 0,19 | **10** | schwach |
| | Kettenblitz | 40/3 | 0,56 (einzeln) | 0,14 | **4** | schwach |
| | Arkane Heilung | 40/4 | Heilung 35 % | – | 0 | Koop-Knopf |
| | Arkaner Schild | 20/3 | −60 %, +15 Mana | – | 0 | Hilfsknopf, ok |
| Bogen | Pfeilhagel | 35/2 | 0,59 (Waldläufer 0,93) | 0,17 | 62 (38) | ok |
| | Durchbohrender Schuss | 35/2 | **1,26** | 0,36 | **80** | sehr gut |
| | Ausweichschuss | 30/3 | 0,15 + −60 % | – | 67 | gut |
| | Jägermal | 25/3 | Verwundbar 20 % | – | 49 | Koop-Knopf |
| | Brandpfeil | 30/2 | 0,97 | 0,32 | 59 | gut |
| | Kopfschuss | 40/4 | 0,92 | 0,23 | 75 | ok, steht im Schatten des Durchbohrenden |

### 3.3 Befunde

- **Heiliger Hammer ist eine Falle.** Der Wechsel auf Magie (`abilities.ts:596`) schadet gegen genau die
  Bosse, gegen die man einen Streitkolben trägt: Der Lichkönig hat Wucht als Schwäche und widersteht Magie,
  also 1,4 · 0,8 = 1,12 statt eines normalen Angriffs mit 1,3. Höhlenauge, Hohepriesterin, Sturmfürst und
  Leerenfürst widerstehen ebenfalls Magie.
- **Zertrümmern:** −25 % Boss-Rüstung senkt die Minderung von 26 % auf 21 %. Das sind +7 % auf spätere
  Treffer, und nur auf solche, die die Rüstung nicht ohnehin ignorieren. Zu wenig für 35 Mana.
- **Vergeltung** trifft selbst nicht. Seit Schildwall auch zuschlägt, ist sie die einzige reine
  „Statt anzugreifen“-Fähigkeit ohne Heilung. Gegen Bosse mit Fähigkeitsrunden wirft sie 50 % zurück, sonst
  wenig.
- **Hackwirbel und Wirbelwind** sind reine Flächen-Fähigkeiten. Gegen einzelne Bosse sind sie schwächer als
  ein normaler Angriff. Der Wirbelwind hat in der Grossaxt fünf Partner, der Hackwirbel nimmt einen von nur
  vier Plätzen der Axt.
- **Schattenschritt** vereint Bollwerk (blockt alles) und einen sicheren Krit für 25 Mana. Mit
  ×2,25 bei der Assassine ist das der stärkste Knopf im Spiel.
- **Konterstellung:** −40 % Schaden und ein Konter mit 1,5 für 30 Mana. Das ist ein besseres Bollwerk mit
  Schaden.
- **Stab-Lotterie:** Feuerball und Meteor tragen den Magier. Eisstrahl und Kettenblitz tun das nicht, Heilung
  und Schild sind Hilfsknöpfe. Mit 3 aus 6 hat jeder fünfte Stab keinen Hauptschaden.
- **Pflichtknöpfe ohne Konkurrenz:** Betäubender Schlag (Streitkolben), Axtwurf (Axt), Durchbohrender
  Schuss (Bogen). Gut, solange Abwechslung über die anderen Plätze kommt.

---

## 4. Skilltree

### 4.1 Struktur

- 30 Punkte bei Lv. 60 (`skills.ts:264`), Stufen bei 0/3/6/9 Punkten, Meisterschaft bei 15
  (`skills.ts:104`).
- Ränge bis zur Meisterschaft (ohne die nicht gewählte Gabel): Klinge 17, Wehr 16, Arkan 16, Plage 16.
  **Für die Meisterschaft muss man also 15 von 16–17 Rängen nehmen.** Frei ist nur, welche 1–2 Ränge man
  weglässt. Der zweite Pfad bekommt 13–14 Punkte und reicht bis Stufe 4.
- Echte Entscheidungen: der Hauptpfad (4 Möglichkeiten), eine Gabelung pro Pfad und der Zweitpfad. Innerhalb
  eines Pfads gibt es kaum Entscheidungen. Das ist der Hauptpunkt für die neuen Ideen (Abschnitt 5).

### 4.2 Simulation der Pfade

Siegquote (selten, alle Gebietsbosse) mit **einem** Pfad von oben nach unten (bis 18 Punkte, Rest
ungenutzt), A/B = Gabelung.

| Klasse | ohne | Klinge A/B | Wehr A/B | Arkan A/B | Plage A/B | bester Pfad |
|---|---|---|---|---|---|---|
| Magier | 45 | 54 / 51 | 60 / 58 | **64** / 58 | 63 / 61 | Arkan A (Pyromant) |
| Hexer | 40 | 51 / 50 | 53 / 50 | 57 / 57 | **71 / 71** | Plage |
| Assassine | 68 | 78 / 79 | 78 / 77 | 70 / 70 | **83** / 82 | Plage, knapp Klinge |
| Waldläufer | 47 | 57 / 60 | 61 / 61 | 57 / 59 | 62 / **63** | alle ähnlich |
| Duellant | 20 | 35 / 34 | 24 / 26 | 21 / 21 | **43** / 44 | Plage |
| Plünderer | 43 | 70 / **75** | 48 / 49 | 51 / 51 | 54 / 57 | Klinge B (Durchschlag) |
| Kleriker | 45 | 69 / 63 | **76** / 73 | 62 / 62 | 70 / 72 | Wehr |
| Paladin | 27 | 59 / 49 | **66** / 63 | 50 / 50 | 49 / 52 | Wehr |
| Berserker | 23 | 45 / **49** | 36 / 34 | 34 / 34 | 44 / 42 | Klinge |
| Champion | 53 | **77** / 72 | 73 / 69 | 68 / 68 | 73 / 76 | Klinge |
| Wächter | 57 | 74 / 74 | 78 / 77 | 71 / 71 | 81 / **83** | Plage |

Befunde:

- Jeder Pfad bringt +5 bis +30 Punkte. Kein Pfad ist für alle tot. **Plage ist für 5 von 11 Klassen der
  beste Pfad**, für fast alle unter den besten zwei. Überleben gewinnt Bosskämpfe. Plage nicht weiter
  verstärken.
- **Arkan ist nur für den Magier erste Wahl**, für alle anderen der schwächste oder zweitschwächste Pfad
  (Kryomant und Schmelzen brauchen Einfrieren und Feuer).
- **Die Gabelungen sind ausgeglichen** (A/B meist ±3). Gut für die Balance, aber Blutsauger (2 % Lebensraub)
  und Schemen (3 % Ausweichen) sind beide blass, die Wahl fühlt sich egal an.

### 4.3 Knoten einzeln

| Knoten | Wert | Urteil |
|---|---|---|
| Scharfe Klingen (3) | +3 % Krit/Rang über der Obergrenze | stark für Assassine (×2,25), sonst ok |
| Gezahnte Klingen (3) | Bluten +20 %/Rang | ok mit Axt/Grossaxt/Plünderer |
| Adrenalin (3) | +2 Mana/Krit/Rang | stark für Assassine (≈ +3 Mana/Runde), sonst schwach |
| Blutgeruch (3) | +5 % Krit/Rang gegen Blutende | Pflicht im Klinge-Pfad, mit Schnitter auch für alle |
| Schnitter / Durchschlag | Krit-Bluten 15 % / Krits ohne Rüstung | gute Gabel. Schnitter für den Plünderer wirkungslos (2.3) |
| Offene Wunde (1) | Bluten +1 Runde bei Krit | ok |
| **Hinrichter (3)** | +6 %/Rang unter 30 % LP | **schwach**: +18 % auf das letzte Drittel ≈ +5 % im Kampf für 3 Punkte |
| Blutsturz (★) | Ausblutendes Bluten: 3 Runden auf einmal | gut |
| Eiserne Haut (3) | +3 % Rüstung/Rang | schwach: +9 % Rüstung ≈ −2 % erlittener Schaden |
| Gefasst (2) | Abwehren +5 Mana/Rang | ok |
| Erschütterung (3) | +8 %/Rang nach Betäubung | nur mit Betäubung, durch die Immunität höchstens jede 4. Runde |
| Gegenschlag (3) | +15 %/Rang nach Abwehren | gut |
| Fels / Stachelwehr | Abwehren 25 % / 50 % Dornen | gute Gabel |
| Wuchtschlag (3) | +6 %/Rang Chance auf Betäubung | eng: nur Schockwelle, Mordschlag, Schildstoss, Eisstrahl |
| Unterbrecher (1) | +15 Mana | gut |
| Zorn des Bollwerks (★) | +8 %/Stapel, max. 5, verfällt nie | stark für Paladin, sonst Abwehren erzwingen |
| Tiefer Brunnen (3) | +5 Mana/Rang | gut für Krieger |
| Funkenflug (3) | Feuer +15 %/Rang | gut mit Stab/Zepter/Brandpfeil |
| Manafluss (3) | +1 Mana/Runde/Rang | gut |
| **Eröffnung (2)** | Runde 1: −25 %/Rang Kosten | **schwach**: spart einmal 10–20 Mana |
| Pyromant / Kryomant | Feuer länger / Einfrieren | **Kryomant nur mit Stab (Eisstrahl)** oder Frostbiss/Frostbombe |
| **Schmelzen (1)** | Feuer gegen Eingefrorene ×1,6 | nur Stab (Eisstrahl + Feuerball/Meteor) |
| **Nachhall (3)** | 5 %/Rang keine Abklingzeit | **schwach**: die Abklingzeit begrenzt selten (3.1) |
| Echo (★) | jede 3. Fähigkeit gratis +30 % | gut, für alle nützlich |
| Zähigkeit (3) | +2 % LP/Rang | ok |
| Giftmischer (3) | Gift +20 %/Rang | nur Dolch/Zepter |
| **Kräuterkunde (2)** | Heiltränke +5 %/Rang | **schwach** |
| Gegengift (2) | DoTs am Helden −10 %/Rang | ok |
| Schleichendes Gift (1) | Gift stapelt 3× | nur Dolch/Zepter, aber stark |
| Blutsauger / Schemen | 2 % Lebensraub / 3 % Ausweichen | ausgeglichen, beide blass |
| Notverband (3) | einmal 4 %/Rang unter 30 % | ok |
| Seuche (1) | Gift springt über | nur bei Begleitern/Rudeln und mit Gift |
| Fäulnis (★) | 3 Stapel platzen | stark mit Zepter |

**Pflichtknoten:** Wegen der Schwelle von 15 Punkten ist im gewählten Pfad praktisch alles Pflicht. Ausserhalb
davon sind Tiefer Brunnen und Manafluss (Arkan Stufe 1–2) die stärksten Punkte für den Zweitpfad aller
Krieger, Zähigkeit und Gegengift (Plage) für alle anderen.

**Themenlücken:**

- Klinge verspricht „Mehrfachtreffer“ (`skills.ts:97`), kein Knoten tut etwas dafür.
- Plage hat für Bluten nichts Vergleichbares wie den Schnitter: Gift bekommt nur, wer Dolch oder Zepter
  trägt. 4 Knoten mit 6 Rängen plus Meisterschaft sind für die anderen 9 Waffentypen tot.
- Arkan ist ein Stab-Pfad: Kryomant, Schmelzen und Eröffnung zielen auf den Magier.

---

## 5. Neue Skilltree-Ideen

Ziel: Innerhalb der Pfade echte Entscheidungen schaffen, ohne die Stärke der vollen Pfade weiter anzuheben.
Mittel: Pro Pfad ein zusätzlicher Knoten auf Stufe 2 (Spalte 1, wo frei) und eine **zweite Meisterschaft zur
Wahl**. Dann haben die Pfade 18–20 Ränge vor der Meisterschaft, die Schwelle bleibt bei 15, und man lässt
3–5 Ränge bewusst weg.

Allgemein für alle neuen Knoten:

- Werte in `SKILL` (`skills.ts:107`), Wirkung in `combatCore.ts`, damit Solo und Koop sie gleich nutzen.
  Danach `npm run functions:build`.
- Neue Ids brauchen keine Migration: `sanitizeSkills` lässt unbekannte weg, bekannte bleiben.
- Die zweite Meisterschaft ist ein `tier: 5`-Knoten mit `fork: "<pfad>-master"`. Die Regel „nur eine
  Meisterschaft im ganzen Baum“ (`skills.ts:309`) bleibt.
- Neue Ereignisse (z. B. `shielded` für Lebensband) als eigene `BattleEvent`-Typen.

### 5.1 Klinge

**Wirbelnde Klingen** – Stufe 2, Spalte 1, 2 Ränge, braucht Scharfe oder Gezahnte Klingen.
Fähigkeiten mit mehreren Treffern (`hits ≥ 2`: Schwertwirbel, Zerfleischen, Kreuzhieb, Klingensturm,
Wirbelwind, Raserei, Pfeilhagel) machen **+8 % Schaden pro Rang**.
Begründung: Das füllt das Thema „Mehrfachtreffer“ und hilft gerade den schwachen Pools (Schwert, Grossaxt).
Schwertwirbel: 1,67 → 1,94 D. Jeder Treffer würfelt den Krit einzeln, das passt zu Scharfe Klingen.
Koop: wirkt pro Held, nichts Besonderes.

**Meisterschaft B: Tausend Schnitte** (★, Alternative zu Blutsturz).
Jeder Treffer einer Mehrfachtreffer-Fähigkeit legt einen Blutungs-Stapel: **8 % des Heldenschadens pro Runde
und Stapel, höchstens 5 Stapel, 2 Runden**, jeder neue Treffer frischt die Dauer auf.
Rechnung: Schwertwirbel 3 Treffer → 24 % pro Runde, nach zwei Einsätzen 40 % (Maximum). Das liegt unter
Blutsturz mit Axt (Bluten 0,25 · 3 Runden auf einmal), dafür mit jeder Mehrfach-Waffe.
Wechselwirkung: Ein Stapel-Bluten ist ein eigenes `bleed` mit `stacks` wie das Gift (`stackPoison`), so
wird es nicht vom stärkeren Plünderer-Bluten überschrieben. Bei Bluten-Immunität wirkungslos.
Playtest: Duellant und Waldläufer (Pfeilhagel) sollten davon spürbar profitieren, Axt-Builds bleiben bei
Blutsturz.

**Hinrichter** aufwerten statt ersetzen: 6 % → 10 % pro Rang (Vorschlag 14).

### 5.2 Wehr

**Schildmeister** – Stufe 2, Spalte 1, 2 Ränge, braucht Eiserne Haut oder Gefasst.
Bollwerk, Vergeltung, Schildwall, Parade, Konterstellung, Ausweichschuss und Arkaner Schild kosten
**−5 Mana pro Rang**, mit angelegtem Schild **+5 % Rüstung pro Rang**.
Begründung: Der Pfad heisst „Abwehren, Konter“, aber kein Knoten macht Abwehr-Fähigkeiten günstiger. Das
hilft Paladin und Duellant (Parade) und gibt Zorn des Bollwerks mehr Stapel.

**Meisterschaft B: Wächterschwur** (★, Alternative zu Zorn des Bollwerks).
Abwehren heilt dich um **4 % deiner LP**. Im Koop zieht Abwehren die Angriffe auf dich wie Bollwerk
(`BULWARK_SHARE` 0,75, `coopCombat.ts:1549`).
Begründung: Eine Tank-Meisterschaft, die nicht am Paladin hängt. Jeder Held kann im Koop den Tank
übernehmen. Solo ist sie bescheiden (bei jeder 3. Runde Abwehren ≈ +1,3 % LP pro Runde, weniger als der
Kleriker).
Exploit-Prüfung: Abwehren gibt Mana und jetzt LP. Endloses Abwehren gewinnt keinen Kampf (kein Schaden),
die Boss-Mechaniken (Aufladen, Ritual) bestrafen es. Unbedenklich.

### 5.3 Arkan

**Konzentration** – Stufe 2, Spalte 1, 3 Ränge, braucht Tiefer Brunnen oder Funkenflug.
In einer Runde **ohne Fähigkeit** (normaler Angriff oder Abwehren): **+2 Mana pro Rang** zusätzlich zur
Regeneration.
Begründung: Mana ist der Engpass (3.1). Der Knoten belohnt den Wechsel von Angriff und Fähigkeit statt
Dauerfeuer und hilft Kriegern mehr als Magiern (die fast jede Runde zaubern). Bei 3 Rängen verdoppelt er
die Regeneration in Angriffsrunden (6 → 12).

**Nachhall umbauen** (gleiche Id, gleiche Ränge): statt „5 % keine Abklingzeit“ **„8 % pro Rang: Die
Fähigkeit kostet kein Mana“**. Kein Migrationsschritt nötig, nur Text und Wirkung ändern sich.

**Kryomant öffnen:** zusätzlich „Deine Betäubungen zählen als Einfrieren“. Dann gehen Streitkolben-,
Schild- und Grosshammer-Betäubungen in Schmelzen und Kryomant ein. Es entstehen Mischbuilds wie Hexer mit
Zepter + Streitkolben (Seelenfeuer + Betäubender Schlag → Schmelzen) oder Wächter mit Brandflaschen.
Wichtig: Die Immunität (`STUN_IMMUNITY_ROUNDS`) bremst weiter.

**Meisterschaft B: Blutmagie** (★, Alternative zu Echo).
Reicht das Mana nicht, zahlst du den Rest mit Lebenspunkten: **2 LP pro fehlendem Mana**, aber nie unter
**25 % LP**. Dafür **−15 % Mana-Maximum**.
Rechnung Lv. 40, Champion: Richterstoss bei 0 Mana kostet 70 LP (10 % von 682) für 1,7 D ≈ 190 Schaden.
Das lohnt sich, aber ohne Heilung nur 2–3 Mal pro Kampf. Synergie mit Plage (Blutsauger, Notverband),
Kleriker-Regeneration und Blutrausch.
Koop: `coopAbilityBlocker` und der Server müssen die LP-Kosten kennen. Der Server rechnet ohnehin selbst.
Exploit-Prüfung: Die Grenze von 25 % LP verhindert den Selbstmord. Heilung über Lebensraub kann das
schleifen lassen. Im Playtest beobachten, ob Assassine + Blutmagie + Blutsauger zu stark wird.

### 5.4 Plage

**Vergiftete Waffen** – Stufe 1, Spalte 1, 3 Ränge.
Normale Angriffe vergiften mit **8 % Chance pro Rang** (bei 3 Rängen 24 %): **20 % des Heldenschadens pro
Runde, 3 Runden**.
Begründung: das Gegenstück zum Schnitter. Damit werden Giftmischer, Schleichendes Gift, Seuche und Fäulnis
für jede Waffe nutzbar. Wert: 0,24 · 0,6 D ≈ +0,14 D pro normalem Angriff (≈ +15–19 % auf normale Angriffe
gegen nicht immune Gegner). Weil Gift von 37 % der Kreaturen ignoriert wird, ist der Effekt im Schnitt
kleiner.
Achtung: Plage ist schon der stärkste Pfad (4.2). Darum **gleichzeitig** Zähigkeit von 3 auf 2 Ränge
kürzen (+4 % LP statt +6 %). So bleibt die Summe gleich, und es entsteht eine Entscheidung zwischen
Überleben und Gift.

**Meisterschaft B: Lebensband** (★, Alternative zu Fäulnis).
Heilung über das LP-Maximum hinaus wird zu einem **Schild bis 15 % deiner LP**. Er hält bis zum Kampfende
und fängt Schaden vor den LP ab.
Synergien: Heiltränke, Kleriker-Regeneration, Lebensraub (Plünderer, Blutrausch, Seelenraub), Arkane
Heilung. Im Koop wird überschüssige Gruppenheilung zum Schild der Mitspieler, eine Unterstützungs-Meisterschaft.
Exploit-Prüfung: Höchstens 15 %, nicht stapelbar über das Maximum. Im Turm über mehrere Kämpfe **nicht**
mitnehmen (am Kampfende verfallen).

### 5.5 Brückenknoten (später)

Knoten, die je 6 Punkte in zwei Pfaden verlangen. Sie belohnen Mischbuilds mit dem Zweitpfad. Sie
brauchen eine eigene Darstellung im `SkillTree.tsx` und sind darum ein eigenes Projekt:

- **Giftblut** (Klinge + Plage): Blutet und vergiftet ein Gegner zugleich, wirken beide **+20 %**.
- **Funkenschlag** (Klinge + Arkan): Kritische Treffer verlängern ein liegendes Feuer um 1 Runde (höchstens
  +2).
- **Eiserner Wille** (Wehr + Plage): Abwehren entfernt eine Runde von Gift, Feuer und Bluten am Helden.

### 5.6 Gabelung auf Stufe 4 (Idee #33 in docs/ideen.md)

Statt zusätzlicher Knoten kann man auch die beiden Stufe-4-Knoten zur Gabel machen (z. B. Notverband
*oder* Seuche). Das ist billiger, nimmt den Pfaden aber Ränge (Meisterschaft dann bei 13 statt 15 Punkten
nötig). Spielstände mit beiden Knoten brauchen eine Reparatur in `repairSave` (einen zurückerstatten)
und damit eine neue `version` mit Migrationstest. Empfehlung: zuerst die neuen Knoten (5.1–5.4), die
Gabel auf Stufe 4 nur, wenn die Pfade danach zu breit werden.

---

## 6. Konkrete Änderungsvorschläge (priorisiert)

Aufwand: S = Werte ändern, Texte und Tests nachziehen (≤ 1 h), M = kleine neue Mechanik (halber Tag),
L = neues System (mehrere Tage).
Für **jede** Änderung an Kampfwerten gilt: Golden Master (`combatGolden.test.ts`) bewusst mit
`npx vitest run -u` erneuern, `npm run functions:build` (der Koop-Server rechnet die Profile selbst),
README-Spielregeln, `HelpScreen.tsx` und die Klassen-Texte in `HERO_CLASSES` anpassen. Keine dieser
Änderungen braucht eine Spielstand-Migration, ausser wo vermerkt.

### Priorität 1: Ausreisser der Klassen

| # | Was | alt → neu | Ort | Aufwand | Erwartung |
|---|---|---|---|---|---|
| 1 | Duellant | Schaden +10 % → **+15 %**, Zweitschlag 35 % → **45 %** | `heroClasses.ts:93`, `:132` | S | ≈ ×1,13 auf normale Angriffe → Sim 18 → ~40 % |
| 2 | Berserker | Schaden 0 → **+10 % immer**; neu unter 50 % LP **8 % Lebensraub** (`BERSERKER_LIFESTEAL`, in `lifestealShare`) | `heroClasses.ts:58`, `:89–100`, `:150` | S–M | Sim mit ×1,1 Schaden, ×1,05 LP: 23 → 45 %. Identität: „wird gefährlich, wenn er blutet“ |
| 3 | Paladin | Schild-Basisangriff 1,5 → **2,2**; Paladin-Schaden +10 % → **+15 %** | `items.ts:84`, `heroClasses.ts:96` | S | ≈ +16 % Schaden → Sim 27 → ~50 %. Hebt alle Schild-Träger leicht. Bestehende Schilde werden automatisch stärker (Werte kommen aus dem Katalog) |
| 4 | Assassine | Krit-Faktor 2,25 → **2,1** | `heroClasses.ts:91` | S | ≈ −4 % → Sim 72 → ~64 %. Klasse bleibt vorne, aber nicht mehr allein |
| 5 | Kleriker im Koop | Heiliges Licht und Läuterung heilen beim Kleriker die Mitspieler mit **50 %** (`groupHeal` in `classAbility`) | `heroClasses.ts:107ff.`, `coopCombat.ts:1395` | S–M | schliesst die Heiler-Lücke im Koop, solo ohne Wirkung |

Playtest: Duellant und Berserker gegen Urmammut und Lichkönig mit seltener Ausrüstung. Dauert ein Paladin-
Bosskampf noch über 15 Runden? Fühlt sich die Assassine noch wie die Krit-Klasse an?

### Priorität 2: Fähigkeiten

| # | Fähigkeit | alt → neu | Ort | Aufwand |
|---|---|---|---|---|
| 6 | Heiliger Hammer | `kind: "magic"` → **zählt als Magie, wenn das wirksamer ist** (wie Runenklinge, `strikeFactors`); Faktor 1,4 → **1,5** | `abilities.ts:596`, `combatCore.ts` `strikeFactors` | M |
| 7 | Zertrümmern | Rüstungsbruch 0,25 → **0,5**; Faktor 1,2 → **1,3** | `abilities.ts:744` | S |
| 8 | Entwaffnen | Faktor 1,0 → **1,3** | `abilities.ts:547` | S |
| 9 | Vergeltung | trifft neu: Faktor 0 → **0,6**, `hits: 1` (wie Schildwall) | `abilities.ts:426` | S (Paladin-Schildstoss 0,5 gilt zusätzlich, prüfen) |
| 10 | Hackwirbel | **+Bluten 20 %, 2 Runden** auf alle Getroffenen | `abilities.ts:559` | S |
| 11 | Giftklinge | Faktor 0,8 → **1,0**; Gift 0,35 → **0,4** | `abilities.ts:510` | S |
| 12 | Kettenblitz / Eisstrahl | Kettenblitz 1,3 → **1,5**; Eisstrahl Mana 40 → **35** | `abilities.ts:783`, `:481` | S |
| 13 | Schattenschritt / Konterstellung | Schattenschritt Mana 25 → **30**; Konterstellung Konter 1,5 → **1,25** | `abilities.ts:522`, `:676` | S |
| 14 | Schwertwirbel | 0,75 → **0,85** pro Hieb | `abilities.ts:169` | S |

Danach den Pool-Abgleich aus docs/waffen-faehigkeiten.md („Abstimmung“) **mit zwei Einhandwaffen** neu
laufen lassen. Ziel: Innerhalb eines Pools liegt keine Fähigkeit unter „keine Fähigkeit“.

### Priorität 3: Skilltree-Werte

| # | Knoten | alt → neu | Ort | Aufwand |
|---|---|---|---|---|
| 15 | Hinrichter | 6 % → **10 %** pro Rang | `skills.ts:114` | S |
| 16 | Nachhall | „5 % keine Abklingzeit“ → **„8 % kein Mana“** pro Rang | `skills.ts:134`, `:206`, `abilityCost` | S–M |
| 17 | Kräuterkunde | 5 % → **8 %** pro Rang | `skills.ts:138` | S |
| – | Plage | **nicht** verstärken (stärkster Pfad), Gabel Blutsauger/Schemen so lassen | – | – |

### Priorität 4: grössere Umbauten

| # | Was | Aufwand | Bemerkung |
|---|---|---|---|
| 18 | **Neue Skilltree-Knoten** aus Abschnitt 5 (Wirbelnde Klingen, Schildmeister, Konzentration, Vergiftete Waffen + Zähigkeit 3 → 2) | M pro Knoten | Simulation `sim/zzskill.test.ts` aus docs/skilltree.md erweitern. Kürzung von Zähigkeit: Ränge über 2 fallen in `sanitizeSkills` weg, der Punkt wird frei (keine Migration nötig, aber im Changelog erwähnen) |
| 19 | **Zweite Meisterschaft pro Pfad** (Tausend Schnitte, Wächterschwur, Blutmagie, Lebensband) | L | jeweils mit eigenem Ereignis und Koop-Test (`skillsCoop.test.ts`) |
| 20 | **Fähigkeiten-Lotterie entschärfen:** Klassen-Signatur, d. h. jede aktive Klasse hat zusätzlich die Stufe-1-Fähigkeit ihrer Waffe (Magier immer Feuerball, Champion immer Richterstoss …), *oder* Schmied würfelt eine Fähigkeit gegen Essenz neu (steht schon unter „Ideen für später“ in docs/waffen-faehigkeiten.md) | M (Signatur) / M (Schmied, mit Gold- und Essenzkosten) | Signatur ist einfacher und hilft Magier und Hexer am meisten. Gilt auch im Koop: `availableAbilities` bzw. das Server-Profil |
| 21 | Zweihand gegen Doppel-Einhand bei legendär beobachten | – | Falls Einhänder im Endspiel enteilen: Zweihandwaffen bekommen **doppelten Attributbonus** (`bonusValue × 2` bei `twoHanded`) |
| 22 | **Balance-Test für die Klassenspreizung** in `combat.test.ts`: alle 11 Klassen mit passender Ausrüstung (Einhand doppelt), selten, Heiltränke, Gebietsbosse. Erwartung: keine Klasse unter 30 %, Abstand beste/schlechteste ≤ 35 Punkte | M | schützt vor neuen Ausreissern |

### Kleinigkeiten (Kommentare und Doku)

| Ort | Steht | Richtig |
|---|---|---|
| `combat.ts:176` | Krit-Faktor „Assassine 2“ | 2,25 |
| `combat.ts:199` | „Schilde +0.25 Rüstung pro Punkt“ | 0,1 (`SHIELD_ARMOR_PER_ENDURANCE`) |
| `combat.ts:914`, `combatCore.ts:584` | Echo „mit halbem Schaden“ | 30 % (`SKILL.echo.share`) |
| docs/waffen-faehigkeiten.md, Klassentabelle | Einhand-Klassen mit einer Waffe simuliert | Hinweis ergänzen oder mit zwei Waffen neu rechnen (Plünderer 20 → 40 %) |

---

## 7. Was im Playtest beobachten

- **Bossrunden pro Klasse:** Ziel 8–14 Runden. Paladin und Kleriker liegen heute bei 15–23.
- **Erste Boss-Niederlage:** Bei welcher Klasse und welchem Boss stecken neue Spieler fest? Erwartet:
  Duellant und Berserker beim Höhlenauge, Hexer bei der Sumpfechse.
- **Krit-Gefühl der Assassine** nach Vorschlag 4: Bleiben die Krits „das Ding“ der Klasse?
- **Koop-Rollen:** Spielen Gruppen mit Kleriker als Heiler (nach Vorschlag 5)? Wird der Tank noch gebraucht,
  wenn Wächterschwur kommt?
- **Mana:** Wie oft steht ein Krieger in einem Bosskampf ohne Mana da? Wenn selten, ist Konzentration
  (5.3) überflüssig.
