# Gegner-Grafiken: Prompts für die KI

Prompts für alle 49 Gegner. Die Prompts sind auf Englisch, weil die meisten Bild-KIs damit zuverlässiger arbeiten.

## So gehst du vor

1. **Stil-Vorgabe:** Kopiere die Stil-Vorgabe unten vor jeden Gegner-Prompt. Falls das Tool ein Feld für einen „Style“ oder ein Referenzbild hat, gehört sie dort hinein. Wichtig ist, dass alle Gegner gleich aussehen.
2. **Zuerst testen:** Generiere zuerst 2–3 Gegner, z. B. Grauwolf, Goblin und Jungdrache. Wenn dir der Stil gefällt, nimmst du das beste Bild als **Stil-Referenz** für alle weiteren. PixelLab und Retro Diffusion können das.
3. **Bildformat:**
   - **Format:** PNG mit **transparentem Hintergrund**
   - **Grösse:** quadratisch, am besten **128×128** (64×64 geht auch), bei allen Gegnern gleich
   - **Blickrichtung:** **nach links**, denn der Held steht links
   - **Position:** Die Figur steht unten im Bild auf dem Boden und füllt das Bild gut aus
4. **Dateien ablegen:** Speichere die Bilder unter dem angegebenen Dateinamen in `src/assets/creatures/`, z. B. `src/assets/creatures/wolf.png`. Den Rest übernehme ich: Einbau in Kampf, Koop, Listen und Boss-Ansicht.

Bei Bossen steht „boss“ im Prompt. Sie dürfen etwas imposanter und detailreicher sein.

## Stil-Vorgabe (vor jeden Prompt)

```
pixel art game sprite of a dark fantasy RPG monster, side view, full body, facing left, standing on the ground at the bottom of the image, crisp pixels, clean dark outline, rich shading with light from the top left, vibrant but slightly muted colors, detailed, transparent background, no text, no frame, single character
```

Negativ-Prompt, falls es dein Tool unterstützt:

```
blurry, anti-aliasing, gradient background, text, watermark, multiple characters, cropped, facing right, 3d render, photo
```

---

## Düsterwald (Lv. 1–10): dichter, finsterer Wald

| Datei | Gegner | Prompt |
|---|---|---|
| `rat.png` | Riesenratte | `giant mangy forest rat, grey ragged fur, long naked pink tail, red glowing eyes, sharp yellow incisors, hunched aggressive pose` |
| `wolf.png` | Grauwolf | `grey wolf, snarling with bared fangs, bristling fur on the back, yellow eyes, low hunting stance` |
| `spider.png` | Waldspinne | `giant dark purple forest spider, eight long jointed legs, bulbous abdomen with glowing violet markings, cluster of red eyes, dripping fangs` |
| `goblin.png` | Goblin-Plünderer | `small green goblin raider, huge pointed ears, hooked nose, nasty toothy grin, leather vest and ragged loincloth, holding a rusty dagger` |
| `goblin-chief.png` | Goblinhäuptling Krummzahn (Boss) | `boss: goblin chieftain, bigger and meaner than a normal goblin, horned iron helmet, fur shoulder pads, tattered purple cape, wielding a heavy cleaver axe, one crooked tusk` |

## Nebelsümpfe (Lv. 11–20): modrige Sümpfe im Nebel

| Datei | Gegner | Prompt |
|---|---|---|
| `toad.png` | Sumpfkröte | `huge warty swamp toad, mossy green and brown skin, pale yellow belly, wide mouth, bulging golden eyes, slime dripping` |
| `snake.png` | Moorschlange | `large coiled bog serpent, dark green scales with yellow banding, raised head, forked red tongue, venomous fangs` |
| `zombie.png` | Moorleiche | `bog corpse zombie, pale greenish rotten skin, torn muddy clothes, swamp weeds hanging from it, glowing yellow eyes, shambling with arms reaching forward` |
| `mosquitoes.png` | Blutmückenschwarm | `swarm of giant blood mosquitoes, several insects with red swollen bodies, translucent wings, long needle snouts, hovering in a cluster` |
| `swamp-lizard.png` | Uralte Sumpfechse (Boss) | `boss: ancient giant swamp lizard, crocodile-like, mossy dark green scales, spiked back ridge, massive jaws with teeth, ancient and scarred` |

## Kristallhöhlen (Lv. 21–30): leuchtende Höhlen tief unter den Bergen

| Datei | Gegner | Prompt |
|---|---|---|
| `bat.png` | Höhlenfledermaus | `giant cave bat, wings spread wide, purple-grey leathery wings, big ears, glowing red eyes, open mouth with fangs, flying` |
| `golem.png` | Steingolem | `hulking stone golem made of grey boulders, moss patches, glowing cyan crystal eyes and runes, massive rock fists` |
| `scorpion.png` | Kristallskorpion | `crystal scorpion, body made of translucent cyan ice-blue crystal, glowing stinger tail raised, large pincers` |
| `worm.png` | Felswurm | `giant rock worm bursting out of the ground, segmented fleshy pink-brown body, round mouth full of rows of teeth, rocks crumbling around it` |
| `eye.png` | Das Höhlenauge (Boss) | `boss: floating giant eyeball monster, huge single eye with green iris, purple fleshy body, tentacles hanging below, glowing crystals around it` |

## Frostgipfel (Lv. 31–40): eisige Höhen

| Datei | Gegner | Prompt |
|---|---|---|
| `ice-bear.png` | Eisbär | `huge white polar bear, frost on the fur, icicles, roaring, standing on all fours` |
| `frost-elemental.png` | Frostelementar | `frost elemental, floating humanoid made of jagged ice-blue crystals and swirling snow, glowing dark blue core and eyes` |
| `snow-wolf.png` | Schneewolf | `white snow wolf, thick white fur with pale blue shading, icy blue glowing eyes, snarling, frost breath` |
| `troll.png` | Frosttroll | `big frost troll, blue-grey skin, shaggy white hair and beard, tusks, fur loincloth, holding a huge wooden club` |
| `mammoth.png` | Urmammut Graufrost (Boss) | `boss: ancient primal woolly mammoth, long shaggy brown fur covered in frost, enormous curved ivory tusks, small dark eyes, massive and majestic` |

## Schattenruinen (Lv. 41–50): Trümmer eines gefallenen Reiches, Heimat der Untoten

| Datei | Gegner | Prompt |
|---|---|---|
| `skeleton.png` | Skelettkrieger | `skeleton warrior, bleached bones, rusty helmet, broken shield and notched sword, glowing red eye sockets` |
| `ghost.png` | Klagegeist | `wailing ghost, translucent pale blue spectral figure, flowing tattered shroud, hollow dark eyes, open screaming mouth, floating` |
| `vampire.png` | Blutsauger | `vampire nobleman, pale skin, black and crimson high-collar cape, slicked black hair, red eyes, fangs, clawed hands` |
| `sorcerer.png` | Dunkler Hexer | `dark sorcerer in a hooded deep purple robe, face hidden in shadow with glowing yellow eyes, holding a gnarled staff with a glowing violet orb` |
| `lich.png` | Der Lichkönig (Boss) | `boss: lich king, skeletal undead king in ornate dark purple and gold robes, golden crown, glowing teal eyes, holding a staff with a skull, ghostly green aura` |

## Drachenhort (Lv. 51–60): vulkanische Hallen voller Gold und Feuer

| Datei | Gegner | Prompt |
|---|---|---|
| `salamander.png` | Feuersalamander | `fire salamander, orange-red lizard with glowing yellow spots, flames running along its back, ember particles` |
| `flame-elemental.png` | Flammenelementar | `flame elemental, humanoid made of roaring orange and yellow fire, dark burning core, floating, sparks` |
| `dragon.png` | Jungdrache | `young red dragon, red scales, golden belly plates, bat-like wings spread, horns, open jaws with teeth, long tail` |
| `demon.png` | Dämonenwächter | `demon guard, muscular red-skinned demon, curved black horns, spiked dark armor, holding a jagged halberd, glowing yellow eyes` |
| `ancient-dragon.png` | Uralter Drache Ignaroth (Boss) | `boss: ancient colossal dragon, dark purple and black scales, glowing orange cracks like lava between scales, huge wings, many horns, fire in its open mouth, sitting on gold` |

## Dungeon: Verlassene Mine (Lv. 10–12): Stollen voller Erz

| Datei | Gegner | Prompt |
|---|---|---|
| `mine-rat.png` | Minenratte | `big mine rat wearing a tiny miner helmet with a lit lantern, brown dusty fur, red eyes` |
| `kobold.png` | Kobold-Sprengmeister | `kobold demolitionist, small grey-skinned creature with big ears, leather vest and goggles, holding a lit round bomb with a sparkling fuse` |
| `pit-spider.png` | Grubenspinne | `broad brown pit spider with glowing orange crystals growing on its back, yellow eyes, thick hairy legs` |
| `ore-king.png` | Erzkönig Grimmbart (Boss) | `boss: dwarf king, stout dwarf with a big braided red beard, golden crown, heavy iron armor, wielding a massive pickaxe` |

## Dungeon: Versunkener Tempel (Lv. 25–27): Tempel im Wüstensand

| Datei | Gegner | Prompt |
|---|---|---|
| `temple-guardian.png` | Tempelwächter | `temple guardian statue come to life, black jackal-headed warrior of stone and gold, glowing turquoise eyes, holding a spear, egyptian style` |
| `cobra-priest.png` | Kobra-Priester | `cobra priest, giant upright golden cobra with a wide hood, golden collar with blue gems, red eyes, egyptian style` |
| `mummy.png` | Mumie | `mummy, wrapped in old beige bandages, arms stretched forward, one glowing turquoise eye visible through the wraps` |
| `high-priestess.png` | Hohepriesterin Neferet (Boss) | `boss: undead egyptian high priestess, dark skin, white robe, gold and blue striped headdress, golden jewelry, holding an ankh staff, glowing magic` |

## Dungeon: Gewitterturm (Lv. 40–42): Turm über den Wolken mit einem gefangenen Sturm

| Datei | Gegner | Prompt |
|---|---|---|
| `thunder-elemental.png` | Gewitterelementar | `thunder elemental, living storm cloud with angry glowing white eyes, lightning bolts crackling below it, floating` |
| `gargoyle.png` | Steingargoyle | `stone gargoyle crouching, grey stone skin, horns, bat wings, claws, glowing yellow eyes` |
| `lightning-caller.png` | Blitzbeschwörer | `lightning caller mage in a deep blue robe, long white beard, raising a crackling orb of lightning above his head` |
| `storm-lord.png` | Sturmfürst Kaelthar (Boss) | `boss: storm lord, tall armored figure in pale blue and white, horned helmet, billowing storm cape, floating above crackling lightning, holding a lightning spear` |

## Dungeon: Abgrund der Leere (Lv. 60): wo die Welt endet

| Datei | Gegner | Prompt |
|---|---|---|
| `void-crawler.png` | Leerenkriecher | `void crawler, segmented insectoid creature with many legs, dark purple chitin, glowing cyan spots, eyeless head with mandibles` |
| `shadow-demon.png` | Schattendämon | `shadow demon, horned humanoid made of black smoke and darkness, long claws, glowing cyan eyes, rising from violet void flames` |
| `soul-eater.png` | Seelenfresser | `soul eater, huge ghostly floating maw, dark purple spectral body, mouth full of glowing cyan trapped souls, pink glowing eyes` |
| `void-lord.png` | Leerenfürst Xal'Zar (Boss) | `boss: void lord, enormous shadow mass with three glowing cyan eyes, a wide maw of teeth, writhing purple tentacles, cosmic stars inside its body` |

## Koop-Bosse

| Datei | Gegner | Prompt |
|---|---|---|
| `hydra.png` | Sumpfhydra | `boss: swamp hydra, three serpent heads on long necks, dark green scales, heavy body, toxic green breath, yellow eyes` |
| `frost-giant.png` | Frostriese Hrimgar | `boss: frost giant, enormous humanoid of glacier ice, crown of ice spikes, frosty beard, massive fists, glowing cyan eyes` |
| `world-eater.png` | Weltenverschlinger | `boss: world eater, colossal gaping maw from the void, rows of teeth, many glowing eyes, purple and red tentacles, cosmic darkness` |
