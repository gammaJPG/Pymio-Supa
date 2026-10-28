import { handleAsNodeRequest } from 'cloudflare:node';
import { createInventoryServer } from '../servidor/server.mjs';
import { createSupabase } from '../servidor/supabase.mjs';
import { PYMIO_ASSISTANT_INSTRUCTIONS, PYMIO_ASSISTANT_MODEL } from './pymio-knowledge.mjs';

const apiPort = 3001;
const origins = (process.env.FRONTEND_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
const api = createInventoryServer(createSupabase(), origins, {
  sessionSecret: process.env.SESSION_SECRET,
  pilotPassword: process.env.PILOT_PASSWORD,
  secureCookie: true
});
api.listen(apiPort);

const jsonResponse = (body, status = 200) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store' }
});

const authenticateAssistantRequest = async request => {
  const sessionUrl = new URL('/api/auth/session', request.url);
  const headers = new Headers();
  for (const name of ['cookie', 'origin', 'user-agent']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const sessionRequest = new Request(sessionUrl, {
    method: 'GET',
    headers
  });
  const response = await handleAsNodeRequest(apiPort, sessionRequest);
  if (!response.ok) return { response };
  const payload = await response.json();
  return { session: payload.session };
};

const assistantContent = result => {
  if (typeof result?.response === 'string') return result.response;
  const content = result?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(item => item?.text || '').join('');
  return '';
};

async function handleAssistant(request, env) {
  if (request.method !== 'POST') return jsonResponse({ error: 'Método no permitido.' }, 405);
  const auth = await authenticateAssistantRequest(request);
  if (auth.response) return jsonResponse({ error: 'Tu sesión venció. Vuelve a ingresar.' }, 401);
  if (!env.AI) return jsonResponse({
    error: 'El asistente aún no está habilitado en este entorno.',
    supportRecommended: true
  }, 503);

  let payload;
  try {
    if (Number(request.headers.get('content-length') || 0) > 24_000) throw new Error('La conversación es demasiado extensa.');
    payload = await request.json();
  } catch (error) {
    return jsonResponse({ error: error.message || 'La solicitud no es válida.' }, 400);
  }

  const sourceMessages = Array.isArray(payload?.messages) ? payload.messages : [];
  const messages = sourceMessages
    .filter(item => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string')
    .slice(-8)
    .map(item => ({ role: item.role, content: item.content.trim().slice(0, 1_200) }))
    .filter(item => item.content);
  if (!messages.length || messages.at(-1).role !== 'user') {
    return jsonResponse({ error: 'Escribe una pregunta sobre Pymio.' }, 400);
  }

  try {
    const result = await env.AI.run(PYMIO_ASSISTANT_MODEL, {
      messages: [
        { role: 'system', content: PYMIO_ASSISTANT_INSTRUCTIONS },
        ...messages
      ],
      max_tokens: 500,
      temperature: 0.2,
      chat_template_kwargs: { enable_thinking: false }
    });
    let answer = assistantContent(result).trim();
    if (!answer) throw new Error('El modelo no entregó una respuesta.');
    const supportRecommended = answer.includes('[[CENTRO_AYUDA]]') || /centro de ayuda/i.test(answer);
    answer = answer.replaceAll('[[CENTRO_AYUDA]]', '').trim();
    return jsonResponse({ answer, supportRecommended, model: PYMIO_ASSISTANT_MODEL });
  } catch (error) {
    const detail = String(error?.message || error || '');
    const quotaReached = error?.status === 429 || /quota|neuron|limit|capacity|3040|rate/i.test(detail);
    return jsonResponse({
      error: quotaReached
        ? 'Miel alcanzó por hoy el límite gratuito de consultas. Puedes continuar desde el Centro de ayuda.'
        : 'Miel no está disponible en este momento. Puedes continuar desde el Centro de ayuda.',
      supportRecommended: true,
      quotaReached
    }, quotaReached ? 429 : 503);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/assistant/chat') return handleAssistant(request, env);
    if (url.pathname.startsWith('/api/')) return handleAsNodeRequest(apiPort, request);
    return env.ASSETS.fetch(request);
  }
};
