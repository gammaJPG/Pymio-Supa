-- Run against an isolated database after migrations. All changes are rolled back.
BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE cat jsonb; customer jsonb; product jsonb; product2 jsonb; body jsonb; request jsonb; movement jsonb; changed jsonb; again jsonb;
 pid bigint; start_qty integer; result jsonb; next_movement jsonb;
BEGIN
 IF jsonb_array_length(public.pymio_api('product.list',1))=0 THEN RAISE EXCEPTION 'Missing imported products'; END IF;
 cat:=public.pymio_api('category.post',1,'{"name":"QAS SUPABASE"}');
 body:=jsonb_build_object('name','QA product','category','QAS SUPABASE','qty',10,'cost',100,'price',200,'low_qty',2,'created_at',now(),'updated_at',now(),'image_path','1/10000000-0000-4000-8000-000000000099.webp');
 product:=public.pymio_api('product.create',1,body); pid:=(product->>'id')::bigint;
 IF (SELECT image_path FROM public.products WHERE id=pid)<>body->>'image_path' THEN RAISE EXCEPTION 'Product image path failed'; END IF;
 IF (SELECT "Estado" FROM public.products WHERE id=pid)<>'Habilitado' THEN RAISE EXCEPTION 'Default product status failed'; END IF;
 IF (SELECT "Estado Stock" FROM public.products WHERE id=pid)<>'Stock Normal' THEN RAISE EXCEPTION 'Stock status failed'; END IF;
 PERFORM public.pymio_api('product.status',1,product||'{"Estado":"Inhabilitado"}');
 IF (SELECT "Estado" FROM public.products WHERE id=pid)<>'Inhabilitado' THEN RAISE EXCEPTION 'Product status change failed'; END IF;
 PERFORM public.pymio_api('product.status',1,product||'{"Estado":"Habilitado"}');
 IF product->>'sku'<>'QASA001' THEN RAISE EXCEPTION 'SKU sequence failed'; END IF;
 product2:=public.pymio_api('product.create',1,body||'{"name":"QA second"}');
 IF product->>'sku'=product2->>'sku' THEN RAISE EXCEPTION 'Duplicate SKU'; END IF;
 PERFORM public.pymio_api('product.update',1,body||product||'{"qty":20}');
 SELECT qty INTO start_qty FROM public.products WHERE id=pid;
 IF start_qty<>20 THEN RAISE EXCEPTION 'Product update failed'; END IF;
 BEGIN
   PERFORM public.pymio_api('product.delete',2,product);
   RAISE EXCEPTION 'Cross-company delete allowed';
 EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL; END;
 request:=jsonb_build_object('operation','Egreso','operation_detail','Venta','channel','Online','payment_method','Tarjeta','Estado','Pendiente de Pago','occurred_at',now(),
   'discount',jsonb_build_object('scope','product'),'items',jsonb_build_array(jsonb_build_object('product_id',pid::text,'units',2,'discount',jsonb_build_object('type','fixed','value',10))));
 customer:=public.pymio_api('customer.create',1,'{"name":"QA client","phone":"+56 9 1234 5678","email":"qa@example.cl","address":"QA street"}');
 IF (public.pymio_api('customer.list',1)->0->>'name') IS NULL THEN RAISE EXCEPTION 'Customer list failed'; END IF;
 request:=request||jsonb_build_object('customer_id',customer->>'id');
 BEGIN
   PERFORM public.pymio_api('movement.create',2,jsonb_build_object('code',gen_random_uuid(),'request',request));
   RAISE EXCEPTION 'Cross-company customer accepted';
 EXCEPTION WHEN SQLSTATE 'PT400' THEN NULL; END;
 body:=jsonb_build_object('code','10000000-0000-4000-8000-000000000001','request',request);
 movement:=public.pymio_api('movement.create',1,body);
 again:=public.pymio_api('movement.create',1,body);
 IF NOT (again->>'repeated')::boolean OR (SELECT qty FROM public.products WHERE id=pid)<>18 THEN RAISE EXCEPTION 'Idempotency failed'; END IF;
 UPDATE public.movements SET created_at=now()-interval '1 minute' WHERE display_code=movement->>'code';
 result:=public.pymio_api('movement.list',1,jsonb_build_object('code',movement->>'code'));
 IF (result->0->>'total')::numeric<>390 OR result->0->>'Estado'<>'Pendiente de Pago' THEN RAISE EXCEPTION 'Totals/state mismatch: %',result; END IF;
 IF result->0->>'customer_name'<>'QA client' OR result->0->>'customer_id'<>customer->>'id' THEN RAISE EXCEPTION 'Customer association failed: %',result; END IF;
 IF jsonb_array_length(public.pymio_api('product.history',1,product))<>1 THEN RAISE EXCEPTION 'History failed'; END IF;
 BEGIN
   PERFORM public.pymio_api('movement.create',1,jsonb_build_object('code',gen_random_uuid(),'request',jsonb_set(request,'{items,0,units}','100000')));
   RAISE EXCEPTION 'Negative stock accepted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 IF (SELECT qty FROM public.products WHERE id=pid)<>18 THEN RAISE EXCEPTION 'Rollback failed'; END IF;
 next_movement:=public.pymio_api('movement.create',1,jsonb_build_object('code',gen_random_uuid(),'request',request));
 body:=jsonb_build_object('displayCode',movement->>'code','method','PUT','revision',1,'action_id',gen_random_uuid(),'replacement',jsonb_set(request,'{items,0,units}','3'));
 changed:=public.pymio_api('movement.change',1,body);
 again:=public.pymio_api('movement.change',1,body);
 IF NOT (again->>'repeated')::boolean OR (SELECT qty FROM public.products WHERE id=pid)<>15 THEN RAISE EXCEPTION 'Edit/retry failed'; END IF;
 IF (SELECT l.initial_qty FROM public.movement_lines l JOIN public.movements m ON m.code=l.movement_code WHERE m.display_code=next_movement->>'code')<>17 THEN RAISE EXCEPTION 'Subsequent balances failed'; END IF;
 BEGIN
   PERFORM public.pymio_api('movement.change',1,body||jsonb_build_object('action_id',gen_random_uuid()));
   RAISE EXCEPTION 'Stale revision accepted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 body:=jsonb_build_object('displayCode',movement->>'code','method','DELETE','revision',2,'action_id',gen_random_uuid(),'replacement',null);
 changed:=public.pymio_api('movement.change',1,body);
 again:=public.pymio_api('movement.change',1,body);
 IF (SELECT qty FROM public.products WHERE id=pid)<>18 OR NOT (again->>'repeated')::boolean THEN RAISE EXCEPTION 'Delete failed'; END IF;
 IF jsonb_array_length(public.pymio_api('movement.list',1,jsonb_build_object('code',movement->>'code')))<>0 THEN RAISE EXCEPTION 'Deleted movement visible'; END IF;
 BEGIN
   PERFORM public.pymio_api('movement.create',1,jsonb_build_object('code','10000000-0000-4000-8000-000000000001','request',request));
   RAISE EXCEPTION 'Deleted movement resurrected';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 PERFORM public.pymio_api('category.put',1,cat||'{"name":"QAS renamed"}');
 IF (SELECT category FROM public.products WHERE id=pid)<>'QAS renamed' THEN RAISE EXCEPTION 'Category cascade failed'; END IF;
 PERFORM public.pymio_api('category.delete',1,cat);
 IF (SELECT category FROM public.products WHERE id=pid)<>'Sin Clasificar' THEN RAISE EXCEPTION 'Category fallback failed'; END IF;
 PERFORM public.pymio_api('product.delete',1,product2);
 IF has_function_privilege('anon','public.pymio_api(text,bigint,jsonb)','EXECUTE') OR has_table_privilege('authenticated','public.products','SELECT') THEN RAISE EXCEPTION 'Exposed data'; END IF;
 RAISE NOTICE 'Supabase regression passed: import, CRUD, isolation, stock, rollback, retry, revisions, discounts, history and permissions';
END $$;
ROLLBACK;

