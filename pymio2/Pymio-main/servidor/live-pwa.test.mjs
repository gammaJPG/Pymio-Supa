import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createInventoryServer} from './server.mjs';

const read=path=>readFile(new URL(path,import.meta.url),'utf8');

test('Tiempo real: usa un stream autenticado y conserva un respaldo de actualización',async()=>{
  const [client,server,supabase,migration,network]=await Promise.all([
    read('../live-sync.js'),read('./server.mjs'),read('./supabase.mjs'),read('../supabase/migrations/038_live_sync_versions.sql'),read('../ecosistema.js'),
  ]);
  assert.match(client,/new EventSource\(`\$\{base\}\/api\/live\/stream`,\{withCredentials:true\}\)/);
  assert.match(client,/setInterval\(\(\)=>\{if\(!document\.hidden&&navigator\.onLine\)emit\('fallback'\);\},15000\)/);
  assert.match(server,/url\.pathname==='\/api\/live\/stream'/);
  assert.match(server,/Content-Type':'text\/event-stream/);
  assert.match(server,/pool\.liveVersion\(companyId\)/);
  assert.match(supabase,/\/rest\/v1\/rpc\/pymio_live_version/);
  assert.match(migration,/SECURITY INVOKER/);
  assert.match(migration,/REVOKE ALL ON FUNCTION public\.pymio_live_version\(bigint\) FROM PUBLIC,anon,authenticated/);
  assert.match(network,/messages\/stream[^\n]+withCredentials:true/);
  assert.match(network,/network_changed/);
});

test('Tiempo real: el servidor transmite la firma empresarial por SSE',async()=>{
  const server=createInventoryServer({liveVersion:async company=>({company,products:[1,'ahora']})},[]);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const {port}=server.address();
    const response=await fetch(`http://127.0.0.1:${port}/api/live/stream?company_id=7`);
    assert.equal(response.status,200);
    assert.match(response.headers.get('content-type'),/^text\/event-stream/);
    const reader=response.body.getReader(),decoder=new TextDecoder();let chunk='';
    for(let attempt=0;attempt<3&&!chunk.includes('event: business');attempt+=1){const next=await reader.read();chunk+=decoder.decode(next.value||new Uint8Array(),{stream:!next.done});}
    assert.match(chunk,/event: business/);
    assert.match(chunk,/"company":"7"/);
    await reader.cancel();
  } finally {
    server.closeAllConnections?.();
    await new Promise(resolve=>server.close(resolve));
  }
});

test('Instalación móvil: ofrece instalación nativa y una guía segura cuando no está disponible',async()=>{
  const [prompt,manifest,html,styles,worker,cloudflareBuild]=await Promise.all([
    read('../install-prompt.js'),read('../manifest.webmanifest'),read('../piloto.html'),read('../mobile.css'),read('../sw.js'),read('../scripts/build-cloudflare.mjs'),
  ]);
  const parsed=JSON.parse(manifest);
  assert.equal(parsed.display,'standalone');
  assert.equal(parsed.name,'Pymio');
  assert.equal(parsed.background_color,'#FFF7DA');
  assert.equal(parsed.theme_color,'#FFF7DA');
  assert.ok(parsed.icons.some(icon=>icon.sizes==='192x192'&&icon.type==='image/png'));
  assert.ok(parsed.icons.some(icon=>icon.sizes==='512x512'&&icon.type==='image/png'));
  assert.equal(parsed.icons.some(icon=>icon.type==='image/jpeg'),false);
  assert.match(prompt,/beforeinstallprompt/);
  assert.match(prompt,/dismissed-until:v2/);
  assert.match(prompt,/24\*60\*60\*1000/);
  assert.match(prompt,/deferredPrompt\.prompt\(\)/);
  assert.match(prompt,/appinstalled/);
  assert.match(prompt,/display-mode: standalone/);
  assert.match(prompt,/Agregar a pantalla de inicio/);
  assert.match(prompt,/pymio-icon-transparent\.png/);
  assert.match(html,/apple-mobile-web-app-capable/);
  assert.match(html,/splash-01-ruta-inteligente\.png/);
  assert.match(styles,/\.pwa-install-prompt\{/);
  assert.match(worker,/'live-sync\.js','install-prompt\.js'/);
  assert.match(worker,/pymio-icon-transparent\.png/);
  assert.match(worker,/splash-01-ruta-inteligente\.png/);
  assert.match(cloudflareBuild,/copyPublicAssets\(sourcePath, destinationPath\)/);
  const app=await read('../app.js');
  assert.match(app,/serviceWorker\.register\('\.\/sw\.js\?v=198'\)/);
});

test('Marca: los iconos web e instalables conservan transparencia RGBA',async()=>{
  const [master,small,large,index,platform]=await Promise.all([
    readFile(new URL('../assets/pymio-icon-transparent.png',import.meta.url)),
    readFile(new URL('../icon-192.png',import.meta.url)),
    readFile(new URL('../icon-512.png',import.meta.url)),
    read('../index.html'),read('../piloto.html'),
  ]);
  for(const image of [master,small,large]){
    assert.equal(image.subarray(1,4).toString(),'PNG');
    assert.equal(image[25],6,'El PNG debe usar color RGBA con canal alfa');
  }
  assert.match(index,/pymio-icon-transparent\.png/);
  assert.match(platform,/pymio-icon-transparent\.png/);
  assert.doesNotMatch(index,/pymio-icon\.jpeg/);
  assert.doesNotMatch(platform,/pymio-icon\.jpeg/);
});

test('Supabase: las funciones internas no quedan expuestas como RPC públicas',async()=>{
  const migration=await read('../supabase/migrations/039_harden_internal_triggers.sql');
  assert.match(migration,/ALTER FUNCTION public\.inventory_touch_product_updated_at\(\)\s+SET search_path=public,pg_temp/);
  assert.match(migration,/REVOKE ALL ON FUNCTION public\.pymio_notify_community_event\(\) FROM PUBLIC,anon,authenticated/);
  assert.match(migration,/REVOKE ALL ON FUNCTION public\.pymio_notify_community_form\(\) FROM PUBLIC,anon,authenticated/);
});

test('Tiempo real: incluye cambios del Centro de ayuda cuando su esquema está disponible',async()=>{
  const [support,live]=await Promise.all([read('../supabase/migrations/033_support_tickets.sql'),read('../supabase/migrations/040_support_live_sync.sql')]);
  assert.match(support,/CREATE TABLE IF NOT EXISTS public\.support_tickets/);
  assert.doesNotMatch(support,/RAISE EXCEPTION 'No existe la cuenta/);
  assert.match(live,/'support'.+public\.support_tickets/s);
});
