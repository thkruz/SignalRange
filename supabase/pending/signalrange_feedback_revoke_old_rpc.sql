-- ============================================================================
-- DO NOT APPLY THIS BEFORE THE feedback-submit EDGE FUNCTION IS LIVE.
-- See supabase/pending/README.md for the order.
--
-- It removes the old client write path (public.submit_signalrange_feedback). Until the
-- function is deployed and the client has switched to it, applying this breaks feedback
-- submission for everyone.
--
-- Rollback (if the function must be pulled):
--   grant execute on function public.submit_signalrange_feedback(uuid, text, text, jsonb) to authenticated;
-- ============================================================================

revoke execute on function public.submit_signalrange_feedback(uuid, text, text, jsonb) from authenticated;

-- Direct table writes are the same bypass, so close them too. The service role keeps full access.
revoke insert (id, message, screenshot_data, snapshot) on signalrange_private.qa_feedback from authenticated;
drop policy if exists developers_submit_feedback on signalrange_private.qa_feedback;

-- The receipt read only served the old insert-then-read retry path. The function answers duplicates itself.
drop policy if exists developers_read_own_receipt on signalrange_private.qa_feedback;
revoke select (id) on signalrange_private.qa_feedback from authenticated;
