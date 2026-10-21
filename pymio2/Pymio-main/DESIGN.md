---
name: Pymio
description: Gestión clara, cálida y táctil para pequeñas empresas.
colors:
  honey: "#f1cf54"
  honey-soft: "#f9efc4"
  forest-ink: "#20251c"
  warm-canvas: "#f3f4ee"
  surface: "#ffffff"
  soft-surface: "#eeefe6"
  muted-olive: "#60685b"
  divider: "#dcded3"
  critical: "#a23b34"
  focus: "#a27b00"
  success: "#32704d"
  dark-ink: "#f1f3e9"
  dark-muted: "#b2baaa"
  dark-canvas: "#141812"
  dark-surface: "#1d221a"
  dark-soft: "#272e22"
  dark-divider: "#3b4434"
  dark-honey-soft: "#383220"
  dark-critical: "#ffaba0"
  dark-success: "#9dd9ae"
  navigation-ink: "#20271e"
  navigation-muted: "#c4cdbb"
  navigation-active: "#394331"
  navigation-text: "#f6f8ef"
  desktop-ink: "#20221d"
  desktop-canvas: "#f5f5ef"
  desktop-muted: "#707263"
  desktop-divider: "#e5e6dc"
  desktop-honey-soft: "#f9f1d4"
typography:
  display:
    fontFamily: "IBM Plex Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Space Grotesk, IBM Plex Sans, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  body:
    fontFamily: "IBM Plex Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  field:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  nav:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.2
rounded:
  control: "10px"
  icon: "12px"
  surface: "14px"
  sheet: "24px"
  navigation: "16px"
  navigation-item: "11px"
  desktop-sm: "6px"
  desktop-md: "10px"
  desktop-lg: "16px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  card: "18px"
  gutter: "20px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.honey}"
    textColor: "{colors.forest-ink}"
    rounded: "{rounded.control}"
    height: "46px"
    padding: "11px 14px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.forest-ink}"
    rounded: "{rounded.control}"
    height: "46px"
    padding: "11px 14px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.forest-ink}"
    rounded: "{rounded.surface}"
    padding: "18px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.forest-ink}"
    typography: "{typography.field}"
    rounded: "{rounded.control}"
    height: "48px"
    padding: "11px 12px"
  mobile-navigation:
    backgroundColor: "{colors.navigation-ink}"
    textColor: "{colors.navigation-muted}"
    typography: "{typography.nav}"
    rounded: "{rounded.navigation}"
    height: "66px"
    padding: "6px"
  scope-selected:
    backgroundColor: "{colors.forest-ink}"
    textColor: "{colors.warm-canvas}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "10px 13px"
  mobile-sheet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.forest-ink}"
    padding: "8px 20px 24px"
---

# Design System: Pymio

## Overview

**Creative North Star: "Mesa de trabajo"**

Pymio combina la confianza de una herramienta de trabajo con la calidez de un negocio atendido por personas. Papel claro, tinta verde y miel organizan tareas, registros y resultados. La densidad es práctica: cada grupo reúne información relacionada y mantiene su acción a mano.

La composición móvil tiene navegación propia, listas legibles y detalle progresivo. Este documento registra lo implementado en mobile.css, mobile.js y mobile-workspace.js; no sustituye la composición de escritorio. Los tokens sin prefijo desktop describen el sistema móvil; dark recoge sus sustituciones oscuras. Los valores desktop conservan el vocabulario de pymio.css y style.css, con las sustituciones oscuras de theme.css. La abeja y los recursos existentes siguen siendo la identidad; este cambio no añade ilustraciones generadas.

**Key Characteristics:**
- Jerarquía inmediata y lenguaje directo.
- Papel claro, superficies agrupadas y amarillo miel contenido.
- Navegación flotante de tinta con destinos etiquetados.
- Controles táctiles amplios, SVG lineal y cifras tabulares.
- Composición de escritorio conservada fuera del ámbito móvil.

## Colors

La paleta móvil reúne miel, papel y verde tinta; el tema oscuro cambia superficies y texto manteniendo el amarillo de acción.

### Primary
- **Miel Pymio:** acciones principales, Registrar, venta rápida y selección de RED; conserva texto tinta incluso en oscuro.
- **Miel suave:** prioridades pendientes y contexto destacado.

### Neutral
- **Verde tinta:** títulos, importes, texto operativo y filtros seleccionados.
- **Papel claro:** fondo de la aplicación y formularios largos.
- **Superficie:** grupos de trabajo, cabecera y hojas; **superficie suave** para agrupación secundaria.
- **Oliva secundario:** metadatos y ayudas; **divisor** para listas, controles y separación estructural.
- **Tinta de navegación:** barra inferior flotante en ambos temas; navigation-active distingue el destino actual, navigation-text su texto y navigation-muted los destinos inactivos.
- Los tokens dark reemplazan los roles móviles correspondientes. Los tokens desktop registran la paleta incumbente; no se aplican automáticamente a móvil.

Los estados críticos usan critical/dark-critical. Las variaciones positivas del dashboard usan success/dark-success. El foco usa focus en claro y honey en oscuro.

**The Honey Action Rule.** El amarillo identifica acciones principales, selección y prioridades; su uso conserva la jerarquía entre grupos.

## Typography

**Display Font:** IBM Plex Sans en importes y títulos operativos móviles; Space Grotesk se conserva en secciones, tarjetas, acceso y escritorio.
**Body Font:** IBM Plex Sans con respaldos del sistema.
**Label/Mono Font:** IBM Plex Mono permanece en cifras de escritorio que ya usan ese tratamiento.

**Character:** Títulos compactos, cuerpo abierto y cifras operativas fáciles de comparar. Los valores dinámicos relevantes usan cifras tabulares. No se fuerza una sola familia sobre los componentes incumbentes.

### Hierarchy
- **Display:** resumen financiero de Hoy; Análisis usa 34px y línea 1.2 en su importe principal, con cifras secundarias de 25px. El acceso conserva su título de 34px en Space Grotesk.
- **Headline:** títulos de las vistas operativas; Hoy usa 24px con línea 1.2 y RED 27px con línea 1.2.
- **Title:** tarjetas y secciones; las hojas usan 24px. Filas de producto usan 15px y comunidades 17px en IBM Plex Sans.
- **Body:** explicaciones de 14px, con interlineado de 1.5–1.6 según contexto.
- **Field:** entradas de 16px para mantener lectura y evitar zoom de edición.
- **Label:** metadatos de 12–13px; navegación de 11px, reducida a 10px bajo 360px.

**The Immediate Meaning Rule.** Un título debe explicar la tarea o el dato sin depender de una etiqueta decorativa anterior.

## Layout

El sistema móvil se activa hasta 767px de ancho, o hasta 950px de ancho cuando la altura no supera 500px. La cabecera fija mide 60px más safe area superior. El contenido tiene desplazamiento vertical propio, margen lateral de 20px y reserva inferior de 70px más safe area y 28px. Bajo 360px el margen lateral baja a 16px. La navegación flota a 12px de los laterales y a 10px más safe area del borde inferior; su altura mínima es 66px. En apaisado de poca altura la cabecera baja a 52px, la reserva nominal de navegación a 54px y las etiquetas se colocan junto a los iconos; las hojas dejan márgenes laterales del 15%.

La barra inferior contiene Hoy, Actividad, Registrar, Inventario y RED. El control de cuenta abre herramientas secundarias. En la composición actual, Hoy ordena pendientes, venta/compra y resumen del mes; Inventario presenta búsqueda, filtros de estado y catálogo; Actividad agrupa búsqueda, filtros y registros expandibles. Análisis reúne el importe principal y su gráfico en una superficie, seguido por indicadores comparables. Diagnóstico es una cola continua con filtro por tipo y acciones. RED usa navegación local y directorio compacto; perfil y comunidad conservan su propio contexto. Estas composiciones son aplicaciones del sistema, no plantillas obligatorias para cualquier nueva vista.

Los grupos usan 18px interiores; secciones separadas recurren a 16px, 24px y 32px. Catálogo, cola de alertas y directorio comparten superficies con filas divididas. Actividad usa registros separados por 8px. Los formularios agrupan campos en vertical; las líneas de movimiento mantienen producto y cantidad en dos columnas. Solo el histórico de inventario conserva desplazamiento horizontal local cuando lo requiere su tabla.

Escritorio conserva barra lateral, paneles, tablas y valores incumbentes. Los controles y el gráfico recolocados en móvil regresan a sus posiciones originales al salir del breakpoint. Hay reparaciones de transición acotadas a 768–900px para diagnóstico/inventario y hasta 960px para el menú lateral de RED; no extienden la composición móvil completa.

## Elevation & Depth

Las superficies de trabajo son planas: agrupación, divisores y tono establecen la jerarquía. La navegación flotante tiene una sombra suave que la separa del contenido. Hojas, filtros, menús y notificaciones usan elevación temporal. Las hojas entran con desplazamiento de 32px y fundido durante 200ms; prefers-reduced-motion elimina esta animación. Los paneles de vista no reciben animación móvil. Los valores completos de sombras, movimiento y breakpoints están en el sidecar.

**The Quiet Surface Rule.** Las superficies de trabajo permanecen planas; la elevación distingue la navegación flotante y las capas temporales.

## Shapes

Los controles usan control; iconos y accesos rápidos usan icon; grupos de trabajo usan surface. Las filas dentro de un grupo son rectas y se separan por divisores. La navegación usa navigation y sus destinos navigation-item. Las hojas tienen esquinas superiores sheet y borde inferior recto. Los formularios largos son rectangulares y ocupan la pantalla completa. Avatares y miniaturas suelen ser rectángulos redondeados; el acceso a cuenta es circular. Los radios desktop-sm, desktop-md y desktop-lg pertenecen al sistema de escritorio y siguen disponibles.

## Components

### Buttons
- **Primary:** miel con texto tinta, altura mínima de 46px y padding del token; venta rápida mide al menos 54px y las acciones de formulario/acceso 48–50px.
- **Secondary:** superficie con borde divisor; acciones de texto con área táctil mínima de 44px.
- **States:** brillo reducido al pulsar, opacidad .48 al deshabilitar; foco de 3px separado 3px, miel en oscuro.

### Cards / Containers
- **Style:** superficie plana, radio surface y padding card. Los grupos de filas comparten fondo; la fila no lleva sombra propia.
- **Lists:** catálogo con imagen, nombre, stock, precio y detalle; Actividad con nombre, importe y fecha, seguido de detalle expandible.
- **Queue / Directory:** Diagnóstico y comunidades usan filas continuas, divisores y acciones contextuales. Las iniciales de comunidad identifican la entidad; no son iconos de acción.
- **Analysis:** el importe y el gráfico comparten superficie; las barras se pueden activar para consultar importe y unidades. Ayuda y detalle conservan contraste de metadatos.

### Inputs / Fields
- **Style:** superficie, borde divisor de 1px y radio control; altura mínima de 48px y texto field. Las búsquedas principales omiten el borde sobre papel. Textarea empieza en 112px.
- **Focus:** contorno visible; formularios y campos respetan safe areas y desplazamiento de edición.
- **States:** errores críticos junto al formulario; campos deshabilitados en diálogos con opacidad .65. Checkbox y radio de 22px, conservando su control nativo.

### Chips / Tags
- Los filtros de Inventario, Actividad y Diagnóstico usan botones de al menos 44px, selección tinta/papel y aria-pressed. Cambian resultados reales del módulo.
- Etiquetas de estado y rol conservan su significado. Los KPI de inventario son resúmenes planos, no botones de filtro.
- La selección local de RED usa relleno miel con texto tinta y aria-current.

### Navigation
- Cinco destinos con SVG lineal de 22px y trazo 1.7; etiquetas visibles. El destino actual usa una superficie verde más clara y su icono miel. Registrar conserva fondo miel en el icono.
- RED muestra Mi RED, Explorar, Eventos, Mi Pymio y Guías en una fila desplazable con destinos de al menos 44px.
- Cabecera blanca o su superficie oscura equivalente, marca existente, conexión, notificaciones y cuenta. El estado piloto permanece visible en la cabecera y se refuerza dentro de RED cuando corresponde.
- Herramientas conserva acceso a Análisis, Por resolver, Pymium, actualización, apariencia, contraseña cuando corresponde y cierre de sesión.

### Task sheets
- Registrar y herramientas usan hojas con fondo atenuado, cierre, gestión de foco y retorno al disparador. Acciones y filtros reutilizan manejadores existentes.
- Formularios largos usan dialog nativo a pantalla completa y acciones inferiores sticky; confirmaciones breves permanecen en hoja. Los cambios sin guardar activan confirmación antes del cierre voluntario.
- El teclado visible oculta la navegación inferior cuando compite con la edición. La estructura del formulario mantiene campos y permisos existentes.

## Do's and Don'ts

### Do:
- **Do** priorizar la acción o señal más útil en el primer viewport.
- **Do** agrupar información relacionada y convertir tablas móviles en listas estructuradas y expandibles.
- **Do** mantener áreas táctiles de al menos 44px y respetar safe areas.
- **Do** conservar la arquitectura y los tokens de escritorio fuera de los breakpoints móviles.
- **Do** usar las sustituciones oscuras del mismo rol y mantener legibles metadatos y errores.

### Don't:
- **Don't** encoger tablas, barras laterales o modales de escritorio para hacerlos caber.
- **Don't** ocultar capacidades críticas ni duplicar autorización o lógica de negocio en la capa móvil.
- **Don't** usar amarillo simultáneamente en todas las superficies.
- **Don't** introducir iconos de texto o emoji; usa SVG del mismo peso visual.
- **Don't** añadir sombras a cada fila, tarjeta o KPI móvil.
