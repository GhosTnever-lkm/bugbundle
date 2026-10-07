import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { buildReport, createZip, detectGame, extractEvidence, extractVersions, redact, safeFilename, suggestChecks } from '../src/core.js';

test('redacts common credentials, emails, and user profile paths', () => {
  const input = 'password=superSecret123\nuser=C:\\Users\\Alice\\Saves\ncontact alice@example.com\nAuthorization: Bearer abcdefghijklmnopqrstuvwxyz';
  const result = redact(input);
  assert.doesNotMatch(result.text, /superSecret123|Alice|alice@example\.com|abcdefghijklmnopqrstuvwxyz/);
  assert.equal(result.counts['Credential assignment'], 1);
  assert.equal(result.counts['Windows user path'], 1);
  assert.equal(result.counts['Email address'], 1);
  assert.equal(result.counts['Authorization token'], 1);
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

test('report redacts user fields and prevents Markdown structure injection', () => {
  const report = buildReport({
    title: 'Issue | <script>password=secret123</script>',
    platform: 'C:\\Users\\Alice\\PC',
    mods: 'alpha\n```\n# Forged section',
    expected: 'Contact me at alice@example.com',
  }, [], { gameLabel: 'Minecraft', versions: [], evidence: [], loader: '', });
  assert.doesNotMatch(report, /secret123|Alice|alice@example\.com|```\n# Forged section/);
  assert.match(report, /Issue \\| &lt;script&gt;/);
  assert.doesNotMatch(report, /<script>/, 'raw HTML tags must not reach the report');
  assert.match(report, /Not provided/);
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
  assert.deepEqual(names, ['report.md', 'сбой.txt']);
  assert.equal(contents[0].toString(), '# Report\nhello');
  assert.deepEqual([...contents[1]], [0, 1, 2, 255]);
  assert.equal(bytes.readUInt32LE(offset), 0x02014b50);
});

test('ZIP32 writer rejects more than 500 files', () => {
  assert.throws(() => createZip(Array.from({ length: 501 }, () => ({ name: 'x.txt', data: '' }))), /500 files/);
});
