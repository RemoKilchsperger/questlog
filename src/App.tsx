import { useEffect, useState, type ReactNode } from "react";
import { BattleScreen } from "./components/BattleScreen";
import { BonusQuests } from "./components/BonusQuests";
import { CharacterSheet } from "./components/CharacterSheet";
import { CloudDialogs } from "./components/CloudAccount";
import { Leaderboard } from "./components/Leaderboard";
import { EquipmentScreen } from "./components/EquipmentScreen";
import { Hud } from "./components/Hud";
import { QuestBoard } from "./components/QuestBoard";
import { QuestForm } from "./components/QuestForm";
import { RewardToast } from "./components/RewardToast";
import { ShopScreen } from "./components/ShopScreen";
import { SkillTree } from "./components/SkillTree";
import { SmithScreen } from "./components/SmithScreen";
import { unspentSkillPoints } from "./domain/skills";
import { useGameStore } from "./store/gameStore";

type Tab = "quests" | "character" | "skills" | "equipment" | "village" | "battle" | "leaderboard";
/** Untermenü des Dorfs */
type VillageView = "merchant" | "smith";

/** Teilbare Adressen: #/rangliste und #/held/<name> öffnen Rangliste bzw. Profil. */
function readRoute(): { tab: "leaderboard"; username: string | null } | null {
  const profile = window.location.hash.match(/^#\/held\/([^/?]+)$/);
  if (profile) return { tab: "leaderboard", username: decodeURIComponent(profile[1]) };
  if (window.location.hash === "#/rangliste") return { tab: "leaderboard", username: null };
  return null;
}

export default function App() {
  const [tab, setTabState] = useState<Tab>(() => readRoute()?.tab ?? "quests");
  const [profileName, setProfileName] = useState<string | null>(() => readRoute()?.username ?? null);
  const [villageView, setVillageView] = useState<VillageView>("merchant");
  const skillPoints = useGameStore((s) => unspentSkillPoints(s.character));

  useEffect(() => {
    const onHash = () => {
      const route = readRoute();
      if (!route) return;
      setTabState(route.tab);
      setProfileName(route.username);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  /** Tab wechseln – die Adresse zeigt nur bei der Rangliste etwas an. */
  const setTab = (next: Tab) => {
    if (next === "leaderboard") {
      window.location.hash = "#/rangliste";
    } else if (readRoute()) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
      setProfileName(null);
    }
    setTabState(next);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-4 sm:pt-8">
      <Hud onOpenCharacter={() => setTab("character")} />

      <nav className="mt-6 flex flex-wrap gap-2" aria-label="Bereiche">
        <TabButton active={tab === "quests"} onClick={() => setTab("quests")}>
          📜 Quests
        </TabButton>
        <TabButton active={tab === "character"} onClick={() => setTab("character")}>
          🧙 Charakter
        </TabButton>
        <TabButton active={tab === "skills"} onClick={() => setTab("skills")}>
          🌳 Skills
          {skillPoints > 0 && (
            <span className="num ml-1.5 rounded-full bg-xp px-1.5 text-sm text-night-950">{skillPoints}</span>
          )}
        </TabButton>
        <TabButton active={tab === "equipment"} onClick={() => setTab("equipment")}>
          🎒 Ausrüstung
        </TabButton>
        <TabButton active={tab === "village"} onClick={() => setTab("village")}>
          🏘️ Dorf
        </TabButton>
        <TabButton active={tab === "battle"} onClick={() => setTab("battle")}>
          ⚔️ Kampf
        </TabButton>
        <TabButton active={tab === "leaderboard"} onClick={() => setTab("leaderboard")}>
          🏆 Rangliste
        </TabButton>
      </nav>

      {tab === "village" && (
        <nav className="mt-3 flex flex-wrap gap-2 border-l-4 border-gold/40 pl-3" aria-label="Dorf">
          <SubTabButton active={villageView === "merchant"} onClick={() => setVillageView("merchant")}>
            🏪 Händler
          </SubTabButton>
          <SubTabButton active={villageView === "smith"} onClick={() => setVillageView("smith")}>
            ⚒️ Schmied
          </SubTabButton>
        </nav>
      )}

      <main className="mt-4">
        {tab === "quests" && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_1fr]">
            <QuestForm />
            <div className="flex min-w-0 flex-col gap-4">
              <BonusQuests />
              <QuestBoard />
            </div>
          </div>
        )}
        {tab === "character" && <CharacterSheet />}
        {tab === "skills" && <SkillTree />}
        {tab === "equipment" && <EquipmentScreen />}
        {tab === "village" && (villageView === "merchant" ? <ShopScreen /> : <SmithScreen />)}
        {tab === "battle" && <BattleScreen />}
        {tab === "leaderboard" && <Leaderboard username={profileName} />}
      </main>

      <RewardToast />
      <CloudDialogs />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`font-pixel rounded-md border-2 px-4 py-2 text-lg transition ${
        active
          ? "border-gold bg-night-800 text-gold"
          : "border-night-700 bg-night-900 text-muted hover:text-parchment"
      }`}
    >
      {children}
    </button>
  );
}

function SubTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`font-pixel rounded-md border-2 px-3 py-1 transition ${
        active ? "border-gold/70 bg-night-800 text-gold" : "border-night-700 bg-night-900 text-muted hover:text-parchment"
      }`}
    >
      {children}
    </button>
  );
}
