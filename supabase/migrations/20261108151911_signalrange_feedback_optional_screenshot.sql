-- A report may start without an image. Detailed game state still expires after
-- 30 days, so omitted screenshots must not mark the whole report as pruned.
alter table signalrange_private.qa_feedback
  drop constraint qa_feedback_attachment_lifecycle,
  add constraint qa_feedback_attachment_lifecycle check (
    attachments_pruned_at is null or screenshot_data is null
  );
