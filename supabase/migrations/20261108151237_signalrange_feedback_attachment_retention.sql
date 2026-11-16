-- Retain notes/status and small routing/build metadata; expire large evidence.
alter table signalrange_private.qa_feedback
  alter column screenshot_data drop not null,
  add column attachments_pruned_at timestamptz,
  add constraint qa_feedback_attachment_lifecycle check (
    (screenshot_data is not null and attachments_pruned_at is null)
    or (screenshot_data is null and attachments_pruned_at is not null)
  );

create function signalrange_private.prune_feedback_attachments()
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  pruned integer;
begin
  update signalrange_private.qa_feedback
  set screenshot_data = null,
      snapshot = jsonb_strip_nulls(jsonb_build_object(
        'capturedAt', snapshot->'capturedAt',
        'route', snapshot->'route',
        'scenarioId', snapshot->'scenarioId',
        'version', snapshot->'version',
        'commit', snapshot->'commit'
      )),
      attachments_pruned_at = now()
  where created_at <= now() - interval '30 days'
    and attachments_pruned_at is null;
  get diagnostics pruned = row_count;
  return pruned;
end;
$$;
revoke all on function signalrange_private.prune_feedback_attachments() from public, anon, authenticated;
grant execute on function signalrange_private.prune_feedback_attachments() to service_role;

comment on column signalrange_private.qa_feedback.attachments_pruned_at is 'Daily maintenance clears screenshot and detailed game state after 30 days. Feedback text, status and routing/build metadata remain.';

-- The existing project already has pg_cron enabled. This job runs as the
-- migration owner, not as a player. It touches only SignalRange feedback.
select cron.schedule(
  'signalrange-feedback-attachment-prune',
  '45 8 * * *',
  'select signalrange_private.prune_feedback_attachments();'
);
