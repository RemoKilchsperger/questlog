import { useEffect, useState, type ReactNode } from "react";
import { BattleScreen } from "./components/BattleScreen";
import { CharacterSheet, type CharacterView } from "./components/CharacterSheet";
import { CloudDialogs } from "./components/CloudAccount";
import { FriendsScreen, useIncomingFriendRequests } from "./components/FriendsScreen";
import { Leaderboard } from "./components/Leaderboard";
import { EquipmentScreen } from "./components/EquipmentScreen";
import { GameIcon } from "./components/GameIcon";
import { HelpScreen } from "./components/HelpScreen";
import { HeroNameDialog } from "./components/HeroNameDialog";
import { Hud } from "./components/Hud";
import { QuestScreen, useReadyQuestCount } from "./components/QuestScreen";
import { RewardToast } from "./components/RewardToast";
import { AchievementToast } from "./components/Achievements";
import { AlchemistScreen } from "./components/AlchemistScreen";
import { ShopScreen } from "./components/ShopScreen";
import { SkillTree } from "./components/SkillTree";
import { SmithScreen } from "./components/SmithScreen";
import { TradeScreen } from "./components/TradeScreen";
import { VillageScreen } from "./components/VillageScreen";
import { useNow } from "./components/useNow";
import { unspentSkillPoints } from "./domain/skills";
import { visitorNeedsAttention } from "./domain/visitors";
import { useGameStore } from "./store/gameStore";
import { useCoopStore } from "./coop/coopStore";
import { isLobbyCode } from "./coop/protocol";
import { useCloudStore } from "./cloud/cloudStore";
import { useFriendStore } from "./friends/friendStore";

type Tab = "quests" | "character" | "skills" | "equipment" | "village" | "battle" | "leaderboard" | "friends" | "help";
/** Untermenü des Dorfs */
type VillageView = "build" | "merchant" | "smith" | "alchemist" | "trade";

/** Einladungslink zu einer Koop-Lobby: #/koop/<code> – null, wenn die Adresse keiner ist. */
function readCoopInvite(): string | null {
  const match = window.location.hash.match(/^#\/koop\/([A-Za-z0-9]{6})$/);
  const code = match?.[1].toUpperCase() ?? null;
  return code && isLobbyCode(code) ? code : null;
}

/** Teilbare Adressen: #/rangliste, #/held/<name> und #/freunde öffnen Rangliste, Profil bzw. Freundesliste. */
function readRoute(): { tab: "leaderboard" | "friends"; username: string | null } | null {
  const profile = window.location.hash.match(/^#\/held\/([^/?]+)$/);
  if (profile) return { tab: "leaderboard", username: decodeURIComponent(profile[1]) };
  if (window.location.hash === "#/rangliste") return { tab: "leaderboard", username: null };
  if (window.location.hash === "#/freunde") return { tab: "friends", username: null };
  return null;
}

export default function App() {
  const [tab, setTabState] = useState<Tab>(() => (readCoopInvite() ? "battle" : (readRoute()?.tab ?? "quests")));
  const [profileName, setProfileName] = useState<string | null>(() => readRoute()?.username ?? null);
  const [villageView, setVillageView] = useState<VillageView>("build");
  const smithBuilt = useGameStore((s) => s.village.smith > 0);
  const alchemistBuilt = useGameStore((s) => s.village.alchemist > 0);
  const [characterView, setCharacterView] = useState<CharacterView>("details");
  const newAchievements = useGameStore((s) => s.achievementQueue.length);
  const skillPoints = useGameStore((s) => unspentSkillPoints(s.character));
  const readyQuests = useReadyQuestCount();
  const friendRequests = useIncomingFriendRequests();
  const userId = useCloudStore((s) => s.session?.user.id);
  // Freundesliste beim Login laden – für das Abzeichen an „Freunde“
  useEffect(() => {
    if (userId) void useFriendStore.getState().load();
  }, [userId]);
  const visitorWaiting = useGameStore((s) => visitorNeedsAttention(s.visitors));
  const refreshVisitors = useGameStore((s) => s.refreshVisitors);
  const refreshRaids = useGameStore((s) => s.refreshRaids);
  const raidComing = useGameStore((s) => s.raids.current !== null);
  const minute = Math.floor(useNow(60_000).getTime() / 60_000);
  // Besucher und Banden kommen und gehen auch, während man woanders ist – für das Abzeichen am Dorf-Tab
  useEffect(() => refreshVisitors(), [refreshVisitors, minute]);
  useEffect(() => refreshRaids(), [refreshRaids, minute]);

  // Einladungslink: der Lobby beitreten und die Adresse wieder aufräumen
  useEffect(() => {
    const join = () => {
      const code = readCoopInvite();
      if (!code) return;
      history.replaceState(null, "", window.location.pathname + window.location.search);
      setTabState("battle");
      useCoopStore.getState().joinLobby(code);
    };
    join();
    window.addEventListener("hashchange", join);
    return () => window.removeEventListener("hashchange", join);
  }, []);

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

  /** Tab wechseln – die Adresse zeigt nur bei Rangliste und Freunden etwas an. */
  const setTab = (next: Tab) => {
    if (next === "leaderboard") {
      window.location.hash = "#/rangliste";
    } else if (next === "friends") {
      window.location.hash = "#/freunde";
    } else if (readRoute()) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
      setProfileName(null);
    }
    setTabState(next);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-4 sm:pt-6">
      <button onClick={() => setTab("quests")} className="mx-auto mb-4 block" aria-label="Questlog – zu den Quests">
        <img src="/logo.svg" alt="Questlog" width={336} height={96} className="pixelated h-16 w-auto sm:h-24" />
      </button>
      <Hud onOpenCharacter={() => setTab("character")} />

      <nav className="mt-6 flex flex-wrap gap-2" aria-label="Bereiche">
        <TabButton active={tab === "quests"} onClick={() => setTab("quests")} icon="📜">
          Quests
          {readyQuests > 0 && (
            <span className="num ml-1.5 rounded-full bg-xp px-1.5 text-sm text-night-950">{readyQuests}</span>
          )}
        </TabButton>
        <TabButton active={tab === "character"} onClick={() => setTab("character")} icon="🧙">
          Charakter
        </TabButton>
        <TabButton active={tab === "skills"} onClick={() => setTab("skills")} icon="🌳">
          Skills
          {skillPoints > 0 && (
            <span className="num ml-1.5 rounded-full bg-xp px-1.5 text-sm text-night-950">{skillPoints}</span>
          )}
        </TabButton>
        <TabButton active={tab === "equipment"} onClick={() => setTab("equipment")} icon="🎒">
          Ausrüstung
        </TabButton>
        <TabButton active={tab === "village"} onClick={() => setTab("village")} icon="🏘️">
          Dorf
          {raidComing ? (
            <span className="ml-1.5 rounded-full bg-danger px-1.5 text-sm text-night-950" title="Eine Bande zieht aufs Dorf zu">
              !
            </span>
          ) : (
            visitorWaiting && (
              <span className="ml-1.5 rounded-full bg-gold px-1.5 text-sm text-night-950" title="Ein Besucher wartet auf dich">
                !
              </span>
            )
          )}
        </TabButton>
        <TabButton active={tab === "battle"} onClick={() => setTab("battle")} icon="⚔️">
          Kampf
        </TabButton>
        <TabButton active={tab === "leaderboard"} onClick={() => setTab("leaderboard")} icon="🏆">
          Rangliste
        </TabButton>
        <TabButton active={tab === "friends"} onClick={() => setTab("friends")} icon="👥">
          Freunde
          {friendRequests > 0 && (
            <span className="num ml-1.5 rounded-full bg-xp px-1.5 text-sm text-night-950" title="Offene Freundschaftsanfragen">
              {friendRequests}
            </span>
          )}
        </TabButton>
        <TabButton active={tab === "help"} onClick={() => setTab("help")} icon="❓">
          Hilfe
        </TabButton>
      </nav>

      {tab === "character" && (
        <nav className="mt-3 flex flex-wrap gap-2 border-l-4 border-gold/40 pl-3" aria-label="Charakter">
          <SubTabButton active={characterView === "details"} onClick={() => setCharacterView("details")} icon="🧙">
            Details
          </SubTabButton>
          <SubTabButton active={characterView === "achievements"} onClick={() => setCharacterView("achievements")} icon="🏆">
            Erfolge{newAchievements > 0 && <span className="ml-1 text-legendary">●</span>}
          </SubTabButton>
          <SubTabButton active={characterView === "collection"} onClick={() => setCharacterView("collection")} icon="👑">
            Boss-Sammlung
          </SubTabButton>
        </nav>
      )}

      {tab === "village" && (
        <nav className="mt-3 flex flex-wrap gap-2 border-l-4 border-gold/40 pl-3" aria-label="Dorf">
          <SubTabButton active={villageView === "build"} onClick={() => setVillageView("build")} icon="🏗️">
            Ausbau
          </SubTabButton>
          <SubTabButton active={villageView === "merchant"} onClick={() => setVillageView("merchant")} icon="🏪">
            Händler
          </SubTabButton>
          <SubTabButton active={villageView === "smith"} onClick={() => setVillageView("smith")} icon="⚒️">
            Schmied{!smithBuilt && <GameIcon icon="🔒" className="ml-1" />}
          </SubTabButton>
          <SubTabButton active={villageView === "alchemist"} onClick={() => setVillageView("alchemist")} icon="⚗️">
            Alchemist{!alchemistBuilt && <GameIcon icon="🔒" className="ml-1" />}
          </SubTabButton>
          <SubTabButton active={villageView === "trade"} onClick={() => setVillageView("trade")} icon="🤝">
            Tausch
          </SubTabButton>
        </nav>
      )}

      <main className="mt-4">
        {tab === "quests" && <QuestScreen />}
        {tab === "character" && <CharacterSheet view={characterView} />}
        {tab === "skills" && <SkillTree />}
        {tab === "equipment" && <EquipmentScreen />}
        {tab === "village" &&
          (villageView === "build" ? (
            <VillageScreen onDefend={() => setTab("battle")} />
          ) : villageView === "merchant" ? (
            <ShopScreen />
          ) : villageView === "smith" ? (
            <SmithScreen onOpenVillage={() => setVillageView("build")} />
          ) : villageView === "trade" ? (
            <TradeScreen />
          ) : (
            <AlchemistScreen onOpenVillage={() => setVillageView("build")} />
          ))}
        {tab === "battle" && <BattleScreen />}
        {tab === "leaderboard" && <Leaderboard username={profileName} />}
        {tab === "friends" && <FriendsScreen onJoined={() => setTab("battle")} />}
        {tab === "help" && <HelpScreen />}
      </main>

      <RewardToast />
      <AchievementToast />
      <CloudDialogs />
      <HeroNameDialog />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`font-pixel inline-flex items-center gap-2 rounded-md border-2 px-3 py-1.5 text-lg transition ${
        active
          ? "border-gold bg-night-800 text-gold"
          : "border-night-700 bg-night-900 text-muted hover:text-parchment"
      }`}
    >
      <GameIcon icon={icon} scale={2} />
      {children}
    </button>
  );
}

function SubTabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`font-pixel inline-flex items-center gap-1.5 rounded-md border-2 px-3 py-1 transition ${
        active ? "border-gold/70 bg-night-800 text-gold" : "border-night-700 bg-night-900 text-muted hover:text-parchment"
      }`}
    >
      <GameIcon icon={icon} />
      {children}
    </button>
  );
}
