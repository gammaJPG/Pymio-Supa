# Pymio

Plataforma piloto de gestión para pymes con inventario, movimientos, clientes, autenticación y persistencia en Supabase.

## Estado actual de `main`

La rama `main` contiene la evolución operativa de Inventario y Movimientos hasta el commit previo `1449ebf`. Incluye sesiones aisladas por empresa, acceso piloto y personal, preparación para Google Auth, manejo de imágenes, operación sin conexión y controles de stock.

El Dashboard conectado a datos reales, sus filtros históricos y sus gráficos dinámicos están desarrollados en `Tinoski-branch`, pero todavía no forman parte del código de `main`. Esta distinción evita documentar como disponible una funcionalidad que aún no ha sido integrada en esta rama.

## Ejecución local

Requiere Node.js 20.10 o posterior y un archivo privado `servidor/.env` con la configuración descrita en `SUPABASE.md`.

```powershell
npm start
```

La interfaz queda disponible en `http://127.0.0.1:5500/piloto.html` y la API local en `http://127.0.0.1:3001`.

```powershell
npm test
```

## Evolución desde la versión original

### Base inicial

La primera versión reunía las pantallas de Inicio, Dashboard, Movimientos, Inventario, Diagnóstico y RED Pymio. Inventario y Movimientos comenzaron como una interfaz piloto con datos y reglas todavía acoplados al navegador.

### Persistencia y Supabase

- Se reemplazó la conexión directa a PostgreSQL por la Data API HTTPS de Supabase.
- Las credenciales secretas permanecen exclusivamente en el servidor.
- Las operaciones de stock se ejecutan mediante funciones RPC transaccionales.
- Se incorporaron migraciones para productos, categorías, movimientos, clientes, imágenes, cuentas y SKU por empresa.
- Las solicitudes de movimientos usan UUID para impedir duplicados durante reintentos.

### Cuentas y aislamiento empresarial

- Cada sesión identifica la empresa activa y el servidor resuelve su alcance sin confiar en identificadores enviados por el navegador.
- Las cuentas personales reciben un espacio empresarial independiente.
- La cuenta piloto conserva compatibilidad con la empresa inicial.
- Se preparó el alta mediante Google Auth y el flujo de configuración de perfil.
- Los SKU pueden repetirse entre empresas, pero permanecen únicos dentro de cada empresa.

### Inventario

- Se añadieron vistas simple y detallada, búsqueda, categorías e historial por producto.
- Los formularios permiten crear y editar productos con validaciones adaptables.
- Las imágenes se guardan en el bucket público `product-images` de Supabase Storage.
- La interfaz mantiene alertas de stock y actualiza los datos tras cada operación confirmada.
- Crear o editar productos y categorías requiere conexión.

### Movimientos

- Se incorporaron ventas, compras y otros movimientos con productos, unidades, descuentos y fecha opcional.
- Las ventas admiten cliente opcional, canal, medio de pago y estado pendiente o pagado.
- Los movimientos pendientes pueden marcarse como pagados preservando sus datos asociados.
- Al editar una venta se restauran temporalmente sus unidades originales para validar el stock correcto.
- El stock disponible descuenta también las ventas locales que siguen pendientes de sincronización.
- Corregir una cantidad superior al stock elimina el error anterior y permite volver a validar el formulario.
- El detalle expandido presenta productos, descuento total, estado, medio de pago, tipo, código y cliente.

### Experiencia sin conexión

- El service worker conserva el shell de la aplicación y los últimos datos consultados.
- IndexedDB mantiene una cola persistente antes de enviar cada movimiento.
- Los reintentos conservan el UUID original y los rechazos detienen la cola para mantener el orden.
- La sincronización se intenta al recuperar conexión, volver a la aplicación, abrirla y usar la acción manual.
- Los datos pendientes no se eliminan automáticamente.

Consulta `OFFLINE.md` para conocer el comportamiento, los límites y las recomendaciones de uso móvil.

## Arquitectura actual

- `piloto.html` aloja la navegación principal de la plataforma.
- `app.js` gestiona sesión, navegación y coordinación general.
- `inventario.js`, `inventario-detalle.js`, `categorias.js` y `producto-form.js` implementan el flujo de inventario.
- `movimientos.js`, `movimientos-vista.js` y `movimientos-stock.js` implementan el flujo de movimientos y sus controles de stock.
- `offline.js` administra caché local y sincronización pendiente.
- `servidor/server.mjs` expone la API local y protege archivos privados.
- `servidor/supabase.mjs` concentra el transporte hacia Supabase.
- `supabase/migrations/` contiene la evolución reproducible del esquema.

## Configuración y seguridad

El archivo `servidor/.env` debe incluir como mínimo:

```dotenv
SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_SECRET_KEY=TU_CLAVE_SECRETA
SESSION_SECRET=UNA_CADENA_ALEATORIA_LARGA
PILOT_PASSWORD=CONTRASENA_DE_LA_CUENTA_PILOTO
PORT=3001
WEB_PORT=5500
FRONTEND_ORIGINS=http://127.0.0.1:5500,http://localhost:5500
```

No se deben versionar `servidor/.env`, claves secretas ni credenciales. El servidor bloquea la publicación de código interno, migraciones y archivos de entorno.

## Cambios más recientes en `main`

La última integración de Inventario y Movimientos:

- consolidó las mejoras visuales de formularios y tablas;
- corrigió validaciones de cantidad y disponibilidad;
- preservó información completa al actualizar el estado de pago;
- mejoró el detalle desplegable de los movimientos;
- mantuvo canal, medio de pago, cliente, descuentos y productos durante las actualizaciones;
- actualizó el service worker para entregar los módulos vigentes;
- amplió las pruebas de movimientos y formularios.

## Verificación

`npm test` ejecuta las pruebas de clientes, productos, movimientos, validaciones, transporte Supabase, sesiones, seguridad HTTP y entrega de archivos públicos.

`supabase/regression.sql` valida altas, cambios, bajas, separación empresarial, descuentos, stock, reversión de fallos y reintentos. Debe ejecutarse en una base aislada; finaliza con `ROLLBACK`.

Antes de publicar una actualización también se debe comprobar que:

- no existan marcadores de conflicto;
- los archivos JavaScript superen `node --check`;
- la versión de caché de `sw.js` corresponda a los recursos actuales;
- las credenciales sigan fuera del repositorio.

## Documentación relacionada

- `SUPABASE.md`: creación del proyecto, migraciones, variables y conexión.
- `OFFLINE.md`: instalación, caché, cola local y recuperación ante errores.
- `servidor/MOVIMIENTOS.md`: reglas y contrato de movimientos.
- `servidor/CATEGORIAS.md`: reglas y contrato de categorías.
