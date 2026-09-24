import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPendingMatchEvent,
  beginPendingMatchDecision,
  createPendingMatchOffer,
  getOfferTiming
} from '../src/state/pendingMatch.js';

const event = {
  type: 'match_offer',
  matchId: '11111111-1111-4111-8111-111111111111',
  searchId: '22222222-2222-4222-8222-222222222222',
  matchRevision: 1,
  matchStatus: 'offered',
  peerPublicLabel: 'Ada',
  offeredAt: 10000,
  autoAcceptAt: 18000,
  serverNow: new Date(12000).toISOString(),
  timeoutMs: 8000
};

test('server clock drives countdown and progress', () => {
  const offer = createPendingMatchOffer(event, 2000);
  assert.deepEqual(getOfferTiming(offer, 3000), { countdownSeconds: 5, progressPercent: 37.5 });
});

test('decision remains pending until matching command acknowledgement', () => {
  const offer = beginPendingMatchDecision(createPendingMatchOffer(event, 2000), 'accept', 'command-a');
  const staleAck = applyPendingMatchEvent(offer, { ...event, type: 'match_decision_result', commandId: 'command-b', result: 'waiting' });
  assert.equal(staleAck.decisionPending, true);
  const ack = applyPendingMatchEvent(offer, { ...event, type: 'match_decision_result', matchRevision: 2, commandId: 'command-a', result: 'waiting' });
  assert.equal(ack.accepted, true);
  assert.equal(ack.phase, 'waiting');
  assert.equal(ack.decisionPending, false);
});

test('stale match events and lower revisions cannot mutate the active offer', () => {
  const offer = createPendingMatchOffer({ ...event, matchRevision: 3 }, 2000);
  assert.equal(applyPendingMatchEvent(offer, { ...event, type: 'match_finalizing', matchRevision: 2 }), offer);
  assert.equal(applyPendingMatchEvent(offer, { ...event, type: 'match_finalizing', matchId: '33333333-3333-4333-8333-333333333333' }), offer);
});

test('peer acceptance and finalizing are explicit phases', () => {
  const offer = createPendingMatchOffer(event, 2000);
  const peerAccepted = applyPendingMatchEvent(offer, { ...event, type: 'match_offer_peer_accepted', matchRevision: 2 });
  assert.equal(peerAccepted.peerAccepted, true);
  const finalizing = applyPendingMatchEvent(peerAccepted, { ...event, type: 'match_finalizing', matchRevision: 3 });
  assert.equal(finalizing.phase, 'finalizing');
});
