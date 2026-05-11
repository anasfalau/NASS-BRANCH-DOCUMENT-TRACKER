-- ================================================================
--  NASS Branch Tracker — Message editing
--
--  Adds the ability for users to edit messages they previously sent
--  in DMs and group chats. AI responses are never editable.
--
--    1. edited_at column on nass_messages (NULL = never edited)
--    2. UPDATE RLS policy: author can edit only their own non-AI
--       messages, and only the content / edited_at fields.
--    3. Trigger: server stamps edited_at = now() automatically and
--       prevents the client from changing any other column.
-- ================================================================

-- ── Add edited_at column ────────────────────────────────────────
alter table public.nass_messages
  add column if not exists edited_at timestamptz;

-- ── Trigger: stamp edited_at + lock immutable columns ───────────
create or replace function public.fn_nass_messages_before_update()
returns trigger language plpgsql security definer as $$
begin
  -- Never let the client mutate identity / routing / timestamps.
  new.id              := old.id;
  new.conversation_id := old.conversation_id;
  new.user_id         := old.user_id;
  new.user_email      := old.user_email;
  new.is_ai_response  := old.is_ai_response;
  new.created_at      := old.created_at;

  -- Only stamp edited_at when the content actually changed.
  if new.content is distinct from old.content then
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_nass_messages_before_update on public.nass_messages;
create trigger trg_nass_messages_before_update
  before update on public.nass_messages
  for each row execute function public.fn_nass_messages_before_update();

-- ── RLS: allow author to update their own non-AI messages ──────
drop policy if exists "messages_update" on public.nass_messages;
create policy "messages_update" on public.nass_messages
  for update to authenticated
  using (
    auth.uid() = user_id
    and is_ai_response = false
    and public.fn_is_conv_member(conversation_id)
  )
  with check (
    auth.uid() = user_id
    and is_ai_response = false
  );
