import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import messagesEn from '../src/i18n/messages.en.js';
import messagesTr from '../src/i18n/messages.tr.js';
import {
    normalizeNotificationPayload,
    notificationDeliveryKey,
    resolveNotificationRoute
} from '../src/notifications/notificationRouting.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const flatten = (value, prefix = '', result = {}) => {
    for (const [key, entry] of Object.entries(value || {})) {
        const next = prefix ? `${prefix}.${key}` : key;
        if (entry && typeof entry === 'object') flatten(entry, next, result);
        else result[next] = entry;
    }
    return result;
};
const placeholders = (value) => Array.from(String(value || '').matchAll(/\{([^}]+)\}/g))
    .map((match) => match[1])
    .sort();

test('Wave 13 frontend TR and EN dictionaries keep key and placeholder parity', () => {
    const en = flatten(messagesEn);
    const tr = flatten(messagesTr);
    assert.deepEqual(Object.keys(tr).sort(), Object.keys(en).sort());
    for (const key of Object.keys(en)) {
        assert.deepEqual(placeholders(tr[key]), placeholders(en[key]), key);
    }
});

test('Wave 13 notification payload normalization accepts native nested data', () => {
    const normalized = normalizeNotificationPayload({
        notification: {
            title: 'TalkX',
            body: 'Message',
            data: { type: 'direct_message', fromUserId: 'user-1', deliveryId: 'delivery-1' }
        }
    });
    assert.equal(normalized.type, 'direct_message');
    assert.equal(normalized.deliveryId, 'delivery-1');
    assert.equal(normalized.data.fromUserId, 'user-1');
});

test('Wave 13 delivery dedupe separates receipt presentation from tap action', () => {
    const notification = { deliveryId: 'delivery-1' };
    assert.equal(notificationDeliveryKey(notification, 'received'), 'delivery-1:received');
    assert.equal(notificationDeliveryKey(notification, 'action'), 'delivery-1:action');
});

test('Wave 13 deep links are allowlisted and never execute arbitrary routes', () => {
    assert.deepEqual(resolveNotificationRoute({
        type: 'direct_message',
        data: { fromUserId: 'user-1', route: 'javascript:alert(1)' }
    }), { kind: 'friend_chat', friendId: 'user-1' });
    assert.deepEqual(resolveNotificationRoute({
        type: 'friend_request_incoming',
        data: { route: 'https://example.invalid' }
    }), { kind: 'friends' });
    assert.equal(resolveNotificationRoute({
        type: 'unknown',
        data: { route: 'javascript:alert(1)' }
    }), null);
});

test('Wave 13 app registers device locale and opens direct-message taps through canonical friend state', () => {
    const app = read('src/App.jsx');
    assert.match(app, /locale\s*\n\s*}\);/);
    assert.match(app, /notificationDeliveryKey\(normalizedPayload, phase\)/);
    assert.match(app, /openFriendChatFnRef\.current\(friend\)/);
    assert.match(app, /handlePushPayload\(\{[\s\S]*event\?\.notification[\s\S]*data: extra[\s\S]*}, false\)/);
    assert.doesNotMatch(app, /window\.location\s*=\s*data\./);
});
