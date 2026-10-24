import { mkdirSync, writeFileSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { root, walk, relative, readText, credentialHits, privatePath, publicPath, git, releaseProblems } from './common.mjs';

const files = walk(), findings = [], blockers = [], skippedBinary = [];
const stagedMode = process.argv.includes('--staged');
const tracked = new Set(git('ls-files', '-z').split('\0').filter(Boolean));
const staged = git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z').split('\0').filter(Boolean);
const ignoredOutput = (() => {
  // check-ignore's exit code 1 means none of these paths are ignored.
  try { return execFileSync('git', ['check-ignore', '--no-index', '-z', '--stdin'], { cwd: root, input: files.map(relative).join('\0') + '\0', encoding: 'utf8' }).split('\0').filter(Boolean); }
  catch (e) { if (e.status === 1) return []; throw e; }
})();
const ignored = new Set(ignoredOutput);
for (const full of files) {
  const file = relative(full), isTracked = tracked.has(file), isPublic = publicPath(file);
  if (lstatSync(full).isSymbolicLink()) { findings.push({ file, category: 'symbolic link', ignored: ignored.has(file) }); if (isPublic || isTracked) blockers.push('Symbolic link requires review: ' + file); continue; }
  if (privatePath(file)) {
    findings.push({ file, category: 'private document/data/credential filename', ignored: ignored.has(file), tracked: isTracked });
    if (isPublic || isTracked || !ignored.has(file)) blockers.push('Private file is public, tracked, or not ignored: ' + file);
  }
  const text = readText(full);
  if (text === null) { skippedBinary.push(file); continue; }
  for (const hit of credentialHits(text)) {
    findings.push({ file, category: hit.kind, line: hit.line, ignored: ignored.has(file), tracked: isTracked });
    if (isPublic || isTracked || !ignored.has(file)) blockers.push('Possible credential must be removed or file excluded: ' + file + ':' + hit.line);
  }
  if (/\b(?:analysis_id|record_id|identifier_to_email|P\d{3}|G[12]_S\d+_R\d+)\b/.test(text) && !file.startsWith('tools/deployment/')) {
    findings.push({ file, category: 'participant record marker', ignored: ignored.has(file), tracked: isTracked });
    if (isPublic || isTracked || !ignored.has(file)) blockers.push('Possible participant-level data exposed: ' + file);
  }
  if (!file.startsWith('tools/deployment/') && !/^DEPLOYMENT/.test(file) && /\b(?:reviewer (?:comments|responses)|student records|institutional documents|unpublished research|publication (?:status )?unverified|peer review.{0,50}(?:unverified|not been verified)|supplementary information|manuscript)\b/i.test(text)) {
    findings.push({ file, category: 'research/publication or sensitive-content review', ignored: ignored.has(file), tracked: isTracked });
  }
}
if (stagedMode) {
  if (!staged.length) blockers.push('No staged files to review.');
  for (const file of staged) {
    if (!publicPath(file) || privatePath(file)) blockers.push('Staged path is outside deployment allowlist: ' + file);
    const content = git('show', ':' + file);
    if (credentialHits(content).length) blockers.push('Possible credential in staged content: ' + file);
    // The index can contain an older version than the working copy; require exact review.
    if (git('diff', '--name-only', '--', file)) blockers.push('Staged and working versions differ: ' + file);
  }
}
if (process.argv.includes('--release')) blockers.push(...releaseProblems());
const report = { scannedAt: new Date().toISOString(), filesScanned: files.length, trackedFiles: tracked.size, stagedFiles: staged.length, findings, blockers: [...new Set(blockers)], binaryContentsNotInspected: skippedBinary, skippedDirectories: ['.git (history not scanned)', 'node_modules', '.npm-cache', '.npm-logs', '.research-cache', '.deployment-audit', '.agents', '.codex', 'artifacts'], note: 'Heuristic scan; binary Office/PDF contents, archive payloads and Git history are not inspected. Excluded original documents are detected by path. No matching credential values are printed.' };
mkdirSync(path.join(root, '.deployment-audit'), { recursive: true });
writeFileSync(path.join(root, '.deployment-audit/sensitive-scan.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Scanned ${files.length} files; ${findings.length} review findings; ${report.blockers.length} blocking issues. Private report: .deployment-audit/sensitive-scan.json`);
for (const finding of findings.filter(f => f.category !== 'research/publication or sensitive-content review').slice(0, 18)) console.log(`REVIEW: ${finding.file} (${finding.category}; ${finding.ignored ? 'ignored' : 'NOT ignored'})`);
console.log('WARNING: manuscripts, supplemental material, and participant-level research data are present in this workspace. Stage explicit deployment paths only.');
for (const blocker of report.blockers) console.error('BLOCK: ' + blocker);
if (report.blockers.length) process.exitCode = 1;
