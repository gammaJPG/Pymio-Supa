BEGIN;
-- All writes run in a single Supabase RPC transaction. No browser grants.
CREATE OR REPLACE FUNCTION public.pymio_category(company bigint, payload jsonb, method text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE fallback public.categories; old public.categories; result public.categories;
 n text := trim(payload->>'name'); base text; abbr text; suffix integer := 0;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(company::text,0));
 SELECT * INTO fallback FROM public.categories WHERE company_id=company AND name='Sin Clasificar';
 IF NOT FOUND THEN
   base := 'SIN'; abbr := base;
   WHILE EXISTS(SELECT 1 FROM public.categories WHERE company_id=company AND abbreviation=abbr) LOOP
     suffix:=suffix+1; abbr:=base||suffix;
   END LOOP;
   INSERT INTO public.categories(company_id,name,abbreviation) VALUES(company,'Sin Clasificar',abbr) RETURNING * INTO fallback;
 END IF;
 IF method='get' THEN RETURN (SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY name,id),'[]') FROM public.categories c WHERE company_id=company); END IF;
 IF method IN ('put','delete') THEN
   SELECT * INTO old FROM public.categories WHERE company_id=company AND id=(payload->>'id')::bigint FOR UPDATE;
   IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE='La categoría ya no existe o no pertenece a esta empresa.'; END IF;
   IF old.id=fallback.id THEN RAISE SQLSTATE 'PT400' USING MESSAGE='La categoría Sin Clasificar es permanente.'; END IF;
 END IF;
 IF method='delete' THEN
   UPDATE public.products SET category=fallback.name,updated_at=now() WHERE company_id=company AND category=old.name;
   DELETE FROM public.categories WHERE id=old.id;
   RETURN jsonb_build_object('id',old.id::text);
 END IF;
 IF n IS NULL OR length(n) NOT BETWEEN 1 AND 120 THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Nombre de categoría inválido.'; END IF;
 base:=upper(left(n,3)); abbr:=base; suffix:=0;
 WHILE EXISTS(SELECT 1 FROM public.categories WHERE company_id=company AND abbreviation=abbr AND (old.id IS NULL OR id<>old.id)) LOOP
   suffix:=suffix+1; abbr:=base||suffix;
 END LOOP;
 IF method='post' THEN
   INSERT INTO public.categories(company_id,name,abbreviation) VALUES(company,n,abbr) RETURNING * INTO result;
 ELSIF method='put' THEN
   UPDATE public.categories SET name=n,abbreviation=abbr,updated_at=clock_timestamp() WHERE id=old.id RETURNING * INTO result;
   UPDATE public.products SET updated_at=now() WHERE company_id=company AND category=n;
 ELSE RAISE SQLSTATE 'PT400' USING MESSAGE='Operación inválida.';
 END IF;
 RETURN to_jsonb(result);
END $$;

CREATE OR REPLACE FUNCTION public.pymio_product(company bigint, payload jsonb, method text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE result jsonb; c public.categories; counter integer; new_sku text; pid bigint;
BEGIN
 IF method='list' THEN
   RETURN (SELECT coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('id',id::text,'company_id',company_id::text,'Estado Stock',
     CASE WHEN qty=0 THEN 'Sin Stock' WHEN qty<crit_qty THEN 'Stock Crítico' WHEN qty<low_qty THEN 'Stock Bajo' ELSE 'Stock Normal' END) ORDER BY name,id),'[]') FROM public.products p WHERE company_id=company);
 ELSIF method='history' THEN
   RETURN (SELECT coalesce(jsonb_agg(to_jsonb(h)),'[]') FROM (
     SELECT m.display_code AS code,m.operation,m.occurred_at,l.units FROM public.movement_lines l
     JOIN public.movements m ON m.code=l.movement_code JOIN public.products p ON p.id=l.product_id AND p.company_id=m.company_id
     WHERE m.company_id=company AND p.id=(payload->>'id')::bigint AND m.deleted_at IS NULL ORDER BY m.occurred_at DESC,m.created_at DESC,m.code DESC LIMIT 5) h);
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(company::text,0));
 IF method='delete' THEN
   DELETE FROM public.products WHERE company_id=company AND id=(payload->>'id')::bigint RETURNING id INTO pid;
   IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE='El producto ya no existe o no pertenece a esta empresa.'; END IF;
   RETURN jsonb_build_object('id',pid::text);
 ELSIF method='create' THEN
   SELECT * INTO c FROM public.categories WHERE company_id=company AND name=trim(payload->>'category') FOR UPDATE;
   IF NOT FOUND THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Selecciona una categoría existente.'; END IF;
   SELECT greatest(c.sku_counter,coalesce(max((ascii(left(suffix,1))-65)*999+right(suffix,3)::integer),0)) INTO counter
     FROM (SELECT substring(sku FROM length(c.abbreviation)+1) AS suffix FROM public.products WHERE company_id=company AND left(sku,length(c.abbreviation))=c.abbreviation) s
     WHERE suffix ~ '^[A-Z][0-9]{3}$' AND right(suffix,3)::integer>0;
   counter:=counter+1;
   IF counter>25974 THEN RAISE SQLSTATE 'PT409' USING MESSAGE='La categoría alcanzó el máximo de productos: Z999.'; END IF;
   new_sku:=c.abbreviation||chr(65+(counter-1)/999)||lpad(((counter-1)%999+1)::text,3,'0');
   INSERT INTO public.products(company_id,name,sku,category,qty,cost,price,crit_qty,low_qty,created_at,updated_at)
     VALUES(company,trim(payload->>'name'),new_sku,c.name,(payload->>'qty')::integer,(payload->>'cost')::integer,(payload->>'price')::integer,
       (payload->>'crit_qty')::integer,(payload->>'low_qty')::integer,(payload->>'created_at')::timestamptz,(payload->>'created_at')::timestamptz) RETURNING id INTO pid;
   UPDATE public.categories SET sku_counter=counter WHERE id=c.id;
   RETURN jsonb_build_object('id',pid::text,'sku',new_sku);
 ELSIF method='update' THEN
   UPDATE public.products SET name=trim(payload->>'name'),sku=payload->>'sku',category=trim(payload->>'category'),qty=(payload->>'qty')::integer,
     cost=(payload->>'cost')::integer,price=(payload->>'price')::integer,crit_qty=(payload->>'crit_qty')::integer,low_qty=(payload->>'low_qty')::integer,
     created_at=(payload->>'created_at')::timestamptz,updated_at=(payload->>'updated_at')::timestamptz
     WHERE company_id=company AND id=(payload->>'id')::bigint RETURNING id INTO pid;
   IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE='El producto ya no existe o no pertenece a esta empresa.'; END IF;
   RETURN jsonb_build_object('id',pid::text);
 END IF;
 RAISE SQLSTATE 'PT400' USING MESSAGE='Operación inválida.';
END $$;
REVOKE ALL ON FUNCTION public.pymio_category(bigint,jsonb,text), public.pymio_product(bigint,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pymio_category(bigint,jsonb,text), public.pymio_product(bigint,jsonb,text) TO service_role;
COMMIT;
