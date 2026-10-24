import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const site = path.join(root, 'e2e');
export const read = file => readFileSync(path.join(root, file), 'utf8');
export const config = () => JSON.parse(read('deployment.config.json'));
export const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
export const skipped = new Set(['.git', 'node_modules', '.npm-cache', '.npm-logs', '.research-cache', '.deployment-audit', '.agents', '.codex', 'artifacts']);
export function walk(dir = root, skip = skipped) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) return [full];
    if (entry.isDirectory()) return skip.has(entry.name) ? [] : walk(full, skip);
    return [full];
  });
}
export const relative = file => path.relative(root, file).split(path.sep).join('/');
export const publicPath = file => /^(?:e2e\/|tools\/deployment\/|\.github\/workflows\/e2e-pages\.yml$|deployment\.config\.json$|\.gitignore$|DEPLOYMENT\.txt$|DEPLOYMENT-VALIDATION\.txt$)/.test(file);
export const privatePath = file => /(?:^|\/)(?:Analysis|References|Figures|manuscripts|supplemental|supplementary|reviewer_responses|reviewer_comments|raw_data|datasets|student_records|institutional_documents|secrets|credentials)(?:\/|$)|\.(?:docx?|pdf|xlsx?|pptx?|ipynb|csv|ris|pem|key|p12|pfx)$|(?:^|\/)\.env(?:\.|$)|(?:^|\/)(?:\.npmrc|\.netrc|\.git-credentials)$|(?:credentials|service-account).*\.json$|(?:^|\/)id_(?:rsa|ed25519)/i.test(file);
export function credentialHits(text) {
  const rules = [
    ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/g],
    ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/g],
    ['OpenAI key', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}\b/g],
    ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
    ['Google key', /\bAIza[\w-]{30,}\b/g],
    ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g],
    ['credential in URL', /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/gi],
    ['literal credential', /["']?(?:api[_-]?key|client[_-]?secret|access[_-]?token|auth[_-]?token|password|passwd|secret[_-]?key)["']?\s*[:=]\s*["']([A-Za-z0-9_+/.=-]{12,})["']/gi],
    ['bearer credential', /\bBearer\s+[A-Za-z0-9_=-]{24,}(?:\.[A-Za-z0-9_=-]+)*/g],
    ['JSON web token', /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/g],
  ];
  const hits = [];
  for (const [kind, pattern] of rules) for (const match of text.matchAll(pattern)) {
    if (match[1] && /^(?:example|placeholder|your_|replace|process|environment)/i.test(match[1])) continue;
    hits.push({ kind, line: text.slice(0, match.index).split('\n').length });
  }
  return hits;
}
export function readText(file) {
  if (lstatSync(file).isSymbolicLink()) return null;
  const bytes = readFileSync(file);
  return bytes.includes(0) ? null : bytes.toString('utf8');
}
export function releaseProblems() {
  const c = config(), problems = [];
  if (c.domainConfirmed !== true) problems.push('Exact subdomain is not confirmed.');
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.praiser\.us$/.test(c.domain) || c.domain.length >= 64) problems.push('Domain must be a valid, single-label praiser.us subdomain shorter than 64 characters.');
  if (!/^PraiseCM\/[A-Za-z0-9_.-]+$/i.test(c.repository)) problems.push('Target PraiseCM repository is not configured.');
  if (c.publicReleaseApproved !== true) problems.push('Displayed research does not have confirmed public-release approval.');
  if (!/^[A-Za-z0-9][A-Za-z0-9/_.-]*$/.test(c.branch) || c.branch.includes('..')) problems.push('Invalid deployment branch.');
  return problems;
}
