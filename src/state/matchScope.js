export const MATCH_SCOPES = Object.freeze({ GLOBAL: 'GLOBAL', COUNTRY: 'COUNTRY' });
export const INITIAL_MATCH_SCOPE_STATE = Object.freeze({
  capability: false,
  preferredMatchScope: MATCH_SCOPES.GLOBAL,
  effectiveMatchScope: null,
  country: null,
  countryAvailable: false,
  unavailableReason: null,
  scopeChangeStatus: 'idle',
  fallbackStatus: 'hidden',
  fallbackEligibleAt: null
});

const storageKey = (userId) => userId ? `talkx_match_scope_v1:${userId}` : null;

export const loadPreferredMatchScope = (userId, storage = globalThis?.localStorage) => {
  const key = storageKey(userId);
  if (!key || !storage) return MATCH_SCOPES.GLOBAL;
  try {
    return storage.getItem(key) === MATCH_SCOPES.COUNTRY ? MATCH_SCOPES.COUNTRY : MATCH_SCOPES.GLOBAL;
  } catch {
    return MATCH_SCOPES.GLOBAL;
  }
};

export const persistPreferredMatchScope = (userId, scope, storage = globalThis?.localStorage) => {
  const key = storageKey(userId);
  if (!key || !storage) return;
  try {
    storage.setItem(key, scope === MATCH_SCOPES.COUNTRY ? MATCH_SCOPES.COUNTRY : MATCH_SCOPES.GLOBAL);
  } catch {
    // Preference is a convenience cache, never matchmaking authority.
  }
};

export const hydrateMatchScope = (userId, capability, storage) => {
  if (!capability || capability.version !== 'match-scope-v1') return { ...INITIAL_MATCH_SCOPE_STATE };
  const countryAvailable = Boolean(capability.countryAvailable && capability.country?.code);
  const saved = loadPreferredMatchScope(userId, storage);
  return {
    ...INITIAL_MATCH_SCOPE_STATE,
    capability: true,
    preferredMatchScope: saved === MATCH_SCOPES.COUNTRY && countryAvailable ? saved : MATCH_SCOPES.GLOBAL,
    country: countryAvailable ? capability.country : null,
    countryAvailable,
    unavailableReason: countryAvailable ? null : capability.unavailableReason || 'MATCH_COUNTRY_UNAVAILABLE'
  };
};

export const applyMatchScopeEvent = (state, event) => {
  if (!event) return state;
  if (event.type === 'scope_preference') {
    return { ...state, preferredMatchScope: event.scope };
  }
  if (event.type === 'scope_switching') {
    return { ...state, scopeChangeStatus: 'switching', fallbackStatus: 'hidden' };
  }
  if (event.type === 'match_scope_change_failed' || event.type === 'search_error') {
    const countryUnavailable = event.errorCode === 'MATCH_COUNTRY_UNAVAILABLE' || event.errorCode === 'MATCH_COUNTRY_STALE';
    return {
      ...state,
      preferredMatchScope: countryUnavailable ? MATCH_SCOPES.GLOBAL : state.preferredMatchScope,
      countryAvailable: countryUnavailable ? false : state.countryAvailable,
      unavailableReason: countryUnavailable ? event.errorCode : state.unavailableReason,
      scopeChangeStatus: 'failed'
    };
  }
  if (event.type === 'queued' || event.type === 'recovery_search' || event.type === 'match_offer') {
    const effective = event.effectiveMatchScope || state.effectiveMatchScope;
    return {
      ...state,
      preferredMatchScope: effective || state.preferredMatchScope,
      effectiveMatchScope: effective,
      country: event.country || state.country,
      scopeChangeStatus: 'idle',
      fallbackEligibleAt: event.fallbackEligibleAt || null,
      fallbackStatus: event.fallbackStatus || 'hidden'
    };
  }
  if (event.type === 'country_fallback_available') {
    return { ...state, fallbackStatus: 'visible', fallbackEligibleAt: event.fallbackEligibleAt || state.fallbackEligibleAt };
  }
  if (event.type === 'country_fallback_ack') {
    return { ...state, fallbackStatus: 'declined' };
  }
  if (event.type === 'scope_reset') {
    return { ...state, effectiveMatchScope: null, scopeChangeStatus: 'idle', fallbackStatus: 'hidden', fallbackEligibleAt: null };
  }
  return state;
};

export const isScopeConsistentEvent = (state, event) => {
  if (!event?.effectiveMatchScope || !state?.effectiveMatchScope) return true;
  if (event.effectiveMatchScope !== state.effectiveMatchScope) return false;
  if (event.effectiveMatchScope !== MATCH_SCOPES.COUNTRY) return true;
  return Boolean(event.country?.code && state.country?.code && event.country.code === state.country.code);
};
