export const OUTBOX_MAX_ITEMS = 100;
export const OUTBOX_MAX_BYTES = 12 * 1024 * 1024;
export const OUTBOX_TTL_MS = 24 * 60 * 60 * 1000;
export const OUTBOX_ACK_TIMEOUT_MS = 15000;
export const OUTBOX_MAX_ATTEMPTS = 5;
export const OUTBOX_RETRY_STEPS_MS = [1000, 2000, 5000, 10000, 20000];

export const outboxStorageKey = (accountId) => `talkx_pending_outbox_v2:${String(accountId || '').trim()}`;

const jsonBytes = (value) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const parseStoredItems = (storage, accountId) => {
  if (!accountId) return [];
  try {
    const parsed = JSON.parse(storage.getItem(outboxStorageKey(accountId)) || '[]');
    return Array.isArray(parsed)
      ? parsed.filter((item) => item && item.kind !== 'direct_image_send')
      : [];
  } catch {
    return [];
  }
};

export const clampOutbox = (items = [], now = Date.now()) => {
  const candidates = (items || [])
    .filter(Boolean)
    .filter((item) => (Number(item.expiresAt) || 0) > now)
    .slice(-OUTBOX_MAX_ITEMS);
  const accepted = [];
  let totalBytes = 2;
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const itemBytes = jsonBytes(candidates[index]) + 1;
    if (itemBytes > OUTBOX_MAX_BYTES || totalBytes + itemBytes > OUTBOX_MAX_BYTES) continue;
    accepted.unshift(candidates[index]);
    totalBytes += itemBytes;
  }
  return accepted;
};

export const readAccountOutbox = (storage, accountId, now = Date.now()) => {
  return clampOutbox(parseStoredItems(storage, accountId), now);
};

export const readExpiredAccountOutbox = (storage, accountId, now = Date.now()) => (
  parseStoredItems(storage, accountId)
    .filter((item) => (Number(item.expiresAt) || 0) <= now)
    .slice(-OUTBOX_MAX_ITEMS)
    .map((item) => ({
      clientMsgId: item.clientMsgId,
      kind: item.kind,
      targetUserId: item.targetUserId,
      text: item.text,
      createdAt: item.createdAt,
      expiresAt: item.expiresAt,
      sendState: 'expired_local',
      errorCode: 'OUTBOX_EXPIRED'
    }))
);

export const clearAccountOutbox = (storage, accountId) => {
  if (accountId) storage.removeItem(outboxStorageKey(accountId));
};

export const persistAccountOutbox = (storage, accountId, items = [], now = Date.now()) => {
  if (!accountId) return [];
  const next = clampOutbox(items, now);
  const durable = next.filter((item) => item.kind !== 'direct_image_send');
  storage.setItem(outboxStorageKey(accountId), JSON.stringify(durable));
  return next;
};

const messageKey = (message, fallback) => {
  if (message?.serverMessageId) return `server:${message.serverMessageId}`;
  if (message?.clientMsgId) return `client:${message.clientMsgId}`;
  return fallback;
};

const messageTime = (message) => {
  const value = message?.createdAt ?? message?.timestamp;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
};

export const mergeCanonicalMessages = (...collections) => {
  const result = [];
  const positions = new Map();
  collections.flat().filter(Boolean).forEach((message, index) => {
    const keys = [
      message?.serverMessageId ? `server:${message.serverMessageId}` : null,
      message?.clientMsgId ? `client:${message.clientMsgId}` : null
    ].filter(Boolean);
    const existingIndex = keys.map((key) => positions.get(key)).find((value) => value !== undefined);
    if (existingIndex !== undefined) {
      result[existingIndex] = { ...result[existingIndex], ...message };
      keys.forEach((key) => positions.set(key, existingIndex));
      return;
    }
    const nextIndex = result.length;
    result.push(message);
    keys.forEach((key) => positions.set(key, nextIndex));
    if (!keys.length) positions.set(messageKey(message, `fallback:${index}`), nextIndex);
  });
  return result
    .map((message, index) => ({ message, index }))
    .sort((a, b) => messageTime(a.message) - messageTime(b.message)
      || String(a.message.serverMessageId || '').localeCompare(String(b.message.serverMessageId || ''))
      || a.index - b.index)
    .map(({ message }) => message);
};

export const messageFromOutbox = (entry, photoLabel) => ({
  from: 'me',
  text: entry.kind === 'direct_image_send' ? photoLabel : entry.text,
  msgType: entry.kind === 'direct_image_send' ? 'image' : 'direct',
  sendState: entry.sendState || 'queued_offline',
  clientMsgId: entry.clientMsgId,
  createdAt: entry.createdAt
});

export const applyDirectAck = (messages, ack) => messages.map((message) => (
  message.clientMsgId === ack.clientMsgId
    ? {
      ...message,
      sendState: 'sent',
      serverMessageId: ack.serverMessageId || message.serverMessageId,
      conversationId: ack.conversationId || message.conversationId,
      createdAt: ack.createdAt || message.createdAt,
      errorCode: undefined
    }
    : message
));
