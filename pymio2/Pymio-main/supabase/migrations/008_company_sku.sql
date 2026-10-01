BEGIN;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_sku_key;
ALTER TABLE public.products
  ADD CONSTRAINT products_company_sku_key UNIQUE (company_id, sku);

COMMIT;
