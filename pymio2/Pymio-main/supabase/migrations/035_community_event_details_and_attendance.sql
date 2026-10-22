BEGIN;

ALTER TABLE public.network_posts
  ADD COLUMN IF NOT EXISTS event_mode text NOT NULL DEFAULT 'online',
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

ALTER TABLE public.network_posts DROP CONSTRAINT IF EXISTS network_posts_event_mode_check;
ALTER TABLE public.network_posts ADD CONSTRAINT network_posts_event_mode_check
  CHECK (event_mode IN ('online','in_person','hybrid'));
ALTER TABLE public.network_posts DROP CONSTRAINT IF EXISTS network_posts_event_coordinates_check;
ALTER TABLE public.network_posts ADD CONSTRAINT network_posts_event_coordinates_check
  CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180));

CREATE TABLE IF NOT EXISTS public.community_event_responses(
  event_id uuid NOT NULL REFERENCES public.network_posts(id) ON DELETE CASCADE,
  company_id bigint NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  status text NOT NULL CHECK(status IN ('interested','attending','not_attending')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(event_id,company_id)
);

CREATE INDEX IF NOT EXISTS community_event_responses_event_status_idx
  ON public.community_event_responses(event_id,status);

ALTER TABLE public.community_event_responses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.community_event_responses FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.community_event_responses TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
