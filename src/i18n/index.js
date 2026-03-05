import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import messagesTr from './messages.tr';
import messagesEn from './messages.en';

export const LOCALE_STORAGE_KEY = 'talkx_locale_v1';
const SUPPORTED = new Set(['tr', 'en']);
const DEFAULT_LOCALE = 'en';
const QUERY_OVERRIDE_PARAM = 'lang';

let currentLocale = DEFAULT_LOCALE;

const dictionaries = {
    tr: messagesTr,
    en: messagesEn
};

const normalizeLocale = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return null;
    if (SUPPORTED.has(raw)) return raw;
    if (raw.startsWith('tr')) return 'tr';
    if (raw.startsWith('en')) return 'en';
    return null;
};

const readQueryLocale = () => {
    if (typeof window === 'undefined') return null;
    try {
        const params = new URLSearchParams(window.location.search || '');
        return normalizeLocale(params.get(QUERY_OVERRIDE_PARAM));
    } catch {
        return null;
    }
};

const readStoredLocale = () => {
    if (typeof window === 'undefined') return null;
    try {
        return normalizeLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY));
    } catch {
        return null;
    }
};

const readNavigatorLocale = () => {
    if (typeof navigator === 'undefined') return null;
    return normalizeLocale(navigator.language || navigator.userLanguage || '');
};

export const resolveLocale = ({ userLocale = null, includeQuery = true } = {}) => {
    const queryLocale = includeQuery ? readQueryLocale() : null;
    if (queryLocale) return queryLocale;

    const normalizedUser = normalizeLocale(userLocale);
    if (normalizedUser) return normalizedUser;

    const storedLocale = readStoredLocale();
    if (storedLocale) return storedLocale;

    const navLocale = readNavigatorLocale();
    if (navLocale) return navLocale;

    return DEFAULT_LOCALE;
};

export const getQueryLocaleOverride = () => readQueryLocale();

const getNestedValue = (obj, path) => path.split('.').reduce((acc, key) => {
    if (!acc || typeof acc !== 'object') return undefined;
    return acc[key];
}, obj);

const applyParams = (template, params = {}) => {
    if (typeof template !== 'string') return template;
    return template.replace(/\{([^}]+)\}/g, (_, key) => {
        if (params[key] === undefined || params[key] === null) return '';
        return String(params[key]);
    });
};

export const translate = (locale, key, params = {}, fallback = null) => {
    const normalized = normalizeLocale(locale) || DEFAULT_LOCALE;
    const dict = dictionaries[normalized] || dictionaries.en;
    const fallbackDict = dictionaries.en;
    const ownValue = getNestedValue(dict, key);
    const fallbackValue = getNestedValue(fallbackDict, key);
    const resolved = ownValue ?? fallbackValue ?? fallback ?? key;
    return applyParams(resolved, params);
};

export const getGlobalLocale = () => currentLocale;

export const setGlobalLocale = (locale, { persist = true } = {}) => {
    const normalized = normalizeLocale(locale) || DEFAULT_LOCALE;
    currentLocale = normalized;
    if (persist && typeof window !== 'undefined') {
        try {
            window.localStorage.setItem(LOCALE_STORAGE_KEY, normalized);
        } catch {
            // Ignore storage failures.
        }
    }
    return normalized;
};

export const toSupportedLocale = (value, fallback = DEFAULT_LOCALE) => normalizeLocale(value) || fallback;

const I18nContext = createContext({
    locale: DEFAULT_LOCALE,
    t: (key, params, fallback) => translate(DEFAULT_LOCALE, key, params, fallback),
    setLocale: () => DEFAULT_LOCALE
});

export const I18nProvider = ({ children }) => {
    const [localeState, setLocaleState] = useState(() => {
        const queryOverride = readQueryLocale();
        const resolved = resolveLocale();
        setGlobalLocale(resolved, { persist: !queryOverride });
        return resolved;
    });

    const setLocale = useCallback((nextLocale, options = {}) => {
        const normalized = setGlobalLocale(nextLocale, options);
        setLocaleState(normalized);
        return normalized;
    }, []);

    const t = useCallback((key, params = {}, fallback = null) => (
        translate(localeState, key, params, fallback)
    ), [localeState]);

    const value = useMemo(() => ({
        locale: localeState,
        t,
        setLocale
    }), [localeState, t, setLocale]);

    return React.createElement(I18nContext.Provider, { value }, children);
};

export const useI18n = () => useContext(I18nContext);
