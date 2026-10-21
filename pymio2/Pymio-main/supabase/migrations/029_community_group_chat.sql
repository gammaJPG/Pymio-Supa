-- Un canal grupal persistente para cada comunidad de RED Pymio.
-- El backend usa service_role y verifica la membresía antes de cada lectura o escritura.

CREATE TABLE IF NOT EXISTS public.community_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  sender_company_id bigint NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.community_chat_reads (
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  company_id bigint NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id,company_id)
);

CREATE INDEX IF NOT EXISTS community_chat_messages_timeline_idx
  ON public.community_chat_messages(community_id,created_at,id);
CREATE INDEX IF NOT EXISTS community_chat_messages_sender_idx
  ON public.community_chat_messages(sender_company_id);
CREATE INDEX IF NOT EXISTS community_chat_reads_company_idx
  ON public.community_chat_reads(company_id,community_id);

ALTER TABLE public.community_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_chat_reads ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.community_chat_messages,public.community_chat_reads FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.community_chat_messages,public.community_chat_reads TO service_role;
