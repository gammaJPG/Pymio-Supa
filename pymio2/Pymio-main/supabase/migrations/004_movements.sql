BEGIN;
CREATE OR REPLACE FUNCTION public.pymio_movement(company bigint, payload jsonb, method text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
<<movement_op>>
DECLARE m public.movements; p public.products; old public.movement_lines; receipt public.movement_changes;
 req jsonb; canonical jsonb; item jsonb; result jsonb; move_id uuid; original_ids bigint[]; wanted_ids bigint[];
 units bigint; delta bigint; initial bigint; final_stock bigint; price numeric; discount numeric; affected integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(company::text,0));
 IF method='create' THEN
   req:=payload->'request'; move_id:=(payload->>'code')::uuid;
   INSERT INTO public.movements(code,company_id,operation,occurred_at,discount_type,discount_value,request,display_code,operation_detail,channel,payment_method,discount_scope,"Estado")
     VALUES(move_id,company,req->>'operation',(req->>'occurred_at')::timestamptz,req#>>'{discount,type}',coalesce((req#>>'{discount,value}')::numeric,0),req,
       substring(md5(move_id::text),1,12),req->>'operation_detail',req->>'channel',req->>'payment_method',coalesce(req#>>'{discount,scope}','global'),coalesce(req->>'Estado','Pagado'))
     ON CONFLICT(code) DO NOTHING RETURNING * INTO m;
   IF NOT FOUND THEN
     SELECT * INTO m FROM public.movements WHERE code=move_id AND company_id=company AND request=req AND deleted_at IS NULL;
     IF NOT FOUND THEN RAISE SQLSTATE 'PT409' USING MESSAGE='El código ya se usó con otros datos. Abre un nuevo movimiento.'; END IF;
     RETURN jsonb_build_object('code',m.display_code,'repeated',true);
   END IF;
 ELSE
   IF method<>'change' OR payload->>'method' NOT IN ('PUT','DELETE') THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Operación inválida.'; END IF;
   req:=nullif(payload->'replacement','null'::jsonb);
   canonical:=payload-'action_id';
   SELECT * INTO receipt FROM public.movement_changes WHERE action_id=(payload->>'action_id')::uuid AND company_id=company;
   IF FOUND THEN
     IF receipt.request<>canonical THEN RAISE SQLSTATE 'PT409' USING MESSAGE='Este reintento tiene otros datos. Vuelve a abrir el formulario.'; END IF;
     RETURN receipt.result||jsonb_build_object('repeated',true);
   END IF;
   SELECT * INTO m FROM public.movements WHERE company_id=company AND display_code=payload->>'displayCode' AND deleted_at IS NULL FOR UPDATE;
   IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE='El movimiento ya no existe o no pertenece a esta empresa.'; END IF;
   IF m.revision<>(payload->>'revision')::integer THEN RAISE SQLSTATE 'PT409' USING MESSAGE='El movimiento fue modificado por otra operación. Cierra y vuelve a seleccionarlo.'; END IF;
   move_id:=m.code;
 END IF;
 SELECT coalesce(array_agg(product_id),'{}') INTO original_ids FROM public.movement_lines WHERE movement_code=move_id;
 SELECT coalesce(array_agg(DISTINCT id),'{}') INTO wanted_ids FROM (
   SELECT unnest(original_ids) AS id UNION SELECT (value->>'product_id')::bigint FROM jsonb_array_elements(req->'items')) ids;
 SELECT count(*) INTO affected FROM public.products WHERE company_id=company AND id=ANY(wanted_ids);
 IF affected<>cardinality(wanted_ids) THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Un producto ya no existe o no pertenece a esta empresa.'; END IF;
 FOR p IN SELECT * FROM public.products WHERE company_id=company AND id=ANY(wanted_ids) ORDER BY id FOR UPDATE LOOP
   SELECT * INTO old FROM public.movement_lines WHERE movement_code=move_id AND product_id=p.id;
   SELECT value INTO item FROM jsonb_array_elements(req->'items') WHERE (value->>'product_id')::bigint=p.id;
   units:=coalesce((item->>'units')::bigint,0)*CASE WHEN req->>'operation'='Egreso' THEN -1 ELSE 1 END;
   delta:=units-coalesce(old.units,0); final_stock:=p.qty::bigint+delta;
   IF old.id IS NOT NULL THEN initial:=old.initial_qty;
   ELSE
     SELECT p.qty::bigint-coalesce(sum(l.units),0) INTO initial FROM public.movement_lines l JOIN public.movements later ON later.code=l.movement_code
       WHERE later.company_id=company AND later.deleted_at IS NULL AND l.product_id=p.id AND (later.created_at,later.code)>(m.created_at,m.code);
   END IF;
   IF final_stock NOT BETWEEN 0 AND 2147483647 OR (item IS NOT NULL AND (initial NOT BETWEEN 0 AND 2147483647 OR initial+units NOT BETWEEN 0 AND 2147483647))
     OR EXISTS(SELECT 1 FROM public.movement_lines l JOIN public.movements later ON later.code=l.movement_code
       WHERE later.company_id=company AND later.deleted_at IS NULL AND l.product_id=p.id AND (later.created_at,later.code)>(m.created_at,m.code)
       AND (l.initial_qty::bigint+delta NOT BETWEEN 0 AND 2147483647 OR l.final_qty::bigint+delta NOT BETWEEN 0 AND 2147483647))
     THEN RAISE SQLSTATE 'PT409' USING MESSAGE='Stock insuficiente o fuera de rango para '||p.sku||'.';
   END IF;
   UPDATE public.movement_lines l SET initial_qty=l.initial_qty+delta,final_qty=l.final_qty+delta FROM public.movements later
     WHERE later.code=l.movement_code AND later.company_id=company AND later.deleted_at IS NULL AND l.product_id=p.id AND (later.created_at,later.code)>(m.created_at,m.code);
   price:=coalesce(old.unit_price,CASE WHEN req->>'operation'='Ingreso' AND req->>'operation_detail'='Compra' THEN p.cost ELSE p.price END);
   discount:=CASE WHEN item#>>'{discount,type}'='percentage' THEN price*abs(units)*(item#>>'{discount,value}')::numeric/100 ELSE coalesce((item#>>'{discount,value}')::numeric,0) END;
   IF discount>price*abs(units) THEN RAISE SQLSTATE 'PT400' USING MESSAGE='El descuento no puede superar el subtotal del producto.'; END IF;
   IF item IS NOT NULL AND old.id IS NOT NULL THEN
     UPDATE public.movement_lines SET units=movement_op.units,final_qty=initial+movement_op.units,occurred_at=(req->>'occurred_at')::timestamptz,
       discount_type=item#>>'{discount,type}',discount_value=coalesce((item#>>'{discount,value}')::numeric,0) WHERE id=old.id;
   ELSIF item IS NOT NULL THEN
     INSERT INTO public.movement_lines(movement_code,company_id,product_id,sku,units,occurred_at,initial_qty,final_qty,product_name,unit_price,discount_type,discount_value)
       VALUES(move_id,company,p.id,p.sku,units,(req->>'occurred_at')::timestamptz,initial,initial+units,p.name,price,item#>>'{discount,type}',coalesce((item#>>'{discount,value}')::numeric,0));
   ELSIF old.id IS NOT NULL AND req IS NOT NULL THEN
     DELETE FROM public.movement_lines WHERE id=old.id;
   END IF;
   UPDATE public.products SET qty=final_stock,updated_at=now() WHERE id=p.id AND company_id=company;
 END LOOP;
 IF method='create' THEN RETURN jsonb_build_object('code',m.display_code,'repeated',false); END IF;
 IF req IS NOT NULL THEN
   UPDATE public.movements SET operation=req->>'operation',occurred_at=(req->>'occurred_at')::timestamptz,discount_type=req#>>'{discount,type}',
     discount_value=coalesce((req#>>'{discount,value}')::numeric,0),operation_detail=req->>'operation_detail',channel=req->>'channel',payment_method=req->>'payment_method',
     discount_scope=coalesce(req#>>'{discount,scope}','global'),"Estado"=coalesce(req->>'Estado',"Estado"),revision=revision+1 WHERE code=move_id;
 ELSE UPDATE public.movements SET deleted_at=now(),revision=revision+1 WHERE code=move_id;
 END IF;
 result:=jsonb_build_object('code',m.display_code,'revision',m.revision+1,'deleted',req IS NULL);
 INSERT INTO public.movement_changes(action_id,company_id,request,result) VALUES((payload->>'action_id')::uuid,company,canonical,result);
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.pymio_api(operation text, company bigint, payload jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
 IF company IS NULL OR company<1 THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Empresa inválida.'; END IF;
 IF operation IN ('product.list','product.history','product.create','product.update','product.delete') THEN RETURN public.pymio_product(company,payload,split_part(operation,'.',2));
 ELSIF operation IN ('category.get','category.post','category.put','category.delete') THEN RETURN public.pymio_category(company,payload,split_part(operation,'.',2));
 ELSIF operation='movement.list' THEN RETURN public.pymio_list(company,payload);
 ELSIF operation IN ('movement.create','movement.change') THEN RETURN public.pymio_movement(company,payload,split_part(operation,'.',2));
 END IF;
 RAISE SQLSTATE 'PT400' USING MESSAGE='Operación inválida.';
END $$;
REVOKE ALL ON FUNCTION public.pymio_movement(bigint,jsonb,text), public.pymio_api(text,bigint,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pymio_movement(bigint,jsonb,text), public.pymio_api(text,bigint,jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
