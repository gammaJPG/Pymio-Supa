BEGIN;

ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS is_open boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.community_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  company_id bigint NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (community_id,company_id)
);

CREATE TABLE IF NOT EXISTS public.business_connections (
  company_a bigint NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  company_b bigint NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by_company_id bigint NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_a,company_b),
  CHECK (company_a < company_b),
  CHECK (created_by_company_id IN (company_a,company_b))
);

CREATE INDEX IF NOT EXISTS community_join_requests_owner_idx ON public.community_join_requests(community_id,status,created_at);
CREATE INDEX IF NOT EXISTS business_connections_company_b_idx ON public.business_connections(company_b,created_at DESC);

ALTER TABLE public.community_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.community_join_requests,public.business_connections FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.community_join_requests,public.business_connections TO service_role;

CREATE OR REPLACE FUNCTION public.pymio_network(operation text, company bigint, payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  result jsonb; new_id uuid; selected uuid; post_kind text; target bigint; request_id uuid;
  community_open boolean; decision text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_accounts WHERE company_id=company) THEN
    RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='No encontramos el perfil de esta empresa.';
  END IF;

  IF operation='profile.update' THEN
    IF coalesce(payload->>'avatar_path','')<>'' AND payload->>'avatar_path' !~ ('^'||company::text||'/avatar/[0-9a-f-]{36}\.webp$') THEN
      RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='La foto de perfil no pertenece a esta empresa.';
    END IF;
    IF coalesce(payload->>'banner_path','')<>'' AND payload->>'banner_path' !~ ('^'||company::text||'/banner/[0-9a-f-]{36}\.webp$') THEN
      RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='La imagen del banner no pertenece a esta empresa.';
    END IF;
    INSERT INTO public.business_profiles(company_id,display_name,description,industry,product_tags,location,website,store_tagline,accent_color,instagram,youtube,tiktok,facebook,linkedin,contact_email,avatar_path,banner_path,updated_at)
    VALUES(company,btrim(payload->>'display_name'),btrim(coalesce(payload->>'description','')),btrim(coalesce(payload->>'industry','')),
      ARRAY(SELECT DISTINCT btrim(value) FROM jsonb_array_elements_text(coalesce(payload->'product_tags','[]'::jsonb)) value WHERE btrim(value)<>'' LIMIT 12),
      btrim(coalesce(payload->>'location','')),btrim(coalesce(payload->>'website','')),btrim(coalesce(payload->>'store_tagline','')),coalesce(nullif(btrim(payload->>'accent_color'),''),'#f4ce4f'),btrim(coalesce(payload->>'instagram','')),btrim(coalesce(payload->>'youtube','')),btrim(coalesce(payload->>'tiktok','')),btrim(coalesce(payload->>'facebook','')),btrim(coalesce(payload->>'linkedin','')),btrim(coalesce(payload->>'contact_email','')),btrim(coalesce(payload->>'avatar_path','')),btrim(coalesce(payload->>'banner_path','')),now())
    ON CONFLICT(company_id) DO UPDATE SET display_name=excluded.display_name,description=excluded.description,industry=excluded.industry,
      product_tags=excluded.product_tags,location=excluded.location,website=excluded.website,store_tagline=excluded.store_tagline,accent_color=excluded.accent_color,instagram=excluded.instagram,youtube=excluded.youtube,tiktok=excluded.tiktok,facebook=excluded.facebook,linkedin=excluded.linkedin,contact_email=excluded.contact_email,avatar_path=excluded.avatar_path,banner_path=excluded.banner_path,updated_at=now();
  ELSIF operation='community.create' THEN
    INSERT INTO public.communities(owner_company_id,name,description,industry,is_open)
    VALUES(company,btrim(payload->>'name'),btrim(payload->>'description'),btrim(coalesce(payload->>'industry','')),coalesce((payload->>'is_open')::boolean,true)) RETURNING id INTO new_id;
    INSERT INTO public.community_members(community_id,company_id,role) VALUES(new_id,company,'owner');
  ELSIF operation='community.join' THEN
    selected=(payload->>'community_id')::uuid;
    SELECT is_open INTO community_open FROM public.communities WHERE id=selected;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='La comunidad ya no está disponible.'; END IF;
    IF EXISTS(SELECT 1 FROM public.community_members WHERE community_id=selected AND company_id=company) THEN
      NULL;
    ELSIF community_open THEN
      INSERT INTO public.community_members(community_id,company_id,role) VALUES(selected,company,'member') ON CONFLICT DO NOTHING;
      DELETE FROM public.community_join_requests WHERE community_id=selected AND company_id=company;
    ELSE
      INSERT INTO public.community_join_requests(community_id,company_id,status,created_at,responded_at)
      VALUES(selected,company,'pending',now(),null)
      ON CONFLICT(community_id,company_id) DO UPDATE SET status='pending',created_at=now(),responded_at=null;
    END IF;
  ELSIF operation='community.request.respond' THEN
    selected=(payload->>'community_id')::uuid; request_id=(payload->>'request_id')::uuid; decision=payload->>'decision';
    IF NOT EXISTS(SELECT 1 FROM public.communities WHERE id=selected AND owner_company_id=company) THEN
      RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Solo quien creó la comunidad puede responder esta solicitud.';
    END IF;
    SELECT company_id INTO target FROM public.community_join_requests WHERE id=request_id AND community_id=selected AND status='pending';
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='La solicitud ya no está disponible.'; END IF;
    IF decision='approve' THEN
      UPDATE public.community_join_requests SET status='approved',responded_at=now() WHERE id=request_id;
      INSERT INTO public.community_members(community_id,company_id,role) VALUES(selected,target,'member') ON CONFLICT DO NOTHING;
    ELSIF decision='reject' THEN
      UPDATE public.community_join_requests SET status='rejected',responded_at=now() WHERE id=request_id;
    ELSE
      RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='La respuesta a la solicitud no es válida.';
    END IF;
  ELSIF operation='connection.create' THEN
    target=(payload->>'target_company_id')::bigint;
    IF target=company THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Tu negocio ya forma parte de tu propia red.'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.user_accounts WHERE company_id=target) THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Este perfil ya no está disponible.'; END IF;
    INSERT INTO public.business_connections(company_a,company_b,created_by_company_id)
    VALUES(least(company,target),greatest(company,target),company) ON CONFLICT DO NOTHING;
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
    'profile',(SELECT jsonb_build_object('company_id',ua.company_id,'display_name',coalesce(bp.display_name,ua.business_name),'description',coalesce(bp.description,''),'industry',coalesce(bp.industry,''),
      'product_tags',coalesce(to_jsonb(bp.product_tags),'[]'::jsonb),'location',coalesce(bp.location,''),'website',coalesce(bp.website,''),'store_tagline',coalesce(bp.store_tagline,''),'accent_color',coalesce(bp.accent_color,'#f4ce4f'),'instagram',coalesce(bp.instagram,''),'youtube',coalesce(bp.youtube,''),'tiktok',coalesce(bp.tiktok,''),'facebook',coalesce(bp.facebook,''),'linkedin',coalesce(bp.linkedin,''),'contact_email',coalesce(bp.contact_email,''),'avatar_path',coalesce(bp.avatar_path,''),'banner_path',coalesce(bp.banner_path,''),'verified',coalesce(bp.verified,false),'is_self',true)
      FROM public.user_accounts ua LEFT JOIN public.business_profiles bp ON bp.company_id=ua.company_id WHERE ua.company_id=company),
    'businesses',coalesce((SELECT jsonb_agg(row_data ORDER BY lower(row_data->>'display_name')) FROM (
      SELECT jsonb_build_object('company_id',ua.company_id,'display_name',coalesce(bp.display_name,ua.business_name),'description',coalesce(bp.description,''),
        'industry',coalesce(bp.industry,''),'product_tags',coalesce(to_jsonb(bp.product_tags),'[]'::jsonb),'location',coalesce(bp.location,''),
        'website',coalesce(bp.website,''),'store_tagline',coalesce(bp.store_tagline,''),'accent_color',coalesce(bp.accent_color,'#f4ce4f'),
        'instagram',coalesce(bp.instagram,''),'youtube',coalesce(bp.youtube,''),'tiktok',coalesce(bp.tiktok,''),'facebook',coalesce(bp.facebook,''),
        'linkedin',coalesce(bp.linkedin,''),'contact_email',coalesce(bp.contact_email,''),'avatar_path',coalesce(bp.avatar_path,''),'banner_path',coalesce(bp.banner_path,''),'verified',coalesce(bp.verified,false),'is_self',ua.company_id=company,
        'connected',EXISTS(SELECT 1 FROM public.business_connections bc WHERE (bc.company_a=company AND bc.company_b=ua.company_id) OR (bc.company_b=company AND bc.company_a=ua.company_id))) row_data
      FROM public.user_accounts ua LEFT JOIN public.business_profiles bp ON bp.company_id=ua.company_id
    ) businesses),'[]'::jsonb),
    'connections',coalesce((SELECT jsonb_agg(row_data ORDER BY lower(row_data->>'display_name')) FROM (
      SELECT jsonb_build_object('company_id',ua.company_id,'display_name',coalesce(bp.display_name,ua.business_name),'description',coalesce(bp.description,''),'industry',coalesce(bp.industry,''),'product_tags',coalesce(to_jsonb(bp.product_tags),'[]'::jsonb),'location',coalesce(bp.location,''),'store_tagline',coalesce(bp.store_tagline,''),'accent_color',coalesce(bp.accent_color,'#f4ce4f'),'avatar_path',coalesce(bp.avatar_path,''),'banner_path',coalesce(bp.banner_path,''),'verified',coalesce(bp.verified,false),'connected',true) row_data
      FROM public.business_connections bc
      JOIN public.user_accounts ua ON ua.company_id=CASE WHEN bc.company_a=company THEN bc.company_b ELSE bc.company_a END
      LEFT JOIN public.business_profiles bp ON bp.company_id=ua.company_id
      WHERE bc.company_a=company OR bc.company_b=company
    ) connections),'[]'::jsonb),
    'communities',coalesce((SELECT jsonb_agg(row_data ORDER BY row_data->>'created_at' DESC) FROM (
      SELECT jsonb_build_object('id',c.id,'name',c.name,'description',c.description,'industry',c.industry,'created_at',c.created_at,'is_open',c.is_open,
        'member_count',(SELECT count(*) FROM public.community_members cm WHERE cm.community_id=c.id),
        'joined',EXISTS(SELECT 1 FROM public.community_members cm WHERE cm.community_id=c.id AND cm.company_id=company),
        'pending_request',EXISTS(SELECT 1 FROM public.community_join_requests jr WHERE jr.community_id=c.id AND jr.company_id=company AND jr.status='pending'),
        'pending_count',(SELECT count(*) FROM public.community_join_requests jr WHERE jr.community_id=c.id AND jr.status='pending'),
        'owned',c.owner_company_id=company,'owner_name',coalesce(bp.display_name,ua.business_name)) row_data
      FROM public.communities c JOIN public.user_accounts ua ON ua.company_id=c.owner_company_id LEFT JOIN public.business_profiles bp ON bp.company_id=c.owner_company_id
    ) communities),'[]'::jsonb),
    'community_requests',coalesce((SELECT jsonb_agg(row_data ORDER BY row_data->>'created_at') FROM (
      SELECT jsonb_build_object('id',jr.id,'community_id',jr.community_id,'community_name',c.name,'company_id',jr.company_id,'created_at',jr.created_at,
        'display_name',coalesce(bp.display_name,ua.business_name),'industry',coalesce(bp.industry,''),'location',coalesce(bp.location,''),'avatar_path',coalesce(bp.avatar_path,''),'verified',coalesce(bp.verified,false)) row_data
      FROM public.community_join_requests jr JOIN public.communities c ON c.id=jr.community_id
      JOIN public.user_accounts ua ON ua.company_id=jr.company_id LEFT JOIN public.business_profiles bp ON bp.company_id=jr.company_id
      WHERE c.owner_company_id=company AND jr.status='pending'
    ) requests),'[]'::jsonb),
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
