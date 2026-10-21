BEGIN;

CREATE TABLE IF NOT EXISTS public.community_event_participations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.network_posts(id) ON DELETE CASCADE,
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  company_id bigint NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  participation_type text NOT NULL CHECK (participation_type IN ('applicant','attendee')),
  status text NOT NULL DEFAULT 'registered' CHECK (status IN ('pending_membership','registered')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id,company_id)
);

CREATE INDEX IF NOT EXISTS community_event_participations_community_idx
  ON public.community_event_participations(community_id,event_id,status,participation_type);
CREATE INDEX IF NOT EXISTS community_event_participations_company_idx
  ON public.community_event_participations(company_id,updated_at DESC);

ALTER TABLE public.community_event_participations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.community_event_participations FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.community_event_participations TO service_role;

CREATE OR REPLACE FUNCTION public.activate_community_event_participations()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
BEGIN
  UPDATE public.community_event_participations
  SET status='registered',updated_at=now()
  WHERE community_id=NEW.community_id
    AND company_id=NEW.company_id
    AND status='pending_membership';
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS activate_event_participations_after_join ON public.community_members;
CREATE TRIGGER activate_event_participations_after_join
AFTER INSERT ON public.community_members
FOR EACH ROW EXECUTE FUNCTION public.activate_community_event_participations();

CREATE OR REPLACE FUNCTION public.clear_rejected_event_participations()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
BEGIN
  IF NEW.status='rejected' AND OLD.status IS DISTINCT FROM NEW.status THEN
    DELETE FROM public.community_event_participations
    WHERE community_id=NEW.community_id
      AND company_id=NEW.company_id
      AND status='pending_membership';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS clear_event_participations_after_rejection ON public.community_join_requests;
CREATE TRIGGER clear_event_participations_after_rejection
AFTER UPDATE OF status ON public.community_join_requests
FOR EACH ROW EXECUTE FUNCTION public.clear_rejected_event_participations();

REVOKE ALL ON FUNCTION public.activate_community_event_participations() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activate_community_event_participations() TO service_role;
REVOKE ALL ON FUNCTION public.clear_rejected_event_participations() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.clear_rejected_event_participations() TO service_role;

COMMIT;
