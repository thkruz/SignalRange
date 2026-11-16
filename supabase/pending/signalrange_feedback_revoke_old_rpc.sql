-- ============================================================================
-- DO NOT APPLY THIS BEFORE THE feedback-submit EDGE FUNCTION IS LIVE.
-- See supabase/pending/README.md for the order.
--
-- It removes the old client write path (public.submit_signalrange_feedback). Until the
-- function is deployed and the client has switched to it, applying this breaks feedback
-- submission for everyone.
--
-- Rollback (if the function must be pulled). The RPC is security invoker, so it needs the
-- caller's table grants and row-level security policies as well as EXECUTE. Restoring only
-- EXECUTE leaves the old path broken. Run all of these (copied from
-- 20261108143710_signalrange_qa_feedback.sql and 20261108144026_signalrange_feedback_retry_privilege.sql):
--
--   grant execute on function public.submit_signalrange_feedback(uuid, text, text, jsonb) to authenticated;
--   grant insert (id, message, screenshot_data, snapshot) on signalrange_private.qa_feedback to authenticated;
--   create policy developers_submit_feedback on signalrange_private.qa_feedback
--     for insert to authenticated with check (
--       user_id = (select auth.uid()) and exists (
--         select 1 from signalrange_private.feedback_developers where user_id = (select auth.uid())
--       )
--     );
--   grant select (id) on signalrange_private.qa_feedback to authenticated;
--   create policy developers_read_own_receipt on signalrange_private.qa_feedback
--     for select to authenticated using (
--       user_id = (select auth.uid()) and exists (
--         select 1 from signalrange_private.feedback_developers where user_id = (select auth.uid())
--       )
--     );
--
-- Then ship a client build that submits feedback through public.submit_signalrange_feedback again
-- instead of the feedback-submit function. Until that build is out, the released client keeps
-- calling the function, so keep the function deployed.
-- ============================================================================

revoke execute on function public.submit_signalrange_feedback(uuid, text, text, jsonb) from authenticated;

-- Direct table writes are the same bypass, so close them too. The service role keeps full access.
revoke insert (id, message, screenshot_data, snapshot) on signalrange_private.qa_feedback from authenticated;
drop policy if exists developers_submit_feedback on signalrange_private.qa_feedback;

-- The receipt read only served the old insert-then-read retry path. The function answers duplicates itself.
drop policy if exists developers_read_own_receipt on signalrange_private.qa_feedback;
revoke select (id) on signalrange_private.qa_feedback from authenticated;
