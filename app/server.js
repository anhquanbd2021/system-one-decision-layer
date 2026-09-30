// Zero-dep HTTP server: static lab + JSON API over the two use cases.
// Binds 0.0.0.0:$PORT on Render; 127.0.0.1:5050 locally by default.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runOrder } from '../usecase-gate/pipeline.js';
import { MENU } from '../usecase-gate/menu.js';
import { judgeItem } from '../usecase-judge/cascade.js';
import { hazardScreen } from '../usecase-judge/guard.js';

const ROOT = fileURLToPath(new URL('../public', import.meta.url));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

const json = (res, code, obj) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
};

const readBody = async (req, limit = 16_384) => {
  let body = '';
  for await (const c of req) {
    body += c;
    if (body.length > limit) throw new Error('payload too large');
  }
  return body ? JSON.parse(body) : {};
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/health') return json(res, 200, { status: 'ok' });
    if (url.pathname === '/version') return json(res, 200, {
      service: 'system-one-decision-layer',
      commit: process.env.RENDER_GIT_COMMIT || 'local',
    });
    if (url.pathname === '/api/menu') return json(res, 200, { menu: MENU });

    if (req.method === 'POST' && url.pathname === '/api/order') {
      const { text, answer } = await readBody(req);
      if (typeof text !== 'string' || !text.trim()) return json(res, 400, { error: 'text required' });
      return json(res, 200, await runOrder(text.slice(0, 500), { answer }));
    }

    if (req.method === 'POST' && url.pathname === '/api/judge') {
      const { reply } = await readBody(req);
      if (typeof reply !== 'string' || !reply.trim()) return json(res, 400, { error: 'reply required' });
      const text = reply.slice(0, 2000);
      const guard = await hazardScreen(text);
      if (!guard.allowed) return json(res, 200, { guard, judge: null });
      return json(res, 200, { guard, judge: await judgeItem({ id: 'web', reply: text }) });
    }

    if (req.method !== 'GET') return json(res, 405, { error: 'method' });
    const file = normalize(join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname));
    if (!file.startsWith(ROOT)) return json(res, 403, { error: 'forbidden' });
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch (e) {
    json(res, e.message === 'payload too large' ? 413 : 404, { error: e.message });
  }
});

const port = process.env.PORT || 5050;
const host = process.env.RENDER ? '0.0.0.0' : (process.env.HOST || '127.0.0.1');
server.listen(port, host, () => console.log(`demo on http://${host}:${port}`));
