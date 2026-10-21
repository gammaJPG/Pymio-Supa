BEGIN;

CREATE TABLE IF NOT EXISTS public.community_notifications(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id bigint NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK(kind IN ('event_created','event_updated','event_deleted','form_created')),
  resource_id uuid NOT NULL,
  title text NOT NULL,
  event_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS community_notifications_company_created_idx
  ON public.community_notifications(company_id,created_at DESC);
ALTER TABLE public.community_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.community_notifications FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.community_notifications TO service_role;

CREATE OR REPLACE FUNCTION public.pymio_notify_community_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE source record; notification_kind text;
BEGIN
  IF TG_OP='DELETE' THEN source:=OLD; ELSE source:=NEW; END IF;
  IF source.kind<>'event' OR source.community_id IS NULL THEN
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  notification_kind:=CASE TG_OP WHEN 'INSERT' THEN 'event_created' WHEN 'UPDATE' THEN 'event_updated' ELSE 'event_deleted' END;
  INSERT INTO public.community_notifications(company_id,community_id,kind,resource_id,title,event_at)
    SELECT m.company_id,source.community_id,notification_kind,source.id,source.title,source.event_at
    FROM public.community_members m WHERE m.community_id=source.community_id;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

DROP TRIGGER IF EXISTS network_posts_community_notification ON public.network_posts;
CREATE TRIGGER network_posts_community_notification
AFTER INSERT OR UPDATE OR DELETE ON public.network_posts
FOR EACH ROW EXECUTE FUNCTION public.pymio_notify_community_event();

CREATE OR REPLACE FUNCTION public.pymio_notify_community_form() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  INSERT INTO public.community_notifications(company_id,community_id,kind,resource_id,title)
    SELECT m.company_id,NEW.community_id,'form_created',NEW.id,NEW.title
    FROM public.community_members m WHERE m.community_id=NEW.community_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS community_forms_community_notification ON public.community_forms;
CREATE TRIGGER community_forms_community_notification
AFTER INSERT ON public.community_forms
FOR EACH ROW EXECUTE FUNCTION public.pymio_notify_community_form();

INSERT INTO public.community_notifications(company_id,community_id,kind,resource_id,title,event_at,created_at)
SELECT m.company_id,p.community_id,'event_created',p.id,p.title,p.event_at,p.created_at
FROM public.network_posts p JOIN public.community_members m ON m.community_id=p.community_id
WHERE p.kind='event' AND p.created_at>=m.joined_at
  AND NOT EXISTS(SELECT 1 FROM public.community_notifications n WHERE n.company_id=m.company_id AND n.kind='event_created' AND n.resource_id=p.id);

INSERT INTO public.community_notifications(company_id,community_id,kind,resource_id,title,created_at)
SELECT m.company_id,f.community_id,'form_created',f.id,f.title,f.created_at
FROM public.community_forms f JOIN public.community_members m ON m.community_id=f.community_id
WHERE f.created_at>=m.joined_at
  AND NOT EXISTS(SELECT 1 FROM public.community_notifications n WHERE n.company_id=m.company_id AND n.kind='form_created' AND n.resource_id=f.id);

COMMIT;
