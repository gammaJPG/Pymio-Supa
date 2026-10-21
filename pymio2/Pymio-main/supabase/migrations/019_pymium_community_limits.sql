BEGIN;

ALTER TABLE public.user_accounts ADD COLUMN IF NOT EXISTS is_pymium boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.pymio_entitlements(operation text, company bigint, payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE premium boolean; owned_count integer; new_id uuid;
BEGIN
  SELECT is_pymium INTO premium FROM public.user_accounts WHERE company_id=company;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='No encontramos la cuenta de esta empresa.'; END IF;

  IF operation='community.create' THEN
    PERFORM pg_advisory_xact_lock(company);
    SELECT count(*) INTO owned_count FROM public.communities WHERE owner_company_id=company;
    IF NOT premium AND owned_count>=1 THEN
      RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Las cuentas básicas pueden crear una comunidad. Hazte Pymium para crear comunidades ilimitadas.';
    END IF;
    INSERT INTO public.communities(owner_company_id,name,description,industry,is_open)
    VALUES(company,btrim(payload->>'name'),btrim(payload->>'description'),btrim(coalesce(payload->>'industry','')),coalesce((payload->>'is_open')::boolean,true)) RETURNING id INTO new_id;
    INSERT INTO public.community_members(community_id,company_id,role) VALUES(new_id,company,'owner');
  ELSIF operation<>'bootstrap' THEN
    RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Operación de beneficios inválida.';
  END IF;

  SELECT count(*) INTO owned_count FROM public.communities WHERE owner_company_id=company;
  RETURN jsonb_build_object(
    'account_plan',CASE WHEN premium THEN 'pymium' ELSE 'basic' END,
    'is_pymium',premium,
    'owned_community_count',owned_count,
    'can_create_community',premium OR owned_count<1,
    'admin_community_ids',coalesce((SELECT jsonb_agg(community_id) FROM public.community_members WHERE company_id=company AND role IN ('owner','admin')),'[]'::jsonb),
    'created_community_id',new_id
  );
END $$;

REVOKE ALL ON FUNCTION public.pymio_entitlements(text,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pymio_entitlements(text,bigint,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
