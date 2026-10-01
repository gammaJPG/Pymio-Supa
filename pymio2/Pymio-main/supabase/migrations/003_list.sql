BEGIN;
CREATE OR REPLACE FUNCTION public.pymio_list(company bigint, payload jsonb) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = public, pg_temp AS $fn$
SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) FROM (
WITH recent AS (
    SELECT * FROM public.movements WHERE company_id=company AND deleted_at IS NULL AND ((payload->>'code')::text IS NULL OR display_code=(payload->>'code')) AND ((payload->>'from')::timestamptz::timestamptz IS NULL OR occurred_at >= (payload->>'from')::timestamptz) AND ((payload->>'to')::timestamptz::timestamptz IS NULL OR occurred_at < (payload->>'to')::timestamptz) ORDER BY created_at DESC, code LIMIT 500
  ), grouped AS (
    SELECT m.code, m.display_code, m.operation, m.operation_detail, m.channel, m.payment_method, m.occurred_at, m.created_at, m.discount_type, m.discount_value, m.discount_scope, m.revision, m."Estado",
      COUNT(DISTINCT l.product_id)::integer AS product_count,
      SUM(l.unit_price * ABS(l.units::numeric)) AS subtotal,
      SUM(CASE WHEN l.discount_type='percentage' THEN l.unit_price * ABS(l.units::numeric) * l.discount_value/100 WHEN l.discount_type='fixed' THEN l.discount_value ELSE 0 END) AS line_discount_amount,
      jsonb_agg(jsonb_build_object('product_id',l.product_id::text,'sku',l.sku,'name',l.product_name,'unit_price',l.unit_price,
        'discount_type',l.discount_type,'discount_value',l.discount_value,'discount_amount',(CASE WHEN l.discount_type='percentage' THEN l.unit_price * ABS(l.units::numeric) * l.discount_value/100 WHEN l.discount_type='fixed' THEN l.discount_value ELSE 0 END),'net_total',l.unit_price * ABS(l.units::numeric)-(CASE WHEN l.discount_type='percentage' THEN l.unit_price * ABS(l.units::numeric) * l.discount_value/100 WHEN l.discount_type='fixed' THEN l.discount_value ELSE 0 END),'total',l.unit_price * ABS(l.units::numeric),'initial_qty',l.initial_qty,'units',l.units,'final_qty',l.final_qty) ORDER BY l.id) AS products
    FROM recent m JOIN public.movement_lines l ON l.movement_code=m.code
    GROUP BY m.code,m.display_code,m.operation,m.operation_detail,m.channel,m.payment_method,m.occurred_at,m.created_at,m.discount_type,m.discount_value,m.discount_scope,m.revision,m."Estado"
  ) SELECT display_code AS code, revision, "Estado", operation, operation_detail, channel, payment_method, occurred_at, product_count, subtotal, discount_type, discount_value, discount_scope,
    CASE WHEN discount_scope='product' THEN line_discount_amount WHEN discount_type='percentage' THEN subtotal*discount_value/100
      WHEN discount_type='fixed' THEN discount_value ELSE 0 END AS discount_amount,
    subtotal - CASE WHEN discount_scope='product' THEN line_discount_amount WHEN discount_type='percentage' THEN subtotal*discount_value/100
      WHEN discount_type='fixed' THEN discount_value ELSE 0 END AS total,
    products FROM grouped ORDER BY created_at DESC, code) r;
$fn$;
REVOKE ALL ON FUNCTION public.pymio_list(bigint,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pymio_list(bigint,jsonb) TO service_role;
COMMIT;
