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
