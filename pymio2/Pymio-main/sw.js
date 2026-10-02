const CACHE = 'swc-shell-v93-main-integrated';
const FILES = ['assets/pymio-background-hd.png','assets/pymio-preview-bee-hands.png','pymium.js','pymium.css','inicio.html','inicio.css','piloto.html','pymio.css','motion.js','assets/pymio-bee-outline.png','assets/pymio-community-bees.png','assets/pymio-logo.jpeg','assets/pymio-icon.jpeg','ecosistema.html','ecosistema.css','ecosistema.js','style.css','app.js','offline.js','dashboard.js','dashboard.css','diagnostico.js','movimientos.js','movimientos-stock.js','movimientos-vista.js','inventario.js','inventario-detalle.js','producto-form.js','categorias.js','dashboard.html','diagnostico.html','movimientos.html','inventario.html','manifest.webmanifest','icon-192.png','icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES.map(file => new Request(file, {cache:"reload"})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const key of await caches.keys()) if(key.startsWith('swc-shell-') && key!==CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET' || url.origin!==self.location.origin || url.pathname.includes('/api/'))return;
  const asset=new URL(url);asset.search='';
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE), saved=await cache.match(asset.href);
    if(saved)return saved;
    try{return await fetch(event.request);}
    catch(error){if(event.request.mode==='navigate')return cache.match(new URL('piloto.html','pymio.css','motion.js','assets/pymio-bee-outline.png','assets/pymio-community-bees.png','assets/pymio-logo.jpeg','assets/pymio-icon.jpeg','ecosistema.html','ecosistema.css','ecosistema.js',self.registration.scope));throw error;}
  })());
});
