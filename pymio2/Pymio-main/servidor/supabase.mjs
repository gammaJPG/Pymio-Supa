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
      let response;
      try {
        response = await fetchImpl(new URL('/storage/v1/object/product-images/' + path, base), {
          method: 'POST', headers: {...headers, 'Content-Type':'image/webp', 'x-upsert':'false'}, body,
          signal: AbortSignal.timeout(20000),
        });
      } catch { throw Object.assign(new Error('No se pudo conectar con Supabase Storage.'), {status:503}); }
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw Object.assign(new Error(detail.message || 'No se pudo guardar la imagen en Supabase Storage.'), {status: response.status === 409 ? 409 : 502});
      }
      return {path};
    },
    async deleteProductImage(path) {
      let response;
      try {
        response = await fetchImpl(new URL('/storage/v1/object/product-images/' + path, base), {
          method: 'DELETE', headers, signal: AbortSignal.timeout(15000),
        });
      } catch { throw Object.assign(new Error('No se pudo conectar con Supabase Storage.'), {status:503}); }
      if (!response.ok && response.status !== 404) throw Object.assign(new Error('No se pudo eliminar la imagen anterior.'), {status:502});
    },
    async getProductImage(path) {
      let response;
      try {
        response = await fetchImpl(new URL('/storage/v1/object/public/product-images/' + path, base), {
          headers, signal: AbortSignal.timeout(15000),
        });
      } catch { throw Object.assign(new Error('No se pudo conectar con Supabase Storage.'), {status:503}); }
      if (!response.ok) throw Object.assign(new Error('La imagen no está disponible.'), {status:response.status === 404 ? 404 : 502});
      return Buffer.from(await response.arrayBuffer());
    },
  };
}
