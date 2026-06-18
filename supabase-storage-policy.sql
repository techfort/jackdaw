-- JackDAW — Supabase Storage RLS policy for the audio bucket.
--
-- WHY THIS FILE EXISTS
-- Audio clips are uploaded to the public "jackdaw-preview" Storage bucket using
-- the anon (publishable) key. Supabase Storage enforces row-level security on
-- the storage.objects table. With no matching policy, every upload fails with:
--   400 Bad Request — "new row violates row-level security policy" (statusCode 403)
--
-- HOW TO APPLY
-- 1. Open the Supabase dashboard for project aplfxtmppbkmolwcscdk.
-- 2. Go to SQL Editor → New query.
-- 3. Paste this whole file and Run.
-- (Equivalent UI path: Storage → Policies → New policy on the bucket.)
--
-- WHERE TO SEE THE VIOLATED POLICY
-- Database → Policies → set schema dropdown to "storage" → table "objects".
-- Storage → Policies also lists them grouped per bucket.

-- Make sure the bucket exists and is public-readable (for getPublicUrl()).
insert into storage.buckets (id, name, public)
values ('jackdaw-preview', 'jackdaw-preview', true)
on conflict (id) do update set public = true;

-- Drop any prior versions of these policies so this script is idempotent.
drop policy if exists "jackdaw-preview read"   on storage.objects;
drop policy if exists "jackdaw-preview insert" on storage.objects;
drop policy if exists "jackdaw-preview update" on storage.objects;
drop policy if exists "jackdaw-preview delete" on storage.objects;

-- Grant the `public` role (covers both anon and authenticated requests) full
-- access to objects in the jackdaw-preview bucket only. Scope is the bucket,
-- so other buckets remain protected.
create policy "jackdaw-preview read"
  on storage.objects for select
  to public
  using (bucket_id = 'jackdaw-preview');

create policy "jackdaw-preview insert"
  on storage.objects for insert
  to public
  with check (bucket_id = 'jackdaw-preview');

create policy "jackdaw-preview update"
  on storage.objects for update
  to public
  using (bucket_id = 'jackdaw-preview')
  with check (bucket_id = 'jackdaw-preview');

create policy "jackdaw-preview delete"
  on storage.objects for delete
  to public
  using (bucket_id = 'jackdaw-preview');
