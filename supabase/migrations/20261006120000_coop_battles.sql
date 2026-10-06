-- Koop-Kampf, Etappe 2 (docs/koop-kampf.md): gemeinsame Kämpfe liegen in der
-- Datenbank, die Edge Function "coop" ist die einzige, die sie schreibt.
-- Nur hinzufügend – bestehende Tabellen bleiben unverändert.
-- Ausführen: Supabase-Dashboard → SQL Editor (oder `supabase db push`).

create table if not exists public.coop_battles (
  id          uuid primary key,
  -- Einladungscode (6 Zeichen ohne verwechselbare wie 0/O, 1/I/L)
  code        text not null unique check (code ~ '^[A-HJ-KM-NP-Z2-9]{6}$'),
  host_id     uuid not null references auth.users (id) on delete cascade,
  boss_id     text not null,
  phase       text not null default 'lobby' check (phase in ('lobby', 'battle', 'finished')),
  -- Teilnehmer samt Kampfwerten (vom Server aus dem Spielstand berechnet)
  members     jsonb not null default '[]'::jsonb,
  -- für die Zugriffsregel: wer den Kampf lesen darf
  player_ids  uuid[] not null default '{}',
  -- Kampfzustand (CoopBattleState), gewählte Aktionen, Ereignisse der letzten Runde
  state       jsonb,
  actions     jsonb not null default '{}'::jsonb,
  last_events jsonb not null default '[]'::jsonb,
  -- steigt bei jeder Änderung: schützt vor gleichzeitigem Überschreiben
  version     int not null default 1,
  updated_at  timestamptz not null default now()
);

alter table public.coop_battles enable row level security;

-- Lesen dürfen nur Teilnehmer. Schreiben darf niemand direkt – nur die
-- Edge Function mit dem Service-Schlüssel (der RLS umgeht).
drop policy if exists "Teilnehmer lesen ihren Koop-Kampf" on public.coop_battles;
create policy "Teilnehmer lesen ihren Koop-Kampf" on public.coop_battles
  for select using (auth.uid() = any (player_ids));

-- Laufende Kämpfe eines Spielers schnell finden (Wiederverbinden)
create index if not exists coop_battles_players on public.coop_battles using gin (player_ids);
-- Aufräumen alter Kämpfe
create index if not exists coop_battles_updated on public.coop_battles (updated_at);

-- Änderungen live an die Teilnehmer schicken (Supabase Realtime, beachtet RLS)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'coop_battles'
  ) then
    alter publication supabase_realtime add table public.coop_battles;
  end if;
end $$;
