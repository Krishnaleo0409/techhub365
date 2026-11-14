-- Optional newsletter/masterclass interest and moderated learner feedback.
-- Apply after schema.sql. No email delivery or class booking is performed here.
create table if not exists public.kr7_community_interest (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('newsletter', 'masterclass')),
  email text not null check (length(email) <= 254),
  display_name text not null default '' check (length(display_name) <= 80),
  consent_at timestamptz not null default now(),
  consent_version text not null default 'interest-v1',
  unique (kind, email)
);

create table if not exists public.kr7_learner_feedback (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  display_name text not null check (length(display_name) between 1 and 80),
  course_id text not null,
  rating integer not null check (rating between 1 and 5),
  feedback text not null check (length(feedback) between 20 and 2000),
  consent_at timestamptz not null default now(),
  consent_public boolean not null default false,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.kr7_community_limits (
  fingerprint text primary key check (fingerprint ~ '^[0-9a-f]{64}$'),
  request_count integer not null,
  resets_at timestamptz not null
);

create table if not exists public.kr7_contact_requests (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  display_name text not null check (length(display_name) between 1 and 80),
  email text not null check (length(email) <= 254),
  phone text not null default '' check (phone = '' or phone ~ '^\+?[0-9]{7,15}$'),
  consent_at timestamptz not null default now(),
  purpose text not null default 'guided-help-follow-up'
);

create or replace function public.kr7_take_community_slot(p_fingerprint text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.kr7_community_limits (fingerprint, request_count, resets_at)
  values (p_fingerprint, 1, now() + interval '1 hour')
  on conflict (fingerprint) do update
  set request_count = case
        when kr7_community_limits.resets_at <= now() then 1
        else kr7_community_limits.request_count + 1
      end,
      resets_at = case
        when kr7_community_limits.resets_at <= now() then now() + interval '1 hour'
        else kr7_community_limits.resets_at
      end
  where kr7_community_limits.resets_at <= now()
     or kr7_community_limits.request_count < 5;
  return found;
end;
$$;

alter table public.kr7_community_interest enable row level security;
alter table public.kr7_learner_feedback enable row level security;
alter table public.kr7_community_limits enable row level security;
alter table public.kr7_contact_requests enable row level security;
revoke all on public.kr7_community_interest, public.kr7_learner_feedback,
  public.kr7_community_limits, public.kr7_contact_requests from anon, authenticated;
grant all on public.kr7_community_interest, public.kr7_learner_feedback,
  public.kr7_community_limits, public.kr7_contact_requests to service_role;
revoke all on function public.kr7_take_community_slot(text) from public, anon, authenticated;
grant execute on function public.kr7_take_community_slot(text) to service_role;
