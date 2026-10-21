BEGIN;

ALTER TABLE public.business_private_activity
  ADD COLUMN IF NOT EXISTS thread_id uuid,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.business_private_activity SET thread_id=gen_random_uuid() WHERE thread_id IS NULL;
ALTER TABLE public.business_private_activity ALTER COLUMN thread_id SET DEFAULT gen_random_uuid();
ALTER TABLE public.business_private_activity ALTER COLUMN thread_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS business_private_activity_thread_idx ON public.business_private_activity(thread_id,created_at);
CREATE INDEX IF NOT EXISTS business_private_activity_sender_idx ON public.business_private_activity(sender_company_id,created_at DESC);

CREATE OR REPLACE FUNCTION public.pymio_connections(operation text, company bigint, payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE target bigint; selected uuid; decision text; activity_kind text; selected_thread uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_accounts WHERE company_id=company) THEN
    RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='No encontramos el perfil de esta empresa.';
  END IF;

  IF operation='connection.request' THEN
    target=(payload->>'target_company_id')::bigint;
    IF target=company THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='No puedes conectarte con tu propio negocio.'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.user_accounts WHERE company_id=target) THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Este perfil ya no está disponible.'; END IF;
    IF EXISTS(SELECT 1 FROM public.business_connections WHERE company_a=least(company,target) AND company_b=greatest(company,target)) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Esta empresa ya forma parte de tu red.'; END IF;
    INSERT INTO public.business_connection_requests(requester_company_id,recipient_company_id,status,created_at,responded_at)
    VALUES(company,target,'pending',now(),null);
  ELSIF operation='connection.respond' THEN
    selected=(payload->>'request_id')::uuid;decision=payload->>'decision';
    SELECT requester_company_id INTO target FROM public.business_connection_requests WHERE id=selected AND recipient_company_id=company AND status='pending' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='La solicitud ya no está disponible.'; END IF;
    IF decision='accept' THEN
      UPDATE public.business_connection_requests SET status='accepted',responded_at=now() WHERE id=selected;
      INSERT INTO public.business_connections(company_a,company_b,created_by_company_id)
      VALUES(least(company,target),greatest(company,target),target) ON CONFLICT DO NOTHING;
    ELSIF decision='reject' THEN
      UPDATE public.business_connection_requests SET status='rejected',responded_at=now() WHERE id=selected;
    ELSE RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='La respuesta no es válida.'; END IF;
  ELSIF operation='activity.create' THEN
    target=(payload->>'target_company_id')::bigint;activity_kind=payload->>'kind';
    IF NOT EXISTS(SELECT 1 FROM public.business_connections WHERE company_a=least(company,target) AND company_b=greatest(company,target)) THEN
      RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Solo puedes contactar de forma privada a empresas de tu red.';
    END IF;
    IF activity_kind NOT IN ('message','quote_request','offer','business_update') THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='El tipo de comunicación no es válido.'; END IF;
    IF nullif(payload->>'thread_id','') IS NOT NULL THEN
      selected_thread=(payload->>'thread_id')::uuid;
      IF NOT EXISTS(SELECT 1 FROM public.business_private_activity WHERE thread_id=selected_thread AND (sender_company_id=company OR recipient_company_id=company) AND (sender_company_id=target OR recipient_company_id=target)) THEN
        RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Esta conversación no está disponible.';
      END IF;
    ELSE selected_thread=gen_random_uuid(); END IF;
    INSERT INTO public.business_private_activity(sender_company_id,recipient_company_id,kind,subject,body,thread_id,metadata)
    VALUES(company,target,activity_kind,btrim(coalesce(payload->>'subject','')),btrim(payload->>'body'),selected_thread,coalesce(payload->'metadata','{}'::jsonb));
  ELSIF operation='activity.read' THEN
    selected_thread=(payload->>'thread_id')::uuid;
    UPDATE public.business_private_activity SET read_at=coalesce(read_at,now()) WHERE thread_id=selected_thread AND recipient_company_id=company;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Esta conversación no está disponible.'; END IF;
  ELSIF operation<>'bootstrap' THEN
    RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Operación de conexión inválida.';
  END IF;

  RETURN jsonb_build_object(
    'connection_requests',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'company_id',r.requester_company_id,'display_name',coalesce(bp.display_name,ua.business_name),'industry',coalesce(bp.industry,''),'location',coalesce(bp.location,''),'avatar_path',coalesce(bp.avatar_path,''),'created_at',r.created_at) ORDER BY r.created_at DESC) FROM public.business_connection_requests r JOIN public.user_accounts ua ON ua.company_id=r.requester_company_id LEFT JOIN public.business_profiles bp ON bp.company_id=r.requester_company_id WHERE r.recipient_company_id=company AND r.status='pending'),'[]'::jsonb),
    'outgoing_connection_requests',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'company_id',r.recipient_company_id,'status',r.status,'created_at',r.created_at) ORDER BY r.created_at DESC) FROM public.business_connection_requests r WHERE r.requester_company_id=company AND r.status='pending'),'[]'::jsonb),
    'connection_responses',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'company_id',r.recipient_company_id,'display_name',coalesce(bp.display_name,ua.business_name),'responded_at',r.responded_at) ORDER BY r.responded_at DESC) FROM public.business_connection_requests r JOIN public.user_accounts ua ON ua.company_id=r.recipient_company_id LEFT JOIN public.business_profiles bp ON bp.company_id=r.recipient_company_id WHERE r.requester_company_id=company AND r.status='accepted'),'[]'::jsonb),
    'private_notifications',coalesce((SELECT jsonb_agg(row_data ORDER BY (row_data->>'created_at')::timestamptz DESC) FROM (SELECT jsonb_build_object('id',a.id,'thread_id',a.thread_id,'company_id',a.sender_company_id,'display_name',coalesce(bp.display_name,ua.business_name),'kind',a.kind,'subject',a.subject,'body',a.body,'created_at',a.created_at,'read_at',a.read_at) row_data FROM public.business_private_activity a JOIN public.user_accounts ua ON ua.company_id=a.sender_company_id LEFT JOIN public.business_profiles bp ON bp.company_id=a.sender_company_id WHERE a.recipient_company_id=company ORDER BY a.created_at DESC LIMIT 30) recent),'[]'::jsonb),
    'private_activity',coalesce((SELECT jsonb_agg(row_data ORDER BY (row_data->>'created_at')::timestamptz ASC) FROM (SELECT jsonb_build_object('id',a.id,'thread_id',a.thread_id,'sender_company_id',a.sender_company_id,'recipient_company_id',a.recipient_company_id,'sender_name',coalesce(sbp.display_name,sua.business_name),'recipient_name',coalesce(rbp.display_name,rua.business_name),'kind',a.kind,'subject',a.subject,'body',a.body,'metadata',a.metadata,'created_at',a.created_at,'read_at',a.read_at,'direction',CASE WHEN a.sender_company_id=company THEN 'sent' ELSE 'received' END) row_data FROM public.business_private_activity a JOIN public.user_accounts sua ON sua.company_id=a.sender_company_id JOIN public.user_accounts rua ON rua.company_id=a.recipient_company_id LEFT JOIN public.business_profiles sbp ON sbp.company_id=a.sender_company_id LEFT JOIN public.business_profiles rbp ON rbp.company_id=a.recipient_company_id WHERE a.sender_company_id=company OR a.recipient_company_id=company ORDER BY a.created_at DESC LIMIT 200) recent),'[]'::jsonb)
  );
END $$;

REVOKE ALL ON FUNCTION public.pymio_connections(text,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pymio_connections(text,bigint,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
