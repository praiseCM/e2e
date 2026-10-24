import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, readFileSync, writeFileSync, mkdtempSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { root } from './common.mjs';
import { createSiteServer } from './serve.mjs';

const executable = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);
assert.ok(executable, 'Chrome/Edge is required; set CHROME_PATH to its executable.');
const audit = path.join(root, '.deployment-audit'); mkdirSync(audit, { recursive: true });
const profile = mkdtempSync(path.join(audit, 'chrome-'));
const downloads = path.join(profile, 'downloads'); mkdirSync(downloads);
const server = createSiteServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = 'http://127.0.0.1:' + server.address().port;
const chrome = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let ws, next = 0;
const pending = new Map(), errors = [], failed = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const timeout = setTimeout(() => { console.error('FAIL: browser validation timed out.'); chrome.kill(); server.closeAllConnections(); process.exit(1); }, 45000);
chrome.on('error', error => errors.push(error.message));
try {
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let n = 0; n < 100 && !existsSync(portFile); n++) { if (chrome.exitCode !== null) throw new Error('Browser exited before DevTools startup.'); await delay(100); }
  assert.ok(existsSync(portFile), 'Chrome did not expose DevTools.');
  const port = readFileSync(portFile, 'utf8').split('\n')[0];
  const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl); await once(ws, 'open');
  ws.addEventListener('message', event => {
    const msg = JSON.parse(event.data);
    if (msg.id) { const resolve = pending.get(msg.id); pending.delete(msg.id); resolve?.(msg); }
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    if (msg.method === 'Network.loadingFailed') failed.push(msg.params.errorText);
    if (msg.method === 'Network.responseReceived' && msg.params.response.status >= 400) failed.push(msg.params.response.url + ': ' + msg.params.response.status);
  });
  const call = async (method, params = {}) => { const id = ++next; const result = new Promise(resolve => pending.set(id, resolve)); ws.send(JSON.stringify({ id, method, params })); const response = await result; assert.ok(!response.error, JSON.stringify(response.error)); return response.result; };
  const evaluate = async expression => { if (typeof expression === 'function') expression = '(' + expression.toString() + ')()'; const response = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); assert.ok(!response.exceptionDetails, JSON.stringify(response.exceptionDetails)); return response.result.value; };
  await call('Runtime.enable'); await call('Network.enable'); await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await call('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
  await call('Page.navigate', { url: origin });
  for (let i = 0; i < 80; i++) { if (await evaluate('document.readyState === "complete" && !!document.querySelector("[data-action]")')) break; await delay(100); }
  assert.ok(await evaluate('["home","study","findings","experience","methods","literature","resources","insights"].every(id=>document.querySelector("main section#"+id))'));
  assert.equal(await evaluate('document.querySelectorAll(".strategy-card:not([hidden])").length'), 0);
  assert.equal(await evaluate('document.querySelectorAll(".reference-item:not([hidden])").length'), 0);
  await evaluate(() => document.querySelector('[aria-label="Search strategy group"]').querySelectorAll('button')[1].click());
  assert.equal(await evaluate('Array.from(document.querySelectorAll(".strategy-card")).filter(e=>!e.hidden).length'), 6);
  await evaluate(() => document.querySelector('[aria-label="Search strategy group"]').querySelectorAll('button')[0].click());
  assert.equal(await evaluate('Array.from(document.querySelectorAll(".strategy-card")).filter(e=>!e.hidden).length'), 15);
  await evaluate(() => document.querySelector('[aria-label="Distribution course filter"]').querySelectorAll('button')[2].click());
  assert.ok(await evaluate('!!document.querySelector("#findings [aria-pressed=true]")'));
  const theme = await evaluate('document.documentElement.dataset.theme');
  await evaluate(() => document.querySelector('button[aria-label^="Switch to"]').click());
  assert.notEqual(await evaluate('document.documentElement.dataset.theme'), theme);
  await evaluate(() => document.querySelector('a[href="#methods"]').click());
  assert.equal(await evaluate('location.hash'), '#methods');
  assert.ok(await evaluate('Array.from(document.querySelectorAll("svg")).every(e=>!e.outerHTML.includes("NaN"))'));
  const screenshot = await call('Page.captureScreenshot', { format: 'png' }); writeFileSync(path.join(audit, 'desktop.png'), Buffer.from(screenshot.data, 'base64'));
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate('document.querySelector(".menu-toggle").click()');
  assert.equal(await evaluate('document.querySelector(".menu-toggle").getAttribute("aria-expanded")'), 'true');
  await evaluate(() => document.querySelector('#main-links a[href="#home"]').click());
  assert.equal(await evaluate('document.querySelector(".menu-toggle").getAttribute("aria-expanded")'), 'false');
  assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'Mobile horizontal overflow');
  await evaluate('document.querySelector("[data-action=download]").click()');
  for (let i = 0; i < 50 && !readdirSync(downloads).some(f => f.endsWith('.svg')); i++) await delay(100);
  const exported = readdirSync(downloads).find(f => f.endsWith('.svg'));
  assert.ok(exported, 'Figure download did not finish');
  assert.ok(readFileSync(path.join(downloads, exported), 'utf8').includes('<svg'), 'Export is not SVG');
  assert.equal(await evaluate('document.querySelectorAll("#findings svg").length > 0'), true);
  const mobile = await call('Page.captureScreenshot', { format: 'png' }); writeFileSync(path.join(audit, 'mobile.png'), Buffer.from(mobile.data, 'base64'));
  assert.deepEqual(errors, [], 'Browser JavaScript errors'); assert.deepEqual(failed, [], 'Browser request failures');
  console.log('PASS: Chrome rendered desktop/mobile, loaded local assets, switched strategy/course filters and theme, followed navigation, opened/closed mobile menu, and invoked figure export; no JS errors, failed requests or mobile overflow.');
} finally {
  clearTimeout(timeout); ws?.close(); chrome.kill(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
