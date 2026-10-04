const CACHE = 'swc-shell-v128-main-landing-motion';
const FILES = ['index.html','landing.css','landing.js','assets/pymio-operations-guide-v1.png','assets/pymio-cta-background-v1.png','assets/pymio-hero-orchestrator-v1.png','assets/pymio-hero-orchestrator-mobile-v1.png','assets/pymio-network-community-v2.png','assets/pymio-background-hd.png','assets/pymio-preview-bee.png','assets/pymio-preview-bee-hands.png','pymium.js','pymium.css','inicio.html','inicio.css','piloto.html','pymio.css','mobile.css','mobile.js','motion.js','assets/pymio-bee-outline.png','assets/pymio-community-bees.png','assets/pymio-logo.jpeg','assets/pymio-icon.jpeg','ecosistema.html','ecosistema.css','ecosistema.js','style.css','app.js','offline.js','dashboard.js','dashboard-data.js','dashboard.css','diagnostico.js','movimientos.js','movimientos-stock.js','movimientos-vista.js','inventario.js','inventario-detalle.js','producto-form.js','categorias.js','dashboard.html','diagnostico.html','movimientos.html','inventario.html','manifest.webmanifest','icon-192.png','icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES.map(file => new Request(file, {cache:"reload"})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const key of await caches.keys()) if(key.startsWith('swc-shell-') && key!==CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET' || url.origin!==self.location.origin || url.pathname.includes('/api/'))return;
  const asset=new URL(url);asset.search='';
  if(event.request.mode==='navigate'){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      try{
        const fresh=await fetch(event.request);
        if(fresh.ok) await cache.put(asset.href,fresh.clone());
        return fresh;
      }catch(error){
        return (await cache.match(asset.href)) || cache.match(new URL('piloto.html',self.registration.scope));
      }
    })());
    return;
  }
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const versioned=['style','script','worker'].includes(event.request.destination) || url.searchParams.has('v');
    if(versioned){
      try{
        const fresh=await fetch(event.request);
        if(fresh.ok) await cache.put(event.request,fresh.clone());
        return fresh;
      }catch(error){
        return (await cache.match(event.request)) || (await cache.match(asset.href)) || Promise.reject(error);
      }
    }
    const saved=await cache.match(asset.href);
    if(saved)return saved;
    try{
      const fresh=await fetch(event.request);
      if(fresh.ok) await cache.put(asset.href,fresh.clone());
      return fresh;
    }catch(error){throw error;}
  })());
});
