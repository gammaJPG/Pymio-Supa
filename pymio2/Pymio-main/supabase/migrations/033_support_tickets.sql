CREATE TABLE IF NOT EXISTS public.pymio_global_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  company_id bigint NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  type text NOT NULL CHECK (type IN ('problema','sugerencia','consulta')),
  subject text NOT NULL CHECK (char_length(btrim(subject)) BETWEEN 3 AND 160),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 10 AND 5000),
  status text NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','en_revision','resuelto')),
  request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,request_id)
);

CREATE INDEX IF NOT EXISTS support_tickets_user_created_idx ON public.support_tickets(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_admin_filter_idx ON public.support_tickets(status,type,created_at DESC);

ALTER TABLE public.pymio_global_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pymio_global_admins,public.support_tickets FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.pymio_global_admins,public.support_tickets TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.support_tickets_ticket_number_seq TO service_role;

CREATE OR REPLACE FUNCTION public.pymio_support(operation text, actor_user uuid, actor_company bigint, payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  account_company bigint;
  is_admin boolean;
  selected public.support_tickets%ROWTYPE;
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
  END IF;
  RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='La operación de soporte no es válida.';
END $$;

REVOKE ALL ON FUNCTION public.pymio_support(text,uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pymio_support(text,uuid,bigint,jsonb) TO service_role;

DO $$
DECLARE initial_admin uuid;
BEGIN
  SELECT user_id INTO initial_admin FROM public.user_accounts WHERE lower(email)='tino@empresas.cl';
  IF initial_admin IS NULL THEN
    RAISE EXCEPTION 'No existe la cuenta tino@empresas.cl. Crea o verifica la cuenta antes de aplicar 027_support_tickets.sql.';
  END IF;
  INSERT INTO public.pymio_global_admins(user_id,created_by) VALUES(initial_admin,initial_admin) ON CONFLICT(user_id) DO NOTHING;
END $$;
