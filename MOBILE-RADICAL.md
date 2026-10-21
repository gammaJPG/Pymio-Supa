# Pymio móvil: reemplazo de la dirección rechazada

## Auditoría y preservación antes de implementar

Fecha: 20 octubre 2026. El usuario rechaza las propuestas móviles anteriores. La identidad (abeja, miel, tinta) y la lógica real se conservan, la composición anterior deja de ser autoridad visual. La auditoría funcional completa de MOBILE-REDESIGN.md se contrastó con app.js, inicio/inventario/movimientos/dashboard/diagnostico/ecosistema, los renderizadores y servidor/red-pymio.mjs. Las frecuencias son estimaciones de producto, no analítica.

| Área | Capacidades que deben seguir disponibles | Acceso y frecuencia estimada | Problema actual / nueva ubicación |
|---|---|---|---|
| Acceso | credenciales, Google, registro, completar empresa, contraseña, sesión | visitante/cuenta; crítica | acceso enfocado, cabecera de marca y formulario legible |
| Inicio | indicadores del mes, venta, compra, producto, prioridades, onboarding | sesión/piloto; diaria | cifra domina y desplaza tareas; abrir con pendientes y registro, resumen financiero secundario |
| Actividad | venta/compra/otros, cliente, pagos, descuentos, fecha, edición/borrado, detalle, filtros, orden | sesión; diaria | filas de 140px, controles dispersos; lista compacta y filtros agrupados |
| Inventario | producto, foto, SKU, categoría, stock/umbrales, precio/costo, estado, historial, orden y filtros | sesión; diaria | primer producto debajo de 550px; cabecera compacta, búsqueda prioritaria, catálogo legible |
| Análisis | seis indicadores, comparación, períodos/categorías, gráfico por intervalo, ranking, distribución y detalle | sesión; frecuente | seis tarjetas y encabezados repetidos; informe con gráfico y resumen compuesto |
| Diagnóstico | alertas stock/cobros, reposición, posponer y consultar registros | sesión; frecuente | alertas sin prioridad visual; bandeja de revisión y acciones a mano |
| RED | Mi Pymio, perfil/medios/redes/vitrina, comunidades/búsqueda/unión, explorar/filtros/conexión, eventos, guías | personal; piloto demostrativo | navegación horizontal poco jerárquica; navegación local clara, comunidades con identidad propia |
| Comunidad | resumen, identidad, miembros, solicitudes, eventos, formularios/respuestas/archivos, invitar/exportar | miembro/owner/admin; según rol | conserva permisos y acciones, convierte la cabecera y el contenido en espacio vertical |
| Herramientas | conexión, sincronización/cola/incidencias, notificaciones, apariencia, Pymium, seguridad y salida | sesión; ocasional/crítica | cuenta y estado accesibles desde barra compacta |

API: sesión empresarial, validaciones y persistencia permanecen. RED limita creación y detalle en piloto; owner/admin autoriza gestión (también servidor/RPC). No se alteran permisos para facilitar capturas. Inventario conserva preferencia desktop y detalles completos; formularios conservan nombres/validación. Los datos de Inicio proceden de fuentes reales ya renderizadas, nunca métricas inventadas.

Recorridos: nueva venta desde Inicio (1 toque) o Registrar (2); buscar producto desde Inventario (1 + escritura), abrir detalle (1); consulta análisis desde Inicio/herramientas; RED→comunidad→acción según rol. Las pruebas no enviarán operaciones financieras ni modificarán comunidades reales.

## Tres direcciones consideradas

| Dirección | Composición y navegación | Tipografía / superficie / interacción | Evaluación |
|---|---|---|---|
| Cuaderno operativo | Inicio como registro cronológico; fecha→movimientos→registro; tabs Historial/Stock/RED | filas de libro de operaciones, importes tabulares, blanco y tinta, expansión en línea | Muy clara para ventas; insuficiente para quien entra a decidir y atender prioridades. No seleccionada. |
| Mesa de trabajo | Inicio tareas→registro→resumen; catálogo primero en Inventario; Actividad como lista; Análisis como informe | sans precisa, encabezados compactos, miel en acción/selección, superficies agrupadas, menús progresivos | Seleccionada: cada módulo responde a su tarea, reduce scroll inicial y distingue claramente la nueva composición. Riesgo: densidad en 320px, se verifica. |
| Espacios especializados | tres áreas Vender/Controlar/Conectar con navegación contextual y regreso | pantallas dedicadas, bloques amplios, transiciones de vista, mayor separación | Buena separación conceptual; agrega niveles y complica comparar stock con movimientos. No seleccionada. |

La elección se basa en claridad, usabilidad, diferenciación y preservación funcional. No se asignan puntuaciones numéricas ficticias. Taste: overhaul, DESIGN_VARIANCE 6, MOTION_INTENSITY 3, VISUAL_DENSITY 6. Sus recetas de landing y dashboards simulados no aplican. Impeccable Operate gobierna interacción/accesibilidad. Código nativo, sin biblioteca nueva.

## Direction contract

THESIS: una mesa de trabajo en el bolsillo; las tareas y el catálogo ocupan el primer viewport, el análisis se consulta con contexto. Reemplazar el KPI gigante y la sucesión de bloques con igual peso.

OWN-WORLD: miel Pymio, tinta verde, neutral claro, sans precisa; grupos de lectura sobre superficies discretas, contornos mínimos, datos tabulares y acciones compactas. Sin ilustraciones nuevas para rellenar.

STORY: entender qué atender, registrar la operación, revisar producto o historial y consultar resultados; la comunidad tiene su propio contexto.

FIRST VIEWPORT: barra de contexto compacta; Inicio presenta negocio y dos pendientes conectados a destinos reales, acciones de venta/compra y un resumen mensual. Inventario muestra búsqueda y al menos dos productos a 390px. Actividad muestra controles agrupados y tres o más registros cuando existan.

FORM: Mesa de trabajo, selección explícitamente delegada por el usuario entre tres direcciones. Ruta code-led: validar una muestra Inicio/Inventario/Actividad antes de extender. El lanzador Impeccable estuvo indisponible en esta sesión; instrucciones y contexto leídos directamente, no se simula sorteo ni detector.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Plan de ejecución

1. Capturas equivalentes antes: seis módulos a 390×844, cuenta piloto, claro.
2. Sustituir la estructura móvil de Inicio, navegación y herramientas; reconstruir agrupación de controles de Inventario/Actividad sin duplicar negocio.
3. Validar visualmente esa muestra, comprobar acceso y densidad. Corregir la dirección si mantiene la composición rechazada.
4. Extender a informe/diagnóstico/RED/perfil/comunidad/formularios/acceso, sin modificar composición desktop.
5. QA conjunta seis resoluciones, temas, navegación, formularios y pruebas existentes. Comparación antes/después en mismas condiciones.
6. Revisión independiente, correcciones, documentación de tokens y límites. Hardware real, OAuth y administración personal requieren evidencia propia; nunca se dan por probados con piloto.

## Implementación y comparación final

Se sustituyó la composición móvil rechazada por una Mesa de trabajo. `mobile-workspace.js` contiene la adaptación estructural: agrupa las superficies, mueve los controles conservando sus manejadores y restaura sus posiciones al regresar al escritorio. `mobile.css` mantiene el alcance móvil. No se añadieron bibliotecas ni nuevas imágenes.

- Inicio: pendientes y registro antes del resumen mensual; barra inferior flotante y herramientas de cuenta.
- Inventario: cabecera compacta, catálogo visible, búsqueda, Todos/Stock bajo/Agotados, filtros y ordenación agrupados; detalle y edición conservados.
- Actividad: búsqueda contextual, Todo/Ventas/Compras/Por cobrar y registros compactos con detalle expandible completo.
- Análisis: ingreso y gráfico reunidos; importes completos accesibles al tocar barras sin colisión de etiquetas a 320px.
- Diagnóstico: bandeja continua con clasificación, acción Revisar producto conectada al inventario y acciones de cobro existentes.
- RED: directorio compacto, creación contextual, perfil y catálogo, eventos, exploración, guías y estilos para gestión de comunidades. Se mantiene el aviso de demostración en cuenta piloto.
- Acceso y formularios: jerarquía y controles táctiles, productos primero, diálogos de pantalla completa y protección de cambios existentes.

Comparación equivalente: `../mobile-radical-review/comparacion.html`, seis pares antes/después a 390×844, tema claro, misma cuenta piloto. Evidencia guardada fuera del repositorio para no incorporar capturas de datos de trabajo al código.

## Validación ejecutada

- 53/53 pruebas existentes pasan: inventario, movimientos, clientes, diagnóstico, autenticación, permisos de comunidad, contratos HTTP y tema. Las primeras siete pruebas HTTP fallaron por restricción local EACCES; la repetición autorizada con acceso a localhost pasó completa.
- 36 combinaciones de seis módulos con anchos 320, 360, 375, 390, 430 y 768px: sin desbordamiento horizontal de documento o contenido. Resultado en `../mobile-radical-review/matrix.json`.
- Seis módulos oscuros a390px; guía oscura adicional; horizontal844×390. Desktop1440px: navegación lateral, composición y posición de controles restauradas, componentes exclusivamente móviles ocultos.
- Recorridos reales: ingreso piloto, navegación, catálogo Agotados, categoría Aceites, actividad Por cobrar, expansión de movimiento, búsqueda sin resultados, apertura de venta y filtros, revisión de producto desde alerta, secciones RED y cambio de tema. No se registraron ventas ni se modificaron datos compartidos para probar.
- Sintaxis JavaScript comprobada y diferencias sin errores de espacios.

La revisión independiente Impeccable encontró seis asuntos materiales; se corrigieron estructura de RED/diagnóstico, guía legible, anotaciones de gráfico, aviso piloto, etiquetas redundantes y contraste oscuro. Veredicto final **ship**, limitado a los hallazgos puntuados. No equivale a una certificación de toda la plataforma.

## Límites de la evidencia

La cuenta piloto restringe escritura y administración de comunidades. No se comprobaron en vivo altas, bajas, asignación de administradores, cargas de archivos, exportaciones personales ni envío de operaciones financieras; las pruebas existentes cubren parte de esos contratos, no sustituyen esos recorridos. No hubo dispositivo físico, teclado virtual real, lector de pantalla ni OAuth externo de extremo a extremo. No se afirma cumplimiento integral WCAG ni equivalencia visual píxel a píxel del escritorio. Las frecuencias del inventario funcional son hipótesis de producto, no analítica observada.

Las instrucciones Impeccable y Taste se leyeron directamente. El lanzador Impeccable no estuvo disponible; no se atribuyen resultados a un detector, sorteo o compilación de esa herramienta. Taste se aplicó a composición y criterio visual, no a sus recetas ajenas a una aplicación operativa.
