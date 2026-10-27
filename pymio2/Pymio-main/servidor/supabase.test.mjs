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
  await assert.rejects(offline.rpc('product.list',1),{status:503,message:'No se pudo conectar con el servidor. Reintenta cuando vuelva la conexión.'});
});

test('Supabase: obtiene una firma ligera para sincronización empresarial',async()=>{
  let sent;
  const expected={products:[3,'2026-10-22T12:00:00Z'],movements:[8,'2026-10-22T12:01:00Z','',4]};
  const client=createSupabase({url:'https://example.supabase.co',key:'secret',fetchImpl:async(url,options)=>{sent={url,options};return Response.json(expected);}});
  assert.deepEqual(await client.liveVersion('7'),expected);
  assert.equal(sent.url.pathname,'/rest/v1/rpc/pymio_live_version');
  assert.equal(sent.options.method,'POST');
  assert.deepEqual(JSON.parse(sent.options.body),{target_company:'7'});
});

test('Supabase Auth: crea usuarios y vincula su empresa usando solo la clave del servidor', async()=>{
  const calls=[];
  const client=createSupabase({url:'https://example.supabase.co',key:'sb_secret_test',fetchImpl:async(url,options)=>{calls.push({url,options});if(url.pathname.includes('/admin/users'))return Response.json({id:'user-1',email:'pyme@example.com'});if(url.pathname.endsWith('/pymio_register_account'))return Response.json({company_id:9,business_name:'Mi Pyme',owner_name:'Ana'});return Response.json({user:{id:'user-1',email:'pyme@example.com'}});}});
  const user=await client.createAuthUser('pyme@example.com','segura123',{business_name:'Mi Pyme'});
  const account=await client.registerAccount(user.id,user.email,'Mi Pyme','Ana');
  assert.equal(account.company_id,9);assert.equal(calls[0].options.headers.Authorization,'Bearer sb_secret_test');
  assert.equal(calls[0].url.pathname,'/auth/v1/admin/users');assert.equal(calls[1].url.pathname,'/rest/v1/rpc/pymio_register_account');
  assert.equal(JSON.parse(calls[0].options.body).app_metadata.pymio_password_set,true);
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

test('Supabase Auth: envía recuperación y actualiza la contraseña con el token del usuario',async()=>{
  const calls=[];
  const client=createSupabase({url:'https://example.supabase.co',key:'sb_secret_test',fetchImpl:async(url,options)=>{calls.push({url,options});if(url.pathname.includes('/admin/users/'))return Response.json({app_metadata:{providers:['email']},identities:[]});return Response.json({});}});
  assert.equal(await client.authUserHasPassword('user-1'),true);
  await client.sendPasswordRecovery('ana@example.com','https://pymio.cl/piloto.html?password_recovery=1');
  await client.resetAuthUserPassword('recovery-token-1234567890','nueva-segura');
  assert.equal(calls[1].url.pathname,'/auth/v1/recover');assert.equal(calls[1].url.searchParams.get('redirect_to'),'https://pymio.cl/piloto.html?password_recovery=1');
  assert.deepEqual(JSON.parse(calls[1].options.body),{email:'ana@example.com'});
  assert.equal(calls[2].url.pathname,'/auth/v1/user');assert.equal(calls[2].options.headers.Authorization,'Bearer recovery-token-1234567890');
  assert.deepEqual(JSON.parse(calls[2].options.body),{password:'nueva-segura'});
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
  const sent=[],postId='10000000-0000-4000-8000-000000000001',communityId='20000000-0000-4000-8000-000000000002';
  const client=createSupabase({url:'https://example.supabase.co',key:'sb_secret_test',fetchImpl:async(url,options)=>{sent.push({url,options});if(url.pathname.endsWith('/community_members'))return Response.json([{role:'admin'}]);if(url.pathname.endsWith('/network_posts')&&(!options.method||options.method==='GET'))return Response.json([{id:postId,community_id:communityId}]);if(url.pathname.endsWith('/network_posts'))return Response.json([{id:postId}]);return Response.json({profile:{},businesses:[],communities:[],posts:[]});}});
  const result=await client.network('bootstrap','12');
  assert.deepEqual(result.communities,[]);assert.deepEqual(sent.slice(-4).map(item=>item.url.pathname),['/rest/v1/rpc/pymio_network','/rest/v1/rpc/pymio_connections','/rest/v1/rpc/pymio_entitlements','/rest/v1/rpc/pymio_community_roles']);
  assert.deepEqual(JSON.parse(sent.at(-4).options.body),{operation:'bootstrap',company:'12',payload:{}});
  assert.deepEqual(JSON.parse(sent.at(-1).options.body),{company:'12'});
  await client.network('post.update','12',{post_id:postId,community_id:communityId,kind:'event',title:'Nuevo título'});
  const update=sent.at(-2);assert.equal(update.url.pathname,'/rest/v1/network_posts');assert.equal(update.options.method,'PATCH');
  assert.equal(update.url.searchParams.get('community_id'),`eq.${communityId}`);
  assert.deepEqual(JSON.parse(update.options.body),{community_id:communityId,kind:'event',title:'Nuevo título'});
  await client.network('post.delete','12',{post_id:postId});
  const deletion=sent.at(-2);assert.equal(deletion.url.pathname,'/rest/v1/network_posts');assert.equal(deletion.options.method,'DELETE');assert.equal(deletion.url.searchParams.get('community_id'),`eq.${communityId}`);
});

test('Supabase RED Pymio: reintenta editar eventos mientras se actualiza el caché de columnas',async()=>{
  const calls=[],postId='10000000-0000-4000-8000-000000000001',communityId='20000000-0000-4000-8000-000000000002';let patchCount=0;
  const client=createSupabase({url:'https://example.supabase.co',key:'secret',fetchImpl:async(url,options={})=>{
    calls.push({url,options});
    if(url.pathname.endsWith('/community_members'))return Response.json([{role:'admin'}]);
    if(url.pathname.endsWith('/network_posts')&&options.method==='PATCH'){
      patchCount++;if(patchCount===1)return Response.json({code:'PGRST204',message:"Could not find the 'event_mode' column of 'network_posts' in the schema cache"},{status:400});
      return Response.json([{id:postId,community_id:communityId}]);
    }
    if(url.pathname.endsWith('/network_posts'))return Response.json([{id:postId,community_id:communityId}]);
    return Response.json({posts:[],communities:[],businesses:[]});
  }});
  await client.network('post.update',7,{post_id:postId,community_id:communityId,kind:'event',title:'Actualizado',event_mode:'hybrid',request_attendance:true,latitude:-33.45,longitude:-70.66});
  const patches=calls.filter(call=>call.url.pathname.endsWith('/network_posts')&&call.options.method==='PATCH');
  assert.equal(patches.length,2);assert.equal(JSON.parse(patches[0].options.body).event_mode,'hybrid');assert.equal(JSON.parse(patches[0].options.body).request_attendance,true);assert.equal('event_mode' in JSON.parse(patches[1].options.body),false);assert.equal('request_attendance' in JSON.parse(patches[1].options.body),false);
});

test('Supabase RED Pymio: protege los listados de asistencia y valida respuestas al evento',async()=>{
  const eventId='10000000-0000-4000-8000-000000000001',communityId='20000000-0000-4000-8000-000000000002',calls=[];
  const fetchImpl=async(url,options={})=>{calls.push({url,options});
    if(url.pathname.endsWith('/network_posts'))return Response.json([{id:eventId,community_id:communityId,title:'Feria',description:'Descripción completa',event_mode:'hybrid',request_attendance:true,location:'Centro',latitude:-33.45,longitude:-70.66,event_at:'2026-11-02T18:00:00Z',expires_at:null}]);
    if(url.pathname.endsWith('/communities'))return Response.json([{id:communityId,name:'Comercio Local'}]);
    if(url.pathname.endsWith('/community_event_responses'))return options.method==='POST'?Response.json({}):Response.json([{company_id:7,status:'attending'},{company_id:9,status:'interested'}]);
    if(url.pathname.endsWith('/community_members'))return url.searchParams.has('company_id')?Response.json([{company_id:7,role:'member'}]):Response.json([{company_id:7,role:'member'},{company_id:8,role:'member'}]);
    if(url.pathname.endsWith('/user_accounts'))return Response.json([{company_id:7,owner_name:'Ana',business_name:'A'},{company_id:8,owner_name:'Luis',business_name:'B'}]);
    if(url.pathname.endsWith('/business_profiles'))return Response.json([]);return Response.json([]);
  };
  const client=createSupabase({url:'https://example.supabase.co',key:'secret',fetchImpl}),detail=await client.getCommunityEventDetail(eventId,7);
  assert.equal(detail.isMember,true);assert.equal(detail.interestedCount,1);assert.deepEqual(detail.attendance.attending.map(item=>item.name),['Ana']);assert.deepEqual(detail.attendance.pending.map(item=>item.name),['Luis']);
  const saved=await client.setCommunityEventResponse(eventId,7,'not_attending');assert.equal(saved.isMember,true);assert.ok(calls.some(call=>call.url.pathname.endsWith('/community_event_responses')&&call.options.method==='POST'));
  const outsiderCalls=[],outsider=createSupabase({url:'https://example.supabase.co',key:'secret',fetchImpl:async(url)=>{outsiderCalls.push(url.pathname);if(url.pathname.endsWith('/network_posts'))return Response.json([{id:eventId,community_id:communityId,title:'Feria',description:'Completa',event_mode:'online',event_at:'2026-11-02T18:00:00Z'}]);if(url.pathname.endsWith('/communities'))return Response.json([{id:communityId,name:'Comercio Local'}]);if(url.pathname.endsWith('/community_members'))return Response.json([]);if(url.pathname.endsWith('/community_event_responses'))return Response.json([]);return Response.json({});}});
  const publicDetail=await outsider.getCommunityEventDetail(eventId,10);assert.equal(publicDetail.isMember,false);assert.equal('attendance' in publicDetail,false);assert.equal(outsiderCalls.includes('/rest/v1/user_accounts'),false);await assert.rejects(outsider.setCommunityEventResponse(eventId,10,'attending'),{status:403});
});

test('Supabase RED Pymio: oculta y bloquea la asistencia cuando el evento no la solicita',async()=>{
  const eventId='10000000-0000-4000-8000-000000000001',communityId='20000000-0000-4000-8000-000000000002',calls=[];
  const client=createSupabase({url:'https://example.supabase.co',key:'secret',fetchImpl:async(url)=>{calls.push(url.pathname);if(url.pathname.endsWith('/network_posts'))return Response.json([{id:eventId,community_id:communityId,title:'Feria',description:'Descripción',event_mode:'online',request_attendance:false,event_at:'2026-11-02T18:00:00Z'}]);if(url.pathname.endsWith('/communities'))return Response.json([{id:communityId,name:'Comercio Local'}]);if(url.pathname.endsWith('/community_members'))return Response.json([{company_id:7,role:'member'}]);if(url.pathname.endsWith('/community_event_responses'))return Response.json([]);return Response.json([]);}});
  const detail=await client.getCommunityEventDetail(eventId,7);assert.equal(detail.isMember,true);assert.equal(detail.event.request_attendance,false);assert.equal('attendance' in detail,false);assert.equal(calls.includes('/rest/v1/user_accounts'),false);
  await assert.rejects(client.setCommunityEventResponse(eventId,7,'attending'),{status:403,message:'Este evento no solicita confirmación de asistencia.'});
});

test('Supabase RED Pymio: los eventos vencidos dejan de estar disponibles',async()=>{
  const eventId='10000000-0000-4000-8000-000000000001',communityId='20000000-0000-4000-8000-000000000002',calls=[];
  const client=createSupabase({url:'https://example.supabase.co',key:'secret',fetchImpl:async(url,options={})=>{calls.push({url,options});return url.pathname.endsWith('/network_posts')?Response.json([{id:eventId,community_id:communityId,event_at:'2020-01-01T00:00:00Z',expires_at:'2020-01-02T00:00:00Z'}]):Response.json([]);}});
  await assert.rejects(client.getCommunityEventDetail(eventId,7),{status:404,message:'El evento ya terminó y no está disponible.'});
  assert.equal(calls.at(-1).options.method,'DELETE');assert.equal(calls.at(-1).url.searchParams.get('id'),`eq.${eventId}`);
});

test('Supabase RED Pymio: notifica formularios y eventos creados después de unirse',async()=>{
  const calls=[];
  const client=createSupabase({url:'https://example.supabase.co',key:'secret',fetchImpl:async url=>{
    calls.push(url);
    if(url.pathname.endsWith('/community_members'))return Response.json([{community_id:'c1',role:'member',joined_at:'2026-10-20T12:00:00Z',role_since:'2026-10-20T12:00:00Z'}]);
    if(url.pathname.endsWith('/communities'))return Response.json([{id:'c1',name:'Comercio Local'}]);
    if(url.pathname.endsWith('/community_notifications'))return Response.json({code:'PGRST205',message:"Could not find the table 'public.community_notifications' in the schema cache"},{status:404});
    if(url.pathname.endsWith('/community_forms'))return Response.json([{id:'f1',title:'Encuesta semanal',created_at:'2026-10-20T13:00:00Z',community_id:'c1',created_by_company_id:9}]);
    if(url.pathname.endsWith('/network_posts'))return Response.json([{id:'e1',title:'Encuentro',created_at:'2026-10-20T14:00:00Z',event_at:'2026-10-25T15:00:00Z',community_id:'c1',author_company_id:8},{id:'e0',title:'Evento antiguo',created_at:'2026-10-19T14:00:00Z',event_at:'2026-10-22T15:00:00Z',community_id:'c1',author_company_id:8}]);
    return Response.json([]);
  }});
  const notifications=await client.getCommunityNotifications(7);
  assert.deepEqual(notifications.map(item=>item.id),['event-e1','form-f1']);assert.deepEqual(notifications.map(item=>item.kind),['event_created','form_created']);
  assert.equal(notifications[0].community_name,'Comercio Local');
  assert.equal(calls.length,5);assert.equal(calls[0].searchParams.get('company_id'),'eq.7');
  assert.equal(calls[0].searchParams.get('select'),'community_id,role,joined_at,role_since');
});

test('Supabase RED Pymio: conserva el historial de eventos modificados y eliminados',async()=>{
  const calls=[];
  const client=createSupabase({url:'https://example.supabase.co',key:'secret',fetchImpl:async url=>{
    calls.push(url);
    if(url.pathname.endsWith('/community_members'))return Response.json([{community_id:'c1',role:'member',joined_at:'2026-10-20T12:00:00Z',role_since:'2026-10-20T12:00:00Z'}]);
    if(url.pathname.endsWith('/communities'))return Response.json([{id:'c1',name:'Comercio Local'}]);
    return Response.json([
      {id:'n2',community_id:'c1',kind:'event_deleted',resource_id:'e1',title:'Encuentro',event_at:'2026-10-25T15:00:00Z',created_at:'2026-10-21T14:00:00Z'},
      {id:'n1',community_id:'c1',kind:'event_updated',resource_id:'e1',title:'Encuentro actualizado',event_at:'2026-10-25T16:00:00Z',created_at:'2026-10-21T13:00:00Z'},
    ]);
  }});
  const notifications=await client.getCommunityNotifications(7);
  assert.deepEqual(notifications.map(item=>item.kind),['event_deleted','event_updated']);
  assert.ok(notifications.every(item=>item.community_name==='Comercio Local'&&item.resource_id==='e1'));
  assert.equal(calls.filter(url=>url.pathname.endsWith('/community_notifications')).length,1);
  assert.equal(calls.filter(url=>url.pathname.endsWith('/network_posts')||url.pathname.endsWith('/community_forms')).length,0);
});

test('Supabase RED Pymio: notifica cuando asignan o retiran permisos de administrador',async()=>{
  const roleNotification=async role=>{
    const client=createSupabase({url:'https://example.supabase.co',key:'secret',fetchImpl:async url=>{
      if(url.pathname.endsWith('/community_members'))return Response.json([{community_id:'c1',role,joined_at:'2026-10-20T12:00:00Z',role_since:'2026-10-21T15:00:00Z'}]);
      if(url.pathname.endsWith('/communities'))return Response.json([{id:'c1',name:'Comercio Local'}]);
      return Response.json([]);
    }});
    return (await client.getCommunityNotifications(7))[0];
  };
  const granted=await roleNotification('admin');assert.equal(granted.kind,'admin_granted');assert.equal(granted.community_name,'Comercio Local');
  const revoked=await roleNotification('member');assert.equal(revoked.kind,'admin_revoked');assert.equal(revoked.created_at,'2026-10-21T15:00:00Z');
  const client=createSupabase({url:'https://example.supabase.co',key:'secret',fetchImpl:async url=>url.pathname.endsWith('/community_members')?Response.json([{community_id:'c1',role:'member',joined_at:'2026-10-20T12:00:00Z',role_since:'2026-10-20T12:00:00Z'}]):Response.json([])});
  assert.deepEqual(await client.getCommunityNotifications(7),[]);
});

test('Supabase RED Pymio: elimina el formulario y sus archivos con autorización administrativa',async()=>{
  const calls=[],formId='10000000-0000-4000-8000-000000000001',communityId='20000000-0000-4000-8000-000000000002';
  const client=createSupabase({url:'https://example.supabase.co',key:'secret',fetchImpl:async(url,options)=>{
    calls.push({url,options});
    if(url.pathname.endsWith('/pymio_community'))return Response.json({community:{id:communityId},forms:[{id:formId}],files:[{path:'7/form/respuesta.bin'}]});
    return Response.json({});
  }});
  assert.deepEqual(await client.deleteCommunityForm(formId,7),{communityId});
  const deletion=calls.find(call=>call.url.pathname.endsWith('/community_forms'));assert.equal(deletion.options.method,'DELETE');assert.equal(deletion.url.searchParams.get('id'),`eq.${formId}`);
  const storage=calls.find(call=>call.url.pathname.includes('/storage/v1/object/community-form-files/'));assert.equal(storage.options.method,'DELETE');
});

test('Supabase RED Pymio: verifica el rol antes de publicar eventos comunitarios',async()=>{
  const communityId='10000000-0000-4000-8000-000000000001';
  const admin=createSupabase({url:'https://example.supabase.co',key:'secret',fetchImpl:async()=>Response.json([{role:'admin'}])});
  assert.equal(await admin.requireCommunityAdmin(communityId,7),true);
  const member=createSupabase({url:'https://example.supabase.co',key:'secret',fetchImpl:async()=>Response.json([{role:'member'}])});
  await assert.rejects(member.requireCommunityAdmin(communityId,7),{status:403});
});

test('Supabase RED Pymio: un miembro o administrador puede salir pero el creador no',async()=>{
  const calls=[],communityId='10000000-0000-4000-8000-000000000001';
  const client=createSupabase({url:'https://example.supabase.co',key:'secret',fetchImpl:async(url,options={})=>{
    calls.push({url,options});
    if(url.pathname.endsWith('/community_members'))return options.method==='DELETE'?Response.json([{community_id:communityId,company_id:7,role:'admin'}]):Response.json([{role:'admin'}]);
    if(url.pathname.endsWith('/pymio_network'))return Response.json({profile:{},businesses:[],communities:[],posts:[]});
    if(url.pathname.endsWith('/pymio_connections'))return Response.json({});
    if(url.pathname.endsWith('/pymio_entitlements'))return Response.json({});
    if(url.pathname.endsWith('/pymio_community_roles'))return Response.json({managed_communities:[],community_role_notifications:[]});
    return Response.json({});
  }});
  const result=await client.leaveCommunity(communityId,7);assert.deepEqual(result.communities,[]);
  const deletion=calls.find(call=>call.options.method==='DELETE'&&call.url.pathname.endsWith('/community_members'));assert.ok(deletion);assert.equal(deletion.url.searchParams.get('community_id'),`eq.${communityId}`);assert.equal(deletion.url.searchParams.get('company_id'),'eq.7');assert.equal(deletion.options.headers.Prefer,'return=representation');
  const owner=createSupabase({url:'https://example.supabase.co',key:'secret',fetchImpl:async()=>Response.json([{role:'owner'}])});
  await assert.rejects(owner.leaveCommunity(communityId,7),{status:403,message:'El creador no puede salirse de su comunidad.'});
});

test('Supabase RED Pymio: solo el creador puede eliminar su comunidad',async()=>{
  const calls=[],communityId='10000000-0000-4000-8000-000000000001';
  const client=createSupabase({url:'https://example.supabase.co',key:'secret',fetchImpl:async(url,options={})=>{
    calls.push({url,options});
    if(url.pathname.endsWith('/communities'))return options.method==='DELETE'?Response.json([{id:communityId}]):Response.json([{id:communityId,owner_company_id:7,avatar_path:null,banner_path:null}]);
    if(url.pathname.endsWith('/network_posts'))return Response.json([]);
    if(url.pathname.endsWith('/pymio_network'))return Response.json({profile:{},businesses:[],communities:[],posts:[]});
    if(url.pathname.endsWith('/pymio_connections'))return Response.json({});
    if(url.pathname.endsWith('/pymio_entitlements'))return Response.json({});
    if(url.pathname.endsWith('/pymio_community_roles'))return Response.json({managed_communities:[],community_role_notifications:[]});
    return Response.json({});
  }});
  const result=await client.deleteCommunity(communityId,7);assert.deepEqual(result.communities,[]);
  const communityDeletion=calls.find(call=>call.options.method==='DELETE'&&call.url.pathname.endsWith('/communities'));assert.ok(communityDeletion);assert.equal(communityDeletion.url.searchParams.get('owner_company_id'),'eq.7');
  assert.ok(calls.some(call=>call.options.method==='DELETE'&&call.url.pathname.endsWith('/network_posts')));
  const outsider=createSupabase({url:'https://example.supabase.co',key:'secret',fetchImpl:async()=>Response.json([{id:communityId,owner_company_id:9}])});
  await assert.rejects(outsider.deleteCommunity(communityId,7),{status:403,message:'Solo el creador puede eliminar esta comunidad.'});
});

test('Supabase RED Pymio: permite cerrar una comunidad sin depender de profile.update en el RPC',async()=>{
  const calls=[],communityId='10000000-0000-4000-8000-000000000001';
  const client=createSupabase({url:'https://example.supabase.co',key:'secret',fetchImpl:async(url,options)=>{
    calls.push({url,options});
    if(url.pathname.endsWith('/community_members'))return Response.json([{role:'admin'}]);
    if(url.pathname.endsWith('/communities'))return Response.json([{id:communityId,is_open:false}]);
    if(url.pathname.endsWith('/pymio_community'))return Response.json({community:{id:communityId,is_open:false},members:[],events:[],forms:[]});
    return Response.json({});
  }});
  const result=await client.community('profile.update',7,{community_id:communityId,name:'Comunidad',description:'Descripción',industry:'',is_open:false});
  const update=calls.find(call=>call.url.pathname.endsWith('/communities'));
  assert.equal(update.options.method,'PATCH');assert.equal(JSON.parse(update.options.body).is_open,false);
  assert.equal(JSON.parse(update.options.body).community_id,undefined);assert.equal(result.community.is_open,false);
  assert.equal(calls.some(call=>call.url.pathname.endsWith('/pymio_community')&&JSON.parse(call.options.body).operation==='profile.update'),false);
});

test('Supabase RED Pymio: cerrar y abrir conserva las respuestas del formulario',async()=>{
  const calls=[],formId='10000000-0000-4000-8000-000000000001',communityId='20000000-0000-4000-8000-000000000002';
  const client=createSupabase({url:'https://example.supabase.co',key:'secret',fetchImpl:async(url,options)=>{
    calls.push({url,options});
    if(url.pathname.endsWith('/pymio_community'))return Response.json({community:{id:communityId},forms:[{id:formId}]});
    return Response.json({});
  }});
  await client.setCommunityFormStatus(formId,7,'closed');await client.setCommunityFormStatus(formId,7,'open');
  const patches=calls.filter(call=>call.url.pathname.endsWith('/community_forms'));
  assert.deepEqual(patches.map(call=>JSON.parse(call.options.body).status),['closed','open']);
  assert.ok(JSON.parse(patches[0].options.body).closed_at);assert.equal(JSON.parse(patches[1].options.body).closed_at,null);
  assert.ok(patches.every(call=>call.options.method==='PATCH'));
  assert.ok(calls.every(call=>!call.url.pathname.endsWith('/community_form_responses')));
});

test('Supabase RED Pymio: sigue cargando la red cuando aún falta la migración de roles',async()=>{
  const calls=[],fetchImpl=async(url,options={})=>{calls.push({url,options});if(String(url).includes('pymio_community_roles'))return Response.json({code:'PGRST202',message:'Could not find the function public.pymio_community_roles(company) in the schema cache'},{status:404});return Response.json({communities:[{id:'community-1'}],businesses:[{company_id:'2'}]});};
  const db=createSupabase({url:'https://example.supabase.co',key:'secret',fetchImpl}),result=await db.network('bootstrap','1',{});
  assert.equal(result.communities.length,1);assert.equal(result.businesses.length,1);
  assert.deepEqual(result.managed_communities,[]);assert.deepEqual(result.community_role_notifications,[]);
  assert.equal(calls.length,5);assert.equal(calls[0].options.method,'DELETE');
});

test('Supabase RED Pymio: asigna administradores aunque aún falte la función nueva',async()=>{
  const calls=[],communityId='10000000-0000-4000-8000-000000000001';
  const client=createSupabase({url:'https://example.supabase.co',key:'secret',fetchImpl:async(url,options)=>{
    calls.push({url,options});
    if(url.pathname.endsWith('/pymio_community_admin_set'))return Response.json({code:'PGRST202',message:'Could not find the function public.pymio_community_admin_set in the schema cache'},{status:404});
    if(url.pathname.endsWith('/community_members'))return Response.json([{company_id:7,role:'owner'},{company_id:9,role:'member'}]);
    return Response.json({community:{id:communityId},members:[{company_id:9,role:'admin'}]});
  }});
  const result=await client.community('admin.set',7,{community_id:communityId,target_company_id:9,is_admin:true});
  assert.equal(result.members[0].role,'admin');
  assert.deepEqual(calls.map(call=>call.url.pathname),['/rest/v1/rpc/pymio_community_admin_set','/rest/v1/community_members','/rest/v1/rpc/pymio_community']);
  assert.deepEqual(JSON.parse(calls.at(-1).options.body),{operation:'admin.set',company:'7',payload:{community_id:communityId,target_company_id:9,is_admin:true}});
});

test('Supabase RED Pymio: el modo compatible impide que un administrador retire a otro',async()=>{
  const client=createSupabase({url:'https://example.supabase.co',key:'secret',fetchImpl:async url=>{
    if(url.pathname.endsWith('/pymio_community_admin_set'))return Response.json({code:'PGRST202',message:'Missing pymio_community_admin_set'},{status:404});
    return Response.json([{company_id:7,role:'admin'},{company_id:9,role:'admin'}]);
  }});
  await assert.rejects(client.community('admin.set',7,{community_id:'10000000-0000-4000-8000-000000000001',target_company_id:9,is_admin:false}),{status:403,message:'Solo el creador de la comunidad puede retirar administradores.'});
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
    const expired=await fetch(base+'/api/auth/google/callback?state=expired',{redirect:'manual'});
    const expiredLocation=new URL(expired.headers.get('location'));
    assert.equal(expiredLocation.origin,base);
    assert.equal(expiredLocation.pathname,'/piloto.html');
    assert.equal(expiredLocation.searchParams.has('auth_error'),true);
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

test('HTTP Auth: cambiar contraseña exige la anterior y recuperación no revela cuentas',async()=>{
  const passwordUpdates=[],recoveries=[],resets=[];
  const pool={
    createAuthUser:async(email)=>({id:'user-1',email}),registerAccount:async()=>({company_id:8,business_name:'Mi Pyme',owner_name:'Ana'}),deleteAuthUser:async()=>{},
    signIn:async(email,password)=>{if(password!=='actual-segura')throw Object.assign(new Error('incorrecta'),{status:400});return {user:{id:'user-1',email}};},
    updateAuthUserPassword:async(userId,password)=>passwordUpdates.push({userId,password}),
    sendPasswordRecovery:async(email,returnTo)=>recoveries.push({email,returnTo}),resetAuthUserPassword:async(token,password)=>resets.push({token,password})
  };
  const server=createInventoryServer(pool,['http://localhost:5500'],{sessionSecret:'test-secret'}),base=await listen(server);
  try{
    const register=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'ana@example.com',password:'actual-segura',businessName:'Mi Pyme',ownerName:'Ana'})});
    assert.equal(register.status,201);const cookie=register.headers.get('set-cookie').split(';')[0];
    const missing=await fetch(base+'/api/auth/password',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({password:'nueva-segura'})});assert.equal(missing.status,400);
    const wrong=await fetch(base+'/api/auth/password',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({currentPassword:'incorrecta',password:'nueva-segura'})});assert.equal(wrong.status,401);
    const changed=await fetch(base+'/api/auth/password',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({currentPassword:'actual-segura',password:'nueva-segura'})});assert.equal(changed.status,200);assert.deepEqual(passwordUpdates,[{userId:'user-1',password:'nueva-segura'}]);
    const recovery=await fetch(base+'/api/auth/password/recovery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'ana@example.com',returnTo:'http://localhost:5500/piloto.html'})});assert.equal(recovery.status,200);assert.match((await recovery.json()).message,/Si existe una cuenta/);assert.equal(recoveries[0].returnTo,'http://localhost:5500/piloto.html');
    const reset=await fetch(base+'/api/auth/password/reset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accessToken:'recovery-token-1234567890',password:'otra-segura'})});assert.equal(reset.status,200);assert.deepEqual(resets,[{token:'recovery-token-1234567890',password:'otra-segura'}]);
  }finally{await close(server);}
});

test('Supabase Storage: conserva el MIME validado y permite eliminar imágenes', async () => {
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
  await client.uploadProfileImage('2/avatar/10000000-0000-4000-8000-000000000002.webp',image,'image/png');
  await client.getProfileImage('2/avatar/10000000-0000-4000-8000-000000000002.webp');
  await client.deleteProfileImage('2/avatar/10000000-0000-4000-8000-000000000002.webp');
  assert.equal(calls[3].url.pathname,'/storage/v1/object/profile-images/2/avatar/10000000-0000-4000-8000-000000000002.webp');
  assert.equal(calls[3].options.headers['Content-Type'],'image/png');
  assert.match(calls[4].url.pathname,/\/storage\/v1\/object\/public\/profile-images\//);
  assert.equal(calls[5].options.method,'DELETE');
});

test('HTTP: acepta WebP, PNG y JPEG reales antes de enviarlos a Storage', async () => {
  const uploads=[];
  const pool={uploadProductImage:async(path,body,mime)=>uploads.push({path,body,mime}),getProductImage:async path=>{uploads.push({read:path});return Buffer.from('RIFFxxxxWEBPdata');},deleteProductImage:async path=>uploads.push({deleted:path}),rpc:async()=>[]};
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
    const png=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0]);
    assert.equal((await fetch(base+'/api/product-images?company_id=2',{method:'POST',headers:{'Content-Type':'image/png'},body:png})).status,201);
    assert.equal(uploads.at(-1).mime,'image/png');
    assert.equal((await fetch(base+'/api/product-images?company_id=2',{method:'POST',headers:{'Content-Type':'image/png'},body:valid})).status,400);
    assert.equal((await fetch(base+'/api/product-images?company_id=2',{method:'POST',headers:{'Content-Type':'image/webp'},body:Buffer.alloc(500*1024+1)})).status,413);
    const id=result.path.split('/')[1].replace('.webp','');
    assert.equal((await fetch(`${base}/api/product-images/${id}?company_id=2`,{method:'DELETE'})).status,200);
    assert.equal(uploads.at(-1).deleted,result.path);
  } finally { await close(server); }
});

test('HTTP: procesa fotos WebP, PNG y JPEG por empresa', async () => {
  const calls=[];
  const pool={uploadProfileImage:async(path,body,mime)=>calls.push({path,body,mime}),getProfileImage:async path=>{calls.push({read:path});return Buffer.from('RIFFxxxxWEBPdata');},deleteProfileImage:async path=>calls.push({deleted:path}),rpc:async()=>[]};
  const server=createInventoryServer(pool,[]),base=await listen(server);
  try{
    const valid=Buffer.from('RIFFxxxxWEBPdata');
    const uploaded=await fetch(base+'/api/profile-images/avatar?company_id=2',{method:'POST',headers:{'Content-Type':'image/webp'},body:valid});
    assert.equal(uploaded.status,201);const result=await uploaded.json();assert.match(result.path,/^2\/avatar\/[0-9a-f-]{36}\.webp$/);
    const id=result.path.split('/')[2].replace('.webp','');
    const served=await fetch(`${base}/api/profile-images/2/avatar/${id}?company_id=2`);assert.equal(served.status,200);assert.equal(calls.at(-1).read,result.path);
    const jpeg=Buffer.from([0xff,0xd8,0xff,0xe0,0,0,0,0]);
    assert.equal((await fetch(base+'/api/profile-images/banner?company_id=2',{method:'POST',headers:{'Content-Type':'image/jpeg'},body:jpeg})).status,201);
    assert.equal(calls.at(-1).mime,'image/jpeg');
    assert.equal((await fetch(`${base}/api/profile-images/avatar/${id}?company_id=2`,{method:'DELETE'})).status,200);assert.equal(calls.at(-1).deleted,result.path);
  }finally{await close(server);}
});

async function listen(server) {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
async function close(server) { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }

test('HTTP RED Pymio: la ruta para salirse de una comunidad llega al servidor',async()=>{
  const calls=[],communityId='10000000-0000-4000-8000-000000000001',pool={leaveCommunity:async(id,company)=>{calls.push({id,company});return {communities:[]};}};
  const server=createInventoryServer(pool,[]),base=await listen(server);
  try{
    const response=await fetch(`${base}/api/network/communities/leave?company_id=7`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({communityId})});
    assert.equal(response.status,200);assert.deepEqual(await response.json(),{communities:[]});assert.deepEqual(calls,[{id:communityId,company:'7'}]);
  }finally{await close(server);}
});

test('HTTP: validation, company scope, CORS, CRUD routing and Supabase failures', async () => {
  const calls=[];
  let failure;
  const server=createInventoryServer({async rpc(operation,company,data){calls.push({operation,company,data});if(failure)throw failure;return {id:'81'};}},['http://localhost:5500']);
  const base=await listen(server);
  const url=base+'/api/products?company_id=2';
  const product={name:'Prueba',category:'Cat',qty:5,cost:10,price:20,low_qty:2,created_at:'2026-09-01T00:00:00Z',updated_at:'2026-09-01T00:00:00Z'};
  const send=(url,method,data)=>fetch(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  try {
    const preflight=await fetch(url,{method:'OPTIONS',headers:{Origin:'http://localhost:5500','Access-Control-Request-Headers':'content-type,x-file-name'}});
    assert.equal(preflight.status,204);
    assert.match(preflight.headers.get('access-control-allow-headers'),/X-File-Name/i);
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
