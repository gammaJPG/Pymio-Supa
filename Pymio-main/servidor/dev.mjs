import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createInventoryServer } from './server.mjs';
import { createSupabase } from './supabase.mjs';

const root = new URL('../', import.meta.url);
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.png':'image/png', '.jpeg':'image/jpeg', '.webmanifest':'application/manifest+json' };
export function createWebServer() {
  return http.createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    const file = path === '/' ? 'piloto.html' : path.slice(1);
    // Only public files: never serve .env, server sources or database exports.
    if (!['GET','HEAD'].includes(req.method) || !/^(?:[a-zA-Z0-9_-]+\.(?:html|js|css|png|webmanifest)|assets\/[a-zA-Z0-9_-]+\.(?:png|jpeg))$/.test(file)) {
      res.writeHead(404); res.end(); return;
    }
    try {
      const data = await readFile(new URL(file, root));
      res.writeHead(200, { 'Content-Type': types[file.slice(file.lastIndexOf('.'))], 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch { res.writeHead(404); res.end(); }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let supabase;
  try { supabase = createSupabase(); }
  catch (error) {
    console.log(error.message);
    supabase = { async rpc() { throw Object.assign(new Error('Configura el proyecto de Supabase en servidor/.env para cargar los datos.'), {status:503}); } };
  }
  const origins = (process.env.FRONTEND_ORIGINS || 'http://127.0.0.1:5500,http://localhost:5500').split(',').map(s=>s.trim());
  const api = createInventoryServer(supabase, origins);
  const web = createWebServer();
  for (const server of [api, web]) server.on('error', error => { console.error(error.message); api.close(); web.close(); process.exitCode=1; });
  api.listen(Number(process.env.PORT || 3001), '127.0.0.1');
  web.listen(5500, '127.0.0.1', () => console.log('Pymio: http://127.0.0.1:5500/piloto.html'));
}
