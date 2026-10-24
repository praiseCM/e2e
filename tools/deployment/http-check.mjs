import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createSiteServer } from './serve.mjs';
import { read } from './common.mjs';
const server = createSiteServer();
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = 'http://127.0.0.1:' + server.address().port;
try {
  const files = JSON.parse(read('e2e/assets/deployment-manifest.json')).files.filter(f => f !== '.nojekyll');
  for (const file of files) {
    const response = await fetch(origin + '/' + file);
    assert.equal(response.status, 200, file);
    if (file.endsWith('.js')) assert.match(response.headers.get('content-type'), /javascript/);
    if (file.endsWith('.css')) assert.match(response.headers.get('content-type'), /text\/css/);
    if (file.endsWith('.png')) assert.match(response.headers.get('content-type'), /image\/png/);
    await response.arrayBuffer();
  }
  for (const file of ['Analysis/data/primary_analysis.csv', 'Analysis-rev.1/data/pulse_coded.csv', 'research-site/index.html', '.env', 'not-a-real-page']) {
    const response = await fetch(origin + '/' + file); assert.ok([403, 404].includes(response.status), 'Private or unknown URL served: ' + file); await response.arrayBuffer();
  }
  assert.equal((await fetch(origin + '/')).status, 200);
  console.log(`PASS: ${files.length} public files served with HTTP 200, asset MIME types, home route, custom 404 and private-path isolation.`);
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
