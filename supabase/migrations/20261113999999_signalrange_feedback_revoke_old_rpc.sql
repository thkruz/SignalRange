-- ============================================================================
-- DO NOT APPLY THIS MIGRATION BEFORE THE feedback-submit EDGE FUNCTION IS LIVE.
--
-- It removes the old client write path (public.submit_signalrange_feedback). Until the
-- function is deployed and the client has switched to it, applying this breaks feedback
-- submission for everyone. Order: 1) apply 20261113120000, 2) deploy the function and
-- smoke it, 3) ship the client change, 4) apply this file.
--
-- The name sorts last on purpose. Rollback (if the function must be pulled):
--   grant execute on function public.submit_signalrange_feedback(uuid, text, text, jsonb) to authenticated;
-- ============================================================================

revoke execute on function public.submit_signalrange_feedback(uuid, text, text, jsonb) from authenticated;

-- Direct table writes are the same bypass, so close them too. The service role keeps full access.
revoke insert (id, message, screenshot_data, snapshot) on signalrange_private.qa_feedback from authenticated;
drop policy if exists developers_submit_feedback on signalrange_private.qa_feedback;
