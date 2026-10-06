-- 静室 · conversation donations (opt-in, 14+). Run once in the Supabase SQL editor.
-- Private by design: RLS is on with no policies, anon/authenticated get no grants, so only
-- the server's secret key (service_role) can insert, read or delete. View the rows in the
-- Supabase dashboard (Table Editor → donations).

create table if not exists public.donations (
  id uuid primary key,
  created_at timestamptz not null default now(),
  consent_version text not null,
  age_bracket text not null check (age_bracket in ('18+', '14-17')),
  language text not null,
  support_region text,
  app_version text not null,
  -- [{ role: "user" | "assistant", content, safety?, pace?, feedback? }], masked before storage
  messages jsonb not null check (jsonb_typeof(messages) = 'array')
);

alter table public.donations enable row level security;

revoke all on table public.donations from anon, authenticated;
grant select, insert, delete on table public.donations to service_role;
