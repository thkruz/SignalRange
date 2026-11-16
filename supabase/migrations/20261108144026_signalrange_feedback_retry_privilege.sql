-- ON CONFLICT needs visibility of the caller's receipt ID for safe retries.
-- No access to the note, image or snapshot, and no exposed read endpoint.
grant select (id) on signalrange_private.qa_feedback to authenticated;
create policy developers_read_own_receipt on signalrange_private.qa_feedback
  for select to authenticated using (
    user_id = (select auth.uid()) and exists (
      select 1 from signalrange_private.feedback_developers where user_id = (select auth.uid())
    )
  );
