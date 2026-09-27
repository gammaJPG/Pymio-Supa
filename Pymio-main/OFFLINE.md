# Uso móvil y sin conexión

Abre `piloto.html` desde un servidor web HTTPS (localhost sirve para desarrollo).
No funciona como PWA abriendo el archivo directamente ni desde HTTP de una IP de la red.
Espera el aviso «Aplicación disponible sin conexión» y entra al inventario y movimientos
con conexión al menos una vez. Instala desde el menú del navegador; en iPhone, Compartir >
Agregar a pantalla de inicio. Verifica la primera carga desde la aplicación instalada.

## Qué funciona sin internet

- Apertura de la aplicación y acceso piloto existente.
- Consulta y búsqueda del inventario descargado y listas de movimientos consultadas.
- Alta, modificación y eliminación de movimientos usando los productos y revisiones descargados.
- Cola IndexedDB persistente antes de cada envío; sobrevive a recargas y cierres.
- Panel de pendientes con datos de cada solicitud y motivo de rechazo.

El stock mostrado es la última lectura del servidor: no suma los pendientes. El stock final,
los precios y las reglas se validan al sincronizar. El servidor utiliza los precios vigentes
al recibir un alta. Un cambio de stock o de revisión puede rechazar una operación.
Los rechazos detienen la cola para conservar el orden. Copia los datos del panel, descarta
la solicitud rechazada y registra la corrección con datos actualizados. Nunca se descartan
automáticamente movimientos. Los reintentos mantienen el UUID original para que la API
no aplique dos veces una operación cuya respuesta se perdió.

La sincronización se intenta al entrar, recuperar conexión, volver a la app, cada 30 segundos
con la app abierta y al pulsar «Sincronizar ahora». Con la app cerrada no se garantiza ejecución:
se reanuda al abrirla. Las pestañas concurrentes pueden reenviar el mismo UUID; la API lo deduplica.

Los filtros de movimientos pueden usar la última lista general descargada (hasta 500 registros,
límite actual de la API). Los historiales por producto necesitan haberse consultado antes.
Crear/editar productos y categorías requiere conexión. Dashboard y diagnóstico conservan
los datos demostrativos existentes: no son cálculos sobre los pendientes.

No borres los datos del navegador ni desinstales con pendientes. El almacenamiento depende
del dispositivo; una navegación privada, borrado o falta de espacio puede impedir conservarlo.
Si falla una escritura, el formulario no confirma el guardado. El cierre de sesión conserva
pendientes y datos del piloto en el dispositivo.

## Conexión y publicación

En localhost se utiliza la API de desarrollo `http://127.0.0.1:3001`. En un dominio se usa
`/api` del mismo origen. Para otra ubicación añade antes del script en `piloto.html`:

```html
<meta name="swc-api" content="https://api.ejemplo.cl">
```

Configura HTTPS, el proxy `/api` y FRONTEND_ORIGINS según el despliegue. El servidor actual
sigue escuchando solamente en loopback y puede mantenerse detrás de un proxy.
Esta entrega no publica la plataforma ni convierte el acceso piloto en autenticación real.
Antes de usar empresas reales, implementar sesiones y autorización de empresa en el servidor,
y particionar/borrar la caché por usuario conforme a esa política de acceso.

Al actualizar archivos del shell, incrementa `CACHE` en `sw.js`. La nueva versión espera
al cierre de las pestañas anteriores y no elimina IndexedDB ni la cola.

## Verificación

`node servidor/offline.browser.cjs` usa Playwright/Chrome y una API de prueba aislada.
Verifica carga sin red, caché de inventario, persistencia tras recarga, respuesta perdida,
reintento con el mismo UUID, conflicto retenido y pantalla de 390 px.
La conexión se configura según SUPABASE.md. La regresión de base de datos está en supabase/regression.sql.

