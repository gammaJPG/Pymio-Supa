# Categorías

`public.categories` guarda ID, empresa, nombre (`name`), sigla (`abbreviation`), fecha de creación y última actualización. Las fechas se generan en PostgreSQL. Las siglas usan los primeros tres caracteres del nombre en mayúsculas y el primer sufijo numérico libre desde 1. La unicidad de nombres y siglas se aplica dentro de cada empresa.

La migración conserva las categorías existentes de los productos y crea `Sin Clasificar`. Una clave foránea entre empresa/categoría del producto y el catálogo impide asignar categorías inexistentes, incluso fuera del formulario.

- `GET /api/categories?company_id=1`: lista el catálogo.
- `POST /api/categories?company_id=1`: crea con JSON `{ "name": "Hogar" }`.
- `PUT /api/categories/:id?company_id=1`: renombra y regenera la sigla. Actualiza los productos asociados.
- `DELETE /api/categories/:id?company_id=1`: reasigna productos a `Sin Clasificar` y elimina la categoría.

`Sin Clasificar` no se puede renombrar ni eliminar. Las operaciones se ejecutan en transacciones, con bloqueo por empresa para evitar colisiones de siglas simultáneas. El inicio de la API prepara el catálogo automáticamente.

Verificación: ejecutar npm test y supabase/regression.sql en una base aislada. Consulta ../SUPABASE.md.

## SKU automático de productos

Al crear un producto, la API ignora cualquier SKU enviado por el cliente y genera `SIGLAA001` hasta `SIGLAZ999` (999 números por letra, 25.974 posiciones). El contador persistente `categories.sku_counter` es independiente por categoría y no retrocede al eliminar productos. Se respetan los códigos existentes que coincidan con el formato para evitar duplicados. Cada alta y avance del contador se guardan juntos en una transacción con bloqueo por empresa; el agotamiento devuelve HTTP 409.

Los productos existentes conservan su SKU. Renombrar una categoría cambia el prefijo de futuras altas y conserva el avance de su contador. En Crear Producto el campo SKU queda oculto y deshabilitado; el flujo de modificación conserva su campo actual.

