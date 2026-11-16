-- Questions the assistant asks in chat (frontend/src/lib/askInChat.ts) are
-- appended in one statement, so two asked at once, or a user turn saved in
-- between, can't overwrite each other. Keeps the newest p_keep entries.
create or replace function public.append_conversation_message(
  p_user text, p_id text, p_title text, p_message jsonb, p_history jsonb, p_keep int default 200
) returns void language sql as $$
  insert into public.conversations as c (user_id, id, title, messages, history, updated_at)
  values (p_user, p_id, p_title, jsonb_build_array(p_message), jsonb_build_array(p_history), now())
  on conflict (user_id, id) do update set
    messages = (select coalesce(jsonb_agg(e order by i), '[]'::jsonb)
                  from jsonb_array_elements(c.messages || jsonb_build_array(p_message)) with ordinality t(e, i)
                 where i > jsonb_array_length(c.messages) + 1 - p_keep),
    history = (select coalesce(jsonb_agg(e order by i), '[]'::jsonb)
                 from jsonb_array_elements(c.history || jsonb_build_array(p_history)) with ordinality t(e, i)
                where i > jsonb_array_length(c.history) + 1 - p_keep),
    updated_at = now();
$$;
