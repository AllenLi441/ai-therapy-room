-- 静室 · shared conversations, row format 2 (app 1.3.0+). Run once in the Supabase SQL editor,
-- after docs/supabase-donations.sql. Safe to run again.
--
-- Until this runs, the app stores rows in the old shape (it retries without these columns),
-- so nothing breaks; the per-message trace, timestamps and replaced replies live inside
-- `messages` either way. Table-level grants already cover new columns.

alter table public.donations
  add column if not exists schema_version int not null default 1,
  add column if not exists updated_at timestamptz,
  add column if not exists turn_count int,
  add column if not exists had_crisis boolean;

-- Backfill rows written before this migration ran (1.3.0 rows sent in the old shape, and
-- older rows). had_crisis mirrors isCrisisMessage in src/lib/turn-trace.ts.
update public.donations d set
  schema_version = case when exists (select 1 from jsonb_array_elements(d.messages) m where m ? 'meta') then 2 else d.schema_version end,
  updated_at = coalesce(d.updated_at, d.created_at),
  turn_count = coalesce(d.turn_count, (select count(*) from jsonb_array_elements(d.messages) m where m->>'role' = 'user')),
  had_crisis = coalesce(d.had_crisis, exists (
    select 1 from jsonb_array_elements(d.messages) m
    where m->>'safety' in ('crisis', 'suicide_concern')
       or m->'meta'->>'crisis' = 'true'
       or m->'meta'->>'route' in ('lexicon_crisis', 'lexicon_suicide_concern', 'implicit_crisis', 'implicit_suicide_concern', 'implicit_fail_safe', 'crisis_check_reply')
       or m->'meta'->'decision'->>'mode' in ('crisis', 'suicide_concern')))
where d.turn_count is null or d.had_crisis is null or d.updated_at is null;

create index if not exists donations_updated_at_idx on public.donations (updated_at);
create index if not exists donations_had_crisis_idx on public.donations (had_crisis);
