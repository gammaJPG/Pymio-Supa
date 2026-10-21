# Transformación móvil de Pymio

## Auditoría antes de implementar (20 octubre 2026)

Pymio conecta registro de ventas/compras y otros ingresos/egresos con inventario, clientes, cobros, indicadores y una red empresarial. Aplicación modular HTML/JS: app.js carga seis secciones, conserva sesión y navegación; offline.js media operaciones y sincronización; la API aplica alcance empresarial desde sesión y Supabase/RPC valida permisos. No hay evidencia de roles globales distintos por trabajador: la UI distingue cuenta personal y piloto. Las comunidades tienen creador/owner, admin delegado, miembro y solicitante. La cuenta piloto bloquea escrituras de RED; no equivale a autorización para datos de otras empresas.

### Inventario de capacidades

| Capacidad / propósito | Acceso | Importancia estimada | Ubicación / móvil actual | Problema / oportunidad | Prioridad |
|---|---|---|---|---|---|
| Credenciales, registro, Google, completar empresa | Visitante | Crítica | piloto, login | Formulario largo y marca sobredimensionada; foco en acceso | P1 |
| Inicio, ingresos, prioridades reales | Sesión / piloto | Diaria | inicio.html | KPI aislado, textos pequeños, datos tomados de filtros del dashboard | P1 |
| Venta / compra y productos, cliente, canal, pago, descuentos, fecha | Sesión | Crítica | movimientos, Registrar | Campos largos, acciones alejadas; conservar validaciones y grupos progresivos | P0 |
| Otros movimientos, edición, eliminación y pago | Sesión | Alta | Actividad | Menús secundarios y detalle de tabla; lista expandible y controles claros | P1 |
| Historial, período, hora, estado, canal, pago, orden | Sesión | Alta | movimientos.html | Orden oculto en encabezados de tabla; añadir selector móvil | P0 |
| Inventario, búsqueda, categorías, ordenamiento | Sesión | Diaria | inventario.html | Lista invisible a 390: selector CSS desactualizado y vista escondida; orden inaccesible | P0 |
| Producto: alta/edición/eliminación, imagen, umbrales, estado, histórico | Sesión | Alta | formularios y detalle inventario | Adaptar estructura de detalle y formularios, no suprimir campos | P1 |
| Categorías: alta/edición/eliminación | Sesión | Ocasional | menú inventario | Mantener acceso secundario y confirmaciones | P1 |
| Dashboard: período/categoría/mes, KPI, barras, ranking, distribución, detalle | Sesión / piloto | Alta | dashboard.html | Seis KPI en carrusel esconden datos; jerarquía principal + matriz, filtros progresivos | P1 |
| Diagnóstico, stock y cobros pospuestos | Sesión / piloto | Alta | diagnostico.js/html | Priorizar alerta accionable y lectura vertical | P1 |
| Conexión, actualización, cola offline, descartar incidencias, notificaciones | Sesión | Crítica | topbar/offline.js | Cabecera saturada; actualizar desde herramientas sin esconder incidencias | P0 |
| Mi Pymio: perfil, avatar/banner, redes, vitrina/productos, vista pública | Personal; piloto demostrativo | Media | RED, sub-pymio | Menús y catálogo densos; secciones verticales, catálogo completo | P1 |
| Comunidades: buscar, crear, unirse/solicitar, conexiones | Personal / piloto lectura | Media | RED, sub-red | Inicio de RED en guías, difícil descubrir comunidad; entrada a Mi RED | P1 |
| Comunidad: resumen, eventos, formularios, respuestas/archivos, miembros | Miembro/owner/admin | Alta para miembros | diálogos RED | Panel de escritorio dentro de modal; cabecera, pestañas y detalle verticales | P1 |
| Comunidad: solicitudes, evento/formulario, identidad/redes, delegar admin, exportar/invitar | Owner/admin según RPC | Alta para administradores | centro de comunidad | Mantener todos los controles y permisos, simplificar jerarquía | P1 |
| Explorar: empresas, filtros, perfil público, conectar | Personal / piloto lectura | Media | RED, explorar | Grillas y filtros simultáneos; listas y filtros legibles | P2 |
| Eventos/beneficios: publicación y edición | Personal autorizado | Media | RED, eventos | Acciones y formularios largos; tarea a pantalla completa | P2 |
| Pymium, contraseña, cerrar sesión, tema | Sesión; contraseña no piloto | Ocasional | sidebar/cuenta | Cuenta móvil no expone cambio de contraseña; herramientas accesibles | P1 |

Frecuencias inferidas del propósito y flujos; no hay analítica de uso ni investigación con usuarios disponible.

### Hallazgos y recorridos

- P0: inventario móvil invisible pese a 18 registros; reglas apuntan a `.inventario-vista-simple` pero el DOM usa `.inventario-simple-grid`; al entrar desde desktop puede quedar `[hidden]`.
- P0: al ocultar encabezados de tablas se pierden controles de orden; deben existir equivalentes móviles.
- P1: mobile.css contiene reconstrucciones v105, v131 y v144 contradictorias, importantes repetidos y colores fijos incompatibles con temas.
- P1: navegación gráfica de 93px con bitmap pesado, ningún estado activo suficientemente inequívoco; cabecera con título, tema, conexión, actualizar, campana y cuenta en 390px.
- P1: dashboard usa carrusel para seis indicadores; contenido importante fuera de vista y textos de 9–11px.
- P1: formularios de operación muestran cliente, canal y pago antes del producto. Se conserva contrato/orden DOM y se agrupan visualmente productos y unidades para reducir longitud.
- P1: comunidad conserva dos columnas y acciones de administración en overlays; necesita flujo vertical con cabecera y pestañas accesibles.
- P2: inicio oculta onboarding y referencias a modo piloto; evitar presentar demostración como datos propios.

Recorrido venta: Inicio → Venta (1 toque) → campos reales y productos → guardar. Registrar → Venta (2 toques) es acceso global. No se inventa guardado ni se envían operaciones durante QA.
Recorrido stock: Inventario (1) → buscar/ordenar/filtrar → producto (1) → detalle/editar, histórico y estados disponibles. Recuperar lista es condición de aceptación.
Recorrido decisión: Inicio → Dashboard o Diagnóstico (1) → período/alerta → registros reales. Evitar que filtros del dashboard alteren el significado de “Ventas del mes” en Inicio.
Recorrido comunidad: RED (1) → Mi RED → comunidad → pestaña o acción por rol. Perfil, solicitudes, miembros y formularios siguen controlados por API/RPC.

## Plan antes de cambios visuales

1. Reemplazar mobile.css acumulativo por sistema único acotado a <=767px y teléfonos apaisados; a 768px transición a escritorio existente.
2. Barra inferior limpia de cinco destinos con iconos lineales existentes, indicador activo y Registrar etiquetado. Cabecera título/campana/cuenta; tema, actualización, seguridad y sesión en herramientas móviles.
3. Inicio operativo: nombre, período real, ventas y dos métricas secundarias, venta/compra, alertas y análisis accesible. Contexto piloto visible.
4. Inventario lista de productos con foto/nombre/stock/precio y detalle completo; vista móvil independiente sin cambiar preferencia desktop; orden móvil conectado a lógica actual.
5. Actividad lista expandible con montos, metadatos, detalle etiquetado, edición/pago, filtros y orden accesibles.
6. Dashboard KPI principal + matriz sin carrusel; gráficas y leyendas fluidas, filtros progresivos. Diagnóstico: alertas verticales con acciones.
7. RED con contexto y navegación local, listas completas, formularios y centro de comunidad de una columna. Guías quedan accesibles.
8. Formularios largos full-screen y confirmaciones en hoja; controles >=44px, inputs 16px, safe areas y manejo de teclado; sin alterar APIs.
9. Validación conjunta 320/360/375/390/430/768, temas, formularios, listas, menús, desktop y suite existente; segunda pasada para confirmar correcciones.

Dirección: modo Operate, lenguaje cálido y preciso; amarillo #f1cf54, tinta #20251c, papel #f7f6ef. Space Grotesk + IBM Plex Sans existentes con fallback sans explícito. Escala 12/14/16/20/28/34; espaciado 4/8/12/16/24/32. Radios 10 controles, 14 superficies, 24 hojas. Taste: DESIGN_VARIANCE 3, MOTION_INTENSITY 2, VISUAL_DENSITY 5, ajustados al uso operativo. CSS nativo y módulos existentes, sin dependencias nuevas.

Riesgos: preferencias de vista al cambiar resolución; observadores que se autoactivan; reglas de tema con especificidad alta; diálogos anidados y teclado. Medidas: conservar estado de escritorio, escribir solo cuando cambia un valor, un único dueño de hojas, usar dialog nativo para tareas, visualViewport solo para estado de teclado. Hardware móvil y roles reales adicionales requieren dispositivo/cuentas disponibles; declarar límites.

## Implementación y validación final — 20 octubre 2026

### Sistema entregado
- Navegación inferior de Inicio, Actividad, Registrar, Inventario y RED; herramientas y cuenta en hoja contextual. Dashboard y Diagnóstico accesibles desde Inicio y herramientas.
- Inicio con período, ventas, operaciones, ticket promedio y prioridades reales; cuenta piloto identificada.
- Inventario visible independientemente de la preferencia de escritorio, búsqueda y orden reales, detalle completo con SKU/categoría/precios/fechas e histórico.
- Actividad en listas expandibles; filtros, orden, detalles y acciones existentes conservados.
- Dashboard con indicador principal y matriz secundaria; Diagnóstico vertical; RED con navegación local, catálogos completos, comunidades y formularios verticales.
- Formularios extensos a pantalla completa, confirmaciones en hojas, protección de cambios sin guardar, inputs táctiles y manejo de visualViewport. Temas claro/oscuro y movimiento reducido.
- Sin dependencias nuevas ni cambios de contratos API, persistencia o autorización. La vista de escritorio se conserva; el punto de transición de 768–960 px recibe un submenú RED legible.

### Evidencia ejecutada
- Suite existente del servidor: 53/53 pruebas aprobadas.
- Sintaxis JavaScript y git diff --check aprobados.
- Matriz renderizada de seis módulos (Inicio, Dashboard, Inventario, Actividad, Diagnóstico y RED) a 320, 360, 375, 390, 430 y 768 px. Se corrigieron el desbordamiento de Diagnóstico a 768 px y un tooltip de RED a 320 px; comprobación final de RED: contenido 305/305 px, documento 320 px.
- Seis módulos inspeccionados a 1440 px; navegación de escritorio operativa, barra inferior móvil oculta y sin desbordamiento horizontal observado.
- Seis módulos capturados en oscuro a 390 px; formulario de venta revisado a 320 px.
- Inventario con 18 registros: búsqueda, orden descendente y detalle; actividad expandida; formulario de venta con validación de campos obligatorios y confirmación de descarte que permite seguir editando sin perder datos. No se enviaron operaciones de prueba.
- Acceso y registro inspeccionados, sin crear cuenta; sesión piloto restaurada.
- Revisor independiente de Impeccable: seis hallazgos corregidos y recapturados. Veredicto SHIP dentro del alcance revisado; no equivale a certificación de accesibilidad o de todos los permisos.
- El lanzador automático Impeccable no estuvo disponible; se leyeron las instrucciones y el contexto del proyecto directamente. No se afirma ejecución del detector automático.

### Límites y verificaciones pendientes
- No hubo smartphone físico disponible: teclado virtual, navegador móvil real y zonas seguras requieren comprobación en dispositivo.
- La cuenta piloto limita el detalle interactivo de comunidades. Se preservaron controles, listeners y permisos existentes; no se verificaron operaciones de administración, delegación, cargas de archivos ni escrituras con cuentas reales.
- No se ejecutó OAuth de Google ni una auditoría WCAG completa. Frecuencia de uso estimada a partir de los flujos, sin analítica ni entrevistas disponibles.
- Capturas y matriz de evidencia en C:/Users/swill/Documents/Codex/Pymio/mobile-review, fuera del repositorio. No se ha creado commit ni push en esta tarea.
