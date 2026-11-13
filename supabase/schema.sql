-- =====================================================================
-- De touwtjes in handen — databaseschema voor Supabase
-- Plak dit in Supabase > SQL Editor > New query en klik op "Run".
-- Het script is veilig om opnieuw te draaien.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Tabellen ----------

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  color text not null default '#2563eb',
  created_at timestamptz not null default now()
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  invite_code text not null unique default substr(md5(gen_random_uuid()::text), 1, 10),
  max_members int not null default 8,
  created_by uuid not null references auth.users,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  start_date date not null,
  end_date date not null,
  created_by uuid not null references auth.users,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists public.weekly_goals (
  challenge_id uuid not null references public.challenges on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  sessions_per_week int not null check (sessions_per_week between 1 and 14),
  primary key (challenge_id, user_id)
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  sport text not null check (sport in ('hardlopen', 'kracht', 'overig')),
  label text check (label is null or char_length(label) <= 60),
  activity_date date not null,
  duration_min int not null check (duration_min between 1 and 600),
  distance_km numeric(6, 2) check (distance_km is null or distance_km > 0),
  notes text check (notes is null or char_length(notes) <= 500),
  photo_path text,
  is_pr boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists activities_group_date on public.activities (group_id, activity_date);

create table if not exists public.kudos (
  activity_id uuid not null references public.activities on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (activity_id, user_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

-- ---------- Hulpfuncties (security definer om RLS-recursie te voorkomen) ----------

create or replace function public.is_member(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = gid and user_id = auth.uid());
$$;

create or replace function public.is_admin(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = gid and user_id = auth.uid() and role = 'admin');
$$;

create or replace function public.shares_group(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from group_members a join group_members b on a.group_id = b.group_id
    where a.user_id = auth.uid() and b.user_id = uid
  );
$$;

create or replace function public.activity_group(aid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select group_id from activities where id = aid;
$$;

create or replace function public.today_nl() returns date
language sql stable as $$ select (now() at time zone 'Europe/Amsterdam')::date; $$;

-- Groep aanmaken + maker wordt admin + eerste challenge
create or replace function public.create_group(
  p_name text, p_challenge_name text, p_start date, p_end date
) returns uuid
language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  if auth.uid() is null then raise exception 'Niet ingelogd'; end if;
  insert into groups (name, created_by) values (p_name, auth.uid()) returning id into gid;
  insert into group_members (group_id, user_id, role) values (gid, auth.uid(), 'admin');
  insert into challenges (group_id, name, start_date, end_date, created_by)
    values (gid, p_challenge_name, p_start, p_end, auth.uid());
  return gid;
end; $$;

-- Groepsinfo bekijken via uitnodigingscode (vóór lid worden)
create or replace function public.group_by_code(p_code text)
returns table (id uuid, name text, member_count bigint, max_members int)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, (select count(*) from group_members m where m.group_id = g.id), g.max_members
  from groups g where g.invite_code = p_code;
$$;

-- Lid worden via uitnodigingscode
create or replace function public.join_group(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare g groups%rowtype; n int;
begin
  if auth.uid() is null then raise exception 'Niet ingelogd'; end if;
  select * into g from groups where invite_code = p_code;
  if not found then raise exception 'Ongeldige uitnodigingslink'; end if;
  if exists (select 1 from group_members where group_id = g.id and user_id = auth.uid()) then
    return g.id;
  end if;
  select count(*) into n from group_members where group_id = g.id;
  if n >= g.max_members then raise exception 'Deze groep is vol'; end if;
  insert into group_members (group_id, user_id) values (g.id, auth.uid());
  return g.id;
end; $$;

-- Nieuwe uitnodigingscode (oude link werkt dan niet meer)
create or replace function public.reset_invite_code(gid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c text := substr(md5(gen_random_uuid()::text), 1, 10);
begin
  if not is_admin(gid) then raise exception 'Alleen admins'; end if;
  update groups set invite_code = c where id = gid;
  return c;
end; $$;

-- ---------- Row Level Security ----------

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.challenges enable row level security;
alter table public.weekly_goals enable row level security;
alter table public.activities enable row level security;
alter table public.kudos enable row level security;
alter table public.comments enable row level security;

drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select
  using (id = auth.uid() or public.shares_group(id));
drop policy if exists "profiles insert" on public.profiles;
create policy "profiles insert" on public.profiles for insert with check (id = auth.uid());
drop policy if exists "profiles update" on public.profiles;
create policy "profiles update" on public.profiles for update using (id = auth.uid());

drop policy if exists "groups read" on public.groups;
create policy "groups read" on public.groups for select using (public.is_member(id));
drop policy if exists "groups update" on public.groups;
create policy "groups update" on public.groups for update using (public.is_admin(id));

drop policy if exists "members read" on public.group_members;
create policy "members read" on public.group_members for select using (public.is_member(group_id));
drop policy if exists "members leave" on public.group_members;
create policy "members leave" on public.group_members for delete
  using (user_id = auth.uid() or public.is_admin(group_id));

drop policy if exists "challenges read" on public.challenges;
create policy "challenges read" on public.challenges for select using (public.is_member(group_id));
drop policy if exists "challenges insert" on public.challenges;
create policy "challenges insert" on public.challenges for insert
  with check (public.is_admin(group_id) and created_by = auth.uid());
drop policy if exists "challenges update" on public.challenges;
create policy "challenges update" on public.challenges for update using (public.is_admin(group_id));

drop policy if exists "goals read" on public.weekly_goals;
create policy "goals read" on public.weekly_goals for select
  using (exists (select 1 from public.challenges c where c.id = challenge_id and public.is_member(c.group_id)));
drop policy if exists "goals insert" on public.weekly_goals;
create policy "goals insert" on public.weekly_goals for insert
  with check (user_id = auth.uid() and exists (select 1 from public.challenges c where c.id = challenge_id and public.is_member(c.group_id)));
drop policy if exists "goals update" on public.weekly_goals;
create policy "goals update" on public.weekly_goals for update using (user_id = auth.uid());

-- Trainingen: alleen eigen, alleen in je eigen groep, en maximaal 2 dagen terug
drop policy if exists "activities read" on public.activities;
create policy "activities read" on public.activities for select using (public.is_member(group_id));
drop policy if exists "activities insert" on public.activities;
create policy "activities insert" on public.activities for insert
  with check (
    user_id = auth.uid() and public.is_member(group_id)
    and activity_date between public.today_nl() - 2 and public.today_nl()
  );
drop policy if exists "activities update" on public.activities;
create policy "activities update" on public.activities for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and activity_date between public.today_nl() - 2 and public.today_nl());
drop policy if exists "activities delete" on public.activities;
create policy "activities delete" on public.activities for delete using (user_id = auth.uid());

drop policy if exists "kudos read" on public.kudos;
create policy "kudos read" on public.kudos for select using (public.is_member(public.activity_group(activity_id)));
drop policy if exists "kudos insert" on public.kudos;
create policy "kudos insert" on public.kudos for insert
  with check (user_id = auth.uid() and public.is_member(public.activity_group(activity_id)));
drop policy if exists "kudos delete" on public.kudos;
create policy "kudos delete" on public.kudos for delete using (user_id = auth.uid());

drop policy if exists "comments read" on public.comments;
create policy "comments read" on public.comments for select using (public.is_member(public.activity_group(activity_id)));
drop policy if exists "comments insert" on public.comments;
create policy "comments insert" on public.comments for insert
  with check (user_id = auth.uid() and public.is_member(public.activity_group(activity_id)));
drop policy if exists "comments delete" on public.comments;
create policy "comments delete" on public.comments for delete using (user_id = auth.uid());

-- ---------- Foto-opslag ----------
-- Pad: <group_id>/<user_id>/<bestand>.jpg  — privé bucket, alleen groepsleden kunnen kijken

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "photos read" on storage.objects;
create policy "photos read" on storage.objects for select
  using (bucket_id = 'photos' and public.is_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "photos insert" on storage.objects;
create policy "photos insert" on storage.objects for insert
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.is_member(((storage.foldername(name))[1])::uuid)
  );
drop policy if exists "photos delete" on storage.objects;
create policy "photos delete" on storage.objects for delete
  using (bucket_id = 'photos' and (storage.foldername(name))[2] = auth.uid()::text);

-- ---------- Realtime: feed live bijwerken ----------
do $$
declare t text;
begin
  foreach t in array array['activities', 'kudos', 'comments'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;


-- =====================================================================
-- De touwtjes in handen — metingen (gewicht, taille, buik, foto's)
-- ALLES PRIVÉ: alleen de eigenaar kan eigen metingen en foto's zien.
-- Plak dit in Supabase > SQL Editor > New query en klik op "Run".
-- Veilig om opnieuw te draaien.
-- =====================================================================

create table if not exists public.measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  measured_on date not null,
  weight_kg numeric(5, 1) check (weight_kg is null or weight_kg between 20 and 400),
  waist_cm numeric(5, 1) check (waist_cm is null or waist_cm between 30 and 250),
  belly_cm numeric(5, 1) check (belly_cm is null or belly_cm between 30 and 250),
  photo_front text,
  photo_back text,
  photo_left text,
  photo_right text,
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists measurements_user_date on public.measurements (user_id, measured_on);

alter table public.measurements enable row level security;

-- Alleen jezelf: lezen, toevoegen, wijzigen, verwijderen
drop policy if exists "measurements own" on public.measurements;
create policy "measurements own" on public.measurements for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and measured_on <= public.today_nl());

-- Privé foto-opslag. Pad: <user_id>/<measurement_id>/<kant>.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress', 'progress', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "progress own read" on storage.objects;
create policy "progress own read" on storage.objects for select
  using (bucket_id = 'progress' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "progress own insert" on storage.objects;
create policy "progress own insert" on storage.objects for insert
  with check (bucket_id = 'progress' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "progress own update" on storage.objects;
create policy "progress own update" on storage.objects for update
  using (bucket_id = 'progress' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "progress own delete" on storage.objects;
create policy "progress own delete" on storage.objects for delete
  using (bucket_id = 'progress' and (storage.foldername(name))[1] = auth.uid()::text);


-- =====================================================================
-- De touwtjes in handen — doelen (gewoontes), afvinken en high fives
-- Plak dit in Supabase > SQL Editor > New query en klik op "Run".
-- Veilig om opnieuw te draaien.
-- =====================================================================

-- ---------- Doelen ----------
create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 50),
  emoji text not null default '🎯' check (char_length(emoji) <= 16),
  per_week int not null default 7 check (per_week between 1 and 7),   -- 7 = elke dag
  is_private boolean not null default false,
  start_date date not null default public.today_nl(),
  archived_on date,                                                   -- gestopt vanaf deze dag
  created_at timestamptz not null default now()
);
create index if not exists habits_group on public.habits (group_id);

alter table public.habits enable row level security;
-- Rechtstreeks alleen je eigen doelen. Anderen lezen via group_habits() (privé-titels afgeschermd).
drop policy if exists "habits own" on public.habits;
create policy "habits own" on public.habits for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_member(group_id));

-- Doelen van de groep; bij privé-doelen van anderen worden titel en emoji verborgen.
drop function if exists public.group_habits(uuid);
create or replace function public.group_habits(gid uuid)
returns table (
  id uuid, user_id uuid, title text, emoji text, per_week int,
  is_private boolean, start_date date, archived_on date, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select h.id, h.user_id,
    case when h.is_private and h.user_id <> auth.uid() then null else h.title end,
    case when h.is_private and h.user_id <> auth.uid() then '🔒' else h.emoji end,
    h.per_week, h.is_private, h.start_date, h.archived_on, h.created_at
  from habits h
  where h.group_id = gid and public.is_member(gid)
  order by h.created_at;
$$;

create or replace function public.habit_group(hid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select group_id from habits where id = hid;
$$;

-- ---------- Afvinken ----------
create table if not exists public.habit_checks (
  habit_id uuid not null references public.habits on delete cascade,
  group_id uuid not null references public.groups on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  check_date date not null,
  created_at timestamptz not null default now(),
  primary key (habit_id, check_date)
);
create index if not exists habit_checks_group_date on public.habit_checks (group_id, check_date);

alter table public.habit_checks enable row level security;
drop policy if exists "checks read" on public.habit_checks;
create policy "checks read" on public.habit_checks for select using (public.is_member(group_id));
drop policy if exists "checks insert" on public.habit_checks;
create policy "checks insert" on public.habit_checks for insert
  with check (
    user_id = auth.uid()
    and group_id = public.habit_group(habit_id)
    and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid())
    and check_date between public.today_nl() - 2 and public.today_nl()
  );
drop policy if exists "checks delete" on public.habit_checks;
create policy "checks delete" on public.habit_checks for delete
  using (user_id = auth.uid() and check_date between public.today_nl() - 2 and public.today_nl());

-- ---------- High fives ----------
create table if not exists public.cheers (
  group_id uuid not null references public.groups on delete cascade,
  from_user uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  to_user uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (from_user, to_user, day),
  check (from_user <> to_user)
);
create index if not exists cheers_group_day on public.cheers (group_id, day);

alter table public.cheers enable row level security;
drop policy if exists "cheers read" on public.cheers;
create policy "cheers read" on public.cheers for select using (public.is_member(group_id));
drop policy if exists "cheers insert" on public.cheers;
create policy "cheers insert" on public.cheers for insert
  with check (
    from_user = auth.uid() and public.is_member(group_id)
    and exists (select 1 from public.group_members m where m.group_id = cheers.group_id and m.user_id = to_user)
    and day between public.today_nl() - 7 and public.today_nl()
  );
drop policy if exists "cheers delete" on public.cheers;
create policy "cheers delete" on public.cheers for delete using (from_user = auth.uid());

-- ---------- Trainingsdoel kunnen uitzetten ----------
drop policy if exists "goals delete" on public.weekly_goals;
create policy "goals delete" on public.weekly_goals for delete using (user_id = auth.uid());

-- ---------- Realtime ----------
do $$
declare t text;
begin
  foreach t in array array['habit_checks', 'cheers'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;


-- =====================================================================
-- De touwtjes in handen — trainingen wijzigen
-- Je mag je eigen trainingen altijd aanpassen (duur, afstand, notitie, foto…).
-- De datum verplaatsen kan alleen naar vandaag, gisteren of eergisteren.
-- Plak dit in Supabase > SQL Editor > New query en klik op "Run". Veilig om opnieuw te draaien.
-- =====================================================================

drop policy if exists "activities update" on public.activities;
create policy "activities update" on public.activities for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.guard_activity_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.group_id <> old.group_id then
    raise exception 'Een training kan niet naar een andere groep';
  end if;
  if new.activity_date <> old.activity_date
     and new.activity_date not between public.today_nl() - 2 and public.today_nl() then
    raise exception 'Je kunt een training alleen verplaatsen naar vandaag, gisteren of eergisteren';
  end if;
  return new;
end; $$;

drop trigger if exists guard_activity_update on public.activities;
create trigger guard_activity_update before update on public.activities
  for each row execute function public.guard_activity_update();


-- =====================================================================
-- LockedIn — profielfoto's
-- Zichtbaar voor iedereen in je groep(en), niet voor buitenstaanders.
-- Plak dit in Supabase > SQL Editor > New query en klik op "Run". Veilig om opnieuw te draaien.
-- =====================================================================

alter table public.profiles add column if not exists avatar_path text;

-- Privé bucket. Pad: <user_id>/<bestand>.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "avatars read" on storage.objects;
create policy "avatars read" on storage.objects for select
  using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.shares_group(((storage.foldername(name))[1])::uuid)
    )
  );
drop policy if exists "avatars insert" on storage.objects;
create policy "avatars insert" on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars update" on storage.objects;
create policy "avatars update" on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars delete" on storage.objects;
create policy "avatars delete" on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);


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


-- =====================================================================
-- LockedIn — moeilijkheid per doel (makkelijk / normaal / moeilijk)
-- Plak dit in Supabase > SQL Editor > New query en klik op "Run". Veilig om opnieuw te draaien.
-- =====================================================================

alter table public.habits add column if not exists difficulty text not null default 'normaal';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'habits_difficulty_check') then
    alter table public.habits add constraint habits_difficulty_check check (difficulty in ('makkelijk', 'normaal', 'moeilijk'));
  end if;
end $$;

-- group_habits geeft nu ook de moeilijkheid terug (zichtbaar voor de groep, ook bij privé doelen)
drop function if exists public.group_habits(uuid);
create function public.group_habits(gid uuid)
returns table (
  id uuid, user_id uuid, title text, emoji text, per_week int,
  is_private boolean, start_date date, archived_on date, created_at timestamptz, difficulty text
)
language sql stable security definer set search_path = public as $$
  select h.id, h.user_id,
    case when h.is_private and h.user_id <> auth.uid() then null else h.title end,
    case when h.is_private and h.user_id <> auth.uid() then '🔒' else h.emoji end,
    h.per_week, h.is_private, h.start_date, h.archived_on, h.created_at, h.difficulty
  from habits h
  where h.group_id = gid and public.is_member(gid)
  order by h.created_at;
$$;


-- =====================================================================
-- LockedIn — extra metingen (heupen, borst, bovenarm, bovenbeen, vetpercentage)
-- en per persoon instellen welke metingen je bijhoudt (+ lengte voor verhoudingen).
-- Plak dit in Supabase > SQL Editor > New query en klik op "Run". Veilig om opnieuw te draaien.
-- =====================================================================

alter table public.measurements add column if not exists hips_cm numeric(5, 1);
alter table public.measurements add column if not exists chest_cm numeric(5, 1);
alter table public.measurements add column if not exists arm_cm numeric(5, 1);
alter table public.measurements add column if not exists thigh_cm numeric(5, 1);
alter table public.measurements add column if not exists fat_pct numeric(4, 1);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'measurements_extra_check') then
    alter table public.measurements add constraint measurements_extra_check check (
      (hips_cm is null or hips_cm between 40 and 250)
      and (chest_cm is null or chest_cm between 40 and 250)
      and (arm_cm is null or arm_cm between 10 and 80)
      and (thigh_cm is null or thigh_cm between 20 and 120)
      and (fat_pct is null or fat_pct between 3 and 70)
    );
  end if;
end $$;

-- Welke metingen iemand bijhoudt, en lengte (voor de taille-lengteverhouding). Privé.
alter table public.private_settings add column if not exists measure_fields text[] not null default '{weight_kg,waist_cm,belly_cm}';
alter table public.private_settings add column if not exists height_cm numeric(4, 1);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'private_settings_height_check') then
    alter table public.private_settings add constraint private_settings_height_check check (height_cm is null or height_cm between 100 and 230);
  end if;
end $$;


-- =====================================================================
-- LockedIn — doelen meerdere keren per dag, keuzedoelen en herinneringstijden
-- =====================================================================

alter table public.habits add column if not exists per_day int not null default 1;
alter table public.habits add column if not exists options text[] not null default '{}';
alter table public.habits add column if not exists reminder_times text[] not null default '{}';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'habits_per_day_check') then
    alter table public.habits add constraint habits_per_day_check check (per_day between 1 and 10);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'habits_options_check') then
    alter table public.habits add constraint habits_options_check check (cardinality(options) <= 8);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'habits_reminders_check') then
    alter table public.habits add constraint habits_reminders_check check (cardinality(reminder_times) <= 6);
  end if;
end $$;

-- Teller per dag en welke keuze je deed (als nummer in de keuzelijst, zodat een privé keuze niet uitlekt)
alter table public.habit_checks add column if not exists count int not null default 1;
alter table public.habit_checks add column if not exists option text;
alter table public.habit_checks add column if not exists updated_at timestamptz not null default now();
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'habit_checks_count_check') then
    alter table public.habit_checks add constraint habit_checks_count_check check (count between 1 and 20);
  end if;
end $$;

drop policy if exists "checks update" on public.habit_checks;
create policy "checks update" on public.habit_checks for update
  using (user_id = auth.uid() and check_date between public.today_nl() - 2 and public.today_nl())
  with check (user_id = auth.uid() and check_date between public.today_nl() - 2 and public.today_nl());

-- group_habits: nu ook per_day en keuzes (keuzes verborgen bij privé doelen van anderen)
drop function if exists public.group_habits(uuid);
create function public.group_habits(gid uuid)
returns table (
  id uuid, user_id uuid, title text, emoji text, per_week int,
  is_private boolean, start_date date, archived_on date, created_at timestamptz, difficulty text,
  per_day int, options text[], reminder_times text[]
)
language sql stable security definer set search_path = public as $$
  select h.id, h.user_id,
    case when h.is_private and h.user_id <> auth.uid() then null else h.title end,
    case when h.is_private and h.user_id <> auth.uid() then '🔒' else h.emoji end,
    h.per_week, h.is_private, h.start_date, h.archived_on, h.created_at, h.difficulty,
    h.per_day,
    case when h.is_private and h.user_id <> auth.uid() then '{}'::text[] else h.options end,
    case when h.user_id = auth.uid() then h.reminder_times else '{}'::text[] end   -- herinneringen alleen voor jezelf
  from habits h
  where h.group_id = gid and public.is_member(gid)
  order by h.created_at;
$$;


-- =====================================================================
-- LockedIn — pushmeldingen: abonnementen per toestel, voorkeuren per persoon,
-- en een logboek (alleen voor de server) om dubbele meldingen te voorkomen.
-- =====================================================================

-- Eén rij per toestel/browser dat meldingen mag ontvangen
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "push own" on public.push_subscriptions;
create policy "push own" on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Wat iemand wil ontvangen (privé)
create table if not exists public.notification_prefs (
  user_id uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  morning boolean not null default true,
  morning_time text not null default '08:00',
  evening boolean not null default true,
  evening_time text not null default '19:00',
  habit_reminders boolean not null default true,
  reactions boolean not null default true,
  group_all_done boolean not null default true,
  group_hard_goal boolean not null default true,
  broadcasts boolean not null default true,
  quiet_start text not null default '22:00',
  quiet_end text not null default '08:00',
  updated_at timestamptz not null default now(),
  check (morning_time ~ '^[0-2][0-9]:[0-5][0-9]$' and evening_time ~ '^[0-2][0-9]:[0-5][0-9]$'
     and quiet_start ~ '^[0-2][0-9]:[0-5][0-9]$' and quiet_end ~ '^[0-2][0-9]:[0-5][0-9]$')
);
alter table public.notification_prefs enable row level security;
drop policy if exists "prefs own" on public.notification_prefs;
create policy "prefs own" on public.notification_prefs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Alleen voor de server (geen policies = niemand anders kan erbij)
create table if not exists public.notification_log (
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, key)
);
alter table public.notification_log enable row level security;

create table if not exists public.notify_watermarks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  last_at timestamptz not null,
  primary key (user_id, kind)
);
alter table public.notify_watermarks enable row level security;

-- Oude logregels opruimen kan later; voor 5 mensen is dit klein.


-- LockedIn — per toestel bijhouden hoe het laatste versturen afliep (voor foutopsporing)
alter table public.push_subscriptions add column if not exists last_status int;
alter table public.push_subscriptions add column if not exists last_error text;
alter table public.push_subscriptions add column if not exists last_sent_at timestamptz;
