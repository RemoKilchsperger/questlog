-- Questlog – Datenbank für Cloud-Spielstand, öffentliche Profile und Rangliste.
-- Einmal im Supabase-Dashboard unter "SQL Editor" ausführen.
--
-- saves            privat: der komplette Spielstand (inkl. Quest-Titel) – nur für den Besitzer
-- public_profiles  öffentlich: nur Spielwerte (Level, Ausrüstung, Sammlung …) – für Profile und Rangliste
--
-- Stufe A: Der Browser rechnet und speichert, die Datenbank vertraut ihm.

-- ─── Privater Spielstand ────────────────────────────────────────────────────
create table if not exists public.saves (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  -- genau der Inhalt von localStorage["questlog-save"]: { state, version }
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.saves enable row level security;

drop policy if exists "Eigenen Spielstand lesen" on public.saves;
create policy "Eigenen Spielstand lesen" on public.saves
  for select using (auth.uid() = user_id);

drop policy if exists "Eigenen Spielstand anlegen" on public.saves;
create policy "Eigenen Spielstand anlegen" on public.saves
  for insert with check (auth.uid() = user_id);

drop policy if exists "Eigenen Spielstand ändern" on public.saves;
create policy "Eigenen Spielstand ändern" on public.saves
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── Öffentliches Profil ────────────────────────────────────────────────────
create table if not exists public.public_profiles (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  -- eindeutiger Name für die Profil-Adresse (#/held/<username>)
  username       text not null unique
                 check (username ~ '^[a-z0-9_-]{3,20}$'),
  hero_name      text not null default 'Held' check (char_length(hero_name) <= 24),
  level          int  not null default 1,
  total_xp       int  not null default 0,
  quests_done    int  not null default 0,
  boss_items     int  not null default 0,
  -- Momentaufnahme für die Profilseite: Ausrüstung, Attribute, Sammlung, Skills
  snapshot       jsonb not null default '{}'::jsonb,
  updated_at     timestamptz not null default now()
);

alter table public.public_profiles enable row level security;

drop policy if exists "Profile sind öffentlich" on public.public_profiles;
create policy "Profile sind öffentlich" on public.public_profiles
  for select using (true);

drop policy if exists "Eigenes Profil anlegen" on public.public_profiles;
create policy "Eigenes Profil anlegen" on public.public_profiles
  for insert with check (auth.uid() = user_id);

drop policy if exists "Eigenes Profil ändern" on public.public_profiles;
create policy "Eigenes Profil ändern" on public.public_profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Rangliste: schnell nach XP sortieren
create index if not exists public_profiles_rank on public.public_profiles (total_xp desc);
