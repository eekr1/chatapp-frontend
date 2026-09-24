import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');

test('Wave 12 registration and reaccept bind to server release identity', () => {
  const auth = read('../src/components/Auth.jsx');
  const api = read('../src/api.js');
  const app = read('../src/App.jsx');
  assert.match(auth, /expected_release_id: legalReleaseId/);
  assert.match(auth, /command_id: createCommandId\(\)/);
  assert.match(api, /expected_release_id: expectedReleaseId/);
  assert.match(api, /command_id: commandId/);
  assert.match(app, /accepted: response\?\.data\?\.accepted_versions/);
  assert.doesNotMatch(app, /accepted_at: new Date\(\)\.toISOString\(\)/);
});

test('Wave 12 auth recovery preserves a valid token on network and 5xx errors', () => {
  const app = read('../src/App.jsx');
  assert.match(app, /if \(statusCode === 401\)/);
  assert.match(app, /setAuthRecoveryError\(true\)/);
  assert.match(app, /sessionRecoveryUnavailable/);
  assert.match(app, /status: 'unavailable'/);
});

test('Wave 12 account surfaces keep support and deletion commands idempotent', () => {
  const home = read('../src/screens/HomeScreen.jsx');
  const api = read('../src/api.js');
  const app = read('../src/App.jsx');
  assert.match(home, /supportSubmissionIdRef/);
  assert.match(home, /deletionCommandIdRef/);
  assert.match(home, /settings-danger-zone/);
  assert.match(api, /'Idempotency-Key': commandId/);
  assert.match(app, /formData\.append\('submissionId', submissionId\)/);
  assert.match(app, /supportDuplicate/);
});

test('Wave 12 published legal view exposes release identity and unavailable state', () => {
  const screen = read('../src/screens/LegalScreen.jsx');
  assert.match(screen, /legalContent\?\.release_id/);
  assert.match(screen, /role="alert"/);
  assert.match(screen, /releaseIdentity/);
});
