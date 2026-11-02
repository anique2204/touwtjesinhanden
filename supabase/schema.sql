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
