export const SEARCH_PROTOCOL_VERSION = 1;

export const DEFAULT_SEARCH_TIMING = Object.freeze({
  policyId: 'match-search-timing-v1',
  continuingAfterMs: 8000,
  quietAfterMs: 20000,
  extendedAfterMs: 45000
});

export const INITIAL_SEARCH_STATE = Object.freeze({
  protocolVersion: SEARCH_PROTOCOL_VERSION,
  searchId: null,
  commandId: null,
  queueAttempt: 0,
  searchRevision: 0,
  phase: 'idle',
  queuedAt: null,
  serverClockOffsetMs: 0,
  timingPolicy: DEFAULT_SEARCH_TIMING,
  cancelPending: false,
  moodId: 'random',
  promptId: null,
  recentPromptIds: []
});

const asTime = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeTiming = (value) => ({
  policyId: String(value?.policyId || DEFAULT_SEARCH_TIMING.policyId),
  continuingAfterMs: Number(value?.continuingAfterMs) || DEFAULT_SEARCH_TIMING.continuingAfterMs,
  quietAfterMs: Number(value?.quietAfterMs) || DEFAULT_SEARCH_TIMING.quietAfterMs,
  extendedAfterMs: Number(value?.extendedAfterMs) || DEFAULT_SEARCH_TIMING.extendedAfterMs
});

export const createSearchIntent = ({ searchId, commandId, moodId = 'random', promptId = null, recentPromptIds = [] }) => ({
  ...INITIAL_SEARCH_STATE,
  searchId,
  commandId,
  phase: 'preparing',
  moodId,
  promptId,
  recentPromptIds
});

export const shouldAcceptSearchEvent = (state, event) => {
  if (event?.type === 'recovery_search') return Boolean(event.searchId);
  if (!event?.searchId) return false;
  if (state.searchId && state.searchId !== event.searchId) return false;
  const attempt = Number(event.queueAttempt) || 0;
  const revision = Number(event.searchRevision) || 0;
  if (attempt && attempt < (Number(state.queueAttempt) || 0)) return false;
  if (attempt === Number(state.queueAttempt) && revision && revision < (Number(state.searchRevision) || 0)) return false;
  return true;
};

export const applySearchEvent = (state, event, clientNow = Date.now()) => {
  if (event?.type === 'search_reset') return { ...INITIAL_SEARCH_STATE };
  if (event?.type === 'search_cancel_pending') return { ...state, cancelPending: true };
  if (!shouldAcceptSearchEvent(state, event)) return state;

  const serverNow = asTime(event.serverNow);
  const common = {
    ...state,
    protocolVersion: Number(event.protocolVersion) || SEARCH_PROTOCOL_VERSION,
    searchId: event.searchId,
    queueAttempt: Number(event.queueAttempt) || state.queueAttempt || 1,
    searchRevision: Number(event.searchRevision) || state.searchRevision || 0,
    serverClockOffsetMs: serverNow == null ? state.serverClockOffsetMs : serverNow - clientNow,
    timingPolicy: normalizeTiming(event.timingPolicy || (event.tierThresholdsMs ? {
      policyId: event.timingPolicyVersion,
      continuingAfterMs: event.tierThresholdsMs.continuing,
      quietAfterMs: event.tierThresholdsMs.quiet,
      extendedAfterMs: event.tierThresholdsMs.extended
    } : state.timingPolicy))
  };

  if (event.type === 'queued' || (event.type === 'recovery_search' && event.phase !== 'offer')) {
    return {
      ...common,
      phase: event.phase === 'extended' ? 'extended' : 'queued',
      queuedAt: asTime(event.queuedAt),
      cancelPending: false
    };
  }
  if (event.type === 'search_phase') {
    return { ...common, phase: String(event.phase || common.phase) };
  }
  if (event.type === 'match_offer' || (event.type === 'recovery_search' && event.phase === 'offer')) {
    return { ...common, phase: 'offer', cancelPending: false };
  }
  if (event.type === 'queue_left') {
    return { ...common, phase: 'cancelled', cancelPending: false };
  }
  return state;
};

export const getCorrectedNow = (state, clientNow = Date.now()) => clientNow + (Number(state.serverClockOffsetMs) || 0);

export const getSearchElapsedMs = (state, clientNow = Date.now()) => {
  if (!['queued', 'extended'].includes(state.phase)) return null;
  const queuedAt = asTime(state.queuedAt);
  if (queuedAt == null) return null;
  return Math.max(0, getCorrectedNow(state, clientNow) - queuedAt);
};

export const getSearchDisplayTier = (state, clientNow = Date.now()) => {
  if (state.phase === 'preparing') return 'preparing';
  if (state.phase === 'reconnecting') return 'reconnecting';
  if (state.phase === 'offer') return 'offer';
  if (state.phase === 'extended') return 'extended';
  const elapsed = getSearchElapsedMs(state, clientNow);
  if (elapsed == null) return state.phase;
  if (elapsed >= state.timingPolicy.extendedAfterMs) return 'extended';
  if (elapsed >= state.timingPolicy.quietAfterMs) return 'quiet';
  if (elapsed >= state.timingPolicy.continuingAfterMs) return 'continuing';
  return 'searching';
};
