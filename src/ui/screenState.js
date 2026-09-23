export const CLIENT_STATES = Object.freeze([
    'loading', 'ready', 'empty', 'stale', 'partial_error', 'offline',
    'reconnecting', 'permission_required', 'permission_denied', 'forbidden'
]);

const PRIORITY = Object.freeze([
    'forbidden', 'permission_denied', 'permission_required', 'offline',
    'reconnecting', 'loading', 'partial_error', 'stale', 'empty', 'ready'
]);

export const normalizeClientState = (value, fallback = 'ready') => (
    CLIENT_STATES.includes(value) ? value : fallback
);

export const selectHighestPriorityState = (states = []) => {
    const normalized = new Set(states.map((state) => normalizeClientState(state)));
    return PRIORITY.find((state) => normalized.has(state)) || 'ready';
};
