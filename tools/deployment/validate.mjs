import assert from 'node:assert/strict';
import { readFileSync, existsSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { root, site, config, read, walk, credentialHits, privatePath, releaseProblems } from './common.mjs';

const c = config(), manifest = JSON.parse(read('e2e/assets/deployment-manifest.json'));
const actual = walk(site, new Set()).map(f => path.relative(site, f).split(path.sep).join('/')).sort();
assert.deepEqual(actual, manifest.files, 'Artifact contains missing or unapproved files');
assert.equal(manifest.domain, c.domain);
for (const dir of ['assets', 'css', 'js', 'images']) assert.ok(lstatSync(path.join(site, dir)).isDirectory());
const html = read('e2e/index.html'), active = html.replace(/<template\b[\s\S]*?<\/template>/g, '');
const ids = [...active.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
assert.equal(ids.length, new Set(ids).size, 'Duplicate active IDs');
for (const section of ['home', 'study', 'findings', 'experience', 'methods', 'literature', 'resources', 'insights']) assert.ok(ids.includes(section), 'Missing section: ' + section);
assert.equal((html.match(/<template /g) || []).length, 37);
assert.equal((active.match(/class="strategy-card"/g) || []).length, 15);
assert.equal((active.match(/class="reference-item"/g) || []).length, 21);
let links = 0;
function checkLink(value, from, isAsset = false) {
  if (!value || value.startsWith('data:') || value.startsWith('blob:') || value.startsWith('mailto:') || value.startsWith('tel:')) return;
  assert.ok(!/^(?:http:|\/\/|javascript:)/i.test(value), 'Insecure reference in ' + from + ': ' + value);
  if (/^https:/.test(value)) { if (isAsset) assert.ok(value.startsWith('https://' + c.domain + '/'), 'External runtime dependency: ' + value); return; }
  const url = new URL(value, 'https://' + c.domain + '/' + from);
  const file = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html';
  const target = path.join(site, file);
  assert.ok(target.startsWith(site + path.sep), 'Path escapes artifact: ' + value);
  assert.ok(existsSync(target), 'Missing target from ' + from + ': ' + value);
  if (url.hash && file === 'index.html') assert.ok(ids.includes(decodeURIComponent(url.hash.slice(1))), 'Broken anchor: ' + value);
  links++;
}
for (const file of actual) {
  const full = path.join(site, file);
  assert.ok(!lstatSync(full).isSymbolicLink(), 'Symbolic link in artifact');
  assert.ok(!privatePath(file), 'Private file in artifact: ' + file);
  const bytes = readFileSync(full);
  if (bytes.includes(0)) continue;
  const text = bytes.toString('utf8');
  assert.equal(credentialHits(text).length, 0, 'Possible credential: ' + file);
  assert.ok(!/\b(?:analysis_id|record_id|identifier_to_email|P\d{3}|G[12]_S\d+_R\d+)\b/.test(text), 'Participant-level data marker: ' + file);
  assert.ok(!/sourceHashes|CAEE_|\b(?:Analysis(?:-rev\.[\d.]+)?|Figures|References)[/\\]|\b[A-Z]:[/\\]|OneDrive|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text), 'Private source reference, local path or email in public content: ' + file);
  if (file.endsWith('.html')) for (const tag of text.matchAll(/<(?:a|link|script|img|source|video|audio|iframe|form)\b[^>]*>/g)) {
    for (const attr of tag[0].matchAll(/\b(?:href|src|poster|action)="([^"]+)"/g)) checkLink(attr[1], file, !/^<a\b/.test(tag[0]));
    for (const srcset of tag[0].matchAll(/\bsrcset="([^"]+)"/g)) for (const entry of srcset[1].split(',')) checkLink(entry.trim().split(/\s+/)[0], file, true);
  }
  if (file.endsWith('.css')) for (const m of text.matchAll(/(?:url\(\s*['"]?([^)'"\s]+)|@import\s+['"]([^'"]+))/g)) checkLink(m[1] || m[2], file, true);
  if (file.endsWith('.js')) {
    const result = spawnSync(process.execPath, ['--check', full], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    for (const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(|\bfetch\s*\()\s*['"]([^'"]+)['"]/g)) checkLink(m[1], file, true);
  }
}
const webmanifest = JSON.parse(read('e2e/site.webmanifest'));
for (const icon of webmanifest.icons) checkLink(icon.src, 'site.webmanifest', true);
assert.equal(webmanifest.start_url, './');
assert.equal(read('e2e/CNAME').trim(), c.domain);
assert.ok(html.includes('<link rel="canonical" href="https://' + c.domain + '/">'));
assert.ok(html.includes('property="og:url" content="https://' + c.domain + '/"'));
assert.ok(read('e2e/sitemap.xml').includes('<loc>https://' + c.domain + '/</loc>'));
const approved = c.publicReleaseApproved === true && c.domainConfirmed === true;
assert.ok(html.includes(approved ? 'content="index,follow"' : 'content="noindex,nofollow"'));
assert.ok(read('e2e/robots.txt').includes(approved ? 'Allow: /' : 'Disallow: /'));
const data = await import(pathToFileURL(path.join(site, 'js/data.js')).href);
assert.equal(data.research.provenance, undefined, 'Private source metadata must not ship');
assert.equal(data.research.sessions.length, 23);
assert.equal(data.research.sessions.reduce((sum, row) => sum + row.submissions, 0), 1634);
assert.deepEqual(data.research.sessions.filter(row => row.course === 'G1').map(row => row.session), [4, 5, 6, 7, 8, 9, 10]);
assert.equal(data.research.pulse.G1.submissions, 515);
assert.equal(data.research.pulse.G1.valid_ratings, 514);
assert.equal(data.research.pulse.G1.upper_two_ratings, 495);
assert.equal(data.research.pulse.G1.course_related_unresolved + data.research.pulse.G2.course_related_unresolved, 73);
assert.equal(data.research.pulse.G1.upper_two_with_unresolved + data.research.pulse.G2.upper_two_with_unresolved, 67);
assert.ok(!/Week 7 was unavailable|443 records across six|1,562|64<span> \/ 70/.test(html), 'Stale session claims');
// Source comparison is available locally, but not required in a public checkout.
for (const [key, source] of [['research', 'research.json'], ['searches', 'searches.json'], ['bibliography', 'bibliography.json']]) {
  if (existsSync(path.join(root, 'research-site/src/data', source))) assert.deepEqual(data[key], JSON.parse(read('research-site/src/data/' + source)), 'Research data changed during copying');
}
const charts = await import(pathToFileURL(path.join(site, 'js/charts.js')).href);
for (const course of ['G1', 'G2']) for (const item of data.indicators) for (const width of [300, 900]) assert.ok(!/NaN|undefined/.test(charts.distributionPlot(course, item.id, width)));
for (const course of ['G1', 'G2']) for (const view of ['use', 'rating']) assert.ok(!/NaN|undefined/.test(charts.sessionPlot(course, view, 320)));
console.log(`PASS: ${actual.length} deployment files, ${links} local references, navigation anchors, 37 interactive templates, JS syntax, unchanged research data, responsive charts, SEO, and no detected mixed-content references or participant markers.`);
if (process.argv.includes('--release')) {
  const problems = releaseProblems();
  if (process.env.GITHUB_REPOSITORY && process.env.GITHUB_REPOSITORY.toLowerCase() !== c.repository.toLowerCase()) problems.push('Workflow repository does not match deployment.config.json.');
  if (process.env.GITHUB_REF && process.env.GITHUB_REF !== 'refs/heads/' + c.branch) problems.push('Deploy only the configured production branch.');
  for (const problem of problems) console.error('BLOCK: ' + problem);
  if (problems.length) process.exitCode = 1;
}
