import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSupabase } from './supabase.mjs';
import { createInventoryServer } from './server.mjs';
import { createWebServer } from './dev.mjs';

test('Supabase: HTTPS RPC, secret stays server-side, error mapping and timeout', async () => {
  assert.throws(()=>createSupabase({url:'',key:''}), /Configura/);
  assert.throws(()=>createSupabase({url:'http://example.com',key:'secret'}), /HTTPS/);
  let sent;
  const client=createSupabase({url:'https://example.supabase.co',key:'sb_secret_test',fetchImpl:async(url, options)=>{sent={url,options};return Response.json([{id:'1'}]);}});
  assert.deepEqual(await client.rpc('product.list','1'),[{id:'1'}]);
  assert.equal(sent.url.pathname,'/rest/v1/rpc/pymio_api');
  assert.equal(sent.options.headers.apikey,'sb_secret_test');
  assert.deepEqual(JSON.parse(sent.options.body),{operation:'product.list',company:'1',payload:{}});
  for(const [code,status] of [['PT409',409],['PT404',404],['23505',409],['23514',400],['PGRST202',502]]) {
    const db=createSupabase({url:'https://example.supabase.co',key:'secret',fetchImpl:async()=>Response.json({code,message:'detail'},{status:400})});
    await assert.rejects(db.rpc('product.list',1),{status});
  }
  const offline=createSupabase({url:'https://example.supabase.co',key:'secret',fetchImpl:async()=>{throw new Error('network');}});
  await assert.rejects(offline.rpc('product.list',1),{status:503});
});

test('Supabase Auth: crea usuarios y vincula su empresa usando solo la clave del servidor', async()=>{
  const calls=[];
  const client=createSupabase({url:'https://example.supabase.co',key:'sb_secret_test',fetchImpl:async(url,options)=>{calls.push({url,options});if(url.pathname.includes('/admin/users'))return Response.json({id:'user-1',email:'pyme@example.com'});if(url.pathname.endsWith('/pymio_register_account'))return Response.json({company_id:9,business_name:'Mi Pyme',owner_name:'Ana'});return Response.json({user:{id:'user-1',email:'pyme@example.com'}});}});
  const user=await client.createAuthUser('pyme@example.com','segura123',{business_name:'Mi Pyme'});
  const account=await client.registerAccount(user.id,user.email,'Mi Pyme','Ana');
  assert.equal(account.company_id,9);assert.equal(calls[0].options.headers.Authorization,'Bearer sb_secret_test');
  assert.equal(calls[0].url.pathname,'/auth/v1/admin/users');assert.equal(calls[1].url.pathname,'/rest/v1/rpc/pymio_register_account');
});

test('Supabase Auth: crea una contraseña para una cuenta originada en Google',async()=>{
  const calls=[];
  const client=createSupabase({url:'https://example.supabase.co',key:'sb_secret_test',fetchImpl:async(url,options)=>{calls.push({url,options});return Response.json({id:'google-user'});}});
  await client.updateAuthUserPassword('google-user','segura123');
  assert.equal(calls[0].url.pathname,'/auth/v1/admin/users/google-user');
  assert.equal(calls[0].options.method,'PUT');
  assert.deepEqual(JSON.parse(calls[0].options.body),{password:'segura123',app_metadata:{pymio_password_set:true}});
  await client.markAuthBusinessNameSet('google-user');
  assert.deepEqual(JSON.parse(calls[1].options.body),{app_metadata:{pymio_business_name_set:true}});
});

test('Supabase Auth: la actualización de Google califica parámetros y columnas sin ambigüedad',async()=>{
  const migration=await readFile(new URL('../supabase/migrations/017_fix_google_account_ambiguity.sql',import.meta.url),'utf8');
  assert.match(migration,/btrim\(pymio_update_account\.business_name\)/);
  assert.match(migration,/SET business_name=btrim\(pymio_update_account\.business_name\)/);
  assert.match(migration,/WHERE ua\.user_id=pymio_update_account\.auth_user/);
  assert.doesNotMatch(migration,/SET business_name=btrim\(business_name\)/);
});

test('Supabase Auth: prepara Google con PKCE e intercambia el código en el servidor',async()=>{
  const calls=[];
  const client=createSupabase({url:'https://example.supabase.co',key:'sb_secret_test',fetchImpl:async(url,options)=>{calls.push({url,options});if(url.pathname.endsWith('/settings'))return Response.json({external:{google:true}});return Response.json({user:{id:'google-user',email:'ana@example.com'}});}});
  assert.deepEqual(await client.authProviders(),{google:true});
  const authorize=new URL(client.googleAuthorizeUrl('http://localhost/callback','state-1','challenge-1'));
  assert.equal(authorize.pathname,'/auth/v1/authorize');assert.equal(authorize.searchParams.get('provider'),'google');assert.equal(authorize.searchParams.get('code_challenge'),'challenge-1');
  const auth=await client.exchangeOAuthCode('code-1','verifier-1');
  assert.equal(auth.user.email,'ana@example.com');
  assert.equal(calls.at(-1).url.searchParams.get('grant_type'),'pkce');
  assert.deepEqual(JSON.parse(calls.at(-1).options.body),{auth_code:'code-1',code_verifier:'verifier-1'});
});

test('Supabase RED Pymio: usa la función protegida y mantiene el alcance empresarial',async()=>{
  const sent=[];
  const client=createSupabase({url:'https://example.supabase.co',key:'sb_secret_test',fetchImpl:async(url,options)=>{sent.push({url,options});return options.method==='PATCH'?Response.json([{id:'10000000-0000-4000-8000-000000000001'}]):Response.json({profile:{},businesses:[],communities:[],posts:[]});}});
  const result=await client.network('bootstrap','12');
  assert.deepEqual(result.communities,[]);assert.equal(sent.at(-1).url.pathname,'/rest/v1/rpc/pymio_network');
  assert.deepEqual(JSON.parse(sent.at(-1).options.body),{operation:'bootstrap',company:'12',payload:{}});
  await client.network('post.update','12',{post_id:'10000000-0000-4000-8000-000000000001',kind:'event',title:'Nuevo título'});
  const update=sent.at(-2);assert.equal(update.url.pathname,'/rest/v1/network_posts');assert.equal(update.options.method,'PATCH');
  assert.equal(update.url.searchParams.get('author_company_id'),'eq.12');
  assert.deepEqual(JSON.parse(update.options.body),{kind:'event',title:'Nuevo título'});
});

test('HTTP Auth: Google entra a la plataforma y completa dentro solo el nombre del negocio',async()=>{
  const registrations=[],updates=[],passwordUpdates=[],marked=[];
  const pool={
    authProviders:async()=>({google:true}),
    googleAuthorizeUrl:(redirect,state,challenge)=>`https://auth.example/authorize?redirect_to=${encodeURIComponent(redirect)}&state=${state}&challenge=${challenge}`,
    exchangeOAuthCode:async()=>({user:{id:'google-user',email:'ana@example.com',user_metadata:{full_name:'Ana Pérez'}}}),
    accountForUser:async()=>{throw Object.assign(new Error('sin cuenta'),{status:404});},
    updateAuthUserPassword:async(userId,password)=>{passwordUpdates.push({userId,password});},
    markAuthBusinessNameSet:async userId=>marked.push(userId),
    registerAccount:async(userId,email,businessName,ownerName)=>{registrations.push({userId,email,businessName,ownerName});return {company_id:12,business_name:businessName,owner_name:ownerName};},
    updateAccount:async(userId,businessName,ownerName)=>{updates.push({userId,businessName,ownerName});return {company_id:12,business_name:businessName,owner_name:ownerName};}
  };
  const server=createInventoryServer(pool,['http://localhost:5500'],{sessionSecret:'test-secret'}),base=await listen(server);
  try{
    const start=await fetch(base+'/api/auth/google/start?return_to='+encodeURIComponent('http://localhost:5500/piloto.html'),{redirect:'manual'});
    assert.equal(start.status,302);const oauthCookie=start.headers.get('set-cookie').split(';')[0],authorize=new URL(start.headers.get('location'));
    const callback=new URL(authorize.searchParams.get('redirect_to'));callback.searchParams.set('state',authorize.searchParams.get('state'));callback.searchParams.set('code','code-1');
    const result=await fetch(callback,{headers:{Cookie:oauthCookie},redirect:'manual'});
    assert.equal(result.status,302);assert.equal(result.headers.get('location'),'http://localhost:5500/piloto.html');
    const setupCookie=result.headers.getSetCookie().find(value=>value.startsWith('pymio_google_setup=')).split(';')[0];
    const initialSessionCookie=result.headers.getSetCookie().find(value=>value.startsWith('pymio_session=')).split(';')[0];
    const initialSession=await fetch(base+'/api/auth/session',{headers:{Cookie:initialSessionCookie}});
    assert.equal(initialSession.status,200);assert.equal((await initialSession.json()).session.requiresBusinessName,true);
    const setupResponse=await fetch(base+'/api/auth/google/setup',{headers:{Cookie:setupCookie}}),setup=await setupResponse.json();
    assert.equal(setupResponse.status,200);assert.deepEqual(setup,{email:'ana@example.com',businessName:'Ana Pérez',ownerName:'Ana Pérez',needsPassword:false});
    assert.deepEqual(registrations,[{userId:'google-user',email:'ana@example.com',businessName:'Ana Pérez',ownerName:'Ana Pérez'}]);
    const complete=await fetch(base+'/api/auth/google/complete',{method:'POST',headers:{Cookie:setupCookie,'Content-Type':'application/json'},body:JSON.stringify({businessName:'Café Los Andes'})});
    assert.equal(complete.status,201);assert.deepEqual(updates,[{userId:'google-user',businessName:'Café Los Andes',ownerName:'Ana Pérez'}]);assert.deepEqual(marked,['google-user']);
    const sessionCookie=complete.headers.getSetCookie().find(value=>value.startsWith('pymio_session=')).split(';')[0];
    const response=await fetch(base+'/api/auth/session',{headers:{Cookie:sessionCookie}}),session=(await response.json()).session;
    assert.equal(response.status,200);assert.equal(session.userId,'google-user');assert.equal(session.email,'ana@example.com');assert.equal(session.companyId,'12');assert.equal(session.businessName,'Café Los Andes');assert.equal(session.ownerName,'Ana Pérez');assert.equal(session.demo,false);
    const passwordResponse=await fetch(base+'/api/auth/password',{method:'POST',headers:{Cookie:sessionCookie,'Content-Type':'application/json'},body:JSON.stringify({password:'segura123'})});
    assert.equal(passwordResponse.status,200);assert.deepEqual(passwordUpdates,[{userId:'google-user',password:'segura123'}]);
  } finally {await close(server);}
});

test('HTTP Auth: mantiene el piloto en empresa 1 y fuerza esa empresa desde la sesión',async()=>{
  const calls=[];const pool={rpc:async(operation,company)=>{calls.push({operation,company});return [];}};
  const server=createInventoryServer(pool,[],{sessionSecret:'test-secret',pilotPassword:'pilot-pass'}),base=await listen(server);
  try{
    assert.equal((await fetch(base+'/api/products?company_id=999')).status,401);
    const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:'pilotodepruebas',password:'pilot-pass'})});
    assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
    const products=await fetch(base+'/api/products?company_id=999',{headers:{Cookie:cookie}});assert.equal(products.status,200);assert.equal(calls.at(-1).company,'1');
    const session=await fetch(base+'/api/auth/session',{headers:{Cookie:cookie}});assert.equal((await session.json()).session.demo,true);
  } finally {await close(server);}
});

test('Supabase Storage: sube únicamente WebP y permite eliminarlo', async () => {
  const calls=[];
  const client=createSupabase({url:'https://example.supabase.co',key:'sb_secret_test',fetchImpl:async(url,options)=>{calls.push({url,options});return Response.json({Key:'ok'});}});
  const image=Buffer.from('RIFFxxxxWEBPdata');
  await client.uploadProductImage('2/10000000-0000-4000-8000-000000000001.webp',image);
  const downloaded=await client.getProductImage('2/10000000-0000-4000-8000-000000000001.webp');
  await client.deleteProductImage('2/10000000-0000-4000-8000-000000000001.webp');
  assert.equal(calls[0].url.pathname,'/storage/v1/object/product-images/2/10000000-0000-4000-8000-000000000001.webp');
  assert.equal(calls[0].options.headers['Content-Type'],'image/webp');
  assert.equal(calls[0].options.body,image);
  assert.match(calls[1].url.pathname,/\/storage\/v1\/object\/public\/product-images\//);
  assert.ok(downloaded.length>0);
  assert.equal(calls[2].options.method,'DELETE');
  await client.uploadProfileImage('2/avatar/10000000-0000-4000-8000-000000000002.webp',image);
  await client.getProfileImage('2/avatar/10000000-0000-4000-8000-000000000002.webp');
  await client.deleteProfileImage('2/avatar/10000000-0000-4000-8000-000000000002.webp');
  assert.equal(calls[3].url.pathname,'/storage/v1/object/profile-images/2/avatar/10000000-0000-4000-8000-000000000002.webp');
  assert.match(calls[4].url.pathname,/\/storage\/v1\/object\/public\/profile-images\//);
  assert.equal(calls[5].options.method,'DELETE');
});

test('HTTP: valida y limita las imágenes antes de enviarlas a Storage', async () => {
  const uploads=[];
  const pool={uploadProductImage:async(path,body)=>uploads.push({path,body}),getProductImage:async path=>{uploads.push({read:path});return Buffer.from('RIFFxxxxWEBPdata');},deleteProductImage:async path=>uploads.push({deleted:path}),rpc:async()=>[]};
  const server=createInventoryServer(pool,[]),base=await listen(server);
  try {
    const valid=Buffer.from('RIFFxxxxWEBPdata');
    const response=await fetch(base+'/api/product-images?company_id=2',{method:'POST',headers:{'Content-Type':'image/webp'},body:valid});
    assert.equal(response.status,201);
    const result=await response.json();
    assert.match(result.path,/^2\/[0-9a-f-]{36}\.webp$/);
    assert.equal(uploads[0].body.toString(),valid.toString());
    const served=await fetch(`${base}/api/product-images/${result.path.split('/')[1].replace('.webp','')}?company_id=2`);
    assert.equal(served.status,200); assert.equal(served.headers.get('content-type'),'image/webp');
    assert.equal((await fetch(base+'/api/product-images?company_id=2',{method:'POST',headers:{'Content-Type':'image/png'},body:valid})).status,415);
    assert.equal((await fetch(base+'/api/product-images?company_id=2',{method:'POST',headers:{'Content-Type':'image/webp'},body:Buffer.alloc(250*1024+1)})).status,413);
    const id=result.path.split('/')[1].replace('.webp','');
    assert.equal((await fetch(`${base}/api/product-images/${id}?company_id=2`,{method:'DELETE'})).status,200);
    assert.equal(uploads.at(-1).deleted,result.path);
  } finally { await close(server); }
});

test('HTTP: procesa fotos de perfil y banners WebP por empresa', async () => {
  const calls=[];
  const pool={uploadProfileImage:async(path,body)=>calls.push({path,body}),getProfileImage:async path=>{calls.push({read:path});return Buffer.from('RIFFxxxxWEBPdata');},deleteProfileImage:async path=>calls.push({deleted:path}),rpc:async()=>[]};
  const server=createInventoryServer(pool,[]),base=await listen(server);
  try{
    const valid=Buffer.from('RIFFxxxxWEBPdata');
    const uploaded=await fetch(base+'/api/profile-images/avatar?company_id=2',{method:'POST',headers:{'Content-Type':'image/webp'},body:valid});
    assert.equal(uploaded.status,201);const result=await uploaded.json();assert.match(result.path,/^2\/avatar\/[0-9a-f-]{36}\.webp$/);
    const id=result.path.split('/')[2].replace('.webp','');
    const served=await fetch(`${base}/api/profile-images/2/avatar/${id}?company_id=2`);assert.equal(served.status,200);assert.equal(calls.at(-1).read,result.path);
    assert.equal((await fetch(base+'/api/profile-images/banner?company_id=2',{method:'POST',headers:{'Content-Type':'image/png'},body:valid})).status,415);
    assert.equal((await fetch(`${base}/api/profile-images/avatar/${id}?company_id=2`,{method:'DELETE'})).status,200);assert.equal(calls.at(-1).deleted,result.path);
  }finally{await close(server);}
});

async function listen(server) {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
async function close(server) { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }

test('HTTP: validation, company scope, CORS, CRUD routing and Supabase failures', async () => {
  const calls=[];
  let failure;
  const server=createInventoryServer({async rpc(operation,company,data){calls.push({operation,company,data});if(failure)throw failure;return {id:'81'};}},['http://localhost:5500']);
  const base=await listen(server);
  const url=base+'/api/products?company_id=2';
  const product={name:'Prueba',category:'Cat',qty:5,cost:10,price:20,low_qty:2,created_at:'2026-09-01T00:00:00Z',updated_at:'2026-09-01T00:00:00Z'};
  const send=(url,method,data)=>fetch(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  try {
    assert.equal((await fetch(url,{method:'OPTIONS',headers:{Origin:'http://localhost:5500'}})).status,204);
    assert.equal((await fetch(url,{headers:{Origin:'https://other.test'}})).status,403);
    assert.equal((await send(url,'POST',{...product,company_id:999})).status,201);
    assert.equal(calls.at(-1).operation,'product.create'); assert.equal(calls.at(-1).company,'2');
    const before=calls.length;
    for(const update of [{qty:-1},{qty:1.2},{low_qty:-1},{name:' '},{created_at:null}]) assert.equal((await send(url,'POST',{...product,...update})).status,400);
    assert.equal(calls.length,before);
    assert.equal((await fetch(base+'/api/products?company_id=undefined')).status,400);
    assert.equal((await send(base+'/api/products/81?company_id=2','PUT',{...product,sku:'ABC'})).status,200);
    assert.equal(calls.at(-1).operation,'product.update'); assert.equal(calls.at(-1).data.id,'81');
    assert.equal((await send(base+'/api/products/81/status?company_id=2','PATCH',{Estado:'Inhabilitado'})).status,200);
    assert.equal(calls.at(-1).operation,'product.status'); assert.deepEqual(calls.at(-1).data,{id:'81',Estado:'Inhabilitado'});
    assert.equal((await send(base+'/api/products/81/status?company_id=2','PATCH',{Estado:'Otro'})).status,400);
    assert.equal((await send(url,'PATCH',{Estado:'Inhabilitado'})).status,405);
    await fetch(base+'/api/products/81?company_id=2',{method:'DELETE'});assert.equal(calls.at(-1).operation,'product.delete');
    await fetch(base+'/api/products/81/movements?company_id=2');assert.equal(calls.at(-1).operation,'product.history');
    await send(base+'/api/categories?company_id=2','POST',{name:'Nueva'});assert.equal(calls.at(-1).operation,'category.post');
    assert.equal((await send(base+'/api/categories?company_id=2','POST',{name:''})).status,400);
    const movement={operation:'Ingreso',operation_detail:'Otros',channel:'Físico',payment_method:'Efectivo',occurred_at:'2026-09-01T00:00:00Z',items:[{product_id:'81',units:2}]};
    assert.equal((await send(base+'/api/movements?company_id=2','POST',movement)).status,201);
    assert.equal(calls.at(-1).operation,'movement.create');assert.match(calls.at(-1).data.code,/^[0-9a-f-]{36}$/);
    assert.equal((await fetch(base+'/api/movements?company_id=2&from=bad')).status,400);
    failure=Object.assign(new Error('Sin configurar'),{status:503});
    assert.equal((await fetch(url)).status,503);
  } finally { await close(server); }
});

test('Web: serves UI but never configuration, migrations or server files', async () => {
  const server=createWebServer(),base=await listen(server);
  try {
    assert.equal((await fetch(base+'/')).status,200);
    assert.equal((await fetch(base+'/app.js')).status,200);
    for(const path of ['/servidor/.env','/servidor/server.mjs','/supabase/migrations/001_import.sql','/.env','/%2e%2e/inventario_app']) assert.equal((await fetch(base+path)).status,404);
  } finally { await close(server); }
});
