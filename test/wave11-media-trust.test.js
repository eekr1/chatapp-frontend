import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  outboxStorageKey,
  persistAccountOutbox,
  readAccountOutbox
} from '../src/state/messageOutbox.js';

const memoryStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
};

test('Wave 11 never persists image binaries in account outbox', () => {
  const storage = memoryStorage();
  const now = Date.now();
  const runtime = persistAccountOutbox(storage, 'account-a', [{
    clientMsgId: 'image-1',
    kind: 'direct_image_send',
    expiresAt: now + 1000,
    payload: { imageData: 'data:image/png;base64,secret-binary' }
  }], now);
  assert.equal(runtime.length, 1);
  assert.equal(storage.getItem(outboxStorageKey('account-a')), '[]');
  assert.deepEqual(readAccountOutbox(storage, 'account-a', now), []);
});

test('Wave 11 report and media dialogs expose accessible semantics', () => {
  const source = fs.readFileSync(new URL('../src/screens/ChatScreen.jsx', import.meta.url), 'utf8');
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /reasonCategory/);
  assert.match(source, /mediaStatus/);
});

test('Wave 11 replaces prompt reporting with structured report commands', () => {
  const source = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /window\.prompt\(t\('app\.reportPrompt'\)\)/);
  assert.match(source, /commandId: randomId\(\)/);
  assert.match(source, /reasonCategory/);
  assert.match(source, /current\.kind === 'direct_image_send' \? 'MEDIA_RESULT_UNKNOWN' : 'ACK_TIMEOUT'/);
});
