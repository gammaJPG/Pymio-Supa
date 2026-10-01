function fallo(status, message) { return Object.assign(new Error(message), { status }); }

export function validarCliente(data) {
  const name = typeof data?.name === 'string' ? data.name.trim() : '';
  const phone = typeof data?.phone === 'string' ? data.phone.trim() : '';
  const email = typeof data?.email === 'string' ? data.email.trim() : '';
  const address = typeof data?.address === 'string' ? data.address.trim() : '';
  if (!name || name.length > 120) throw fallo(400, 'Ingresa un nombre de hasta 120 caracteres.');
  if (phone && (phone.length > 32 || !/^\+?[\d\s().-]+$/.test(phone) || (phone.match(/\d/g) ?? []).length < 7 || (phone.match(/\d/g) ?? []).length > 15)) throw fallo(400, 'Ingresa un teléfono válido de 7 a 15 dígitos.');
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw fallo(400, 'Ingresa un correo electrónico válido.');
  if (address.length > 300) throw fallo(400, 'La dirección no puede superar 300 caracteres.');
  return { name, phone: phone || null, email: email || null, address: address || null };
}

export async function atenderClientes(req, pool, companyId, send) {
  try {
    if (req.method === 'GET') return send(200, await pool.rpc('customer.list', companyId));
    if (req.method !== 'POST') return send(405, { error: 'Método no permitido.' });
    if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') return send(415, { error: 'Envía el cliente en formato JSON.' });
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 8192) return send(413, { error: 'Cliente demasiado grande.' });
      chunks.push(chunk);
    }
    let data;
    try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { return send(400, { error: 'JSON inválido.' }); }
    return send(201, await pool.rpc('customer.create', companyId, validarCliente(data)));
  } catch (error) {
    if (error.status) return send(error.status, { error: error.message });
    console.error('Clientes:', error.code ?? 'desconocido');
    return send(500, { error: 'No se pudo guardar o consultar el cliente.' });
  }
}
