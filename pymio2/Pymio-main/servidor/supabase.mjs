// Server-only Supabase Data API client. Never send this key to the browser.
export function createSupabase({ url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY, fetchImpl = fetch } = {}) {
  if (!url || !key) throw new Error('Configura SUPABASE_URL y SUPABASE_SECRET_KEY en servidor/.env.');
  const base = new URL(url);
  if (base.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(base.hostname)) throw new Error('SUPABASE_URL debe usar HTTPS.');
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const requestJson = async (path, options, fallback) => {
    let response;
    try {
      response = await fetchImpl(new URL(path, base), { ...options, signal: AbortSignal.timeout(15000) });
    } catch {
      throw Object.assign(new Error('No se pudo conectar con el servidor. Reintenta cuando vuelva la conexión.'), { status: 503 });
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = result.msg || result.message || result.error_description || fallback;
      throw Object.assign(new Error(message), { status: response.status, code: result.code });
    }
    return result;
  };
  const uploadStorageImage = async (bucket, path, body, mimeType='image/webp') => {
    let response;
    try {
      response = await fetchImpl(new URL(`/storage/v1/object/${bucket}/${path}`, base), {
        method: 'POST', headers: {...headers, 'Content-Type':mimeType, 'x-upsert':'false'}, body,
        signal: AbortSignal.timeout(20000),
      });
    } catch { throw Object.assign(new Error('No se pudo conectar con Supabase Storage.'), {status:503}); }
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw Object.assign(new Error(detail.message || 'No se pudo guardar la imagen en Supabase Storage.'), {status: response.status === 409 ? 409 : 502});
    }
    return {path};
  };
  const deleteStorageImage = async (bucket, path) => {
    let response;
    try {
      response = await fetchImpl(new URL(`/storage/v1/object/${bucket}/${path}`, base), {
        method: 'DELETE', headers, signal: AbortSignal.timeout(15000),
      });
    } catch { throw Object.assign(new Error('No se pudo conectar con Supabase Storage.'), {status:503}); }
    if (!response.ok && response.status !== 404) throw Object.assign(new Error('No se pudo eliminar la imagen anterior.'), {status:502});
  };
  const getStorageImage = async (bucket, path) => {
    let response;
    try {
      response = await fetchImpl(new URL(`/storage/v1/object/public/${bucket}/${path}`, base), {
        headers, signal: AbortSignal.timeout(15000),
      });
    } catch { throw Object.assign(new Error('No se pudo conectar con Supabase Storage.'), {status:503}); }
    if (!response.ok) throw Object.assign(new Error('La imagen no está disponible.'), {status:response.status === 404 ? 404 : 502});
    return Buffer.from(await response.arrayBuffer());
  };
  const uploadStorageFile = async (bucket,path,body) => {
    const response=await fetchImpl(new URL(`/storage/v1/object/${bucket}/${path}`,base),{method:'POST',headers:{...headers,'Content-Type':'application/octet-stream','x-upsert':'false'},body,signal:AbortSignal.timeout(20000)});
    if(!response.ok){const detail=await response.json().catch(()=>({}));throw Object.assign(new Error(detail.message||'No se pudo guardar el archivo.'),{status:response.status});}
    return {path};
  };
  const getStorageFile = async (bucket,path) => {
    const response=await fetchImpl(new URL(`/storage/v1/object/${bucket}/${path}`,base),{headers,signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw Object.assign(new Error('No se pudo descargar un archivo del formulario.'),{status:response.status});
    return Buffer.from(await response.arrayBuffer());
  };
  return {
    async authProviders() {
      const settings=await requestJson('/auth/v1/settings', {headers}, 'No se pudo consultar la configuración de acceso.');
      return {google:Boolean(settings.external?.google)};
    },
    googleAuthorizeUrl(redirectTo, state, challenge) {
      const url=new URL('/auth/v1/authorize',base);
      url.searchParams.set('provider','google');
      url.searchParams.set('redirect_to',redirectTo);
      url.searchParams.set('state',state);
      url.searchParams.set('code_challenge',challenge);
      url.searchParams.set('code_challenge_method','s256');
      return url.href;
    },
    async exchangeOAuthCode(code, verifier) {
      return requestJson('/auth/v1/token?grant_type=pkce', {
        method:'POST',headers:{...headers,'Content-Type':'application/json'},
        body:JSON.stringify({auth_code:code,code_verifier:verifier}),
      }, 'No se pudo completar el acceso con Google.');
    },
    async signIn(email, password) {
      return requestJson('/auth/v1/token?grant_type=password', {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }, 'No se pudo iniciar sesión.');
    },
    async createAuthUser(email, password, metadata = {}) {
      return requestJson('/auth/v1/admin/users', {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, email_confirm: true, user_metadata: metadata }),
      }, 'No se pudo crear la cuenta.');
    },
    async deleteAuthUser(id) {
      return requestJson('/auth/v1/admin/users/' + encodeURIComponent(id), {
        method: 'DELETE', headers,
      }, 'No se pudo revertir la cuenta incompleta.');
    },
    async updateAuthUserPassword(id, password) {
      return requestJson('/auth/v1/admin/users/' + encodeURIComponent(id), {
        method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, app_metadata: { pymio_password_set: true } }),
      }, 'No se pudo crear la contraseña de la cuenta.');
    },
    async markAuthBusinessNameSet(id) {
      return requestJson('/auth/v1/admin/users/' + encodeURIComponent(id), {
        method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_metadata: { pymio_business_name_set: true } }),
      }, 'No se pudo confirmar el nombre del negocio.');
    },
    async registerAccount(userId, email, businessName, ownerName) {
      return requestJson('/rest/v1/rpc/pymio_register_account', {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ auth_user: userId, account_email: email, business_name: businessName, owner_name: ownerName || null }),
      }, 'No se pudo preparar el espacio de trabajo.');
    },
    async updateAccount(userId, businessName, ownerName) {
      return requestJson('/rest/v1/rpc/pymio_update_account', {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ auth_user: userId, business_name: businessName, owner_name: ownerName || null }),
      }, 'No se pudo actualizar la información de tu negocio.');
    },
    async accountForUser(userId) {
      return requestJson('/rest/v1/rpc/pymio_account_for_user', {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ auth_user: userId }),
      }, 'No se encontró un espacio de trabajo para esta cuenta.');
    },
    async network(operation, companyId, data = {}) {
      const connectionOperation=operation.startsWith('connection.')||operation.startsWith('activity.');
      if(operation==='bootstrap'){
        const [network,connections,entitlements,communityRoles]=await Promise.all([
          requestJson('/rest/v1/rpc/pymio_network',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({operation,company:String(companyId),payload:data})},'No se pudo consultar RED Pymio.'),
          requestJson('/rest/v1/rpc/pymio_connections',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({operation,company:String(companyId),payload:data})},'No se pudieron consultar las conexiones.'),
          requestJson('/rest/v1/rpc/pymio_entitlements',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({operation,company:String(companyId),payload:data})},'No se pudieron consultar los beneficios de la cuenta.'),
          requestJson('/rest/v1/rpc/pymio_community_roles',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({company:String(companyId)})},'No se pudieron consultar tus roles de comunidad.').catch(error=>{
            if(error.code==='PGRST202'||/pymio_community_roles/i.test(error.message||''))return {managed_communities:[],community_role_notifications:[]};
            throw error;
          }),
        ]);
        return {...network,...connections,...entitlements,...communityRoles};
      }
      if(operation==='post.update'){
        const {post_id,...payload}=data;
        const existing=await requestJson(`/rest/v1/network_posts?id=eq.${encodeURIComponent(post_id)}&kind=eq.event&select=id,community_id&limit=1`,{headers},'No se pudo identificar el evento.');
        if(!existing[0]?.community_id)throw Object.assign(new Error('El evento ya no está disponible.'),{status:404});
        if(payload.community_id!==existing[0].community_id)throw Object.assign(new Error('No puedes mover el evento a otra comunidad.'),{status:400});
        await this.requireCommunityAdmin(existing[0].community_id,companyId);
        const query=`/rest/v1/network_posts?id=eq.${encodeURIComponent(post_id)}&community_id=eq.${encodeURIComponent(existing[0].community_id)}&kind=eq.event`;
        const updated=await requestJson(query,{
          method:'PATCH',headers:{...headers,'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(payload),
        },'No se pudo actualizar la publicación.');
        if(!Array.isArray(updated)||!updated.length)throw Object.assign(new Error('El evento ya no está disponible.'),{status:404});
        return requestJson('/rest/v1/rpc/pymio_network',{
          method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({operation:'bootstrap',company:String(companyId),payload:{}}),
        },'No se pudo actualizar RED Pymio.');
      }
      if(operation==='post.delete'){
        const existing=await requestJson(`/rest/v1/network_posts?id=eq.${encodeURIComponent(data.post_id)}&kind=eq.event&select=id,community_id&limit=1`,{headers},'No se pudo identificar el evento.');
        if(!existing[0]?.community_id)throw Object.assign(new Error('El evento ya no está disponible.'),{status:404});
        await this.requireCommunityAdmin(existing[0].community_id,companyId);
        const deleted=await requestJson(`/rest/v1/network_posts?id=eq.${encodeURIComponent(data.post_id)}&community_id=eq.${encodeURIComponent(existing[0].community_id)}&kind=eq.event`,{method:'DELETE',headers:{...headers,Prefer:'return=representation'}},'No se pudo eliminar el evento.');
        if(!Array.isArray(deleted)||!deleted.length)throw Object.assign(new Error('El evento ya no está disponible.'),{status:404});
        return requestJson('/rest/v1/rpc/pymio_network',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({operation:'bootstrap',company:String(companyId),payload:{}})},'No se pudo actualizar RED Pymio.');
      }
      return requestJson(connectionOperation?'/rest/v1/rpc/pymio_connections':'/rest/v1/rpc/pymio_network', {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation, company: String(companyId), payload: data }),
      }, 'No se pudo consultar RED Pymio. Revisa la configuración de la red.');
    },
    async entitlements(operation,companyId,data={}){
      return requestJson('/rest/v1/rpc/pymio_entitlements',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({operation,company:String(companyId),payload:data})},'No se pudo validar el plan de la cuenta.');
    },
    async community(operation,companyId,data={}){
      if(operation==='admin.set'){
        const roleRequest={company:String(companyId),community_id:data.community_id,target_company_id:String(data.target_company_id),is_admin:Boolean(data.is_admin)};
        try{
          return await requestJson('/rest/v1/rpc/pymio_community_admin_set',{
            method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(roleRequest),
          },'No se pudo actualizar el rol de este miembro.');
        }catch(error){
          if(error.code!=='PGRST202'&&!/pymio_community_admin_set/i.test(error.message||''))throw error;
          const actor=encodeURIComponent(String(companyId)),target=encodeURIComponent(String(data.target_company_id)),community=encodeURIComponent(data.community_id);
          const members=await requestJson(`/rest/v1/community_members?community_id=eq.${community}&company_id=in.(${actor},${target})&select=company_id,role`,{headers},'No se pudieron verificar los permisos de la comunidad.');
          const actorMember=members.find(item=>String(item.company_id)===String(companyId)),targetMember=members.find(item=>String(item.company_id)===String(data.target_company_id));
          if(!['owner','admin'].includes(actorMember?.role))throw Object.assign(new Error('Solo los administradores pueden asignar este permiso.'),{status:403});
          if(!targetMember)throw Object.assign(new Error('La empresa no pertenece a esta comunidad.'),{status:404});
          if(targetMember.role==='owner')throw Object.assign(new Error('No puedes modificar el rol del creador de la comunidad.'),{status:409});
          if(!roleRequest.is_admin&&targetMember.role==='admin'&&actorMember.role!=='owner')throw Object.assign(new Error('Solo el creador de la comunidad puede retirar administradores.'),{status:403});
          return requestJson('/rest/v1/rpc/pymio_community',{
            method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({operation,company:String(companyId),payload:data}),
          },'No se pudo actualizar el rol de este miembro.');
        }
      }
      return requestJson('/rest/v1/rpc/pymio_community',{
        method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({operation,company:String(companyId),payload:data}),
      },'No se pudo consultar la comunidad. Revisa las migraciones de Supabase.');
    },
    async requireCommunityAdmin(communityId,companyId){
      const rows=await requestJson(`/rest/v1/community_members?community_id=eq.${encodeURIComponent(communityId)}&company_id=eq.${encodeURIComponent(String(companyId))}&select=role&limit=1`,{headers},'No se pudieron verificar tus permisos en la comunidad.');
      if(!['owner','admin'].includes(rows[0]?.role))throw Object.assign(new Error('Solo los administradores de la comunidad pueden crear o modificar eventos.'),{status:403});
      return true;
    },
    async getCommunityNotifications(companyId){
      const memberships=await requestJson(`/rest/v1/community_members?company_id=eq.${encodeURIComponent(String(companyId))}&select=community_id,role,joined_at,role_since`,{headers},'No se pudieron consultar tus comunidades.');
      if(!memberships.length)return [];
      const ids=[...new Set(memberships.map(item=>item.community_id))],idFilter=encodeURIComponent(ids.join(','));
      const communities=await requestJson(`/rest/v1/communities?id=in.(${idFilter})&select=id,name`,{headers},'No se pudieron identificar las comunidades.');
      const joinedAt=new Map(memberships.map(item=>[item.community_id,Date.parse(item.joined_at)||0])),names=new Map(communities.map(item=>[item.id,item.name]));
      const roleChanges=memberships.filter(item=>item.role!=='owner'&&(Date.parse(item.role_since)||0)>(Date.parse(item.joined_at)||0)).map(item=>({id:`role-${item.community_id}-${item.role_since}`,kind:item.role==='admin'?'admin_granted':'admin_revoked',created_at:item.role_since,community_id:item.community_id,community_name:names.get(item.community_id)||'Comunidad'}));
      try{
        const notifications=[];
        for(let offset=0;;offset+=500){
          const page=await requestJson(`/rest/v1/community_notifications?company_id=eq.${encodeURIComponent(String(companyId))}&select=id,community_id,kind,resource_id,title,event_at,created_at&order=created_at.desc&limit=500&offset=${offset}`,{headers},'No se pudieron consultar las notificaciones de la comunidad.');
          notifications.push(...page);if(page.length<500)break;
        }
        return [...roleChanges,...notifications.map(item=>({...item,community_name:names.get(item.community_id)||'Comunidad'}))]
          .filter(item=>(Date.parse(item.created_at)||0)>=Number(joinedAt.get(item.community_id)||0)).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));
      }catch(error){
        if(error.code!=='PGRST205'&&!/community_notifications/i.test(error.message||''))throw error;
      }
      const [forms,events]=await Promise.all([
        requestJson(`/rest/v1/community_forms?community_id=in.(${idFilter})&select=id,title,created_at,community_id,created_by_company_id&order=created_at.desc&limit=100`,{headers},'No se pudieron consultar los formularios recientes.'),
        requestJson(`/rest/v1/network_posts?community_id=in.(${idFilter})&kind=eq.event&select=id,title,created_at,event_at,community_id,author_company_id&order=created_at.desc&limit=100`,{headers},'No se pudieron consultar los eventos recientes.'),
      ]);
      return [
        ...roleChanges,
        ...forms.map(item=>({id:`form-${item.id}`,kind:'form_created',resource_id:item.id,title:item.title,created_at:item.created_at,community_id:item.community_id,community_name:names.get(item.community_id)||'Comunidad'})),
        ...events.map(item=>({id:`event-${item.id}`,kind:'event_created',resource_id:item.id,title:item.title,created_at:item.created_at,event_at:item.event_at,community_id:item.community_id,community_name:names.get(item.community_id)||'Comunidad'})),
      ].filter(item=>(Date.parse(item.created_at)||0)>=Number(joinedAt.get(item.community_id)||0)).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)).slice(0,100);
    },
    async getCommunityChats(companyId){
      const memberships=await requestJson(`/rest/v1/community_members?company_id=eq.${encodeURIComponent(String(companyId))}&select=community_id`,{headers},'No se pudieron consultar tus chats de comunidad.');
      if(!memberships.length)return [];
      const ids=[...new Set(memberships.map(item=>item.community_id))],idFilter=encodeURIComponent(ids.join(','));
      const [communities,messages,reads]=await Promise.all([
        requestJson(`/rest/v1/communities?id=in.(${idFilter})&select=id,name&order=name`,{headers},'No se pudieron identificar las comunidades.'),
        requestJson(`/rest/v1/community_chat_messages?community_id=in.(${idFilter})&select=id,community_id,sender_company_id,body,created_at&order=created_at.asc&limit=500`,{headers},'No se pudieron consultar los mensajes de comunidad.'),
        requestJson(`/rest/v1/community_chat_reads?community_id=in.(${idFilter})&company_id=eq.${encodeURIComponent(String(companyId))}&select=community_id,read_at`,{headers},'No se pudo consultar el estado de lectura.'),
      ]);
      const senderIds=[...new Set(messages.map(item=>String(item.sender_company_id)))],senders=new Map();
      if(senderIds.length){
        const senderFilter=encodeURIComponent(senderIds.join(','));
        const [accounts,profiles]=await Promise.all([
          requestJson(`/rest/v1/user_accounts?company_id=in.(${senderFilter})&select=company_id,business_name`,{headers},'No se pudieron identificar los participantes.'),
          requestJson(`/rest/v1/business_profiles?company_id=in.(${senderFilter})&select=company_id,display_name`,{headers},'No se pudieron identificar los perfiles.'),
        ]),profileNames=new Map(profiles.map(item=>[String(item.company_id),item.display_name]));
        for(const item of accounts)senders.set(String(item.company_id),profileNames.get(String(item.company_id))||item.business_name||`Empresa ${item.company_id}`);
      }
      const readAt=new Map(reads.map(item=>[String(item.community_id),Date.parse(item.read_at)||0]));
      return communities.map(community=>{
        const items=messages.filter(item=>String(item.community_id)===String(community.id)).map(item=>({...item,thread_id:`community:${community.id}`,sender_name:senders.get(String(item.sender_company_id))||'Miembro de la comunidad',direction:String(item.sender_company_id)===String(companyId)?'sent':'received'}));
        return {id:`community:${community.id}`,community_id:community.id,name:community.name,unread_count:items.filter(item=>item.direction==='received'&&Date.parse(item.created_at)>(readAt.get(String(community.id))||0)).length,items};
      });
    },
    async createCommunityMessage(communityId,companyId,body){
      const memberships=await requestJson(`/rest/v1/community_members?community_id=eq.${encodeURIComponent(communityId)}&company_id=eq.${encodeURIComponent(String(companyId))}&select=community_id&limit=1`,{headers},'No se pudo verificar tu membresía.');
      if(!memberships.length)throw Object.assign(new Error('Debes pertenecer a la comunidad para enviar mensajes.'),{status:403});
      await requestJson('/rest/v1/community_chat_messages',{method:'POST',headers:{...headers,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({community_id:communityId,sender_company_id:String(companyId),body})},'No se pudo enviar el mensaje al grupo.');
      await this.markCommunityChatRead(communityId,companyId);
      return this.getCommunityChats(companyId);
    },
    async markCommunityChatRead(communityId,companyId){
      const memberships=await requestJson(`/rest/v1/community_members?community_id=eq.${encodeURIComponent(communityId)}&company_id=eq.${encodeURIComponent(String(companyId))}&select=community_id&limit=1`,{headers},'No se pudo verificar tu membresía.');
      if(!memberships.length)throw Object.assign(new Error('Debes pertenecer a la comunidad para leer este chat.'),{status:403});
      await requestJson('/rest/v1/community_chat_reads?on_conflict=community_id,company_id',{method:'POST',headers:{...headers,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({community_id:communityId,company_id:String(companyId),read_at:new Date().toISOString()})},'No se pudo actualizar el estado de lectura.');
      return this.getCommunityChats(companyId);
    },
    async getEventParticipationSummary(companyId){
      const rows=await requestJson('/rest/v1/community_event_participations?select=event_id,company_id,participation_type,status,updated_at',{headers},'No se pudo consultar la participación en eventos.');
      const grouped=new Map();
      for(const row of rows){
        const item=grouped.get(row.event_id)||{event_id:row.event_id,applicant_count:0,attendee_count:0,own_type:'',own_status:''};
        if(row.status==='registered')item[row.participation_type==='applicant'?'applicant_count':'attendee_count']+=1;
        if(String(row.company_id)===String(companyId)){item.own_type=row.participation_type;item.own_status=row.status;}
        grouped.set(row.event_id,item);
      }
      return [...grouped.values()];
    },
    async getCommunityEventParticipation(communityId,companyId){
      const membership=await requestJson(`/rest/v1/community_members?community_id=eq.${encodeURIComponent(communityId)}&company_id=eq.${encodeURIComponent(String(companyId))}&select=role&limit=1`,{headers},'No se pudo verificar tu rol en la comunidad.');
      const role=membership[0]?.role||'',canManage=['owner','admin'].includes(role);
      const rows=await requestJson(`/rest/v1/community_event_participations?community_id=eq.${encodeURIComponent(communityId)}&select=event_id,company_id,participation_type,status,created_at,updated_at&order=created_at.asc`,{headers},'No se pudieron consultar las inscripciones del evento.');
      const names=new Map();
      if(canManage&&rows.length){
        const ids=[...new Set(rows.map(row=>String(row.company_id)))],filter=encodeURIComponent(ids.join(','));
        const [accounts,profiles]=await Promise.all([
          requestJson(`/rest/v1/user_accounts?company_id=in.(${filter})&select=company_id,business_name`,{headers},'No se pudieron identificar los participantes.'),
          requestJson(`/rest/v1/business_profiles?company_id=in.(${filter})&select=company_id,display_name`,{headers},'No se pudieron identificar los participantes.'),
        ]),profileNames=new Map(profiles.map(row=>[String(row.company_id),row.display_name]));
        for(const account of accounts)names.set(String(account.company_id),profileNames.get(String(account.company_id))||account.business_name||`Empresa ${account.company_id}`);
      }
      const grouped=new Map();
      for(const row of rows){
        const item=grouped.get(row.event_id)||{event_id:row.event_id,applicant_count:0,attendee_count:0,own_type:'',own_status:'',participants:[]};
        if(row.status==='registered')item[row.participation_type==='applicant'?'applicant_count':'attendee_count']+=1;
        if(String(row.company_id)===String(companyId)){item.own_type=row.participation_type;item.own_status=row.status;}
        if(canManage)item.participants.push({...row,name:names.get(String(row.company_id))||`Empresa ${row.company_id}`});
        grouped.set(row.event_id,item);
      }
      return {can_manage:canManage,events:[...grouped.values()]};
    },
    async registerEventParticipation(eventId,companyId,type){
      const events=await requestJson(`/rest/v1/network_posts?id=eq.${encodeURIComponent(eventId)}&kind=eq.event&select=id,community_id,event_at&limit=1`,{headers},'No se pudo encontrar el evento.');
      const event=events[0];if(!event?.community_id)throw Object.assign(new Error('El evento ya no está disponible.'),{status:404});
      if(Date.parse(event.event_at)<=Date.now())throw Object.assign(new Error('Este evento ya comenzó y no admite nuevas inscripciones.'),{status:409});
      let membership=await requestJson(`/rest/v1/community_members?community_id=eq.${encodeURIComponent(event.community_id)}&company_id=eq.${encodeURIComponent(String(companyId))}&select=community_id&limit=1`,{headers},'No se pudo verificar tu membresía.');
      if(!membership.length){
        await this.network('community.join',companyId,{community_id:event.community_id});
        membership=await requestJson(`/rest/v1/community_members?community_id=eq.${encodeURIComponent(event.community_id)}&company_id=eq.${encodeURIComponent(String(companyId))}&select=community_id&limit=1`,{headers},'No se pudo verificar tu membresía.');
      }
      const status=membership.length?'registered':'pending_membership';
      await requestJson('/rest/v1/community_event_participations?on_conflict=event_id,company_id',{method:'POST',headers:{...headers,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({event_id:event.id,community_id:event.community_id,company_id:String(companyId),participation_type:type,status,updated_at:new Date().toISOString()})},'No se pudo guardar tu inscripción.');
      return {event_participations:await this.getEventParticipationSummary(companyId),membership_status:status};
    },
    async removeEventParticipation(eventId,companyId){
      await requestJson(`/rest/v1/community_event_participations?event_id=eq.${encodeURIComponent(eventId)}&company_id=eq.${encodeURIComponent(String(companyId))}`,{method:'DELETE',headers:{...headers,Prefer:'return=minimal'}},'No se pudo cancelar tu inscripción.');
      return {event_participations:await this.getEventParticipationSummary(companyId)};
    },
    async getCommunityFormResults(formId,companyId){
      const detail=await this.community('form.export',companyId,{form_id:formId});
      const member=(detail.members||[]).find(item=>String(item.company_id)===String(companyId));
      if(!member||!['owner','admin'].includes(member.role))throw Object.assign(new Error('Solo los administradores pueden consultar las respuestas.'),{status:403});
      const responses=[];
      for(let offset=0;;){
        const page=await requestJson(`/rest/v1/community_form_responses?form_id=eq.${encodeURIComponent(formId)}&select=id,company_id,submitted_at,answers:community_form_answers(question_id,text_value,option_value,file_path,file_name,compressed)&order=id&limit=500&offset=${offset}`,{headers},'No se pudieron consultar los resultados.');
        if(!page.length)break;
        responses.push(...page);offset+=page.length;
      }
      for(const response of responses){
        const accounts=await requestJson(`/rest/v1/user_accounts?company_id=eq.${encodeURIComponent(response.company_id)}&select=owner_name,business_name&limit=1`,{headers},'No se pudo identificar al participante.');
        response.name=accounts[0]?.owner_name||accounts[0]?.business_name||`Empresa ${response.company_id}`;
      }
      return {form:detail.forms?.find(form=>form.id===formId),responses};
    },
    async getCommunityFormMeta(formId){
      const rows=await requestJson(`/rest/v1/community_forms?id=eq.${encodeURIComponent(formId)}&select=id,community_id,created_by_company_id,status&limit=1`,{headers},'No se pudo consultar el formulario.');
      if(!rows[0])throw Object.assign(new Error('El formulario ya no está disponible.'),{status:404});
      return rows[0];
    },
    async deleteCommunityForm(formId,companyId){
      const detail=await this.community('form.export',companyId,{form_id:formId}),communityId=detail.community?.id;
      if(!communityId||!detail.forms?.some(form=>form.id===formId))throw Object.assign(new Error('El formulario ya no está disponible.'),{status:404});
      const paths=[...new Set((detail.files||[]).map(file=>file.path).filter(Boolean))];
      await requestJson(`/rest/v1/community_forms?id=eq.${encodeURIComponent(formId)}`,{method:'DELETE',headers:{...headers,Prefer:'return=minimal'}},'No se pudo eliminar el formulario.');
      for(const path of paths)await this.deleteCommunityFile(path).catch(()=>{});
      return {communityId};
    },
    async setCommunityFormStatus(formId,companyId,status){
      if(!['open','closed'].includes(status))throw Object.assign(new Error('El estado del formulario no es válido.'),{status:400});
      const detail=await this.community('form.export',companyId,{form_id:formId}),communityId=detail.community?.id;
      if(!communityId||!detail.forms?.some(form=>form.id===formId))throw Object.assign(new Error('El formulario ya no está disponible.'),{status:404});
      await requestJson(`/rest/v1/community_forms?id=eq.${encodeURIComponent(formId)}`,{method:'PATCH',headers:{...headers,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({status,closed_at:status==='closed'?new Date().toISOString():null})},status==='closed'?'No se pudo cerrar el formulario.':'No se pudo abrir el formulario.');
      return this.community('detail',companyId,{community_id:communityId});
    },
    async getCommunityFormResponse(formId,companyId){
      const query=`?form_id=eq.${encodeURIComponent(formId)}&company_id=eq.${encodeURIComponent(companyId)}&select=id,submitted_at`;
      const responses=await requestJson('/rest/v1/community_form_responses'+query,{headers},'No se pudo consultar tu respuesta.');
      const response=responses[0];if(!response)return null;
      const answers=await requestJson(`/rest/v1/community_form_answers?response_id=eq.${encodeURIComponent(response.id)}&select=question_id,text_value,option_value,file_path,file_name,mime_type,compressed`,{headers},'No se pudieron consultar tus respuestas.');
      return {id:response.id,submittedAt:response.submitted_at,answers};
    },
    async saveCommunityFormResponse(formId,companyId,responseId,answers,knownExisting){
      const existing=knownExisting===undefined?await this.getCommunityFormResponse(formId,companyId):knownExisting,id=existing?.id||responseId,now=new Date().toISOString();
      if(existing){
        await requestJson(`/rest/v1/community_form_responses?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:{...headers,'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify({submitted_at:now})},'No se pudo actualizar tu respuesta.');
      }else{
        await requestJson('/rest/v1/community_form_responses',{method:'POST',headers:{...headers,'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify({id,form_id:formId,company_id:String(companyId),submitted_at:now})},'No se pudo registrar tu respuesta.');
      }
      if(answers.length)await requestJson('/rest/v1/community_form_answers?on_conflict=response_id,question_id',{method:'POST',headers:{...headers,'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(answers.map(answer=>({response_id:id,question_id:answer.question_id,text_value:answer.text_value||null,option_value:answer.option_value||null,file_path:answer.file_path||null,file_name:answer.file_name||null,mime_type:answer.mime_type||null,compressed:Boolean(answer.compressed)})))},'No se pudieron guardar tus respuestas.');
      return {id,submittedAt:now,answers,previousFiles:(existing?.answers||[]).filter(answer=>answer.file_path).map(answer=>answer.file_path)};
    },
    async getCommunityFormResponseOwners(responseIds=[]){
      if(!responseIds.length)return [];
      const ids=responseIds.map(id=>`"${String(id).replaceAll('"','')}"`).join(',');
      return requestJson(`/rest/v1/community_form_responses?id=in.(${encodeURIComponent(ids)})&select=id,company_id`,{headers},'No se pudieron identificar las empresas que respondieron.');
    },
    async rpc(operation, companyId, data = {}) {
      let response;
      try {
        response = await fetchImpl(new URL('/rest/v1/rpc/pymio_api', base), {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ operation, company: String(companyId), payload: data }),
          signal: AbortSignal.timeout(15000),
        });
      } catch { throw Object.assign(new Error('No se pudo conectar con el servidor. Reintenta cuando vuelva la conexión.'), { status: 503 }); }
      const result = await response.json();
      if (!response.ok) {
        const status = /^PT(400|404|409)$/.test(result.code) ? Number(result.code.slice(2)) : result.code === '23505' ? 409 : ['23503','23514','22007','22008','22P02','22003'].includes(result.code) ? 400 : 502;
        const message = result.code?.startsWith('PT') ? result.message : status === 409 ? 'Ya existe un registro con esos datos.' : status === 400 ? 'Los datos no cumplen las reglas del inventario o tienen registros asociados.' : 'No se pudo consultar Supabase. Revisa la configuración y las migraciones.';
        throw Object.assign(new Error(message), { status, code: result.code });
      }
      return result;
    },
    async uploadProductImage(path, body, mimeType) {
      return uploadStorageImage('product-images',path,body,mimeType);
    },
    async deleteProductImage(path) {
      return deleteStorageImage('product-images',path);
    },
    async getProductImage(path) {
      return getStorageImage('product-images',path);
    },
    async uploadProfileImage(path, body, mimeType) {
      return uploadStorageImage('profile-images',path,body,mimeType);
    },
    async deleteProfileImage(path) {
      return deleteStorageImage('profile-images',path);
    },
    async getProfileImage(path) {
      return getStorageImage('profile-images',path);
    },
    async uploadCommunityImage(path,body,mimeType){return uploadStorageImage('community-profile-images',path,body,mimeType);},
    async deleteCommunityImage(path){return deleteStorageImage('community-profile-images',path);},
    async getCommunityImage(path){return getStorageImage('community-profile-images',path);},
    async uploadCommunityFile(path,body){return uploadStorageFile('community-form-files',path,body);},
    async getCommunityFile(path){return getStorageFile('community-form-files',path);},
    async deleteCommunityFile(path){return deleteStorageImage('community-form-files',path);},
  };
}
