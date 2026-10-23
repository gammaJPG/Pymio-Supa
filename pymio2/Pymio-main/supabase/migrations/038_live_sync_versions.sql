CREATE OR REPLACE FUNCTION public.pymio_live_version(target_company bigint)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path=public
AS $$
  SELECT jsonb_build_object(
    'products', (SELECT jsonb_build_array(count(*),coalesce(max(updated_at)::text,'')) FROM public.products WHERE company_id=target_company),
    'categories', (SELECT jsonb_build_array(count(*),coalesce(max(updated_at)::text,''),coalesce(sum(sku_counter),0)) FROM public.categories WHERE company_id=target_company),
    'movements', (SELECT jsonb_build_array(count(*),coalesce(max(created_at)::text,''),coalesce(max(deleted_at)::text,''),coalesce(sum(revision),0)) FROM public.movements WHERE company_id=target_company),
    'customers', (SELECT jsonb_build_array(count(*),coalesce(md5(string_agg(row_to_json(c)::text,',' ORDER BY c.id)),'')) FROM public.customers c WHERE company_id=target_company)
  );
$$;

REVOKE ALL ON FUNCTION public.pymio_live_version(bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pymio_live_version(bigint) TO service_role;
