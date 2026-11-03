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
