import axios from 'axios';

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

// Auto-add token
api.interceptors.request.use(config => {
    const token = localStorage.getItem('session_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Diagnostic logging
api.interceptors.response.use(
    response => response,
    error => {
        if (import.meta.env.DEV) {
            console.error(`API Error [${error.config?.method?.toUpperCase()}] ${error.config?.url}:`, error.response?.status, error.message);
        }
        return Promise.reject(error);
    }
);

export const auth = {
    register: (username, password) => api.post('/auth/register', { username, password }),
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
    updateMe: (data) => api.put('/api/me/profile', data)
};

export const friends = {
    request: (target_username) => api.post('/friends/request', { target_username }),
    list: () => api.get('/friends/list'),
    accept: (request_user_id) => api.post('/friends/accept', { request_user_id }),
    reject: (target_user_id) => api.post('/friends/reject', { target_user_id }),
    delete: (friendId) => api.delete(`/friends/${friendId}`),
    getHistory: (friendId) => api.get(`/friends/history/${friendId}`)
};

export const push = {
    register: (payload) => api.post('/api/push/register', payload),
    unregister: (payload) => api.post('/api/push/unregister', payload)
};

export const getAvatar = (seed) => {
    return `https://api.dicebear.com/9.x/bottts/svg?seed=${seed || 'anon'}`;
};

export default api;
