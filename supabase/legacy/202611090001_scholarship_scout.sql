-- Scholarship Scout secure data model
-- All student-owned records are protected with RLS; no service-role key is used by the app.

create extension if not exists pgcrypto;

create table if not exists public.scholarship_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  matching_profile jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.scholarship_opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  provider text,
  award_text text,
  deadline date,
  source_url text not null,
  canonical_url text not null,
  discovery_source_url text,
  discovery_category text not null default 'general',
  excerpt text not null default '',
  extracted_rules jsonb not null default '{}'::jsonb,
  verification_state text not null default 'discovered'
    check (verification_state in ('discovered','needs_human_review','human_verified','rejected')),
  source_checked_at timestamptz,
  discovered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scholarship_opportunities_https_source check (source_url like 'https://%'),
  constraint scholarship_opportunities_https_canonical check (canonical_url like 'https://%'),
  unique (user_id, canonical_url)
);

create index if not exists scholarship_opportunities_user_deadline_idx
  on public.scholarship_opportunities (user_id, deadline);

create index if not exists scholarship_opportunities_user_verification_idx
  on public.scholarship_opportunities (user_id, verification_state);

create table if not exists public.scholarship_search_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_count integer not null default 0 check (category_count between 1 and 8),
  result_count integer not null default 0 check (result_count >= 0),
  created_at timestamptz not null default now()
);

create index if not exists scholarship_search_runs_user_created_idx
  on public.scholarship_search_runs (user_id, created_at desc);

create table if not exists public.scholarship_sources (
  id text primary key,
  name text not null,
  category text not null,
  url text not null check (url like 'https://%'),
  detail text not null default '',
  school_provided boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.scholarship_profiles enable row level security;
alter table public.scholarship_opportunities enable row level security;
alter table public.scholarship_search_runs enable row level security;
alter table public.scholarship_sources enable row level security;

drop policy if exists "Users can view their scholarship profile" on public.scholarship_profiles;
create policy "Users can view their scholarship profile"
  on public.scholarship_profiles for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their scholarship profile" on public.scholarship_profiles;
create policy "Users can create their scholarship profile"
  on public.scholarship_profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their scholarship profile" on public.scholarship_profiles;
create policy "Users can update their scholarship profile"
  on public.scholarship_profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their scholarship profile" on public.scholarship_profiles;
create policy "Users can delete their scholarship profile"
  on public.scholarship_profiles for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can view their scholarships" on public.scholarship_opportunities;
create policy "Users can view their scholarships"
  on public.scholarship_opportunities for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can add their scholarships" on public.scholarship_opportunities;
create policy "Users can add their scholarships"
  on public.scholarship_opportunities for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their scholarships" on public.scholarship_opportunities;
create policy "Users can update their scholarships"
  on public.scholarship_opportunities for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their scholarships" on public.scholarship_opportunities;
create policy "Users can delete their scholarships"
  on public.scholarship_opportunities for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can view their search history" on public.scholarship_search_runs;
create policy "Users can view their search history"
  on public.scholarship_search_runs for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can add their own search history" on public.scholarship_search_runs;
create policy "Users can add their own search history"
  on public.scholarship_search_runs for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own search history" on public.scholarship_search_runs;
create policy "Users can update their own search history"
  on public.scholarship_search_runs for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Signed-in users can view curated scholarship sources" on public.scholarship_sources;
create policy "Signed-in users can view curated scholarship sources"
  on public.scholarship_sources for select to authenticated
  using (true);

grant select, insert, update, delete on public.scholarship_profiles to authenticated;
grant select, insert, update, delete on public.scholarship_opportunities to authenticated;
grant select, insert, update on public.scholarship_search_runs to authenticated;
grant select on public.scholarship_sources to authenticated;

insert into public.scholarship_sources (id,name,category,url,detail,school_provided) values
('careeronestop','CareerOneStop Scholarship Finder','national','https://www.careeronestop.org/Toolkit/Training/find-scholarships.aspx?curPage=1&studyLevelfilter=High+School','Government-supported scholarship search.',false),
('bigfuture','College Board BigFuture','national','https://bigfuture.collegeboard.org/scholarship-search','National scholarship search.',false),
('federal-student-aid','Federal Student Aid Scholarship Tips','national','https://studentaid.gov/articles/scholarship-tips/','Official federal financial-aid guidance.',false),
('ftc-scam-guidance','FTC Avoid Scholarship Scams','safety','https://consumer.ftc.gov/articles/how-avoid-scholarship-and-financial-aid-scams','Safety guidance for detecting scholarship scams.',false)
on conflict (id) do update set
  name=excluded.name, category=excluded.category, url=excluded.url,
  detail=excluded.detail, school_provided=excluded.school_provided;


-- Atomic, per-user search reservation. The function serializes reservations for the
-- same user so concurrent Edge Function requests cannot race around the hourly limit.
create or replace function public.reserve_scholarship_search_run(p_category_count integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_recent_count integer;
  v_run_id uuid;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_category_count < 1 or p_category_count > 6 then
    raise exception 'INVALID_CATEGORY_COUNT';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text), 2);

  select count(*) into v_recent_count
    from public.scholarship_search_runs
    where user_id = v_user_id
      and created_at >= now() - interval '1 hour';

  if v_recent_count >= 2 then
    raise exception 'SEARCH_RATE_LIMIT';
  end if;

  insert into public.scholarship_search_runs (user_id, category_count, result_count)
    values (v_user_id, p_category_count, 0)
    returning id into v_run_id;

  return v_run_id;
end;
$$;

revoke all on function public.reserve_scholarship_search_run(integer) from public;
grant execute on function public.reserve_scholarship_search_run(integer) to authenticated;
