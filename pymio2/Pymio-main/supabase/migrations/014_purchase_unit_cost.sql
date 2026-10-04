BEGIN;

-- Las instalaciones que ya aplicaron 004_movements necesitan esta corrección
-- para que una compra conserve el costo vigente del producto, no su precio de venta.
CREATE OR REPLACE FUNCTION public.pymio_purchase_unit_cost() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE movement_operation text; movement_detail text;
BEGIN
  SELECT operation, operation_detail INTO movement_operation, movement_detail
  FROM public.movements
  WHERE code = NEW.movement_code AND company_id = NEW.company_id;

  IF movement_operation = 'Ingreso' AND movement_detail = 'Compra' THEN
    SELECT cost INTO NEW.unit_price
    FROM public.products
    WHERE id = NEW.product_id AND company_id = NEW.company_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS movement_lines_purchase_unit_cost ON public.movement_lines;
CREATE TRIGGER movement_lines_purchase_unit_cost
BEFORE INSERT ON public.movement_lines
FOR EACH ROW EXECUTE FUNCTION public.pymio_purchase_unit_cost();

-- Corrige también las compras ya existentes con el costo disponible en Supabase.
UPDATE public.movement_lines AS line
SET unit_price = product.cost
FROM public.movements AS movement, public.products AS product
WHERE movement.code = line.movement_code
  AND movement.company_id = line.company_id
  AND product.id = line.product_id
  AND product.company_id = line.company_id
  AND movement.operation = 'Ingreso'
  AND movement.operation_detail = 'Compra';

REVOKE ALL ON FUNCTION public.pymio_purchase_unit_cost() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pymio_purchase_unit_cost() TO service_role;

COMMIT;
