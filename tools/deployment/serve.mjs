import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { site } from './common.mjs';

const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' };
export function createSiteServer() {
  return createServer((req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = path.resolve(site, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(site + path.sep) || pathname.split('/').some(part => part.startsWith('.'))) { res.writeHead(403); res.end('Forbidden'); return; }
      if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404, { 'content-type': types['.html'] }); res.end(readFileSync(path.join(site, '404.html'))); return; }
      res.writeHead(200, { 'content-type': types[path.extname(file)] || 'text/plain; charset=utf-8', 'x-content-type-options': 'nosniff' });
      res.end(readFileSync(file));
    } catch { res.writeHead(400); res.end('Bad request'); }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createSiteServer().listen(5182, '127.0.0.1', () => console.log('Preview: http://127.0.0.1:5182 (e2e/ only)'));
}
