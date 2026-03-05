import axios from 'axios';
import {
    getGlobalLocale,
    resolveLocale,
    toSupportedLocale
} from './i18n';

let lastErrorCode = null;

const isNative = typeof window !== 'undefined' && (
    (typeof window.Capacitor?.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) ||
    Boolean(window.Capacitor?.isNative)
);
const envApiUrl = String(import.meta.env.VITE_API_URL || '').trim();
const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
const isLikelyAndroidEmulator = /sdk_gphone|sdk_phone|emulator|Android SDK built for x86/i.test(ua);
const useEmulatorFallback = Boolean(isNative && import.meta.env.DEV && isLikelyAndroidEmulator);
const baseURL = envApiUrl || (useEmulatorFallback ? 'http://10.0.2.2:3000' : '');

if (import.meta.env.DEV && isNative && !baseURL) {
    console.warn('VITE_API_URL is empty on native app; backend API requests may fail.');
}

const api = axios.create({
    baseURL
});

const resolveRequestLocale = () => {
    const current = toSupportedLocale(getGlobalLocale(), null);
    if (current) return current;
    return toSupportedLocale(resolveLocale(), 'en');
};

const persistLastErrorCode = (code) => {
    lastErrorCode = code || null;
    if (typeof window !== 'undefined') {
        try {
            if (lastErrorCode) {
                window.localStorage.setItem('talkx_last_error_code', lastErrorCode);
            } else {
                window.localStorage.removeItem('talkx_last_error_code');
            }
        } catch {
            // Ignore storage failures.
        }
    }
};

const deriveErrorCode = (error) => {
    const data = error?.response?.data || {};
    if (typeof data.code === 'string' && data.code.trim()) return data.code.trim();
    if (typeof data.errorCode === 'string' && data.errorCode.trim()) return data.errorCode.trim();

    const status = Number(error?.response?.status);
    if (Number.isInteger(status) && status > 0) return `HTTP_${status}`;
    if (error?.code === 'ECONNABORTED') return 'API_TIMEOUT';
    return 'API_NETWORK_ERROR';
};

// Auto-add token
api.interceptors.request.use(config => {
    const token = localStorage.getItem('session_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    config.headers['X-TalkX-Lang'] = resolveRequestLocale();
    return config;
});

// Diagnostic logging
api.interceptors.response.use(
    response => response,
    error => {
        persistLastErrorCode(deriveErrorCode(error));
        if (import.meta.env.DEV) {
            console.error(`API Error [${error.config?.method?.toUpperCase()}] ${error.config?.url}:`, error.response?.status, error.message);
        }
        return Promise.reject(error);
    }
);

export const auth = {
    register: (username, password, legalPayload = {}, locale = null) => api.post('/auth/register', {
        username,
        password,
        ...(locale ? { locale } : {}),
        ...legalPayload
    }),
    login: (username, password, device_id) => api.post('/auth/login', { username, password, device_id }),
    logout: async () => {
        const token = localStorage.getItem('session_token');
        try {
            // Best-effort: try to invalidate server session if token exists.
            if (token) {
                await api.post('/auth/logout', null, {
                    headers: { Authorization: `Bearer ${token}` }
                });
            } else {
                await api.post('/auth/logout');
            }
        } catch {
            // Ignore network/server errors; local logout should still succeed.
        } finally {
            localStorage.removeItem('session_token');
        }
    }
};

export const profile = {
    getMe: () => api.get('/api/me'),
    getLegalStatus: () => api.get('/api/me/legal-status'),
    acceptLegalVersions: (terms_version, privacy_version) => api.post('/api/me/legal-accept', { terms_version, privacy_version }),
    updateMe: (data) => api.put('/api/me/profile', data),
    changePassword: (current_password, new_password) => api.put('/api/me/password', { current_password, new_password }),
    requestDeletion: (current_password, confirm_text) => api.post('/api/me/delete-request', { current_password, confirm_text })
};

export const friends = {
    request: (target_username) => api.post('/friends/request', { target_username }),
    list: () => api.get('/friends/list'),
    listBlocked: () => api.get('/friends/blocked'),
    accept: (request_user_id) => api.post('/friends/accept', { request_user_id }),
    reject: (target_user_id) => api.post('/friends/reject', { target_user_id }),
    block: (target_user_id) => api.post('/friends/block', { target_user_id }),
    unblock: (target_user_id) => api.post('/friends/unblock', { target_user_id }),
    delete: (friendId) => api.delete(`/friends/${friendId}`),
    getHistory: (friendId) => api.get(`/friends/history/${friendId}`)
};

export const push = {
    register: (payload) => api.post('/api/push/register', payload),
    unregister: (payload) => api.post('/api/push/unregister', payload)
};

export const support = {
    report: (payload) => {
        const isFormDataPayload = typeof FormData !== 'undefined' && payload instanceof FormData;
        if (isFormDataPayload) {
            // Let the browser set multipart boundary automatically.
            return api.post('/support/report', payload);
        }
        return api.post('/support/report', payload);
    }
};

export const legal = {
    getPublic: () => api.get('/api/legal')
};

export const setLastErrorCode = (code) => {
    persistLastErrorCode(typeof code === 'string' ? code.trim().slice(0, 120) : null);
};

export const getLastErrorCode = () => {
    if (lastErrorCode) return lastErrorCode;
    if (typeof window === 'undefined') return null;
    try {
        return window.localStorage.getItem('talkx_last_error_code') || null;
    } catch {
        return null;
    }
};

export const getAvatar = (seed) => {
    return `https://api.dicebear.com/9.x/bottts/svg?seed=${seed || 'anon'}`;
};

export const getLocalizedApiError = (t, error, fallbackKey = 'errors.SERVER_ERROR') => {
    const code = String(error?.response?.data?.code || '').trim();
    if (code) {
        const translated = t(`errors.${code}`, {}, null);
        if (translated && translated !== `errors.${code}`) return translated;
    }
    const message = String(error?.response?.data?.error || '').trim();
    if (message) return message;
    return t(fallbackKey, {}, 'Server error.');
};

export default api;
