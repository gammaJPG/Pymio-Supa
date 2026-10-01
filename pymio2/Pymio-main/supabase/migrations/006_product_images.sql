BEGIN;

ALTER TABLE public.products ADD COLUMN image_path text;
ALTER TABLE public.products ADD CONSTRAINT products_image_path_check
  CHECK (image_path IS NULL OR image_path ~ '^[1-9][0-9]*/[0-9a-f-]{36}\.webp$');

INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-images', 'product-images', true, 256000, ARRAY['image/webp'])
ON CONFLICT (id) DO UPDATE SET public=true, file_size_limit=256000, allowed_mime_types=ARRAY['image/webp'];

CREATE OR REPLACE FUNCTION public.pymio_product(company bigint, payload jsonb, method text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE result jsonb; c public.categories; counter integer; new_sku text; pid bigint; old_image text;
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
   DELETE FROM public.products WHERE company_id=company AND id=(payload->>'id')::bigint RETURNING id,image_path INTO pid,old_image;
   IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE='El producto ya no existe o no pertenece a esta empresa.'; END IF;
   RETURN jsonb_build_object('id',pid::text,'image_path',old_image);
 ELSIF method='create' THEN
   SELECT * INTO c FROM public.categories WHERE company_id=company AND name=trim(payload->>'category') FOR UPDATE;
   IF NOT FOUND THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Selecciona una categoría existente.'; END IF;
   SELECT greatest(c.sku_counter,coalesce(max((ascii(left(suffix,1))-65)*999+right(suffix,3)::integer),0)) INTO counter
     FROM (SELECT substring(sku FROM length(c.abbreviation)+1) AS suffix FROM public.products WHERE company_id=company AND left(sku,length(c.abbreviation))=c.abbreviation) s
     WHERE suffix ~ '^[A-Z][0-9]{3}$' AND right(suffix,3)::integer>0;
   counter:=counter+1;
   IF counter>25974 THEN RAISE SQLSTATE 'PT409' USING MESSAGE='La categoría alcanzó el máximo de productos: Z999.'; END IF;
   new_sku:=c.abbreviation||chr(65+(counter-1)/999)||lpad(((counter-1)%999+1)::text,3,'0');
   INSERT INTO public.products(company_id,name,sku,category,qty,cost,price,crit_qty,low_qty,created_at,updated_at,image_path)
     VALUES(company,trim(payload->>'name'),new_sku,c.name,(payload->>'qty')::integer,(payload->>'cost')::integer,(payload->>'price')::integer,
       (payload->>'crit_qty')::integer,(payload->>'low_qty')::integer,(payload->>'created_at')::timestamptz,(payload->>'created_at')::timestamptz,nullif(payload->>'image_path','')) RETURNING id INTO pid;
   UPDATE public.categories SET sku_counter=counter WHERE id=c.id;
   RETURN jsonb_build_object('id',pid::text,'sku',new_sku);
 ELSIF method='update' THEN
   UPDATE public.products SET name=trim(payload->>'name'),sku=payload->>'sku',category=trim(payload->>'category'),qty=(payload->>'qty')::integer,
     cost=(payload->>'cost')::integer,price=(payload->>'price')::integer,crit_qty=(payload->>'crit_qty')::integer,low_qty=(payload->>'low_qty')::integer,
     created_at=(payload->>'created_at')::timestamptz,updated_at=(payload->>'updated_at')::timestamptz,image_path=nullif(payload->>'image_path','')
     WHERE company_id=company AND id=(payload->>'id')::bigint RETURNING id INTO pid;
   IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE='El producto ya no existe o no pertenece a esta empresa.'; END IF;
   RETURN jsonb_build_object('id',pid::text);
 END IF;
 RAISE SQLSTATE 'PT400' USING MESSAGE='Operación inválida.';
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
