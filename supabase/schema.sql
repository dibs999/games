-- Tabelle für die Spielerprofile aller Spiele (Wordle, Sudoku, …). Jedes Spiel hat einen Abschnitt im JSON-Feld "data".
-- Im Supabase-Dashboard unter "SQL Editor" einfügen und auf "Run" klicken.
--
-- Die Größe eines Profils ist auf rund 20 KB begrenzt (aktuell reichen etwa 7–12 KB). Kommen weitere Spiele dazu,
-- lässt sich die Grenze so anheben:
--   alter table public.profiles drop constraint profiles_data_check;
--   alter table public.profiles add constraint profiles_data_check
--     check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 100000);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 20),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Jeder Name nur einmal (Groß-/Kleinschreibung egal).
create unique index if not exists profiles_name_unique on public.profiles (lower(btrim(name)));

alter table public.profiles enable row level security;

-- Ohne Anmeldung: Jeder mit dem Link darf Profile sehen, anlegen und Spielstände speichern.
-- Löschen ist absichtlich nicht erlaubt (nur über das Supabase-Dashboard).
drop policy if exists "Profile lesen" on public.profiles;
create policy "Profile lesen" on public.profiles
  for select to anon using (true);

drop policy if exists "Profile anlegen" on public.profiles;
create policy "Profile anlegen" on public.profiles
  for insert to anon with check (true);

drop policy if exists "Spielstand speichern" on public.profiles;
create policy "Spielstand speichern" on public.profiles
  for update to anon using (true) with check (true);

-- Der Name soll beim Speichern des Spielstands nicht verändert werden können.
revoke update on public.profiles from anon;
grant update (data, updated_at) on public.profiles to anon;
grant select, insert on public.profiles to anon;
