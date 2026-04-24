import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import './index.css';
import {
  auth,
  profile,
  friends,
  push as pushApi,
  support as supportApi,
  legal as legalApi,
  getLocalizedApiError,
  getLastErrorCode,
  setLastErrorCode
} from './api';
import { resolveLocale, toSupportedLocale, useI18n } from './i18n';
import Auth from './components/Auth';

import SplashScreen from './screens/SplashScreen';
import HomeScreen from './screens/HomeScreen';
import MatchScreen from './screens/MatchScreen';
import ChatScreen from './screens/ChatScreen';
import FriendsScreen from './screens/FriendsScreen';
import LegalScreen from './screens/LegalScreen';
import {
  isNativePlatform,
  setupViewportInsets,
  configureNativeSystemUi,
  addNativeBackButtonListener,
  exitNativeApp,
  initNativePush,
  initNativeLocalNotifications,
  requestInitialPermissions,
  showLocalNotification,
  CHANNEL_IDS
} from './utils/nativeBridge';

const getDeviceId = () => {
  let id = localStorage.getItem('anon_device_id');
  if (!id) {
    id = `dev-${Math.random().toString(36).slice(2, 11)}-${Date.now().toString(36)}`;
    localStorage.setItem('anon_device_id', id);
  }
  return id;
};

const DEVICE_ID = getDeviceId();
const IS_DEV = import.meta.env.DEV;
const IS_NATIVE = isNativePlatform();
const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unknown';
const TOAST_DEFAULT_MS = 10000;
const TOAST_EXIT_MS = 280;
const DELIVERY_DEDUPE_TTL_MS = 5 * 60 * 1000;
const DELIVERY_DEDUPE_MAX = 500;
const WS_RETRY_STEPS_MS = [1000, 2000, 5000, 10000, 20000, 30000];
const WS_RETRY_MAX_MS = 30000;
const OUTBOX_STORAGE_KEY = 'talkx_pending_outbox_v1';
const OUTBOX_MAX_ITEMS = 100;
const OUTBOX_TTL_MS = 24 * 60 * 60 * 1000;
const OUTBOX_ACK_TIMEOUT_MS = 15000;
const OUTBOX_MAX_ATTEMPTS = 5;
const PUSH_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const PUSH_LAST_REGISTER_AT_KEY = 'talkx_push_last_register_at';
const PUSH_LAST_REGISTER_ERROR_KEY = 'talkx_push_last_register_error';
const PERMISSIONS_ONBOARDED_KEY = 'talkx_permissions_onboarded_v1';
const BACK_EXIT_WINDOW_MS = 1900;
const FRIEND_REQUEST_PROMPT_MS = 11000;
const FRIEND_REQUEST_DEDUPE_TTL_MS = 15000;
const waitMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const nowTs = () => Date.now();

const randomId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `cm-${Math.random().toString(36).slice(2, 12)}-${Date.now().toString(36)}`;
};

const clampOutbox = (items = []) => {
  const now = nowTs();
  const cleaned = (items || [])
    .filter(Boolean)
    .filter((item) => (Number(item.expiresAt) || 0) > now)
    .slice(-OUTBOX_MAX_ITEMS);
  return cleaned;
};

const safeParseOutbox = () => {
  try {
    const raw = localStorage.getItem(OUTBOX_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return clampOutbox(parsed);
  } catch {
    return [];
  }
};

const persistOutbox = (items = []) => {
  try {
    localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(clampOutbox(items)));
  } catch (e) {
    console.warn('Outbox persistence failed:', e?.message || e);
  }
};

const withJitter = (baseMs) => {
  const jitter = 1 + ((Math.random() * 0.4) - 0.2);
  return Math.max(250, Math.round(baseMs * jitter));
};

const isAppForeground = () => {
  if (typeof document === 'undefined') return true;
  if (document.visibilityState && document.visibilityState !== 'visible') return false;
  if (typeof document.hasFocus === 'function' && !document.hasFocus()) return false;
  return true;
};


const resolveFriendRequestSenderLabel = (payload = {}) => {
  const display = String(payload.from_display_name || payload.fromDisplayName || '').trim();
  if (display) return display;
  const username = String(payload.from_username || payload.fromUsername || '').trim();
  if (username) return username;
  return 'TalkX';
};

const resolveWsUrl = ({ isNative, isDev }) => {
  const explicitWs = String(import.meta.env.VITE_WS_URL || '').trim();
  if (explicitWs) return explicitWs;

  const apiUrl = String(import.meta.env.VITE_API_URL || '').trim();
  if (apiUrl) {
    try {
      const u = new URL(apiUrl);
      const wsProto = u.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${wsProto}//${u.host}`;
    } catch (e) {
      if (isDev) console.warn('Invalid VITE_API_URL for WS derivation:', apiUrl, e?.message || e);
    }
  }

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const isLikelyEmulator = /sdk_gphone|sdk_phone|emulator|Android SDK built for x86/i.test(ua);
  if (isNative && isDev && isLikelyEmulator) return 'ws://10.0.2.2:3000';
  if (isNative && !isDev) return '';

  const host = window.location.host;
  if (host.includes('localhost')) return 'ws://localhost:3000';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${host}`;
};

const resolvePlatform = (isNative) => {
  const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent || '').toLowerCase() : '';
  if (isNative) {
    if (ua.includes('android')) return 'android';
    if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) return 'ios';
    return 'native';
  }
  return 'web';
};

const resolveDeviceModel = () => {
  const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '';
  if (!ua) return 'unknown';

  if (/Android/i.test(ua)) {
    const match = ua.match(/Android\s[\d.]+;\s([^;)\]]+)/i);
    if (match && match[1]) {
      return match[1].replace(/\sBuild\/.*$/i, '').trim().slice(0, 120) || 'Android Device';
    }
    return 'Android Device';
  }
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/iPod/i.test(ua)) return 'iPod';
  if (/Windows/i.test(ua)) return 'Windows Device';
  if (/Macintosh/i.test(ua)) return 'Mac Device';
  if (/Linux/i.test(ua)) return 'Linux Device';
  return 'unknown';
};

const resolveNetworkType = () => {
  if (typeof navigator === 'undefined') return 'unknown';
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const raw = String(connection?.type || connection?.effectiveType || '').toLowerCase();
  if (!raw) return 'unknown';
  if (raw.includes('wifi') || raw.includes('ethernet')) return 'wifi';
  if (raw.includes('cell') || ['2g', '3g', '4g', '5g', 'slow-2g'].includes(raw)) return 'cellular';
  return 'unknown';
};

const SUPPORT_SUBJECTS = new Set(['connection', 'message', 'photo', 'other']);
const SUPPORT_SUBJECT_ALIAS = new Map([
  ['baglanti', 'connection'],
  ['baÄŸlantÄ±', 'connection'],
  ['mesaj', 'message'],
  ['foto', 'photo'],
  ['diger', 'other'],
  ['diÄŸer', 'other']
]);

const normalizeSupportSubject = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (SUPPORT_SUBJECTS.has(normalized)) return normalized;
  if (SUPPORT_SUBJECT_ALIAS.has(normalized)) return SUPPORT_SUBJECT_ALIAS.get(normalized);

  const ascii = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (SUPPORT_SUBJECTS.has(ascii)) return ascii;
  if (SUPPORT_SUBJECT_ALIAS.has(ascii)) return SUPPORT_SUBJECT_ALIAS.get(ascii);
  return null;
};

const LEGAL_ROUTE_KIND = Object.freeze({
  '/privacy-policy': 'privacy',
  '/terms-of-use': 'terms',
  '/child-safety': 'childSafety'
});

const DEFAULT_LEGAL_CONTENT = Object.freeze({
  footer: Object.freeze({
    urls: Object.freeze({
      privacy: '/privacy-policy',
      terms: '/terms-of-use'
    }),
    tr: Object.freeze({
      tagline: 'Kimligini gizle, ozgurce konus.',
      privacyLabel: 'Gizlilik Politikasi',
      termsLabel: 'Kullanim Sartlari'
    }),
    en: Object.freeze({
      tagline: 'Hide your identity, speak freely.',
      privacyLabel: 'Privacy Policy',
      termsLabel: 'Terms of Use'
    })
  }),
  versions: Object.freeze({
    terms: 'v1',
    privacy: 'v1'
  }),
  documents: Object.freeze({
    privacy: Object.freeze({
      tr: Object.freeze({
        title: 'Gizlilik Politikasi',
        content: 'Bu metin admin panelinden guncellenebilir.'
      }),
      en: Object.freeze({
        title: 'Privacy Policy',
        content: 'This text can be updated from the admin panel.'
      })
    }),
    terms: Object.freeze({
      tr: Object.freeze({
        title: 'Kullanim Sartlari',
        content: 'Bu metin admin panelinden guncellenebilir.'
      }),
      en: Object.freeze({
        title: 'Terms of Use',
        content: 'This text can be updated from the admin panel.'
      })
    }),
    childSafety: Object.freeze({
      tr: Object.freeze({
        title: 'Cocuk Guvenligi Standartlari',
        content: 'Bu metin admin panelinden guncellenebilir.'
      }),
      en: Object.freeze({
        title: 'Child Safety Standards',
        content: 'This text can be updated from the admin panel.'
      })
    })
  })
});

const cloneLegalContent = () => JSON.parse(JSON.stringify(DEFAULT_LEGAL_CONTENT));

const normalizeLegalFooterLocale = (value, fallback) => {
  const source = value && typeof value === 'object' ? value : {};
  return {
    tagline: typeof source.tagline === 'string' && source.tagline.trim()
      ? source.tagline.trim()
      : fallback.tagline,
    privacyLabel: typeof source.privacyLabel === 'string' && source.privacyLabel.trim()
      ? source.privacyLabel.trim()
      : fallback.privacyLabel,
    termsLabel: typeof source.termsLabel === 'string' && source.termsLabel.trim()
      ? source.termsLabel.trim()
      : fallback.termsLabel
  };
};

const normalizePathname = (value = '/') => {
  const raw = String(value || '/').trim() || '/';
  if (raw === '/') return '/';
  return raw.replace(/\/+$/, '');
};

const resolveLegalKindFromPath = () => {
  if (typeof window === 'undefined') return null;
  const normalizedPath = normalizePathname(window.location.pathname || '/');
  return LEGAL_ROUTE_KIND[normalizedPath] || null;
};

const normalizeLegalLangDoc = (value, fallback) => {
  const source = value && typeof value === 'object' ? value : {};
  return {
    title: typeof source.title === 'string' && source.title.trim() ? source.title.trim() : fallback.title,
    content: typeof source.content === 'string' && source.content.trim()
      ? source.content.replace(/\r\n/g, '\n').trim()
      : fallback.content
  };
};

const normalizeLegalContent = (value) => {
  const defaults = cloneLegalContent();
  const source = value && typeof value === 'object' ? value : {};
  const footerSource = source.footer && typeof source.footer === 'object' ? source.footer : {};
  const versionsSource = source.versions && typeof source.versions === 'object' ? source.versions : {};
  const docsSource = source.documents && typeof source.documents === 'object' ? source.documents : {};

  const legacyTr = {
    tagline: typeof footerSource.tagline === 'string' ? footerSource.tagline : defaults.footer.tr.tagline,
    privacyLabel: typeof footerSource.privacyLabel === 'string' ? footerSource.privacyLabel : defaults.footer.tr.privacyLabel,
    termsLabel: typeof footerSource.termsLabel === 'string' ? footerSource.termsLabel : defaults.footer.tr.termsLabel
  };

  const normalized = {
    footer: {
      urls: {
        privacy: typeof footerSource?.urls?.privacy === 'string' && footerSource.urls.privacy.trim()
          ? footerSource.urls.privacy.trim()
          : (typeof footerSource.privacyUrl === 'string' && footerSource.privacyUrl.trim()
            ? footerSource.privacyUrl.trim()
            : defaults.footer.urls.privacy),
        terms: typeof footerSource?.urls?.terms === 'string' && footerSource.urls.terms.trim()
          ? footerSource.urls.terms.trim()
          : (typeof footerSource.termsUrl === 'string' && footerSource.termsUrl.trim()
            ? footerSource.termsUrl.trim()
            : defaults.footer.urls.terms)
      },
      tr: normalizeLegalFooterLocale(
        footerSource.tr && typeof footerSource.tr === 'object' ? footerSource.tr : legacyTr,
        defaults.footer.tr
      ),
      en: normalizeLegalFooterLocale(
        footerSource.en && typeof footerSource.en === 'object' ? footerSource.en : null,
        defaults.footer.en
      )
    },
    versions: {
      terms: typeof versionsSource.terms === 'string' && versionsSource.terms.trim()
        ? versionsSource.terms.trim()
        : defaults.versions.terms,
      privacy: typeof versionsSource.privacy === 'string' && versionsSource.privacy.trim()
        ? versionsSource.privacy.trim()
        : defaults.versions.privacy
    },
    documents: {
      privacy: {
        tr: normalizeLegalLangDoc(docsSource?.privacy?.tr, defaults.documents.privacy.tr),
        en: normalizeLegalLangDoc(docsSource?.privacy?.en, defaults.documents.privacy.en)
      },
      terms: {
        tr: normalizeLegalLangDoc(docsSource?.terms?.tr, defaults.documents.terms.tr),
        en: normalizeLegalLangDoc(docsSource?.terms?.en, defaults.documents.terms.en)
      },
      childSafety: {
        tr: normalizeLegalLangDoc(docsSource?.childSafety?.tr, defaults.documents.childSafety.tr),
        en: normalizeLegalLangDoc(docsSource?.childSafety?.en, defaults.documents.childSafety.en)
      }
    }
  };

  return normalized;
};

const getLegalFooterForLocale = (legalContent, localeValue) => {
  const safeLocale = toSupportedLocale(localeValue, 'en');
  const footer = legalContent?.footer || {};
  const urls = footer.urls || {};
  const localized = footer[safeLocale] || footer.en || footer.tr || {};

  return {
    tagline: localized.tagline || '',
    privacyLabel: localized.privacyLabel || 'Privacy Policy',
    privacyUrl: urls.privacy || '/privacy-policy',
    termsLabel: localized.termsLabel || 'Terms of Use',
    termsUrl: urls.terms || '/terms-of-use'
  };
};

function App() {
  const { t, locale, setLocale } = useI18n();
  const appName = t('common.appName', {}, 'TalkX');
  const activeLocale = toSupportedLocale(locale, 'en');
  const legalKind = resolveLegalKindFromPath();
  const [screen, setScreen] = useState('splash');

  const [user, setUser] = useState(null);
  const [onlineCount, setOnlineCount] = useState(0);
  const [status, setStatus] = useState('disconnected');
  const [wsStatus, setWsStatus] = useState('disconnected');

  const [friendList, setFriendList] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [activeFriend, setActiveFriend] = useState(null);
  const [unreadCounts, setUnreadCounts] = useState({});

  const [messages, setMessages] = useState([]);
  const [peerName, setPeerName] = useState(null);
  const [peerUsername, setPeerUsername] = useState(null);
  const [peerId, setPeerId] = useState(null);
  const [pendingMatchOffer, setPendingMatchOffer] = useState(null);
  const [isPeerTyping, setIsPeerTyping] = useState(false);
  const [roomId, setRoomId] = useState(null);
  const [chatMode, setChatMode] = useState('anon');

  const [notices, setNotices] = useState([]);
  const [friendRequestPrompts, setFriendRequestPrompts] = useState([]);
  const [supportSubmitting, setSupportSubmitting] = useState(false);
  const [legalContent, setLegalContent] = useState(() => cloneLegalContent());
  const [legalLoaded, setLegalLoaded] = useState(false);
  const [legalReaccept, setLegalReaccept] = useState({
    open: false,
    loading: false,
    error: '',
    required: null,
    accepted: null
  });
  const [showPermissionOnboarding, setShowPermissionOnboarding] = useState(false);
  const [permissionsRequesting, setPermissionsRequesting] = useState(false);
  const [nativePermissionsReady, setNativePermissionsReady] = useState(() => !IS_NATIVE);

  const ws = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const shouldReconnectRef = useRef(false);
  const wsAuthenticatedRef = useRef(false);
  const wsConfigWarnedRef = useRef(false);
  const intentionalCloseRef = useRef(false);
  const typingTimeoutRef = useRef(null);
  const lastTypingSentRef = useRef(0);
  const toastTimersRef = useRef(new Map());
  const friendRequestPromptTimersRef = useRef(new Map());
  const seenFriendRequestRef = useRef(new Map());
  const noticesRef = useRef(notices);
  const pushTokenRef = useRef(null);
  const nativePushTokenRef = useRef(null);
  const pushRetryTimerRef = useRef(null);
  const pushRetryAttemptRef = useRef(0);
  const seenDeliveryRef = useRef(new Map());
  const outboxRef = useRef([]);
  const ackTimersRef = useRef(new Map());
  const inFlightRef = useRef(new Set());
  const outboxReadyRef = useRef(false);
  const flushOutboxFnRef = useRef(() => { });
  const connectWsFnRef = useRef(() => { });
  const backPressAtRef = useRef(0);

  const IMAGE_FETCH_TIMEOUT_MS = 12000;
  const initialImageViewer = {
    open: false,
    status: 'idle',
    mediaId: null,
    dataUrl: null,
    error: null
  };
  const [imageViewer, setImageViewer] = useState(initialImageViewer);
  const imageFetchTimeoutRef = useRef(null);

  const activeFriendRef = useRef(activeFriend);
  const chatModeRef = useRef(chatMode);
  const screenRef = useRef(screen);

  const localizedLegalFooter = useMemo(
    () => getLegalFooterForLocale(legalContent, activeLocale),
    [legalContent, activeLocale]
  );

  useEffect(() => { activeFriendRef.current = activeFriend; }, [activeFriend]);
  useEffect(() => { chatModeRef.current = chatMode; }, [chatMode]);
  useEffect(() => { screenRef.current = screen; }, [screen]);
  useEffect(() => { noticesRef.current = notices; }, [notices]);

  useEffect(() => {
    let canceled = false;

    (async () => {
      try {
        const response = await legalApi.getPublic();
        if (canceled) return;
        setLegalContent(normalizeLegalContent(response?.data));
      } catch (e) {
        if (IS_DEV) console.warn('Legal content load failed:', e?.message || e);
      } finally {
        if (!canceled) setLegalLoaded(true);
      }
    })();

    return () => {
      canceled = true;
    };
  }, []);

  const shouldProcessDelivery = useCallback((deliveryId) => {
    if (!deliveryId) return true;
    const now = Date.now();
    const map = seenDeliveryRef.current;

    map.forEach((ts, id) => {
      if (now - ts > DELIVERY_DEDUPE_TTL_MS) map.delete(id);
    });

    if (map.has(deliveryId)) return false;
    map.set(deliveryId, now);

    if (map.size > DELIVERY_DEDUPE_MAX) {
      const overflow = map.size - DELIVERY_DEDUPE_MAX;
      const oldest = [...map.entries()].sort((a, b) => a[1] - b[1]).slice(0, overflow);
      oldest.forEach(([id]) => map.delete(id));
    }
    return true;
  }, []);

  const clearAckTimer = useCallback((clientMsgId) => {
    const t = ackTimersRef.current.get(clientMsgId);
    if (t) {
      clearTimeout(t);
      ackTimersRef.current.delete(clientMsgId);
    }
  }, []);

  const setMessageSendState = useCallback((clientMsgId, patch = {}) => {
    if (!clientMsgId) return;
    setMessages((prev) => prev.map((m) => (
      m.clientMsgId === clientMsgId
        ? { ...m, ...patch }
        : m
    )));
  }, []);

  const applyOutbox = useCallback((mutator) => {
    const current = outboxRef.current.slice();
    const next = clampOutbox(mutator(current));
    outboxRef.current = next;
    persistOutbox(next);
    return next;
  }, []);

  const dropOutboxItem = useCallback((clientMsgId) => {
    if (!clientMsgId) return;
    applyOutbox((items) => items.filter((i) => i.clientMsgId !== clientMsgId));
    inFlightRef.current.delete(clientMsgId);
    clearAckTimer(clientMsgId);
  }, [applyOutbox, clearAckTimer]);

  useEffect(() => {
    outboxRef.current = safeParseOutbox();
    outboxReadyRef.current = true;
  }, []);

  const clearToastTimers = useCallback((id) => {
    const entry = toastTimersRef.current.get(id);
    if (!entry) return;
    if (typeof entry === 'number') {
      clearTimeout(entry);
      toastTimersRef.current.delete(id);
      return;
    }
    if (entry.hideTimer) clearTimeout(entry.hideTimer);
    if (entry.removeTimer) clearTimeout(entry.removeTimer);
    toastTimersRef.current.delete(id);
  }, []);

  const startToastExit = useCallback((id) => {
    const existing = noticesRef.current.find((item) => item.id === id);
    if (!existing || existing.closing) return;

    setNotices((prev) => prev.map((item) => (item.id === id ? { ...item, closing: true } : item)));

    const entry = toastTimersRef.current.get(id) || {};
    if (entry.hideTimer) {
      clearTimeout(entry.hideTimer);
      entry.hideTimer = null;
    }
    if (entry.removeTimer) clearTimeout(entry.removeTimer);
    entry.removeTimer = window.setTimeout(() => {
      setNotices((prev) => prev.filter((item) => item.id !== id));
      clearToastTimers(id);
    }, TOAST_EXIT_MS);
    toastTimersRef.current.set(id, entry);
  }, [clearToastTimers]);

  const showToast = useCallback((title, body, durationMs = TOAST_DEFAULT_MS) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const safeDuration = Math.max(3000, Math.min(60000, Number(durationMs) || TOAST_DEFAULT_MS));
    setNotices((prev) => [
      ...prev,
      {
        id,
        title: title || appName,
        body: body || '',
        durationMs: safeDuration,
        closing: false
      }
    ]);

    const hideTimer = window.setTimeout(() => {
      startToastExit(id);
    }, safeDuration);

    toastTimersRef.current.set(id, { hideTimer, removeTimer: null });
  }, [appName, startToastExit]);

  const dismissToast = useCallback((id) => {
    startToastExit(id);
  }, [startToastExit]);

  const dismissFriendRequestPrompt = useCallback((requestUserId) => {
    const key = String(requestUserId || '').trim();
    if (!key) return;
    const timer = friendRequestPromptTimersRef.current.get(key);
    if (timer) {
      clearTimeout(timer);
      friendRequestPromptTimersRef.current.delete(key);
    }
    setFriendRequestPrompts((prev) => prev.filter((item) => item.requestUserId !== key));
  }, []);

  useEffect(() => {
    const timers = toastTimersRef.current;
    return () => {
      timers.forEach((entry) => {
        if (typeof entry === 'number') {
          clearTimeout(entry);
          return;
        }
        if (entry?.hideTimer) clearTimeout(entry.hideTimer);
        if (entry?.removeTimer) clearTimeout(entry.removeTimer);
      });
      timers.clear();
    };
  }, []);

  useEffect(() => {
    const promptTimers = friendRequestPromptTimersRef.current;
    return () => {
      promptTimers.forEach((timer) => clearTimeout(timer));
      promptTimers.clear();
      seenFriendRequestRef.current.clear();
    };
  }, []);

  useEffect(() => () => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    if (pushRetryTimerRef.current) clearTimeout(pushRetryTimerRef.current);
    ackTimersRef.current.forEach((t) => clearTimeout(t));
    ackTimersRef.current.clear();
  }, []);

  const loadFriends = useCallback(async () => {
    try {
      const [listRes, blockedRes] = await Promise.all([
        friends.list(),
        friends.listBlocked().catch((error) => {
          console.error('[friends/listBlocked]', {
            status: error?.response?.status || null,
            data: error?.response?.data || null,
            message: error?.message || 'Unknown error'
          });
          return { data: { blocked: [] } };
        })
      ]);
      setFriendList(listRes.data.friends || []);
      setFriendRequests(listRes.data.incoming || []);
      setBlockedUsers(blockedRes.data.blocked || []);

      const initialUnread = {};
      (listRes.data.friends || []).forEach((f) => {
        if (f.unread_count > 0) initialUnread[f.user_id] = f.unread_count;
      });
      setUnreadCounts(initialUnread);
    } catch (e) {
      if (e?.response?.status === 428 && e?.response?.data?.code === 'LEGAL_REACCEPT_REQUIRED') {
        setLegalReaccept((prev) => ({
          ...prev,
          open: true,
          error: '',
          required: e?.response?.data?.required_versions || prev.required,
          accepted: e?.response?.data?.accepted_versions || prev.accepted
        }));
      }
      console.error('Friends load error:', e);
    }
  }, []);

  const enqueueFriendRequestPrompt = useCallback((payload = {}) => {
    const requestUserId = String(payload.request_user_id || payload.requestUserId || '').trim();
    if (!requestUserId) return;

    const now = Date.now();
    const seenMap = seenFriendRequestRef.current;
    seenMap.forEach((ts, key) => {
      if (now - ts > FRIEND_REQUEST_DEDUPE_TTL_MS) seenMap.delete(key);
    });
    if (seenMap.has(requestUserId)) return;
    seenMap.set(requestUserId, now);

    const senderLabel = resolveFriendRequestSenderLabel(payload);
    setFriendRequestPrompts((prev) => {
      if (prev.some((item) => item.requestUserId === requestUserId)) return prev;
      return [...prev, { requestUserId, senderLabel, busy: false }];
    });

    const existingTimer = friendRequestPromptTimersRef.current.get(requestUserId);
    if (existingTimer) clearTimeout(existingTimer);
    const timer = window.setTimeout(() => {
      dismissFriendRequestPrompt(requestUserId);
    }, FRIEND_REQUEST_PROMPT_MS);
    friendRequestPromptTimersRef.current.set(requestUserId, timer);
  }, [dismissFriendRequestPrompt]);

  const handleFriendRequestPromptAction = useCallback(async (requestUserId, action) => {
    const key = String(requestUserId || '').trim();
    if (!key) return;

    setFriendRequestPrompts((prev) => prev.map((item) => (
      item.requestUserId === key ? { ...item, busy: true } : item
    )));

    try {
      if (action === 'accept') {
        await friends.accept(key);
        showToast(appName, t('app.friendRequestAccepted'), 4200);
      } else {
        await friends.reject(key);
        showToast(appName, t('app.friendRequestRejected'), 4200);
      }
    } catch (e) {
      console.error('Friend request prompt action failed:', e);
      showToast(appName, getLocalizedApiError(t, e, 'app.friendRequestActionFailed'), 6500);
    } finally {
      dismissFriendRequestPrompt(key);
      loadFriends();
    }
  }, [appName, dismissFriendRequestPrompt, loadFriends, showToast, t]);

  const refreshLegalStatus = useCallback(async () => {
    try {
      const response = await profile.getLegalStatus();
      const required = response?.data?.required_versions || null;
      const accepted = response?.data?.accepted_versions || null;
      const requires = Boolean(response?.data?.requires_reaccept);
      setLegalReaccept((prev) => ({
        ...prev,
        open: requires,
        required,
        accepted,
        error: ''
      }));
      return requires;
    } catch (error) {
      console.error('Legal status check failed:', error);
      return false;
    }
  }, []);

  const handleAcceptLatestLegal = useCallback(async () => {
    const required = legalReaccept?.required || {};
    const termsVersion = String(required.terms || '').trim();
    const privacyVersion = String(required.privacy || '').trim();
    if (!termsVersion || !privacyVersion) {
      setLegalReaccept((prev) => ({
        ...prev,
        error: 'Gecerli legal versiyon bilgisi okunamadi. Lutfen sayfayi yenileyin.'
      }));
      return;
    }

    setLegalReaccept((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      await profile.acceptLegalVersions(termsVersion, privacyVersion);
      setLegalReaccept((prev) => ({
        ...prev,
        open: false,
        loading: false,
        error: '',
        accepted: {
          terms: termsVersion,
          privacy: privacyVersion,
          accepted_at: new Date().toISOString()
        }
      }));
      loadFriends();
      showToast(appName, t('legal.acceptedToast'), 3500);
    } catch (error) {
      setLegalReaccept((prev) => ({
        ...prev,
        loading: false,
        error: getLocalizedApiError(t, error, 'legal.acceptFailed')
      }));
    }
  }, [appName, legalReaccept?.required, loadFriends, showToast, t]);

  const applyLocaleFromUser = useCallback(async (userPayload, { persistRemoteIfMissing = false } = {}) => {
    const userLocale = toSupportedLocale(userPayload?.locale, null);
    const nextLocale = userLocale || resolveLocale({ includeQuery: false });
    setLocale(nextLocale, { persist: true });

    if (persistRemoteIfMissing && userPayload?.id && !userLocale) {
      try {
        await profile.updateMe({ locale: nextLocale });
      } catch (error) {
        if (IS_DEV) console.warn('Locale profile sync skipped:', error?.message || error);
      }
    }

    return nextLocale;
  }, [setLocale]);

  const handleAuthLogin = useCallback(async (nextUser) => {
    const resolvedLocale = await applyLocaleFromUser(nextUser, { persistRemoteIfMissing: true });
    setUser({
      ...nextUser,
      locale: toSupportedLocale(nextUser?.locale, resolvedLocale)
    });
    const requiresReaccept = await refreshLegalStatus();
    if (!requiresReaccept) loadFriends();
  }, [applyLocaleFromUser, loadFriends, refreshLegalStatus]);

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem('session_token');
    if (!token) return;

    try {
      const res = await profile.getMe();
      const resolvedLocale = await applyLocaleFromUser(res?.data?.user, { persistRemoteIfMissing: true });
      setUser({
        ...(res?.data?.user || {}),
        locale: toSupportedLocale(res?.data?.user?.locale, resolvedLocale)
      });
      const requiresReaccept = await refreshLegalStatus();
      if (!requiresReaccept) loadFriends();
    } catch {
      localStorage.removeItem('session_token');
    }
  }, [applyLocaleFromUser, loadFriends, refreshLegalStatus]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    const total = Object.values(unreadCounts).reduce((a, b) => a + b, 0);
    document.title = total > 0 ? `(${total}) ${appName}` : appName;
  }, [appName, unreadCounts]);

  useEffect(() => {
    const cleanupInsets = setupViewportInsets();
    configureNativeSystemUi();
    return cleanupInsets;
  }, []);

  useEffect(() => {
    if (!IS_NATIVE) {
      setNativePermissionsReady(true);
      setShowPermissionOnboarding(false);
      setPermissionsRequesting(false);
      return;
    }
    if (!user) {
      setNativePermissionsReady(false);
      setShowPermissionOnboarding(false);
      setPermissionsRequesting(false);
      return;
    }

    let onboarded = false;
    try {
      onboarded = localStorage.getItem(PERMISSIONS_ONBOARDED_KEY) === '1';
    } catch {
      onboarded = false;
    }

    if (onboarded) {
      setNativePermissionsReady(true);
      setShowPermissionOnboarding(false);
      return;
    }

    setNativePermissionsReady(false);
    setShowPermissionOnboarding(true);
  }, [user]);

  const notifyIncoming = useCallback(async ({ title, body, data, durationMs = 10000, local = false }) => {
    showToast(title, body, durationMs);
    if (IS_NATIVE && local) {
      await showLocalNotification({ title, body, data });
    }
  }, [appName, showToast, t]);

  const normalizeAdminNotice = useCallback(({ title, body, data }) => {
    const sourceTitle = appName;
    const noticeTitle = String(data?.noticeTitle || '').trim() || String(title || '').trim();
    const noticeBody = String(body || data?.body || '').trim();
    const combinedBody = noticeTitle && noticeBody
      ? `${noticeTitle}\n${noticeBody}`
      : (noticeBody || noticeTitle || t('app.newAnnouncement'));
    return { title: sourceTitle, body: combinedBody };
  }, [appName, t]);

  const clearPushRetry = useCallback(() => {
    if (pushRetryTimerRef.current) {
      clearTimeout(pushRetryTimerRef.current);
      pushRetryTimerRef.current = null;
    }
  }, []);

  const registerPushToken = useCallback(async (tokenValue, { force = false } = {}) => {
    if (!user || !tokenValue) return false;
    nativePushTokenRef.current = tokenValue;
    if (!force && pushTokenRef.current === tokenValue) return true;

    const previousToken = pushTokenRef.current;
    let lastError = null;
    const retryMs = [0, 2000, 5000];
    for (let i = 0; i < retryMs.length; i += 1) {
      if (retryMs[i] > 0) await waitMs(retryMs[i]);
      try {
        await pushApi.register({
          token: tokenValue,
          platform: 'android',
          deviceId: DEVICE_ID
        });
        pushTokenRef.current = tokenValue;
        pushRetryAttemptRef.current = 0;
        clearPushRetry();
        try {
          localStorage.setItem(PUSH_LAST_REGISTER_AT_KEY, new Date().toISOString());
          localStorage.removeItem(PUSH_LAST_REGISTER_ERROR_KEY);
        } catch {
          // Telemetry is best-effort only.
        }
        if (IS_DEV && previousToken !== tokenValue) {
          showToast(`${appName} Debug`, 'Push token acquired', 2600);
        }
        return true;
      } catch (e) {
        const message = e?.response?.data || e?.message || e;
        let msgText = '';
        if (typeof message === 'string') {
          msgText = message;
        } else {
          try {
            msgText = JSON.stringify(message);
          } catch {
            msgText = String(message);
          }
        }
        lastError = msgText;
        console.warn(`Push token register failed (attempt ${i + 1}/${retryMs.length}):`, message);
      }
    }

    pushTokenRef.current = null;
    try {
      const errText = String(lastError || 'Push register failed').slice(0, 320);
      localStorage.setItem(PUSH_LAST_REGISTER_ERROR_KEY, `${new Date().toISOString()} | ${errText}`);
    } catch {
      // Telemetry is best-effort only.
    }
    if (IS_DEV) {
      showToast(`${appName} Debug`, 'Push registration failed', 3200);
    }
    if (!pushRetryTimerRef.current && user && nativePushTokenRef.current) {
      const step = Math.min(pushRetryAttemptRef.current, 8);
      const delay = withJitter(Math.min(5 * 60 * 1000, 2000 * (2 ** step)));
      pushRetryTimerRef.current = window.setTimeout(async () => {
        pushRetryTimerRef.current = null;
        await registerPushToken(nativePushTokenRef.current, { force: true });
      }, delay);
      pushRetryAttemptRef.current += 1;
    }
    return false;
  }, [clearPushRetry, showToast, user]);

  const handlePushPayload = useCallback(async (payload = {}, fromPushEvent = false) => {
    const data = payload.data || {};
    const title = payload.title || payload.notification?.title || data.title || appName;
    const body = payload.body || payload.notification?.body || data.body || '';
    const type = data.type || payload.type;
    const deliveryId = data.deliveryId || payload.deliveryId || payload.notification?.data?.deliveryId;
    if (!shouldProcessDelivery(deliveryId)) return;
    const allowLocalNotification = fromPushEvent && !isAppForeground();
    const channelId = data.channelId || (type === 'admin_notice' ? CHANNEL_IDS.admin : CHANNEL_IDS.messages);

    if (type === 'admin_notice') {
      const normalized = normalizeAdminNotice({ title, body, data });
      const durationMs = Number(data.durationMs || 10000);
      showToast(normalized.title, normalized.body, durationMs);
      if (allowLocalNotification) {
        await showLocalNotification({
          title: normalized.title,
          body: normalized.body,
          data: { ...data, deliveryId, channelId }
        });
      }
      return;
    }

    if (type === 'direct_message') {
      const senderId = data.fromUserId || payload.fromUserId;
      const currentActive = activeFriendRef.current;
      const isActiveConversation =
        screenRef.current === 'chat' &&
        chatModeRef.current === 'friends' &&
        currentActive &&
        currentActive.user_id === senderId;

      if (!isActiveConversation) {
        await notifyIncoming({
          title,
          body,
          data: { ...data, deliveryId, channelId },
          durationMs: 10000,
          local: allowLocalNotification
        });
      }
      return;
    }

    if (type === 'friend_request_incoming') {
      const requestUserId = String(data.requestUserId || data.request_user_id || '').trim();
      const senderLabel = resolveFriendRequestSenderLabel(data);
      const requestTitle = title || t('app.friendRequestIncomingTitle');
      const requestBody = body || t('app.friendRequestIncomingBody', { name: senderLabel });

      if (!fromPushEvent) {
        loadFriends();
        setScreen('friends');
        return;
      }

      if (isAppForeground()) {
        enqueueFriendRequestPrompt({ ...data, requestUserId, fromDisplayName: senderLabel });
        return;
      }

      if (allowLocalNotification) {
        await showLocalNotification({
          title: requestTitle,
          body: requestBody,
          data: { ...data, requestUserId, deliveryId, channelId }
        });
      }
      return;
    }

    if (allowLocalNotification) {
      await showLocalNotification({
        title,
        body,
        data: { ...data, deliveryId, channelId }
      });
    }
  }, [enqueueFriendRequestPrompt, loadFriends, normalizeAdminNotice, notifyIncoming, setScreen, shouldProcessDelivery, showToast, t]);

  const playSound = useCallback(() => {
    try {
      const audio = new Audio('/sounds/pop.ogg');
      audio.volume = 1.0;
      const promise = audio.play();
      if (promise !== undefined) {
        promise.catch((e) => {
          if (IS_DEV) console.warn('Audio blocked:', e?.message || e);
        });
      }
    } catch (e) {
      console.error('Audio error:', e);
    }
  }, []);

  const isWsReady = useCallback(() => (
    ws.current?.readyState === WebSocket.OPEN && wsAuthenticatedRef.current
  ), []);

  const handleDirectMessageAck = useCallback((data = {}) => {
    const clientMsgId = data.clientMsgId || null;
    if (!clientMsgId) return;

    inFlightRef.current.delete(clientMsgId);
    clearAckTimer(clientMsgId);

    if (data.status === 'sent' || data.status === 'duplicate') {
      dropOutboxItem(clientMsgId);
      setMessageSendState(clientMsgId, {
        sendState: 'sent',
        mediaId: data.mediaId || undefined,
        conversationId: data.conversationId || undefined
      });
      return;
    }

    dropOutboxItem(clientMsgId);
    setMessageSendState(clientMsgId, { sendState: 'failed', errorCode: data.errorCode || 'SEND_FAILED' });
  }, [clearAckTimer, dropOutboxItem, setMessageSendState]);

  const sendOutboxItem = useCallback((item) => {
    if (!item?.clientMsgId || !isWsReady()) return false;
    if (inFlightRef.current.has(item.clientMsgId)) return true;

    try {
      ws.current.send(JSON.stringify(item.payload));
    } catch (e) {
      console.warn('Outbox send failed:', e?.message || e);
      return false;
    }

    inFlightRef.current.add(item.clientMsgId);
    applyOutbox((items) => items.map((entry) => (
      entry.clientMsgId === item.clientMsgId
        ? { ...entry, attempts: (Number(entry.attempts) || 0) + 1, lastAttemptAt: nowTs() }
        : entry
    )));

    clearAckTimer(item.clientMsgId);
    const timer = window.setTimeout(() => {
      inFlightRef.current.delete(item.clientMsgId);
      clearAckTimer(item.clientMsgId);

      const current = outboxRef.current.find((entry) => entry.clientMsgId === item.clientMsgId);
      if (!current) return;
      if ((Number(current.attempts) || 0) >= OUTBOX_MAX_ATTEMPTS) {
        dropOutboxItem(item.clientMsgId);
        setMessageSendState(item.clientMsgId, { sendState: 'failed', errorCode: 'ACK_TIMEOUT' });
        showToast(appName, t('app.connectionMissingMessage'), 6000);
        return;
      }

      setMessageSendState(item.clientMsgId, { sendState: 'pending' });
      flushOutboxFnRef.current();
    }, OUTBOX_ACK_TIMEOUT_MS);
    ackTimersRef.current.set(item.clientMsgId, timer);
    return true;
  }, [applyOutbox, clearAckTimer, dropOutboxItem, isWsReady, setMessageSendState, showToast]);

  const flushOutbox = useCallback(() => {
    if (!isWsReady()) return;
    const queue = clampOutbox(outboxRef.current.slice())
      .sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
    if (!queue.length) return;
    queue.forEach((item) => sendOutboxItem(item));
  }, [isWsReady, sendOutboxItem]);

  useEffect(() => {
    flushOutboxFnRef.current = flushOutbox;
  }, [flushOutbox]);

  const enqueueOutboxItem = useCallback((item) => {
    if (!item?.clientMsgId) return;
    applyOutbox((items) => {
      const filtered = items.filter((entry) => entry.clientMsgId !== item.clientMsgId);
      return [...filtered, item];
    });
    setMessageSendState(item.clientMsgId, { sendState: 'pending' });
    flushOutboxFnRef.current();
  }, [applyOutbox, setMessageSendState]);

  const scheduleReconnect = useCallback(() => {
    if (!shouldReconnectRef.current || intentionalCloseRef.current || !user) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setWsStatus('offline');
      return;
    }
    if (reconnectTimerRef.current) return;
    const idx = Math.min(reconnectAttemptRef.current, WS_RETRY_STEPS_MS.length - 1);
    const delay = withJitter(Math.min(WS_RETRY_STEPS_MS[idx], WS_RETRY_MAX_MS));
    setWsStatus('reconnecting');
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      reconnectAttemptRef.current += 1;
      connectWsFnRef.current();
    }, delay);
  }, [user]);

  const connect = useCallback(() => {
    if (!user) return;
    if (ws.current && (ws.current.readyState === WebSocket.OPEN || ws.current.readyState === WebSocket.CONNECTING)) return;

    const wsUrl = resolveWsUrl({ isNative: IS_NATIVE, isDev: IS_DEV });
    if (!wsUrl) {
      setWsStatus('disconnected');
      setLastErrorCode('WS_CONFIG_MISSING');
      if (!wsConfigWarnedRef.current) {
        wsConfigWarnedRef.current = true;
        console.warn('WebSocket URL is not configured. Set VITE_WS_URL or VITE_API_URL.');
        showToast(appName, t('app.wsMissingConfig'), 8000);
      }
      return;
    }

    setWsStatus(reconnectAttemptRef.current > 0 ? 'reconnecting' : 'connecting');
    wsAuthenticatedRef.current = false;
    const socket = new WebSocket(wsUrl);
    ws.current = socket;

    socket.onopen = () => {
      if (ws.current !== socket) return;
      socket.send(JSON.stringify({
        type: 'hello_ack',
        deviceId: DEVICE_ID,
        token: localStorage.getItem('session_token'),
        platform: IS_NATIVE ? 'android' : 'web',
        lang: activeLocale
      }));
    };

    socket.onmessage = (event) => {
      if (ws.current !== socket) return;
      try {
        const data = JSON.parse(event.data);
        if (IS_DEV) console.log('[WS]', data.type, data);

        switch (data.type) {
          case 'welcome':
            wsAuthenticatedRef.current = true;
            reconnectAttemptRef.current = 0;
            setWsStatus('connected');
            flushOutboxFnRef.current();
            break;
          case 'onlineCount':
            setOnlineCount(data.count);
            break;
          case 'queued':
            setPendingMatchOffer(null);
            setStatus('queued');
            setScreen('matching');
            break;
          case 'match_offer': {
            const fallbackName = t('chat.anonymous');
            const timeoutMsRaw = Number(data.timeoutMs);
            const timeoutMs = Number.isFinite(timeoutMsRaw)
              ? Math.max(1000, Math.min(20000, Math.round(timeoutMsRaw)))
              : 8000;
            const autoAcceptAt = Date.now() + timeoutMs;
            playSound();
            setChatMode('anon');
            setStatus('match_offer');
            setRoomId(null);
            setMessages([]);
            setPeerName(data.peerNickname || fallbackName);
            setPeerUsername(data.peerUsername || null);
            setPeerId(data.peerId || null);
            setPendingMatchOffer({
              matchId: data.matchId || null,
              peerNickname: data.peerNickname || fallbackName,
              peerUsername: data.peerUsername || '',
              peerId: data.peerId || null,
              autoAcceptAt,
              timeoutMs,
              peerAccepted: false,
              accepted: false
            });
            setScreen('matching');
            break;
          }
          case 'match_offer_peer_accepted':
            setPendingMatchOffer((prev) => (prev ? { ...prev, peerAccepted: true } : prev));
            break;
          case 'match_offer_waiting':
            setStatus('match_waiting');
            setPendingMatchOffer((prev) => (prev ? { ...prev, accepted: true } : prev));
            break;
          case 'match_offer_closed':
            setPendingMatchOffer(null);
            setStatus('queued');
            if (data.reason === 'peer_rejected') {
              showToast(appName, t('app.matchPeerRejected'), 3200);
            } else if (data.reason === 'peer_cancelled' || data.reason === 'peer_disconnected') {
              showToast(appName, t('app.matchPeerLeft'), 3200);
            }
            setScreen('matching');
            break;
          case 'debug':
            if (IS_DEV) console.log('[SERVER DEBUG]', data.msg, data);
            break;
          case 'matched':
            setPendingMatchOffer(null);
            setStatus('matched');
            setRoomId(data.roomId);
            setPeerName(data.peerNickname || t('chat.anonymous'));
            setPeerUsername(data.peerUsername);
            setPeerId(data.peerId);
            setMessages([]);
            setScreen('chat');
            setChatMode('anon');
            break;
          case 'message':
            setMessages(prev => [...prev, { from: 'peer', text: data.text }]);
            setIsPeerTyping(false);
            playSound();
            break;
          case 'direct_message_ack':
            handleDirectMessageAck(data);
            break;
          case 'success':
            if (data.message) {
              showToast(appName, data.message, 4500);
            }
            break;
          case 'error':
            if (data.code) setLastErrorCode(String(data.code).slice(0, 120));
            if (data.clientMsgId) {
                dropOutboxItem(data.clientMsgId);
                setMessageSendState(data.clientMsgId, { sendState: 'failed', errorCode: data.code || 'SERVER_ERROR' });
            }
            if (data.code === 'AUTH_ERROR') {
              ackTimersRef.current.forEach((t) => clearTimeout(t));
              ackTimersRef.current.clear();
              inFlightRef.current.clear();
              outboxRef.current = [];
              persistOutbox([]);
              setWsStatus('auth_error');
              shouldReconnectRef.current = false;
              localStorage.removeItem('session_token');
              setUser(null);
              setScreen('splash');
            } else if (data.message) {
              showToast(appName, data.message, 5000);
            }
            break;
          case 'direct_message': {
            const senderId = data.fromUserId;
            const deliveryId = data.deliveryId || null;
            if (!shouldProcessDelivery(deliveryId)) break;
            const currentActive = activeFriendRef.current;
            const currentMode = chatModeRef.current;
            const isActiveConversation =
              screenRef.current === 'chat' &&
              currentMode === 'friends' &&
              currentActive &&
              currentActive.user_id === senderId;

            if (isActiveConversation) {
              setMessages(prev => [...prev, {
                from: 'peer',
                text: data.text,
                msgType: data.msgType,
                mediaId: data.mediaId
              }]);
            } else {
              setUnreadCounts(prev => ({
                ...prev,
                [senderId]: (prev[senderId] || 0) + 1
              }));

              notifyIncoming({
                title: data.fromNickname || data.fromUsername || t('app.newMessage'),
                body: data.msgType === 'image' ? t('app.photoReceived') : (data.text || ''),
                data: {
                  type: 'direct_message',
                  fromUserId: senderId,
                  msgType: data.msgType || 'direct',
                  deliveryId,
                  channelId: CHANNEL_IDS.messages
                },
                local: false
              });
            }

            if (isActiveConversation || !IS_NATIVE) {
              playSound();
            }
            break;
          }
          case 'image_sent':
            if (data.clientMsgId) {
              setMessageSendState(data.clientMsgId, { sendState: 'sent', mediaId: data.mediaId });
            } else {
              setMessages(prev => [...prev, {
                from: 'me',
                text: t('chat.photoLabel'),
                msgType: 'image',
                mediaId: data.mediaId
              }]);
            }
            break;
          case 'typing':
            setIsPeerTyping(true);
            break;
          case 'stop_typing':
            setIsPeerTyping(false);
            break;
          case 'ended':
            setMessages(prev => [...prev, { from: 'system', text: 'Sohbet sonlandi.' }]);
            setStatus('ended');
            break;
          case 'image_data':
            if (imageFetchTimeoutRef.current) {
              clearTimeout(imageFetchTimeoutRef.current);
              imageFetchTimeoutRef.current = null;
            }
            setImageViewer(prev => {
              if (!prev.open || prev.mediaId !== data.mediaId) return prev;
              return { ...prev, status: 'ready', dataUrl: data.imageData, error: null };
            });
            setMessages(prev => prev.map(m => m.mediaId === data.mediaId ? { ...m, mediaExpired: true } : m));
            break;
          case 'image_error':
            if (imageFetchTimeoutRef.current) {
              clearTimeout(imageFetchTimeoutRef.current);
              imageFetchTimeoutRef.current = null;
            }
            setImageViewer(prev => {
              if (!prev.open || prev.mediaId !== data.mediaId) return prev;
              return { ...prev, status: 'error', error: data.message || t('chat.photoOpenFailed') };
            });
            setMessages(prev => prev.map(m => m.mediaId === data.mediaId ? { ...m, mediaExpired: true } : m));
            break;
          case 'friend_request_incoming': {
            const requestUserId = String(data.request_user_id || data.requestUserId || '').trim();
            const senderLabel = resolveFriendRequestSenderLabel(data);
            const title = t('app.friendRequestIncomingTitle');
            const body = t('app.friendRequestIncomingBody', { name: senderLabel });

            loadFriends();

            if (IS_NATIVE && !isAppForeground()) {
              void showLocalNotification({
                title,
                body,
                data: {
                  type: 'friend_request_incoming',
                  requestUserId,
                  fromUserId: requestUserId,
                  fromDisplayName: senderLabel,
                  channelId: CHANNEL_IDS.messages
                }
              });
            } else {
              enqueueFriendRequestPrompt({ ...data, requestUserId, fromDisplayName: senderLabel });
            }
            break;
          }
          case 'friend_refresh':
            loadFriends();
            break;
          case 'admin_notice': {
            const deliveryId = data.deliveryId || null;
            if (!shouldProcessDelivery(deliveryId)) break;
            const durationMs = Number(data.durationMs || 10000);
            const normalized = normalizeAdminNotice({
              title: data.title,
              body: data.body,
              data
            });
            showToast(normalized.title, normalized.body, durationMs);
            break;
          }
          default:
            break;
        }
      } catch (e) {
        console.error(e);
      }
    };

    socket.onerror = () => {
      if (ws.current !== socket) return;
      setLastErrorCode('WS_ERROR');
      setWsStatus('reconnecting');
    };

    socket.onclose = () => {
      if (ws.current === socket) ws.current = null;
      wsAuthenticatedRef.current = false;
      setWsStatus('disconnected');
      if (!intentionalCloseRef.current) scheduleReconnect();
    };
  }, [activeLocale, appName, dropOutboxItem, enqueueFriendRequestPrompt, handleDirectMessageAck, loadFriends, normalizeAdminNotice, notifyIncoming, playSound, scheduleReconnect, setMessageSendState, shouldProcessDelivery, showToast, t, user]);

  useEffect(() => {
    connectWsFnRef.current = connect;
  }, [connect]);
  useEffect(() => {
    if (!user || !IS_NATIVE) return;
    let dispose = () => { };

    (async () => {
      dispose = await initNativeLocalNotifications({
        onLocalAction: (event) => {
          const extra = event?.notification?.extra || event?.notification?.data || {};
          const type = extra?.type;
          if (type === 'friend_request_incoming') {
            loadFriends();
            setScreen('friends');
          }
        }
      });
    })();

    return () => {
      try {
        dispose();
      } catch (e) {
        if (IS_DEV) console.warn('Local notification dispose failed:', e?.message || e);
      }
    };
  }, [loadFriends, user]);

  useEffect(() => {
    if (!user) return;
    shouldReconnectRef.current = true;
    intentionalCloseRef.current = false;
    connectWsFnRef.current();
    return () => {
      shouldReconnectRef.current = false;
      intentionalCloseRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      wsAuthenticatedRef.current = false;
      if (ws.current) {
        try {
          ws.current.close();
        } catch (e) {
          if (IS_DEV) console.warn('WS close failed:', e?.message || e);
        }
        ws.current = null;
      }
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const onOnline = () => {
      if (!shouldReconnectRef.current || intentionalCloseRef.current) return;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      connectWsFnRef.current();
    };

    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (IS_NATIVE && !nativePermissionsReady) return;
    let dispose = () => { };

    (async () => {
      dispose = await initNativePush({
        onToken: async (tokenValue) => {
          nativePushTokenRef.current = tokenValue;
          await registerPushToken(tokenValue, { force: true });
        },
        onPushReceived: (notification) => {
          handlePushPayload(notification, true);
        },
        onPushAction: (notification) => {
          handlePushPayload(notification.notification || notification, false);
        },
        requestPermission: false
      });
    })();

    return () => {
      try {
        dispose();
      } catch (e) {
        if (IS_DEV) console.warn('Push dispose failed:', e?.message || e);
      }
    };
  }, [user, registerPushToken, handlePushPayload, nativePermissionsReady]);

  useEffect(() => {
    if (!user) return;

    const onForeground = () => {
      if (document.visibilityState && document.visibilityState !== 'visible') return;
      connectWsFnRef.current();
      if (nativePushTokenRef.current) {
        registerPushToken(nativePushTokenRef.current, { force: true });
      }
    };

    const pushRefreshTimer = window.setInterval(() => {
      if (nativePushTokenRef.current) {
        registerPushToken(nativePushTokenRef.current, { force: true });
      }
    }, PUSH_REFRESH_INTERVAL_MS);

    document.addEventListener('visibilitychange', onForeground);
    document.addEventListener('resume', onForeground);
    window.addEventListener('focus', onForeground);

    return () => {
      clearInterval(pushRefreshTimer);
      document.removeEventListener('visibilitychange', onForeground);
      document.removeEventListener('resume', onForeground);
      window.removeEventListener('focus', onForeground);
    };
  }, [user, registerPushToken]);

  const completePermissionOnboarding = useCallback((result = null) => {
    try {
      localStorage.setItem(PERMISSIONS_ONBOARDED_KEY, '1');
    } catch {
      // Best effort only.
    }

    setShowPermissionOnboarding(false);
    setPermissionsRequesting(false);
    setNativePermissionsReady(true);

    if (!result) return;
    const pushGranted = result?.push?.status === 'granted';
    const mediaGranted = result?.media?.status === 'granted';

    if (pushGranted && mediaGranted) {
      showToast(appName, t('app.pushPermissionDone'), 4200);
      return;
    }
    if (!pushGranted) {
      showToast(appName, t('app.pushPermissionNotificationOff'), 6200);
    }
    if (!mediaGranted) {
      showToast(appName, t('app.pushPermissionCameraOff'), 6200);
    }
  }, [showToast]);

  const handleEnablePermissions = useCallback(async () => {
    if (permissionsRequesting) return;
    setPermissionsRequesting(true);

    try {
      const result = await requestInitialPermissions();
      completePermissionOnboarding(result);
    } catch (e) {
      console.warn('Initial permission request failed:', e?.message || e);
      completePermissionOnboarding(null);
      showToast(appName, t('app.pushPermissionFlowFailed'), 6200);
    }
  }, [appName, completePermissionOnboarding, permissionsRequesting, showToast, t]);

  const handleSkipPermissions = useCallback(() => {
    if (permissionsRequesting) return;
    completePermissionOnboarding(null);
    showToast(appName, t('app.pushPermissionLater'), 5800);
  }, [appName, completePermissionOnboarding, permissionsRequesting, showToast, t]);

  const handleLogout = async () => {
    shouldReconnectRef.current = false;
    intentionalCloseRef.current = true;
    wsAuthenticatedRef.current = false;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    clearPushRetry();
    pushRetryAttemptRef.current = 0;
    ackTimersRef.current.forEach((t) => clearTimeout(t));
    ackTimersRef.current.clear();
    inFlightRef.current.clear();
    outboxRef.current = [];
    persistOutbox([]);

    if (pushTokenRef.current) {
      try {
        await pushApi.unregister({ token: pushTokenRef.current, deviceId: DEVICE_ID });
      } catch (e) {
        if (IS_DEV) console.warn('Push unregister failed:', e?.message || e);
      }
      pushTokenRef.current = null;
    }
    nativePushTokenRef.current = null;
    seenDeliveryRef.current.clear();

    try { await auth.logout(); } catch (e) { console.error('Logout error:', e); }

    try { ws.current?.close(); } catch (e) { if (IS_DEV) console.warn('WS close failed:', e); }
    ws.current = null;

    setUser(null);
    setScreen('splash');
    setStatus('disconnected');
    setWsStatus('disconnected');
    setOnlineCount(0);

    setFriendList([]);
    setFriendRequests([]);
    setBlockedUsers([]);
    setActiveFriend(null);
    setUnreadCounts({});

    setMessages([]);
    setPeerName(null);
    setPeerUsername(null);
    setPeerId(null);
    setPendingMatchOffer(null);
    setIsPeerTyping(false);
    setRoomId(null);
    setChatMode('anon');
    setLegalReaccept({
      open: false,
      loading: false,
      error: '',
      required: null,
      accepted: null
    });

    if (imageFetchTimeoutRef.current) {
      clearTimeout(imageFetchTimeoutRef.current);
      imageFetchTimeoutRef.current = null;
    }
    setImageViewer(initialImageViewer);
  };

  const handleAccountDeletionRequested = async (message) => {
    const finalMessage = String(message || '').trim() || t('home.deleteRequestSubmitted');
    await handleLogout();
    showToast(appName, `${finalMessage} ${t('app.accountDeletionPostfix')}`, 8200);
  };

  const handleStartAnon = () => {
    if (!isWsReady()) {
      showToast(appName, t('app.reconnecting'), 4500);
      connectWsFnRef.current();
      return;
    }
    setChatMode('anon');
    setPendingMatchOffer(null);
    setRoomId(null);
    setMessages([]);
    ws.current?.send(JSON.stringify({ type: 'joinQueue' }));
    setScreen('matching');
  };

  const handleMatchAccept = () => {
    if (!pendingMatchOffer) return;
    if (!isWsReady()) {
      showToast(appName, t('app.reconnecting'), 4500);
      connectWsFnRef.current();
      return;
    }
    setStatus('match_waiting');
    setPendingMatchOffer((prev) => (prev ? { ...prev, accepted: true } : prev));
    ws.current?.send(JSON.stringify({
      type: 'matchDecision',
      matchId: pendingMatchOffer.matchId || undefined,
      decision: 'accept'
    }));
  };

  const handleMatchReject = () => {
    if (!pendingMatchOffer) return;
    if (!isWsReady()) {
      showToast(appName, t('app.matchDecisionFailed'), 4500);
      return;
    }
    setPendingMatchOffer(null);
    setStatus('queued');
    ws.current?.send(JSON.stringify({
      type: 'matchDecision',
      matchId: pendingMatchOffer.matchId || undefined,
      decision: 'reject'
    }));
  };

  const handleStartFriendChat = async (friend) => {
    if (IS_DEV) console.log('Selected friend:', friend);
    setActiveFriend(friend);
    setPendingMatchOffer(null);
    setRoomId(null);
    setChatMode('friends');
    setPeerName(friend.display_name || friend.username);
    setMessages([]);
    setScreen('chat');
    setStatus('matched');

    setUnreadCounts(prev => {
      const newCounts = { ...prev };
      delete newCounts[friend.user_id];
      return newCounts;
    });

    try {
      const hist = await friends.getHistory(friend.user_id);
      const histMsgs = (hist.data.messages || []).map(m => ({
        from: m.from,
        text: m.text,
        msgType: m.msgType,
        clientMsgId: m.clientMsgId || null,
        mediaId: m.mediaId,
        mediaExpired: m.mediaExpired,
        sendState: m.from === 'me' ? 'sent' : undefined
      }));
      const sentClientIds = new Set(histMsgs.map((m) => m.clientMsgId).filter(Boolean));
      const pendingMsgs = outboxRef.current
        .filter((entry) => entry.targetUserId === friend.user_id && !sentClientIds.has(entry.clientMsgId))
        .map((entry) => ({
          from: 'me',
          text: entry.kind === 'direct_image_send' ? t('chat.photoLabel') : entry.text,
          msgType: entry.kind === 'direct_image_send' ? 'image' : 'direct',
          sendState: 'pending',
          clientMsgId: entry.clientMsgId
        }));
      setMessages([...histMsgs, ...pendingMsgs]);
    } catch (e) {
      console.error('History error', e);
    }

    setScreen('chat');
  };

  const handleAcceptRequest = async (id) => {
    await friends.accept(id);
    loadFriends();
  };

  const handleRejectRequest = async (id) => {
    await friends.reject(id);
    loadFriends();
  };

  const handleDeleteFriend = async (friendId) => {
    if (!window.confirm(t('app.deleteFriendConfirm'))) return;
    try {
      await friends.delete(friendId);
      loadFriends();
    } catch (e) {
      console.error(e);
      showToast(appName, getLocalizedApiError(t, e, 'app.deleteFriendFailed'), 6500);
    }
  };

  const handleBlockUser = async (friendId) => {
    if (!window.confirm(t('app.blockConfirm'))) return;
    try {
      await friends.block(friendId);
      if (activeFriend?.user_id === friendId) {
        handleLeaveChat();
      }
      loadFriends();
    } catch (e) {
      console.error(e);
      showToast(appName, getLocalizedApiError(t, e, 'app.blockFailed'), 6500);
    }
  };

  const handleUnblockUser = async (friendId) => {
    if (!window.confirm(t('app.unblockConfirm'))) return;
    try {
      await friends.unblock(friendId);
      loadFriends();
    } catch (e) {
      console.error(e);
      showToast(appName, getLocalizedApiError(t, e, 'app.unblockFailed'), 6500);
    }
  };

  const handleAddFriend = async () => {
    if (!peerUsername) {
      showToast(appName, t('app.addFriendMissingUsername'), 5000);
      return;
    }
    try {
      await friends.request(peerUsername);
      showToast(appName, t('app.friendRequestSent'), 4200);
    } catch (e) {
      showToast(appName, getLocalizedApiError(t, e, 'app.addFriendFailed'), 6500);
    }
  };

  const handleLeaveChat = () => {
    if (chatMode === 'anon') {
      const isQueueLikeState = status === 'queued' || status === 'match_offer' || status === 'match_waiting' || screen === 'matching';
      if (isQueueLikeState) {
        ws.current?.send(JSON.stringify({ type: 'leaveQueue' }));
      } else {
        ws.current?.send(JSON.stringify({ type: 'leave' }));
      }
    }

    setScreen(chatMode === 'friends' ? 'friends' : 'home');
    setMessages([]);
    setRoomId(null);
    setPeerName(null);
    setPeerId(null);
    setPeerUsername(null);
    setPendingMatchOffer(null);
    setActiveFriend(null);
  };

  const handleSendMessage = (text) => {
    if (chatMode === 'anon' && roomId) {
      if (!isWsReady()) {
        showToast(appName, t('app.connectionMissingMessage'), 4500);
        connectWsFnRef.current();
        return;
      }
      setMessages(prev => [...prev, { from: 'me', text }]);
      ws.current?.send(JSON.stringify({ type: 'message', roomId, text }));
      return;
    }

    if (chatMode === 'friends' && activeFriend) {
      const clientMsgId = randomId();
      const queueItem = {
        clientMsgId,
        kind: 'direct_message',
        targetUserId: activeFriend.user_id,
        text,
        createdAt: nowTs(),
        expiresAt: nowTs() + OUTBOX_TTL_MS,
        attempts: 0,
        lastAttemptAt: 0,
        payload: {
          type: 'direct_message',
          targetUserId: activeFriend.user_id,
          text,
          clientMsgId
        }
      };

      setMessages(prev => [...prev, {
        from: 'me',
        text,
        msgType: 'direct',
        sendState: 'pending',
        clientMsgId
      }]);
      enqueueOutboxItem(queueItem);
      if (!isWsReady()) connectWsFnRef.current();
      return;
    }

    if (IS_DEV) console.warn('[App] Message not sent: invalid state', { chatMode, roomId, activeFriend });
  };

  const handleTyping = () => {
    if (!isWsReady()) return;

    const now = Date.now();
    if (now - lastTypingSentRef.current > 2000) {
      const payload = chatMode === 'friends' && activeFriend
        ? { type: 'typing', targetUserId: activeFriend.user_id }
        : { type: 'typing' };
      ws.current.send(JSON.stringify(payload));
      lastTypingSentRef.current = now;
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      const stopPayload = chatMode === 'friends' && activeFriend
        ? { type: 'stop_typing', targetUserId: activeFriend.user_id }
        : { type: 'stop_typing' };
      ws.current?.send(JSON.stringify(stopPayload));
    }, 1000);
  };

  const handleReport = () => {
    const reason = window.prompt(t('app.reportPrompt'));
    const cleanReason = String(reason || '').trim();
    if (!cleanReason) {
      showToast(appName, t('app.reportReasonRequired'), 5000);
      return;
    }
    if (!isWsReady()) {
      showToast(appName, t('app.reconnecting'), 4500);
      return;
    }

    const payload = { type: 'report', reason: cleanReason };
    if (chatMode === 'anon') {
      if (roomId) payload.roomId = roomId;
      if (peerId) payload.targetUserId = peerId;
    } else if (chatMode === 'friends' && activeFriend?.user_id) {
      payload.targetUserId = activeFriend.user_id;
    }

    if (!payload.roomId && !payload.targetUserId) {
      showToast(appName, t('app.supportFailed'), 5000);
      return;
    }

    ws.current.send(JSON.stringify(payload));
  };

  const handleSupportReport = async ({ subject, description, email, mediaFiles = [] }) => {
    const normalizedSubject = normalizeSupportSubject(subject);
    if (!normalizedSubject) {
      const message = t('app.invalidSubject');
      showToast(appName, message, 6500);
      return { ok: false, error: message };
    }

    const descriptionText = String(description || '').trim();
    const emailText = String(email || '').trim();
    const validMediaFiles = Array.isArray(mediaFiles)
      ? mediaFiles.filter((file) => file instanceof File)
      : [];

    const metadata = {
      appVersion: APP_VERSION,
      platform: resolvePlatform(IS_NATIVE),
      deviceModel: resolveDeviceModel(),
      timestamp: new Date().toISOString(),
      networkType: resolveNetworkType(),
      lastErrorCode: getLastErrorCode() || null
    };
    const hasMedia = validMediaFiles.length > 0;
    const payload = hasMedia
      ? (() => {
        const formData = new FormData();
        formData.append('subject', normalizedSubject);
        formData.append('description', descriptionText);
        if (emailText) formData.append('email', emailText);
        formData.append('metadata', JSON.stringify(metadata));
        validMediaFiles.forEach((file) => {
          formData.append('media', file, file.name || 'media');
        });
        return formData;
      })()
      : {
        subject: normalizedSubject,
        description: descriptionText,
        email: emailText || null,
        metadata
      };

    setSupportSubmitting(true);
    try {
      const response = await supportApi.report(payload);
      if (!response?.data?.delivered) {
        showToast(appName, t('app.supportQueued'), 6500);
      } else {
        showToast(appName, t('app.supportReceived'), 6500);
      }
      return { ok: true };
    } catch (error) {
      const message = getLocalizedApiError(t, error, 'app.supportFailed');
      showToast(appName, message, 6500);
      return { ok: false, error: message };
    } finally {
      setSupportSubmitting(false);
    }
  };

  const handleLocaleChange = useCallback(async (nextLocale) => {
    const previousLocale = activeLocale;
    const normalized = toSupportedLocale(nextLocale, previousLocale);
    setLocale(normalized, { persist: true });

    if (!user?.id) return normalized;

    try {
      await profile.updateMe({ locale: normalized });
      setUser((prev) => (prev ? { ...prev, locale: normalized } : prev));
      return normalized;
    } catch (error) {
      setLocale(previousLocale, { persist: true });
      throw error;
    }
  }, [activeLocale, setLocale, user?.id]);

  const closeImageViewer = () => {
    if (imageFetchTimeoutRef.current) {
      clearTimeout(imageFetchTimeoutRef.current);
      imageFetchTimeoutRef.current = null;
    }
    setImageViewer(initialImageViewer);
  };

  useEffect(() => {
    if (!IS_NATIVE) return () => { };

    let dispose = () => { };
    const exitWithDoubleBack = () => {
      const now = Date.now();
      if (now - backPressAtRef.current <= BACK_EXIT_WINDOW_MS) {
        exitNativeApp();
        return;
      }
      backPressAtRef.current = now;
      showToast(appName, t('app.exitBackAgain'), 1800);
    };

    (async () => {
      dispose = await addNativeBackButtonListener(() => {
        if (showPermissionOnboarding) {
          handleSkipPermissions();
          return;
        }

        if (legalKind) {
          window.location.href = '/';
          return;
        }

        if (!user) {
          exitWithDoubleBack();
          return;
        }

        if (imageViewer?.open) {
          closeImageViewer();
          return;
        }

        if (screenRef.current === 'chat' || screenRef.current === 'matching') {
          handleLeaveChat();
          return;
        }

        if (screenRef.current === 'friends') {
          setScreen('home');
          return;
        }

        if (screenRef.current === 'home' || screenRef.current === 'splash') {
          exitWithDoubleBack();
          return;
        }

        setScreen('home');
      });
    })();

    return () => {
      try {
        dispose();
      } catch (e) {
        if (IS_DEV) console.warn('Back button dispose failed:', e?.message || e);
      }
    };
  }, [
    appName,
    legalKind,
    user,
    imageViewer?.open,
    showPermissionOnboarding,
    closeImageViewer,
    handleLeaveChat,
    handleSkipPermissions,
    showToast,
    t
  ]);

  const handleSendImage = (base64) => {
    if (chatMode !== 'friends' || !activeFriend?.user_id) return;
    const clientMsgId = randomId();
    const queueItem = {
      clientMsgId,
      kind: 'direct_image_send',
      targetUserId: activeFriend.user_id,
      text: t('chat.photoLabel'),
      createdAt: nowTs(),
      expiresAt: nowTs() + OUTBOX_TTL_MS,
      attempts: 0,
      lastAttemptAt: 0,
      payload: {
        type: 'direct_image_send',
        targetUserId: activeFriend.user_id,
        imageData: base64,
        clientMsgId
      }
    };

    setMessages(prev => [...prev, {
      from: 'me',
      text: t('chat.photoLabel'),
      msgType: 'image',
      sendState: 'pending',
      clientMsgId
    }]);
    enqueueOutboxItem(queueItem);
    if (!isWsReady()) connectWsFnRef.current();
  };

  const handleViewImage = (mediaId) => {
    if (!mediaId) return;
    if (!isWsReady()) {
      showToast(appName, t('app.connectionMissingPhoto'), 4500);
      connectWsFnRef.current();
      return;
    }

    if (imageFetchTimeoutRef.current) {
      clearTimeout(imageFetchTimeoutRef.current);
      imageFetchTimeoutRef.current = null;
    }

    setImageViewer({
      open: true,
      status: 'loading',
      mediaId,
      dataUrl: null,
      error: null
    });

    ws.current?.send(JSON.stringify({ type: 'fetch_image', mediaId }));

    imageFetchTimeoutRef.current = setTimeout(() => {
      setImageViewer(prev => {
        if (!prev.open || prev.mediaId !== mediaId || prev.status !== 'loading') return prev;
        return { ...prev, status: 'error', error: t('chat.retry') };
      });
      imageFetchTimeoutRef.current = null;
    }, IMAGE_FETCH_TIMEOUT_MS);
  };

  const toastStack = useMemo(() => (
    <div className="admin-toast-stack">
      {notices.map((notice) => (
        <div
          key={notice.id}
          className={`admin-toast${notice.closing ? ' is-closing' : ''}`}
          role="status"
          aria-live="polite"
          style={{ '--toast-duration': `${notice.durationMs || TOAST_DEFAULT_MS}ms` }}
        >
          <button className="admin-toast-close" onClick={() => dismissToast(notice.id)} aria-label={t('common.close')}>x</button>
          <div className="admin-toast-header">
            <span className="admin-toast-tag">{t('app.notificationTag')}</span>
          </div>
          <div className="admin-toast-title">{notice.title}</div>
          <div className="admin-toast-divider" />
          <div className="admin-toast-body">{notice.body}</div>
          <div className="admin-toast-progress" aria-hidden="true">
            <span className="admin-toast-progress-bar" />
          </div>
        </div>
      ))}
    </div>
  ), [dismissToast, notices, t]);

  const friendRequestPromptStack = useMemo(() => (
    <div className="friend-request-stack">
      {friendRequestPrompts.map((prompt) => (
        <div key={prompt.requestUserId} className="friend-request-card" role="status" aria-live="polite">
          <button
            className="friend-request-close"
            onClick={() => dismissFriendRequestPrompt(prompt.requestUserId)}
            aria-label={t('common.close')}
            disabled={prompt.busy}
          >
            x
          </button>
          <div className="friend-request-tag">{t('app.friendRequestIncomingTitle')}</div>
          <div className="friend-request-body">
            {t('app.friendRequestIncomingBody', { name: prompt.senderLabel || 'TalkX' })}
          </div>
          <div className="friend-request-actions">
            <button
              type="button"
              className="btn-neon"
              onClick={() => handleFriendRequestPromptAction(prompt.requestUserId, 'reject')}
              disabled={prompt.busy}
            >
              {t('app.friendRequestReject')}
            </button>
            <button
              type="button"
              className="btn-solid-purple"
              onClick={() => handleFriendRequestPromptAction(prompt.requestUserId, 'accept')}
              disabled={prompt.busy}
            >
              {t('app.friendRequestAccept')}
            </button>
          </div>
        </div>
      ))}
    </div>
  ), [dismissFriendRequestPrompt, friendRequestPrompts, handleFriendRequestPromptAction, t]);

  const permissionOnboarding = IS_NATIVE && user && showPermissionOnboarding && (
    <div className="permissions-onboarding-overlay">
      <div className="permissions-onboarding-card glass-card" role="dialog" aria-modal="true" aria-labelledby="permissions-onboarding-title">
        <h3 id="permissions-onboarding-title" className="permissions-onboarding-title">{t('app.permissionsTitle')}</h3>
        <p className="permissions-onboarding-desc">{t('app.permissionsDesc')}</p>
        <div className="permissions-onboarding-list">
          <div className="permissions-onboarding-item">{t('app.permissionsNotificationItem')}</div>
          <div className="permissions-onboarding-item">{t('app.permissionsMediaItem')}</div>
        </div>
        <div className="permissions-onboarding-actions">
          <button type="button" className="btn-neon" onClick={handleSkipPermissions} disabled={permissionsRequesting}>
            {t('app.permissionsNotNow')}
          </button>
          <button type="button" className="btn-solid-purple" onClick={handleEnablePermissions} disabled={permissionsRequesting}>
            {permissionsRequesting ? t('app.permissionsRequesting') : t('app.permissionsOpen')}
          </button>
        </div>
      </div>
    </div>
  );

  const legalReacceptModal = user && legalReaccept.open && (
    <div className="legal-reaccept-overlay">
      <div className="legal-reaccept-card glass-card" role="dialog" aria-modal="true" aria-labelledby="legal-reaccept-title">
        <h3 id="legal-reaccept-title" className="legal-reaccept-title">{t('legal.updatedContracts')}</h3>
        <p className="legal-reaccept-desc">{t('legal.reacceptDescription')}</p>
        <div className="legal-reaccept-links">
          <a href={localizedLegalFooter.privacyUrl || '/privacy-policy'} target="_blank" rel="noopener noreferrer">
            {localizedLegalFooter.privacyLabel}
          </a>
          <span>&middot;</span>
          <a href={localizedLegalFooter.termsUrl || '/terms-of-use'} target="_blank" rel="noopener noreferrer">
            {localizedLegalFooter.termsLabel}
          </a>
        </div>
        <div className="legal-reaccept-versions">
          {t('legal.requiredVersion', {
            terms: legalReaccept?.required?.terms || '-',
            privacy: legalReaccept?.required?.privacy || '-'
          })}
        </div>
        {legalReaccept.error ? <div className="support-error">{legalReaccept.error}</div> : null}
        <div className="legal-reaccept-actions">
          <button type="button" className="btn-neon" onClick={handleLogout} disabled={legalReaccept.loading}>
            {t('legal.logout')}
          </button>
          <button type="button" className="btn-solid-purple" onClick={handleAcceptLatestLegal} disabled={legalReaccept.loading}>
            {legalReaccept.loading ? t('legal.accepting') : t('legal.accept')}
          </button>
        </div>
      </div>
    </div>
  );

  const withToasts = (content) => (
    <>
      {content}
      {toastStack}
      {friendRequestPromptStack}
      {permissionOnboarding}
      {legalReacceptModal}
    </>
  );

  if (legalKind) {
    return withToasts(
      <LegalScreen
        kind={legalKind}
        legalContent={legalContent}
        loading={!legalLoaded}
      />
    );
  }

  if (!user) {
    return withToasts(
      <Auth
        onLogin={handleAuthLogin}
        legalFooter={localizedLegalFooter}
        legalVersions={legalContent.versions}
      />
    );
  }

  if (screen === 'splash') {
    return withToasts(<SplashScreen onFinish={() => setScreen('home')} />);
  }

  if (screen === 'home') {
    const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);
    return withToasts(
      <HomeScreen
        currentUser={user}
        onUpdateUser={setUser}
        onDeletionCompleted={handleAccountDeletionRequested}
        onlineCount={onlineCount}
        unreadCount={totalUnread + (friendRequests.length || 0)}
        onLogout={handleLogout}
        onSupportSubmit={handleSupportReport}
        supportSubmitting={supportSubmitting}
        legalFooter={localizedLegalFooter}
        currentLocale={activeLocale}
        onLocaleChange={handleLocaleChange}
        onSelectMode={(mode) => {
          if (mode === 'anon') handleStartAnon();
          else if (mode === 'friends') {
            loadFriends();
            setScreen('friends');
          }
        }}
      />
    );
  }

  if (screen === 'friends') {
    return withToasts(
      <FriendsScreen
        friends={friendList}
        requests={friendRequests}
        blockedUsers={blockedUsers}
        unreadCounts={unreadCounts}
        onBack={() => setScreen('home')}
        onChat={handleStartFriendChat}
        onAccept={handleAcceptRequest}
        onReject={handleRejectRequest}
        onDelete={handleDeleteFriend}
        onBlock={handleBlockUser}
        onUnblock={handleUnblockUser}
      />
    );
  }

  if (screen === 'matching') {
    return withToasts(
      <MatchScreen
        status={status}
        offer={pendingMatchOffer}
        onAccept={handleMatchAccept}
        onReject={handleMatchReject}
        onCancel={handleLeaveChat}
      />
    );
  }

  if (screen === 'chat') {
    return withToasts(
      <ChatScreen
        messages={messages}
        currentUserId={user.id}
        peerName={peerName}
        onSend={handleSendMessage}
        onLeave={handleLeaveChat}
        onNewMatch={handleStartAnon}
        onReport={handleReport}
        onAddFriend={handleAddFriend}
        peerId={peerId}
        isTyping={isPeerTyping}
        onTyping={handleTyping}
        isFriendMode={chatMode === 'friends'}
        isChatEnded={status === 'ended'}
        onSendImage={handleSendImage}
        onViewImage={handleViewImage}
        onRetryViewImage={handleViewImage}
        onCloseImage={closeImageViewer}
        imageViewer={imageViewer}
      />
    );
  }

  return withToasts(<div>{t('app.unknownState')}</div>);
}

export default App;






















