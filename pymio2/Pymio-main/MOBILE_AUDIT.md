# Auditoría de experiencia móvil

## Reconstrucción v105

La auditoría del primer intento detectó una portada promocional sobredimensionada, carruseles heredados del dashboard, duplicación de encabezados, demasiadas superficies independientes y una navegación que relegaba RED Pymio. La reconstrucción reemplaza el inicio por una bandeja operativa con ventas, registro inmediato, prioridades y accesos de trabajo. RED pasa a la navegación principal; análisis, diagnóstico, Pymium y cuenta se agrupan en un centro secundario. Las colecciones operativas usan listas continuas con divisores, mientras los formularios largos conservan flujos de pantalla completa.

## Inventario funcional preservado

| Área | Capacidades existentes | Patrón móvil aplicado |
| --- | --- | --- |
| Acceso | Ingreso, registro, Google y configuración inicial | Formulario táctil de una columna, campos de 16px y acciones de ancho completo |
| Inicio | Ventas, compras, vista previa, accesos, Pymium y RED | Prioridad a la operación, acciones gemelas y recorrido vertical |
| Dashboard | Períodos, categorías, seis KPI, gráfico, insight, productos, RED y distribución | Filtros progresivos, grilla jerárquica de KPI, bloques verticales y detalle táctil |
| Movimientos | Venta, compra, otros movimientos, filtros, orden, edición, eliminación, pagos y clientes | Acción central global, historial en tarjetas expandibles, filtros en panel inferior y formulario a pantalla completa |
| Inventario | Buscar, filtrar, vistas, productos, categorías, estados, imágenes y edición | Resumen desplazable, fichas visuales con edición directa y filtros inferiores |
| Diagnóstico | Resumen, alertas, métricas, notificaciones y navegación contextual | Señales en una sola columna y targets táctiles amplios |
| RED Pymio | Guías, Mi Pymio, comunidades, conexiones, matchmaking, perfiles, eventos y beneficios | Pestañas desplazables, tarjetas de una columna, búsqueda compacta y formularios a pantalla completa |
| Global | Estado de conexión, actualización, notificaciones, Pymium y cierre de sesión | App bar compacta, menú Más y hojas inferiores |

## Decisiones de arquitectura

- Navegación inferior: Inicio, Actividad, Registrar, Inventario y RED.
- Registrar abre Venta, Compra, Otro movimiento y Producto sin cambiar primero de sección.
- Dashboard, Diagnóstico, Pymium y cuenta viven en el centro de herramientas del encabezado.
- Tablas operativas pasan a tarjetas o listas expandibles; la tabla de escritorio permanece intacta.
- Formularios largos ocupan la pantalla completa y mantienen sus acciones visibles.
- Filtros aparecen como paneles inferiores; los secundarios permanecen ocultos hasta que se solicitan.
- Breakpoint principal de 767px y tratamiento móvil para orientación horizontal hasta 950 × 500px.

## Verificación realizada

- Teléfono pequeño: 320 × 700.
- Teléfono estándar: 390 × 844.
- Teléfono grande: 430 × 932 mediante composición fluida del mismo rango.
- Orientación horizontal: 844 × 390.
- Revisión visual de Inicio, Dashboard, Movimientos, Inventario, RED Pymio, acciones rápidas, filtros y formulario de producto.
- Revisión de consola sin errores en la pasada final.
- Suite del servidor: 33 pruebas aprobadas.

## Auditoría integral v119

La revisión posterior recorrió acceso, alta de cuenta, Inicio, Actividad, Dashboard, Inventario, Diagnóstico, las cinco vistas de RED, notificaciones, estado de conexión, Pymium y los formularios de creación y edición. También comprobó el comportamiento entre 320 y 430 px, orientación horizontal y una regresión desktop a 1280 px.

### Hallazgos corregidos

- **Crítico:** la navegación inferior aparecía antes de iniciar sesión. Ahora solo existe dentro de la experiencia autenticada.
- **Alto:** RED podía mostrar Guías mientras destacaba Mi Pymio. El estado visible se sincroniza con la subvista real y conserva `aria-current`.
- **Alto:** la caché podía devolver CSS o JavaScript anterior aunque cambiara el parámetro de versión. Los recursos versionados usan red primero y conservan la copia exacta como respaldo sin conexión.
- **Alto:** los formularios operativos largos obligaban a llegar al pie para cancelar. Ahora incluyen una salida superior de 44 × 44 px, además de sus acciones persistentes.
- **Medio:** las notificaciones se abrían como un desplegable alto heredado de escritorio. En teléfono se presentan como una hoja inferior, con encabezado fijo y desplazamiento contenido.
- **Medio:** el encabezado se comprimía y partía el título de RED a 320 px. La etiqueta y la acción de actualización se acortan únicamente cuando el ancho lo exige.
- **Medio:** la vitrina de Mi Pymio consumía demasiado recorrido vertical. El catálogo pasa a una colección horizontal con encaje y vista parcial del siguiente producto.
- **Medio:** Diagnóstico repetía el estado en insignia, título y descripción. El estado contraído conserva producto, métrica y acción; el detalle explica umbral y recomendación bajo demanda.
- **Bajo:** barras de desplazamiento decorativas, botones de 32–40 px y una acción secundaria demasiado destacada añadían ruido. Se ocultaron barras móviles, se elevaron los targets a 44 px y se rebajó “Otros movimientos”.

### Resultado de la matriz responsive

- 320, 360, 375, 390, 414 y 430 px sin overflow horizontal del documento.
- Targets globales del encabezado y navegación de al menos 44 px.
- RED conserva su navegación secundaria desplazable sin empujar el documento.
- Inicio de sesión y creación de cuenta sin navegación de aplicación ni contenido lateral de desktop.
- Desktop conserva sidebar, dashboard multicolumna y ancho de documento sin overflow.
