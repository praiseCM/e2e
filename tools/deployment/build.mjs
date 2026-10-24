import { copyFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import { root, site, read, config, walk, relative } from './common.mjs';

const c = config(), origin = 'https://' + c.domain;
if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.praiser\.us$/.test(c.domain) || c.domain.length >= 64) throw new Error('Set a valid praiser.us subdomain shorter than 64 characters before building.');
const mapping = {
  'research-site/live/site.css': 'css/site.css',
  'research-site/live/app.js': 'js/app.js',
  'research-site/live/charts.js': 'js/charts.js',
  'research-site/live/data.js': 'js/data.js',
  'research-site/live/figure-export.js': 'js/figure-export.js',
  'research-site/public/favicon.svg': 'favicon.svg',
};
const write = (file, value) => { const dest = path.join(site, file); mkdirSync(path.dirname(dest), { recursive: true }); writeFileSync(dest, value); };
// Generated files are refreshed; unexpected files are never removed.
for (const dir of ['assets', 'css', 'js', 'images']) mkdirSync(path.join(site, dir), { recursive: true });
for (const [source, dest] of Object.entries(mapping)) copyFileSync(path.join(root, source), path.join(site, dest));
let html = read('research-site/index.html')
  .replaceAll('./public/favicon.svg', './favicon.svg')
  .replaceAll('./live/site.css', './css/site.css')
  .replaceAll('./live/app.js', './js/app.js');
const approved = c.publicReleaseApproved === true && c.domainConfirmed === true;
html = html.replace('</head>', `<meta name="robots" content="${approved ? 'index,follow' : 'noindex,nofollow'}"><meta name="referrer" content="strict-origin-when-cross-origin"><link rel="canonical" href="${origin}/"><meta property="og:url" content="${origin}/"><meta property="og:site_name" content="From Exposure to Experience"><meta property="og:image" content="${origin}/images/social-card.png"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="From Exposure to Experience"><meta name="twitter:description" content="Longitudinal and session-level evidence about generative AI in civil engineering education."><meta name="twitter:image" content="${origin}/images/social-card.png"><link rel="icon" href="./favicon.ico" sizes="32x32"><link rel="apple-touch-icon" href="./apple-touch-icon.png"><link rel="manifest" href="./site.webmanifest"></head>`);
write('index.html', html);
write('CNAME', c.domain + '\n');
write('.nojekyll', '');
write('robots.txt', `User-agent: *\n${approved ? 'Allow: /' : 'Disallow: /'}\nSitemap: ${origin}/sitemap.xml\n`);
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/</loc></url></urlset>\n`);
write('site.webmanifest', JSON.stringify({ name: 'From Exposure to Experience', short_name: 'Exposure to Experience', start_url: './', scope: './', display: 'browser', background_color: '#101827', theme_color: '#101827', icons: [{ src: './assets/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: './assets/icon-512.png', sizes: '512x512', type: 'image/png' }] }, null, 2) + '\n');
write('404.html', '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Page not found | From Exposure to Experience</title></head><body><main><h1>Page not found</h1><p><a href="/">Return to From Exposure to Experience</a></p></main></body></html>\n');
// Dependency-free PNG/ICO assets, using the existing site's arrow motif.
function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
function chunk(name, data) { const type = Buffer.from(name), size = Buffer.alloc(4), crc = Buffer.alloc(4); size.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([type, data]))); return Buffer.concat([size, type, data, crc]); }
function png(width, height = width) {
  const rows = Buffer.alloc((width * 4 + 1) * height), scale = Math.min(width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const nx = (x - width / 2) / scale, ny = (y - height / 2) / scale;
    const arrow = (Math.abs(ny) < .018 && nx > -.28 && nx < .28) || (nx > .1 && nx < .29 && Math.abs(Math.abs(ny) - (.29 - nx)) < .025);
    const circle = (nx + .28) ** 2 + ny ** 2 < .006;
    const color = circle ? [247, 245, 239, 255] : arrow ? [184, 155, 104, 255] : [16, 24, 39, 255];
    rows.set(color, y * (width * 4 + 1) + 1 + x * 4);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
for (const size of [192, 512]) write(`assets/icon-${size}.png`, png(size));
write('apple-touch-icon.png', png(180));
write('images/social-card.png', png(1200, 630));
const icon = png(32), icoHeader = Buffer.alloc(22); icoHeader.writeUInt16LE(1, 2); icoHeader.writeUInt16LE(1, 4); icoHeader[6] = 32; icoHeader[7] = 32; icoHeader.writeUInt16LE(1, 10); icoHeader.writeUInt16LE(32, 12); icoHeader.writeUInt32LE(icon.length, 14); icoHeader.writeUInt32LE(22, 18); write('favicon.ico', Buffer.concat([icoHeader, icon]));
// Exact artifact allowlist. The validator rejects unexpected files, including stale ones.
const files = ['index.html', ...Object.values(mapping), 'CNAME', '.nojekyll', 'robots.txt', 'sitemap.xml', 'site.webmanifest', '404.html', 'assets/icon-192.png', 'assets/icon-512.png', 'apple-touch-icon.png', 'images/social-card.png', 'favicon.ico', 'assets/deployment-manifest.json'];
write('assets/deployment-manifest.json', JSON.stringify({ files: [...new Set(files)].sort(), domain: c.domain, externalRuntimeDependencies: 0 }, null, 2) + '\n');
if (existsSync(site)) for (const file of walk(site)) if (!files.includes(path.relative(site, file).split(path.sep).join('/'))) throw new Error('Unexpected artifact file retained for review: ' + relative(file));
console.log(`PASS: copied static website and generated production assets into e2e/ (${new Set(files).size} files). Originals preserved.`);
