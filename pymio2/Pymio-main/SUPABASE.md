# Configurar Pymio con Supabase

La aplicación usa la Data API HTTPS de Supabase. Se eliminó el cliente `pg` y la configuración PGHOST/PGUSER/PGPASSWORD. El navegador conserva la API local y la cola sin conexión; el servidor llama funciones RPC que guardan cada operación de stock en una sola transacción.

## 1. Crear e importar

1. Crea un proyecto en https://supabase.com/dashboard. Espera a que termine de provisionarse.
2. En el SQL Editor del proyecto nuevo y vacío, ejecuta estos archivos completos, una sola vez y en este orden:
   - `supabase/migrations/001_import.sql`
   - `supabase/migrations/002_operations.sql`
   - `supabase/migrations/003_list.sql`
   - `supabase/migrations/004_movements.sql`
   - `supabase/migrations/005_customers.sql`
   - `supabase/migrations/006_product_images.sql`
   - `supabase/migrations/007_accounts.sql`
   - `supabase/migrations/008_company_sku.sql`
   - `supabase/migrations/008_google_profile_setup.sql`
   - `supabase/migrations/009_red_pymio.sql`
   - `supabase/migrations/010_business_storefront.sql`
   - `supabase/migrations/011_business_profile_images.sql`
   - `supabase/migrations/012_remove_critical_stock.sql`
   - `supabase/migrations/013_product_status.sql`
   - `supabase/migrations/014_network_connections_and_private_communities.sql`
   - `supabase/migrations/015_network_post_editing.sql`
3. La primera migración importa el adjunto `inventario_app`: 4 empresas, 39 categorías, 82 productos, 5 movimientos y 7 líneas. Conserva IDs, secuencias, restricciones, índices y el disparador de actualización. No requiere cargar CSV ni ejecutar el dump original.

No ejecutes la importación sobre tablas existentes. Está preparada para un proyecto vacío y no elimina datos. El archivo contiene los datos del adjunto; consérvalo como respaldo privado.

Si ya ejecutaste las migraciones 001–004, aplica solamente `005_customers.sql`. Crea la tabla de clientes y permite asociarlos a las ventas sin borrar movimientos existentes.

La migración `006_product_images.sql` agrega la ruta de la foto a productos y crea el bucket público `product-images`. Si tu proyecto ya tiene las migraciones anteriores, ejecútala por separado después de `005_customers.sql`.

La migración `007_accounts.sql` vincula cada usuario de Supabase Auth con una empresa propia. Las cuentas nuevas reciben una empresa vacía; la cuenta piloto continúa usando la empresa 1.

La migración `008_company_sku.sql` permite repetir un SKU entre empresas distintas y mantiene su unicidad dentro de cada empresa. Es necesaria para que dos cuentas nuevas puedan usar la misma categoría y comenzar su numeración en `A001`.

La migración `009_red_pymio.sql` agrega los perfiles públicos de empresa, comunidades, membresías, eventos y beneficios. RED Pymio accede a estos datos únicamente a través del servidor y conserva las tablas cerradas para clientes directos.

La migración `010_business_storefront.sql` amplía esos perfiles con la vitrina Mi Pymio, color identificador, frase comercial y canales opcionales de sitio web, Instagram, YouTube, TikTok, Facebook, LinkedIn y correo electrónico.

La migración `011_business_profile_images.sql` agrega la foto de perfil y el banner de cada negocio, además del bucket público `profile-images`. Conserva el color del banner como alternativa cuando el usuario no usa una imagen.

La migración `012_remove_critical_stock.sql` simplifica los umbrales del inventario y conserva un único límite de stock bajo.

La migración `013_product_status.sql` separa el estado operativo del producto de su disponibilidad de stock y permite habilitarlo o inhabilitarlo.

La migración `014_network_connections_and_private_communities.sql` habilita conexiones entre perfiles y comunidades abiertas o con aprobación. También incorpora las solicitudes de ingreso y su gestión por la empresa creadora.

La migración `015_network_post_editing.sql` permite actualizar eventos y beneficios y refuerza en la base de datos que solo la empresa creadora pueda editarlos.

## 2. Configurar la conexión

Obtén la URL del proyecto y su clave **secret** (`sb_secret_...`) desde la configuración/API Keys de Supabase. También se admite la clave heredada **service_role**. La clave publishable/anon no tiene permisos para estas operaciones.

Completa `servidor/.env` (ya creado localmente, ignorado por Git):

```dotenv
SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_SECRET_KEY=TU_CLAVE_SECRETA
SESSION_SECRET=UNA_CADENA_ALEATORIA_LARGA
PILOT_PASSWORD=CONTRASENA_DE_LA_CUENTA_PILOTO
PORT=3001
WEB_PORT=5500
FRONTEND_ORIGINS=http://127.0.0.1:5500,http://localhost:5500
```

La clave se usa solamente en el servidor. No la pegues en HTML, JavaScript público ni en el chat. Para otra copia del proyecto, copia primero `servidor/.env.example` a `servidor/.env`.

## 3. Iniciar

Con Node.js 20.10 o posterior, desde la carpeta `Pymio-main`:

```powershell
npm start
```

Abre http://127.0.0.1:5500/piloto.html. El mismo comando inicia la interfaz en `WEB_PORT` y la API en `PORT`. No hay dependencias npm externas. Reinicia el proceso después de cambiar `.env`.

Sin configurar Supabase, la interfaz abre y la API devuelve un aviso de configuración pendiente (503). No se simulan productos ni se envían datos a una base local. El acceso piloto sigue usando la empresa 1 y las credenciales que ya tenía la aplicación.

Usa el servidor incluido: solo entrega archivos públicos y bloquea `.env`, código de servidor y migraciones. Las tablas tienen RLS y no conceden acceso a `anon`/`authenticated`; las funciones solo permiten `service_role`. Las sesiones se guardan en una cookie firmada y el servidor obtiene la empresa desde esa sesión, sin confiar en el identificador enviado por el navegador.

## Verificación

`npm test` ejecuta las pruebas de validación, formulario, transporte Supabase, rutas HTTP y entrega de archivos públicos.

`supabase/regression.sql` prueba las funciones de base de datos después de las migraciones: altas/cambios/bajas, separación por empresa, descuentos, historial, stock, reversión de fallos, revisiones y reintentos. Debe ejecutarse en una base aislada de prueba; termina con ROLLBACK (las secuencias pueden avanzar). Se verificó localmente sobre un motor PostgreSQL aislado; la conexión HTTPS al proyecto real requiere completar el paso 2.

Las antiguas pruebas dependientes de `pg` se sustituyeron por esta regresión SQL y las pruebas de la API Supabase. `scripts/convert_dump.py` permite regenerar `001_import.sql` a partir del adjunto original; Python se usa solo para esa conversión, no al ejecutar la plataforma.

Referencias: [funciones de base de datos](https://supabase.com/docs/guides/database/functions), [claves API](https://supabase.com/docs/guides/api/api-keys).
