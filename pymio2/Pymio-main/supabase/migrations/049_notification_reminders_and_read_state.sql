BEGIN;

ALTER TABLE public.community_forms ADD COLUMN IF NOT EXISTS closes_at timestamptz;

ALTER TABLE public.community_notifications
  ADD COLUMN IF NOT EXISTS last_triggered_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS requires_resolution boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS days_remaining integer;

ALTER TABLE public.community_notifications DROP CONSTRAINT IF EXISTS community_notifications_kind_check;
ALTER TABLE public.community_notifications ADD CONSTRAINT community_notifications_kind_check
  CHECK(kind IN ('event_created','event_updated','event_deleted','event_reminder','event_today','form_created','form_reopened','form_reminder','form_closed'));

CREATE INDEX IF NOT EXISTS community_notifications_company_triggered_idx
  ON public.community_notifications(company_id,last_triggered_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS community_notifications_daily_reminder_idx
  ON public.community_notifications(company_id,kind,resource_id,((last_triggered_at AT TIME ZONE 'America/Santiago')::date))
  WHERE kind IN ('form_reminder','event_reminder','event_today');

CREATE TABLE IF NOT EXISTS public.notification_reads(
  company_id bigint NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  notification_id text NOT NULL CHECK(char_length(notification_id) BETWEEN 1 AND 180),
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(company_id,notification_id)
);
CREATE INDEX IF NOT EXISTS notification_reads_company_time_idx ON public.notification_reads(company_id,read_at DESC);
ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_reads FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.notification_reads TO service_role;

CREATE OR REPLACE FUNCTION public.pymio_create_community_form(company bigint,payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cid uuid; fid uuid; q jsonb; role_name text; closes timestamptz;
BEGIN
  cid=nullif(payload->>'community_id','')::uuid;
  closes=nullif(payload->>'closes_at','')::timestamptz;
  SELECT role INTO role_name FROM public.community_members WHERE community_id=cid AND company_id=company;
  IF role_name NOT IN ('owner','admin') THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Solo los administradores pueden crear formularios.'; END IF;
  IF closes IS NOT NULL AND closes<=now() THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='La fecha de cierre debe estar en el futuro.'; END IF;
  IF jsonb_array_length(coalesce(payload->'questions','[]')) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Incluye entre 1 y 20 preguntas.'; END IF;
  INSERT INTO public.community_forms(community_id,created_by_company_id,title,closes_at)
    VALUES(cid,company,btrim(payload->>'title'),closes) RETURNING id INTO fid;
  FOR q IN SELECT value FROM jsonb_array_elements(payload->'questions') LOOP
    IF q->>'type' NOT IN ('text','select','file') OR btrim(coalesce(q->>'title',''))='' THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Revisa las preguntas del formulario.'; END IF;
    IF q->>'type'='select' AND jsonb_array_length(coalesce(q->'options','[]'))<1 THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Las listas desplegables necesitan alternativas.'; END IF;
    INSERT INTO public.community_form_questions(form_id,position,title,response_type,options)
      VALUES(fid,(q->>'position')::smallint,btrim(q->>'title'),q->>'type',coalesce(q->'options','[]'));
  END LOOP;
  RETURN public.pymio_community('detail',company,jsonb_build_object('community_id',cid));
END $$;
REVOKE ALL ON FUNCTION public.pymio_create_community_form(bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pymio_create_community_form(bigint,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.pymio_notify_community_form() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE notification_kind text;
BEGIN
  IF TG_OP='INSERT' THEN notification_kind:='form_created';
  ELSIF OLD.status='closed' AND NEW.status='open' THEN notification_kind:='form_reopened';
  ELSIF OLD.status='open' AND NEW.status='closed' THEN notification_kind:='form_closed';
  ELSE RETURN NEW;
  END IF;
  INSERT INTO public.community_notifications(company_id,community_id,kind,resource_id,title,last_triggered_at)
    SELECT m.company_id,NEW.community_id,notification_kind,NEW.id,NEW.title,now()
    FROM public.community_members m WHERE m.community_id=NEW.community_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS community_forms_community_notification ON public.community_forms;
CREATE TRIGGER community_forms_community_notification
AFTER INSERT OR UPDATE OF status ON public.community_forms
FOR EACH ROW EXECUTE FUNCTION public.pymio_notify_community_form();

CREATE OR REPLACE FUNCTION public.pymio_generate_community_reminders() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE generated integer:=0; affected integer;
BEGIN
  UPDATE public.community_forms SET status='closed',closed_at=coalesce(closed_at,now())
    WHERE status='open' AND closes_at IS NOT NULL AND closes_at<=now();

  INSERT INTO public.community_notifications(company_id,community_id,kind,resource_id,title,last_triggered_at,requires_resolution,days_remaining)
  SELECT m.company_id,f.community_id,'form_reminder',f.id,f.title,now(),true,
    greatest(0,ceil(extract(epoch FROM (f.closes_at-now()))/86400.0)::integer)
  FROM public.community_forms f
  JOIN public.community_members m ON m.community_id=f.community_id
  WHERE f.status='open' AND f.closes_at IS NOT NULL AND f.closes_at>now() AND f.closes_at<=now()+interval '7 days'
    AND m.company_id<>f.created_by_company_id
    AND NOT EXISTS(SELECT 1 FROM public.community_form_responses r WHERE r.form_id=f.id AND r.company_id=m.company_id)
    AND NOT EXISTS(SELECT 1 FROM public.community_notifications n WHERE n.company_id=m.company_id AND n.kind='form_reminder' AND n.resource_id=f.id AND (n.last_triggered_at AT TIME ZONE 'America/Santiago')::date=(now() AT TIME ZONE 'America/Santiago')::date);
  GET DIAGNOSTICS affected=ROW_COUNT; generated:=generated+affected;

  INSERT INTO public.community_notifications(company_id,community_id,kind,resource_id,title,event_at,last_triggered_at,requires_resolution,days_remaining)
  SELECT m.company_id,p.community_id,
    CASE WHEN (p.event_at AT TIME ZONE 'America/Santiago')::date=(now() AT TIME ZONE 'America/Santiago')::date THEN 'event_today' ELSE 'event_reminder' END,
    p.id,p.title,p.event_at,now(),coalesce(p.request_attendance,false),
    greatest(0,ceil(extract(epoch FROM (p.event_at-now()))/86400.0)::integer)
  FROM public.network_posts p
  JOIN public.community_members m ON m.community_id=p.community_id
  WHERE p.kind='event' AND p.event_at>=now() AND p.event_at<=now()+interval '7 days' AND m.company_id<>p.author_company_id
    AND (NOT coalesce(p.request_attendance,false) OR NOT EXISTS(SELECT 1 FROM public.community_event_responses r WHERE r.event_id=p.id AND r.company_id=m.company_id))
    AND NOT EXISTS(SELECT 1 FROM public.community_notifications n WHERE n.company_id=m.company_id AND n.kind IN ('event_reminder','event_today') AND n.resource_id=p.id AND (n.last_triggered_at AT TIME ZONE 'America/Santiago')::date=(now() AT TIME ZONE 'America/Santiago')::date);
  GET DIAGNOSTICS affected=ROW_COUNT; generated:=generated+affected;
  RETURN generated;
END $$;
REVOKE ALL ON FUNCTION public.pymio_generate_community_reminders() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pymio_generate_community_reminders() TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
