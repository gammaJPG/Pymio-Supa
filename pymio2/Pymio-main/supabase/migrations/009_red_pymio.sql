BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.business_profiles (
  company_id bigint PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (btrim(display_name) <> '' AND length(display_name) <= 120),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  industry text NOT NULL DEFAULT '' CHECK (length(industry) <= 80),
  product_tags text[] NOT NULL DEFAULT '{}',
  location text NOT NULL DEFAULT '' CHECK (length(location) <= 120),
  website text NOT NULL DEFAULT '' CHECK (length(website) <= 240),
  verified boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_company_id bigint NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 100),
  description text NOT NULL CHECK (btrim(description) <> '' AND length(description) <= 500),
  industry text NOT NULL DEFAULT '' CHECK (length(industry) <= 80),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.community_members (
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  company_id bigint NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id,company_id)
);

CREATE TABLE IF NOT EXISTS public.network_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_company_id bigint NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  community_id uuid REFERENCES public.communities(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('event','benefit')),
  title text NOT NULL CHECK (btrim(title) <> '' AND length(title) <= 140),
  description text NOT NULL CHECK (btrim(description) <> '' AND length(description) <= 700),
  location text NOT NULL DEFAULT '' CHECK (length(location) <= 160),
  event_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'event' OR event_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS communities_created_at_idx ON public.communities(created_at DESC);
CREATE INDEX IF NOT EXISTS community_members_company_idx ON public.community_members(company_id);
CREATE INDEX IF NOT EXISTS network_posts_kind_date_idx ON public.network_posts(kind,event_at,created_at DESC);

ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.network_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_profiles,public.communities,public.community_members,public.network_posts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.business_profiles,public.communities,public.community_members,public.network_posts TO service_role;

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
    INSERT INTO public.business_profiles(company_id,display_name,description,industry,product_tags,location,website,updated_at)
    VALUES(company,btrim(payload->>'display_name'),btrim(coalesce(payload->>'description','')),btrim(coalesce(payload->>'industry','')),
      ARRAY(SELECT DISTINCT btrim(value) FROM jsonb_array_elements_text(coalesce(payload->'product_tags','[]'::jsonb)) value WHERE btrim(value)<>'' LIMIT 12),
      btrim(coalesce(payload->>'location','')),btrim(coalesce(payload->>'website','')),now())
    ON CONFLICT(company_id) DO UPDATE SET display_name=excluded.display_name,description=excluded.description,industry=excluded.industry,
      product_tags=excluded.product_tags,location=excluded.location,website=excluded.website,updated_at=now();
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
      'product_tags',coalesce(to_jsonb(bp.product_tags),'[]'::jsonb),'location',coalesce(bp.location,''),'website',coalesce(bp.website,''),'verified',coalesce(bp.verified,false))
      FROM public.user_accounts ua LEFT JOIN public.business_profiles bp ON bp.company_id=ua.company_id WHERE ua.company_id=company),
    'businesses',coalesce((SELECT jsonb_agg(row_data ORDER BY lower(row_data->>'display_name')) FROM (
      SELECT jsonb_build_object('company_id',ua.company_id,'display_name',coalesce(bp.display_name,ua.business_name),'description',coalesce(bp.description,''),
        'industry',coalesce(bp.industry,''),'product_tags',coalesce(to_jsonb(bp.product_tags),'[]'::jsonb),'location',coalesce(bp.location,''),
        'website',coalesce(bp.website,''),'verified',coalesce(bp.verified,false),'is_self',ua.company_id=company) row_data
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
