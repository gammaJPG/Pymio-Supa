# Movimientos

Inicia o reinicia la API desde esta carpeta con `npm.cmd start` y recarga `SWC Platform/piloto.html` mediante el servidor web habitual. El inicio de la API crea las tablas de movimientos si todavía no existen; también se verificaron en la base configurada durante la implementación.

- `GET /api/movements?company_id=1`: últimos 500 movimientos completos, agrupados con productos y totales.
- `POST /api/movements?company_id=1`: registra un movimiento y actualiza el stock dentro de una transacción.
- `public.movements`: UUID interno para reintentos, código visible único de 12 caracteres, empresa, operación, fecha y descuento de todo el movimiento.
- `public.movement_lines`: una fila por producto, con empresa, código, ID del producto, SKU, unidades firmadas, fecha, cantidad inicial, cantidad final, nombre y precio unitario del inventario al guardar.

El formulario utiliza la empresa del acceso piloto actual (`companyId = 1`), igual que Inventario. La API existente sigue usando el parámetro de empresa; no hay un sistema de sesiones autenticadas.

Las unidades son enteras positivas en el formulario. El servidor transforma los egresos en unidades negativas, bloquea los productos durante la transacción y rechaza stock final negativo o fuera de rango. Los productos repetidos se rechazan: se deben reunir sus unidades en una sola línea. La fecha elegida corresponde a la operación; el stock inicial es el disponible al guardar, incluso cuando la fecha elegida sea anterior.

El descuento es opcional: global (solo porcentual) o por producto (monto fijo o porcentaje en cada fila). El monto fijo se resta una vez del subtotal de la fila, no por unidad. El alcance se guarda en movements.discount_scope y los valores individuales en movement_lines.discount_type y discount_value. Los descuentos globales fijos antiguos conservan su cálculo al consultar; para editarlos se debe elegir la nueva modalidad. No cambia las unidades ni los precios del catálogo. El subtotal suma precio unitario × valor absoluto de unidades; el total resta el descuento fijo o el porcentaje del subtotal. Los movimientos previos a esta actualización toman el precio del inventario al migrar; los nuevos conservan el precio al registrarse.

Los reintentos del mismo formulario reutilizan el código y los mismos datos para evitar duplicar el movimiento. Ante una respuesta incierta, usar **Reintentar** antes de cerrar el formulario.

Modificar y eliminar están disponibles desde el menú +. El selector muestra los últimos 500 movimientos por código y fecha.

- PUT /api/movements/:codigo: modifica operación, fecha, productos, unidades y descuento. Conserva el código y los precios históricos de los productos que permanecen; los productos añadidos toman el precio actual.
- DELETE /api/movements/:codigo: revierte el efecto del movimiento sobre el stock y lo retira del listado. Se conserva internamente con deleted_at para auditoría y para impedir que un reintento antiguo vuelva a aplicar sus unidades.
- Ambos requieren revision y action_id (UUID). La revisión detecta formularios desactualizados y action_id permite reintentar sin aplicar dos veces el cambio.
- Los saldos de movimientos posteriores se desplazan por la diferencia de unidades, según orden de registro. Cambiar la fecha declarada no reordena ese historial. Se rechaza una operación si deja stock negativo o fuera de rango, incluido el saldo de un movimiento posterior.
- Los cambios se guardan en una transacción y se serializan por empresa, junto con el alta de movimientos.

## Verificación

Las pruebas actuales se ejecutan con npm test. La regresión SQL de Supabase está en supabase/regression.sql y se ejecuta en una base aislada; consulta ../SUPABASE.md.

`movimientos.browser.cjs` prueba el formulario con Chrome y una API simulada, sin modificar productos reales. Usa Playwright instalado, o la ruta del módulo indicada en `PLAYWRIGHT_MODULE`.


Los filtros Desde/Hasta y los períodos Hoy, Últimos 7 días y Últimos 30 días usan la fecha de operación y los días locales del navegador, incluyendo hoy. La API acepta from (inclusivo) y to (exclusivo) como fechas ISO con zona horaria y filtra antes del límite de 500 movimientos. Todos limpia el rango. Abrir un movimiento desde el inventario también limpia el filtro para mostrarlo.

## Mejoras de Movimientos (integración local de cambios.zip)

- Accesos directos a Venta y Compra; Otros Movimientos conserva alta, modificación y eliminación.
- Filtros horarios locales, incluyendo intervalos que cruzan medianoche. Se aplican sobre los hasta 500 registros devueltos para el rango de fechas.
- Fecha y hora usan el momento de apertura del formulario y pueden ajustarse en la sección opcional.
- Ventas con estado Pagado o Pendiente de Pago, persistido en PostgreSQL y conservado al editar.
- Código, descuento total y estado aparecen en el detalle desplegable. Importes mostrados en pesos enteros; se conserva la precisión de los cálculos en la API.
- Actualización al entrar a Movimientos y al sincronizar. Se conserva el botón manual y la presentación actual del estado de conexión.

La integración conserva los estilos, animaciones y navegación actuales. No reemplaza las hojas de estilo por las versiones antiguas del ZIP.

Pruebas: npm test y supabase/regression.sql en una base aislada, según SUPABASE.md.


