BEGIN;
ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS store_tagline text NOT NULL DEFAULT '' CHECK (length(store_tagline) <= 140),
  ADD COLUMN IF NOT EXISTS accent_color text NOT NULL DEFAULT '#f4ce4f' CHECK (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  ADD COLUMN IF NOT EXISTS instagram text NOT NULL DEFAULT '' CHECK (length(instagram) <= 240),
  ADD COLUMN IF NOT EXISTS youtube text NOT NULL DEFAULT '' CHECK (length(youtube) <= 240),
  ADD COLUMN IF NOT EXISTS tiktok text NOT NULL DEFAULT '' CHECK (length(tiktok) <= 240),
  ADD COLUMN IF NOT EXISTS facebook text NOT NULL DEFAULT '' CHECK (length(facebook) <= 240),
  ADD COLUMN IF NOT EXISTS linkedin text NOT NULL DEFAULT '' CHECK (length(linkedin) <= 240),
  ADD COLUMN IF NOT EXISTS contact_email text NOT NULL DEFAULT '' CHECK (length(contact_email) <= 180);
CREATE OR REPLACE FUNCTION public.pymio_network(operation text, company bigint, payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE result jsonb; new_id uuid; selected uuid; post_kind text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_accounts WHERE company_id=company) THEN
    RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='No encontramos el perfil de esta empresa.';
  END IF;

  IF operation='profile.update' THEN
    INSERT INTO public.business_profiles(company_id,display_name,description,industry,product_tags,location,website,store_tagline,accent_color,instagram,youtube,tiktok,facebook,linkedin,contact_email,updated_at)
    VALUES(company,btrim(payload->>'display_name'),btrim(coalesce(payload->>'description','')),btrim(coalesce(payload->>'industry','')),
      ARRAY(SELECT DISTINCT btrim(value) FROM jsonb_array_elements_text(coalesce(payload->'product_tags','[]'::jsonb)) value WHERE btrim(value)<>'' LIMIT 12),
      btrim(coalesce(payload->>'location','')),btrim(coalesce(payload->>'website','')),btrim(coalesce(payload->>'store_tagline','')),coalesce(nullif(btrim(payload->>'accent_color'),''),'#f4ce4f'),btrim(coalesce(payload->>'instagram','')),btrim(coalesce(payload->>'youtube','')),btrim(coalesce(payload->>'tiktok','')),btrim(coalesce(payload->>'facebook','')),btrim(coalesce(payload->>'linkedin','')),btrim(coalesce(payload->>'contact_email','')),now())
    ON CONFLICT(company_id) DO UPDATE SET display_name=excluded.display_name,description=excluded.description,industry=excluded.industry,
      product_tags=excluded.product_tags,location=excluded.location,website=excluded.website,store_tagline=excluded.store_tagline,accent_color=excluded.accent_color,instagram=excluded.instagram,youtube=excluded.youtube,tiktok=excluded.tiktok,facebook=excluded.facebook,linkedin=excluded.linkedin,contact_email=excluded.contact_email,updated_at=now();
  ELSIF operation='community.create' THEN
    INSERT INTO public.communities(owner_company_id,name,description,industry)
    VALUES(company,btrim(payload->>'name'),btrim(payload->>'description'),btrim(coalesce(payload->>'industry',''))) RETURNING id INTO new_id;
    INSERT INTO public.community_members(community_id,company_id,role) VALUES(new_id,company,'owner');
  ELSIF operation='community.join' THEN
    selected=(payload->>'community_id')::uuid;
    IF NOT EXISTS(SELECT 1 FROM public.communities WHERE id=selected) THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='La comunidad ya no está disponible.'; END IF;
    INSERT INTO public.community_members(community_id,company_id,role) VALUES(selected,company,'member') ON CONFLICT DO NOTHING;
  ELSIF operation='post.create' THEN
    post_kind=payload->>'kind'; selected=nullif(payload->>'community_id','')::uuid;
    IF selected IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.community_members WHERE community_id=selected AND company_id=company) THEN
      RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Únete a la comunidad antes de publicar en ella.';
    END IF;
    INSERT INTO public.network_posts(author_company_id,community_id,kind,title,description,location,event_at,expires_at)
    VALUES(company,selected,post_kind,btrim(payload->>'title'),btrim(payload->>'description'),btrim(coalesce(payload->>'location','')),
      nullif(payload->>'event_at','')::timestamptz,nullif(payload->>'expires_at','')::timestamptz) RETURNING id INTO new_id;
  ELSIF operation<>'bootstrap' THEN
    RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Operación de red inválida.';
  END IF;

  SELECT jsonb_build_object(
    'profile',(SELECT jsonb_build_object('display_name',coalesce(bp.display_name,ua.business_name),'description',coalesce(bp.description,''),'industry',coalesce(bp.industry,''),
      'product_tags',coalesce(to_jsonb(bp.product_tags),'[]'::jsonb),'location',coalesce(bp.location,''),'website',coalesce(bp.website,''),'store_tagline',coalesce(bp.store_tagline,''),'accent_color',coalesce(bp.accent_color,'#f4ce4f'),'instagram',coalesce(bp.instagram,''),'youtube',coalesce(bp.youtube,''),'tiktok',coalesce(bp.tiktok,''),'facebook',coalesce(bp.facebook,''),'linkedin',coalesce(bp.linkedin,''),'contact_email',coalesce(bp.contact_email,''),'verified',coalesce(bp.verified,false))
      FROM public.user_accounts ua LEFT JOIN public.business_profiles bp ON bp.company_id=ua.company_id WHERE ua.company_id=company),
    'businesses',coalesce((SELECT jsonb_agg(row_data ORDER BY lower(row_data->>'display_name')) FROM (
      SELECT jsonb_build_object('company_id',ua.company_id,'display_name',coalesce(bp.display_name,ua.business_name),'description',coalesce(bp.description,''),
        'industry',coalesce(bp.industry,''),'product_tags',coalesce(to_jsonb(bp.product_tags),'[]'::jsonb),'location',coalesce(bp.location,''),
        'website',coalesce(bp.website,''),'store_tagline',coalesce(bp.store_tagline,''),'accent_color',coalesce(bp.accent_color,'#f4ce4f'),
        'instagram',coalesce(bp.instagram,''),'youtube',coalesce(bp.youtube,''),'tiktok',coalesce(bp.tiktok,''),'facebook',coalesce(bp.facebook,''),
        'linkedin',coalesce(bp.linkedin,''),'contact_email',coalesce(bp.contact_email,''),'verified',coalesce(bp.verified,false),'is_self',ua.company_id=company) row_data
      FROM public.user_accounts ua LEFT JOIN public.business_profiles bp ON bp.company_id=ua.company_id
    ) businesses),'[]'::jsonb),
    'communities',coalesce((SELECT jsonb_agg(row_data ORDER BY row_data->>'created_at' DESC) FROM (
      SELECT jsonb_build_object('id',c.id,'name',c.name,'description',c.description,'industry',c.industry,'created_at',c.created_at,
        'member_count',(SELECT count(*) FROM public.community_members cm WHERE cm.community_id=c.id),
        'joined',EXISTS(SELECT 1 FROM public.community_members cm WHERE cm.community_id=c.id AND cm.company_id=company),
        'owned',c.owner_company_id=company,'owner_name',coalesce(bp.display_name,ua.business_name)) row_data
      FROM public.communities c JOIN public.user_accounts ua ON ua.company_id=c.owner_company_id LEFT JOIN public.business_profiles bp ON bp.company_id=c.owner_company_id
    ) communities),'[]'::jsonb),
    'posts',coalesce((SELECT jsonb_agg(row_data ORDER BY coalesce((row_data->>'event_at')::timestamptz,(row_data->>'created_at')::timestamptz)) FROM (
      SELECT jsonb_build_object('id',p.id,'kind',p.kind,'title',p.title,'description',p.description,'location',p.location,'event_at',p.event_at,
        'expires_at',p.expires_at,'created_at',p.created_at,'community_id',p.community_id,'community_name',c.name,
        'author_name',coalesce(bp.display_name,ua.business_name),'is_author',p.author_company_id=company) row_data
      FROM public.network_posts p JOIN public.user_accounts ua ON ua.company_id=p.author_company_id LEFT JOIN public.business_profiles bp ON bp.company_id=p.author_company_id
      LEFT JOIN public.communities c ON c.id=p.community_id
      WHERE (p.kind='event' AND p.event_at>=now()-interval '1 day') OR (p.kind='benefit' AND (p.expires_at IS NULL OR p.expires_at>=now()))
    ) posts),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.pymio_network(text,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pymio_network(text,bigint,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
