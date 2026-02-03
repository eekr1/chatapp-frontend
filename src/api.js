import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || '', // Proxy usually handles /auth etc.
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
        console.error(`API Error [${error.config?.method?.toUpperCase()}] ${error.config?.url}:`, error.response?.status, error.message);
        return Promise.reject(error);
    }
);

export const auth = {
    register: (username, password) => api.post('/auth/register', { username, password }),
    login: (username, password, device_id) => api.post('/auth/login', { username, password, device_id }),
    logout: () => {
        localStorage.removeItem('session_token');
        return api.post('/auth/logout');
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
    reject: (target_user_id) => api.post('/friends/reject', { target_user_id })
};

export const getAvatar = (username) => {
    return `https://api.dicebear.com/9.x/avataaars/svg?seed=${username}`;
};

export default api;
