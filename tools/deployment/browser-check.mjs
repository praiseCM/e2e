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
const origin = process.env.E2E_BROWSER_ORIGIN || 'http://127.0.0.1:' + server.address().port;
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
  for (const course of [1, 2, 0]) {
    await evaluate(`document.querySelector('[aria-label="Course comparison"]').querySelectorAll('button')[${course}].click()`);
    assert.equal(await evaluate('document.querySelectorAll("#figure-instructional-sequences").length'), 1);
  }
  await evaluate('document.querySelector(".instructional-sequences").scrollIntoView({block:"start",behavior:"instant"})');
  assert.ok(await evaluate('!/\\bfigure\\s*0?[123]\\b/i.test(document.body.textContent)'), 'Manuscript numbering is visible');
  for (const course of ['G1', 'G2']) {
    await evaluate(`document.querySelector('[data-sequence-course="${course}"]').click()`);
    for (const step of [0, 1, 2]) {
      await evaluate(`document.querySelector('#sequence-${course}-tab-${step}').click()`);
      assert.ok(await evaluate(`!document.querySelector('#sequence-${course}-step-${step}').hidden`));
      assert.equal(await evaluate(`document.querySelectorAll('#sequence-course-${course} [data-sequence-panel]:not([hidden])').length`), 1);
      assert.equal(await evaluate(`document.querySelector('#sequence-course-${course} [data-sequence-previous]').disabled`), step === 0);
      assert.equal(await evaluate(`document.querySelector('#sequence-course-${course} [data-sequence-next]').disabled`), step === 2);
    }
  }
  await evaluate('document.querySelector("[data-sequence-course=G1]").click()');
  assert.ok(await evaluate('!document.querySelector("#sequence-G1-step-2").hidden'), 'Course switching must preserve the selected step');
  await evaluate('document.querySelector("#sequence-course-G1 [data-sequence-previous]").click()');
  for (let method = 0; method < 5; method++) {
    await evaluate(`document.querySelector('[data-communication="${method}"]').click()`);
    assert.equal(await evaluate('document.querySelector("[data-communication-title]").textContent'), ['Sketches','Technical drawings','Models','Reports','Presentations'][method]);
  }
  await evaluate('document.querySelector("#sequence-course-G1 [data-sequence-next]").click()');
  for (const decision of ['add', 'justify', 'retain']) {
    await evaluate(`document.querySelector('[data-reflection="${decision}"]').click()`);
    assert.ok(await evaluate('document.querySelector("[data-reflection-feedback]").textContent.length > 65'));
  }
  // Exercise real keyboard navigation and ensure focus follows the active tab.
  await evaluate('document.querySelector("#sequence-G1-tab-2").focus()');
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Home', code: 'Home' });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Home', code: 'Home' });
  assert.equal(await evaluate('document.activeElement.id'), 'sequence-G1-tab-0');
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight' });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight' });
  assert.equal(await evaluate('document.activeElement.id'), 'sequence-G1-tab-1');
  await evaluate('document.querySelector("[data-sequence-course=G2]").click(); document.querySelector("#sequence-G2-tab-1").click()');
  const setInput = async (name, value) => evaluate(`(() => { const input = document.querySelector('[data-duration-input="${name}"]'); input.value = ${JSON.stringify(String(value))}; input.dispatchEvent(new Event('input', {bubbles:true})); })()`);
  assert.equal(await evaluate('document.querySelector("[data-duration=worksheet]").textContent'), '9');
  assert.equal(await evaluate('document.querySelector("[data-duration=suggestion]").textContent'), '8');
  await setInput('suggestion', 3);
  assert.ok(await evaluate('document.querySelector("[data-duration-difference]").textContent.includes("8 whole working days longer")'));
  await setInput('suggestion', 6);
  assert.ok(await evaluate('document.querySelector("[data-duration-difference]").textContent.includes("same whole-day duration")'));
  for (const invalid of [0, -1, '', 1.5, 10001]) {
    await setInput('crew', invalid);
    assert.equal(await evaluate('document.querySelector("[data-duration-input=crew]").getAttribute("aria-invalid")'), 'true');
    assert.ok(await evaluate('Array.from(document.querySelectorAll("[data-duration-results]"), el=>el.hidden).every(Boolean)'), 'Invalid inputs must hide stale results');
  }
  await evaluate('document.querySelector("[data-sequence-reset]").click()');
  await setInput('quantity', .07); await setInput('crew', 1); await setInput('worksheet', .01);
  assert.equal(await evaluate('document.querySelector("[data-duration=worksheet]").textContent'), '7');
  await setInput('quantity', .0701);
  assert.equal(await evaluate('document.querySelector("[data-duration=worksheet]").textContent'), '8');
  await evaluate('document.querySelector("[data-sequence-reset]").click()');
  assert.equal(await evaluate('document.querySelector("[data-duration=worksheet]").textContent'), '9');
  assert.equal(await evaluate('document.querySelector("[data-duration=suggestion]").textContent'), '8');
  await evaluate('document.querySelector("#sequence-G2-tab-2").click()');
  for (const decision of ['accept', 'retain', 'verify']) {
    await evaluate(`document.querySelector('[data-verification="${decision}"]').click()`);
    assert.ok(await evaluate('document.querySelector("[data-verification-feedback]").textContent.length > 65'));
  }
  await evaluate('document.querySelector("#sequence-G2-tab-1").click()');
  await delay(600);
  const instructionalDesktop = await call('Page.captureScreenshot', { format: 'png' }); writeFileSync(path.join(audit, 'instructional-desktop.png'), Buffer.from(instructionalDesktop.data, 'base64'));
  await evaluate(() => document.querySelector('[aria-label="Search strategy group"]').querySelectorAll('button')[1].click());
  assert.equal(await evaluate('Array.from(document.querySelectorAll(".strategy-card")).filter(e=>!e.hidden).length'), 6);
  await evaluate(() => document.querySelector('[aria-label="Search strategy group"]').querySelectorAll('button')[0].click());
  assert.equal(await evaluate('Array.from(document.querySelectorAll(".strategy-card")).filter(e=>!e.hidden).length'), 15);
  await evaluate(() => document.querySelector('[aria-label="Distribution course filter"]').querySelectorAll('button')[2].click());
  assert.ok(await evaluate('!!document.querySelector("#findings [aria-pressed=true]")'));
  // Every session view must expose the same complete weekly series and denominators.
  for (const measure of [0, 1]) for (const topic of [0, 1]) {
    await evaluate(`document.querySelector('[aria-label="Session measure"]').querySelectorAll('button')[${measure}].click()`);
    await evaluate(`document.querySelector('[aria-label="Topic response type"]').querySelectorAll('button')[${topic}].click()`);
    assert.deepEqual(await evaluate('Array.from(document.querySelectorAll(".session-timeline button"), b=>b.textContent)'), ['W4','W5','W6','W7','W8','W9','W10']);
    await evaluate(() => Array.from(document.querySelectorAll('.session-timeline button')).find(b=>b.textContent==='W7').click());
    const detail = await evaluate('document.querySelector(".session-detail").textContent');
    for (const expected of ['G1 / Week 7','72 submitted records','72 valid resource choices','71 valid ratings','4.690 / 5']) assert.ok(detail.includes(expected), expected);
    assert.ok(await evaluate('document.querySelector(".session-chart svg").textContent.includes("W7")'));
    assert.ok(await evaluate('document.querySelector(".experience-summary").textContent.includes("96.3")'));
  }
  await evaluate(() => document.querySelector('[aria-label="Session course"]').querySelectorAll('button')[1].click());
  assert.equal(await evaluate('document.querySelectorAll(".session-timeline button").length'), 16);
  assert.ok(await evaluate('document.querySelector(".experience-summary").textContent.includes("1,119")'));
  await evaluate(() => document.querySelector('[aria-label="Session course"]').querySelectorAll('button')[0].click());
  assert.equal(await evaluate('document.querySelectorAll(".session-timeline button").length'), 7);
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
  for (const [id, filename] of [['figure-distributions', 'response-distributions.svg'], ['figure-instructional-sequences', 'instructional-sequences.svg'], ['figure-estimates', 'comparative-estimates.svg']]) {
    await evaluate(`document.querySelector('[data-action="download"][data-figure="${id}"]').click()`);
    for (let i = 0; i < 50 && !existsSync(path.join(downloads, filename)); i++) await delay(100);
    assert.ok(existsSync(path.join(downloads, filename)), 'Figure download did not finish: ' + filename);
    const exported = readFileSync(path.join(downloads, filename), 'utf8');
    assert.ok(exported.includes('<svg'), 'Export is not SVG: ' + filename);
    if (id === 'figure-instructional-sequences') {
      assert.ok(exported.includes('round up → 9 days') && exported.includes('round up → 8 days'));
      assert.ok(!exported.includes('<metadata'));
    }
  }
  await evaluate('document.querySelector(".instructional-sequences").scrollIntoView({block:"start",behavior:"instant"})');
  await delay(600);
  for (const course of ['G1', 'G2']) for (const step of [0,1,2]) {
    await evaluate(`document.querySelector('[data-sequence-course="${course}"]').click(); document.querySelector('#sequence-${course}-tab-${step}').click()`);
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'Mobile explorer overflow: ' + course + '/' + step);
  }
  await evaluate('document.querySelector("#sequence-G2-tab-1").click()');
  const instructionalMobile = await call('Page.captureScreenshot', { format: 'png' }); writeFileSync(path.join(audit, 'instructional-mobile.png'), Buffer.from(instructionalMobile.data, 'base64'));
  await evaluate('document.querySelector(".instructional-sequences details").open = true');
  await evaluate('document.querySelector(".instructional-scroll").scrollIntoView({behavior:"instant",block:"center"})');
  for (let i=0;i<50;i++) { if (await evaluate('document.querySelector(".instructional-scroll img").complete && document.querySelector(".instructional-scroll img").naturalWidth > 0')) break; await delay(100); }
  assert.ok(await evaluate('document.querySelector(".instructional-scroll img").naturalWidth > 0'), 'Overview diagram did not load');
  assert.ok(await evaluate('document.querySelector(".instructional-scroll").scrollWidth > document.querySelector(".instructional-scroll").clientWidth'));
  assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'Mobile transcript overflow');
  assert.equal(await evaluate('document.querySelectorAll("#findings svg").length > 0'), true);
  const mobile = await call('Page.captureScreenshot', { format: 'png' }); writeFileSync(path.join(audit, 'mobile.png'), Buffer.from(mobile.data, 'base64'));
  assert.deepEqual(errors, [], 'Browser JavaScript errors'); assert.deepEqual(failed, [], 'Browser request failures');
  console.log('PASS: desktop/mobile, both chatbot pathways and six steps, keyboard navigation, all communication methods and reflection decisions, calculator variants and invalid inputs, overview and SVG downloads, existing filters; no JS errors, failed requests or mobile overflow.');
} finally {
  clearTimeout(timeout); ws?.close(); chrome.kill(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
