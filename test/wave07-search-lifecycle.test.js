import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  INITIAL_SEARCH_STATE,
  applySearchEvent,
  createSearchIntent,
  getSearchDisplayTier,
  getSearchElapsedMs,
  shouldAcceptSearchEvent
} from '../src/state/searchLifecycle.js';
import { PROMPT_CATALOG, chooseNextPrompt, getCategoryPrompts, getPrompt } from '../src/match/promptCatalog.js';

const id = (seed) => `${String(seed).padStart(8, '0')}-0000-4000-8000-000000000000`;

test('timer is absent before queued acknowledgement and uses server clock afterwards', () => {
  const intent = createSearchIntent({ searchId: id(1), commandId: id(2), promptId: 'fun-01' });
  assert.equal(getSearchElapsedMs(intent, 5000), null);
  assert.equal(getSearchDisplayTier(intent, 5000), 'preparing');
  const queued = applySearchEvent(intent, {
    type: 'queued', protocolVersion: 1, searchId: id(1), queueAttempt: 1, searchRevision: 1,
    queuedAt: 10000, serverNow: 12000
  }, 5000);
  assert.equal(getSearchElapsedMs(queued, 7000), 4000);
  assert.equal(getSearchDisplayTier(queued, 15000), 'continuing');
  assert.equal(getSearchDisplayTier(queued, 27000), 'quiet');
  assert.equal(getSearchDisplayTier(queued, 52000), 'extended');
  assert.equal(getSearchElapsedMs({ ...queued, phase: 'reconnecting' }, 52000), null);
});

test('stale search, attempt and revision events cannot mutate the current journey', () => {
  const current = { ...INITIAL_SEARCH_STATE, searchId: id(3), phase: 'queued', queueAttempt: 2, searchRevision: 4 };
  assert.equal(shouldAcceptSearchEvent(current, { searchId: id(4), queueAttempt: 3, searchRevision: 5 }), false);
  assert.equal(shouldAcceptSearchEvent(current, { searchId: id(3), queueAttempt: 1, searchRevision: 99 }), false);
  assert.equal(shouldAcceptSearchEvent(current, { searchId: id(3), queueAttempt: 2, searchRevision: 3 }), false);
});

test('offer and cancel are identity bound while mood and prompt survive the journey', () => {
  const intent = createSearchIntent({ searchId: id(5), commandId: id(6), moodId: 'deep', promptId: 'deep-02' });
  const offered = applySearchEvent(intent, { type: 'match_offer', searchId: id(5), queueAttempt: 1, searchRevision: 2 });
  assert.equal(offered.phase, 'offer');
  assert.equal(offered.promptId, 'deep-02');
  const ignored = applySearchEvent(offered, { type: 'queue_left', searchId: id(7), queueAttempt: 1, searchRevision: 3 });
  assert.equal(ignored, offered);
  const cancelled = applySearchEvent(offered, { type: 'queue_left', searchId: id(5), queueAttempt: 1, searchRevision: 3 });
  assert.equal(cancelled.phase, 'cancelled');
});

test('prompt catalogue has locale parity and eight prompts in every real category', () => {
  assert.equal(PROMPT_CATALOG.length, 24);
  assert.equal(new Set(PROMPT_CATALOG.map((prompt) => prompt.id)).size, PROMPT_CATALOG.length);
  for (const category of ['fun', 'casual', 'deep']) assert.equal(getCategoryPrompts(category).length, 8);
  for (const prompt of PROMPT_CATALOG) {
    assert.ok(prompt.text.en.trim());
    assert.ok(prompt.text.tr.trim());
    assert.ok(prompt.text.en.length <= 100);
    assert.ok(prompt.text.tr.length <= 100);
    assert.equal(getPrompt(prompt.id, 'tr').id, prompt.id);
  }
  assert.notEqual(chooseNextPrompt({ category: 'fun', currentId: 'fun-01', random: () => 0 }), 'fun-01');
});

test('reset is terminal locally and a retry creates a distinct identity', () => {
  const first = createSearchIntent({ searchId: id(8), commandId: id(9), promptId: 'casual-01' });
  const reset = applySearchEvent(first, { type: 'search_reset' });
  assert.equal(reset.phase, 'idle');
  assert.equal(reset.searchId, null);
  const retried = createSearchIntent({ searchId: id(10), commandId: id(11), promptId: 'fun-02' });
  assert.notEqual(retried.searchId, first.searchId);
});

test('recovery snapshot is authoritative while preserving client-only selection', () => {
  const local = createSearchIntent({ searchId: id(12), commandId: id(13), moodId: 'deep', promptId: 'deep-04' });
  const recovered = applySearchEvent(local, {
    type: 'recovery_search', searchId: id(14), queueAttempt: 2, searchRevision: 7,
    phase: 'queued', queuedAt: 4000, serverNow: 6000
  }, 5000);
  assert.equal(recovered.searchId, id(14));
  assert.equal(recovered.moodId, 'deep');
  assert.equal(recovered.promptId, 'deep-04');
});

test('Wave 07 UI is manually advanced and websocket commands carry lifecycle identity', () => {
  const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const screenSource = fs.readFileSync(new URL('../src/screens/MatchScreen.jsx', import.meta.url), 'utf8');
  const chatSource = fs.readFileSync(new URL('../src/screens/ChatScreen.jsx', import.meta.url), 'utf8');
  assert.match(appSource, /matchSearchLifecycleV1/);
  assert.match(appSource, /protocolVersion: intent\.protocolVersion/);
  assert.match(appSource, /searchId: intent\.searchId/);
  assert.match(appSource, /type: 'search_cancel_pending'/);
  assert.match(appSource, /case 'queued':\s+if \(!shouldAcceptSearchEvent/);
  assert.match(screenSource, /onNextPrompt/);
  assert.match(chatSource, /setInputValue\(promptSuggestion\)/);
  assert.doesNotMatch(chatSource, /onSend\(promptSuggestion\)/);
  assert.doesNotMatch(screenSource, /setInterval\(.*question/i);
  assert.doesNotMatch(appSource, /effectiveMatchScope|preferredMatchScope|country_fallback_available/);
});
