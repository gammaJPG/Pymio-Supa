-- Corrige referencias ambiguas entre los parámetros de la función y las
-- columnas de user_accounts al completar una cuenta iniciada con Google.
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
  IF pymio_update_account.auth_user IS NULL
    OR pymio_update_account.business_name IS NULL
    OR btrim(pymio_update_account.business_name) = ''
    OR length(pymio_update_account.business_name) > 120
    OR length(pymio_update_account.owner_name) > 120 THEN
    RAISE EXCEPTION USING ERRCODE='PT400', MESSAGE='Ingresa datos válidos para tu negocio.';
  END IF;

  SELECT ua.* INTO account
  FROM public.user_accounts AS ua
  WHERE ua.user_id = pymio_update_account.auth_user;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='PT404', MESSAGE='La cuenta no tiene un espacio de trabajo asociado.';
  END IF;

  UPDATE public.companies AS c
  SET name=btrim(pymio_update_account.business_name)||' · '||left(pymio_update_account.auth_user::text,8)
  WHERE c.id=account.company_id;

  UPDATE public.user_accounts AS ua
  SET business_name=btrim(pymio_update_account.business_name),
      owner_name=nullif(btrim(pymio_update_account.owner_name),'')
  WHERE ua.user_id=pymio_update_account.auth_user
  RETURNING * INTO account;

  RETURN jsonb_build_object(
    'company_id',account.company_id,
    'business_name',account.business_name,
    'owner_name',account.owner_name
  );
END $$;

REVOKE ALL ON FUNCTION public.pymio_update_account(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pymio_update_account(uuid,text,text) TO service_role;
