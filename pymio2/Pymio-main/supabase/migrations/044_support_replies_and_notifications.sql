ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS admin_response text CHECK (admin_response IS NULL OR char_length(btrim(admin_response)) BETWEEN 10 AND 5000),
  ADD COLUMN IF NOT EXISTS responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS response_confirmation text CHECK (response_confirmation IS NULL OR response_confirmation IN ('pending','accepted','expired')),
  ADD COLUMN IF NOT EXISTS closed_reason text;

CREATE TABLE IF NOT EXISTS public.support_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('new_ticket','status_pending','status_in_review','status_resolved','reply_received','ticket_expired')),
  title text NOT NULL,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_notifications_recipient_created_idx ON public.support_notifications(recipient_user_id,created_at DESC);
ALTER TABLE public.support_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.support_notifications FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.support_notifications TO service_role;

CREATE OR REPLACE FUNCTION public.pymio_support(operation text, actor_user uuid, actor_company bigint, payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  account_company bigint;
  is_admin boolean;
  selected public.support_tickets%ROWTYPE;
  selected_faq public.support_faqs%ROWTYPE;
  requested_id uuid;
  requested_status text;
BEGIN
  SELECT company_id INTO account_company FROM public.user_accounts WHERE user_id=actor_user;
  IF account_company IS NULL OR account_company<>actor_company THEN
    RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='La sesión no está asociada a esta empresa.';
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.pymio_global_admins WHERE user_id=actor_user) INTO is_admin;

  WITH expired AS (
    UPDATE public.support_tickets
      SET status='resuelto',response_confirmation='expired',closed_reason='confirmation_expired',updated_at=now()
      WHERE status='en_revision' AND response_confirmation='pending' AND confirmation_deadline<=now()
      RETURNING id,user_id,ticket_number
  )
  INSERT INTO public.support_notifications(recipient_user_id,ticket_id,kind,title,description)
    SELECT user_id,id,'ticket_expired','Solicitud #'||ticket_number||' cerrada por expiración',
      'La solicitud se cerró porque venció el plazo de 3 días para confirmar la respuesta. Si aún tienes dudas, envía una nueva solicitud.'
    FROM expired;

  IF operation='capabilities' THEN
    RETURN jsonb_build_object('admin',is_admin,'demo',false);
  ELSIF operation='create' THEN
    INSERT INTO public.support_tickets(user_id,company_id,type,subject,description,request_id)
    VALUES(actor_user,actor_company,payload->>'type',btrim(payload->>'subject'),btrim(payload->>'description'),(payload->>'request_id')::uuid)
    ON CONFLICT(user_id,request_id) DO UPDATE SET request_id=EXCLUDED.request_id
    RETURNING * INTO selected;
    INSERT INTO public.support_notifications(recipient_user_id,ticket_id,kind,title,description)
      SELECT user_id,selected.id,'new_ticket','Nueva solicitud #'||selected.ticket_number,btrim(selected.subject)
      FROM public.pymio_global_admins WHERE user_id<>actor_user;
    RETURN jsonb_build_object('ticket',to_jsonb(selected));
  ELSIF operation='list.mine' THEN
    RETURN jsonb_build_object('tickets',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC) FROM public.support_tickets t WHERE t.user_id=actor_user),'[]'::jsonb));
  ELSIF operation='notifications.list' THEN
    RETURN jsonb_build_object('notifications',coalesce((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.created_at DESC) FROM (SELECT * FROM public.support_notifications WHERE recipient_user_id=actor_user ORDER BY created_at DESC LIMIT 50) n),'[]'::jsonb));
  ELSIF operation='faqs.list' THEN
    RETURN jsonb_build_object('faqs',coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.display_order,f.id) FROM public.support_faqs f WHERE f.active),'[]'::jsonb));
  ELSIF operation='admin.list' THEN
    IF NOT is_admin THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='No tienes permisos de administración de soporte.'; END IF;
    RETURN jsonb_build_object('tickets',coalesce((SELECT jsonb_agg(to_jsonb(t)||jsonb_build_object('business_name',ua.business_name,'email',ua.email) ORDER BY t.created_at DESC)
      FROM public.support_tickets t JOIN public.user_accounts ua ON ua.user_id=t.user_id
      WHERE (coalesce(payload->>'status','')='' OR t.status=payload->>'status') AND (coalesce(payload->>'type','')='' OR t.type=payload->>'type')),'[]'::jsonb));
  ELSIF operation='admin.status' THEN
    IF NOT is_admin THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='No tienes permisos de administración de soporte.'; END IF;
    requested_id:=(payload->>'ticket_id')::uuid; requested_status:=payload->>'status';
    IF requested_status NOT IN ('pendiente','en_revision','resuelto') THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='El estado no es válido.'; END IF;
    SELECT * INTO selected FROM public.support_tickets WHERE id=requested_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='La solicitud no existe.'; END IF;
    IF selected.status IS DISTINCT FROM requested_status THEN
      UPDATE public.support_tickets SET status=requested_status,updated_at=now(),closed_reason=CASE WHEN requested_status='resuelto' THEN 'admin_resolved' ELSE NULL END,
        response_confirmation=CASE WHEN requested_status='resuelto' THEN NULL ELSE response_confirmation END,
        confirmation_deadline=CASE WHEN requested_status='resuelto' THEN NULL ELSE confirmation_deadline END
        WHERE id=requested_id RETURNING * INTO selected;
      INSERT INTO public.support_notifications(recipient_user_id,ticket_id,kind,title,description)
      VALUES(selected.user_id,selected.id,CASE requested_status WHEN 'en_revision' THEN 'status_in_review' WHEN 'resuelto' THEN 'status_resolved' ELSE 'status_pending' END,
        'Solicitud #'||selected.ticket_number||' · '||CASE requested_status WHEN 'en_revision' THEN 'En revisión' WHEN 'resuelto' THEN 'Resuelta' ELSE 'Pendiente' END,
        CASE requested_status WHEN 'en_revision' THEN 'El equipo de soporte comenzó a revisar tu solicitud.' WHEN 'resuelto' THEN 'El equipo de soporte marcó tu solicitud como resuelta.' ELSE 'Tu solicitud volvió al estado pendiente.' END);
    END IF;
    RETURN jsonb_build_object('ticket',to_jsonb(selected));
  ELSIF operation='admin.reply' THEN
    IF NOT is_admin THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='No tienes permisos de administración de soporte.'; END IF;
    requested_id:=(payload->>'ticket_id')::uuid;
    UPDATE public.support_tickets SET admin_response=btrim(payload->>'response'),responded_at=now(),confirmation_deadline=now()+interval '3 days',response_confirmation='pending',closed_reason=NULL,updated_at=now()
      WHERE id=requested_id AND status='en_revision' AND response_confirmation IS DISTINCT FROM 'pending' RETURNING * INTO selected;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='La solicitud debe estar en revisión y no tener una respuesta pendiente de confirmación.'; END IF;
    INSERT INTO public.support_notifications(recipient_user_id,ticket_id,kind,title,description)
      VALUES(selected.user_id,selected.id,'reply_received','Respuesta recibida para la solicitud #'||selected.ticket_number,'Revisa la respuesta y confírmala dentro de los próximos 3 días.');
    RETURN jsonb_build_object('ticket',to_jsonb(selected));
  ELSIF operation='response.accept' THEN
    requested_id:=(payload->>'ticket_id')::uuid;
    UPDATE public.support_tickets SET status='resuelto',response_confirmation='accepted',closed_reason='user_accepted',updated_at=now()
      WHERE id=requested_id AND user_id=actor_user AND status='en_revision' AND response_confirmation='pending' AND confirmation_deadline>now() RETURNING * INTO selected;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='La respuesta ya no está pendiente de confirmación.'; END IF;
    RETURN jsonb_build_object('ticket',to_jsonb(selected));
  ELSIF operation='admin.faq.create' THEN
    IF NOT is_admin THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='No tienes permisos de administración de soporte.'; END IF;
    INSERT INTO public.support_faqs(question,answer,display_order,updated_by)
      VALUES(btrim(payload->>'question'),btrim(payload->>'answer'),coalesce((SELECT max(display_order)+1 FROM public.support_faqs),1),actor_user) RETURNING * INTO selected_faq;
    RETURN jsonb_build_object('faq',to_jsonb(selected_faq));
  ELSIF operation='admin.faq.update' THEN
    IF NOT is_admin THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='No tienes permisos de administración de soporte.'; END IF;
    UPDATE public.support_faqs SET question=btrim(payload->>'question'),answer=btrim(payload->>'answer'),updated_at=now(),updated_by=actor_user
      WHERE id=(payload->>'faq_id')::bigint RETURNING * INTO selected_faq;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='La respuesta rápida no existe.'; END IF;
    RETURN jsonb_build_object('faq',to_jsonb(selected_faq));
  END IF;
  RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='La operación de soporte no es válida.';
END $$;

REVOKE ALL ON FUNCTION public.pymio_support(text,uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pymio_support(text,uuid,bigint,jsonb) TO service_role;
