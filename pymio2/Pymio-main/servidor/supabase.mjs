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
      throw Object.assign(new Error('No se pudo conectar con Supabase. Reintenta cuando vuelva la conexión.'), { status: 503 });
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = result.msg || result.message || result.error_description || fallback;
      throw Object.assign(new Error(message), { status: response.status, code: result.code });
    }
    return result;
  };
  const uploadStorageImage = async (bucket, path, body) => {
    let response;
    try {
      response = await fetchImpl(new URL(`/storage/v1/object/${bucket}/${path}`, base), {
        method: 'POST', headers: {...headers, 'Content-Type':'image/webp', 'x-upsert':'false'}, body,
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
      if(operation==='post.update'){
        const {post_id,...payload}=data;
        const query=`/rest/v1/network_posts?id=eq.${encodeURIComponent(post_id)}&author_company_id=eq.${encodeURIComponent(String(companyId))}`;
        const updated=await requestJson(query,{
          method:'PATCH',headers:{...headers,'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(payload),
        },'No se pudo actualizar la publicación.');
        if(!Array.isArray(updated)||!updated.length)throw Object.assign(new Error('Solo la empresa creadora puede editar esta publicación.'),{status:403});
        return requestJson('/rest/v1/rpc/pymio_network',{
          method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({operation:'bootstrap',company:String(companyId),payload:{}}),
        },'No se pudo actualizar RED Pymio.');
      }
      return requestJson('/rest/v1/rpc/pymio_network', {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation, company: String(companyId), payload: data }),
      }, 'No se pudo consultar RED Pymio. Revisa la configuración de la red.');
    },
    async community(operation,companyId,data={}){
      return requestJson('/rest/v1/rpc/pymio_community',{
        method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({operation,company:String(companyId),payload:data}),
      },'No se pudo consultar la comunidad. Revisa las migraciones de Supabase.');
    },
    async getCommunityFormResponse(formId,companyId){
      const query=`?form_id=eq.${encodeURIComponent(formId)}&company_id=eq.${encodeURIComponent(companyId)}&select=id,submitted_at`;
      const responses=await requestJson('/rest/v1/community_form_responses'+query,{headers},'No se pudo consultar tu respuesta.');
      const response=responses[0];if(!response)return null;
      const answers=await requestJson(`/rest/v1/community_form_answers?response_id=eq.${encodeURIComponent(response.id)}&select=question_id,text_value,option_value,file_path,file_name,mime_type,compressed`,{headers},'No se pudieron consultar tus respuestas.');
      return {id:response.id,submittedAt:response.submitted_at,answers};
    },
    async saveCommunityFormResponse(formId,companyId,responseId,answers){
      const existing=await this.getCommunityFormResponse(formId,companyId),id=existing?.id||responseId,now=new Date().toISOString();
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
      } catch { throw Object.assign(new Error('No se pudo conectar con Supabase. Reintenta cuando vuelva la conexión.'), { status: 503 }); }
      const result = await response.json();
      if (!response.ok) {
        const status = /^PT(400|404|409)$/.test(result.code) ? Number(result.code.slice(2)) : result.code === '23505' ? 409 : ['23503','23514','22007','22008','22P02','22003'].includes(result.code) ? 400 : 502;
        const message = result.code?.startsWith('PT') ? result.message : status === 409 ? 'Ya existe un registro con esos datos.' : status === 400 ? 'Los datos no cumplen las reglas del inventario o tienen registros asociados.' : 'No se pudo consultar Supabase. Revisa la configuración y las migraciones.';
        throw Object.assign(new Error(message), { status, code: result.code });
      }
      return result;
    },
    async uploadProductImage(path, body) {
      return uploadStorageImage('product-images',path,body);
    },
    async deleteProductImage(path) {
      return deleteStorageImage('product-images',path);
    },
    async getProductImage(path) {
      return getStorageImage('product-images',path);
    },
    async uploadProfileImage(path, body) {
      return uploadStorageImage('profile-images',path,body);
    },
    async deleteProfileImage(path) {
      return deleteStorageImage('profile-images',path);
    },
    async getProfileImage(path) {
      return getStorageImage('profile-images',path);
    },
    async uploadCommunityFile(path,body){return uploadStorageFile('community-form-files',path,body);},
    async getCommunityFile(path){return getStorageFile('community-form-files',path);},
    async deleteCommunityFile(path){return deleteStorageImage('community-form-files',path);},
  };
}
