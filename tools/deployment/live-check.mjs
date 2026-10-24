import assert from 'node:assert/strict';
import { resolveCname } from 'node:dns/promises';
import { config, read, releaseProblems } from './common.mjs';

const c = config(), problems = releaseProblems();
if (problems.length) { console.error(problems.map(p => 'BLOCK: ' + p).join('\n')); process.exit(1); }
const target = c.repository.split('/')[0].toLowerCase() + '.github.io';
const aliases = await resolveCname(c.domain);
assert.ok(aliases.some(alias => alias.replace(/\.$/, '').toLowerCase() === target), 'Expected DNS-only CNAME to ' + target + '; got ' + aliases.join(', '));
const base = 'https://' + c.domain;
const response = await fetch(base + '/', { signal: AbortSignal.timeout(15000) });
assert.equal(response.status, 200, 'Homepage failed');
assert.ok(response.url.startsWith(base + '/'), 'Unexpected HTTPS redirect');
const html = await response.text();
assert.ok(html.includes('id="findings"') && html.includes('./js/app.js'), 'Hosted site is not the prepared artifact');
assert.ok(!/(?:src|href)=["'](?:http:|\/\/)/i.test(html), 'Insecure hosted references');
const files = JSON.parse(read('e2e/assets/deployment-manifest.json')).files.filter(f => f !== '.nojekyll');
for (const file of files) {
  const result = await fetch(base + '/' + file, { signal: AbortSignal.timeout(15000) });
  assert.equal(result.status, 200, 'Hosted asset failed: ' + file);
  assert.ok(result.url.startsWith(base + '/'), 'Hosted asset redirected off-domain: ' + file);
  if (file.endsWith('.js')) assert.match(result.headers.get('content-type') || '', /javascript/);
  if (file.endsWith('.css')) assert.match(result.headers.get('content-type') || '', /text\/css/);
  await result.arrayBuffer();
}
const redirect = await fetch('http://' + c.domain + '/', { redirect: 'manual', signal: AbortSignal.timeout(15000) });
assert.ok([301, 302, 307, 308].includes(redirect.status), 'HTTP must redirect to HTTPS');
assert.equal(new URL(redirect.headers.get('location'), 'http://' + c.domain).origin, base);
console.log(`PASS: live CNAME to ${target}, trusted HTTPS, HTTP redirect, expected homepage and ${files.length} hosted assets. TLS certificate verification used Node defaults.`);
