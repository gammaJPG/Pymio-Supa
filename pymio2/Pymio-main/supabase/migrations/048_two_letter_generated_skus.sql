BEGIN;

ALTER TABLE public.categories
  DROP CONSTRAINT IF EXISTS categories_company_id_abbreviation_key;

CREATE OR REPLACE FUNCTION public.pymio_category(company bigint,payload jsonb,method text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE fallback public.categories;old public.categories;result public.categories;
 n text:=trim(payload->>'name');abbr text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(company::text,0));
 SELECT * INTO fallback FROM public.categories WHERE company_id=company AND name='Sin Clasificar';
 IF NOT FOUND THEN INSERT INTO public.categories(company_id,name,abbreviation) VALUES(company,'Sin Clasificar','SI') RETURNING * INTO fallback;END IF;
 IF method='get' THEN RETURN (SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY name,id),'[]') FROM public.categories c WHERE company_id=company);END IF;
 IF method IN ('put','delete') THEN
   SELECT * INTO old FROM public.categories WHERE company_id=company AND id=(payload->>'id')::bigint FOR UPDATE;
   IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE='La categoría ya no existe o no pertenece a esta empresa.';END IF;
   IF old.id=fallback.id THEN RAISE SQLSTATE 'PT400' USING MESSAGE='La categoría Sin Clasificar es permanente.';END IF;
 END IF;
 IF method='delete' THEN UPDATE public.products SET category=fallback.name,updated_at=now() WHERE company_id=company AND category=old.name;DELETE FROM public.categories WHERE id=old.id;RETURN jsonb_build_object('id',old.id::text);END IF;
 IF n IS NULL OR length(n) NOT BETWEEN 1 AND 120 THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Nombre de categoría inválido.';END IF;
 abbr:=left(upper(regexp_replace(translate(n,'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNAEIOUUN'),'[^A-Za-z]','','g')),2);
 IF abbr='' THEN RAISE SQLSTATE 'PT400' USING MESSAGE='El nombre de la categoría debe incluir letras.';END IF;
 IF method='post' THEN INSERT INTO public.categories(company_id,name,abbreviation) VALUES(company,n,abbr) RETURNING * INTO result;
 ELSIF method='put' THEN UPDATE public.categories SET name=n,abbreviation=abbr,updated_at=clock_timestamp() WHERE id=old.id RETURNING * INTO result;UPDATE public.products SET category=n,updated_at=now() WHERE company_id=company AND category=old.name;
 ELSE RAISE SQLSTATE 'PT400' USING MESSAGE='Operación inválida.';END IF;
 RETURN to_jsonb(result);
END $$;

CREATE OR REPLACE FUNCTION public.pymio_product(company bigint,payload jsonb,method text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;c public.categories;counter integer;new_sku text;pid bigint;old_image text;product_status text;clean_name text;sku_prefix text;suffix text;
BEGIN
 IF method='list' THEN RETURN (SELECT coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('id',id::text,'company_id',company_id::text) ORDER BY lower(name),id),'[]') FROM public.products p WHERE company_id=company);
 ELSIF method='history' THEN RETURN (SELECT coalesce(jsonb_agg(to_jsonb(h)),'[]') FROM (SELECT m.display_code AS code,m.operation,m.occurred_at,l.units FROM public.movement_lines l JOIN public.movements m ON m.code=l.movement_code JOIN public.products p ON p.id=l.product_id AND p.company_id=m.company_id WHERE m.company_id=company AND p.id=(payload->>'id')::bigint AND m.deleted_at IS NULL ORDER BY m.occurred_at DESC,m.created_at DESC,m.code DESC LIMIT 5) h);END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(company::text,0));
 IF method='delete' THEN DELETE FROM public.products WHERE company_id=company AND id=(payload->>'id')::bigint RETURNING id,image_path INTO pid,old_image;IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE='El producto ya no existe o no pertenece a esta empresa.';END IF;RETURN jsonb_build_object('id',pid::text,'image_path',old_image);
 ELSIF method='status' THEN product_status:=payload->>'Estado';IF product_status IS NULL OR product_status NOT IN ('Habilitado','Inhabilitado') THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Estado de producto inválido.';END IF;UPDATE public.products SET "Estado"=product_status,updated_at=now() WHERE company_id=company AND id=(payload->>'id')::bigint RETURNING id INTO pid;IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE='El producto ya no existe o no pertenece a esta empresa.';END IF;RETURN jsonb_build_object('id',pid::text,'Estado',product_status);
 ELSIF method='create' THEN
   clean_name:=trim(payload->>'name');
   IF EXISTS(SELECT 1 FROM public.products WHERE company_id=company AND lower(btrim(name))=lower(clean_name)) THEN RAISE SQLSTATE 'PT409' USING MESSAGE='Ya existe un producto con ese nombre. Modifica el producto existente.';END IF;
   SELECT * INTO c FROM public.categories WHERE company_id=company AND name=trim(payload->>'category') FOR UPDATE;IF NOT FOUND THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Selecciona una categoría existente.';END IF;
   sku_prefix:=left(upper(regexp_replace(translate(clean_name,'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNAEIOUUN'),'[^A-Za-z]','','g')),2);IF sku_prefix='' THEN RAISE SQLSTATE 'PT400' USING MESSAGE='El nombre del producto debe incluir letras.';END IF;
   SELECT coalesce(max((ascii(left(candidate,1))-65)*999+right(candidate,3)::integer),0) INTO counter FROM (SELECT substring(sku FROM length(sku_prefix)+1) AS candidate FROM public.products WHERE company_id=company AND left(sku,length(sku_prefix))=sku_prefix) s WHERE candidate~'^[A-Z][0-9]{3}$' AND right(candidate,3)::integer>0;
   LOOP counter:=counter+1;IF counter>25974 THEN RAISE SQLSTATE 'PT409' USING MESSAGE='Los productos con estas iniciales alcanzaron el máximo Z999.';END IF;suffix:=chr(65+(counter-1)/999)||lpad(((counter-1)%999+1)::text,3,'0');new_sku:=sku_prefix||suffix;EXIT WHEN NOT EXISTS(SELECT 1 FROM public.products WHERE company_id=company AND sku=new_sku);END LOOP;
   INSERT INTO public.products(company_id,name,sku,category,qty,cost,price,low_qty,created_at,updated_at,image_path,"Estado") VALUES(company,clean_name,new_sku,c.name,(payload->>'qty')::integer,(payload->>'cost')::integer,(payload->>'price')::integer,(payload->>'low_qty')::integer,(payload->>'created_at')::timestamptz,(payload->>'created_at')::timestamptz,nullif(payload->>'image_path',''),'Habilitado') RETURNING id INTO pid;
   UPDATE public.categories SET sku_counter=greatest(sku_counter,counter) WHERE id=c.id;RETURN jsonb_build_object('id',pid::text,'sku',new_sku,'Estado','Habilitado');
 ELSIF method='update' THEN
   clean_name:=trim(payload->>'name');IF EXISTS(SELECT 1 FROM public.products WHERE company_id=company AND id<>(payload->>'id')::bigint AND lower(btrim(name))=lower(clean_name)) THEN RAISE SQLSTATE 'PT409' USING MESSAGE='Ya existe un producto con ese nombre. Usa un nombre diferente.';END IF;
   UPDATE public.products SET name=clean_name,sku=payload->>'sku',category=trim(payload->>'category'),qty=(payload->>'qty')::integer,cost=(payload->>'cost')::integer,price=(payload->>'price')::integer,low_qty=(payload->>'low_qty')::integer,created_at=(payload->>'created_at')::timestamptz,updated_at=(payload->>'updated_at')::timestamptz,image_path=nullif(payload->>'image_path','') WHERE company_id=company AND id=(payload->>'id')::bigint RETURNING id INTO pid;
   IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE='El producto ya no existe o no pertenece a esta empresa.';END IF;RETURN jsonb_build_object('id',pid::text);
 END IF;RAISE SQLSTATE 'PT400' USING MESSAGE='Operación inválida.';
END $$;

REVOKE ALL ON FUNCTION public.pymio_category(bigint,jsonb,text),public.pymio_product(bigint,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pymio_category(bigint,jsonb,text),public.pymio_product(bigint,jsonb,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
