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
  const calls=[],result=resultOverride||{profile:{},businesses:[],communities:[{id:'10000000-0000-4000-8000-000000000001',joined:true}],posts:[]},pool={network:async(operation,company,payload)=>{calls.push({operation,company,payload});return result;},community:async(operation,company,payload)=>{calls.push({operation,company,payload});return result;},entitlements:async(operation,company,payload)=>{calls.push({operation,company,payload});return {can_create_community:true};},requireCommunityAdmin:async()=>true};
  let response;const send=(status,data)=>(response={status,data});
  const input=request(path,method,body);await atenderRedPymio(input.req,pool,'7',send,input.url);
  return {calls,response};
}

test('RED Pymio: carga el espacio y conserva el alcance de la empresa',async()=>{
  const {calls,response}=await call('/api/network/bootstrap','GET');
  assert.equal(response.status,200);assert.deepEqual(calls,[{operation:'bootstrap',company:'7',payload:{}}]);
});

test('RED Pymio: entrega notificaciones de las comunidades del usuario',async()=>{
  const req=request('/api/network/notifications','GET'),expected=[{id:'form-f1',kind:'form'}];let response,company;
  await atenderRedPymio(req.req,{getCommunityNotifications:async value=>{company=value;return expected;}},'7',(status,data)=>response={status,data},req.url);
  assert.equal(response.status,200);assert.deepEqual(response.data.notifications,expected);assert.equal(company,'7');
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
  assert.equal((await call('/api/network/posts','POST',{kind:'event',eventMode:'online',title:'Encuentro',description:'Nos reunimos',eventAt:'fecha imposible'})).response.status,400);
  const communityId='10000000-0000-4000-8000-000000000001';
  assert.equal((await call('/api/network/posts','POST',{kind:'benefit',eventMode:'online',communityId,title:'Descuento',description:'Oferta para la red',eventAt:'2026-11-02T15:00:00-03:00'})).response.status,400);
  assert.equal((await call('/api/network/posts','POST',{kind:'event',eventMode:'online',communityId,title:'Encuentro',description:'Nos reunimos',schedule:'range',eventAt:'2026-11-02T15:00:00-03:00',endsAt:'2026-11-02T14:00:00-03:00'})).response.status,400);
  const post=await call('/api/network/posts','POST',{kind:'event',eventMode:'hybrid',requestAttendance:'on',communityId,title:'Encuentro',description:'Nos reunimos',location:'Centro',latitude:'-33.45',longitude:'-70.66',schedule:'range',eventAt:'2026-11-02T15:00:00-03:00',endsAt:'2026-11-03T00:59:00-03:00'});
  assert.equal(post.response.status,201);assert.equal(post.calls[0].operation,'post.create');
  assert.equal(post.calls[0].payload.expires_at,'2026-11-03T03:59:00.000Z');
  assert.equal(post.calls[0].payload.event_mode,'hybrid');assert.equal(post.calls[0].payload.request_attendance,true);assert.equal(post.calls[0].payload.latitude,-33.45);assert.equal(post.calls[0].payload.longitude,-70.66);
  const updated=await call('/api/network/posts/10000000-0000-4000-8000-000000000001','PUT',{kind:'event',eventMode:'online',communityId,title:'Encuentro actualizado',description:'Nueva información',duration:'day',eventAt:'2026-11-02T15:00:00-03:00'});
  assert.equal(updated.response.status,200);assert.equal(updated.calls[0].operation,'post.update');
  assert.equal(updated.calls[0].payload.post_id,'10000000-0000-4000-8000-000000000001');
  assert.equal(updated.calls[0].payload.title,'Encuentro actualizado');
  assert.equal(updated.calls[0].payload.expires_at,'2026-11-03T18:00:00.000Z');assert.equal(updated.calls[0].payload.request_attendance,false);
  const weekly=await call('/api/network/posts','POST',{kind:'event',eventMode:'online',communityId,title:'Semana',description:'Evento semanal',duration:'week',eventAt:'2026-11-02T15:00:00-03:00'});
  assert.equal(weekly.calls[0].payload.expires_at,'2026-11-09T18:00:00.000Z');
  const monthly=await call('/api/network/posts','POST',{kind:'event',eventMode:'online',communityId,title:'Mes',description:'Evento mensual',duration:'month',eventAt:'2026-01-31T15:00:00-03:00'});
  assert.equal(monthly.calls[0].payload.expires_at,'2026-02-28T18:00:00.000Z');
  const deleted=await call('/api/network/posts/10000000-0000-4000-8000-000000000001','DELETE');
  assert.equal(deleted.response.status,200);assert.deepEqual(deleted.calls[0],{operation:'post.delete',company:'7',payload:{post_id:'10000000-0000-4000-8000-000000000001'}});
});

test('RED Pymio: solo administradores de la comunidad pueden publicar eventos',async()=>{
  const communityId='10000000-0000-4000-8000-000000000001',input=request('/api/network/posts','POST',{kind:'event',eventMode:'online',communityId,title:'Encuentro',description:'Nos reunimos',schedule:'single',eventAt:'2026-11-02T15:00:00-03:00'});let response,created=false;
  const pool={requireCommunityAdmin:async()=>{throw Object.assign(new Error('Solo los administradores de la comunidad pueden crear o modificar eventos.'),{status:403});},network:async()=>{created=true;}};
  await atenderRedPymio(input.req,pool,'7',(status,data)=>response={status,data},input.url);
  assert.equal(response.status,403);assert.equal(created,false);
});

test('RED Pymio: abre eventos públicos y registra interés o asistencia',async()=>{
  const eventId='10000000-0000-4000-8000-000000000001',detail={event:{id:eventId,title:'Encuentro'},community:{name:'Comercio Local'},isMember:false,interestedCount:2},calls=[];let response;
  const pool={getCommunityEventDetail:async(id,company)=>{calls.push({kind:'get',id,company});return detail;},setCommunityEventResponse:async(id,company,status)=>{calls.push({kind:'set',id,company,status});return {...detail,viewerResponse:status,interestedCount:3};}};
  let input=request(`/api/network/events/${eventId}`);await atenderRedPymio(input.req,pool,'7',(status,data)=>response={status,data},input.url);assert.equal(response.status,200);assert.equal(response.data.interestedCount,2);
  input=request(`/api/network/events/${eventId}/response`,'POST',{status:'interested'});await atenderRedPymio(input.req,pool,'7',(status,data)=>response={status,data},input.url);assert.equal(response.status,200);assert.equal(response.data.viewerResponse,'interested');assert.deepEqual(calls.at(-1),{kind:'set',id:eventId,company:'7',status:'interested'});
  input=request(`/api/network/events/${eventId}/response`,'POST',{status:'otro'});await atenderRedPymio(input.req,pool,'7',(status,data)=>response={status,data},input.url);assert.equal(response.status,400);
});

test('RED Pymio: valida el identificador antes de unirse a una comunidad',async()=>{
  assert.equal((await call('/api/network/communities/no-valida/join','POST')).response.status,404);
  const joined=await call('/api/network/communities/10000000-0000-4000-8000-000000000001/join','POST');
  assert.equal(joined.response.status,200);assert.equal(joined.calls[0].operation,'community.join');
});

test('RED Pymio: permite que un miembro se salga de una comunidad',async()=>{
  const communityId='10000000-0000-4000-8000-000000000001',input=request('/api/network/communities/leave','POST',{communityId}),calls=[];let response;
  const pool={leaveCommunity:async(id,company)=>{calls.push({id,company});return {communities:[]};}};
  await atenderRedPymio(input.req,pool,'7',(status,data)=>response={status,data},input.url);
  assert.equal(response.status,200);assert.deepEqual(response.data,{communities:[]});assert.deepEqual(calls,[{id:communityId,company:'7'}]);
  const invalid=request('/api/network/communities/leave','POST',{communityId:'no-valida'});await atenderRedPymio(invalid.req,pool,'7',(status,data)=>response={status,data},invalid.url);assert.equal(response.status,400);assert.equal(calls.length,1);
  const legacy=request(`/api/network/communities/${communityId}/membership`,'DELETE');await atenderRedPymio(legacy.req,pool,'7',(status,data)=>response={status,data},legacy.url);assert.equal(response.status,200);assert.equal(calls.length,2);
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

test('RED Pymio: conserva una conversación por destinatario, metadatos y estado de lectura',async()=>{
  const threadId='30000000-0000-4000-8000-000000000003';
  const sent=await call('/api/network/connections/12/activity','POST',{kind:'quote_request',body:'Necesitamos 100 unidades.',threadId,metadata:{deadline:'2026-11-10',budget:'250000'}});
  assert.equal(sent.response.status,201);assert.equal(sent.calls[0].operation,'activity.create');
  assert.equal(sent.calls[0].payload.thread_id,threadId);assert.equal(sent.calls[0].payload.subject,'');assert.equal(sent.calls[0].payload.metadata.deadline,'2026-11-10');
  const read=await call(`/api/network/activity/${threadId}/read`,'POST');
  assert.equal(read.response.status,200);assert.deepEqual(read.calls[0],{operation:'activity.read',company:'7',payload:{thread_id:threadId}});
  assert.equal((await call('/api/network/connections/12/activity','POST',{kind:'message',body:'Sin asunto'})).response.status,201);
  assert.equal((await call('/api/network/connections/12/activity','POST',{kind:'message',body:''})).response.status,400);
});

test('RED Pymio: ofrece una bandeja de comunicaciones y formularios distintos por acción',async()=>{
  const source=await readFile(new URL('../ecosistema.js',import.meta.url),'utf8');
  const html=await readFile(new URL('../ecosistema.html',import.meta.url),'utf8');
  const mobile=await readFile(new URL('../mobile.js',import.meta.url),'utf8');
  const mobileCss=await readFile(new URL('../mobile.css',import.meta.url),'utf8');
  const migration=await readFile(new URL('../supabase/migrations/020_private_communications_center.sql',import.meta.url),'utf8');
  const singleConversationMigration=await readFile(new URL('../supabase/migrations/031_single_direct_conversation.sql',import.meta.url),'utf8');
  for(const label of ['Mensajes y oportunidades','Todos','No leídos','Favoritos','Grupos','Selecciona una conversación'])assert.match(html,new RegExp(label));
  for(const field of ['Fecha límite','Presupuesto estimado','Válida hasta','Detalle de la solicitud','Condiciones de la oferta'])assert.match(source,new RegExp(field));
  assert.doesNotMatch(source,/name="subject"/);assert.match(source,/id=`direct:\$\{otherId\}`/);assert.match(source,/activity\/.+\/read/);
  assert.match(html,/data-communications-search/);assert.match(mobile,/mobile-chat-trigger/);assert.match(mobile,/pymio-show-chat-list/);
  assert.match(source,/data-chat-back/);assert.match(source,/pymio-chat-count/);assert.match(mobileCss,/communications-shell\.is-chat-open/);assert.match(mobileCss,/mobile-network-tabs\{display:none\}/);
  assert.match(html,/data-mobile-new-chat/);assert.match(html,/data-mobile-recipient-list/);assert.match(source,/state\.connections\|\|\[\]/);assert.match(source,/isMobileMessagingViewport\(\)\)return/);
  assert.match(mobileCss,/\.pymio-chat-tray\{display:none!important\}/);assert.match(mobileCss,/communications-shell\.is-chat-open \.communications-detail\{position:fixed;inset:0/);assert.match(mobileCss,/mobile-new-chat-button/);
  assert.match(migration,/thread_id uuid/);assert.match(migration,/'private_activity'/);assert.match(migration,/operation='activity\.read'/);
  assert.match(singleConversationMigration,/GROUP BY 1,2/);assert.match(singleConversationMigration,/NEW\.subject=''/);
});

test('RED Pymio: evita bandas persistentes para confirmaciones pasivas',async()=>{
  const source=await readFile(new URL('../ecosistema.js',import.meta.url),'utf8');
  const html=await readFile(new URL('../ecosistema.html',import.meta.url),'utf8');
  assert.match(html,/data-network-live/);assert.match(html,/ecosistema-feedback" role="alert"/);
  assert.match(source,/if\(type!=='error'\)/);assert.match(source,/feedbackTimer=setTimeout\(hideFeedback,7000\)/);
  assert.match(source,/liveStatusTimer=setTimeout/);
});

test('RED Pymio: integra chats grupales protegidos para las comunidades del usuario',async()=>{
  const communityId='10000000-0000-4000-8000-000000000001',migration=await readFile(new URL('../supabase/migrations/029_community_group_chat.sql',import.meta.url),'utf8'),source=await readFile(new URL('../ecosistema.js',import.meta.url),'utf8'),css=await readFile(new URL('../ecosistema.css',import.meta.url),'utf8');
  let response,createdBody='',markedRead=false;
  const pool={createCommunityMessage:async(id,company,body)=>{assert.equal(id,communityId);assert.equal(company,'7');createdBody=body;return [{community_id:id,items:[]}]},markCommunityChatRead:async(id,company)=>{assert.equal(id,communityId);assert.equal(company,'7');markedRead=true;return []}};
  const sent=request(`/api/network/communities/${communityId}/messages`,'POST',{body:'Hola comunidad'});await atenderRedPymio(sent.req,pool,'7',(status,data)=>response={status,data},sent.url);assert.equal(response.status,201);assert.equal(createdBody,'Hola comunidad');
  const read=request(`/api/network/communities/${communityId}/messages/read`,'POST');await atenderRedPymio(read.req,pool,'7',(status,data)=>response={status,data},read.url);assert.equal(response.status,200);assert.equal(markedRead,true);
  assert.match(migration,/ENABLE ROW LEVEL SECURITY/);assert.match(migration,/REVOKE ALL[\s\S]*anon,authenticated/);assert.match(source,/data-community/);assert.match(source,/communication-thread-group/);assert.match(css,/chat-composer\{position:relative/);
});

test('RED Pymio: integra postulaciones y asistentes con la membresía de la comunidad',async()=>{
  const eventId='40000000-0000-4000-8000-000000000004',migration=await readFile(new URL('../supabase/migrations/032_community_event_participation.sql',import.meta.url),'utf8'),source=await readFile(new URL('../ecosistema.js',import.meta.url),'utf8');
  let response,registered='',removed=false;
  const pool={
    registerEventParticipation:async(id,company,type)=>{assert.equal(id,eventId);assert.equal(company,'7');registered=type;return {event_participations:[{event_id:id,own_type:type,own_status:'registered'}],membership_status:'registered'}},
    removeEventParticipation:async(id,company)=>{assert.equal(id,eventId);assert.equal(company,'7');removed=true;return {event_participations:[]}},
  };
  const apply=request(`/api/network/events/${eventId}/participation`,'POST',{type:'applicant'});await atenderRedPymio(apply.req,pool,'7',(status,data)=>response={status,data},apply.url);assert.equal(response.status,200);assert.equal(registered,'applicant');
  const cancel=request(`/api/network/events/${eventId}/participation`,'DELETE');await atenderRedPymio(cancel.req,pool,'7',(status,data)=>response={status,data},cancel.url);assert.equal(response.status,200);assert.equal(removed,true);
  assert.match(migration,/pending_membership/);assert.match(migration,/activate_event_participations_after_join/);assert.match(migration,/clear_event_participations_after_rejection/);
  for(const label of ['Postular al evento','Iré como público','Pendientes de ingreso','Público asistente'])assert.match(source,new RegExp(label));
});

test('RED Pymio: presenta chat, retención por plan y recepción en tiempo real',async()=>{
  const source=await readFile(new URL('../ecosistema.js',import.meta.url),'utf8');
  const html=await readFile(new URL('../ecosistema.html',import.meta.url),'utf8');
  const css=await readFile(new URL('../ecosistema.css',import.meta.url),'utf8');
  const server=await readFile(new URL('./red-pymio.mjs',import.meta.url),'utf8');
  const migration=await readFile(new URL('../supabase/migrations/025_message_retention.sql',import.meta.url),'utf8');
  assert.match(html,/data-message-retention/);assert.match(source,/data-chat-compose/);assert.match(source,/new EventSource/);
  assert.match(source,/pymio-chat-tray/);assert.match(source,/pending-\$\{crypto\.randomUUID\(\)\}/);assert.match(source,/threadId=form\.dataset\.thread/);assert.match(css,/pymio-chat-popup/);assert.match(css,/color:#8b6900/);assert.match(server,/text\/event-stream/);
  assert.match(source,/openFloatingChat/);assert.match(source,/pymio-floating-chat/);assert.match(source,/data-notification-thread/);assert.match(css,/floating-chat-composer/);assert.match(css,/data-open-chats="3"/);
  assert.match(server,/res\.on\?\.\('close'/);assert.doesNotMatch(server,/req\.on\?\.\('close'/);assert.match(server,/Date\.parse\(item\.created_at\)>=cursorTime/);assert.match(server,/attempt<150/);
  assert.match(migration,/interval '7 days'/);assert.match(migration,/is_pymium/);
});

test('RED Pymio: mantiene un chat por pareja y elimina el hilo completo tras siete días',async()=>{
  const source=await readFile(new URL('../ecosistema.js',import.meta.url),'utf8');
  const server=await readFile(new URL('./red-pymio.mjs',import.meta.url),'utf8');
  const migration=await readFile(new URL('../supabase/migrations/026_stable_expiring_chats.sql',import.meta.url),'utf8');
  assert.match(source,/confirmed\?returned:\[\.\.\.returned,\{\.\.\.optimistic,pending:false\}\]/);
  assert.match(source,/después de 7 días sin actividad/);
  assert.match(server,/latestByThread/);
  assert.match(migration,/keep_direct_messages_in_active_thread/);
  assert.match(migration,/HAVING max\(activity\.created_at\) >= now\(\) - interval '7 days'/);
  assert.match(migration,/HAVING max\(expired\.created_at\) < now\(\) - interval '7 days'/);
  assert.doesNotMatch(migration,/is_pymium/);
});

test('RED Pymio: al unirse reemplaza el botón por Miembro - Usuario',async()=>{
  const source=await readFile(new URL('../ecosistema.js',import.meta.url),'utf8');
  assert.match(source,/item\.joined\?[\s\S]*Miembro - Usuario[\s\S]*data-community-join/);
});

test('RED Pymio: consulta una comunidad y crea formularios de hasta 20 preguntas',async()=>{
  const id='10000000-0000-4000-8000-000000000001';
  const detail=await call(`/api/network/communities/${id}`,'GET');
  assert.equal(detail.response.status,200);assert.deepEqual(detail.calls.map(call=>call.operation),['bootstrap','detail']);
  const created=await call('/api/network/forms','POST',{communityId:id,title:'Registro de proveedores',questions:[{title:'Razón social',type:'text'},{title:'Documento',type:'file',options:['text','pdf']}]});
  assert.equal(created.response.status,201);assert.equal(created.calls[0].operation,'form.create');assert.equal(created.calls[0].payload.questions.length,2);
  assert.deepEqual(created.calls[0].payload.questions.map(item=>item.position),[1,2]);
  assert.deepEqual(created.calls[0].payload.questions[1].options,['text','pdf']);
  assert.equal((await call('/api/network/forms','POST',{communityId:id,title:'Inválido',questions:[{title:'Documento',type:'file',options:[]}]})).response.status,400);
});

test('RED Pymio: valida la extensión configurada y el contenido del archivo',async()=>{
  const formId='10000000-0000-4000-8000-000000000001',responseId='20000000-0000-4000-8000-000000000002',questionId='30000000-0000-4000-8000-000000000003';
  const upload=async(name,body,options=['pdf'])=>{const req=Readable.from([body]);req.method='POST';req.headers={'x-file-name':encodeURIComponent(name),'content-type':'application/octet-stream'};let response,stored;const pool={community:async()=>({forms:[{status:'open',questions:[{id:questionId,type:'file',options}]}]}),getCommunityFormMeta:async()=>({created_by_company_id:'8'}),uploadCommunityFile:async(path,value)=>stored={path,value}};await atenderRedPymio(req,pool,'7',(status,data)=>response={status,data},new URL(`http://localhost/api/network/forms/${formId}/responses/${responseId}/questions/${questionId}/file`));return {response,stored};};
  assert.equal((await upload('respuesta.txt',Buffer.from('texto'))).response.status,415);
  assert.equal((await upload('respuesta.pdf',Buffer.from('no es pdf'))).response.status,415);
  const valid=await upload('respuesta.pdf',Buffer.from('%PDF-1.4\n%%EOF'));
  assert.equal(valid.response.status,201);assert.equal(valid.response.data.mimeType,'application/pdf');assert.ok(valid.stored.path.endsWith('.bin'));
  const heic=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftypheic'),Buffer.alloc(12)]),heif=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftypmif1'),Buffer.alloc(12)]);
  const validHeic=await upload('foto.heic',heic,['image']),validHeif=await upload('foto.heif',heif,['image']);
  assert.equal(validHeic.response.status,201);assert.equal(validHeic.response.data.mimeType,'image/heic');assert.equal(validHeic.response.data.compressed,false);
  assert.equal(validHeif.response.status,201);assert.equal(validHeif.response.data.mimeType,'image/heif');assert.equal((await upload('foto.heic',Buffer.from('no es una imagen'),['image'])).response.status,415);
});

test('RED Pymio: actualiza la respuesta existente y bloquea cambios al cerrar el formulario',async()=>{
  const formId='10000000-0000-4000-8000-000000000001',incomingId='20000000-0000-4000-8000-000000000002',existingId='20000000-0000-4000-8000-000000000009',questionId='30000000-0000-4000-8000-000000000003';
  const submit=async status=>{
    const input=request(`/api/network/forms/${formId}/responses`,'POST',{responseId:incomingId,answers:[{questionId,textValue:'Respuesta modificada'}]}),calls=[],existing={id:existingId,answers:[{question_id:questionId,text_value:'Respuesta anterior'}]};let response;
    const pool={
      community:async()=>({forms:[{id:formId,status}]}),
      getCommunityFormMeta:async()=>({created_by_company_id:'8'}),
      getCommunityFormResponse:async()=>{calls.push('get');return existing;},
      saveCommunityFormResponse:async(...args)=>{calls.push(args);return {id:args[2],submittedAt:'2026-10-21T12:00:00Z',previousFiles:[]};},
      deleteCommunityFile:async()=>{}
    };
    await atenderRedPymio(input.req,pool,'7',(code,data)=>response={status:code,data},input.url);
    return {response,calls};
  };
  const open=await submit('open');
  assert.equal(open.response.status,200);assert.equal(open.response.data.updated,true);assert.equal(open.response.data.response.id,existingId);
  assert.equal(open.calls[1][2],existingId);assert.equal(open.calls[1][4].id,existingId);
  const closed=await submit('closed');
  assert.equal(closed.response.status,403);assert.deepEqual(closed.calls,[]);
});

test('RED Pymio: limita cada respuesta de texto a 5.000 caracteres',async()=>{
  const formId='10000000-0000-4000-8000-000000000001',responseId='20000000-0000-4000-8000-000000000002',questionId='30000000-0000-4000-8000-000000000003';let response,saved;
  const submit=async textValue=>{const input=request(`/api/network/forms/${formId}/responses`,'POST',{responseId,answers:[{questionId,textValue}]});response=undefined;saved=undefined;await atenderRedPymio(input.req,{community:async()=>({forms:[{id:formId,status:'open'}]}),getCommunityFormMeta:async()=>({created_by_company_id:'8'}),getCommunityFormResponse:async()=>null,saveCommunityFormResponse:async(...args)=>{saved=args[3];return {id:responseId,submittedAt:'2026-10-22T12:00:00Z',previousFiles:[]};}},'7',(status,data)=>response={status,data},input.url);};
  await submit('a'.repeat(5000));assert.equal(response.status,200);assert.equal(saved[0].text_value.length,5000);
  await submit('a'.repeat(5001));assert.equal(response.status,400);assert.match(response.data.error,/5\.000 caracteres/);assert.equal(saved,undefined);
});

test('RED Pymio: el creador no puede responder y solo administradores pueden eliminar',async()=>{
  const formId='10000000-0000-4000-8000-000000000001',responseId='20000000-0000-4000-8000-000000000002',questionId='30000000-0000-4000-8000-000000000003';let response,saved=false;
  const submission=request(`/api/network/forms/${formId}/responses`,'POST',{responseId,answers:[{questionId,textValue:'No debe guardarse'}]});
  await atenderRedPymio(submission.req,{community:async()=>({forms:[{id:formId,status:'open'}]}),getCommunityFormMeta:async()=>({created_by_company_id:'7'}),saveCommunityFormResponse:async()=>{saved=true;}},'7',(status,data)=>response={status,data},submission.url);
  assert.equal(response.status,403);assert.match(response.data.error,/creó el formulario/);assert.equal(saved,false);
  const deletion=request(`/api/network/forms/${formId}`,'DELETE'),calls=[],pool={deleteCommunityForm:async(id,company)=>{calls.push({id,company});return {communityId:'40000000-0000-4000-8000-000000000004'};},community:async(operation,company,payload)=>{calls.push({operation,company,payload});return {community:{id:payload.community_id},forms:[]};}};
  await atenderRedPymio(deletion.req,pool,'7',(status,data)=>response={status,data},deletion.url);
  assert.equal(response.status,200);assert.equal(response.data.forms.length,0);assert.equal(calls[0].id,formId);assert.equal(calls[1].operation,'detail');
});

test('RED Pymio: administradores pueden cerrar y volver a abrir formularios',async()=>{
  const formId='10000000-0000-4000-8000-000000000001',calls=[];
  for(const action of ['close','open']){
    const input=request(`/api/network/forms/${formId}/${action}`,'POST');let response;
    const pool={setCommunityFormStatus:async(id,company,status)=>{calls.push({id,company,status});return {forms:[{id,status}]};}};
    await atenderRedPymio(input.req,pool,'7',(status,data)=>response={status,data},input.url);
    assert.equal(response.status,200);assert.equal(response.data.forms[0].status,action==='open'?'open':'closed');
  }
  assert.deepEqual(calls.map(call=>call.status),['closed','open']);
});

test('RED Pymio: exige membresía para ver incluso una comunidad abierta',async()=>{
  const id='10000000-0000-4000-8000-000000000001';
  const result={profile:{},businesses:[],communities:[{id,is_open:true,joined:false,owned:false}],posts:[]};
  const detail=await call(`/api/network/communities/${id}`,'GET',undefined,result);
  assert.equal(detail.response.status,403);
  assert.match(detail.response.data.error,/Debes unirte/);
  assert.deepEqual(detail.calls.map(item=>item.operation),['bootstrap']);
});

test('RED Pymio: los formularios y eventos no se cierran al pulsar el fondo ni Escape',async()=>{
  const source=await readFile(new URL('../ecosistema.js',import.meta.url),'utf8');
  const html=await readFile(new URL('../ecosistema.html',import.meta.url),'utf8');
  const server=await readFile(new URL('./red-pymio.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/<span>Pregunta<\/span>/);
  assert.match(source,/Escribe cada opción en una línea separada\./);
  assert.match(source,/data-text-preview/);assert.match(source,/data-file-preview/);
  for(const label of ['Archivo de texto','Documento PDF','Imagen'])assert.match(source,new RegExp(label));
  for(const extensions of ['docx','txt','pdf','jpg','png','webp','heic','heif'])assert.match(source,new RegExp(extensions));
  assert.match(source,/help:'Acepta \.jpg, \.png, \.webp, \.heic y \.heif'/);
  assert.match(source,/\. Máximo 2,5 MB por archivo\./);
  assert.match(source,/No pudmos leer la imagen seleccionada, intenta en otro navegador/);
  assert.match(source,/fileAccept\(question\)/);assert.match(server,/FILE_GROUPS/);
  assert.match(html,/Descargar respuestas/);
  assert.match(source,/downloadName=`Respuestas Formulario - \$\{safeTitle\}\.zip`/);
  assert.match(source,/setAttribute\('download',downloadName\)/);
  assert.match(source,/replace\(\/\[<>:/);
  assert.match(server,/downloadName=`Respuestas Formulario - \$\{safeName\(data\.form\.title\)\}\.zip`/);
  assert.doesNotMatch(server,/filename="respuestas\.zip"/i);
  assert.match(source,/backdropLockedDialogs=new Set\(\['community-form-builder','community-form-view','post-dialog'\]\)/);
  assert.match(source,/manualCloseOnlyDialogs=new Set\(\['community-form-view','post-dialog'\]\)/);
  assert.match(source,/event\.target===dialog&&!backdropLockedDialogs\.has\(dialog\.id\)/);
  assert.match(source,/manualCloseOnlyDialogs\.has\(dialog\.id\).*addEventListener\('cancel',event=>event\.preventDefault\(\)\)/);
  const eventDialog=html.match(/<dialog class="network-dialog" id="post-dialog">[\s\S]*?<\/dialog>/)?.[0]||'';assert.match(eventDialog,/class="dialog-close" data-dialog-close aria-label="Cerrar"/);assert.doesNotMatch(eventDialog,/>Cancelar</);
  assert.match(source,/Ya respondiste este formulario\. Puedes modificar tu respuesta mientras siga abierto\./);
  assert.match(source,/Guardar cambios/);
  assert.match(source,/El formulario está cerrado y ya no puede modificarse/);
  assert.match(source,/Creaste este formulario\. Puedes revisar sus resultados, pero no enviar una respuesta\./);
  assert.match(source,/selectDisabled=editable\|\|creator/);
  assert.doesNotMatch(source,/Vista de las opciones disponibles\. No se enviará ninguna respuesta\./);
  assert.match(source,/data-form-delete/);assert.match(source,/¿Eliminar el formulario/);assert.match(source,/Reanudar formulario/);
  assert.match(source,/next==='close'\?'Pausando…':'Reanudando…'/);
  assert.match(html,/data-form-download[^>]*>.*Descargar respuestas<\/span><\/button><button[^>]*data-form-status/s);
  assert.match(html,/data-form-status[^>]*>.*Pausar formulario<\/span><\/button><button[^>]*data-form-delete/s);
  assert.match(source,/submit\.hidden=!editable/);
  assert.match(source,/Archivo actual:/);
  assert.match(source,/maxlength="5000" data-text-answer/);assert.match(source,/data-text-count/);assert.match(source,/addEventListener\('input',updateCounter\)/);assert.match(source,/5\.000 caracteres/);
  assert.match(source,/activeResponse\?\.id\|\|crypto\.randomUUID/);
  assert.match(server,/updated:Boolean\(existing\)/);
  assert.match(server,/textValue\?\?''\)\.length>5000/);assert.match(server,/text\(answer\.textValue,5000\)/);
  assert.match(server,/exportResponses/);
});

test('RED Pymio: el estado de carga conserva el marcado del botón de formulario',async()=>{
  const source=await readFile(new URL('../ecosistema.js',import.meta.url),'utf8');
  assert.match(source,/buttonContent\.set\(button,button\.innerHTML\)/);
  assert.match(source,/button\.innerHTML=buttonContent\.get\(button\)/);
  assert.match(source,/data-form-delete[^\n]+finally\{setBusy\(button,false\);\}/);
  assert.match(source,/buttonContent\.delete\(deleteButton\);deleteButton\.disabled=false;deleteButton\.innerHTML=.*<span>Eliminar<\/span>/);
  assert.match(source,/finally\{setBusy\(button,false\);\}if\(updated\)\{activeCommunity=updated;activeForm=null/);
  assert.doesNotMatch(source,/button\.dataset\.label=button\.textContent/);
});

test('RED Pymio: la campana actualiza y abre formularios o eventos comunitarios',async()=>{
  const app=await readFile(new URL('../app.js',import.meta.url),'utf8'),ecosistema=await readFile(new URL('../ecosistema.js',import.meta.url),'utf8');
  assert.match(app,/\/api\/network\/notifications/);assert.match(app,/setInterval\(refreshNetworkNotifications,45000\)/);
  assert.match(app,/Nuevo formulario en/);assert.match(app,/Nuevo evento en/);assert.match(app,/Evento modificado en/);assert.match(app,/Evento eliminado en/);
  assert.match(app,/resourceId:item\.resource_id/);assert.match(app,/red-pymio-notification-open/);assert.match(ecosistema,/openCommunityForm/);assert.match(ecosistema,/data-community-event-id/);
  assert.match(ecosistema,/Este evento fue eliminado\. Estás viendo la agenda actual/);
  assert.match(ecosistema,/red-pymio-actualizado/);
});

test('RED Pymio: persiste notificaciones comunitarias para todos los miembros',async()=>{
  const migration=await readFile(new URL('../supabase/migrations/029_persistent_community_notifications.sql',import.meta.url),'utf8');
  assert.match(migration,/CREATE TABLE IF NOT EXISTS public\.community_notifications/);
  assert.match(migration,/AFTER INSERT OR UPDATE OR DELETE ON public\.network_posts/);
  assert.match(migration,/FROM public\.community_members m WHERE m\.community_id=source\.community_id/);
  assert.match(migration,/event_created/);assert.match(migration,/event_updated/);assert.match(migration,/event_deleted/);assert.match(migration,/form_created/);
});

test('RED Pymio: la campana informa cambios de permisos administrativos',async()=>{
  const app=await readFile(new URL('../app.js',import.meta.url),'utf8'),supabase=await readFile(new URL('./supabase.mjs',import.meta.url),'utf8');
  assert.match(supabase,/role_since/);assert.match(supabase,/admin_granted/);assert.match(supabase,/admin_revoked/);
  assert.match(app,/Ahora eres administrador en/);assert.match(app,/Ya no eres administrador en/);
  assert.match(app,/Tus permisos de administrador fueron retirados/);
});

test('RED Pymio: crea eventos con duración diaria, semanal, mensual o personalizada',async()=>{
  const source=await readFile(new URL('../ecosistema.js',import.meta.url),'utf8'),html=await readFile(new URL('../ecosistema.html',import.meta.url),'utf8'),pilot=await readFile(new URL('../piloto.html',import.meta.url),'utf8');
  assert.match(html,/data-community-event-create[\s\S]*?Crear Evento/);assert.doesNotMatch(html,/data-post-create/);
  assert.match(html,/name="duration" required/);for(const option of ['day','week','month','custom'])assert.match(html,new RegExp(`value="${option}"`));assert.match(html,/data-end-field hidden/);assert.doesNotMatch(html,/name="kind" value="benefit"/);
  assert.match(html,/Fecha y Hora de Inicio/);
  assert.match(source,/eventDurationForPost/);assert.match(source,/duration!=='custom'/);assert.match(source,/Solo los administradores pueden crear eventos/);
  assert.match(source,/eventIsActive/);assert.match(source,/scheduleEventExpiryRefresh/);
  assert.match(source,/data-community-event-edit/);assert.match(source,/data-community-event-delete/);
  assert.match(source,/Solo los administradores pueden modificar eventos/);assert.match(source,/Solo los administradores pueden eliminar eventos/);
  assert.match(html,/Eventos de Comunidades/);assert.match(html,/Explorar Tiendas/);assert.match(pilot,/Eventos de Comunidades/);assert.match(pilot,/Explorar Tiendas/);
});

test('RED Pymio: eventos incluyen modalidad, mapa, asistencia opcional e interacción por membresía',async()=>{
  const source=await readFile(new URL('../ecosistema.js',import.meta.url),'utf8'),html=await readFile(new URL('../ecosistema.html',import.meta.url),'utf8'),css=await readFile(new URL('../ecosistema.css',import.meta.url),'utf8'),server=await readFile(new URL('./red-pymio.mjs',import.meta.url),'utf8'),sql=await readFile(new URL('../supabase/migrations/035_community_event_details_and_attendance.sql',import.meta.url),'utf8'),attendanceSql=await readFile(new URL('../supabase/migrations/037_optional_event_attendance.sql',import.meta.url),'utf8');
  for(const label of ['Online','Presencial','Ambos','Me interesa','Asistiré','No asistiré'])assert.match(html+source,new RegExp(label));assert.match(html,/Dirección específica \(opcional\)/);
  assert.doesNotMatch(html,/Aún no responden|data-event-pending/);assert.doesNotMatch(source,/data-event-pending|attendance\?\.pending/);
  assert.match(html,/name="eventMode" required/);assert.match(html,/name="requestAttendance" type="checkbox"/);assert.match(html,/Solicitar asistencia a los miembros/);assert.match(html,/data-event-location-map/);assert.match(source,/requestAttendance\.checked=Boolean\(post\.request_attendance\)/);assert.match(source,/requestAttendance\.checked=false/);assert.match(source,/eventMap\.on\('click'/);assert.match(source,/eventExcerpt\(item\.description\)/);assert.match(source,/data-event-open/);assert.match(source,/interestedCount/);assert.match(source,/requestsAttendance=Boolean\(event\.request_attendance\)/);assert.match(source,/member-row event-attendee/);assert.match(css,/#post-dialog \.community-access\{align-items:center\}/);assert.match(css,/input\[name="requestAttendance"\]\{flex:0 0 16px;width:16px;height:16px;min-height:0;margin:0;padding:0\}/);assert.match(css,/\.event-response-actions :is\(\.btn,\.btn-outline\)\{font:650 12px 'IBM Plex Sans',sans-serif\}/);assert.match(css,/\.event-attendance\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);assert.match(css,/\.event-attendance \.event-attendee\{padding:14px 12px;border:1px solid var\(--line\);border-radius:11px;background:#fff\}/);
  assert.match(server,/getCommunityEventDetail/);assert.match(server,/setCommunityEventResponse/);assert.match(sql,/event_mode IN \('online','in_person','hybrid'\)/);assert.match(sql,/community_event_responses/);assert.match(sql,/status IN \('interested','attending','not_attending'\)/);
  assert.match(sql,/NOTIFY pgrst, 'reload schema'/);assert.match(server,/request_attendance:\[true,'true','on','1'\]\.includes\(data\.requestAttendance\)/);assert.match(attendanceSql,/request_attendance boolean NOT NULL DEFAULT false/);assert.match(attendanceSql,/NOTIFY pgrst, 'reload schema'/);
});

test('RED Pymio: los resultados no muestran la aclaración por empresa',async()=>{
  const source=await readFile(new URL('../ecosistema.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/una respuesta por empresa/);
  assert.doesNotMatch(source,/Porcentajes sobre el total de participantes/);
  assert.match(source,/usuarios han respondido\.<\/p>/);
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
  const closed=await call(`/api/network/communities/${id}/profile`,'PUT',{name:'Comunidad Comercio Local',description:'Descripción',isOpen:false});
  assert.equal(closed.response.status,200);assert.equal(closed.calls[0].payload.is_open,false);
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
  assert.match(source,/item\.owned&&!item\.is_open&&requests\.length/);
  assert.match(source,/pane==='requests'&&\(!canAdmin\(\)\|\|isOpenCommunity\(\)\)/);
  assert.match(source,/data-community-request-metric[^\n]+\.hidden=!canAdmin\(\)\|\|openCommunity/);
  assert.match(source,/canAdmin\(\)&&!openCommunity&&requests\.length/);
});

test('RED Pymio: la comunidad permite editar marca, redes y administradores',async()=>{
  const source=await readFile(new URL('../ecosistema.js',import.meta.url),'utf8');
  const html=await readFile(new URL('../ecosistema.html',import.meta.url),'utf8');
  const css=await readFile(new URL('../ecosistema.css',import.meta.url),'utf8');
  for(const label of ['Editar comunidad','Foto de perfil','Banner de la comunidad','Sitio web','Instagram','YouTube','TikTok','Facebook','LinkedIn'])assert.match(html,new RegExp(label));
  assert.match(html,/id="community-edit-dialog"/);assert.match(html,/data-community-edit-form/);
  assert.match(source,/communityImageUrl/);assert.match(source,/uploadCommunityImage/);assert.match(source,/communities\/\$\{community\.id\}\/profile/);
  assert.match(source,/mayChangeRole=canAdmin\(\)&&item\.role!==['"]owner['"]&&!isSelf/);
  assert.match(css,/\.profile-media-card:not\(\.banner-media-card\) \.profile-media-copy\{display:flex;align-self:stretch;flex-direction:column;justify-content:center\}/);
  assert.match(css,/\.media-remove\{display:inline-flex;align-items:center;align-self:flex-start;gap:6px/);
  assert.match(css,/\.media-remove input\{width:14px!important;height:14px;min-height:0!important;margin:0;padding:0!important/);
  assert.match(css,/\.community-manager-badges\{display:flex;flex-wrap:wrap;gap:6px;margin:2px 0 31px\}/);
});

test('RED Pymio: los miembros no creadores pueden salirse con confirmación',async()=>{
  const source=await readFile(new URL('../ecosistema.js',import.meta.url),'utf8'),html=await readFile(new URL('../ecosistema.html',import.meta.url),'utf8'),css=await readFile(new URL('../ecosistema.css',import.meta.url),'utf8');
  assert.match(html,/data-community-share[\s\S]+data-community-leave hidden/);assert.match(html,/Salirse de la Comunidad/);assert.match(html,/M6 6l12 12M18 6 6 18/);
  assert.match(source,/community\.role==='owner'/);assert.match(source,/confirm\(`¿Quieres salirte de/);assert.match(source,/\/api\/network\/communities\/leave',\{method:'POST',body:JSON\.stringify\(\{communityId:community\.id\}\)\}/);assert.match(source,/Saliendo…/);
  assert.match(css,/#tab-ecosistema \.community-sidebar-actions \.community-leave-button,#tab-ecosistema \.form-view-actions \.form-delete-button\{border-color:#9f3028;background:#b13c32;color:#fff;font-weight:650\}/);
});

test('Interfaz: todas las equis de cierre quedan centradas',async()=>{
  const [ecosystemCss,dashboardCss,pymioCss,mobileCss]=await Promise.all([
    readFile(new URL('../ecosistema.css',import.meta.url),'utf8'),
    readFile(new URL('../dashboard.css',import.meta.url),'utf8'),
    readFile(new URL('../pymio.css',import.meta.url),'utf8'),
    readFile(new URL('../mobile.css',import.meta.url),'utf8')
  ]);
  assert.match(ecosystemCss,/\.dialog-close\{display:inline-flex;align-items:center;justify-content:center;[^}]*padding:0;[^}]*line-height:1;text-align:center/);
  assert.match(ecosystemCss,/\.chat-popup-close\{[^}]*display:inline-flex;align-items:center;justify-content:center;[^}]*padding:0;[^}]*line-height:1;text-align:center/);
  assert.match(dashboardCss,/\.dialog-close\{display:grid;place-items:center;[^}]*padding:0;[^}]*line-height:1;text-align:center/);
  assert.match(pymioCss,/\.account-dialog-close\{[^}]*display:grid;place-items:center;[^}]*padding:0;[^}]*line-height:1;text-align:center/);
  assert.match(mobileCss,/\.mobile-sheet-head>button\{display:grid;place-items:center;[^}]*padding:0;[^}]*line-height:1;text-align:center/);
  assert.match(mobileCss,/\.mobile-dialog-dismiss,\.dialog-close,\.account-dialog-close\{display:grid;place-items:center;[^}]*padding:0;[^}]*line-height:1;text-align:center/);
});

test('RED Pymio: solo el creador puede quitar administradores y el cambio se notifica',async()=>{
  const sql=await readFile(new URL('../supabase/migrations/024_community_roles_and_notifications.sql',import.meta.url),'utf8');
  const source=await readFile(new URL('../ecosistema.js',import.meta.url),'utf8');
  const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
  assert.match(sql,/NOT is_admin AND target_role='admin' AND actor_role<>'owner'/);
  assert.match(sql,/INSERT INTO public\.community_role_notifications/);
  assert.match(source,/item\.role!=='admin'\|\|isCommunityOwner\(\)/);
  assert.match(app,/Ahora eres administrador/);
  assert.match(app,/Ya no eres administrador/);
});

test('RED Pymio: el perfil enumera comunidades creadas y administradas',async()=>{
  const sql=await readFile(new URL('../supabase/migrations/024_community_roles_and_notifications.sql',import.meta.url),'utf8');
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

test('RED Pymio: la base de datos limita las respuestas nuevas de texto a 5.000 caracteres',async()=>{
  const sql=await readFile(new URL('../supabase/migrations/036_reduce_form_text_answer_limit.sql',import.meta.url),'utf8');
  assert.match(sql,/char_length\(text_value\) <= 5000/);assert.match(sql,/NOT VALID/);
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
