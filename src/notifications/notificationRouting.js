const text = (value) => String(value ?? '').trim();

export const normalizeNotificationPayload = (payload = {}) => {
    const notification = payload?.notification && typeof payload.notification === 'object'
        ? payload.notification
        : {};
    const data = {
        ...(notification.data && typeof notification.data === 'object' ? notification.data : {}),
        ...(payload.data && typeof payload.data === 'object' ? payload.data : {})
    };
    const type = text(data.type || payload.type);
    return {
        type,
        title: text(payload.title || notification.title || data.title),
        body: text(payload.body || notification.body || data.body),
        deliveryId: text(data.deliveryId || payload.deliveryId),
        data
    };
};

export const notificationDeliveryKey = (notification, phase = 'received') => {
    const deliveryId = text(notification?.deliveryId);
    if (!deliveryId) return null;
    const normalizedPhase = phase === 'action' ? 'action' : 'received';
    return `${deliveryId}:${normalizedPhase}`;
};

export const resolveNotificationRoute = (notification) => {
    const type = text(notification?.type);
    const data = notification?.data || {};
    if (type === 'direct_message') {
        const friendId = text(data.fromUserId || data.from_user_id);
        return friendId ? { kind: 'friend_chat', friendId } : null;
    }
    if (type === 'friend_request_incoming') return { kind: 'friends' };
    if (type === 'admin_notice') return { kind: 'home' };
    return null;
};
