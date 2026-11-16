-- Private QA data. This schema is deliberately not exposed through PostgREST.
create schema if not exists signalrange_private;
revoke all on schema signalrange_private from public, anon;
grant usage on schema signalrange_private to authenticated, service_role;

create table signalrange_private.feedback_developers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table signalrange_private.feedback_developers enable row level security;
revoke all on signalrange_private.feedback_developers from public, anon, authenticated;
grant select on signalrange_private.feedback_developers to authenticated;
grant all on signalrange_private.feedback_developers to service_role;
create policy developer_sees_own_access on signalrange_private.feedback_developers
  for select to authenticated using (user_id = (select auth.uid()));

create table signalrange_private.qa_feedback (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  message text not null check (char_length(btrim(message)) between 1 and 10000),
  screenshot_data text not null check (
    octet_length(screenshot_data) between 24 and 3000000
    and screenshot_data ~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$'
  ),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 2000000),
  status text not null default 'new' check (status in ('new', 'triaged', 'resolved'))
);
create index qa_feedback_created_at_idx on signalrange_private.qa_feedback (created_at desc);
create index qa_feedback_user_id_idx on signalrange_private.qa_feedback (user_id);
alter table signalrange_private.qa_feedback enable row level security;
revoke all on signalrange_private.qa_feedback from public, anon, authenticated;
grant insert (id, message, screenshot_data, snapshot) on signalrange_private.qa_feedback to authenticated;
grant all on signalrange_private.qa_feedback to service_role;
create policy developers_submit_feedback on signalrange_private.qa_feedback
  for insert to authenticated with check (
    user_id = (select auth.uid()) and exists (
      select 1 from signalrange_private.feedback_developers where user_id = (select auth.uid())
    )
  );

-- Invoker privileges preserve RLS. No read endpoint, no service key in the client.
-- The client chooses a UUID once per draft so a lost response/retry cannot duplicate it.
create function public.submit_signalrange_feedback(
  submission_id uuid, feedback_message text, screenshot_data text, game_snapshot jsonb
) returns void language sql security invoker set search_path = '' as $$
  insert into signalrange_private.qa_feedback (id, message, screenshot_data, snapshot)
  values (submission_id, btrim(feedback_message), screenshot_data, game_snapshot)
  on conflict (id) do nothing;
$$;
revoke all on function public.submit_signalrange_feedback(uuid, text, text, jsonb) from public, anon;
grant execute on function public.submit_signalrange_feedback(uuid, text, text, jsonb) to authenticated, service_role;

comment on table signalrange_private.qa_feedback is 'Private SignalRange QA observations, screen captures and game snapshots. Read/triage through trusted database administration only.';
comment on table signalrange_private.feedback_developers is 'Server-side copy of the dev-menu allowlist. Only trusted administration can grant/revoke access.';
