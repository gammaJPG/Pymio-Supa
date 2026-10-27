CREATE TABLE IF NOT EXISTS public.support_faqs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  question text NOT NULL CHECK (char_length(btrim(question)) BETWEEN 5 AND 200),
  answer text NOT NULL CHECK (char_length(btrim(answer)) BETWEEN 10 AND 3000),
  display_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.support_faqs(question,answer,display_order) SELECT seed.question,seed.answer,seed.display_order
FROM (VALUES
  ('¿Cómo agrego productos al inventario?','Entra a Inventario, selecciona “Agregar o modificar” y luego “Agregar producto”. Completa sus datos y guarda.',1),
  ('¿Cómo registro una venta?','Abre Movimientos y selecciona “Registrar venta”. El stock se descontará de los productos incluidos.',2),
  ('¿Por qué el dashboard no muestra mis últimos cambios?','Usa “Actualizar datos”. Si registraste movimientos sin conexión, espera a que finalice la sincronización.',3),
  ('¿Cómo modifico los datos de mi cuenta?','Abre el menú de cuenta desde tu nombre o avatar. Allí encontrarás las opciones disponibles para tu perfil y seguridad.',4)
) AS seed(question,answer,display_order)
WHERE NOT EXISTS (SELECT 1 FROM public.support_faqs);

ALTER TABLE public.support_faqs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.support_faqs FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.support_faqs TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.support_faqs_id_seq TO service_role;

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

  IF operation='capabilities' THEN
    RETURN jsonb_build_object('admin',is_admin,'demo',false);
  ELSIF operation='create' THEN
    INSERT INTO public.support_tickets(user_id,company_id,type,subject,description,request_id)
    VALUES(actor_user,actor_company,payload->>'type',btrim(payload->>'subject'),btrim(payload->>'description'),(payload->>'request_id')::uuid)
    ON CONFLICT(user_id,request_id) DO UPDATE SET request_id=EXCLUDED.request_id
    RETURNING * INTO selected;
    RETURN jsonb_build_object('ticket',to_jsonb(selected));
  ELSIF operation='list.mine' THEN
    RETURN jsonb_build_object('tickets',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC) FROM public.support_tickets t WHERE t.user_id=actor_user),'[]'::jsonb));
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
    UPDATE public.support_tickets SET status=requested_status,updated_at=now() WHERE id=requested_id RETURNING * INTO selected;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='La solicitud no existe.'; END IF;
    RETURN jsonb_build_object('ticket',to_jsonb(selected));
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
