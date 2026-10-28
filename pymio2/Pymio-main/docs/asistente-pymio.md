# Asistente de Pymio

El asistente integrado se llama **PymBot** y utiliza Cloudflare Workers AI con el modelo `@cf/google/gemma-4-26b-a4b-it`.

## Alcance

- Responde preguntas sobre el uso de Pymio.
- Utiliza la base documental ubicada en `cloudflare/pymio-knowledge.mjs`.
- Rechaza preguntas ajenas a Pymio.
- No solicita contraseñas, tokens, códigos ni información bancaria.
- No ejecuta acciones dentro de la cuenta ni reemplaza asesoría profesional.

## Arquitectura

1. La interfaz envía la pregunta y un historial breve a `POST /api/assistant/chat`.
2. El Worker valida que exista una sesión activa mediante el sistema de autenticación de Pymio.
3. El Worker limita y limpia el historial recibido.
4. Workers AI recibe las reglas, la documentación y los últimos mensajes.
5. La respuesta vuelve a la interfaz. El navegador conserva localmente el historial de esa empresa.

La clave o credencial del proveedor no se expone en el navegador. Workers AI se conecta mediante el binding `AI` declarado en `wrangler.jsonc`.

## Límites y consumo

- Cada respuesta se limita a 500 tokens y el historial enviado se limita a los últimos ocho mensajes.
- La interfaz conserva un máximo de 40 mensajes por empresa.
- Cuando Workers AI no está disponible o se agota el cupo diario, se muestra un mensaje claro y la operación puede reintentarse más tarde.
- El nivel gratuito de Cloudflare se comparte entre todas las funciones de Workers AI de la cuenta.

## Actualizar el conocimiento

Para cambiar lo que PymBot sabe, edita `cloudflare/pymio-knowledge.mjs`. Cada afirmación debe corresponder a una función vigente de Pymio. Después, ejecuta las pruebas y vuelve a desplegar el Worker.

Si la documentación crece hasta superar un manual compacto, se recomienda migrar la recuperación documental a Cloudflare Vectorize y conservar estas reglas como instrucciones del sistema.

## Verificación

Prueba al menos estos casos después de cada cambio:

1. Pregunta documentada: “¿Cómo registro una venta?”.
2. Pregunta desconocida de Pymio: debe derivar al Centro de ayuda sin inventar.
3. Pregunta ajena: debe indicar que solo responde sobre Pymio.
4. Sesión vencida: la API debe responder `401`.
5. Cuota agotada o binding ausente: debe aparecer un error recuperable.
6. Navegación por teclado, cierre con Escape y funcionamiento móvil sobre la barra inferior.
