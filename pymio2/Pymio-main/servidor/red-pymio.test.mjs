import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { atenderRedPymio } from './red-pymio.mjs';

function request(path,method='GET',body){
  const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);
  req.method=method;req.headers=body?{'content-type':'application/json'}:{};
  return {req,url:new URL(path,'http://localhost')};
}
async function call(path,method,body,resultOverride){
  const calls=[],result=resultOverride||{profile:{},businesses:[],communities:[{id:'10000000-0000-4000-8000-000000000001',joined:true}],posts:[]},pool={network:async(operation,company,payload)=>{calls.push({operation,company,payload});return result;},community:async(operation,company,payload)=>{calls.push({operation,company,payload});return result;},entitlements:async(operation,company,payload)=>{calls.push({operation,company,payload});return {can_create_community:true};}};
  let response;const send=(status,data)=>(response={status,data});
  const input=request(path,method,body);await atenderRedPymio(input.req,pool,'7',send,input.url);
  return {calls,response};
}

test('RED Pymio: carga el espacio y conserva el alcance de la empresa',async()=>{
  const {calls,response}=await call('/api/network/bootstrap','GET');
  assert.equal(response.status,200);assert.deepEqual(calls,[{operation:'bootstrap',company:'7',payload:{}}]);
});

test('RED Pymio: valida y normaliza perfil, comunidades y publicaciones',async()=>{
  const profile=await call('/api/network/profile','PUT',{displayName:'  Café Sur  ',industry:'Alimentos',productTags:[' Café ','Mayorista','Café'],website:'',instagram:'https://instagram.com/cafesur',whatsappPhone:'+56 9 1234-5678',contactEmail:'VENTAS@CAFE.CL',accentColor:'#e4b930',avatarPath:'7/avatar/10000000-0000-4000-8000-000000000001.webp',bannerPath:'7/banner/10000000-0000-4000-8000-000000000002.webp'});
  assert.equal(profile.response.status,200);assert.deepEqual(profile.calls[0].payload.product_tags,['Café','Mayorista']);
  assert.equal(profile.calls[0].payload.contact_email,'ventas@cafe.cl');
  assert.equal(profile.calls[0].payload.instagram,'https://instagram.com/cafesur');
  assert.equal(profile.calls[0].payload.whatsapp_phone,'+56912345678');
  assert.equal(profile.calls[0].payload.avatar_path,'7/avatar/10000000-0000-4000-8000-000000000001.webp');
  assert.equal(profile.calls[0].payload.banner_path,'7/banner/10000000-0000-4000-8000-000000000002.webp');
  assert.equal((await call('/api/network/profile','PUT',{displayName:'Negocio',website:'ftp://archivo'})).response.status,400);
  assert.equal((await call('/api/network/profile','PUT',{displayName:'Negocio',instagram:'instagram.com/sin-protocolo'})).response.status,400);
  assert.equal((await call('/api/network/profile','PUT',{displayName:'Negocio',contactEmail:'correo-invalido'})).response.status,400);
  assert.equal((await call('/api/network/profile','PUT',{displayName:'Negocio',whatsappPhone:'1234567'})).response.status,400);
  assert.equal((await call('/api/network/profile','PUT',{displayName:'Negocio',whatsappPhone:'+56 WhatsApp'})).response.status,400);
  assert.equal((await call('/api/network/profile','PUT',{displayName:'Negocio',avatarPath:'archivo.png'})).response.status,400);
  assert.equal((await call('/api/network/communities','POST',{name:' ',description:'Vacía'})).response.status,400);
  const community=await call('/api/network/communities','POST',{name:'Comercio Local',description:'Un espacio para colaborar',industry:'Retail',isOpen:'on'});
  assert.equal(community.response.status,201);assert.equal(community.calls[0].operation,'community.create');assert.equal(community.calls[0].payload.is_open,true);assert.equal(community.calls[1].operation,'bootstrap');
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
  assert.equal(connected.response.status,200);assert.deepEqual(connected.calls[0],{operation:'connection.request',company:'7',payload:{target_company_id:'12'}});
  const requestId='20000000-0000-4000-8000-000000000002',communityId='10000000-0000-4000-8000-000000000001';
  assert.equal((await call(`/api/network/communities/${communityId}/requests/${requestId}`,'POST',{decision:'otro'})).response.status,400);
  const approved=await call(`/api/network/communities/${communityId}/requests/${requestId}`,'POST',{decision:'approve'});
  assert.equal(approved.response.status,200);assert.deepEqual(approved.calls[0].payload,{community_id:communityId,request_id:requestId,decision:'approve'});
});

test('RED Pymio: conserva conversaciones privadas, metadatos y estado de lectura',async()=>{
  const threadId='30000000-0000-4000-8000-000000000003';
  const sent=await call('/api/network/connections/12/activity','POST',{kind:'quote_request',subject:'Cotización de embalajes',body:'Necesitamos 100 unidades.',threadId,metadata:{deadline:'2026-11-10',budget:'250000'}});
  assert.equal(sent.response.status,201);assert.equal(sent.calls[0].operation,'activity.create');
  assert.equal(sent.calls[0].payload.thread_id,threadId);assert.equal(sent.calls[0].payload.metadata.deadline,'2026-11-10');
  const read=await call(`/api/network/activity/${threadId}/read`,'POST');
  assert.equal(read.response.status,200);assert.deepEqual(read.calls[0],{operation:'activity.read',company:'7',payload:{thread_id:threadId}});
  assert.equal((await call('/api/network/connections/12/activity','POST',{kind:'message',subject:'',body:'Sin asunto'})).response.status,400);
});

test('RED Pymio: ofrece una bandeja de comunicaciones y formularios distintos por acción',async()=>{
  const source=await readFile(new URL('../ecosistema.js',import.meta.url),'utf8');
  const html=await readFile(new URL('../ecosistema.html',import.meta.url),'utf8');
  const migration=await readFile(new URL('../supabase/migrations/020_private_communications_center.sql',import.meta.url),'utf8');
  for(const label of ['Mensajes y oportunidades','Recibidos','Enviados','Selecciona una conversación'])assert.match(html,new RegExp(label));
  for(const field of ['Fecha límite','Presupuesto estimado','Válida hasta','Detalle de la solicitud','Condiciones de la oferta'])assert.match(source,new RegExp(field));
  assert.match(source,/data-thread-reply/);assert.match(source,/activity\/.+\/read/);
  assert.match(migration,/thread_id uuid/);assert.match(migration,/'private_activity'/);assert.match(migration,/operation='activity\.read'/);
});

test('RED Pymio: presenta chat, retención por plan y recepción en tiempo real',async()=>{
  const source=await readFile(new URL('../ecosistema.js',import.meta.url),'utf8');
  const html=await readFile(new URL('../ecosistema.html',import.meta.url),'utf8');
  const css=await readFile(new URL('../ecosistema.css',import.meta.url),'utf8');
  const server=await readFile(new URL('./red-pymio.mjs',import.meta.url),'utf8');
  const migration=await readFile(new URL('../supabase/migrations/022_message_retention.sql',import.meta.url),'utf8');
  assert.match(html,/data-message-retention/);assert.match(source,/data-chat-compose/);assert.match(source,/new EventSource/);
  assert.match(source,/pymio-chat-tray/);assert.match(css,/pymio-chat-popup/);assert.match(server,/text\/event-stream/);
  assert.match(migration,/interval '7 days'/);assert.match(migration,/is_pymium/);
});

test('RED Pymio: al unirse reemplaza el botón por Miembro - Usuario',async()=>{
  const source=await readFile(new URL('../ecosistema.js',import.meta.url),'utf8');
  assert.match(source,/item\.joined\?[\s\S]*Miembro - Usuario[\s\S]*data-community-join/);
});

test('RED Pymio: consulta una comunidad y crea formularios de hasta 20 preguntas',async()=>{
  const id='10000000-0000-4000-8000-000000000001';
  const detail=await call(`/api/network/communities/${id}`,'GET');
  assert.equal(detail.response.status,200);assert.deepEqual(detail.calls.map(call=>call.operation),['bootstrap','detail']);
  const created=await call('/api/network/forms','POST',{communityId:id,title:'Registro de proveedores',questions:[{title:'Razón social',type:'text'},{title:'Documento',type:'file'}]});
  assert.equal(created.response.status,201);assert.equal(created.calls[0].operation,'form.create');assert.equal(created.calls[0].payload.questions.length,2);
  assert.deepEqual(created.calls[0].payload.questions.map(item=>item.position),[1,2]);
});

test('RED Pymio: exige membresía para ver incluso una comunidad abierta',async()=>{
  const id='10000000-0000-4000-8000-000000000001';
  const result={profile:{},businesses:[],communities:[{id,is_open:true,joined:false,owned:false}],posts:[]};
  const detail=await call(`/api/network/communities/${id}`,'GET',undefined,result);
  assert.equal(detail.response.status,403);
  assert.match(detail.response.data.error,/Debes unirte/);
  assert.deepEqual(detail.calls.map(item=>item.operation),['bootstrap']);
});

test('RED Pymio: el constructor muestra controles por tipo y no cierra al pulsar el fondo',async()=>{
  const source=await readFile(new URL('../ecosistema.js',import.meta.url),'utf8');
  const html=await readFile(new URL('../ecosistema.html',import.meta.url),'utf8');
  const server=await readFile(new URL('./red-pymio.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/<span>Pregunta<\/span>/);
  assert.match(source,/Escribe cada opción en una línea separada\./);
  assert.match(source,/data-text-preview/);assert.match(source,/data-file-preview/);
  assert.match(source,/accept="\.pdf,\.docx/);assert.match(server,/\['pdf','docx'/);
  assert.match(html,/Descargar archivos adjuntados por usuarios/);
  assert.match(source,/dialog\.id!==['"]community-form-builder['"]/);
  assert.match(source,/Respuesta enviada · puedes editarla/);
  assert.match(source,/Archivo actual:/);
  assert.match(source,/activeResponse\?\.id\|\|crypto\.randomUUID/);
  assert.match(server,/companyName\+' - '\+file\.name/);
});

test('RED Pymio: identifica claramente los roles en la lista de miembros',async()=>{
  const source=await readFile(new URL('../ecosistema.js',import.meta.url),'utf8');
  for(const label of ['Creador - Administrador','Miembro - Administrador','Miembro - Usuario'])assert.match(source,new RegExp(label));
  assert.match(source,/member-actions/);assert.match(source,/data-connect-business/);
  assert.match(source,/membersDialog\?\.open/);
});

test('RED Pymio: los administradores actualizan identidad, redes e imágenes de su comunidad',async()=>{
  const id='10000000-0000-4000-8000-000000000001';
  const avatar=`${id}/avatar/20000000-0000-4000-8000-000000000002.webp`;
  const updated=await call(`/api/network/communities/${id}/profile`,'PUT',{
    name:'  Comunidad Comercio Local  ',description:'Negocios que colaboran y crecen juntos.',industry:'Retail',isOpen:true,
    avatarPath:avatar,bannerPath:'',website:'https://comercio.local',instagram:'https://instagram.com/comerciolocal',youtube:'',tiktok:'',facebook:'',linkedin:''
  });
  assert.equal(updated.response.status,200);assert.equal(updated.calls[0].operation,'profile.update');
  assert.equal(updated.calls[0].payload.name,'Comunidad Comercio Local');
  assert.equal(updated.calls[0].payload.avatar_path,avatar);assert.equal(updated.calls[0].payload.is_open,true);
  assert.equal((await call(`/api/network/communities/${id}/profile`,'PUT',{name:'Comunidad',description:'Descripción',website:'ftp://archivo'})).response.status,400);
  assert.equal((await call(`/api/network/communities/${id}/profile`,'PUT',{name:'Comunidad',description:'Descripción',avatarPath:'avatar.png'})).response.status,400);
});

test('RED Pymio: el centro de comunidad conserva recursos y añade gestión operativa',async()=>{
  const source=await readFile(new URL('../ecosistema.js',import.meta.url),'utf8');
  const html=await readFile(new URL('../ecosistema.html',import.meta.url),'utf8');
  for(const label of ['Comunidad en RED Pymio','Resumen','Eventos','Formularios','Solicitudes','Gestionar miembros','Compartir invitación','Exportar miembros'])assert.match(html,new RegExp(label));
  assert.match(source,/activeCommunityRequests/);assert.match(source,/respondCommunityRequest/);
  assert.match(source,/openCommunityEventComposer/);assert.match(source,/exportCommunityMembers/);assert.match(source,/shareActiveCommunity/);
  assert.match(source,/data-community-pane-jump/);assert.match(source,/data-community-request-count/);
});

test('RED Pymio: la comunidad permite editar marca, redes y administradores',async()=>{
  const source=await readFile(new URL('../ecosistema.js',import.meta.url),'utf8');
  const html=await readFile(new URL('../ecosistema.html',import.meta.url),'utf8');
  for(const label of ['Editar comunidad','Foto de perfil','Banner de la comunidad','Sitio web','Instagram','YouTube','TikTok','Facebook','LinkedIn'])assert.match(html,new RegExp(label));
  assert.match(html,/id="community-edit-dialog"/);assert.match(html,/data-community-edit-form/);
  assert.match(source,/communityImageUrl/);assert.match(source,/uploadCommunityImage/);assert.match(source,/communities\/\$\{community\.id\}\/profile/);
  assert.match(source,/mayChangeRole=canAdmin\(\)&&item\.role!==['"]owner['"]&&!isSelf/);
});

test('RED Pymio: solo el creador puede quitar administradores y el cambio se notifica',async()=>{
  const sql=await readFile(new URL('../supabase/migrations/021_community_roles_and_notifications.sql',import.meta.url),'utf8');
  const source=await readFile(new URL('../ecosistema.js',import.meta.url),'utf8');
  const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
  assert.match(sql,/NOT is_admin AND target_role='admin' AND actor_role<>'owner'/);
  assert.match(sql,/INSERT INTO public\.community_role_notifications/);
  assert.match(source,/item\.role!=='admin'\|\|isCommunityOwner\(\)/);
  assert.match(app,/Ahora eres administrador/);
  assert.match(app,/Ya no eres administrador/);
});

test('RED Pymio: el perfil enumera comunidades creadas y administradas',async()=>{
  const sql=await readFile(new URL('../supabase/migrations/021_community_roles_and_notifications.sql',import.meta.url),'utf8');
  const source=await readFile(new URL('../ecosistema.js',import.meta.url),'utf8');
  assert.match(sql,/'managed_communities'/);
  assert.match(source,/Comunidades que gestionas/);
  assert.match(source,/item\.role==='owner'\?'Creador':'Administrador'/);
});

test('RED Pymio: migración define roles, formularios y almacenamiento privado',async()=>{
  const sql=await readFile(new URL('../supabase/migrations/016_community_forms.sql',import.meta.url),'utf8');
  assert.match(sql,/role IN \('owner','admin','member'\)/);
  assert.match(sql,/community_form_questions/);assert.match(sql,/BETWEEN 1 AND 20/);
  assert.match(sql,/community-form-files','community-form-files',false,2621440/);
});

test('RED Pymio: migración amplía identidad visual, redes y gestión delegada',async()=>{
  const sql=await readFile(new URL('../supabase/migrations/017_community_identity_and_management.sql',import.meta.url),'utf8');
  for(const field of ['avatar_path','banner_path','website','instagram','youtube','tiktok','facebook','linkedin'])assert.match(sql,new RegExp(field));
  assert.match(sql,/community-profile-images','community-profile-images',false,524288/);
  assert.match(sql,/role_name NOT IN \('owner','admin'\)/);assert.match(sql,/operation='profile\.update'/);
});

test('RED Pymio: WhatsApp queda disponible y enlazado en los perfiles públicos',async()=>{
  const source=await readFile(new URL('../ecosistema.js',import.meta.url),'utf8');
  const html=await readFile(new URL('../ecosistema.html',import.meta.url),'utf8');
  const schemaSql=await readFile(new URL('../supabase/migrations/022_profile_whatsapp.sql',import.meta.url),'utf8');
  const functionSql=await readFile(new URL('../supabase/migrations/023_expose_profile_whatsapp.sql',import.meta.url),'utf8');
  assert.match(html,/name="whatsappPhone"/);assert.match(html,/type="tel"/);assert.match(html,/código de país/);
  assert.match(source,/whatsapp_phone/);assert.match(source,/https:\/\/wa\.me\//);assert.match(source,/Enviar mensaje por WhatsApp/);
  assert.match(schemaSql,/ADD COLUMN IF NOT EXISTS whatsapp_phone/);assert.match(schemaSql,/business_profiles_whatsapp_phone_format/);
  assert.match(functionSql,/'whatsapp_phone',coalesce\(bp\.whatsapp_phone,''\)/);
});
