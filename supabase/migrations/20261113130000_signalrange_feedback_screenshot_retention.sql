-- Screenshot retention. Objects in the feedback-screenshots bucket live 30 days, like the other
-- attachments. Deleting storage.objects rows from SQL leaves the stored file behind, so the
-- feedback-prune Edge Function removes objects through the Storage API and uses these wrappers
-- to find expired and unreferenced ones. Service role only.

create function public.feedback_expired_screenshots(p_limit integer default 200)
returns table (id uuid, screenshot_path text) language sql stable security invoker set search_path = '' as $$
  select q.id, q.screenshot_path
  from signalrange_private.qa_feedback q
  where q.screenshot_path is not null and q.created_at <= now() - interval '30 days'
  order by q.created_at
  limit greatest(1, least(p_limit, 500));
$$;

create function public.feedback_clear_screenshot_paths(p_ids uuid[])
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  cleared integer;
begin
  update signalrange_private.qa_feedback set screenshot_path = null where id = any(p_ids) and screenshot_path is not null;
  get diagnostics cleared = row_count;
  return cleared;
end;
$$;

-- Objects no row references (failed or raced uploads), older than a day so an in-flight upload is safe.
create function public.feedback_orphan_screenshots(p_limit integer default 200)
returns table (name text) language sql stable security invoker set search_path = '' as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'feedback-screenshots'
    and o.created_at <= now() - interval '1 day'
    and not exists (select 1 from signalrange_private.qa_feedback q where q.screenshot_path = o.name)
  order by o.created_at
  limit greatest(1, least(p_limit, 500));
$$;

revoke all on function public.feedback_expired_screenshots(integer) from public, anon, authenticated;
revoke all on function public.feedback_clear_screenshot_paths(uuid[]) from public, anon, authenticated;
revoke all on function public.feedback_orphan_screenshots(integer) from public, anon, authenticated;
grant execute on function public.feedback_expired_screenshots(integer) to service_role;
grant execute on function public.feedback_clear_screenshot_paths(uuid[]) to service_role;
grant execute on function public.feedback_orphan_screenshots(integer) to service_role;
