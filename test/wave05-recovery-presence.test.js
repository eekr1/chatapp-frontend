import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
    applyPresenceUpdate,
    parseRecoverySnapshot,
    reconcileUnread,
    resolvePresenceText,
    shouldAcceptServerEvent
} from '../src/state/recoveryState.js';

const snapshot = {
    type: 'recovery_snapshot', schemaVersion: 1,
    connectionId: 'connection-1', serverEpoch: 'epoch-1',
    serverNow: '2026-09-23T10:00:00.000Z', result: 'resumed', reason: 'none',
    recoveryGraceMs: 15000, stateRevision: 4,
    active: { kind: 'offer', matchId: 'match-1', autoAcceptAt: 10000 },
    unread: { friends: [{ userId: 'friend-1', count: 2 }], system: 0, revision: 3 },
    recoveryToken: 'x'.repeat(43)
};

test('recovery snapshot parser accepts the v1 discriminated active state', () => {
    const parsed = parseRecoverySnapshot(snapshot);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.value.active.kind, 'offer');
    assert.equal(parsed.value.stateRevision, 4);
    assert.deepEqual(reconcileUnread(parsed.value.unread), { 'friend-1': 2 });
});

test('unknown recovery version and multiple/invalid active kinds fail closed', () => {
    assert.equal(parseRecoverySnapshot({ ...snapshot, schemaVersion: 2 }).reason, 'unsupported_version');
    assert.equal(parseRecoverySnapshot({ ...snapshot, active: { kind: 'room_and_queue' } }).reason, 'invalid_active_state');
});

test('event guard rejects stale connection, epoch and revision', () => {
    const connection = { ready: true, connectionId: 'c2', serverEpoch: 'e2', stateRevision: 8 };
    assert.equal(shouldAcceptServerEvent({ connectionId: 'c1', serverEpoch: 'e2', stateRevision: 9 }, connection), false);
    assert.equal(shouldAcceptServerEvent({ connectionId: 'c2', serverEpoch: 'e1', stateRevision: 9 }, connection), false);
    assert.equal(shouldAcceptServerEvent({ connectionId: 'c2', serverEpoch: 'e2', stateRevision: 7 }, connection), false);
    assert.equal(shouldAcceptServerEvent({ connectionId: 'c2', serverEpoch: 'e2', stateRevision: 8 }, connection), true);
});

test('presence updates are friend keyed and reject older evidence', () => {
    const friends = [{
        user_id: 'friend-1', presence_state: 'offline', last_seen_at: '2026-09-23T09:00:00.000Z',
        presence_observed_at: '2026-09-23T10:00:00.000Z', presence_revision: 4
    }];
    const stale = applyPresenceUpdate(friends, {
        userId: 'friend-1', presence: 'online', observedAt: '2026-09-23T09:59:00.000Z', stateRevision: 3
    });
    assert.equal(stale[0].presence_state, 'offline');
    const current = applyPresenceUpdate(friends, {
        userId: 'friend-1', presence: 'online', observedAt: '2026-09-23T10:01:00.000Z', stateRevision: 5
    });
    assert.equal(current[0].presence_state, 'online');
    assert.equal(current[0].is_online, true);
});

test('relative presence is honest for online, unknown, invalid, future and elapsed time', () => {
    const t = (key, values = {}) => `${key}:${values.count ?? ''}`;
    const now = Date.parse('2026-09-23T10:00:00.000Z');
    assert.equal(resolvePresenceText({ presence: 'online' }, t, now).key, 'online');
    assert.equal(resolvePresenceText({ presence: 'unknown' }, t, now).key, 'unknown');
    assert.equal(resolvePresenceText({ presence: 'offline', lastSeenAt: 'invalid' }, t, now).key, 'offline');
    assert.equal(resolvePresenceText({ presence: 'offline', lastSeenAt: '2026-09-23T11:00:00.000Z' }, t, now).key, 'unknown');
    assert.equal(resolvePresenceText({ presence: 'offline', lastSeenAt: '2026-09-23T09:45:00.000Z' }, t, now).key, 'lastSeenMinutes');
});

test('friend UI sources presence text and does not hard-code common.online', async () => {
    const chat = await readFile(new URL('../src/screens/ChatScreen.jsx', import.meta.url), 'utf8');
    const list = await readFile(new URL('../src/screens/FriendsScreen.jsx', import.meta.url), 'utf8');
    assert.match(chat, /presenceLabel/);
    assert.doesNotMatch(chat, /isChatEnded \? t\('chat\.ended'\) : t\('common\.online'\)/);
    assert.match(list, /presenceLabel/);
    assert.match(list, /aria-label/);
});

test('App gates outbox on recovery and guards late friend history and media ownership', async () => {
    const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    assert.match(app, /wsAuthenticatedRef\.current && recoveryReadyRef\.current/);
    assert.match(app, /friendHistoryRequestRef\.current !== historyRequestId/);
    assert.match(app, /current\.ownerMode === chatMode && current\.ownerId === ownerId/);
    assert.match(app, /leaveIntentRef\.current/);
    assert.match(app, /serverAutoAcceptAt/);
});
