import { handleAsNodeRequest } from 'cloudflare:node';
import { createInventoryServer } from '../servidor/server.mjs';
import { createSupabase } from '../servidor/supabase.mjs';

const apiPort = 3001;
const origins = (process.env.FRONTEND_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
const api = createInventoryServer(createSupabase(), origins, {
  sessionSecret: process.env.SESSION_SECRET,
  pilotPassword: process.env.PILOT_PASSWORD,
  secureCookie: true
});
api.listen(apiPort);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleAsNodeRequest(apiPort, request);
    return env.ASSETS.fetch(request);
  }
};
