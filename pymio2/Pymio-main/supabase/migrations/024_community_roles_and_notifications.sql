BEGIN;

CREATE TABLE IF NOT EXISTS public.community_role_notifications(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id bigint NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  role text NOT NULL CHECK(role IN ('admin','member')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS community_role_notifications_company_idx
  ON public.community_role_notifications(company_id,created_at DESC);
ALTER TABLE public.community_role_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.community_role_notifications FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.community_role_notifications TO service_role;

CREATE OR REPLACE FUNCTION public.pymio_community_admin_set(company bigint, community_id uuid, target_company_id bigint, is_admin boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE actor_role text; target_role text;
BEGIN
  SELECT m.role INTO actor_role FROM public.community_members m
    WHERE m.community_id=pymio_community_admin_set.community_id AND m.company_id=company;
  SELECT m.role INTO target_role FROM public.community_members m
    WHERE m.community_id=pymio_community_admin_set.community_id AND m.company_id=target_company_id FOR UPDATE;

  IF actor_role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Solo los administradores pueden asignar este rol.';
  END IF;
  IF target_role IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Este miembro ya no pertenece a la comunidad.';
  END IF;
  IF target_role='owner' THEN
    RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='No puedes cambiar el rol del creador.';
  END IF;
  IF NOT is_admin AND target_role='admin' AND actor_role<>'owner' THEN
    RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Solo el creador de la comunidad puede quitar administradores.';
  END IF;

  IF (is_admin AND target_role<>'admin') OR (NOT is_admin AND target_role='admin') THEN
    UPDATE public.community_members SET role=CASE WHEN is_admin THEN 'admin' ELSE 'member' END,role_since=now()
      WHERE community_members.community_id=pymio_community_admin_set.community_id AND community_members.company_id=target_company_id;
    INSERT INTO public.community_role_notifications(company_id,community_id,role)
      VALUES(target_company_id,community_id,CASE WHEN is_admin THEN 'admin' ELSE 'member' END);
  END IF;

  RETURN public.pymio_community('detail',company,jsonb_build_object('community_id',community_id));
END $$;

CREATE OR REPLACE FUNCTION public.pymio_community_roles(company bigint)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
  SELECT jsonb_build_object(
    'managed_communities',coalesce((
      SELECT jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'role',m.role) ORDER BY CASE m.role WHEN 'owner' THEN 0 ELSE 1 END,c.name)
      FROM public.community_members m JOIN public.communities c ON c.id=m.community_id
      WHERE m.company_id=company AND m.role IN ('owner','admin')
    ),'[]'::jsonb),
    'community_role_notifications',coalesce((
      SELECT jsonb_agg(jsonb_build_object('id',n.id,'community_id',n.community_id,'community_name',c.name,'role',n.role,'created_at',n.created_at) ORDER BY n.created_at DESC)
      FROM (SELECT * FROM public.community_role_notifications rn WHERE rn.company_id=company ORDER BY rn.created_at DESC LIMIT 30) n
      JOIN public.communities c ON c.id=n.community_id
    ),'[]'::jsonb)
  )
$$;

REVOKE ALL ON FUNCTION public.pymio_community_admin_set(bigint,uuid,bigint,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pymio_community_admin_set(bigint,uuid,bigint,boolean) TO service_role;
REVOKE ALL ON FUNCTION public.pymio_community_roles(bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pymio_community_roles(bigint) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
