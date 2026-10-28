BEGIN;

ALTER TABLE public.community_notifications
  DROP CONSTRAINT IF EXISTS community_notifications_kind_check;

ALTER TABLE public.community_notifications
  ADD CONSTRAINT community_notifications_kind_check
  CHECK(kind IN ('event_created','event_updated','event_deleted','form_created','form_reopened'));

CREATE OR REPLACE FUNCTION public.pymio_notify_community_form() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE notification_kind text;
BEGIN
  IF TG_OP='INSERT' THEN
    notification_kind:='form_created';
  ELSIF OLD.status='closed' AND NEW.status='open' THEN
    notification_kind:='form_reopened';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.community_notifications(company_id,community_id,kind,resource_id,title)
    SELECT m.company_id,NEW.community_id,notification_kind,NEW.id,NEW.title
    FROM public.community_members m WHERE m.community_id=NEW.community_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS community_forms_community_notification ON public.community_forms;
CREATE TRIGGER community_forms_community_notification
AFTER INSERT OR UPDATE OF status ON public.community_forms
FOR EACH ROW EXECUTE FUNCTION public.pymio_notify_community_form();

REVOKE ALL ON FUNCTION public.pymio_notify_community_form() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pymio_notify_community_form() TO service_role;

COMMIT;
