import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import { buildIssuePack, buildReport, createZip, detectGame, extractEvidence, extractVersions, isDuplicateLog, redact, safeFilename, safeProjectUrl, suggestChecks, uniqueSafeFilename } from '../src/core.js';

test('browser app uses this core module and stores uploaded text for analysis', async () => {
  const appSource = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(appSource, /from '\.\/core\.js'/);
  assert.doesNotMatch(appSource, /core-v\d/);
  assert.match(appSource, /state\.files\.push\(\{[^}]*\btext,/);
});

test('offline instructions require HTTP for the app JavaScript modules', async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(readme, /python -m http\.server 8000 --bind 127\.0\.0\.1/);
  assert.match(readme, /browsers block JavaScript modules loaded directly from `file:\/\//i);
  assert.doesNotMatch(readme, /Extract it and open `index\.html`/);
});

function detectGameFromFiles(files) {
  return detectGame(files.map(file => ({ name: file.name, text: file.text })));
}

test('redacts common credentials, emails, and user profile paths', () => {
  const input = 'password=superSecret123\nuser=C:\\Users\\Alice\\Saves\ncontact alice@example.com\nAuthorization: Bearer abcdefghijklmnopqrstuvwxyz';
  const result = redact(input);
  assert.doesNotMatch(result.text, /superSecret123|Alice|alice@example\.com|abcdefghijklmnopqrstuvwxyz/);
  assert.equal(result.counts['Credential assignment'], 1);
  assert.equal(result.counts['Windows user path'], 1);
  assert.equal(result.counts['Email address'], 1);
  assert.equal(result.counts['Authorization token'], 1);
});

test('redacts webhook URLs and JSON-style apiKey assignments', () => {
  const input = [
    'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopQRSTUVwx',
    '{"apiKey": "json-secret-value-123", "access_token": bare-secret-token-123}',
  ].join('\n');
  const result = redact(input);
  assert.doesNotMatch(result.text, /discord\.com|abcdefghijklmnop|json-secret|bare-secret/);
  assert.equal(result.counts['Discord webhook'], 1);
  assert.equal(result.counts['Credential assignment'], 2);
});

test('redacts credentials embedded in HTTP URLs', () => {
  const result = redact('Log endpoint: https://user:pass@example.test/private/path?ref=main');
  assert.equal(result.text, 'Log endpoint: https://example.test/private/path?ref=main');
  assert.equal(result.counts['URL credentials'], 1);
  assert.doesNotMatch(result.text, /user|pass/);
  assert.match(result.text, /\/private\/path/);
});

test('redacts a private key as one block', () => {
  const input = '-----BEGIN PRIVATE KEY-----\nexample-secret-material\n-----END PRIVATE KEY-----';
  const result = redact(input);
  assert.equal(result.text, '[PRIVATE KEY REDACTED]');
  assert.equal(result.counts['Private key'], 1);
});

test('redacts IPv4 only when enabled and rejects out-of-range octets', () => {
  const input = 'host 192.168.0.10 and 999.999.999.999';
  assert.equal(redact(input).text, input);
  const result = redact(input, { ips: true });
  assert.equal(result.text, 'host [IP ADDRESS] and 999.999.999.999');
  assert.equal(result.counts['IPv4 address'], 1);
});

test('detects known game types and returns other for unrelated text', () => {
  assert.equal(detectGame([{ name: 'latest.log', text: 'net.minecraft.client.main.Main' }]), 'minecraft');
  assert.equal(detectGame([{ name: 'hoi4_2026_10_08.log', text: 'script error' }]), 'hoi4');
  assert.equal(detectGame([{ name: 'output_log.txt', text: 'ordinary application output' }]), 'other');
});

test('the demo report file uses the same text field as uploaded files', () => {
  const demo = { name: 'crash-report.txt', text: 'Minecraft Crash Report\nMinecraft Version: 1.20.1' };
  assert.equal(detectGameFromFiles([demo]), 'minecraft');
  assert.ok(extractVersions(demo.text).some(item => item.label === 'Minecraft' && item.value === '1.20.1'));
  assert.match(buildReport({ title: 'Demo' }, [demo], { gameLabel: 'Minecraft', versions: [], evidence: [], loader: '' }), /Files included:\*\* 1/);
});

test('extracts versions, unique error evidence, and heuristic checks', () => {
  const log = 'Minecraft Version: 1.20.1\nFabric Loader 0.15.11\nERROR Failed to load mod abc\nERROR Failed to load mod abc\nCaused by: java.lang.OutOfMemoryError: Java heap space';
  assert.deepEqual(extractVersions(log).slice(0, 2), [
    { label: 'Minecraft', value: '1.20.1' },
    { label: 'Fabric Loader', value: '0.15.11' },
  ]);
  assert.equal(extractEvidence(log).length, 2);
  assert.match(suggestChecks(log).join(' '), /нехватк.*памяти/i);
  assert.match(suggestChecks(log).join(' '), /зависимост/i);
});

test('safe filenames remove path traversal and personal data', () => {
  assert.equal(safeFilename('../../C:\\Users\\Alice\\token_ghp_123456789012345678901234567890.txt'), 'token_ghp_123456789012345678901234567890.txt');
  assert.equal(safeFilename('..'), 'log.txt');
  assert.equal(safeFilename('folder\\crash<1>.txt'), 'crash_1_.txt');
});

test('safe filenames visibly escape bidirectional and control characters', () => {
  const name = safeFilename('crash\u202Egpj.txt\nlog\u0085');
  assert.equal(name, 'crash\\u{202E}gpj.txt\\u{A}log\\u{85}');
  assert.doesNotMatch(name, /[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/);
});

test('unique safe filenames keep duplicate basenames distinct, ignoring case', () => {
  assert.equal(uniqueSafeFilename('logs/crash.log', ['crash.log']), 'crash (2).log');
  assert.equal(uniqueSafeFilename('CRASH.LOG', ['crash.log', 'crash (2).log']), 'CRASH (3).LOG');
  assert.equal(uniqueSafeFilename('other.txt', ['crash.log']), 'other.txt');
});

test('log import deduplicates exact copies but keeps different same-size files', () => {
  const existing = [{ name: 'latest.log', sourceName: 'latest.log', size: 4, text: 'first' }];
  assert.equal(isDuplicateLog(existing, { sourceName: 'latest.log', size: 4, text: 'first' }), true);
  assert.equal(isDuplicateLog(existing, { sourceName: 'latest.log', size: 4, text: 'else' }), false);
  assert.equal(isDuplicateLog(existing, { sourceName: 'other.log', size: 4, text: 'first' }), false);
});

test('report redacts user fields and prevents Markdown structure injection', () => {
  const report = buildReport({
    title: 'Issue | <script>unsafe()</script>\n## Forged heading **bold** [click](https://evil.invalid)',
    platform: 'C:\\Users\\Alice\\PC',
    mods: 'alpha\n```\n# Forged section',
    expected: 'Contact me at alice@example.com',
  }, [], { gameLabel: 'Minecraft', versions: [], evidence: [], loader: '' });
  assert.doesNotMatch(report, /Alice|alice@example\.com|```\n# Forged section/);
  assert.match(report, /Issue \\| &lt;script&gt;/);
  assert.ok(report.includes(String.raw`\\n\#\# Forged heading \*\*bold\*\* \[click\]\(https\:\/\/evil\.invalid\)`));
  assert.doesNotMatch(report, /\n## Forged heading/);
  assert.doesNotMatch(report, /<script>/, 'raw HTML tags must not reach the report');
  assert.match(report, /Not provided/);
});

test('report visibly escapes bidi controls and multiline log evidence', () => {
  const report = buildReport({ title: 'Crash\u202Etxt', expected: 'first line\n## Injected heading' }, [], {
    gameLabel: 'Minecraft',
    versions: [],
    evidence: [{ file: 'latest\u202Elog\n## fake.md', line: 8, text: 'ERROR: failed\n**forged emphasis**' }],
    loader: '',
  });
  assert.ok(report.includes(String.raw`Crash\\u{202E}txt`));
  assert.ok(report.includes(String.raw`first line\\n\#\# Injected heading`));
  assert.ok(report.includes(String.raw`latest\\u{202E}log\\n\#\# fake\.md (line 8)`));
  assert.ok(report.includes(String.raw`failed\\n\*\*forged emphasis\*\*`));
  assert.doesNotMatch(report, /[\u202A-\u202E\u2066-\u2069]/);
  assert.doesNotMatch(report, /\n## (?:Injected|fake)/);
});

test('mod list preserves line breaks but visibly escapes invisible controls', () => {
  const report = buildReport({ title: 'Mod list', mods: 'alpha\u202Etxt\nbeta\tmods\r\nx\u001b[31m' }, [], {
    gameLabel: 'Minecraft',
    versions: [],
    evidence: [],
    loader: '',
  });
  assert.ok(report.includes('alpha\\u{202E}txt\nbeta\\u{9}mods\\u{D}\nx\\u{1B}[31m'));
  assert.doesNotMatch(report, /[\u0000-\u0008\u000B-\u001F\u202A-\u202E\u2066-\u2069]/);
});


test('project URLs remove embedded credentials and redact secret parameters', () => {
  const safe = safeProjectUrl('https://alice:pass@example.test/mod?access_token=private123&X-Amz-Credential=cloud-secret&author=Aziz&ref=readme#callback?access_token=fragment-secret');
  const parsed = new URL(safe);
  assert.equal(parsed.username, '');
  assert.equal(parsed.password, '');
  assert.equal(parsed.searchParams.get('access_token'), '[REDACTED]');
  assert.equal(parsed.searchParams.get('X-Amz-Credential'), '[REDACTED]');
  assert.equal(parsed.searchParams.get('ref'), 'readme');
  assert.equal(parsed.searchParams.get('author'), 'Aziz');
  assert.equal(parsed.hash, '');
  assert.doesNotMatch(safe, /alice|pass|private123|fragment-secret|cloud-secret/);
  assert.equal(safeProjectUrl('javascript:alert(1)'), '');
});

test('Issue ZIP never keeps URL credentials or query secrets', () => {
  const entries = buildIssuePack({
    report: '# Report',
    project: { url: 'https://user:pass@example.test/mod?token=private123&branch=main' },
  });
  const context = JSON.parse(entries.find(entry => entry.name === 'project-context.json').data);
  assert.doesNotMatch(context.url, /user|pass|private123/);
  const parsed = new URL(context.url);
  assert.equal(parsed.searchParams.get('token'), '[REDACTED]');
  assert.equal(parsed.searchParams.get('branch'), 'main');
});

test('issue pack includes privacy-clean project context and optional clean logs', () => {
  const entries = buildIssuePack({
    report: '# Clean report',
    project: { name: 'Mod', url: 'https://example.test/mod', version: '1.2.3', platform: 'C:\\Users\\Alice\\PC' },
    files: [{ name: '../../C:\\Users\\Alice\\latest.log', cleaned: 'password=[REDACTED]' }],
  });
  assert.deepEqual(entries.map(entry => entry.name), ['bug-report.md', 'project-context.json', 'logs/latest.log']);
  assert.doesNotMatch(entries[1].data, /Alice/);
  assert.equal(JSON.parse(entries[1].data).url, 'https://example.test/mod');
  assert.deepEqual(buildIssuePack({ report: '# Clean report', files: [{ name: 'log.txt', cleaned: 'x' }], includeCleanLogs: false }).map(entry => entry.name), ['bug-report.md']);
  assert.throws(() => buildIssuePack({ report: '' }), /non-empty report/);
});

test('ZIP output contains safe filenames and readable entries', async () => {
  const blob = createZip([
    { name: 'logs/../report.md', data: '# Report\nhello' },
    { name: 'сбой.txt', data: new Uint8Array([0, 1, 2, 255]) },
  ]);
  assert.equal(blob.type, 'application/zip');
  const bytes = Buffer.from(await blob.arrayBuffer());
  assert.equal(bytes.readUInt32LE(0), 0x04034b50);
  let offset = 0;
  const names = [];
  const contents = [];
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const method = bytes.readUInt16LE(offset + 8);
    const compressedSize = bytes.readUInt32LE(offset + 18);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const name = new TextDecoder().decode(bytes.subarray(offset + 30, offset + 30 + nameLength));
    const dataStart = offset + 30 + nameLength + extraLength;
    const payload = bytes.subarray(dataStart, dataStart + compressedSize);
    names.push(name);
    contents.push(method === 8 ? inflateRawSync(payload) : payload);
    offset = dataStart + compressedSize;
  }
  assert.deepEqual(names, ['logs/report.md', 'сбой.txt']);
  assert.equal(contents[0].toString(), '# Report\nhello');
  assert.deepEqual([...contents[1]], [0, 1, 2, 255]);
  assert.equal(bytes.readUInt32LE(offset), 0x02014b50);
});

test('ZIP output preserves duplicate basenames as separate entries', async () => {
  const blob = createZip([
    { name: 'logs/latest.log', data: 'first log' },
    { name: 'other/latest.log', data: 'second log' },
    { name: 'third/LATEST.LOG', data: 'third log' },
  ]);
  const bytes = Buffer.from(await blob.arrayBuffer());
  const names = [];
  const contents = [];
  let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const size = bytes.readUInt32LE(offset + 18);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const name = new TextDecoder().decode(bytes.subarray(offset + 30, offset + 30 + nameLength));
    const start = offset + 30 + nameLength + extraLength;
    names.push(name);
    contents.push(bytes.subarray(start, start + size).toString());
    offset = start + size;
  }
  assert.deepEqual(names, ['logs/latest.log', 'other/latest.log', 'third/LATEST.LOG']);
  assert.deepEqual(contents, ['first log', 'second log', 'third log']);
});

test('issue ZIP preserves its logs folder and sanitizes unsafe path segments', async () => {
  const entries = buildIssuePack({
    report: '# Clean report',
    files: [
      { name: 'latest.log', cleaned: 'first log' },
      { name: 'latest.log', cleaned: 'second log' },
      { name: '../../secrets.txt', cleaned: 'third log' },
    ],
  });
  const bytes = Buffer.from(await createZip(entries).arrayBuffer());
  const names = [];
  let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const size = bytes.readUInt32LE(offset + 18);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    names.push(new TextDecoder().decode(bytes.subarray(offset + 30, offset + 30 + nameLength)));
    offset += 30 + nameLength + extraLength + size;
  }
  assert.deepEqual(names, ['bug-report.md', 'logs/latest.log', 'logs/latest (2).log', 'logs/secrets.txt']);
  assert.ok(names.every(name => !name.startsWith('/') && !name.split('/').includes('..')));
});

test('ZIP32 writer rejects more than 500 files', () => {
  assert.throws(() => createZip(Array.from({ length: 501 }, () => ({ name: 'x.txt', data: '' }))), /500 files/);
});
