import { randomUUID } from 'node:crypto';
import {generateSalesReceiptPdf} from './sales-receipt-pdf.mjs';

function fallo(status, message) { return Object.assign(new Error(message), { status }); }

function validarDescuento(discount) {
  if (!discount || !['fixed','percentage'].includes(discount.type) || typeof discount.value !== 'number' || !Number.isFinite(discount.value) || discount.value < 0 || discount.value > 2147483647 || (discount.type === 'percentage' && discount.value > 100)) throw fallo(400, 'Descuento inválido. Usa un monto positivo o un porcentaje entre 0 y 100.');
}

export function calcularDescuentoProducto(price, units, discount) {
  if (!discount) return 0;
  validarDescuento(discount);
  const subtotal = Number(price) * Math.abs(units);
  const amount = discount.type === 'percentage' ? subtotal * discount.value / 100 : discount.value;
  if (amount > subtotal) throw fallo(400, 'El descuento no puede superar el subtotal del producto.');
  return amount;
}

export function validarMovimiento(data) {
  if (!data || !['Ingreso', 'Egreso'].includes(data.operation)) throw fallo(400, 'Selecciona Ingreso o Egreso.');
  if (typeof data.occurred_at !== 'string' || !/T.*(Z|[+-]\d{2}:\d{2})$/.test(data.occurred_at) || !Number.isFinite(Date.parse(data.occurred_at))) throw fallo(400, 'Fecha y hora inválidas.');
  if (!Array.isArray(data.items) || !data.items.length || data.items.length > 100) throw fallo(400, 'Incluye entre 1 y 100 productos.');
  const ids = new Set();
  for (const item of data.items) {
    if (!item || !/^[1-9]\d{0,18}$/.test(String(item.product_id)) || !Number.isInteger(item.units) || item.units <= 0 || item.units > 2147483647) throw fallo(400, 'Selecciona productos válidos y unidades enteras positivas.');
    if (ids.has(String(item.product_id))) throw fallo(400, 'Incluye cada producto una sola vez.');
    ids.add(String(item.product_id));
  }
  const allowed = data.operation === 'Ingreso' ? ['Compra','Otros'] : ['Venta','Merma','Consumo Interno','Otros'];
  if (!allowed.includes(data.operation_detail)) throw fallo(400,'Selecciona un detalle válido para el tipo de operación.');
  if (!['Físico','Online'].includes(data.channel)) throw fallo(400, 'Selecciona un canal válido.');
  if (!['Efectivo','Tarjeta','Transferencia'].includes(data.payment_method)) throw fallo(400, 'Selecciona un medio de pago válido.');
  if (data.Estado != null && !['Pagado','Pendiente de Pago'].includes(data.Estado)) throw fallo(400, 'Estado de pago inválido.');
  if (data.Estado === 'Pendiente de Pago' && !['Venta','Compra'].includes(data.operation_detail)) throw fallo(400, 'Solo las ventas y compras pueden quedar pendientes de pago.');
  if (data.customer_id != null && (!/^[1-9]\d{0,18}$/.test(String(data.customer_id)) || data.operation_detail !== 'Venta')) throw fallo(400, 'Selecciona un cliente válido para la venta.');
  if (data.supplier_id != null && (!/^[1-9]\d{0,18}$/.test(String(data.supplier_id)) || data.operation_detail !== 'Compra')) throw fallo(400, 'Selecciona un proveedor válido para la compra.');
  const rawDiscount = data.discount ?? null;
  let discount = null;
  if (rawDiscount !== null) {
    if (rawDiscount.scope === 'product') {
      if (rawDiscount.type != null || rawDiscount.value != null) throw fallo(400, 'El descuento por producto se indica en cada fila.');
      discount = {scope:'product'};
    } else {
      if ((rawDiscount.scope != null && rawDiscount.scope !== 'global') || rawDiscount.type !== 'percentage') throw fallo(400, 'El descuento global solo puede ser porcentual.');
      validarDescuento(rawDiscount);
      discount = {scope:'global',type:'percentage',value:rawDiscount.value};
    }
  }
  for (const item of data.items) {
    if (data.operation_detail === 'Compra' && (typeof item.unit_cost !== 'number' || !Number.isInteger(item.unit_cost) || item.unit_cost < 0 || item.unit_cost > 2147483647)) throw fallo(400, 'Ingresa un costo válido para cada producto comprado.');
    if (data.operation_detail !== 'Compra' && item.unit_cost != null) throw fallo(400, 'Los costos solo se indican en compras.');
    if (discount?.scope === 'product') validarDescuento(item.discount);
    else if (item.discount != null) throw fallo(400, 'Selecciona descuento por producto para aplicar descuentos individuales.');
  }
  if (data.code && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.code)) throw fallo(400, 'Código de movimiento inválido.');
  return {
    operation: data.operation,
    operation_detail: data.operation_detail,
    channel: data.channel,
    payment_method: data.payment_method,
    ...(data.Estado != null ? {Estado:data.Estado} : {}),
    ...(data.customer_id == null ? {} : { customer_id: String(data.customer_id) }),
    ...(data.supplier_id == null ? {} : { supplier_id: String(data.supplier_id) }),
    occurred_at: new Date(data.occurred_at).toISOString(),
    discount,
    items: data.items.map(i => ({ product_id: String(i.product_id), units: i.units, ...(data.operation_detail === 'Compra' ? {unit_cost:i.unit_cost} : {}), discount: discount?.scope === 'product' ? {type:i.discount.type,value:i.discount.value} : null })).sort((a,b) => BigInt(a.product_id) < BigInt(b.product_id) ? -1 : 1)
  };
}

export async function guardarMovimiento(pool, companyId, data) {
  return pool.rpc('movement.create', companyId, { request: validarMovimiento(data), code: data.code || randomUUID() });
}
export async function listarMovimientos(pool, companyId, displayCode = null, filters = {}) {
  const {from = null, to = null} = filters;
  for (const value of [from,to]) {
    if (value !== null && (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value)))) throw fallo(400, 'Filtro de fecha inválido.');
  }
  if (from && to && Date.parse(from) >= Date.parse(to)) throw fallo(400, 'El rango de fechas es inválido.');
  return pool.rpc('movement.list', companyId, { code: displayCode, from, to });
}
export async function atenderMovimientos(req, pool, companyId, send, movementCode) {
  try {
    if (req.method === 'GET') {
      const params = new URL(req.url, 'http://localhost').searchParams;
      const result = await listarMovimientos(pool, companyId, movementCode, movementCode ? {} : {from:params.get('from'),to:params.get('to')});
      if (movementCode && !result.length) return send(404, {error:'El movimiento ya no existe o no pertenece a esta empresa.'});
      return send(200, movementCode ? result[0] : result);
    }
    if (movementCode ? !['PUT','DELETE'].includes(req.method) : req.method !== 'POST') return send(405, { error: 'Método no permitido.' });
    if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') return send(415, { error: 'Envía el movimiento en formato JSON.' });
    const chunks = []; let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 65536) return send(413, { error: 'Movimiento demasiado grande.' });
      chunks.push(chunk);
    }
    let data;
    try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(400, { error: 'JSON inválido.' }); }
    const result = movementCode
      ? await cambiarMovimiento(pool, companyId, movementCode, req.method, data)
      : await guardarMovimiento(pool, companyId, data);
    return send(movementCode || result.repeated ? 200 : 201, result);
  } catch (error) {
    if (error.status) return send(error.status, { error: error.message });
    console.error('Movimientos Supabase:', error.code ?? 'desconocido');
    return send(500, { error: 'No se pudo guardar o consultar el movimiento. Revisa la conexión y reintenta.' });
  }
}

export async function atenderComprobanteVenta(req,pool,companyId,send,res,movementCode){
  if(req.method!=='GET')return send(405,{error:'Método no permitido.'});
  try{
    const movements=await listarMovimientos(pool,companyId,movementCode,{}),movement=movements[0];
    if(!movement)return send(404,{error:'La venta ya no existe o no pertenece a esta empresa.'});
    const pdf=await generateSalesReceiptPdf(movement),filename=`Comprobante de venta - ${movementCode}.pdf`;
    res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,'Content-Length':pdf.length,'Cache-Control':'no-store'});return res.end(pdf);
  }catch(error){return send(error.status||500,{error:error.message||'No se pudo generar el comprobante de venta.'});}
}


export async function cambiarMovimiento(pool, companyId, displayCode, method, data) {
  if (!['PUT','DELETE'].includes(method) || !data || !Number.isInteger(data.revision) || data.revision < 1 ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.action_id ?? '')) throw fallo(400, 'Solicitud inválida. Vuelve a seleccionar el movimiento.');
  return pool.rpc('movement.change', companyId, { displayCode, method, revision: data.revision, action_id: data.action_id, replacement: method === 'PUT' ? validarMovimiento(data) : null });
}
