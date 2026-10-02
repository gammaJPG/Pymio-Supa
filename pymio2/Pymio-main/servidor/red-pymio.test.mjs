import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { atenderRedPymio } from './red-pymio.mjs';

function request(path,method='GET',body){
  const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);
  req.method=method;req.headers=body?{'content-type':'application/json'}:{};
  return {req,url:new URL(path,'http://localhost')};
}
async function call(path,method,body){
  const calls=[],pool={network:async(operation,company,payload)=>{calls.push({operation,company,payload});return {profile:{},businesses:[],communities:[],posts:[]};}};
  let response;const send=(status,data)=>(response={status,data});
  const input=request(path,method,body);await atenderRedPymio(input.req,pool,'7',send,input.url);
  return {calls,response};
}

test('RED Pymio: carga el espacio y conserva el alcance de la empresa',async()=>{
  const {calls,response}=await call('/api/network/bootstrap','GET');
  assert.equal(response.status,200);assert.deepEqual(calls,[{operation:'bootstrap',company:'7',payload:{}}]);
});

test('RED Pymio: valida y normaliza perfil, comunidades y publicaciones',async()=>{
  const profile=await call('/api/network/profile','PUT',{displayName:'  Café Sur  ',industry:'Alimentos',productTags:[' Café ','Mayorista','Café'],website:'',instagram:'https://instagram.com/cafesur',contactEmail:'VENTAS@CAFE.CL',accentColor:'#e4b930',avatarPath:'7/avatar/10000000-0000-4000-8000-000000000001.webp',bannerPath:'7/banner/10000000-0000-4000-8000-000000000002.webp'});
  assert.equal(profile.response.status,200);assert.deepEqual(profile.calls[0].payload.product_tags,['Café','Mayorista']);
  assert.equal(profile.calls[0].payload.contact_email,'ventas@cafe.cl');
  assert.equal(profile.calls[0].payload.instagram,'https://instagram.com/cafesur');
  assert.equal(profile.calls[0].payload.avatar_path,'7/avatar/10000000-0000-4000-8000-000000000001.webp');
  assert.equal(profile.calls[0].payload.banner_path,'7/banner/10000000-0000-4000-8000-000000000002.webp');
  assert.equal((await call('/api/network/profile','PUT',{displayName:'Negocio',website:'ftp://archivo'})).response.status,400);
  assert.equal((await call('/api/network/profile','PUT',{displayName:'Negocio',instagram:'instagram.com/sin-protocolo'})).response.status,400);
  assert.equal((await call('/api/network/profile','PUT',{displayName:'Negocio',contactEmail:'correo-invalido'})).response.status,400);
  assert.equal((await call('/api/network/profile','PUT',{displayName:'Negocio',avatarPath:'archivo.png'})).response.status,400);
  assert.equal((await call('/api/network/communities','POST',{name:' ',description:'Vacía'})).response.status,400);
  const community=await call('/api/network/communities','POST',{name:'Comercio Local',description:'Un espacio para colaborar',industry:'Retail',isOpen:'on'});
  assert.equal(community.response.status,201);assert.equal(community.calls[0].operation,'community.create');assert.equal(community.calls[0].payload.is_open,true);
  assert.equal((await call('/api/network/posts','POST',{kind:'event',title:'Encuentro',description:'Nos reunimos'})).response.status,400);
  assert.equal((await call('/api/network/posts','POST',{kind:'event',title:'Encuentro',description:'Nos reunimos',eventAt:'fecha imposible'})).response.status,400);
  const post=await call('/api/network/posts','POST',{kind:'benefit',title:'Descuento',description:'Oferta para la red'});
  assert.equal(post.response.status,201);assert.equal(post.calls[0].operation,'post.create');
  const updated=await call('/api/network/posts/10000000-0000-4000-8000-000000000001','PUT',{kind:'event',title:'Encuentro actualizado',description:'Nueva información',eventAt:'2026-11-02T15:00:00-03:00'});
  assert.equal(updated.response.status,200);assert.equal(updated.calls[0].operation,'post.update');
  assert.equal(updated.calls[0].payload.post_id,'10000000-0000-4000-8000-000000000001');
  assert.equal(updated.calls[0].payload.title,'Encuentro actualizado');
});

test('RED Pymio: valida el identificador antes de unirse a una comunidad',async()=>{
  assert.equal((await call('/api/network/communities/no-valida/join','POST')).response.status,404);
  const joined=await call('/api/network/communities/10000000-0000-4000-8000-000000000001/join','POST');
  assert.equal(joined.response.status,200);assert.equal(joined.calls[0].operation,'community.join');
});

test('RED Pymio: conecta empresas y permite responder solicitudes privadas',async()=>{
  assert.equal((await call('/api/network/connections/7','POST')).response.status,400);
  const connected=await call('/api/network/connections/12','POST');
  assert.equal(connected.response.status,200);assert.deepEqual(connected.calls[0],{operation:'connection.create',company:'7',payload:{target_company_id:'12'}});
  const requestId='20000000-0000-4000-8000-000000000002',communityId='10000000-0000-4000-8000-000000000001';
  assert.equal((await call(`/api/network/communities/${communityId}/requests/${requestId}`,'POST',{decision:'otro'})).response.status,400);
  const approved=await call(`/api/network/communities/${communityId}/requests/${requestId}`,'POST',{decision:'approve'});
  assert.equal(approved.response.status,200);assert.deepEqual(approved.calls[0].payload,{community_id:communityId,request_id:requestId,decision:'approve'});
});
