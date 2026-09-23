export const AUTH_NOTICE_STORAGE_KEY = 'talkx_auth_notice_v1';

const NOTICE_KEYS = Object.freeze({
    passwordChanged: 'auth.passwordChangedNotice',
    sessionEnded: 'auth.sessionEndedNotice'
});

export const resolveAuthNoticeKey = (notice) => NOTICE_KEYS[notice] || null;

export const storeAuthNotice = (storage, notice) => {
    if (!storage || !resolveAuthNoticeKey(notice)) return false;
    storage.setItem(AUTH_NOTICE_STORAGE_KEY, notice);
    return true;
};

export const consumeAuthNotice = (storage) => {
    if (!storage) return null;
    const notice = storage.getItem(AUTH_NOTICE_STORAGE_KEY);
    storage.removeItem(AUTH_NOTICE_STORAGE_KEY);
    return resolveAuthNoticeKey(notice) ? notice : null;
};
