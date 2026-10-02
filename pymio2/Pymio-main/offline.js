// Durable outbox: persist before sending; the API deduplicates code/action_id.
const dbPromise = new Promise((resolve, reject) => {
  const request = indexedDB.open('swc-offline', 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore('reads', { keyPath: 'url' });
    request.result.createObjectStore('outbox', { keyPath: 'id' });
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
async function storage(store, method, value) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, method === 'get' || method === 'getAll' ? 'readonly' : 'readwrite');
    const request = tx.objectStore(store)[method](value);
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = tx.onerror = () => reject(tx.error || request.error);
  });
}
const response = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {status, headers:{'Content-Type':'application/json', ...headers}});
const changed = () => window.dispatchEvent(new Event('swc-offline-change'));
let active = null, running = null, cachedAt = null, reachable = false;
const staleReads = new Set();
const receipts = new Map();
export const apiBase = document.querySelector('meta[name="swc-api"]')?.content || (['localhost','127.0.0.1'].includes(location.hostname) ? 'http://127.0.0.1:3001' : location.origin);
const belongs = row => active && new URL(row.url).origin === active.origin && new URL(row.url).searchParams.get('company_id') === active.company;
export async function pendingMovements() { return (await storage('outbox','getAll')).filter(belongs).sort((a,b)=>a.created-b.created); }
export async function getSyncIssues() {
  const rows = await pendingMovements();
  return rows.filter(row=>row.state==='conflict').map(row=>{
    let data={};
    try { data=JSON.parse(row.body); } catch {}
    const detail=data.operation_detail || data.operation || 'Movimiento';
    const explanation=row.error && !/^Error \d+$/.test(row.error)
      ? row.error
      : 'El movimiento fue rechazado. Revisa el stock y los datos ingresados.';
    return {id:row.id,severity:'critical',title:`${detail} requiere revisión`,description:explanation,time:new Date(row.created).toLocaleString('es-CL')};
  });
}
export async function discardSyncIssue(id) {
  const row=await storage('outbox','get',id);
  if(!row || row.state!=='conflict' || !belongs(row))return false;
  await storage('outbox','delete',id);
  await synchronize();
  changed();
  return true;
}
async function network(url, options = {}) {
  if (!navigator.onLine) throw new Error('Sin conexión');
  return fetch(url, {...options, signal: AbortSignal.timeout(8000)});
}
export async function offlineFetch(input, options = {}) {
  const url = new URL(input, location.href), method = options.method || 'GET';
  if (method !== 'GET' && /^\/api\/movements(?:\/|$)/.test(url.pathname)) {
    const body = JSON.parse(options.body), id = body.action_id || body.code;
    if (!id) throw new Error('Falta el identificador del movimiento.');
    const existing = await storage('outbox','get',id);
    if (existing && (existing.url !== url.href || existing.method !== method || existing.body !== options.body)) throw new Error('Este identificador ya corresponde a otra solicitud.');
    if (!existing) await storage('outbox','put',{id,url:url.href,method,body:options.body,created:Date.now(),state:'pending'});
    changed();
    await synchronize();
    const queued = await storage('outbox','get',id);
    if (queued) return response({code:id,queued:true,conflict:queued.state === 'conflict'},202);
    const receipt = receipts.get(id); receipts.delete(id);
    return response(receipt || {code:id});
  }
  if (method !== 'GET') return network(url,options);
  let result;
  try { result = await network(url,options); reachable = result.status < 500; }
  catch { reachable = false; }
  if (result?.ok) {
    staleReads.delete(url.href);
    const data = await result.clone().json();
    try { await storage('reads','put',{url:url.href,data,at:Date.now()}); }
    catch { window.dispatchEvent(new CustomEvent('swc-storage-error')); }
    changed(); return result;
  }
  staleReads.add(url.href);
  if (result && result.status < 500) { changed(); return result; }
  let saved = await storage('reads','get',url.href);
  if (!saved && url.pathname === '/api/movements') {
    const all = new URL(url); all.searchParams.delete('from'); all.searchParams.delete('to');
    saved = await storage('reads','get',all.href);
    if (saved) saved = {...saved,data:saved.data.filter(m => (!url.searchParams.get('from') || Date.parse(m.occurred_at)>=Date.parse(url.searchParams.get('from'))) && (!url.searchParams.get('to') || Date.parse(m.occurred_at)<Date.parse(url.searchParams.get('to'))))};
  }
  if (!saved) { changed(); throw new Error('Sin conexión y sin copia local. Abre esta sección con conexión primero.'); }
  cachedAt = saved.at; changed();
  return response(saved.data,200,{'X-SWC-Offline':'true'});
}
export function synchronize() {
  if (running) return running;
  running = (async () => {
    if (!active || !navigator.onLine) return;
    let sent = false;
    for (const row of await pendingMovements()) {
      if (row.state === 'conflict') break; // Preserve order and dependent stock changes.
      let result;
      try { result = await network(row.url,{method:row.method,headers:{'Content-Type':'application/json'},body:row.body}); }
      catch { reachable = false; break; }
      reachable = result.status < 500;
      if (result.ok) {
        const receipt=await result.json().catch(()=>null);
        if(!receipt?.code) break; // An unreadable acknowledgement must be retried with the same id.
        receipts.set(row.id,receipt);
        if(receipts.size>100) receipts.delete(receipts.keys().next().value);
        await storage('outbox','delete',row.id); sent = true;
      }
      else if (result.status >= 500 || [408,429].includes(result.status)) break;
      else {
        const detail = await result.json().catch(()=>({}));
        await storage('outbox','put',{...row,state:'conflict',error:detail.error || `Error ${result.status}`}); break;
      }
    }
    if (sent) {
      cachedAt = null;
      document.dispatchEvent(new Event('inventario-actualizado'));
      document.dispatchEvent(new Event('movimientos-sincronizados'));
    }
  })().finally(()=>{running=null;changed();});
  return running;
}
export function startOffline(companyId, base = apiBase) {
  staleReads.clear(); reachable = false; cachedAt = null;
  active = {company:String(companyId),origin:new URL(base).origin};
  synchronize().catch(changed);
  // Seed the unfiltered list so date filters also work offline (API limit: 500).
  const url = new URL('/api/movements',base); url.searchParams.set('company_id',companyId);
  offlineFetch(url).catch(()=>{});
}
export function stopOffline() { active = null; changed(); }
export function setupOfflineUI() {
  const box = document.createElement('div'); box.className='data-sync'; box.dataset.state='outdated';
  const indicator=document.createElement('button'); indicator.type='button'; indicator.className='data-sync-indicator';
  indicator.setAttribute('aria-describedby','data-sync-tooltip'); indicator.setAttribute('aria-controls','data-sync-tooltip'); indicator.setAttribute('aria-expanded','false');
  indicator.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path class="data-sync-check" d="m8 12 2.5 2.5L16 9" stroke-linecap="round" stroke-linejoin="round"/><path class="data-sync-alert" d="M12 7.5v5m0 3v.1" stroke-linecap="round"/></svg>';
  const tooltip=document.createElement('div'); tooltip.className='data-sync-tooltip'; tooltip.id='data-sync-tooltip';
  const label=document.createElement('p'); label.setAttribute('role','status'); label.setAttribute('aria-live','polite');
  const retry=document.createElement('button'); retry.textContent='Actualizar Datos'; retry.type='button'; retry.className='data-sync-refresh';
  const ready=document.createElement('p');
  ready.className='data-sync-ready';
  ready.textContent='Preparando la aplicación para abrir sin conexión…';
  tooltip.append(label,ready); box.append(indicator,retry,tooltip); document.querySelector('.topbar-right').prepend(box);
  indicator.onclick=()=>{const open=box.classList.toggle('is-open');indicator.setAttribute('aria-expanded',String(open));};
  document.addEventListener('click',event=>{if(!box.contains(event.target)){box.classList.remove('is-open');indicator.setAttribute('aria-expanded','false');}});
  box.addEventListener('keydown',event=>{if(event.key==='Escape'){box.classList.remove('is-open');box.classList.add('tooltip-dismissed');indicator.setAttribute('aria-expanded','false');indicator.focus();}});
  indicator.addEventListener('blur',()=>box.classList.remove('tooltip-dismissed'));
  box.addEventListener('mouseleave',()=>box.classList.remove('tooltip-dismissed'));
  let storageError=false, refreshing=false;
  async function render() {
    try {
      const updated=navigator.onLine && reachable && !staleReads.size && !storageError && !refreshing;
      box.dataset.state=updated?'updated':'outdated';
      let status='Datos sin actualizar', message='Los datos no están actualizados. Puedes seguir trabajando sin internet; los cambios se sincronizarán al recuperar la conexión.';
      if(updated){status='Con conexión';message='La plataforma está conectada y los datos disponibles están actualizados.';}
      else if(refreshing){status='Actualizando datos';message='Actualizando datos…';}
      indicator.setAttribute('aria-label',status);
      label.textContent=message + (storageError ? ' No se pudo guardar la copia local. Revisa el espacio disponible.' : '');
    } catch { box.dataset.state='outdated';indicator.setAttribute('aria-label','Datos sin actualizar');label.textContent='No está disponible el almacenamiento local. No cierres formularios sin confirmar su guardado.'; }
  }
  let checking=false;
  async function checkConnection() {
    if(!active || checking)return;
    checking=true;
    const context=active;
    try {
      const url=new URL('/api/movements',context.origin); url.searchParams.set('company_id',context.company);
      const result=await network(url,{cache:'no-store'});
      if(active===context)reachable=result.status<500;
    } catch {if(active===context)reachable=false;}
    finally {checking=false;render();}
  }
  retry.onclick=async()=>{
    storageError=false; refreshing=true; retry.disabled=true; retry.textContent='Actualizando…'; retry.setAttribute('aria-busy','true'); render();
    try {
      await checkConnection(); await synchronize();
      if(active) {
        for(const path of ['/api/products','/api/categories','/api/movements']) {
          const url=new URL(path,active.origin);url.searchParams.set('company_id',active.company);
          await offlineFetch(url,{cache:'no-store'});
        }
      }
      document.dispatchEvent(new Event('inventario-actualizado'));
      document.dispatchEvent(new Event('movimientos-sincronizados'));
    } catch {reachable=false;}
    finally {refreshing=false;retry.disabled=false;retry.textContent='Actualizar Datos';retry.removeAttribute('aria-busy');render();}
  };
  window.addEventListener('swc-offline-change',render);
  window.addEventListener('swc-storage-error',()=>{storageError=true;render();});
  window.addEventListener('online',()=>checkConnection().then(()=>synchronize()).then(()=>{
    if(active){document.dispatchEvent(new Event('inventario-actualizado'));document.dispatchEvent(new Event('movimientos-sincronizados'));}
  }).catch(()=>{}));
  window.addEventListener('offline',render);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkConnection().then(()=>synchronize()).catch(()=>{});});
  setInterval(()=>{if(active)checkConnection().then(()=>synchronize()).catch(()=>{});},30000);
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js?v=93').then(()=>navigator.serviceWorker.ready).then(()=>{
    document.documentElement.dataset.offlineReady='true'; ready.textContent='Disponible para trabajar sin conexión.';
  }).catch(()=>{ready.textContent='No se pudo preparar la apertura sin conexión. Reintenta con conexión.';});
  else ready.textContent='Para abrir sin conexión e instalar, utiliza HTTPS o localhost.';
}
