// Agent API on its own (for the VPS): node server.mjs   ->  http://127.0.0.1:8787/api/...
// Env: ANTHROPIC_API_KEY or OPENROUTER_API_KEY (one is required; OPENROUTER_MODEL optional, default anthropic/claude-opus-5.5), PORT (8787), MK_PROXY_SECRET (requests must carry it in "x-mk-proxy"; set the same
// value on the Cloudflare Pages project), SITE_ROOT (folder holding mekaneko/nekopult-demo.json; default ./site).
import { createServer } from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle } from './api.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8787);
const secret = process.env.MK_PROXY_SECRET || '';
const siteRoot = process.env.SITE_ROOT || join(HERE, 'site');
if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENROUTER_API_KEY) console.warn('Neither ANTHROPIC_API_KEY nor OPENROUTER_API_KEY is set: the agents will report offline');
if (!secret) console.warn('MK_PROXY_SECRET is not set: anyone who finds this server can use the agents');

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok'); return; }
  if (!url.pathname.startsWith('/api/')) { res.writeHead(404).end(); return; }
  if (secret && req.headers['x-mk-proxy'] !== secret) { res.writeHead(403, { 'Content-Type': 'text/plain' }).end('forbidden'); return; }
  try { await handle(req, res, url, siteRoot); }
  catch (e) { if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' }); res.end('api error'); console.error(e); }
}).listen(port, '127.0.0.1', () => console.log(`MEKANEKO agents API on http://127.0.0.1:${port}/api/`));
