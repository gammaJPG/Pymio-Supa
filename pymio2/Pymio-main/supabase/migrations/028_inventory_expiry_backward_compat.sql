BEGIN;
CREATE OR REPLACE FUNCTION public.pymio_product(company bigint,payload jsonb,method text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;c public.categories;counter integer;new_sku text;pid bigint;old_image text;product_status text;
BEGIN
 IF method='list' THEN RETURN (SELECT coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('id',id::text,'company_id',company_id::text) ORDER BY lower(name),expiry_date NULLS LAST,created_at,id),'[]') FROM public.products p WHERE company_id=company);
 ELSIF method='history' THEN RETURN (SELECT coalesce(jsonb_agg(to_jsonb(h)),'[]') FROM (SELECT m.display_code AS code,m.operation,m.occurred_at,l.units FROM public.movement_lines l JOIN public.movements m ON m.code=l.movement_code JOIN public.products p ON p.id=l.product_id AND p.company_id=m.company_id WHERE m.company_id=company AND p.id=(payload->>'id')::bigint AND m.deleted_at IS NULL ORDER BY m.occurred_at DESC,m.created_at DESC,m.code DESC LIMIT 5) h);END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(company::text,0));
 IF method='delete' THEN DELETE FROM public.products WHERE company_id=company AND id=(payload->>'id')::bigint RETURNING id,image_path INTO pid,old_image;IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE='El producto ya no existe o no pertenece a esta empresa.';END IF;RETURN jsonb_build_object('id',pid::text,'image_path',old_image);
 ELSIF method='status' THEN product_status:=payload->>'Estado';IF product_status IS NULL OR product_status NOT IN ('Habilitado','Inhabilitado') THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Estado de producto inválido.';END IF;UPDATE public.products SET "Estado"=product_status,updated_at=now() WHERE company_id=company AND id=(payload->>'id')::bigint RETURNING id INTO pid;IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE='El producto ya no existe o no pertenece a esta empresa.';END IF;RETURN jsonb_build_object('id',pid::text,'Estado',product_status);
 ELSIF method='create' THEN
   SELECT * INTO c FROM public.categories WHERE company_id=company AND name=trim(payload->>'category') FOR UPDATE;IF NOT FOUND THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Selecciona una categoría existente.';END IF;
   SELECT greatest(c.sku_counter,coalesce(max((ascii(left(suffix,1))-65)*999+right(suffix,3)::integer),0)) INTO counter FROM (SELECT substring(sku FROM length(c.abbreviation)+1) AS suffix FROM public.products WHERE company_id=company AND left(sku,length(c.abbreviation))=c.abbreviation) s WHERE suffix~'^[A-Z][0-9]{3}$' AND right(suffix,3)::integer>0;
   counter:=counter+1;IF counter>25974 THEN RAISE SQLSTATE 'PT409' USING MESSAGE='La categoría alcanzó el máximo de productos: Z999.';END IF;new_sku:=c.abbreviation||chr(65+(counter-1)/999)||lpad(((counter-1)%999+1)::text,3,'0');
   INSERT INTO public.products(company_id,name,sku,category,qty,cost,price,low_qty,created_at,updated_at,image_path,"Estado",expiry_date) VALUES(company,trim(payload->>'name'),new_sku,c.name,(payload->>'qty')::integer,(payload->>'cost')::integer,(payload->>'price')::integer,(payload->>'low_qty')::integer,(payload->>'created_at')::timestamptz,(payload->>'created_at')::timestamptz,nullif(payload->>'image_path',''),'Habilitado',nullif(payload->>'expiry_date','')::date) RETURNING id INTO pid;
   UPDATE public.categories SET sku_counter=counter WHERE id=c.id;RETURN jsonb_build_object('id',pid::text,'sku',new_sku,'Estado','Habilitado','expiry_date',nullif(payload->>'expiry_date',''));
 ELSIF method='update' THEN
   UPDATE public.products SET name=trim(payload->>'name'),sku=payload->>'sku',category=trim(payload->>'category'),qty=(payload->>'qty')::integer,cost=(payload->>'cost')::integer,price=(payload->>'price')::integer,low_qty=(payload->>'low_qty')::integer,created_at=(payload->>'created_at')::timestamptz,updated_at=(payload->>'updated_at')::timestamptz,image_path=nullif(payload->>'image_path',''),expiry_date=CASE WHEN payload?'expiry_date' THEN nullif(payload->>'expiry_date','')::date ELSE expiry_date END WHERE company_id=company AND id=(payload->>'id')::bigint RETURNING id INTO pid;
   IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE='El producto ya no existe o no pertenece a esta empresa.';END IF;RETURN jsonb_build_object('id',pid::text,'expiry_date',nullif(payload->>'expiry_date',''));
 END IF;RAISE SQLSTATE 'PT400' USING MESSAGE='Operación inválida.';
END $$;
REVOKE ALL ON FUNCTION public.pymio_product(bigint,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pymio_product(bigint,jsonb,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
