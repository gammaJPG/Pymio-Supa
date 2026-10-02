CREATE OR REPLACE FUNCTION public.pymio_update_account(
  auth_user uuid,
  business_name text,
  owner_name text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE account public.user_accounts%ROWTYPE;
BEGIN
  IF auth_user IS NULL OR business_name IS NULL OR btrim(business_name) = '' OR length(business_name) > 120 OR length(owner_name) > 120 THEN
    RAISE EXCEPTION USING ERRCODE='PT400', MESSAGE='Ingresa datos válidos para tu negocio.';
  END IF;
  SELECT * INTO account FROM public.user_accounts WHERE user_id = auth_user;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404', MESSAGE='La cuenta no tiene un espacio de trabajo asociado.'; END IF;
  UPDATE public.companies SET name=btrim(business_name)||' · '||left(auth_user::text,8) WHERE id=account.company_id;
  UPDATE public.user_accounts SET business_name=btrim(business_name),owner_name=nullif(btrim(owner_name),'') WHERE user_id=auth_user
    RETURNING * INTO account;
  RETURN jsonb_build_object('company_id',account.company_id,'business_name',account.business_name,'owner_name',account.owner_name);
END $$;

REVOKE ALL ON FUNCTION public.pymio_update_account(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pymio_update_account(uuid,text,text) TO service_role;
