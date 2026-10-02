BEGIN;

-- Some deployed databases stored the stock label in products."Estado". Preserve it
-- under its explicit name before creating the independent lifecycle status.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='Estado')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='Estado Stock') THEN
    ALTER TABLE public.products RENAME COLUMN "Estado" TO "Estado Stock";
  END IF;
END $$;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS "Estado Stock" text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS "Estado" text;
ALTER TABLE public.products ALTER COLUMN "Estado" SET DEFAULT 'Habilitado';

UPDATE public.products
SET "Estado Stock"=CASE WHEN qty=0 THEN 'Sin Stock' WHEN qty<low_qty THEN 'Stock Bajo' ELSE 'Stock Normal' END,
    "Estado"=CASE WHEN "Estado" IN ('Habilitado','Inhabilitado') THEN "Estado" ELSE 'Habilitado' END;

ALTER TABLE public.products ALTER COLUMN "Estado Stock" SET NOT NULL;
ALTER TABLE public.products ALTER COLUMN "Estado" SET NOT NULL;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_stock_status_valid;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_status_valid;
ALTER TABLE public.products ADD CONSTRAINT products_stock_status_valid CHECK ("Estado Stock" IN ('Sin Stock','Stock Bajo','Stock Normal'));
ALTER TABLE public.products ADD CONSTRAINT products_status_valid CHECK ("Estado" IN ('Habilitado','Inhabilitado'));

CREATE OR REPLACE FUNCTION public.pymio_set_product_stock_status() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  NEW."Estado Stock":=CASE WHEN NEW.qty=0 THEN 'Sin Stock' WHEN NEW.qty<NEW.low_qty THEN 'Stock Bajo' ELSE 'Stock Normal' END;
  NEW."Estado":=coalesce(NEW."Estado",'Habilitado');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS products_set_stock_status ON public.products;
CREATE TRIGGER products_set_stock_status BEFORE INSERT OR UPDATE OF qty,low_qty ON public.products
FOR EACH ROW EXECUTE FUNCTION public.pymio_set_product_stock_status();

CREATE OR REPLACE FUNCTION public.pymio_product(company bigint, payload jsonb, method text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE result jsonb; c public.categories; counter integer; new_sku text; pid bigint; old_image text; product_status text;
BEGIN
 IF method='list' THEN
   RETURN (SELECT coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('id',id::text,'company_id',company_id::text) ORDER BY name,id),'[]') FROM public.products p WHERE company_id=company);
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
 ELSIF method='status' THEN
   product_status:=payload->>'Estado';
   IF product_status IS NULL OR product_status NOT IN ('Habilitado','Inhabilitado') THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Estado de producto inválido.'; END IF;
   UPDATE public.products SET "Estado"=product_status,updated_at=now() WHERE company_id=company AND id=(payload->>'id')::bigint RETURNING id INTO pid;
   IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE='El producto ya no existe o no pertenece a esta empresa.'; END IF;
   RETURN jsonb_build_object('id',pid::text,'Estado',product_status);
 ELSIF method='create' THEN
   SELECT * INTO c FROM public.categories WHERE company_id=company AND name=trim(payload->>'category') FOR UPDATE;
   IF NOT FOUND THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Selecciona una categoría existente.'; END IF;
   SELECT greatest(c.sku_counter,coalesce(max((ascii(left(suffix,1))-65)*999+right(suffix,3)::integer),0)) INTO counter
     FROM (SELECT substring(sku FROM length(c.abbreviation)+1) AS suffix FROM public.products WHERE company_id=company AND left(sku,length(c.abbreviation))=c.abbreviation) s
     WHERE suffix ~ '^[A-Z][0-9]{3}$' AND right(suffix,3)::integer>0;
   counter:=counter+1;
   IF counter>25974 THEN RAISE SQLSTATE 'PT409' USING MESSAGE='La categoría alcanzó el máximo de productos: Z999.'; END IF;
   new_sku:=c.abbreviation||chr(65+(counter-1)/999)||lpad(((counter-1)%999+1)::text,3,'0');
   INSERT INTO public.products(company_id,name,sku,category,qty,cost,price,low_qty,created_at,updated_at,image_path,"Estado")
     VALUES(company,trim(payload->>'name'),new_sku,c.name,(payload->>'qty')::integer,(payload->>'cost')::integer,(payload->>'price')::integer,
       (payload->>'low_qty')::integer,(payload->>'created_at')::timestamptz,(payload->>'created_at')::timestamptz,nullif(payload->>'image_path',''),'Habilitado') RETURNING id INTO pid;
   UPDATE public.categories SET sku_counter=counter WHERE id=c.id;
   RETURN jsonb_build_object('id',pid::text,'sku',new_sku,'Estado','Habilitado');
 ELSIF method='update' THEN
   UPDATE public.products SET name=trim(payload->>'name'),sku=payload->>'sku',category=trim(payload->>'category'),qty=(payload->>'qty')::integer,
     cost=(payload->>'cost')::integer,price=(payload->>'price')::integer,low_qty=(payload->>'low_qty')::integer,
     created_at=(payload->>'created_at')::timestamptz,updated_at=(payload->>'updated_at')::timestamptz,image_path=nullif(payload->>'image_path','')
     WHERE company_id=company AND id=(payload->>'id')::bigint RETURNING id INTO pid;
   IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE='El producto ya no existe o no pertenece a esta empresa.'; END IF;
   RETURN jsonb_build_object('id',pid::text);
 END IF;
 RAISE SQLSTATE 'PT400' USING MESSAGE='Operación inválida.';
END $$;

CREATE OR REPLACE FUNCTION public.pymio_api(operation text, company bigint, payload jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE result jsonb; selected_customer bigint; request jsonb;
BEGIN
  IF company IS NULL OR company < 1 THEN RAISE SQLSTATE 'PT400' USING MESSAGE = 'Empresa inválida.'; END IF;
  IF operation IN ('product.list','product.history','product.create','product.update','product.delete','product.status') THEN
    RETURN public.pymio_product(company, payload, split_part(operation, '.', 2));
  ELSIF operation IN ('category.get','category.post','category.put','category.delete') THEN
    RETURN public.pymio_category(company, payload, split_part(operation, '.', 2));
  ELSIF operation IN ('customer.list','customer.create') THEN
    RETURN public.pymio_customer(company, payload, split_part(operation, '.', 2));
  ELSIF operation = 'movement.list' THEN
    RETURN (SELECT coalesce(jsonb_agg(entry || jsonb_build_object('customer_id', m.customer_id::text, 'customer_name', c.name) ORDER BY ord), '[]'::jsonb)
            FROM jsonb_array_elements(public.pymio_list(company, payload)) WITH ORDINALITY AS listed(entry, ord)
            LEFT JOIN public.movements m ON m.company_id = company AND m.display_code = entry->>'code'
            LEFT JOIN public.customers c ON c.company_id = company AND c.id = m.customer_id);
  ELSIF operation IN ('movement.create','movement.change') THEN
    request := CASE WHEN operation = 'movement.create' THEN payload->'request' ELSE payload->'replacement' END;
    IF request IS NOT NULL AND request <> 'null'::jsonb THEN
      IF request->>'customer_id' IS NOT NULL THEN
        IF request->>'operation_detail' IS DISTINCT FROM 'Venta' OR request->>'customer_id' !~ '^[1-9][0-9]{0,18}$' THEN RAISE SQLSTATE 'PT400' USING MESSAGE = 'Selecciona un cliente válido para la venta.'; END IF;
        selected_customer := (request->>'customer_id')::bigint;
        IF NOT EXISTS (SELECT 1 FROM public.customers WHERE company_id = company AND id = selected_customer) THEN RAISE SQLSTATE 'PT400' USING MESSAGE = 'El cliente no existe o no pertenece a esta empresa.'; END IF;
      END IF;
    END IF;
    result := public.pymio_movement(company, payload, split_part(operation, '.', 2));
    IF request IS NOT NULL AND request <> 'null'::jsonb THEN
      IF operation = 'movement.create' THEN
        UPDATE public.movements SET customer_id = selected_customer WHERE company_id = company AND code = (payload->>'code')::uuid;
      ELSE
        UPDATE public.movements SET customer_id = selected_customer WHERE company_id = company AND display_code = payload->>'displayCode' AND deleted_at IS NULL;
      END IF;
    END IF;
    RETURN result;
  END IF;
  RAISE SQLSTATE 'PT400' USING MESSAGE = 'Operación inválida.';
END $$;

REVOKE ALL ON FUNCTION public.pymio_product(bigint,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pymio_product(bigint,jsonb,text) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;