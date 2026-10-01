import { crearProducto } from './productos.mjs';
import { atenderCategorias } from './categorias.mjs';
import { atenderClientes } from './clientes.mjs';

import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { createSupabase } from './supabase.mjs';
import { atenderMovimientos } from './movimientos.mjs';
import { randomUUID } from 'node:crypto';

// API para pruebas locales. No implementa sesiones ni permisos por empresa.
export function createInventoryServer(pool, origins) {
  return http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Origin');
    const send = (code, body) => {
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(body));
    };
    const origin = req.headers.origin;
    if (origin && !origins.includes(origin)) {
      return send(403, { error: 'Origen no permitido. Revisa FRONTEND_ORIGINS en .env.' });
    }
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.writeHead(204);
      return res.end();
    }
    if (!['GET', 'POST', 'PUT', 'DELETE'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST, PUT, DELETE, OPTIONS');
      return send(405, { error: 'Método no permitido.' });
    }
    const url = new URL(req.url, 'http://127.0.0.1');
    const categoryId = /^\/api\/categories\/([1-9]\d{0,18})$/.exec(url.pathname)?.[1];
    const categoryRoute = url.pathname === '/api/categories' || Boolean(categoryId);
    const movementCode = /^\/api\/movements\/([a-f0-9]{12})$/.exec(url.pathname)?.[1];
    const historyProductId = /^\/api\/products\/([1-9]\d{0,18})\/movements$/.exec(url.pathname)?.[1];
    const productId = /^\/api\/products\/([1-9]\d{0,18})$/.exec(url.pathname)?.[1];
    const imageId = /^\/api\/product-images\/([0-9a-f-]{36})$/.exec(url.pathname)?.[1];
    const imageRoute = url.pathname === '/api/product-images' || Boolean(imageId);
    if (!categoryRoute && !imageRoute && url.pathname !== '/api/customers' && !historyProductId && !movementCode && url.pathname !== '/api/movements' && (['PUT', 'DELETE'].includes(req.method) ? !productId : url.pathname !== '/api/products')) return send(404, { error: 'Ruta no encontrada.' });
    const companyId = url.searchParams.get('company_id');
    if (!companyId || !/^[1-9]\d*$/.test(companyId) || companyId.length > 18) {
      return send(400, { error: 'company_id debe ser un entero positivo.' });
    }
    try {
      if (categoryRoute) return await atenderCategorias(req,pool,companyId,categoryId,send);
      if (url.pathname === '/api/customers') return await atenderClientes(req,pool,companyId,send);
      if (imageRoute) {
        if (req.method === 'GET' && imageId) {
          const body=await pool.getProductImage(`${companyId}/${imageId}.webp`);
          res.writeHead(200,{'Content-Type':'image/webp','Content-Length':body.length,'Cache-Control':'public, max-age=86400'});
          return res.end(body);
        }
        if (req.method === 'POST' && !imageId) {
          if (req.headers['content-type']?.split(';')[0].trim() !== 'image/webp') return send(415,{error:'La imagen debe estar comprimida en formato WebP.'});
          const chunks=[]; let bytes=0;
          for await (const chunk of req) { bytes+=chunk.length; if(bytes>250*1024)return send(413,{error:'La imagen comprimida supera el máximo de 250 KB.'}); chunks.push(chunk); }
          const body=Buffer.concat(chunks);
          if(body.length<12 || body.subarray(0,4).toString()!=='RIFF' || body.subarray(8,12).toString()!=='WEBP') return send(400,{error:'El archivo no es una imagen WebP válida.'});
          const id=randomUUID(), path=`${companyId}/${id}.webp`;
          await pool.uploadProductImage(path,body);
          return send(201,{path});
        }
        if (req.method === 'DELETE' && imageId) {
          await pool.deleteProductImage(`${companyId}/${imageId}.webp`);
          return send(200,{deleted:true});
        }
        return send(405,{error:'Método no permitido.'});
      }
      if (historyProductId) {
        if (req.method !== 'GET') return send(405,{error:'Método no permitido.'});
        return send(200, await pool.rpc('product.history', companyId, {id:historyProductId}));
      }
      if (movementCode || url.pathname === '/api/movements') return await atenderMovimientos(req, pool, companyId, send, movementCode);
      if (req.method === 'DELETE') {
        const deleted=await pool.rpc('product.delete', companyId, {id:productId});
        if (deleted.image_path) await pool.deleteProductImage(deleted.image_path).catch(()=>{});
        return send(200,deleted);
      }
      if (['POST', 'PUT'].includes(req.method)) {
        if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
          return send(415, { error: 'Envía el producto en formato JSON.' });
        }
        const chunks = [];
        let bytes = 0;
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > 16384) return send(413, { error: 'El producto excede el tamaño permitido.' });
          chunks.push(chunk);
        }
        let producto;
        try { producto = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(400, { error: 'JSON inválido.' }); }
        if (!producto || typeof producto !== 'object' || Array.isArray(producto)) return send(400, { error: 'Producto inválido.' });
        if (req.method === 'POST') producto.updated_at = producto.created_at;
        const { name, sku, category, qty, cost, price, crit_qty, created_at, updated_at, image_path } = producto;
        if (typeof name !== 'string' || !name.trim() || typeof category !== 'string' || !category.trim() ||
            (req.method === 'PUT' && (typeof sku !== 'string' || !sku.trim() || sku.length > 32))) {
          return send(400, { error: 'Completa producto, categoría y un SKU válido (mayúsculas, números y guiones).' });
        }
        if (![qty, cost, price, crit_qty].every(n => Number.isInteger(n) && n >= 0 && n <= 2147483647)) {
          return send(400, { error: 'Usa números enteros no negativos.' });
        }
        if (image_path != null && (typeof image_path !== 'string' || !new RegExp(`^${companyId}/[0-9a-f-]{36}\\.webp$`).test(image_path))) return send(400,{error:'La ruta de imagen no es válida para esta empresa.'});
        const fechaValida = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
        if (!fechaValida(created_at) || !fechaValida(updated_at) || Date.parse(updated_at) < Date.parse(created_at)) {
          return send(400, { error: 'Revisa las fechas: actualización debe ser igual o posterior a creación.' });
        }
        if (req.method === 'PUT') {
          return send(200, await pool.rpc('product.update', companyId, {...producto,id:productId}));
        }
        return send(201, await crearProducto(pool,companyId,producto));
      }
      send(200, await pool.rpc('product.list', companyId));
    } catch (error) {
      if (error.status) return send(error.status,{error:error.message});
      if (error.code === '23505') return send(409, { error: 'Ya existe un producto con ese SKU. Usa otro código.' });
      if (error.constraint === 'products_category_fk') return send(400, {error:'Selecciona una categoría existente. Actualiza el formulario si fue modificada o eliminada.'});
      if (error.code === '23503') return send(req.method === 'DELETE' ? 409 : 400, { error: req.method === 'DELETE' ? 'No se puede eliminar: el producto está asociado a otros registros.' : 'La empresa seleccionada no existe.' });
      if (['23514', '22007', '22008'].includes(error.code)) return send(400, { error: 'Los datos no cumplen las reglas del inventario.' });
      console.error('Error consultando Supabase:', error.code ?? 'desconocido');
      send(500, { error: 'No se pudo consultar Supabase. Revisa la conexión y la tabla products.' });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pool = createSupabase();
  const origins = (process.env.FRONTEND_ORIGINS ?? 'http://127.0.0.1:5500,http://localhost:5500')
    .split(',').map(value => value.trim());
  const server = createInventoryServer(pool, origins);
  const port = Number(process.env.PORT ?? 3001);
  server.on('error', error => {
    console.error('No se pudo iniciar la API:', error.code);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => console.log(`API local: http://127.0.0.1:${port}/api/products?company_id=1`));
}
