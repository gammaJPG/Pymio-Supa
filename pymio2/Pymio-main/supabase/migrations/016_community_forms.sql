BEGIN;

ALTER TABLE public.community_members DROP CONSTRAINT IF EXISTS community_members_role_check;
ALTER TABLE public.community_members ADD CONSTRAINT community_members_role_check CHECK(role IN ('owner','admin','member'));
ALTER TABLE public.community_members ADD COLUMN IF NOT EXISTS role_since timestamptz NOT NULL DEFAULT now();
UPDATE public.community_members SET role_since=joined_at WHERE role_since IS NULL OR role_since>joined_at;

CREATE TABLE IF NOT EXISTS public.community_forms(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  created_by_company_id bigint NOT NULL REFERENCES public.companies(id), title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 140),
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')), created_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.community_form_questions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), form_id uuid NOT NULL REFERENCES public.community_forms(id) ON DELETE CASCADE,
  position smallint NOT NULL CHECK(position BETWEEN 1 AND 20), title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 200),
  response_type text NOT NULL CHECK(response_type IN ('text','select','file')), options jsonb NOT NULL DEFAULT '[]', UNIQUE(form_id,position)
);
CREATE TABLE IF NOT EXISTS public.community_form_responses(
  id uuid PRIMARY KEY, form_id uuid NOT NULL REFERENCES public.community_forms(id) ON DELETE CASCADE,
  company_id bigint NOT NULL REFERENCES public.companies(id), submitted_at timestamptz NOT NULL DEFAULT now(), UNIQUE(form_id,company_id)
);
CREATE TABLE IF NOT EXISTS public.community_form_answers(
  response_id uuid NOT NULL REFERENCES public.community_form_responses(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.community_form_questions(id) ON DELETE CASCADE,
  text_value text, option_value text, file_path text, file_name text, mime_type text, compressed boolean NOT NULL DEFAULT false,
  PRIMARY KEY(response_id,question_id)
);
CREATE INDEX IF NOT EXISTS community_forms_community_idx ON public.community_forms(community_id,created_at DESC);
CREATE INDEX IF NOT EXISTS community_members_order_idx ON public.community_members(community_id,joined_at,company_id);
ALTER TABLE public.community_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_form_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_form_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_form_answers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.community_forms,public.community_form_questions,public.community_form_responses,public.community_form_answers FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.community_forms,public.community_form_questions,public.community_form_responses,public.community_form_answers TO service_role;
INSERT INTO storage.buckets(id,name,public,file_size_limit) VALUES('community-form-files','community-form-files',false,2621440)
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=2621440;

CREATE OR REPLACE FUNCTION public.pymio_community(operation text, company bigint, payload jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cid uuid; fid uuid; rid uuid; result jsonb; q jsonb; role_name text; form_status text;
BEGIN
  cid=nullif(payload->>'community_id','')::uuid; fid=nullif(payload->>'form_id','')::uuid; rid=nullif(payload->>'response_id','')::uuid;
  IF cid IS NOT NULL THEN SELECT role INTO role_name FROM public.community_members WHERE community_id=cid AND company_id=company; END IF;
  IF operation='detail' THEN
    IF NOT EXISTS(SELECT 1 FROM public.communities WHERE id=cid) THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='La comunidad ya no está disponible.'; END IF;
  ELSIF operation='admin.set' THEN
    IF role_name<>'owner' THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Solo el creador puede administrar los roles.'; END IF;
    UPDATE public.community_members SET role=CASE WHEN coalesce((payload->>'is_admin')::boolean,false) THEN 'admin' ELSE 'member' END,role_since=now()
    WHERE community_id=cid AND company_id=(payload->>'target_company_id')::bigint AND role<>'owner';
  ELSIF operation='form.create' THEN
    IF role_name NOT IN ('owner','admin') THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Solo los administradores pueden crear formularios.'; END IF;
    IF jsonb_array_length(coalesce(payload->'questions','[]')) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Incluye entre 1 y 20 preguntas.'; END IF;
    INSERT INTO public.community_forms(community_id,created_by_company_id,title) VALUES(cid,company,btrim(payload->>'title')) RETURNING id INTO fid;
    FOR q IN SELECT value FROM jsonb_array_elements(payload->'questions') LOOP
      IF q->>'type' NOT IN ('text','select','file') OR btrim(coalesce(q->>'title',''))='' THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Revisa las preguntas del formulario.'; END IF;
      IF q->>'type'='select' AND jsonb_array_length(coalesce(q->'options','[]'))<1 THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Las listas desplegables necesitan alternativas.'; END IF;
      INSERT INTO public.community_form_questions(form_id,position,title,response_type,options)
      VALUES(fid,(q->>'position')::smallint,btrim(q->>'title'),q->>'type',coalesce(q->'options','[]'));
    END LOOP;
  ELSIF operation='form.close' THEN
    SELECT f.status,f.community_id,m.role INTO form_status,cid,role_name FROM public.community_forms f JOIN public.community_members m ON m.community_id=f.community_id AND m.company_id=company WHERE f.id=fid;
    IF role_name NOT IN ('owner','admin') THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Solo los administradores pueden cerrar formularios.'; END IF;
    UPDATE public.community_forms SET status='closed',closed_at=now() WHERE id=fid;
  ELSIF operation='form.submit' THEN
    SELECT f.status,f.community_id INTO form_status,cid FROM public.community_forms f WHERE f.id=fid;
    IF form_status<>'open' OR NOT EXISTS(SELECT 1 FROM public.community_members WHERE community_id=cid AND company_id=company) THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Este formulario no admite respuestas.'; END IF;
    INSERT INTO public.community_form_responses(id,form_id,company_id) VALUES(rid,fid,company);
    FOR q IN SELECT value FROM jsonb_array_elements(coalesce(payload->'answers','[]')) LOOP
      INSERT INTO public.community_form_answers(response_id,question_id,text_value,option_value,file_path,file_name,mime_type,compressed)
      VALUES(rid,(q->>'question_id')::uuid,nullif(q->>'text_value',''),nullif(q->>'option_value',''),nullif(q->>'file_path',''),nullif(q->>'file_name',''),nullif(q->>'mime_type',''),coalesce((q->>'compressed')::boolean,false));
    END LOOP;
  ELSIF operation NOT IN ('detail','form.get','form.export') THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Operación de comunidad inválida.';
  END IF;

  IF operation='form.get' THEN SELECT community_id INTO cid FROM public.community_forms WHERE id=fid; END IF;
  IF operation='form.export' THEN
    SELECT f.community_id,m.role INTO cid,role_name FROM public.community_forms f JOIN public.community_members m ON m.community_id=f.community_id AND m.company_id=company WHERE f.id=fid;
    IF role_name NOT IN ('owner','admin') THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Solo los administradores pueden descargar las respuestas.'; END IF;
  END IF;
  IF cid IS NULL OR (operation<>'detail' AND NOT EXISTS(SELECT 1 FROM public.community_members WHERE community_id=cid AND company_id=company)) THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Debes pertenecer a la comunidad.'; END IF;

  SELECT jsonb_build_object(
    'community',(SELECT jsonb_build_object('id',c.id,'name',c.name,'description',c.description,'creator',coalesce(bp.display_name,ua.business_name),'role',role_name) FROM public.communities c JOIN public.user_accounts ua ON ua.company_id=c.owner_company_id LEFT JOIN public.business_profiles bp ON bp.company_id=ua.company_id WHERE c.id=cid),
    'members',coalesce((SELECT jsonb_agg(jsonb_build_object('company_id',m.company_id,'name',coalesce(bp.display_name,ua.business_name),'role',m.role,'joined_at',m.joined_at) ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,CASE WHEN m.role IN ('owner','admin') THEN m.role_since ELSE m.joined_at END,m.company_id) FROM public.community_members m JOIN public.user_accounts ua ON ua.company_id=m.company_id LEFT JOIN public.business_profiles bp ON bp.company_id=m.company_id WHERE m.community_id=cid),'[]'),
    'events',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,'description',p.description,'event_at',p.event_at) ORDER BY p.event_at) FROM public.network_posts p WHERE p.community_id=cid AND p.kind='event'),'[]'),
    'forms',coalesce((SELECT jsonb_agg(jsonb_build_object('id',f.id,'title',f.title,'status',f.status,'created_at',f.created_at,'questions',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',fq.id,'position',fq.position,'title',fq.title,'type',fq.response_type,'options',fq.options) ORDER BY fq.position),'[]') FROM public.community_form_questions fq WHERE fq.form_id=f.id)) ORDER BY f.created_at DESC) FROM public.community_forms f WHERE f.community_id=cid AND (fid IS NULL OR f.id=fid)),'[]'),
    'files',CASE WHEN operation='form.export' THEN coalesce((SELECT jsonb_agg(jsonb_build_object('path',a.file_path,'name',a.file_name,'mime_type',a.mime_type,'compressed',a.compressed,'question',q.title,'response_id',a.response_id)) FROM public.community_form_answers a JOIN public.community_form_questions q ON q.id=a.question_id WHERE q.form_id=fid AND a.file_path IS NOT NULL),'[]') ELSE '[]'::jsonb END
  ) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.pymio_community(text,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pymio_community(text,bigint,jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
