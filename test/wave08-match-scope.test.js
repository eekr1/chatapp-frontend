import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  INITIAL_MATCH_SCOPE_STATE,
  applyMatchScopeEvent,
  hydrateMatchScope,
  isScopeConsistentEvent
} from '../src/state/matchScope.js';

const memoryStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value)
  };
};

test('first use is Global and saved preference is isolated per account', () => {
  const storage = memoryStorage({ 'talkx_match_scope_v1:u1': 'COUNTRY' });
  const capability = { version: 'match-scope-v1', countryAvailable: true, country: { code: 'TR', displayName: 'T�rkiye' } };
  assert.equal(hydrateMatchScope('u1', capability, storage).preferredMatchScope, 'COUNTRY');
  assert.equal(hydrateMatchScope('u2', capability, storage).preferredMatchScope, 'GLOBAL');
});

test('unavailable country disables a saved Country preference without inventing geo data', () => {
  const storage = memoryStorage({ 'talkx_match_scope_v1:u1': 'COUNTRY' });
  const state = hydrateMatchScope('u1', { version: 'match-scope-v1', countryAvailable: false, unavailableReason: 'MATCH_COUNTRY_STALE' }, storage);
  assert.equal(state.preferredMatchScope, 'GLOBAL');
  assert.equal(state.country, null);
  assert.equal(state.unavailableReason, 'MATCH_COUNTRY_STALE');
  const failed = applyMatchScopeEvent({ ...state, countryAvailable: true, preferredMatchScope: 'COUNTRY' }, {
    type: 'search_error', errorCode: 'MATCH_COUNTRY_UNAVAILABLE'
  });
  assert.equal(failed.countryAvailable, false);
  assert.equal(failed.preferredMatchScope, 'GLOBAL');
});

test('server acknowledgement is effective truth and fallback never silently changes scope', () => {
  const queued = applyMatchScopeEvent({ ...INITIAL_MATCH_SCOPE_STATE, capability: true }, {
    type: 'queued', effectiveMatchScope: 'COUNTRY', country: { code: 'TR', displayName: 'T�rkiye' }, fallbackStatus: 'hidden'
  });
  const fallback = applyMatchScopeEvent(queued, { type: 'country_fallback_available' });
  assert.equal(fallback.effectiveMatchScope, 'COUNTRY');
  assert.equal(fallback.fallbackStatus, 'visible');
  assert.equal(applyMatchScopeEvent(fallback, { type: 'country_fallback_ack', action: 'continue' }).effectiveMatchScope, 'COUNTRY');
});

test('offer integrity rejects mismatched scope or country', () => {
  const state = { ...INITIAL_MATCH_SCOPE_STATE, effectiveMatchScope: 'COUNTRY', country: { code: 'TR' } };
  assert.equal(isScopeConsistentEvent(state, { effectiveMatchScope: 'COUNTRY', country: { code: 'TR' } }), true);
  assert.equal(isScopeConsistentEvent(state, { effectiveMatchScope: 'COUNTRY', country: { code: 'DE' } }), false);
  assert.equal(isScopeConsistentEvent(state, { effectiveMatchScope: 'GLOBAL' }), false);
});

test('Home and Match share one control while offer UI remains scope-free', () => {
  const home = fs.readFileSync(new URL('../src/screens/HomeScreen.jsx', import.meta.url), 'utf8');
  const match = fs.readFileSync(new URL('../src/screens/MatchScreen.jsx', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(home, /MatchScopeControl/);
  assert.match(match, /MatchScopeControl/);
  assert.match(app, /matchScope={matchScope}/);
  assert.match(app, /type: 'changeMatchScope'/);
  assert.match(app, /moodId: current\.moodId/);
  assert.doesNotMatch(match, /match-journey__offer[\s\S]*MatchScopeControl/);
});
