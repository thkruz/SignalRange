-- Support for the feedback-submit Edge Function. Safe to apply BEFORE the function is
-- deployed: it only adds objects; the old RPC keeps working. The revoke that closes the old
-- write path is a separate, later migration (20261113999999_...).

-- 1. New columns on the feedback table.
alter table signalrange_private.qa_feedback
  add column category text check (category is null or category in ('bug', 'idea', 'content', 'other')),
  add column risk_flags text[] not null default '{}',
  add column screenshot_path text check (screenshot_path is null or screenshot_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$');

comment on column signalrange_private.qa_feedback.risk_flags is 'Heuristic flags computed by feedback-submit (instruction phrases, urls, hidden characters). Rows with flags need human review before any model reads them.';
comment on column signalrange_private.qa_feedback.screenshot_path is 'Object path in the private feedback-screenshots bucket. The image is a re-encoded JPEG; the row never holds image bytes.';

-- 2. Rate-limit ledger. One row per accepted attempt. Service role only.
create table signalrange_private.feedback_rate (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index feedback_rate_user_created_idx on signalrange_private.feedback_rate (user_id, created_at desc);
create index feedback_rate_created_idx on signalrange_private.feedback_rate (created_at desc);
alter table signalrange_private.feedback_rate enable row level security;
revoke all on signalrange_private.feedback_rate from public, anon, authenticated;
grant all on signalrange_private.feedback_rate to service_role;

-- 3. Private bucket. No storage.objects policies are created, so only the service role can read or write.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback-screenshots', 'feedback-screenshots', false, 3145728, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- 4. Service-role-only wrappers. signalrange_private is not exposed through PostgREST, so the
-- Edge Function reaches it through these. None is callable by anon or authenticated.
create function public.feedback_is_developer(p_user uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from signalrange_private.feedback_developers where user_id = p_user);
$$;

create function public.feedback_owner(p_id uuid)
returns uuid language sql stable security invoker set search_path = '' as $$
  select user_id from signalrange_private.qa_feedback where id = p_id;
$$;

-- Atomic check-and-record. The advisory lock serializes concurrent calls so two requests
-- cannot both pass the same remaining slot.
create function public.feedback_consume_rate(p_user uuid, p_now timestamptz, p_hour integer, p_day integer, p_global_hour integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  hour_count integer;
  day_count integer;
  global_count integer;
  oldest timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('signalrange_feedback_rate'));
  delete from signalrange_private.feedback_rate where created_at < p_now - interval '2 days';

  select count(*), min(created_at) into hour_count, oldest
    from signalrange_private.feedback_rate where user_id = p_user and created_at > p_now - interval '1 hour';
  if hour_count >= p_hour then
    return jsonb_build_object('allowed', false, 'scope', 'hour',
      'retry_after_sec', greatest(1, ceil(extract(epoch from (oldest + interval '1 hour' - p_now)))));
  end if;

  select count(*), min(created_at) into day_count, oldest
    from signalrange_private.feedback_rate where user_id = p_user and created_at > p_now - interval '1 day';
  if day_count >= p_day then
    return jsonb_build_object('allowed', false, 'scope', 'day',
      'retry_after_sec', greatest(1, ceil(extract(epoch from (oldest + interval '1 day' - p_now)))));
  end if;

  select count(*), min(created_at) into global_count, oldest
    from signalrange_private.feedback_rate where created_at > p_now - interval '1 hour';
  if global_count >= p_global_hour then
    return jsonb_build_object('allowed', false, 'scope', 'global',
      'retry_after_sec', greatest(1, ceil(extract(epoch from (oldest + interval '1 hour' - p_now)))));
  end if;

  insert into signalrange_private.feedback_rate (user_id, created_at) values (p_user, p_now);
  return jsonb_build_object('allowed', true);
end;
$$;

-- Returns 'inserted', 'duplicate' (same user, same id) or 'conflict' (id belongs to someone else).
create function public.feedback_insert(
  p_id uuid, p_user uuid, p_category text, p_message text, p_snapshot jsonb, p_screenshot_path text, p_risk_flags text[]
) returns text language plpgsql security invoker set search_path = '' as $$
declare
  existing uuid;
begin
  insert into signalrange_private.qa_feedback (id, user_id, category, message, screenshot_data, snapshot, screenshot_path, risk_flags)
  values (p_id, p_user, p_category, p_message, null, p_snapshot, p_screenshot_path, coalesce(p_risk_flags, '{}'))
  on conflict (id) do nothing;
  if found then return 'inserted'; end if;
  select user_id into existing from signalrange_private.qa_feedback where id = p_id;
  return case when existing = p_user then 'duplicate' else 'conflict' end;
end;
$$;

revoke all on function public.feedback_is_developer(uuid) from public, anon, authenticated;
revoke all on function public.feedback_owner(uuid) from public, anon, authenticated;
revoke all on function public.feedback_consume_rate(uuid, timestamptz, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.feedback_insert(uuid, uuid, text, text, jsonb, text, text[]) from public, anon, authenticated;
grant execute on function public.feedback_is_developer(uuid) to service_role;
grant execute on function public.feedback_owner(uuid) to service_role;
grant execute on function public.feedback_consume_rate(uuid, timestamptz, integer, integer, integer) to service_role;
grant execute on function public.feedback_insert(uuid, uuid, text, text, jsonb, text, text[]) to service_role;
