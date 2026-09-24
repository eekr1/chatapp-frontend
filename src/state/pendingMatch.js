const toMillis = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const sameIdentity = (offer, event) => Boolean(
  offer
  && event
  && event.matchId === offer.matchId
  && (!event.searchId || event.searchId === offer.searchId)
);

export const createPendingMatchOffer = (event, receivedAt = Date.now()) => {
  const serverNow = toMillis(event?.serverNow);
  const decision = event?.decision || 'pending';
  const matchStatus = event?.matchStatus || event?.phase || (decision === 'accepted' ? 'waiting' : 'offered');
  return {
    matchId: event?.matchId || null,
    searchId: event?.searchId || null,
    matchRevision: Number(event?.matchRevision) || 1,
    phase: matchStatus === 'offer' ? 'offered' : matchStatus,
    peerPublicLabel: String(event?.peerPublicLabel || '').trim().slice(0, 40),
    offeredAt: toMillis(event?.offeredAt),
    autoAcceptAt: toMillis(event?.autoAcceptAt),
    timeoutMs: Number(event?.timeoutMs) || 0,
    serverClockOffsetMs: serverNow == null ? 0 : serverNow - receivedAt,
    accepted: decision === 'accepted',
    peerAccepted: Boolean(event?.peerAccepted),
    decisionPending: false,
    commandId: event?.decisionCommandId || null,
    closeReason: null
  };
};

export const beginPendingMatchDecision = (offer, decision, commandId) => ({
  ...offer,
  decisionPending: true,
  pendingDecision: decision,
  commandId
});

export const applyPendingMatchEvent = (offer, event) => {
  if (!sameIdentity(offer, event)) return offer;
  const revision = Number(event.matchRevision);
  if (Number.isFinite(revision) && revision < offer.matchRevision) return offer;
  const eventServerNow = toMillis(event.serverNow);
  const base = {
    ...offer,
    matchRevision: Number.isFinite(revision) ? revision : offer.matchRevision,
    serverClockOffsetMs: eventServerNow == null ? offer.serverClockOffsetMs : eventServerNow - Date.now()
  };

  if (event.type === 'match_offer_peer_accepted') return { ...base, peerAccepted: true };
  if (event.type === 'match_offer_waiting') return { ...base, accepted: true, decisionPending: false, phase: 'waiting' };
  if (event.type === 'match_finalizing') return { ...base, accepted: true, decisionPending: false, phase: 'finalizing' };
  if (event.type === 'match_offer_closed') return { ...base, decisionPending: false, phase: 'closed', closeReason: event.reason || 'closed' };
  if (event.type !== 'match_decision_result') return base;

  if (base.commandId && event.commandId && event.commandId !== base.commandId && event.decisionSource !== 'auto') return offer;
  if (event.result === 'waiting' || event.result === 'accepted') {
    return { ...base, accepted: true, decisionPending: false, phase: 'waiting' };
  }
  if (event.result === 'finalize') {
    return { ...base, accepted: true, decisionPending: false, phase: 'finalizing' };
  }
  if (event.result === 'closed') {
    return { ...base, decisionPending: false, phase: 'closed', closeReason: 'self_passed' };
  }
  return { ...base, decisionPending: false };
};

export const getOfferTiming = (offer, clientNow = Date.now()) => {
  const offeredAt = toMillis(offer?.offeredAt);
  const autoAcceptAt = toMillis(offer?.autoAcceptAt);
  if (offeredAt == null || autoAcceptAt == null || autoAcceptAt <= offeredAt) {
    return { countdownSeconds: null, progressPercent: 0 };
  }
  const serverNow = clientNow + (Number(offer?.serverClockOffsetMs) || 0);
  const duration = autoAcceptAt - offeredAt;
  const remaining = Math.max(0, autoAcceptAt - serverNow);
  return {
    countdownSeconds: Math.ceil(remaining / 1000),
    progressPercent: Math.max(0, Math.min(100, ((serverNow - offeredAt) / duration) * 100))
  };
};

export const isPendingMatchEventForOffer = sameIdentity;
