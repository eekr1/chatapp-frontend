import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { BACK_ACTIONS, resolveBackAction } from '../src/app/navigationPolicy.js';
import { consumeAuthNotice, resolveAuthNoticeKey, storeAuthNotice } from '../src/auth/authPolicy.js';
import { REALTIME_DOMAINS, resolveRealtimeDomain, shouldIgnoreRealtimeEvent } from '../src/state/realtimeDomains.js';
import { normalizeClientState, selectHighestPriorityState } from '../src/ui/screenState.js';

test('back policy honors modal, transient screen and exit priority', () => {
    assert.equal(resolveBackAction({ permissionOpen: true }), BACK_ACTIONS.CLOSE_PERMISSION);
    assert.equal(resolveBackAction({ legalOpen: true }), BACK_ACTIONS.NAVIGATE_ROOT);
    assert.equal(resolveBackAction({ authenticated: true, imageViewerOpen: true }), BACK_ACTIONS.CLOSE_IMAGE);
    assert.equal(resolveBackAction({ authenticated: true, screen: 'chat' }), BACK_ACTIONS.LEAVE_TRANSIENT);
    assert.equal(resolveBackAction({ authenticated: true, screen: 'friends' }), BACK_ACTIONS.NAVIGATE_HOME);
    assert.equal(resolveBackAction({ authenticated: false }), BACK_ACTIONS.EXIT_OR_CONFIRM);
});

test('realtime domains isolate stale match events from friend chat', () => {
    assert.equal(resolveRealtimeDomain('match_offer'), REALTIME_DOMAINS.MATCH);
    assert.equal(resolveRealtimeDomain('direct_message'), REALTIME_DOMAINS.FRIEND);
    assert.equal(resolveRealtimeDomain('admin_notice'), REALTIME_DOMAINS.SYSTEM);
    assert.equal(shouldIgnoreRealtimeEvent('message', { chatMode: 'friends', screen: 'chat' }), true);
    assert.equal(shouldIgnoreRealtimeEvent('direct_message', { chatMode: 'friends', screen: 'chat' }), false);
});

test('screen state priority is deterministic', () => {
    assert.equal(normalizeClientState('unknown'), 'ready');
    assert.equal(selectHighestPriorityState(['empty', 'offline', 'stale']), 'offline');
    assert.equal(selectHighestPriorityState(['ready', 'partial_error']), 'partial_error');
});

test('auth notice storage is one-shot and only accepts known outcomes', () => {
    const values = new Map();
    const storage = {
        getItem: (key) => values.get(key) || null,
        setItem: (key, value) => values.set(key, value),
        removeItem: (key) => values.delete(key)
    };
    assert.equal(storeAuthNotice(storage, 'sessionEnded'), true);
    assert.equal(consumeAuthNotice(storage), 'sessionEnded');
    assert.equal(consumeAuthNotice(storage), null);
    assert.equal(storeAuthNotice(storage, 'unknown'), false);
    assert.equal(resolveAuthNoticeKey('passwordChanged'), 'auth.passwordChangedNotice');
});

test('auth source exposes labels, error association and semantic mode switch', async () => {
    const source = await readFile(new URL('../src/components/Auth.jsx', import.meta.url), 'utf8');
    const stateSource = await readFile(new URL('../src/components/ClientStateMessage.jsx', import.meta.url), 'utf8');
    assert.match(source, /<label[^>]+htmlFor="auth-username"/);
    assert.match(source, /aria-describedby=/);
    assert.match(source, /<ClientStateMessage state="partial_error"/);
    assert.match(stateSource, /role=\{isError \? 'alert' : 'status'\}/);
    assert.match(source, /className="auth-mode-switch"/);
    assert.doesNotMatch(source, /err\.response\?\.data\?\.error/);
});

test('foundation CSS includes semantic tokens, focus, touch and reduced motion', async () => {
    const tokens = await readFile(new URL('../src/theme/tokens.css', import.meta.url), 'utf8');
    const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
    assert.match(tokens, /--touch-target-min:\s*44px/);
    assert.match(tokens, /--color-surface:/);
    assert.match(css, /:focus-visible/);
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
    assert.match(css, /\.client-toast-stack/);
    assert.doesNotMatch(css, /\.admin-toast-stack/);
});
