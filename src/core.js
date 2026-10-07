const RULES = [
  ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/g],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{30,}\b/g],
  ['Slack token', /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/g],
  ['Stripe secret key', /\bsk_(?:live|test)_[0-9A-Za-z]{20,}\b/g],
  ['Authorization token', /((?:authorization\s*:\s*)?bearer\s+)[A-Za-z0-9._~+/-]{16,}={0,2}/gi],
  ['Credential assignment', /\b(password|passwd|api[_-]?key|access[_-]?token|client[_-]?secret|aws_secret_access_key)\s*([:=])\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi],
];

export const GAMES = [
  { id: 'minecraft', label: 'Minecraft', match: /Minecraft Crash Report|Minecraft Version:|net\.minecraft\.|fabricloader|net\.minecraftforge|net\.neoforged|quilt\.loader/i },
  { id: 'hoi4', label: 'Hearts of Iron IV', match: /hoi4|Hearts of Iron IV|hoi4_[a-z0-9_]+|hoi4_[\w.]+|hoi4\.exe/i },
  { id: 'stellaris', label: 'Stellaris', match: /stellaris|stellaris_[\w.]+|stellaris\.exe/i },
  { id: 'skyrim', label: 'Skyrim / Bethesda', match: /CrashLogger|Trainwreck|SKSE|SkyrimSE|Skyrim Special Edition/i },
  { id: 'unity', label: 'Unity game', match: /Unity Player|UnityEngine|Player\.log|UnityException/i },
  { id: 'unreal', label: 'Unreal Engine game', match: /Unreal Engine|Fatal error:|LogWindows: Error/i },
];

const VERSION_RULES = [
  ['Minecraft', /Minecraft Version:\s*([^\r\n]+)/i],
  ['Fabric Loader', /Fabric Loader[^\r\n]*?([\d.]+(?:[-+][\w.-]+)?)/i],
  ['Forge', /(?:MinecraftForge|Forge)\s*(?:MC: [^,]+,\s*)?version\s*([\w.+-]+)/i],
  ['NeoForge', /NeoForge[^\r\n]*?([\d.]+(?:[-+][\w.-]+)?)/i],
  ['Quilt Loader', /Quilt Loader[^\r\n]*?([\d.]+(?:[-+][\w.-]+)?)/i],
  ['Java', /(?:Java Version|java version|JVM Version):\s*([^\r\n]+)/i],
  ['Game version', /(?:game version|version)\s*[:=]\s*([\w.+-]+)/i],
];

const SIGNATURES = [
  [/OutOfMemoryError|Java heap space|Not enough memory/i, 'Похоже на нехватку памяти. Проверьте лимит памяти и тяжёлые моды.'],
  [/NoClassDefFoundError|ClassNotFoundException/i, 'Не найден Java-класс: проверьте обязательные зависимости и версии модов.'],
  [/NoSuchMethodError|AbstractMethodError/i, 'Несовместимые версии библиотек или модов могут вызывать этот конфликт.'],
  [/MixinApplyError|MixinTransformerError/i, 'Ошибка применения mixin: вероятен конфликт модов или несовпадение версий.'],
  [/ModResolutionException|ModLoadingException|Failed to load mod/i, 'Загрузчик не смог разрешить мод или его зависимость. Проверьте модлист и версии.'],
  [/FileNotFoundException|NoSuchFileException|could not find file|file not found/i, 'В логе упоминается отсутствующий файл. Проверьте путь и целостность установки.'],
  [/NullReferenceException/i, 'Unity сообщил о NullReferenceException; приложите контекст вокруг первой ошибки.'],
  [/DXGI_ERROR_DEVICE_REMOVED|device hung|GPU crashed/i, 'Есть признаки сбоя графического устройства или драйвера.'],
  [/script error|Unknown trigger type|Unknown effect type/i, 'Похоже на ошибку игрового скрипта или неизвестный эффект/триггер.'],
];

export function redact(text, options = {}) {
  let output = String(text);
  const counts = {};
  const countReplace = (name, pattern, replacement) => {
    output = output.replace(pattern, (...args) => {
      counts[name] = (counts[name] ?? 0) + 1;
      return replacement(args);
    });
  };

  countReplace(RULES[0][0], RULES[0][1], () => '[PRIVATE KEY REDACTED]');
  for (const [name, pattern] of RULES.slice(1, 7)) {
    countReplace(name, pattern, match => name === 'Authorization token' ? `${match[1]}[REDACTED]` : '[REDACTED]');
  }
  countReplace(RULES[7][0], RULES[7][1], match => `${match[1]}${match[2]}[REDACTED]`);

  if (options.paths !== false) {
    countReplace('Windows user path', /([A-Za-z]:\\Users\\)[^\\/\s"']+/gi, () => '[USER]');
    countReplace('Windows profile path', /(\\\\[^\\]+\\Users\\)[^\\/\s"']+/gi, () => '[USER]');
    countReplace('macOS user path', /((?:\/Users\/|\/home\/))[^/\s"']+/g, () => '[USER]');
  }
  if (options.emails !== false) {
    countReplace('Email address', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, () => '[EMAIL]');
  }
  if (options.ips === true) {
    const octet = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
    countReplace('IPv4 address', new RegExp(`\\b${octet}(?:\\.${octet}){3}\\b`, 'g'), () => '[IP ADDRESS]');
  }
  return { text: output, counts };
}

export function detectGame(files) {
  const sample = files.map(file => `${file.name}\n${file.text.slice(0, 800_000)}`).join('\n');
  const scores = GAMES.map(game => ({ game, hits: [...sample.matchAll(new RegExp(game.match.source, 'gi'))].length }));
  scores.sort((a, b) => b.hits - a.hits);
  return scores[0]?.hits ? scores[0].game.id : 'other';
}

export function extractVersions(text) {
  const versions = [];
  for (const [label, regex] of VERSION_RULES) {
    const match = text.match(regex);
    if (match && !versions.some(item => item.label === label)) versions.push({ label, value: match[1].trim().slice(0, 160) });
  }
  return versions.slice(0, 8);
}

export function extractEvidence(text, limit = 8) {
  const lines = text.split(/\r?\n/);
  const result = [];
  const seen = new Set();
  const important = /\b(?:fatal|exception|error|crash|caused by|failed to|panic|outofmemory)\b|\[error\]/i;
  for (let i = 0; i < lines.length && result.length < limit; i++) {
    const line = lines[i].trim();
    if (!line || line.length < 5 || line.length > 700 || !important.test(line)) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ line: i + 1, text: line });
  }
  return result;
}

export function suggestChecks(text) {
  const found = [];
  for (const [pattern, message] of SIGNATURES) if (pattern.test(text)) found.push(message);
  return [...new Set(found)].slice(0, 5);
}

export function safeFilename(name, fallback = 'log.txt') {
  const base = redact(String(name).split(/[\\/]/).at(-1)).text.replace(/[\u0000-\u001f]/g, '').replace(/[<>:"|?*]/g, '_').trim();
  return base && base !== '.' && base !== '..' ? base.slice(0, 120) : fallback;
}

function escapeMd(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('|', '\\|').replaceAll('`', '\\`').trim();
}

export function buildReport(data, files, details) {
  const clean = value => redact(String(value ?? '')).text;
  const safeMods = clean(data.mods || 'Not provided').replaceAll('```', '`\u200b``');
  const lines = [
    `# ${escapeMd(clean(data.title || 'Game or mod issue'))}`,
    '',
    `- **Game:** ${escapeMd(details.gameLabel || data.game || 'Not selected')}`,
    `- **Platform:** ${escapeMd(clean(data.platform || 'Not selected'))}`,
    `- **Game version:** ${escapeMd(clean(data.gameVersion || details.versions.map(v => `${v.label}: ${v.value}`).join('; ') || 'Not detected'))}`,
    `- **Loader / runtime:** ${escapeMd(clean(data.loader || details.loader || 'Not detected'))}`,
    `- **Files included:** ${files.length}`,
    '',
    '## What I expected', '', escapeMd(clean(data.expected || 'Not provided')), '',
    '## What happened', '', escapeMd(clean(data.happened || 'Not provided')), '',
    '## Steps to reproduce', '', escapeMd(clean(data.steps || 'Not provided')), '',
    '## Mod list / load order', '', '```text', safeMods.trim(), '```', '',
    '## Extracted log evidence', '',
  ];
  if (!details.evidence.length) lines.push('No common error markers were detected. The sanitized logs are attached below.');
  else for (const item of details.evidence) lines.push(`- \`${escapeMd(item.file)}:${item.line}\` — ${escapeMd(clean(item.text))}`);
  lines.push('', '## Privacy', '', 'This bundle was assembled in the browser. Secret-like values, selected personal paths, and selected contact details were masked before export. Review the attached sanitized logs before sharing.', '');
  return lines.join('\n');
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function write16(view, offset, value) { view.setUint16(offset, value, true); }
function write32(view, offset, value) { view.setUint32(offset, value >>> 0, true); }

export function createZip(entries) {
  if (entries.length > 500) throw new Error('A bundle can contain at most 500 files.');
  const encoder = new TextEncoder();
  const locals = [];
  const central = [];
  let offset = 0;
  let totalSize = 0;
  for (const entry of entries) {
    const name = encoder.encode(safeFilename(entry.name));
    if (name.length > 0xffff) throw new Error('A ZIP filename is too long.');
    const data = entry.data instanceof Uint8Array ? entry.data : encoder.encode(String(entry.data));
    if (data.length > 0xffffffff) throw new Error('A ZIP entry is too large for ZIP32.');
    totalSize += data.length;
    if (totalSize > 0xffffffff) throw new Error('The ZIP bundle is too large for ZIP32.');
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length + data.length);
    const lv = new DataView(local.buffer);
    write32(lv, 0, 0x04034b50); write16(lv, 4, 20); write16(lv, 6, 0x0800); write16(lv, 8, 0);
    write16(lv, 10, 0); write16(lv, 12, 0x21); write32(lv, 14, crc); write32(lv, 18, data.length); write32(lv, 22, data.length);
    write16(lv, 26, name.length); write16(lv, 28, 0); local.set(name, 30); local.set(data, 30 + name.length);
    locals.push(local);
    const cd = new Uint8Array(46 + name.length);
    const cv = new DataView(cd.buffer);
    write32(cv, 0, 0x02014b50); write16(cv, 4, 20); write16(cv, 6, 20); write16(cv, 8, 0x0800); write16(cv, 10, 0);
    write16(cv, 12, 0); write16(cv, 14, 0x21); write32(cv, 16, crc); write32(cv, 20, data.length); write32(cv, 24, data.length);
    write16(cv, 28, name.length); write16(cv, 30, 0); write16(cv, 32, 0); write16(cv, 34, 0); write16(cv, 36, 0); write32(cv, 38, 0); write32(cv, 42, offset);
    cd.set(name, 46); central.push(cd); offset += local.length;
    if (offset > 0xffffffff) throw new Error('The ZIP bundle is too large for ZIP32.');
  }
  const centralSize = central.reduce((sum, item) => sum + item.length, 0);
  if (centralSize > 0xffffffff || offset + centralSize > 0xffffffff) throw new Error('The ZIP bundle is too large for ZIP32.');
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  write32(ev, 0, 0x06054b50); write16(ev, 4, 0); write16(ev, 6, 0); write16(ev, 8, entries.length); write16(ev, 10, entries.length);
  write32(ev, 12, centralSize); write32(ev, 16, offset); write16(ev, 20, 0);
  return new Blob([...locals, ...central, end], { type: 'application/zip' });
}
