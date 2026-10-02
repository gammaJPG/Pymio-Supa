import { crearProducto } from './productos.mjs';
import { atenderCategorias } from './categorias.mjs';
import { atenderClientes } from './clientes.mjs';

import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { createSupabase } from './supabase.mjs';
import { atenderMovimientos } from './movimientos.mjs';
import { randomUUID, createHmac, createHash, timingSafeEqual } from 'node:crypto';

const SESSION_SECONDS = 60 * 60 * 24 * 7;
const jsonBody = async (req, max = 16_384) => {
  const chunks=[]; let bytes=0;
  for await (const chunk of req) { bytes+=chunk.length; if(bytes>max) throw Object.assign(new Error('La solicitud excede el tamaño permitido.'),{status:413}); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('JSON inválido.'),{status:400}); }
};
const encodeSession = (value, secret) => {
  const payload=Buffer.from(JSON.stringify(value)).toString('base64url');
  return payload+'.'+createHmac('sha256',secret).update(payload).digest('base64url');
};
const decodeSession = (token, secret) => {
  try {
    const [payload,signature]=token.split('.');
    const expected=createHmac('sha256',secret).update(payload).digest();
    const received=Buffer.from(signature,'base64url');
    if(received.length!==expected.length || !timingSafeEqual(received,expected))return null;
    const session=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
    return session.exp>Date.now()?session:null;
  } catch { return null; }
};
const cookieValue = req => (req.headers.cookie || '').split(';').map(v=>v.trim()).find(v=>v.startsWith('pymio_session='))?.slice(14);
const namedCookie = (req,name) => (req.headers.cookie || '').split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1);
const safeEqual = (left,right) => {const a=Buffer.from(String(left||'')),b=Buffer.from(String(right||''));return a.length===b.length&&timingSafeEqual(a,b);};

export function createInventoryServer(pool, origins, options = {}) {
  const {sessionSecret, pilotUsername='pilotodepruebas', pilotPassword='consultoriaswc', secureCookie=false}=options;
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
    if (origin) res.setHeader('Access-Control-Allow-Credentials', 'true');
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
    const authRoute=url.pathname.startsWith('/api/auth/');
    const setSession = session => {
      const token=encodeSession({...session,exp:Date.now()+SESSION_SECONDS*1000},sessionSecret);
      res.appendHeader('Set-Cookie',`pymio_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secureCookie?'; Secure':''}`);
    };
    const clearCookie = (name,path='/') => res.appendHeader('Set-Cookie',`${name}=; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=0${secureCookie?'; Secure':''}`);
    const redirect = location => {res.writeHead(302,{Location:location});res.end();};
    const returnWithError = (returnTo,message) => {const target=new URL(returnTo);target.searchParams.set('auth_error',message);redirect(target.href);};
    if (authRoute) {
      try {
        if (!sessionSecret) return send(503,{error:'Las sesiones no están configuradas.'});
        if (url.pathname==='/api/auth/session' && req.method==='GET') {
          const session=decodeSession(cookieValue(req),sessionSecret);
          return session?send(200,{session}):send(401,{error:'No hay una sesión activa.'});
        }
        if (url.pathname==='/api/auth/logout' && req.method==='POST') {
          res.setHeader('Set-Cookie',`pymio_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureCookie?'; Secure':''}`);
          return send(200,{ok:true});
        }
        if(url.pathname==='/api/auth/providers' && req.method==='GET')return send(200,await pool.authProviders());
        if(url.pathname==='/api/auth/google/setup' && req.method==='GET'){
          const setup=decodeSession(namedCookie(req,'pymio_google_setup'),sessionSecret);
          if(!setup)return send(401,{error:'La configuración con Google venció. Inicia sesión nuevamente.'});
          return send(200,{email:setup.email,businessName:setup.businessName||'',ownerName:setup.ownerName||''});
        }
        if(url.pathname==='/api/auth/google/complete' && req.method==='POST'){
          const setup=decodeSession(namedCookie(req,'pymio_google_setup'),sessionSecret);
          if(!setup)return send(401,{error:'La configuración con Google venció. Inicia sesión nuevamente.'});
          if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')return send(415,{error:'Envía los datos en formato JSON.'});
          const data=await jsonBody(req),businessName=String(data.businessName||'').trim(),ownerName=String(data.ownerName||'').trim();
          if(!businessName || businessName.length>120 || ownerName.length>120)return send(400,{error:'Ingresa un nombre de negocio válido.'});
          const account=setup.mode==='update'
            ? await pool.updateAccount(setup.userId,businessName,ownerName)
            : await pool.registerAccount(setup.userId,setup.email,businessName,ownerName);
          const session={userId:setup.userId,email:setup.email,companyId:String(account.company_id),businessName:account.business_name,ownerName:account.owner_name||'',demo:false};
          setSession(session);clearCookie('pymio_google_setup','/api/auth/google');return send(201,{session});
        }
        if(url.pathname==='/api/auth/google/start' && req.method==='GET'){
          const returnTo=url.searchParams.get('return_to'),target=returnTo&&new URL(returnTo);
          if(!target || !origins.includes(target.origin))return send(400,{error:'La dirección de retorno no está permitida.'});
          const providers=await pool.authProviders();
          if(!providers.google)return returnWithError(target.href,'El acceso con Google aún no está habilitado para Pymio.');
          const state=randomUUID(),verifier=randomUUID()+randomUUID(),challenge=createHash('sha256').update(verifier).digest('base64url');
          const oauthToken=encodeSession({state,verifier,returnTo:target.href,exp:Date.now()+10*60*1000},sessionSecret);
          res.setHeader('Set-Cookie',`pymio_oauth=${oauthToken}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=600${secureCookie?'; Secure':''}`);
          const callback=new URL(`${secureCookie?'https':'http'}://${req.headers.host}/api/auth/google/callback`);
          callback.searchParams.set('state',state);
          return redirect(pool.googleAuthorizeUrl(callback.href,state,challenge));
        }
        if(url.pathname==='/api/auth/google/callback' && req.method==='GET'){
          const flow=decodeSession(namedCookie(req,'pymio_oauth'),sessionSecret),fallback=origins[0]+'/piloto.html';
          const returnTo=flow?.returnTo||fallback;
          if(url.searchParams.get('error'))return returnWithError(returnTo,'Google no pudo completar el acceso. Inténtalo nuevamente.');
          if(!flow || !safeEqual(flow.state,url.searchParams.get('state')) || !url.searchParams.get('code'))return returnWithError(returnTo,'La solicitud de acceso venció. Inténtalo nuevamente.');
          const auth=await pool.exchangeOAuthCode(url.searchParams.get('code'),flow.verifier),user=auth.user;
          if(!user?.id || !user.email)return returnWithError(returnTo,'Google no proporcionó un correo válido para crear la sesión.');
          const googleName=String(user.user_metadata?.full_name||user.user_metadata?.name||'').trim().slice(0,120);
          const previousDefault=String(user.user_metadata?.business_name||googleName||user.email.split('@')[0]||'Mi negocio').trim().slice(0,120);
          let account,needsSetup=false;
          try {account=await pool.accountForUser(user.id);needsSetup=account.business_name===previousDefault && String(account.owner_name||'')===googleName;}
          catch(error){
            if(error.status!==404)throw error;
            needsSetup=true;
          }
          if(needsSetup){
            const setupToken=encodeSession({mode:account?'update':'create',userId:user.id,email:user.email,businessName:account?.business_name||'',ownerName:account?.owner_name||googleName,exp:Date.now()+15*60*1000},sessionSecret);
            res.appendHeader('Set-Cookie',`pymio_google_setup=${setupToken}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=900${secureCookie?'; Secure':''}`);
            clearCookie('pymio_oauth','/api/auth/google');
            const target=new URL(returnTo);target.searchParams.set('google_setup','1');return redirect(target.href);
          }
          const session={userId:user.id,email:user.email,companyId:String(account.company_id),businessName:account.business_name,ownerName:account.owner_name||'',demo:false};
          setSession(session);
          clearCookie('pymio_oauth','/api/auth/google');
          return redirect(returnTo);
        }
        if (!['/api/auth/login','/api/auth/register'].includes(url.pathname) || req.method!=='POST') return send(404,{error:'Ruta no encontrada.'});
        if (req.headers['content-type']?.split(';')[0].trim()!=='application/json') return send(415,{error:'Envía los datos en formato JSON.'});
        const data=await jsonBody(req);
        if (url.pathname==='/api/auth/login') {
          const identifier=String(data.identifier||'').trim().toLowerCase(), password=String(data.password||'');
          if(!identifier || !password)return send(400,{error:'Ingresa tu correo o usuario y contraseña.'});
          if(identifier===pilotUsername.toLowerCase() && password===pilotPassword){
            const session={userId:'pilot',email:null,companyId:'1',businessName:'Distribuidora Andes Ltda.',ownerName:'',demo:true};setSession(session);return send(200,{session});
          }
          let auth;
          try { auth=await pool.signIn(identifier,password); }
          catch { return send(401,{error:'Correo o contraseña incorrectos.'}); }
          const account=await pool.accountForUser(auth.user.id);
          const session={userId:auth.user.id,email:auth.user.email,companyId:String(account.company_id),businessName:account.business_name,ownerName:account.owner_name||'',demo:false};setSession(session);return send(200,{session});
        }
        const email=String(data.email||'').trim().toLowerCase(),password=String(data.password||''),businessName=String(data.businessName||'').trim(),ownerName=String(data.ownerName||'').trim();
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return send(400,{error:'Ingresa un correo electrónico válido.'});
        if(password.length<8)return send(400,{error:'La contraseña debe tener al menos 8 caracteres.'});
        if(!businessName || businessName.length>120 || ownerName.length>120)return send(400,{error:'Ingresa un nombre de negocio válido.'});
        let user;
        try { user=await pool.createAuthUser(email,password,{business_name:businessName,owner_name:ownerName}); }
        catch(error){return send(error.status===422||error.status===400?409:error.status||502,{error:error.status===422||error.status===400?'Ya existe una cuenta con ese correo.':error.message});}
        try {
          const account=await pool.registerAccount(user.id,email,businessName,ownerName);
          const session={userId:user.id,email,companyId:String(account.company_id),businessName:account.business_name,ownerName:account.owner_name||'',demo:false};setSession(session);return send(201,{session});
        } catch(error) { await pool.deleteAuthUser(user.id).catch(()=>{}); throw error; }
      } catch(error) { return send(error.status||500,{error:error.message||'No se pudo completar el acceso.'}); }
    }
    const categoryId = /^\/api\/categories\/([1-9]\d{0,18})$/.exec(url.pathname)?.[1];
    const categoryRoute = url.pathname === '/api/categories' || Boolean(categoryId);
    const movementCode = /^\/api\/movements\/([a-f0-9]{12})$/.exec(url.pathname)?.[1];
    const historyProductId = /^\/api\/products\/([1-9]\d{0,18})\/movements$/.exec(url.pathname)?.[1];
    const productId = /^\/api\/products\/([1-9]\d{0,18})$/.exec(url.pathname)?.[1];
    const imageId = /^\/api\/product-images\/([0-9a-f-]{36})$/.exec(url.pathname)?.[1];
    const imageRoute = url.pathname === '/api/product-images' || Boolean(imageId);
    if (!categoryRoute && !imageRoute && url.pathname !== '/api/customers' && !historyProductId && !movementCode && url.pathname !== '/api/movements' && (['PUT', 'DELETE'].includes(req.method) ? !productId : url.pathname !== '/api/products')) return send(404, { error: 'Ruta no encontrada.' });
    const session=sessionSecret?decodeSession(cookieValue(req),sessionSecret):null;
    if(sessionSecret && !session)return send(401,{error:'Tu sesión venció. Vuelve a ingresar.'});
    const companyId = session?String(session.companyId):url.searchParams.get('company_id');
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
        const { name, sku, category, qty, cost, price, crit_qty, low_qty, created_at, updated_at, image_path } = producto;
        if (typeof name !== 'string' || !name.trim() || typeof category !== 'string' || !category.trim() ||
            (req.method === 'PUT' && (typeof sku !== 'string' || !sku.trim() || sku.length > 32))) {
          return send(400, { error: 'Completa producto, categoría y un SKU válido (mayúsculas, números y guiones).' });
        }
        if (![qty, cost, price, crit_qty, low_qty].every(n => Number.isInteger(n) && n >= 0 && n <= 2147483647) || low_qty <= crit_qty) {
          return send(400, { error: 'Usa números enteros no negativos; el stock bajo debe superar al crítico.' });
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
  if (!process.env.SESSION_SECRET) throw new Error('Configura SESSION_SECRET en servidor/.env.');
  const server = createInventoryServer(pool, origins, {sessionSecret:process.env.SESSION_SECRET,pilotPassword:process.env.PILOT_PASSWORD,secureCookie:process.env.COOKIE_SECURE==='true'});
  const port = Number(process.env.PORT ?? 3001);
  server.on('error', error => {
    console.error('No se pudo iniciar la API:', error.code);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => console.log(`API local: http://127.0.0.1:${port}/api/products?company_id=1`));
}
