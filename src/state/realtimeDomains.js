const MATCH_EVENTS = new Set([
    'queued', 'match_offer', 'match_offer_peer_accepted', 'match_offer_waiting',
    'match_offer_closed', 'matched', 'message', 'ended'
]);
const FRIEND_EVENTS = new Set([
    'direct_message', 'direct_message_ack', 'typing', 'stop_typing',
    'friend_request_incoming', 'friend_refresh'
]);
const SYSTEM_EVENTS = new Set(['admin_notice']);

export const REALTIME_DOMAINS = Object.freeze({
    CONNECTION: 'connection',
    FRIEND: 'friend',
    MATCH: 'match',
    MEDIA: 'media',
    SYSTEM: 'system'
});

export const resolveRealtimeDomain = (type) => {
    if (MATCH_EVENTS.has(type)) return REALTIME_DOMAINS.MATCH;
    if (FRIEND_EVENTS.has(type)) return REALTIME_DOMAINS.FRIEND;
    if (SYSTEM_EVENTS.has(type)) return REALTIME_DOMAINS.SYSTEM;
    if (type === 'image_sent' || type === 'image_data' || type === 'image_error') return REALTIME_DOMAINS.MEDIA;
    return REALTIME_DOMAINS.CONNECTION;
};

export const shouldIgnoreRealtimeEvent = (type, { chatMode, screen } = {}) => {
    const domain = resolveRealtimeDomain(type);
    const isFriendChat = chatMode === 'friends' && screen === 'chat';
    return domain === REALTIME_DOMAINS.MATCH && isFriendChat;
};
