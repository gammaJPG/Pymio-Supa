---
name: Pymio
description: Gestión clara, cálida y táctil para pequeñas empresas.
colors:
  honey: "#f1cf54"
  honey-soft: "#f9f1d4"
  forest-ink: "#20251c"
  warm-canvas: "#f7f6ef"
  surface: "#ffffff"
  muted-olive: "#676c5d"
  divider: "#dedfd4"
  success: "#3d9661"
  critical: "#a23b34"
typography:
  display:
    fontFamily: "Space Grotesk, sans-serif"
    fontSize: "clamp(2.125rem, 10vw, 2.75rem)"
    fontWeight: 650
    lineHeight: 1.02
    letterSpacing: "-0.04em"
  title:
    fontFamily: "Space Grotesk, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 650
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  body:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 650
    lineHeight: 1.3
rounded:
  control: "12px"
  surface: "15px"
  sheet: "22px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "18px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.honey}"
    textColor: "{colors.forest-ink}"
    rounded: "{rounded.control}"
    height: "46px"
    padding: "0 16px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.forest-ink}"
    rounded: "{rounded.surface}"
    padding: "18px"
---

# Design System: Pymio

## Overview

**Creative North Star: "La libreta inteligente de una pyme"**

Pymio combina la confianza de una herramienta de trabajo con la calidez de un negocio atendido por personas. La información aparece primero, en superficies claras y con el amarillo miel reservado para acciones y estados relevantes. En móvil, la experiencia se comporta como una aplicación: navegación al alcance del pulgar, acciones progresivas y tareas largas a pantalla completa.

**Key Characteristics:**
- Jerarquía inmediata y lenguaje directo.
- Superficies cálidas, blancas y verde tinta.
- Controles táctiles amplios con iconografía lineal consistente.
- Datos densos convertidos en recorridos verticales legibles.

## Colors

La paleta parte de miel, papel cálido y verde tinta; los estados semánticos conservan suficiente contraste.

**The Honey Action Rule.** El amarillo identifica acciones principales, selección y momentos de marca; no cubre grandes áreas informativas.

## Typography

**Display Font:** Space Grotesk (sans-serif)
**Body Font:** IBM Plex Sans (sans-serif)

**Character:** Los títulos son compactos y seguros; el cuerpo es sobrio, abierto y fácil de leer. Los números usan cifras tabulares cuando cambian dinámicamente.

### Hierarchy
- **Display:** encabezados de vista, máximo 12 caracteres por línea en móvil.
- **Title:** barras de aplicación, tarjetas y paneles.
- **Body:** explicaciones, estados y formularios, con líneas cortas en teléfono.
- **Label:** navegación, metadatos y ayudas breves.

**The Immediate Meaning Rule.** Un título debe explicar la tarea o el dato sin depender de una etiqueta decorativa anterior.

## Layout

Escritorio usa barra lateral y paneles amplios. Móvil se organiza como producto operativo independiente: barra superior compacta, navegación inferior para Hoy, Actividad, Registrar, Inventario y RED, y un centro secundario para análisis, diagnóstico, Pymium y cuenta. Hoy muestra estado, acciones y prioridades; evita copy promocional y paneles de escritorio. Los contenidos densos usan listas de trabajo, resúmenes con detalle progresivo y flujos a pantalla completa. Bajo 768px, y en teléfonos apaisados de hasta 950px por 500px, se activa la composición móvil completa.

## Elevation & Depth

La profundidad es ambiental y escasa. Las tarjetas móviles usan sombras suaves con desplazamiento vertical; paneles y hojas elevadas reciben sombras más amplias. Los bordes separan controles, no duplican la elevación de una tarjeta.

**The Quiet Surface Rule.** Una superficie elige borde o sombra según su función; evita acumular ambos.

## Shapes

Los controles usan esquinas de 12px, las superficies 15px y las hojas inferiores 22px en sus bordes superiores. Los avatares y accesos rápidos usan rectángulos redondeados en lugar de círculos genéricos.

## Components

### Buttons
- **Shape:** control táctil de al menos 44px, normalmente 46–48px.
- **Primary:** fondo miel, texto verde tinta y radio de 12px.
- **Focus:** contorno dorado de 3px con separación visible.
- **Secondary:** superficie blanca con divisor oliva claro.

### Cards / Containers
- **Corner Style:** radio de 15px.
- **Background:** blanco sobre lienzo cálido.
- **Shadow Strategy:** elevación ambiental baja.
- **Internal Padding:** 18px; 14px en tarjetas compactas.

### Inputs / Fields
- **Style:** fondo blanco, borde oliva claro, radio de 12–13px y altura mínima de 48px.
- **Focus:** contorno dorado visible; texto de 16px en dispositivos táctiles para evitar zoom automático.
- **Error / Disabled:** mensaje en lenguaje común y estado deshabilitado claramente atenuado.

### Navigation
- Escritorio conserva la barra lateral.
- Móvil usa Hoy, Actividad, Registrar, Inventario y RED; Registrar abre una hoja de acciones rápidas y la cuenta abre el centro de herramientas.
- RED Pymio usa pestañas horizontales desplazables y mantiene el destino activo visible.

### Task sheets
- Acciones breves y filtros aparecen desde el borde inferior.
- Formularios largos ocupan toda la pantalla y mantienen sus acciones al alcance del pulgar.

## Do's and Don'ts

### Do:
- **Do** priorizar la acción o señal más útil en el primer viewport.
- **Do** convertir tablas móviles en listas estructuradas y expandibles.
- **Do** mantener targets táctiles de al menos 44px y respetar safe areas.
- **Do** conservar la arquitectura de escritorio fuera de los breakpoints móviles.

### Don't:
- **Don't** encoger tablas, barras laterales o modales de escritorio para hacerlos caber.
- **Don't** ocultar capacidades críticas para simplificar una pantalla.
- **Don't** usar amarillo simultáneamente en todas las superficies.
- **Don't** introducir iconos de texto o emoji; usa SVG del mismo peso visual.
