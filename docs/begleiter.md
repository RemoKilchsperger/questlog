# Begleiter und Missionen

In der Taverne kann man Begleiter anwerben. Man levelt sie auf, rüstet sie mit Items aus dem eigenen
Inventar aus und schickt sie auf Missionen, die in Echtzeit laufen. Ob eine Mission gelingt, hängt vom
Gearscore der Begleiter ab. Jeder Begleiter hat zufällige Eigenschaften (Traits), etwa mehr Beute oder
mehr EP. Je weiter die Taverne ausgebaut ist, desto mehr und bessere Traits haben die Kandidaten.

Status: **Konzept** (Idee #18 in docs/ideen.md). Geplanter Code: `src/domain/companions.ts`
(Namen, Traits, Level, Gearscore, Missionen, Beute), Store `gameStore.ts`, Oberfläche in der Taverne
(`VillageMenus.tsx`). Alle Zahlen sind Richtwerte und werden vor dem Merge durchgerechnet.

## Ziele

- **Ein Grund, zwischendurch reinzuschauen:** Missionen losschicken, später die Beute abholen.
- **Alte und doppelte Items bekommen einen Nutzen**, statt nur zerlegt zu werden.
- **Die Taverne wird wertvoller:** Ihr Ausbau bringt nicht nur Gerichte, sondern auch bessere Begleiter.
- **Kein Ersatz fürs Kämpfen:** Missionen bringen deutlich weniger ein als selbst zu spielen.

## Was Begleiter nicht tun

- Sie **kämpfen nicht mit**, weder solo noch im Koop. Das wäre später ein eigener Ausbau.
- Sie **sterben nicht**. Nach einer missglückten Mission kommen sie ohne Beute zurück.
- Sie haben **keine Klasse, keine Fähigkeiten und keine Attribute**. Für Missionen zählen nur Level,
  Gearscore und Traits.

## Anwerben

Die Taverne bekommt einen zweiten Bereich „Begleiter“ neben den Gerichten. Ohne Taverne (Stufe 0) gibt es
keine Begleiter.

| Tavernen-Stufe | Plätze | Traits pro Kandidat | Seltenheit der Traits (gewöhnlich / selten / episch / legendär) |
|---|---|---|---|
| 1 Schankstube | 2 | 1 | 80 / 20 / 0 / 0 % |
| 2 Gasthaus | 3 | 1, mit 50 % Chance 2 | 55 / 35 / 10 / 0 % |
| 3 Festhalle | 4 | 2, mit 30 % Chance 3 | 35 / 40 / 20 / 5 % |

- **Kandidaten:** Jeden Tag stehen 3 Kandidaten in der Taverne. Einmal am Tag kann man sie gegen Gold neu
  würfeln (Preis wie ein Anwerben auf Stufe „gewöhnlich“).
- **Startlevel:** Heldenlevel − 5, mindestens 1. Ein neuer Begleiter ist also sofort brauchbar, muss
  aber noch etwas aufholen.
- **Preis:** 50 × (1 + (Level − 1) / 10) × Faktor der seltensten Eigenschaft (1 / 2 / 4 / 8, wie der
  Preisfaktor der Items). Auf Level 30 kostet ein Kandidat mit einem seltenen Trait also etwa 390 Gold.
- **Entlassen:** Man kann einen Begleiter jederzeit entlassen, wenn er nicht unterwegs ist. Seine Items
  kommen zurück ins Inventar, das Gold nicht.
- Baut man die Taverne aus, behalten bestehende Begleiter ihre Traits. Nur neue Kandidaten werden besser.

## Namen und Aussehen

Namen werden zufällig aus einem Vornamen und einem Beinamen zusammengesetzt, z. B. „Brunhild
Eisenfaust“, „Odo vom Moor“ oder „Ilsa die Stille“. Dafür gibt es je etwa 40 Vornamen und 40 Beinamen,
also 1'600 Kombinationen. Ein Name, der schon vergeben ist, wird neu gewürfelt.

Das Aussehen ist der bestehende `PixelAvatar` mit der angelegten Ausrüstung. Wer seinen Begleiter neu
einkleidet, sieht das also sofort.

## Traits

Jeder Trait kommt pro Begleiter höchstens einmal vor. Die Werte steigen mit der Seltenheit:

| Trait | Wirkung | Gewöhnlich | Selten | Episch | Legendär |
|---|---|---|---|---|---|
| 💰 Schatzsucher | mehr Gold aus Missionen | +10 % | +20 % | +30 % | +45 % |
| 🪵 Sammler | mehr Material aus Missionen | +10 % | +20 % | +30 % | +45 % |
| ✨ Essenzgespür | mehr Essenz aus Missionen | +10 % | +20 % | +30 % | +45 % |
| 🎁 Plünderer | höhere Chance auf ein Item | +10 % | +20 % | +35 % | +50 % |
| 📖 Lernbegierig | mehr EP für sich selbst | +10 % | +20 % | +35 % | +50 % |
| 🎓 Lehrmeister | mehr EP für die anderen Begleiter derselben Mission | +5 % | +10 % | +15 % | +25 % |
| 🛡️ Kampferprobt | höherer Gearscore | +3 % | +6 % | +10 % | +15 % |
| 🍀 Glückspilz | höhere Erfolgschance | +3 | +5 | +8 | +12 Prozentpunkte |
| 🏃 Flink | kürzere Missionen | −10 % | −15 % | −20 % | −30 % |

Beute-Traits (Gold, Material, Essenz, Plünderer) gelten für die ganze Mission, sie werden
zusammengezählt. Zwei Schatzsucher mit je +20 % ergeben also +40 % Gold. Flink wirkt nur, wenn alle
Begleiter der Mission flink sind, dann zählt der kleinste Wert. Sonst könnte ein einzelner flinker
Begleiter jede Mission verkürzen.

## Level

- Begleiter leveln mit derselben Kurve wie der Held (`xpForNextLevel`).
- Sie können **höchstens das Level des Helden** erreichen. EP darüber hinaus verfallen. Der Begleiter
  wird so nie stärker als man selbst und braucht keine eigenen Items über dem Heldenlevel.
- Mit dem Level steigt nur, welche Items er tragen kann. Für Missionen zählt der Gearscore.

## Ausrüstung

- Begleiter haben dieselben 7 Plätze wie der Held (5 Rüstung, 2 Waffen). Ihr Gearscore wird mit der
  bestehenden Funktion `gearScore` berechnet, danach kommt der Trait „Kampferprobt“ dazu.
- Sie tragen **Items aus dem Inventar des Helden**. Für jedes Item braucht der Begleiter das passende
  Level, die Rüstungsklasse spielt keine Rolle.
- Ein angelegtes Item gehört so lange dem Begleiter. Man kann es nicht verkaufen, zerlegen oder beim
  Schmied verbessern, bis man es wieder abnimmt.
- Während einer Mission lässt sich die Ausrüstung nicht ändern.
- Ein Knopf „Bestes anlegen“ wählt aus dem Inventar für jeden Platz das Item mit dem höchsten Item-Score.

## Missionen

### Missionstafel

In der Taverne hängen **4 Missionen**. Jeden Tag kommen neue, eine angenommene Mission wird erst am
nächsten Tag ersetzt. Jede Mission hat:

- **Gebiet und Level:** passend zum Heldenlevel. Die 4 Missionen liegen bei Heldenlevel −8, −4, ±0 und
  +2, jeweils in dem Gebiet, zu dem das Level gehört.
- **Dauer:** 30 Minuten, 2 Stunden oder 8 Stunden.
- **Truppstärke:** 1, 2 oder 3 Begleiter, die man genau so losschicken muss.
- **Schwierigkeit:** normal, schwer oder heroisch.

Der **geforderte Gearscore** ist Missionslevel × Schwierigkeitsfaktor. Die Faktoren entsprechen den
Seltenheiten der Items:

| Schwierigkeit | Faktor | Bedeutung |
|---|---|---|
| Normal | 1,0 | gewöhnliche Items auf Missionslevel reichen für 50 % |
| Schwer | 1,2 | dafür braucht es seltene Items |
| Heroisch | 1,45 | dafür braucht es epische Items |

### Erfolgschance

Gruppen-Gearscore = Durchschnitt der Begleiter, jeweils mit „Kampferprobt“.
Verhältnis r = Gruppen-Gearscore / geforderter Gearscore.

**Chance = 50 % + 120 × (r − 1) Prozentpunkte + Glückspilz, mindestens 5 %, höchstens 95 %.**

| r | 0,8 | 0,9 | 1,0 | 1,1 | 1,2 | 1,375 |
|---|---|---|---|---|---|---|
| Chance | 26 % | 38 % | 50 % | 62 % | 74 % | 95 % |

Die Chance wird vor dem Losschicken angezeigt.

### Ablauf

1. Mission wählen, Begleiter auswählen, losschicken.
2. **Das Ergebnis wird schon beim Losschicken ausgewürfelt** und im Spielstand gespeichert. Neu laden
   ändert also nichts.
3. Ist die Zeit um, zeigt das Dorf ein Zeichen an der Taverne. Man holt das Ergebnis dort ab.
4. Die Zeit läuft mit der echten Uhr weiter, auch wenn das Spiel geschlossen ist.

Jeder Begleiter kann nur auf einer Mission gleichzeitig sein. Eine laufende Mission lässt sich abbrechen.
Die Begleiter kommen dann sofort und ohne Beute zurück.

### Beute

Die Beute wird in **Sieg-Äquivalenten** gerechnet, also so viel wie ein normaler Sieg auf Missionslevel
bringt:

| Dauer | Sieg-Äquivalente pro Begleiter | Item-Chance pro Mission |
|---|---|---|
| 30 Min. | 3 | 10 % |
| 2 Std. | 8 | 25 % |
| 8 Std. | 20 | 60 % |

- **Sieg-Äquivalente der Mission** = Tabellenwert × Truppstärke, schwer ×1,25, heroisch ×1,5.
- **Gold:** wie ein normaler Sieg, 0,4 × (3 + Level) pro Sieg-Äquivalent.
- **Material:** 0,5 pro Sieg-Äquivalent, das Material des Gebiets.
- **Essenz:** 0,2 × (1 + Level / 10) pro Sieg-Äquivalent. Kämpfe geben keine Essenz, das ist also
  ein eigener Wert (auf Level 30 bringt eine 8-Stunden-Mission eines Begleiters 16 Essenz, etwa zwei
  zerlegte seltene Items).
- **Item:** aus dem Beutepool des Missionslevels. Die Seltenheit hängt von der Schwierigkeit ab:
  normal wie ein normaler Drop, schwer wie eine Gebiets-Quest, heroisch wie eine Boss-Quest.
- **EP:** jeder Begleiter erhält die EP der Sieg-Äquivalente (ohne Truppstärke) **× 3**, plus
  „Lernbegierig“ und „Lehrmeister“. Der Faktor 3 gilt, weil Begleiter nur über Missionen leveln. Der
  Held erhält keine EP.
- **Misserfolg:** 25 % der EP, sonst nichts.

Zum Vergleich: Eine 8-Stunden-Mission mit 3 Begleitern bringt 60 Sieg-Äquivalente, also so viel wie 60
eigene Siege. Missionen sollen ein Zubrot sein, kein Ersatz. Ob das Verhältnis stimmt, wird in Schritt 4
durchgerechnet.

## Spielstand

Neue Felder im Spielstand (Version 19):

- `companions`: Liste der Begleiter mit `id`, `name`, `level`, `xp`, `traits` (Trait und Seltenheit)
  und `equipment` (wie beim Helden, mit `OwnedItem`).
- `recruits`: die Kandidaten des Tages mit Datum und ob schon neu gewürfelt wurde.
- `missions`: die Missionstafel des Tages und die laufenden Missionen mit Startzeit, Endzeit, Begleitern
  und dem vorab gewürfelten Ergebnis.

Alte Spielstände bekommen leere Listen. Weil der Cloud-Spielstand den ganzen Zustand speichert, sind
Begleiter und laufende Missionen auch auf anderen Geräten da.

Im Koop zählen Begleiter nicht. Der Server muss nichts über sie wissen.

## Umsetzung in Schritten

1. `companions.ts`: Namensgenerator, Traits, Anwerben, Level, Gearscore, Missionen, Erfolgschance,
   Beute. Alles mit Tests und einem übergebenen Zufallsgenerator.
2. Store: Zustand, Aktionen (anwerben, neu würfeln, entlassen, an- und ablegen, losschicken, abbrechen,
   abholen) und Migration auf Version 19.
3. Oberfläche: Bereich „Begleiter“ in der Taverne (Kandidaten, eigene Begleiter, Ausrüstung) und die
   Missionstafel. Zeichen an der Taverne im Dorf, wenn eine Mission fertig ist.
4. Zahlen durchrechnen: Erfolgschancen mit typischer Ausrüstung und Beute pro Stunde im Vergleich zum
   Kämpfen.
5. Hilfe-Seite und Tavernen-Beschreibung in `village.ts` und docs/dorf-ausbau.md ergänzen.

## Offen für später

- Begleiter, die im Kampf mitkämpfen (eigene Rolle wie Heiler oder Schildträger).
- Erfolge für Missionen und Begleiter.
- Seltene Missionen mit Boss-Beute oder einzigartigen Items.
