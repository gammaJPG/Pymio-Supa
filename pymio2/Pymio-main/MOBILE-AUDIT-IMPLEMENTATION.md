# Aplicación de la auditoría móvil

Fecha: 20 de octubre de 2026.

Fuente: `mobile-ux-audit/INFORME-AUDITORIA-MOVIL.md` en el espacio de trabajo. Esta entrega aplica los 19 hallazgos concretos; las ampliaciones de producto del apartado 4 siguen siendo propuestas que requieren validación de alcance y recorridos con cuentas autorizadas. No se sustituyeron permisos, datos ni operaciones por simulaciones.

## Cambios por hallazgo

| Auditoría | Implementación |
|---|---|
| H01 · Alertas sin destino específico | Inicio abre los productos que necesitan reposición o las ventas pendientes, conserva la intención mediante un contexto visible y permite quitar los filtros. Incluye productos agotados. |
| H02 · Gráfico difícil de tocar | Cada columna ofrece una superficie completa de selección, con mínimo de 44 px de ancho, detalle anunciado y alternativa textual desplegable con importes y unidades. |
| H03 · Período ambiguo | El gráfico distingue sus seis meses de contexto del indicador mensual y explica que el mes actual está en curso. |
| H04 · Formulario piloto bloqueado sin contexto | Registrar y el formulario explican que la cuenta piloto permite explorar pero no guardar operaciones. |
| H05 · Categoría sin nombre accesible | El selector de categoría tiene un nombre explícito. |
| H06 · Cuenta mezclada con herramientas | La hoja de cuenta concentra preferencias y sesión; Análisis y herramientas quedan accesibles desde Inicio. |
| H07 · Urgencias poco diferenciadas | El bloque de reposición distingue agotados y stock bajo, conservando un total coherente con el destino filtrado. |
| H08 · Porcentajes sin base | Inicio y Análisis muestran importes comparativos; Análisis añade fechas de los períodos. |
| H09 · Actividad difícil de reconocer | Resumen con cliente o producto, importe, hora, canal y estado; agrupación por día y orden descendente predeterminado en móvil. El detalle completo sigue disponible. |
| H10 · Límite de registros opaco | El texto explica el límite de 500, cómo consultar fechas anteriores y el alcance de la búsqueda. |
| H11 · Imágenes ausentes dominantes | Los productos sin imagen usan una fila compacta que prioriza nombre y datos, sin una columna vacía de imagen. |
| H12 · Filtros y administración mezclados | Administración del catálogo se separa de los filtros de consulta. |
| H13 · Ordenamiento técnico | Se utilizan etiquetas como Menor stock y Nombre A–Z. |
| H14 · Texto pequeño | Se aumenta la legibilidad de navegación y metadatos móviles, conservando jerarquías entre título, importe y contexto. |
| H15 · Orden visual y accesible distintos | Registrar sigue el mismo orden en la estructura y en pantalla: venta, compra, producto y otro movimiento. |
| H16 · Etiquetas pegadas | Se separan correctamente títulos y descripciones en las opciones de registro. |
| H17 · Guías con destinos distintos | La sección se llama Herramientas y sus descripciones explican los destinos reales. |
| H18 · Aviso fuera de contexto | Al cambiar de sección de RED se limpia el aviso de la sección anterior. |
| H19 · Dos catálogos confundidos | La vitrina piloto explica que sus tres artículos son ejemplos independientes del inventario de la cuenta. |

Además, la confirmación de pago indica importe y operación, y aclara que actualizar el registro no ejecuta un cobro bancario. No se realizó ningún pago durante la verificación.

## Verificación realizada

- 15 pruebas automatizadas aprobadas: datos de dashboard, diagnóstico, stock de movimientos, pagos y formato numérico.
- Comprobación de sintaxis de los módulos JavaScript modificados.
- 30 combinaciones de tamaño y módulo: 320, 360, 375, 390, 430 y 768 px; Inicio, Actividad, Inventario, Análisis y RED. Sin desbordamiento horizontal de página o contenedor principal en la confirmación final.
- Se corrigió el desbordamiento de Actividad detectado en 320–375 px y se confirmó nuevamente toda la matriz.
- Alertas de Inicio: destino exacto de 4 productos para reposición y 2 ventas pendientes en la cuenta piloto; quitar filtros devuelve el catálogo completo de 18 productos.
- Selección táctil del gráfico y lista textual de seis períodos comprobadas; columnas de 46,5 × 180 px en el viewport de 390 px.
- Orden de Registrar, advertencia piloto, nombres accesibles, menú de cuenta y catálogo comprobados en navegador.
- Inspección visual de Análisis en claro y oscuro a 390 px, y de su presentación de escritorio a 1280 px. El escritorio mantiene su navegación y composición.
- Sin errores de consola capturados durante la revisión.
- Evidencias y matriz: `mobile-audit-implementation/` en el espacio de trabajo.

## Límites y trabajo pendiente de validar

- Las pruebas se hicieron en navegador, no en un teléfono físico: teclado virtual, lectores de pantalla, áreas seguras y rendimiento requieren dispositivos reales.
- La cuenta piloto restringe escritura y administración. No se certifican altas/ediciones persistentes, cobros registrados ni los recorridos completos de propietario, administrador y miembro de comunidad.
- Los formularios y permisos existentes se preservan. Propuestas como productos frecuentes, un nuevo resumen de venta, reorganización profunda de administración comunitaria y recorte de imágenes son ampliaciones de producto, no capacidades nuevas incluidas en esta entrega.
- La comprobación de escritorio fue visual y de navegación; no sustituye una regresión integral de todas las operaciones del negocio.

## Mantenimiento

Las reglas de presentación nuevas se limitan a los rangos móviles de `mobile.css`. `mobile-workspace.js` restaura los contenidos y ubicaciones originales al volver al escritorio. Las acciones reutilizan los eventos y filtros existentes; no añaden endpoints ni bibliotecas. Los recursos y caché de la plataforma se actualizaron a la versión 152.
