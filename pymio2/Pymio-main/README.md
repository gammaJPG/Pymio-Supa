# Pymio

Plataforma piloto de gestión para pymes con inventario, movimientos, clientes y un Dashboard conectado a Supabase.

## Ejecución local

Requiere Node.js 20.10 o posterior y un archivo privado `servidor/.env` con `SUPABASE_URL` y `SUPABASE_SECRET_KEY`.

```powershell
npm start
```

La interfaz queda en `http://localhost:5500/piloto.html` y la API local en `http://127.0.0.1:3001`.

```powershell
npm test
```

## Arquitectura de datos

El navegador nunca recibe la clave secreta. Consulta la API local y el servidor realiza las llamadas RPC y de Storage a Supabase.

- `GET /api/products`: inventario y umbrales de stock.
- `GET /api/movements`: ventas, compras, productos, importes, clientes y estados de pago.
- `GET /api/customers`: catálogo de clientes.
- `dashboard-data.js`: normalización, rangos temporales y agregaciones puras.
- `dashboard.js`: carga de datos, filtros y representación del Dashboard e Inicio.

## Estado anterior

Antes de estos cambios, Inventario y Movimientos trabajaban con Supabase, pero Dashboard e Inicio construían productos y 75 días de transacciones ficticias dentro de `dashboard.js`. Los KPI, porcentajes, clientes, pendientes, gráficos y hallazgos no representaban la operación almacenada.

El comando de inicio también utilizaba `--use-system-ca`, opción incompatible con Node.js 20.10 en este entorno. Además, el service worker conservaba versiones antiguas de los módulos.

## Conexión del Dashboard

Se eliminó el generador demostrativo y se adoptaron estas reglas:

- Una venta es un movimiento con `operation = Egreso` y `operation_detail = Venta`.
- Las categorías se obtienen relacionando cada línea con Inventario mediante `product_id`.
- El número de ventas cuenta movimientos, no líneas de productos.
- Los ingresos usan los importes netos de las líneas vendidas.
- El ticket promedio es ingreso dividido por número de ventas.
- Los clientes con ventas son clientes distintos asociados a ventas del período.
- Las ventas por cobrar usan `Estado = Pendiente de Pago`.
- Stock bajo significa `qty > 0` y `qty <= low_qty`; los agotados se mantienen como una situación separada.
- Los rankings, barras y distribución por categoría se recalculan con los filtros activos.
- Inicio y Dashboard comparten las mismas agregaciones.
- Los eventos de inventario y sincronización de movimientos fuerzan una recarga de los resúmenes.

## Ajustes de esta iteración

### Períodos y gráfico de barras

Cuando se selecciona `Este mes`, los KPI siguen describiendo el mes actual, mientras el gráfico muestra seis meses de contexto, desde mayo hasta octubre de 2026 con los datos actuales. Cada barra identifica el mes correspondiente.

El selector se ordena de menor a mayor extensión temporal: `Hoy`, `Últimos 7 días`, `Últimos 30 días`, `Este mes` y `Último año`. Los demás filtros conservan el detalle apropiado:

- `Último año`: habilita el selector `Mes`. Sus meses se construyen desde las ventas realmente registradas y se ordenan desde el registro más reciente hasta el más antiguo.
- `Seleccionar`, primera opción del selector `Mes`, consolida todas las ventas del histórico disponible. Los KPI muestran totales históricos, las barras representan cada mes registrado y no se presenta una comparación artificial contra un período anterior.
- Al elegir un mes concreto, los KPI comparan ese mes con el mes calendario anterior y el gráfico lo desglosa por semanas.
- `Últimos 30 días`: intervalos semanales.
- `Últimos 7 días`: una barra por día.
- `Hoy`: intervalos horarios.

### Comparaciones reales

Cada porcentaje compara períodos equivalentes:

- Mes actual contra mes anterior.
- Últimos 30 días contra los 30 días inmediatamente anteriores.
- Últimos 7 días contra los 7 días inmediatamente anteriores.
- Hoy contra ayer.

Si el período anterior no tiene una base válida, se muestra `Nuevo` o `Sin cambio` en lugar de fabricar un porcentaje.

Cada porcentaje admite cursor y foco de teclado. Su ayuda contextual muestra los valores absolutos del período seleccionado y del período anterior utilizados en el cálculo.

Los mensajes de las barras elevan su capa visual al recibir cursor o foco para no quedar ocultos detrás de barras vecinas. El gráfico de categorías asigna una paleta estable de colores únicos según el catálogo real, evitando reutilizar el mismo color entre categorías visibles.

### Consistencia del stock bajo

La tarjeta KPI y la señal de “Tu próxima decisión” usan exactamente la misma colección y el mismo criterio. La señal comunica primero el total del KPI y después destaca la categoría con mayor concentración. Así, un total de cuatro productos puede indicar que dos pertenecen a Legumbres sin aparentar que existen dos totales distintos.

## Integración con `main`

El merge conserva el dashboard conectado de `Tinoski-branch` e incorpora las mejoras operativas de `main`:

- Las sesiones identifican la empresa activa y el Dashboard, Inicio, Movimientos e Inventario consultan exclusivamente sus datos.
- El acceso admite cuenta piloto, cuentas personales y el flujo preparado para Google Auth.
- Inventario conserva vistas detallada y simple, gestión de categorías, imágenes, historial y formularios adaptables.
- Movimientos descuenta del stock disponible las ventas todavía pendientes de sincronización y restaura las unidades originales al editar.
- Los movimientos pendientes pueden marcarse como pagados sin perder canal, medio de pago, cliente, descuentos ni productos.
- El formulario de venta exige canal y medio de pago; el cliente sigue siendo opcional y mantiene la misma estética de selector.
- Corregir una cantidad que excedía el stock elimina inmediatamente el error anterior y permite volver a validar el formulario.
- El detalle expandido muestra descuento total, estado, medio de pago, tipo, código y cliente con el formato visual original.
- `Ventas por cobrar` abre directamente Movimientos mostrando los códigos calculados por el período y categoría activos.
- `Stock bajo` abre directamente Inventario mostrando exactamente los productos incluidos en el KPI.
- Las tarjetas del Dashboard conservan tooltips, colores únicos, diseño adaptable y tooltips de barras sobre el resto del gráfico.

El service worker integra tanto `dashboard-data.js` como `movimientos-stock.js`; su caché se versionó como `v83` para evitar recursos anteriores al merge.

## Ventas históricas creadas en Supabase

Se agregaron cuatro ventas pagadas, sin descuentos y con cantidades pequeñas de productos con stock disponible. Sus UUID de solicitud son fijos para que un reintento sea idempotente.

| Fecha | Código visible | Producto | Unidades | Total |
| --- | --- | --- | ---: | ---: |
| 15-05-2026 | `5b7095dff329` | Arroz grado 2 bolsa 1 kg | 5 | $7.450 |
| 15-06-2026 | `4d39b29ae648` | Fideos espirales paquete 400 g | 8 | $6.320 |
| 15-07-2026 | `7532d05897a9` | Harina sin polvos bolsa 1 kg | 4 | $4.760 |
| 15-08-2026 | `b32395034e17` | Agua mineral sin gas botella 1.5 L | 10 | $6.900 |

Septiembre y octubre ya contenían ventas, por lo que no se añadieron registros adicionales en esos meses.

## Caché y modo offline

El service worker fue versionado y ahora incluye `dashboard-data.js`. Los cambios de módulos también incrementan sus parámetros de versión para impedir que el navegador mezcle la interfaz nueva con lógica antigua.

## Verificación

La suite cubre validaciones, movimientos, clientes, productos, transporte hacia Supabase, seguridad de archivos públicos y agregaciones del Dashboard. La prueba específica comprueba:

- Unión de movimientos con categorías del inventario.
- Exclusión de compras de las ventas.
- Ingresos, unidades, pendientes y clientes distintos.
- Filtros por categoría.
- Stock bajo sin contar agotados.
- Comparaciones con intervalos equivalentes.
- Rango de seis meses para el gráfico mensual.

Las credenciales y el archivo `servidor/.env` no deben incorporarse al repositorio.
