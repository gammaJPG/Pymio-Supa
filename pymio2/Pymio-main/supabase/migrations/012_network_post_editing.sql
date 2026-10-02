BEGIN;

CREATE OR REPLACE FUNCTION public.pymio_network_post_update(company bigint, post_id uuid, payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE selected uuid; post_kind text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_accounts WHERE company_id=company) THEN
    RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='No encontramos el perfil de esta empresa.';
  END IF;

  post_kind=payload->>'kind';
  selected=nullif(payload->>'community_id','')::uuid;
  IF selected IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.community_members WHERE community_id=selected AND company_id=company
  ) THEN
    RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Únete a la comunidad antes de publicar en ella.';
  END IF;

  UPDATE public.network_posts
  SET community_id=selected,
      kind=post_kind,
      title=btrim(payload->>'title'),
      description=btrim(payload->>'description'),
      location=btrim(coalesce(payload->>'location','')),
      event_at=nullif(payload->>'event_at','')::timestamptz,
      expires_at=nullif(payload->>'expires_at','')::timestamptz
  WHERE id=post_id AND author_company_id=company;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Solo la empresa creadora puede editar esta publicación.';
  END IF;

  RETURN public.pymio_network('bootstrap',company,'{}'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public.pymio_network_post_update(bigint,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pymio_network_post_update(bigint,uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';

COMMIT;
