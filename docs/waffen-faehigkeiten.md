# Fähigkeiten auf Waffen

Kampf-Fähigkeiten werden nicht mehr im Skilltree freigeschaltet, sondern liegen auf der Waffe selbst.
**Einhandwaffen** (und der Schild) tragen **2** Fähigkeiten aus einem Pool von **4**, **Zweihandwaffen**
**3** aus einem Pool von **6**. Beispiel: ein Stab mit Feuerball, Meteor und Eisstrahl.

## Regeln

- **Vergabe:** Beim Erzeugen einer Waffe (Beute, Händler, Startausrüstung) werden ihre Fähigkeiten fest
  aus der uid gewürfelt (`rollWeaponAbilities` in `abilities.ts`) und am Item gespeichert
  (`OwnedItem.abilities`). Jede Fähigkeit eines Pools ist gleich wahrscheinlich, die Seltenheit spielt
  keine Rolle.
- **Bestehende Spielstände:** Waffen ohne Fähigkeiten bekommen beim Laden genau die, die sie als neuer
  Drop bekommen hätten (`ensureItemExtras`). Der Koop-Server liest Cloud-Spielstände und würfelt für
  ältere Waffen dasselbe (`weaponAbilities`), Client und Server sind sich also immer einig.
- **Im Kampf:** Verfügbar sind die Fähigkeiten beider angelegten Waffen, erst die der ersten Hand, ohne
  Doppelte. Mit zwei Einhandwaffen (oder Waffe und Schild) sind es bis zu vier.
- **Skilltree:** Nur noch Ränge (+2 % Schaden pro Rang, höchstens 5, beim Schild Rüstung). Unter jedem
  Waffentyp zeigt er alle möglichen Fähigkeiten, die der angelegten Waffen leuchten. Früher für
  Fähigkeiten ausgegebene Skillpunkte sind beim Laden wieder frei (`character.abilities` entfällt).
  11 Waffentypen × 5 Ränge = 55 Punkte, bei Level 60 hat man 59.
- **Anzeige:** Im Item-Tooltip stehen die Fähigkeiten der Waffe mit Mana, Abklingzeit und Wirkung.
- **Erfolg „Gelehrter“:** zählt jetzt die verschiedenen Fähigkeiten, die man je auf eigenen Waffen hatte
  (5 / 20 / 45 von 54). Bereits erreichte Stufen bleiben.
- **Klassenboni:** Wächter verlängert jetzt jede Schwächung um 1 Runde (nicht nur Erdbeben). Waldläufer
  (Pfeilhagel mit 5 Pfeilen) und Paladin (halbes Bollwerk, Schildstoss) wirken, wenn die Waffe die
  Fähigkeit trägt – ihr Hauptbonus gilt immer.

## Neue Mechaniken

| Feld | Fähigkeit | Wirkung |
|---|---|---|
| `kind` | Heiliger Hammer | Eigene Schadensart (Magie statt Wucht) – zählt für Schwächen und Resistenzen |
| `cleanse` | Läuterung | Entfernt Gift, Feuer und Bluten vom Helden |
| `damageTaken` | Schildwall, Wutschrei | Erlittener Schaden −50 % bzw. +20 % für einige Runden, ab sofort (Treffer, Explosionen) |
| `taunt` | Schildwall | Zieht im Koop die Bedrohung auf sich wie Bollwerk |
| `bleedBonus` | Ausbluten | +60 % Schaden gegen blutende Gegner |
| `charge` | Titanenschlag | Ausholen: die nächste Aktion (Angriff oder Fähigkeit) macht dreifachen Schaden |
| `renew` | Arkane Heilung | Heilung über Zeit am Rundenende |
| `groupHeal` | Arkane Heilung | Im Koop bekommen alle Mitspieler die Hälfte der Heilung |
| `manaGain` | Arkaner Schild | Gibt Mana zurück |

Eissplitter heisst jetzt **Eisstrahl**. Die neuen Fähigkeiten nutzen in den Kampfszenen die Animation einer
ähnlichen vorhandenen (`src/game/abilityAnimations.ts`).

Nebenbei behoben: Der Turm-Segen „Henker“ wirkte nur auf Fähigkeiten, jetzt auch auf normale Angriffe.
Der Item-Effekt „Kettenblitz“ traf den zweiten Gegner mit vollem statt 60 % Schaden.

## Pools

### Dolch (4)

| | Fähigkeit | Mana | Abklingzeit | Wirkung |
|---|---|---|---|---|
| 🗡️ | Hinterhältiger Stoss | 20 | 1 | Ein gezielter Stich – trifft immer kritisch. |
| 🩸 | Meucheln | 30 | 2 | Ein Stich ins Herz: dreifacher Schaden, wenn der Gegner unter 30 % seiner Lebenspunkte ist. |
| 🐍 | **Giftklinge** (neu) | 25 | 2 | Ein Stich mit vergifteter Klinge – der Gegner erleidet 3 Runden lang Giftschaden. |
| 🌑 | **Schattenschritt** (neu) | 25 | 3 | Ein Stich, dann verschwindest du in den Schatten: Der nächste gegnerische Angriff geht komplett ins Leere. |

### Schwert (4)

| | Fähigkeit | Mana | Abklingzeit | Wirkung |
|---|---|---|---|---|
| 🌀 | Schwertwirbel | 25 | 1 | Drei schnelle Hiebe – jeder kann kritisch treffen. Bei mehreren Gegnern trifft jeder Hieb einen zufälligen. |
| 🤺 | Parade | 25 | 2 | Ein leichter Hieb, dann in Abwehrhaltung: Der nächste gegnerische Angriff macht nur halben Schaden und du konterst mit vollem Schaden. |
| 🩸 | **Tiefe Wunde** (neu) | 30 | 2 | Ein tiefer Schnitt mit 1,3-fachem Schaden – der Gegner blutet 3 Runden lang. |
| 🤚 | **Entwaffnen** (neu) | 25 | 3 | Ein Hieb gegen die Waffenhand: Der Gegner macht 2 Runden lang 30 % weniger Schaden. |

### Axt (4)

| | Fähigkeit | Mana | Abklingzeit | Wirkung |
|---|---|---|---|---|
| 🪓 | Axtwurf | 25 | 1 | Die geworfene Axt durchschlägt jede Rüstung. |
| 🐺 | Zerfleischen | 30 | 2 | Zwei wilde Hiebe – der Gegner blutet 2 Runden lang. |
| 🌪️ | **Hackwirbel** (neu) | 30 | 2 | Ein Wirbel aus Axthieben trifft alle Gegner mit 0,9-fachem Schaden. |
| 🪵 | **Spaltschlag** (neu) | 25 | 3 | Ein Hieb mit 1,3-fachem Schaden, der die Rüstung spaltet: −25 % Rüstung des Gegners für den Rest des Kampfes. |

### Streitkolben (4)

| | Fähigkeit | Mana | Abklingzeit | Wirkung |
|---|---|---|---|---|
| 💫 | Betäubender Schlag | 30 | 3 | Betäubt den Gegner – er kann in dieser Runde nicht zurückschlagen. |
| ✨ | Heiliges Licht | 35 | 4 | Heilt dich um 25 % deiner Lebenspunkte, dazu ein leichter Schlag. |
| 🕊️ | **Läuterung** (neu) | 25 | 3 | Statt anzugreifen: Du heilst dich um 20 % deiner Lebenspunkte und befreist dich von Gift, Feuer und Bluten. |
| 🌟 | **Heiliger Hammer** (neu) | 30 | 2 | Ein Schlag voll heiliger Kraft mit 1,4-fachem Schaden – er zählt als Magie statt als Wucht. |

### Zepter (4)

| | Fähigkeit | Mana | Abklingzeit | Wirkung |
|---|---|---|---|---|
| ☠️ | Giftstrahl | 25 | 2 | Vergiftet den Gegner: 3 Runden Giftschaden, der Rüstung ignoriert. |
| 🕯️ | Fluch der Schwäche | 30 | 4 | Verflucht den Gegner für 3 Runden: Er macht 30 % weniger Schaden und erleidet 20 % mehr. |
| 🟣 | **Seelenfeuer** (neu) | 30 | 2 | Dunkles Feuer mit 0,7-fachem Schaden, das Rüstung ignoriert – der Gegner brennt 3 Runden lang. |
| 🧪 | **Lebensentzug** (neu) | 35 | 3 | Saugt dem Gegner das Leben aus: 1,5-facher Schaden, der Rüstung ignoriert – du heilst dich um die Hälfte davon. |

### Schild (4)

| | Fähigkeit | Mana | Abklingzeit | Wirkung |
|---|---|---|---|---|
| 🛡️ | Bollwerk | 20 | 3 | Statt anzugreifen hinter dem Schild verschanzen: Der nächste gegnerische Angriff wird komplett geblockt. |
| 🔁 | Vergeltung | 25 | 3 | Statt anzugreifen: Der nächste gegnerische Angriff macht nur halben Schaden – und der volle Schaden trifft den Angreifer. |
| 💢 | **Schildstoss** (neu) | 25 | 3 | Ein Stoss mit dem Schildrand – mit 60 % Chance ist der Gegner betäubt und kann nicht zurückschlagen. |
| 🧱 | **Schildwall** (neu) | 30 | 4 | Ein Schildhieb mit 0,6-fachem Schaden, dann gehst du in Deckung: 3 Runden lang erleidest du 50 % weniger Schaden. Im Koop ziehst du die Aufmerksamkeit der Gegner auf dich. |

### Zweihandschwert (6)

| | Fähigkeit | Mana | Abklingzeit | Wirkung |
|---|---|---|---|---|
| ⚖️ | Richterstoss | 35 | 2 | Ein gewaltiger Stoss mit 2,3-fachem Schaden. |
| 📯 | Kriegsschrei | 30 | 4 | Ein Hieb mit lautem Schrei: In den nächsten 3 Runden machst du 25 % mehr Schaden. |
| 🌪️ | Klingensturm | 40 | 4 | Zwei wuchtige Hiebe gegen alle Gegner – jeder kann kritisch treffen. Danach erleiden sie 2 Runden lang 10 % mehr Schaden. |
| ✖️ | **Kreuzhieb** (neu) | 35 | 2 | Zwei gekreuzte Hiebe mit je 0,9-fachem Schaden – jeder kann kritisch treffen, der Gegner blutet 2 Runden lang. |
| 🗡️ | **Konterstellung** (neu) | 30 | 3 | Ein Hieb, dann in Stellung: Der nächste gegnerische Angriff macht 40 % weniger Schaden und du konterst mit 1,5-fachem Schaden. |
| 🦁 | **Heldenmut** (neu) | 35 | 4 | Ein Hieb voller Heldenmut: Du heilst dich um 15 % deiner Lebenspunkte und machst in den nächsten 2 Runden 15 % mehr Schaden. |

### Grossaxt (6)

| | Fähigkeit | Mana | Abklingzeit | Wirkung |
|---|---|---|---|---|
| 💥 | Spalter | 30 | 3 | Ein Hieb mit 1,2-fachem Schaden, der die Panzerung spaltet: −20 % Rüstung des Gegners für den Rest des Kampfes, dazu blutet er 3 Runden lang. Umstehende Gegner erleiden halben Schaden. |
| 🧛 | Blutrausch | 35 | 3 | Ein rasender Hieb mit 1,6-fachem Schaden – du heilst dich um 40 % des Schadens. |
| 💀 | Enthaupten | 35 | 3 | Ein Hieb mit 1,3-fachem Schaden – 2,5-fach so stark, wenn der Gegner unter 30 % seiner Lebenspunkte ist. |
| 🌀 | **Wirbelwind** (neu) | 40 | 3 | Zwei kreisende Hiebe gegen alle Gegner mit je 0,7-fachem Schaden – jeder kann kritisch treffen. |
| 😤 | **Wutschrei** (neu) | 25 | 4 | Ein Hieb mit wildem Schrei: In den nächsten 3 Runden machst du 40 % mehr Schaden – aber du erleidest ab sofort 20 % mehr. |
| 🔪 | **Ausbluten** (neu) | 30 | 2 | Ein Hieb mit 1,4-fachem Schaden in die offene Wunde – gegen blutende Gegner 60 % stärker. |

### Grosshammer (6)

| | Fähigkeit | Mana | Abklingzeit | Wirkung |
|---|---|---|---|---|
| 🔨 | Wuchtiger Schlag | 40 | 2 | Ein vernichtender Hieb mit 2,2-fachem Schaden. |
| 🌋 | Erdbeben | 40 | 3 | Der Boden bebt unter allen Gegnern: voller Schaden, der Rüstung ignoriert – sie machen 2 Runden lang 30 % weniger Schaden. |
| ⚡ | Schockwelle | 40 | 3 | Ein Schlag mit 1,5-fachem Schaden gegen alle Gegner – jeder ist mit 30 % Chance betäubt und kann nicht zurückschlagen. |
| 🪨 | **Zertrümmern** (neu) | 35 | 3 | Ein Hieb mit 1,2-fachem Schaden, der die Panzerung zertrümmert: −25 % Rüstung des Gegners für den Rest des Kampfes. |
| ⛰️ | **Unerschütterlich** (neu) | 30 | 4 | Statt anzugreifen: Du heilst dich um 15 % deiner Lebenspunkte, der nächste gegnerische Angriff macht nur halben Schaden. |
| 🌋 | **Titanenschlag** (neu) | 45 | 4 | Statt anzugreifen holst du weit aus: Dein nächster Angriff oder deine nächste Fähigkeit macht dreifachen Schaden. |

### Stab (6)

| | Fähigkeit | Mana | Abklingzeit | Wirkung |
|---|---|---|---|---|
| 🔥 | Feuerball | 40 | 2 | Ein Feuerball mit 1,9-fachem Schaden, der Rüstung ignoriert und den Gegner 2 Runden lang in Brand setzt. |
| ☄️ | Meteor | 60 | 4 | Ein Meteor mit 2,3-fachem Schaden, der Rüstung ignoriert und das Ziel 3 Runden lang in Brand setzt. Umstehende Gegner erleiden halben Schaden. |
| ❄️ | Eisstrahl | 40 | 3 | Ein eisiger Strahl mit 1,5-fachem Schaden, der Rüstung ignoriert – mit 40 % Chance friert der Gegner ein und setzt eine Runde aus. |
| ⚡ | **Kettenblitz** (neu) | 40 | 3 | Ein Blitz mit 1,3-fachem Schaden, der Rüstung ignoriert – er springt auf alle anderen Gegner über (60 % Schaden). |
| 💚 | **Arkane Heilung** (neu) | 40 | 4 | Statt anzugreifen: Du heilst dich sofort um 20 % deiner Lebenspunkte und 3 Runden lang um je 5 %. Im Koop heilt sie alle Mitspieler halb so stark. |
| 🔮 | **Arkaner Schild** (neu) | 20 | 3 | Statt anzugreifen: Ein Schild aus Magie – der nächste gegnerische Angriff macht 60 % weniger Schaden, und du gewinnst 15 Mana zurück. |

### Bogen (6)

| | Fähigkeit | Mana | Abklingzeit | Wirkung |
|---|---|---|---|---|
| 🏹 | Pfeilhagel | 35 | 2 | Vier Pfeile regnen herab – jeder kann kritisch treffen. Bei mehreren Gegnern verteilen sie sich zufällig. |
| 🎯 | Durchbohrender Schuss | 35 | 2 | Ein gezielter Schuss mit 1,8-fachem Schaden, der Rüstung durchschlägt – der Gegner blutet 2 Runden lang. |
| 💨 | Ausweichschuss | 30 | 3 | Ein Schuss mit 1,2-fachem Schaden, dann Rückzug: Der nächste gegnerische Angriff macht 60 % weniger Schaden. |
| 🟢 | **Giftpfeil** (neu) | 25 | 2 | Ein vergifteter Pfeil – der Gegner erleidet 3 Runden lang Giftschaden. |
| 🔥 | **Brandpfeil** (neu) | 30 | 2 | Ein brennender Pfeil mit 1,1-fachem Schaden – der Gegner brennt 3 Runden lang. |
| 🦅 | **Kopfschuss** (neu) | 40 | 4 | Ein Schuss genau zwischen die Augen: 1,5-facher Schaden, trifft immer kritisch. |
## Abstimmung (Simulation)

Weil jede Waffe eine zufällige Auswahl trägt, zählt vor allem, dass die Fähigkeiten eines Pools ähnlich
stark sind. Simuliert wurde jede mögliche Kombination einer Waffe (2 aus 4 bzw. 3 aus 6) mit der passenden
Klasse, seltener Ausrüstung und Tränken gegen alle Gebietsbosse. Pro Fähigkeit steht die mittlere
Siegquote aller Kombinationen, in denen sie vorkommt. Bei Einhandwaffen trägt in der Simulation nur eine
Waffe Fähigkeiten, darum liegen ihre Werte tiefer – verglichen wird nur innerhalb eines Pools.

**Neue Fähigkeiten:** Schildwall, Läuterung, Lebensentzug, Spaltschlag, Wutschrei und Heldenmut fielen
zuerst deutlich ab (Runden ganz ohne Treffer kosten zu viel) und wurden verstärkt; Schildwall, Wutschrei
und Heldenmut treffen jetzt auch.

**Alte Ausreisser abgeschwächt** – mit zufälligen Fähigkeiten wäre eine Waffe mit ihnen ein Hauptgewinn:

| Fähigkeit | Vorher | Jetzt | Siegquote vorher → jetzt (Pool) |
|---|---|---|---|
| ☄️ Meteor | 2,6× | 2,3× | 87 % → 82 % (Stab 44–63 %) |
| 🌪️ Klingensturm | 3 Hiebe à 0,8×, +15 % verwundbar, 3 Runden | 2 Hiebe à 0,7×, +10 %, 4 Runden | gewöhnlich 96 % → 32 % (Pool 10–19 %) |
| 🌋 Erdbeben | 1,3×, −40 % Schaden | 1,0×, −30 % | 93 % → 84 % (Hammer 62–85 %) |
| 💥 Spalter | 1,5× | 1,2× | 67 % → 54 % (Grossaxt 28–57 %) |

Damit der Magier ohne Meteor nicht abstürzt, wurden Feuerball (1,7→1,9×), Eisstrahl (1,3→1,5×) und
Kettenblitz (1,1→1,3×) etwas stärker. Der Champion verliert mit dem schwächeren Klingensturm vor allem mit
gewöhnlicher Ausrüstung (Schnitt 49 % → 17 %, jetzt wie die anderen Klassen).

Der Balance-Test in `combat.test.ts` spielt den Champion mit einer durchschnittlichen Waffe
(Richterstoss, Kriegsschrei, Kreuzhieb). Mit einer schwachen Kombination gewinnt er gegen Ignaroth mit
seltener Ausrüstung nur etwa ein Drittel der Kämpfe – die Streuung zwischen Waffen ist gewollt.

Simulation: Scratchpad `zzabil.test.ts`, Bericht mit `abilrep.cjs`.

## Ideen für später

- Beim Schmied die Fähigkeiten einer Waffe neu würfeln (gegen Essenz).
- Seltenheit einbeziehen, z. B. ab legendär eine Fähigkeit mehr oder garantiert eine starke.
