import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import macLookup from './api/mac-lookup.js';
import portCheck from './api/port-check.js';

// Vite does not serve Vercel's /api directory on its own.
// Mirror the two serverless handlers locally without exposing arbitrary network routes.
function localApi() {
  const routes = new Map([['/api/mac-lookup', macLookup], ['/api/port-check', portCheck]]);
  const mount = (server) => server.middlewares.use(async (req, res, next) => {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;
    const handler = routes.get(pathname);
    if (!handler) return next();
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (data) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(data));
      return res;
    };
    try {
      if (req.method === 'POST') {
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 16384) return res.status(413).json({ error: 'Request too large' });
        }
        try { req.body = body ? JSON.parse(body) : {}; }
        catch { return res.status(400).json({ error: 'Invalid JSON body' }); }
      }
      await handler(req, res);
    } catch (error) {
      console.error('Local API error:', error);
      if (!res.writableEnded) res.status(500).json({ error: 'Local server error' });
    }
  });
  return { name: 'dashdash-local-api', configureServer(server) { mount(server); }, configurePreviewServer(server) { mount(server); } };
}

export default defineConfig({ plugins: [react(), localApi()] });
