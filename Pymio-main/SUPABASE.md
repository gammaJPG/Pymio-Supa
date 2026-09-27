# Configurar Pymio con Supabase

La aplicación usa la Data API HTTPS de Supabase. Se eliminó el cliente `pg` y la configuración PGHOST/PGUSER/PGPASSWORD. El navegador conserva la API local y la cola sin conexión; el servidor llama funciones RPC que guardan cada operación de stock en una sola transacción.

## 1. Crear e importar

1. Crea un proyecto en https://supabase.com/dashboard. Espera a que termine de provisionarse.
2. En el SQL Editor del proyecto nuevo y vacío, ejecuta estos archivos completos, una sola vez y en este orden:
   - `supabase/migrations/001_import.sql`
   - `supabase/migrations/002_operations.sql`
   - `supabase/migrations/003_list.sql`
   - `supabase/migrations/004_movements.sql`
3. La primera migración importa el adjunto `inventario_app`: 4 empresas, 39 categorías, 82 productos, 5 movimientos y 7 líneas. Conserva IDs, secuencias, restricciones, índices y el disparador de actualización. No requiere cargar CSV ni ejecutar el dump original.

No ejecutes la importación sobre tablas existentes. Está preparada para un proyecto vacío y no elimina datos. El archivo contiene los datos del adjunto; consérvalo como respaldo privado.

## 2. Configurar la conexión

Obtén la URL del proyecto y su clave **secret** (`sb_secret_...`) desde la configuración/API Keys de Supabase. También se admite la clave heredada **service_role**. La clave publishable/anon no tiene permisos para estas operaciones.

Completa `servidor/.env` (ya creado localmente, ignorado por Git):

```dotenv
SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_SECRET_KEY=TU_CLAVE_SECRETA
PORT=3001
FRONTEND_ORIGINS=http://127.0.0.1:5500,http://localhost:5500
```

La clave se usa solamente en el servidor. No la pegues en HTML, JavaScript público ni en el chat. Para otra copia del proyecto, copia primero `servidor/.env.example` a `servidor/.env`.

## 3. Iniciar

Con Node.js 20.10 o posterior, desde la carpeta `Pymio-main`:

```powershell
npm start
```

Abre http://127.0.0.1:5500/piloto.html. El mismo comando inicia la interfaz en 5500 y la API en 3001. No hay dependencias npm externas. Reinicia el proceso después de cambiar `.env`.

Sin configurar Supabase, la interfaz abre y la API devuelve un aviso de configuración pendiente (503). No se simulan productos ni se envían datos a una base local. El acceso piloto sigue usando la empresa 1 y las credenciales que ya tenía la aplicación.

Usa el servidor incluido: solo entrega archivos públicos y bloquea `.env`, código de servidor y migraciones. Las tablas tienen RLS y no conceden acceso a `anon`/`authenticated`; las funciones solo permiten `service_role`. El acceso piloto existente no es Supabase Auth ni autorización de usuarios para un despliegue público; esta integración mantiene su alcance local.

## Verificación

`npm test` ejecuta las pruebas de validación, formulario, transporte Supabase, rutas HTTP y entrega de archivos públicos.

`supabase/regression.sql` prueba las funciones de base de datos después de las migraciones: altas/cambios/bajas, separación por empresa, descuentos, historial, stock, reversión de fallos, revisiones y reintentos. Debe ejecutarse en una base aislada de prueba; termina con ROLLBACK (las secuencias pueden avanzar). Se verificó localmente sobre un motor PostgreSQL aislado; la conexión HTTPS al proyecto real requiere completar el paso 2.

Las antiguas pruebas dependientes de `pg` se sustituyeron por esta regresión SQL y las pruebas de la API Supabase. `scripts/convert_dump.py` permite regenerar `001_import.sql` a partir del adjunto original; Python se usa solo para esa conversión, no al ejecutar la plataforma.

Referencias: [funciones de base de datos](https://supabase.com/docs/guides/database/functions), [claves API](https://supabase.com/docs/guides/api/api-keys).
