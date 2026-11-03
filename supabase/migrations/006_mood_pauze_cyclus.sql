-- =====================================================================
-- LockedIn — pauzedagen, mood, reacties (hartje / denk aan je) en cyclus
-- Plak dit in Supabase > SQL Editor > New query en klik op "Run".
-- Veilig om opnieuw te draaien.
-- =====================================================================

-- ---------- Pauzedagen (groep ziet alleen DAT, nooit waarom) ----------
create table if not exists public.pause_days (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  group_id uuid not null references public.groups on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);
create index if not exists pause_days_group on public.pause_days (group_id, day);
alter table public.pause_days enable row level security;

drop policy if exists "pause read" on public.pause_days;
create policy "pause read" on public.pause_days for select using (public.is_member(group_id));
drop policy if exists "pause insert" on public.pause_days;
create policy "pause insert" on public.pause_days for insert
  with check (
    user_id = auth.uid() and public.is_member(group_id)
    and day between public.today_nl() - 2 and public.today_nl() + 14
  );
drop policy if exists "pause delete" on public.pause_days;
create policy "pause delete" on public.pause_days for delete
  using (user_id = auth.uid() and day >= public.today_nl() - 2);

-- Maximaal 2 pauzedagen per week (ma t/m zo)
create or replace function public.guard_pause_days() returns trigger
language plpgsql set search_path = public as $$
begin
  if (select count(*) from pause_days
      where user_id = new.user_id
        and date_trunc('week', day) = date_trunc('week', new.day)) >= 2 then
    raise exception 'Je kunt maximaal 2 pauzedagen per week nemen';
  end if;
  return new;
end; $$;
drop trigger if exists guard_pause_days on public.pause_days;
create trigger guard_pause_days before insert on public.pause_days
  for each row execute function public.guard_pause_days();

-- ---------- Mood (eigen rij = alles; groep ziet alleen gedeelde gezichtjes) ----------
create table if not exists public.moods (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  group_id uuid not null references public.groups on delete cascade,
  day date not null,
  score int not null check (score between 1 and 5),
  tags text[] not null default '{}',
  note text check (note is null or char_length(note) <= 500),
  shared boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.moods enable row level security;
drop policy if exists "moods own" on public.moods;
create policy "moods own" on public.moods for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_member(group_id) and day <= public.today_nl());

-- Alleen gedeelde gezichtjes van de groep (geen labels, geen notitie)
create or replace function public.group_moods(gid uuid)
returns table (user_id uuid, day date, score int)
language sql stable security definer set search_path = public as $$
  select m.user_id, m.day, m.score
  from moods m
  where m.group_id = gid and m.shared and public.is_member(gid);
$$;

-- ---------- Reacties: high five, hartje, denk aan je ----------
alter table public.cheers add column if not exists kind text not null default 'highfive';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cheers_kind_check') then
    alter table public.cheers add constraint cheers_kind_check check (kind in ('highfive', 'heart', 'thinking'));
  end if;
  -- primaire sleutel uitbreiden zodat je meerdere soorten reacties kunt geven
  if not exists (
    select 1 from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conname = 'cheers_pkey' and a.attname = 'kind'
  ) then
    alter table public.cheers drop constraint cheers_pkey;
    alter table public.cheers add primary key (from_user, to_user, day, kind);
  end if;
end $$;

-- ---------- Cyclus & lichaam (strikt privé) ----------
create table if not exists public.private_settings (
  user_id uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  track_period boolean not null default false,
  track_sex boolean not null default false,
  cycle_length int check (cycle_length is null or cycle_length between 18 and 60),
  period_length int check (period_length is null or period_length between 1 and 14)
);
alter table public.private_settings enable row level security;
drop policy if exists "settings own" on public.private_settings;
create policy "settings own" on public.private_settings for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.body_days (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  day date not null,
  period boolean not null default false,
  flow text check (flow is null or flow in ('spotting', 'licht', 'normaal', 'hevig')),
  symptoms text[] not null default '{}',
  sex boolean not null default false,
  sex_protected boolean,
  note text check (note is null or char_length(note) <= 500),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.body_days enable row level security;
drop policy if exists "body own" on public.body_days;
create policy "body own" on public.body_days for all
  using (user_id = auth.uid()) with check (user_id = auth.uid() and day <= public.today_nl());

-- ---------- Realtime ----------
do $$
declare t text;
begin
  foreach t in array array['pause_days'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
