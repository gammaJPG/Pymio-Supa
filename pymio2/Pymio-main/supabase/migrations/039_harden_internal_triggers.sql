ALTER FUNCTION public.inventory_touch_product_updated_at()
  SET search_path=public,pg_temp;

REVOKE ALL ON FUNCTION public.pymio_notify_community_event() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.pymio_notify_community_form() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pymio_notify_community_event() TO service_role;
GRANT EXECUTE ON FUNCTION public.pymio_notify_community_form() TO service_role;
