import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { useCloudStore } from "../cloud/cloudStore";
import { fetchLeaderboard, fetchProfile, fetchRank, LEADERBOARD_SIZE } from "../cloud/profiles";
import type { PublicProfile } from "../cloud/publicProfile";
import { cloudEnabled } from "../cloud/supabase";
import { BOSS_ITEMS, getItemStats, SLOT_ICONS, SLOT_LABELS } from "../domain/items";
import { STAT_LABELS } from "../domain/rewards";
import type { EquipSlot, StatKey } from "../domain/types";
import { BossCollection } from "./CharacterSheet";
import { CoopRecord } from "./CoopRecord";
import { ItemIcon } from "./ItemIcon";
import { itemName } from "./itemUi";
import { ItemTooltip } from "./ItemTooltip";
import { PixelAvatar } from "./PixelAvatar";
import { HeroClassBadge } from "./HeroClassInfo";

/** Öffentliche Rangliste – oder, mit `username`, die Profilseite eines Helden. */
export function Leaderboard({ username }: { username: string | null }) {
  if (!cloudEnabled) {
    return (
      <section className="panel p-5">
        <h2 className="font-pixel text-2xl">Rangliste</h2>
        <p className="mt-2 text-sm text-muted">
          Die Online-Funktionen sind noch nicht eingerichtet. Sobald Supabase verbunden ist (siehe{" "}
          <code>.env.example</code>), erscheinen hier alle Helden.
        </p>
      </section>
    );
  }
  return username ? <ProfilePage username={username} /> : <Ranking />;
}

function Ranking() {
  const [profiles, setProfiles] = useState<PublicProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const myName = useCloudStore((s) => s.username);

  useEffect(() => {
    fetchLeaderboard()
      .then(setProfiles)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <section className="panel p-5">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-pixel text-2xl">🏆 Rangliste</h2>
        <MyRank />
      </div>
      <p className="mb-4 text-sm text-muted">
        Die {LEADERBOARD_SIZE} erfahrensten Helden. Klicke auf einen Namen, um das Profil anzusehen.
      </p>
      {error && <p className="text-danger">Rangliste konnte nicht geladen werden: {error}</p>}
      {!profiles && !error && <p className="text-muted">Wird geladen …</p>}
      {profiles?.length === 0 && <p className="text-muted">Noch niemand da – sei der Erste!</p>}
      <ol className="flex flex-col gap-2">
        {profiles?.map((p, i) => (
          <motion.li
            key={p.username}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, 20) * 0.02 }}
          >
            <a
              href={`#/held/${p.username}`}
              className={`flex items-center gap-3 rounded-md border-2 bg-night-800 p-2 hover:border-gold/70 ${
                p.username === myName ? "border-gold/60" : "border-night-700"
              }`}
            >
              <span className={`num w-8 text-center text-lg ${i < 3 ? "text-gold" : "text-muted"}`}>
                {i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}
              </span>
              <span className="rounded bg-night-950/60 p-0.5">
                <PixelAvatar size={40} equipment={p.snapshot.equipment} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {p.hero_name} <span className="text-xs font-normal text-muted">@{p.username}</span>
                </span>
                <span className="block text-xs text-muted">{p.snapshot.title}</span>
              </span>
              <span className="text-right text-xs text-muted">
                <span className="font-pixel block text-base text-gold">Lv. {p.level}</span>
                <span className="num">{p.quests_done}</span> Quests · 👑 <span className="num">{p.boss_items}</span>
              </span>
            </a>
          </motion.li>
        ))}
      </ol>
    </section>
  );
}

/** Eigener Platz, wenn man angemeldet ist und ein Profil hat. */
function MyRank() {
  const myName = useCloudStore((s) => s.username);
  const [rank, setRank] = useState<number | null>(null);
  useEffect(() => {
    if (!myName) return;
    fetchProfile(myName)
      .then((p) => (p ? fetchRank(p.total_xp) : null))
      .then(setRank)
      .catch(() => setRank(null));
  }, [myName]);
  if (!myName || rank === null) return null;
  return (
    <a href={`#/held/${myName}`} className="text-sm text-gold hover:underline">
      Dein Platz: <span className="num">{rank}</span>
    </a>
  );
}

const SLOT_ORDER: EquipSlot[] = ["head", "chest", "arms", "legs", "feet", "weapon1", "weapon2"];

function ProfilePage({ username }: { username: string }) {
  const [profile, setProfile] = useState<PublicProfile | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setProfile(undefined);
    fetchProfile(username)
      .then(setProfile)
      .catch((e: Error) => setError(e.message));
  }, [username]);

  const back = (
    <a href="#/rangliste" className="text-sm text-muted hover:text-parchment">
      ← Zur Rangliste
    </a>
  );
  if (error) return <section className="panel p-5">{back}<p className="mt-2 text-danger">{error}</p></section>;
  if (profile === undefined) return <section className="panel p-5">{back}<p className="mt-2 text-muted">Wird geladen …</p></section>;
  if (profile === null) {
    return (
      <section className="panel p-5">
        {back}
        <p className="mt-2">Es gibt keinen Helden namens „{username}“.</p>
      </section>
    );
  }

  const { snapshot } = profile;
  const statEntries = Object.entries(snapshot.stats) as [StatKey, number][];
  return (
    <div className="flex flex-col gap-4">
      {back}
      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <section className="panel flex flex-col items-center gap-2 p-5 text-center">
          <div className="rounded-lg bg-night-800 p-4">
            <PixelAvatar size={144} equipment={snapshot.equipment} />
          </div>
          <p className="font-pixel text-3xl">{profile.hero_name}</p>
          <p className="text-xs text-muted">@{profile.username}</p>
          <p className="font-pixel text-lg text-gold">
            Level <span className="num">{profile.level}</span> · {snapshot.title}
          </p>
          <HeroClassBadge equipment={snapshot.equipment} />
          <p className="text-sm text-muted">
            <span className="num text-parchment">{profile.total_xp}</span> XP ·{" "}
            <span className="num text-parchment">{profile.quests_done}</span> Quests erledigt
          </p>
          <p className="text-xs text-muted">Zuletzt aktiv: {new Date(profile.updated_at).toLocaleDateString("de-CH")}</p>
        </section>

        <div className="flex flex-col gap-4">
          <section className="panel p-5">
            <h2 className="font-pixel mb-3 text-2xl">Ausrüstung</h2>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {SLOT_ORDER.map((slot) => {
                const owned = snapshot.equipment[slot];
                const stats = owned ? getItemStats(owned) : null;
                return (
                  <li key={slot} className="flex items-center gap-2 rounded-md bg-night-800 p-2 text-xs">
                    {stats ? (
                      <ItemTooltip stats={stats}>
                        <span tabIndex={0}>
                          <ItemIcon def={stats.def} rarity={stats.rarity} size={32} />
                        </span>
                      </ItemTooltip>
                    ) : (
                      <span className="text-2xl opacity-30 grayscale" aria-hidden>
                        {SLOT_ICONS[slot]}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block text-muted">{SLOT_LABELS[slot]}</span>
                      <span className="block truncate">{stats ? itemName(stats) : "–"}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="panel p-5">
            <h2 className="font-pixel mb-3 text-2xl">Attribute</h2>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {statEntries.map(([key, value]) => (
                <li key={key} className="rounded-md bg-night-800 p-2 text-center">
                  <div className="num text-xl">{value}</div>
                  <div className="text-xs text-muted">{STAT_LABELS[key]}</div>
                </li>
              ))}
            </ul>
          </section>

          <div>
            <p className="mb-2 text-sm text-muted">
              Boss-Sammlung: <span className="num text-legendary">{snapshot.bossCollection.length}</span>/
              {BOSS_ITEMS.length}
            </p>
            <BossCollection collection={snapshot.bossCollection} />
          </div>
          <CoopRecord stats={snapshot.coop} />
        </div>
      </div>
    </div>
  );
}
