import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = ['server', 'src', 'tests', 'scripts', 'functions', 'db'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);
const TEXT_EXT = new Set(['.js', '.jsx', '.mjs', '.cjs', '.json', '.css', '.html', '.md', '.yml', '.yaml', '.sql', '.example']);

function walk(dir) {
  const out = [];
  if (!existsSafe(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (TEXT_EXT.has(path.extname(full)) || entry === '.env.example') out.push(full);
  }
  return out;
}

function existsSafe(p) {
  try { return Boolean(statSync(p)); } catch { return false; }
}

// A missing import only throws when the route is first hit — and the routes here
// swallow errors into a 503, so it fails silently in production. This catches
// "referenced but not imported" statically.
const SERVER_MODULES = ['auditInbox.js', 'auditInboxStore.js', 'session.js', 'security.js', 'db.js'];

test('server/index.js imports every helper it calls', async () => {
  const indexPath = path.join(rootDir, 'server', 'index.js');
  const source = readFileSync(indexPath, 'utf8');

  // Everything outside the import statements.
  const body = source.replace(/import\s*(?:[\w*\s{},]+)\s*from\s*'[^']+';?/g, '');

  const importedFrom = (mod) => {
    const names = new Set();
    for (const m of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
      if (m[2].replace(/^\.\//, '') !== mod) continue;
      for (const part of m[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/)[0].trim();
        if (name) names.add(name);
      }
    }
    return names;
  };

  const missing = [];
  for (const mod of SERVER_MODULES) {
    const exported = Object.keys(await import(pathToFileURL(path.join(rootDir, 'server', mod)).href));
    const imported = importedFrom(mod);
    for (const name of exported) {
      if (imported.has(name)) continue;
      // Only flag call sites, so comments and docs cannot cause false alarms.
      if (new RegExp(`\\b${name}\\s*\\(`).test(body)) missing.push(`${name} (exported by server/${mod})`);
    }
  }

  assert.deepEqual(
    missing, [],
    `used but never imported — these throw ReferenceError at runtime:\n${missing.join('\n')}`,
  );
});

test('source files contain no raw control bytes (keeps diffs reviewable and git text-based)', () => {
  const offenders = [];
  for (const file of walk(rootDir)) {
    const buf = readFileSync(file);
    for (let i = 0; i < buf.length; i += 1) {
      const b = buf[i];
      // Allow tab (9), LF (10) and CR (13). Everything else below 32 plus DEL
      // must be written as an escape sequence (e.g. \u0000), never literally.
      if (b === 9 || b === 10 || b === 13) continue;
      if (b < 32 || b === 127) {
        offenders.push(`${path.relative(rootDir, file)}: byte 0x${b.toString(16).padStart(2, '0')} at offset ${i}`);
        break;
      }
    }
  }
  assert.deepEqual(offenders, [], `literal control bytes found:\n${offenders.join('\n')}`);
});


test('retired map provider is absent while Gemini and Google Places remain wired', () => {
  const files = walk(rootDir);
  const retiredNames = [
    ['OpenStreet', 'Map'].join(''),
    ['Over', 'pass'].join(''),
  ];
  const matches = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const name of retiredNames) {
      if (source.toLowerCase().includes(name.toLowerCase())) {
        matches.push(`${path.relative(rootDir, file)} contains retired provider reference ${name}`);
      }
    }
  }
  assert.deepEqual(matches, [], `retired map provider references remain:\n${matches.join('\n')}`);

  const places = readFileSync(path.join(rootDir, 'server', 'googlePlaces.js'), 'utf8');
  const gemini = readFileSync(path.join(rootDir, 'src', 'lib', 'geminiLeadFinder.js'), 'utf8');
  assert.match(places, /places\.googleapis\.com\/v1\/places:searchText/, 'official Google Places API must remain configured');
  assert.match(gemini, /generativelanguage\.googleapis\.com/, 'Gemini lead discovery must remain available');
});


test('Audit Inbox cannot regress to passwordless read or management access', () => {
  const server = readFileSync(path.join(rootDir, 'server', 'index.js'), 'utf8');
  const inbox = readFileSync(path.join(rootDir, 'src', 'components', 'AuditInbox.jsx'), 'utf8');
  assert.match(server, /const auditInboxConfigured = \(\) => isDatabaseConfigured\(\) && isOwnerAuthConfigured\(\)/);
  assert.match(server, /async function requireAuditOwner\(req, res\)[\s\S]*?resolveOwnerSession\(req\)/);
  assert.match(server, /app\.patch\('\/api\/audit\/requests\/:id',[\s\S]*?passesCsrfCheck\(req, session\)/);
  assert.match(server, /app\.delete\('\/api\/audit\/requests\/:id',[\s\S]*?passesCsrfCheck\(req, session\)/);
  assert.match(inbox, /Owner-only Audit Inbox/);
  assert.match(inbox, /api\/audit\/session\/logout/);
  assert.doesNotMatch(server, /return \{ passwordless: true \}/);
  assert.doesNotMatch(inbox, /passwordless access is enabled/i);
});
