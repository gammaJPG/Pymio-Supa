import { randomUUID } from 'node:crypto';

const TYPES = new Set(['problema', 'sugerencia', 'consulta']);
const STATUSES = new Set(['pendiente', 'en_revision', 'resuelto']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const cleanText = (value, max) => String(value ?? '').trim().slice(0, max);

export function validateTicket(input = {}) {
  const type = cleanText(input.type, 30);
  const subject = cleanText(input.subject, 160);
  const description = cleanText(input.description, 5000);
  const requestId = cleanText(input.requestId, 36) || randomUUID();
  if (!TYPES.has(type)) throw Object.assign(new Error('Selecciona un tipo de solicitud válido.'), {status:400});
  if (subject.length < 3) throw Object.assign(new Error('El asunto debe tener al menos 3 caracteres.'), {status:400});
  if (description.length < 10) throw Object.assign(new Error('La descripción debe tener al menos 10 caracteres.'), {status:400});
  if (!UUID.test(requestId)) throw Object.assign(new Error('La identificación de la solicitud no es válida.'), {status:400});
  return {type, subject, description, request_id:requestId};
}

async function readJson(req, max = 8192) {
  if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
    throw Object.assign(new Error('Envía los datos en formato JSON.'), {status:415});
  }
  const chunks=[]; let bytes=0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > max) throw Object.assign(new Error('La solicitud excede el tamaño permitido.'), {status:413});
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Los datos enviados no son válidos.'), {status:400}); }
}

export async function handleSupport(req, pool, session, send, url) {
  try {
    const statusRoute = /^\/api\/support\/admin\/tickets\/([0-9a-f-]{36})\/status$/i.exec(url.pathname);
    if (url.pathname === '/api/support/capabilities' && req.method === 'GET') {
      if (session.demo) return send(200, {admin:false, demo:true});
      return send(200, await pool.support('capabilities', session.userId, session.companyId));
    }
    if (url.pathname === '/api/support/tickets' && req.method === 'GET') {
      if (session.demo) return send(200, {tickets:[], demo:true});
      return send(200, await pool.support('list.mine', session.userId, session.companyId));
    }
    if (url.pathname === '/api/support/tickets' && req.method === 'POST') {
      if (session.demo) return send(403, {error:'La cuenta piloto no puede crear solicitudes de soporte.'});
      const ticket = validateTicket(await readJson(req));
      return send(201, await pool.support('create', session.userId, session.companyId, ticket));
    }
    if (url.pathname === '/api/support/admin/tickets' && req.method === 'GET') {
      const status=cleanText(url.searchParams.get('status'),20),type=cleanText(url.searchParams.get('type'),30);
      if (status && !STATUSES.has(status)) return send(400,{error:'El estado solicitado no es válido.'});
      if (type && !TYPES.has(type)) return send(400,{error:'El tipo solicitado no es válido.'});
      return send(200, await pool.support('admin.list', session.userId, session.companyId, {status,type}));
    }
    if (statusRoute && req.method === 'PATCH') {
      const data=await readJson(req),status=cleanText(data.status,20);
      if (!STATUSES.has(status)) return send(400,{error:'Selecciona un estado válido.'});
      return send(200, await pool.support('admin.status', session.userId, session.companyId, {ticket_id:statusRoute[1],status}));
    }
    return send(404,{error:'Ruta no encontrada.'});
  } catch (error) {
    return send(error.status || 500, {error:error.message || 'No se pudo completar la operación de soporte.'});
  }
}
