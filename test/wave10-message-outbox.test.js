import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  OUTBOX_MAX_ITEMS,
  OUTBOX_MAX_BYTES,
  applyDirectAck,
  clearAccountOutbox,
  mergeCanonicalMessages,
  outboxStorageKey,
  persistAccountOutbox,
  readAccountOutbox,
  readExpiredAccountOutbox
} from '../src/state/messageOutbox.js';

const memoryStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
};

test('outbox storage is account-scoped, TTL filtered, and bounded', () => {
  const storage = memoryStorage();
  const now = 1000;
  const items = Array.from({ length: OUTBOX_MAX_ITEMS + 5 }, (_, index) => ({
    clientMsgId: `id-${index}`,
    expiresAt: index === 0 ? now - 1 : now + 1000
  }));
  persistAccountOutbox(storage, 'account-a', items, now);
  assert.notEqual(outboxStorageKey('account-a'), outboxStorageKey('account-b'));
  assert.equal(readAccountOutbox(storage, 'account-a', now).length, OUTBOX_MAX_ITEMS);
  assert.deepEqual(readAccountOutbox(storage, 'account-b', now), []);
  assert.equal(OUTBOX_MAX_BYTES, 12 * 1024 * 1024);
  clearAccountOutbox(storage, 'account-a');
  assert.deepEqual(readAccountOutbox(storage, 'account-a', now), []);
});

test('expired entries are visible as terminal local state but never hydrate for sending', () => {
  const storage = memoryStorage();
  storage.setItem(outboxStorageKey('account-a'), JSON.stringify([{
    clientMsgId: 'expired-1',
    kind: 'direct_message',
    targetUserId: 'friend-1',
    text: 'old',
    payload: { type: 'direct_message', token: 'must-not-surface' },
    expiresAt: 999
  }]));
  assert.deepEqual(readAccountOutbox(storage, 'account-a', 1000), []);
  const expired = readExpiredAccountOutbox(storage, 'account-a', 1000);
  assert.equal(expired[0].sendState, 'expired_local');
  assert.equal(expired[0].payload, undefined);
});

test('history, live event, ack, and outbox copies converge by canonical identities', () => {
  const local = { from: 'me', text: 'hello', clientMsgId: 'client-1', sendState: 'pending', createdAt: 10 };
  const live = {
    from: 'me', text: 'hello', clientMsgId: 'client-1', serverMessageId: 'server-1',
    sendState: 'sent', createdAt: '2026-09-24T12:00:00.000Z'
  };
  const history = { ...live, conversationId: 'conversation-1' };
  const merged = mergeCanonicalMessages([local], [live], [history]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].serverMessageId, 'server-1');
  assert.equal(merged[0].conversationId, 'conversation-1');
});

test('durable ack updates the existing optimistic row without changing client identity', () => {
  const messages = [{ from: 'me', text: 'hello', clientMsgId: 'client-1', sendState: 'pending' }];
  const next = applyDirectAck(messages, {
    clientMsgId: 'client-1',
    serverMessageId: 'server-1',
    conversationId: 'conversation-1',
    createdAt: '2026-09-24T12:00:00.000Z'
  });
  assert.equal(next[0].clientMsgId, 'client-1');
  assert.equal(next[0].serverMessageId, 'server-1');
  assert.equal(next[0].sendState, 'sent');
});

test('App preserves retry identity and ChatScreen uses stable message keys', () => {
  const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const chatSource = fs.readFileSync(new URL('../src/screens/ChatScreen.jsx', import.meta.url), 'utf8');
  assert.match(appSource, /handleRetryMessage = \(clientMsgId\)/);
  assert.match(appSource, /item\.clientMsgId === clientMsgId/);
  assert.match(appSource, /protocolVersion: 1,\s+targetUserId:/);
  assert.match(appSource, /const next = queue\[0\]/);
  assert.match(chatSource, /key=\{m\.serverMessageId \|\| m\.clientMsgId/);
  assert.match(chatSource, /failed_retryable/);
});
