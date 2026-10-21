CREATE INDEX IF NOT EXISTS community_chat_messages_sender_idx
  ON public.community_chat_messages(sender_company_id);
