-- Question bank: hold the generated TikTok slide images alongside the question,
-- so a question that has been added can be viewed, re-rendered and downloaded
-- without re-rendering it on every visit.
--
-- Images live in a PRIVATE Supabase Storage bucket and the database only keeps
-- their object paths. Nothing is made public: the app is the only reader, via
-- the service-role key, and hands the browser short-lived signed URLs. That
-- keeps the bucket safe even though the app itself has no login.
--
-- The free Supabase plan includes 1 GB of file storage, which is roughly
-- 1,200 questions at four 1080x1920 PNGs each. Deleting a question deletes its
-- slides, so the quota is reclaimed rather than leaked.

-- ------------------------------------------------------------ storage bucket

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('question-slides', 'question-slides', false, 10485760, array['image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- No RLS policies on storage.objects for this bucket: the service-role key
-- bypasses RLS, and the anon key can neither read nor write. Every read the
-- browser makes goes through a server route that mints a signed URL.

-- ------------------------------------------------- slide state on the question

alter table nclex_questions
  add column if not exists template_id text,
  add column if not exists slide_status text not null default 'none',
  add column if not exists slide_paths text[],
  add column if not exists slide_error text,
  add column if not exists slide_rendered_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'nclex_questions_slide_status') then
    alter table nclex_questions
      add constraint nclex_questions_slide_status
      check (slide_status in ('none', 'queued', 'rendering', 'ready', 'failed'));
  end if;
end $$;

-- The bank filters by derived format, so index it. text_pattern_ops makes the
-- "starts with single/multiple" filter an index scan rather than a table scan
-- once the bank grows past a few thousand rows.
create index if not exists idx_nclex_questions_format on nclex_questions (format);

-- Questions that are waiting for a render, so a retry sweep can find them
-- after a server restart mid-render.
create index if not exists idx_nclex_questions_slide_status
  on nclex_questions (slide_status)
  where slide_status in ('queued', 'rendering');
