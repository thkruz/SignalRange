-- Run as a trusted database administrator. Everything rolls back, including
-- pruning of any existing old records; no fixture data is retained.
begin;
do $$
declare
  developer uuid := (select user_id from signalrange_private.feedback_developers limit 1);
  old_id uuid := gen_random_uuid();
  boundary_id uuid := gen_random_uuid();
  recent_id uuid := gen_random_uuid();
  evidence jsonb := '{"route":"/campaigns/test","scenarioId":"test-mission","version":"test","commit":"test","capturedAt":"2026-01-01T00:00:00Z","gameState":{"equipment":"test"},"screen":{"dialogs":["test-menu"]}}';
begin
  if developer is null then raise exception 'A developer fixture is required'; end if;
  insert into signalrange_private.qa_feedback (id, user_id, created_at, message, screenshot_data, snapshot, status)
  values
    (old_id, developer, now() - interval '31 days', 'keep this note', 'data:image/jpeg;base64,/9j/2Q==', evidence, 'triaged'),
    (boundary_id, developer, now() - interval '30 days', 'boundary note', 'data:image/jpeg;base64,/9j/2Q==', evidence, 'new'),
    (recent_id, developer, now() - interval '29 days', 'recent note', 'data:image/jpeg;base64,/9j/2Q==', evidence, 'resolved');

  perform signalrange_private.prune_feedback_attachments();
  if (select count(*) from signalrange_private.qa_feedback
      where id in (old_id, boundary_id) and screenshot_data is null and attachments_pruned_at is not null
      and not (snapshot ? 'gameState') and not (snapshot ? 'screen')
      and snapshot->>'scenarioId' = 'test-mission' and snapshot->>'version' = 'test') <> 2
  then raise exception 'Old and boundary attachments must expire, keeping basic metadata'; end if;
  if not exists (select 1 from signalrange_private.qa_feedback
      where id = old_id and message = 'keep this note' and status = 'triaged')
  then raise exception 'Notes and triage status changed'; end if;
  if not exists (select 1 from signalrange_private.qa_feedback
      where id = recent_id and screenshot_data is not null and attachments_pruned_at is null and snapshot = evidence)
  then raise exception 'Recent evidence was removed'; end if;
  if signalrange_private.prune_feedback_attachments() <> 0
  then raise exception 'Pruning must be idempotent'; end if;
  if has_function_privilege('anon', 'signalrange_private.prune_feedback_attachments()', 'execute')
     or has_function_privilege('authenticated', 'signalrange_private.prune_feedback_attachments()', 'execute')
  then raise exception 'Players must not be able to trigger pruning'; end if;
end;
$$;
select 'PASS: 30-day boundary, recent evidence, preserved notes/status/metadata, idempotence, private execution' as result;
rollback;
