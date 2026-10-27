import { validarCliente } from './clientes.mjs';

export const validarProveedor = validarCliente;

export async function atenderProveedores(req, pool, companyId, send) {
  try {
    if (req.method === 'GET') return send(200, await pool.rpc('supplier.list', companyId));
    if (req.method !== 'POST') return send(405, { error: 'Método no permitido.' });
    if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') return send(415, { error: 'Envía el proveedor en formato JSON.' });
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 8192) return send(413, { error: 'Proveedor demasiado grande.' });
      chunks.push(chunk);
    }
    let data;
    try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { return send(400, { error: 'JSON inválido.' }); }
    return send(201, await pool.rpc('supplier.create', companyId, validarProveedor(data)));
  } catch (error) {
    if (error.status) return send(error.status, { error: error.message });
    console.error('Proveedores:', error.code ?? 'desconocido');
    return send(500, { error: 'No se pudo guardar o consultar el proveedor.' });
  }
}
