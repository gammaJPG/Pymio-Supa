CREATE TABLE IF NOT EXISTS public.user_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id bigint NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE RESTRICT,
  email text NOT NULL UNIQUE,
  business_name text NOT NULL CHECK (btrim(business_name) <> '' AND length(business_name) <= 120),
  owner_name text CHECK (owner_name IS NULL OR length(owner_name) <= 120),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_accounts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.user_accounts TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.companies_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.pymio_register_account(
  auth_user uuid,
  account_email text,
  business_name text,
  owner_name text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE company_id bigint; existing public.user_accounts%ROWTYPE;
BEGIN
  SELECT * INTO existing FROM public.user_accounts WHERE user_id = auth_user;
  IF FOUND THEN
    RETURN jsonb_build_object('company_id',existing.company_id,'business_name',existing.business_name,'owner_name',existing.owner_name);
  END IF;
  IF auth_user IS NULL OR account_email IS NULL OR btrim(account_email) = '' OR business_name IS NULL OR btrim(business_name) = '' THEN
    RAISE EXCEPTION USING ERRCODE='PT400', MESSAGE='Faltan datos para crear la cuenta.';
  END IF;
  INSERT INTO public.companies(name,profile)
    VALUES (btrim(business_name)||' · '||left(auth_user::text,8),'Cuenta creada desde Pymio.') RETURNING id INTO company_id;
  INSERT INTO public.user_accounts(user_id,company_id,email,business_name,owner_name)
    VALUES(auth_user,company_id,lower(btrim(account_email)),btrim(business_name),nullif(btrim(owner_name),''));
  RETURN jsonb_build_object('company_id',company_id,'business_name',btrim(business_name),'owner_name',nullif(btrim(owner_name),''));
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='Ya existe una cuenta con esos datos.';
END $$;

CREATE OR REPLACE FUNCTION public.pymio_account_for_user(auth_user uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE account public.user_accounts%ROWTYPE;
BEGIN
  SELECT * INTO account FROM public.user_accounts WHERE user_id = auth_user;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404', MESSAGE='La cuenta no tiene un espacio de trabajo asociado.'; END IF;
  RETURN jsonb_build_object('company_id',account.company_id,'business_name',account.business_name,'owner_name',account.owner_name);
END $$;

REVOKE ALL ON FUNCTION public.pymio_register_account(uuid,text,text,text), public.pymio_account_for_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pymio_register_account(uuid,text,text,text), public.pymio_account_for_user(uuid) TO service_role;
