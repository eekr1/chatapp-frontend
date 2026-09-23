const ACTIVE_KINDS = new Set(['idle', 'queue', 'offer', 'anonymous_room']);
const RECOVERY_RESULTS = new Set(['fresh', 'resumed', 'reset']);
const RECOVERY_REASONS = new Set(['none', 'grace_expired', 'server_restart', 'state_missing', 'invalid_token', 'superseded']);
const PRESENCE_STATES = new Set(['online', 'offline', 'unknown']);

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isIsoDate = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));

export const parseRecoverySnapshot = (payload) => {
    if (!isObject(payload) || payload.type !== 'recovery_snapshot') return { ok: false, reason: 'invalid_snapshot' };
    if (Number(payload.schemaVersion) !== 1) return { ok: false, reason: 'unsupported_version' };
    if (typeof payload.connectionId !== 'string' || typeof payload.serverEpoch !== 'string') return { ok: false, reason: 'invalid_identity' };
    if (!RECOVERY_RESULTS.has(payload.result) || !RECOVERY_REASONS.has(payload.reason)) return { ok: false, reason: 'invalid_result' };
    if (!isObject(payload.active) || !ACTIVE_KINDS.has(payload.active.kind)) return { ok: false, reason: 'invalid_active_state' };
    if (!Number.isFinite(Number(payload.stateRevision)) || Number(payload.stateRevision) < 0) return { ok: false, reason: 'invalid_revision' };
    return {
        ok: true,
        value: {
            connectionId: payload.connectionId,
            serverEpoch: payload.serverEpoch,
            serverNow: isIsoDate(payload.serverNow) ? payload.serverNow : new Date().toISOString(),
            result: payload.result,
            reason: payload.reason,
            stateRevision: Number(payload.stateRevision),
            recoveryGraceMs: Math.max(0, Number(payload.recoveryGraceMs) || 0),
            active: payload.active,
            unread: isObject(payload.unread) ? payload.unread : { friends: [], system: 0, revision: 0 },
            partial: Boolean(payload.partial),
            recoveryToken: typeof payload.recoveryToken === 'string' ? payload.recoveryToken : null
        }
    };
};

export const shouldAcceptServerEvent = (event, connection) => {
    if (!isObject(event) || !connection?.ready) return false;
    if (event.connectionId !== connection.connectionId || event.serverEpoch !== connection.serverEpoch) return false;
    const revision = Number(event.stateRevision);
    return Number.isFinite(revision) && revision >= Number(connection.stateRevision || 0);
};

export const normalizePresence = (input, fallbackObservedAt = null) => {
    const state = PRESENCE_STATES.has(input?.presence_state)
        ? input.presence_state
        : (PRESENCE_STATES.has(input?.presence) ? input.presence : 'unknown');
    const lastSeenAt = isIsoDate(input?.last_seen_at || input?.lastSeenAt)
        ? new Date(input.last_seen_at || input.lastSeenAt).toISOString()
        : null;
    const observedAtValue = input?.presence_observed_at || input?.observedAt || fallbackObservedAt;
    return {
        state,
        lastSeenAt: state === 'offline' ? lastSeenAt : null,
        observedAt: isIsoDate(observedAtValue) ? new Date(observedAtValue).toISOString() : null,
        revision: Math.max(0, Number(input?.stateRevision || input?.revision) || 0)
    };
};

export const applyPresenceUpdate = (friends, event) => friends.map((friend) => {
    if (friend.user_id !== event.userId) return friend;
    const current = normalizePresence(friend);
    const next = normalizePresence(event);
    if (next.revision < current.revision) return friend;
    if (current.observedAt && next.observedAt && Date.parse(next.observedAt) < Date.parse(current.observedAt)) return friend;
    return {
        ...friend,
        presence_state: next.state,
        is_online: next.state === 'online',
        last_seen_at: next.lastSeenAt,
        presence_observed_at: next.observedAt,
        presence_revision: next.revision
    };
});

export const reconcileUnread = (unread) => {
    const counts = {};
    for (const row of Array.isArray(unread?.friends) ? unread.friends : []) {
        const userId = String(row?.userId || '').trim();
        const count = Math.max(0, Number(row?.count) || 0);
        if (userId && count) counts[userId] = count;
    }
    return counts;
};

export const resolvePresenceText = (presenceInput, t, now = Date.now()) => {
    const presence = normalizePresence(presenceInput);
    if (presence.state === 'online') return { key: 'online', text: t('presence.online'), tone: 'online' };
    if (presence.state === 'unknown') return { key: 'unknown', text: t('presence.unknown'), tone: 'unknown' };
    if (!presence.lastSeenAt) return { key: 'offline', text: t('presence.offline'), tone: 'offline' };
    const deltaMs = now - Date.parse(presence.lastSeenAt);
    if (!Number.isFinite(deltaMs) || deltaMs < 0) return { key: 'unknown', text: t('presence.unknown'), tone: 'unknown' };
    const minutes = Math.floor(deltaMs / 60000);
    if (minutes < 1) return { key: 'lastSeenNow', text: t('presence.lastSeenNow'), tone: 'offline' };
    if (minutes < 60) return { key: 'lastSeenMinutes', text: t('presence.lastSeenMinutes', { count: minutes }), tone: 'offline' };
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return { key: 'lastSeenHours', text: t('presence.lastSeenHours', { count: hours }), tone: 'offline' };
    const days = Math.min(365, Math.floor(hours / 24));
    return { key: 'lastSeenDays', text: t('presence.lastSeenDays', { count: days }), tone: 'offline' };
};
