import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const testDir = path.join(repoRoot, 'test');
const allTests = [
  'wave03-foundation.test.js',
  'wave05-recovery-presence.test.js',
  'wave07-search-lifecycle.test.js',
  'wave08-match-scope.test.js',
  'wave09-pending-match.test.js',
  'wave10-message-outbox.test.js',
  'wave11-media-trust.test.js',
  'wave12-legal-account.test.js',
  'wave13-locale-notification.test.js',
  'wave18-mobile-release.test.js'
];
const criticalTests = [
  'wave03-foundation.test.js',
  'wave05-recovery-presence.test.js',
  'wave07-search-lifecycle.test.js',
  'wave08-match-scope.test.js',
  'wave09-pending-match.test.js',
  'wave10-message-outbox.test.js',
  'wave12-legal-account.test.js',
  'wave18-mobile-release.test.js'
];
const blockedExternalVariables = [
  'DATABASE_URL',
  'FIREBASE_SERVICE_ACCOUNT',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'BREVO_API_KEY'
];

const fail = (message) => {
  throw new Error(`[quality-gate] ${message}`);
};

const assertNoExternalTargets = (env = process.env) => {
  const present = blockedExternalVariables.filter((name) => String(env[name] || '').trim());
  if (present.length) fail(`external/live configuration is forbidden for frontend tests: ${present.join(', ')}`);
};

const inspectSuite = (label, files) => {
  if (!files.length) fail(`${label} discovered zero test files`);
  let declarations = 0;
  for (const file of files) {
    const source = readFileSync(path.join(testDir, file), 'utf8');
    declarations += (source.match(/\btest\s*\(/g) || []).length;
  }
  if (declarations === 0) fail(`${label} discovered zero tests`);
  return declarations;
};

const assertCoreManifestComplete = () => {
  const discovered = readdirSync(testDir).filter((file) => file.endsWith('.test.js')).sort();
  assert.deepEqual(discovered, [...allTests].sort(), 'frontend core test manifest must include every .test.js file');
};

const runSuite = (label, files) => {
  assertNoExternalTargets();
  const markers = inspectSuite(label, files);
  console.log(`[quality-gate] ${label}: ${files.length} files, ${markers} test markers; executed count follows from Node TAP`);
  const result = spawnSync(process.execPath, ['--test', ...files.map((file) => path.join('test', file))], {
    cwd: repoRoot,
    env: { ...process.env, NODE_ENV: 'test' },
    stdio: 'inherit'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

const selfTest = () => {
  assert.throws(() => inspectSuite('empty-fixture', []), /zero test files/);
  assert.throws(() => assertNoExternalTargets({ DATABASE_URL: 'postgres://production.example/talkx' }), /DATABASE_URL/);
  assert.doesNotThrow(() => assertNoExternalTargets({ NODE_ENV: 'test' }));
  assert.ok(inspectSuite('core', allTests) > 0);
  assert.ok(inspectSuite('critical', criticalTests) > 0);
  assertCoreManifestComplete();
  console.log('[quality-gate] self-test passed: zero-test and external-target guards fail closed');
};

const mode = process.argv[2];
if (mode === 'self-test') selfTest();
else if (mode === 'core') runSuite('frontend-core', allTests);
else if (mode === 'critical') runSuite('frontend-critical', criticalTests);
else fail(`unknown mode: ${mode || '<missing>'}`);
