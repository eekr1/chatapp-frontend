import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import './index.css';
import {
  auth,
  profile,
  friends,
  push as pushApi,
  support as supportApi,
  getLastErrorCode,
  setLastErrorCode
} from './api';
import Auth from './components/Auth';

import SplashScreen from './screens/SplashScreen';
import HomeScreen from './screens/HomeScreen';
import MatchScreen from './screens/MatchScreen';
import ChatScreen from './screens/ChatScreen';
import FriendsScreen from './screens/FriendsScreen';
import {
  isNativePlatform,
  setupViewportInsets,
  configureNativeSystemUi,
  initNativePush,
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
  ['bağlantı', 'connection'],
  ['mesaj', 'message'],
  ['foto', 'photo'],
  ['diger', 'other'],
  ['diğer', 'other']
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

function App() {
  const [screen, setScreen] = useState('splash');

  const [user, setUser] = useState(null);
  const [onlineCount, setOnlineCount] = useState(0);
  const [status, setStatus] = useState('disconnected');
  const [wsStatus, setWsStatus] = useState('disconnected');

  const [friendList, setFriendList] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [activeFriend, setActiveFriend] = useState(null);
  const [unreadCounts, setUnreadCounts] = useState({});

  const [messages, setMessages] = useState([]);
  const [peerName, setPeerName] = useState(null);
  const [peerUsername, setPeerUsername] = useState(null);
  const [peerId, setPeerId] = useState(null);
  const [isPeerTyping, setIsPeerTyping] = useState(false);
  const [roomId, setRoomId] = useState(null);
  const [chatMode, setChatMode] = useState('anon');

  const [notices, setNotices] = useState([]);
  const [supportSubmitting, setSupportSubmitting] = useState(false);

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

  useEffect(() => { activeFriendRef.current = activeFriend; }, [activeFriend]);
  useEffect(() => { chatModeRef.current = chatMode; }, [chatMode]);
  useEffect(() => { screenRef.current = screen; }, [screen]);
  useEffect(() => { noticesRef.current = notices; }, [notices]);

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
        title: title || 'TalkX',
        body: body || '',
        durationMs: safeDuration,
        closing: false
      }
    ]);

    const hideTimer = window.setTimeout(() => {
      startToastExit(id);
    }, safeDuration);

    toastTimersRef.current.set(id, { hideTimer, removeTimer: null });
  }, [startToastExit]);

  const dismissToast = useCallback((id) => {
    startToastExit(id);
  }, [startToastExit]);

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

  useEffect(() => () => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    if (pushRetryTimerRef.current) clearTimeout(pushRetryTimerRef.current);
    ackTimersRef.current.forEach((t) => clearTimeout(t));
    ackTimersRef.current.clear();
  }, []);

  const loadFriends = useCallback(async () => {
    try {
      const res = await friends.list();
      setFriendList(res.data.friends || []);
      setFriendRequests(res.data.incoming || []);

      const initialUnread = {};
      (res.data.friends || []).forEach((f) => {
        if (f.unread_count > 0) initialUnread[f.user_id] = f.unread_count;
      });
      setUnreadCounts(initialUnread);
    } catch (e) {
      console.error('Friends load error:', e);
    }
  }, []);

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem('session_token');
    if (!token) return;

    try {
      const res = await profile.getMe();
      setUser(res.data.user);
      loadFriends();
    } catch {
      localStorage.removeItem('session_token');
    }
  }, [loadFriends]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    const total = Object.values(unreadCounts).reduce((a, b) => a + b, 0);
    document.title = total > 0 ? `(${total}) TalkX` : 'TalkX';
  }, [unreadCounts]);

  useEffect(() => {
    const cleanupInsets = setupViewportInsets();
    configureNativeSystemUi();
    return cleanupInsets;
  }, []);

  const notifyIncoming = useCallback(async ({ title, body, data, durationMs = 10000, local = false }) => {
    showToast(title, body, durationMs);
    if (IS_NATIVE && local) {
      await showLocalNotification({ title, body, data });
    }
  }, [showToast]);

  const normalizeAdminNotice = useCallback(({ title, body, data }) => {
    const sourceTitle = 'TalkX';
    const noticeTitle = String(data?.noticeTitle || '').trim() || String(title || '').trim();
    const noticeBody = String(body || data?.body || '').trim();
    const combinedBody = noticeTitle && noticeBody
      ? `${noticeTitle}\n${noticeBody}`
      : (noticeBody || noticeTitle || 'Yeni duyuru');
    return { title: sourceTitle, body: combinedBody };
  }, []);

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
          showToast('TalkX Debug', 'Push token alindi', 2600);
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
      showToast('TalkX Debug', 'Push register basarisiz', 3200);
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
    const title = payload.title || payload.notification?.title || data.title || 'TalkX';
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

    if (allowLocalNotification) {
      await showLocalNotification({
        title,
        body,
        data: { ...data, deliveryId, channelId }
      });
    }
  }, [normalizeAdminNotice, notifyIncoming, showToast, shouldProcessDelivery]);

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
        showToast('TalkX', 'Mesaj gonderilemedi. Baglanti kontrol edin.', 6000);
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
        showToast('TalkX', 'WS URL ayari eksik. VITE_WS_URL/VITE_API_URL kontrol et.', 8000);
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
        platform: IS_NATIVE ? 'android' : 'web'
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
            setStatus('queued');
            setScreen('matching');
            break;
          case 'debug':
            if (IS_DEV) console.log('[SERVER DEBUG]', data.msg, data);
            break;
          case 'matched':
            playSound();
            setStatus('matched');
            setRoomId(data.roomId);
            setPeerName(data.peerNickname || 'Anonim');
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
              showToast('TalkX', data.message, 5000);
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
                title: data.fromNickname || data.fromUsername || 'Yeni mesaj',
                body: data.msgType === 'image' ? 'Fotograf gonderdi' : (data.text || ''),
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
                text: 'Fotograf',
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
              return { ...prev, status: 'error', error: data.message || 'Fotograf yuklenemedi.' };
            });
            setMessages(prev => prev.map(m => m.mediaId === data.mediaId ? { ...m, mediaExpired: true } : m));
            break;
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
  }, [dropOutboxItem, handleDirectMessageAck, loadFriends, normalizeAdminNotice, notifyIncoming, playSound, scheduleReconnect, setMessageSendState, shouldProcessDelivery, showToast, user]);

  useEffect(() => {
    connectWsFnRef.current = connect;
  }, [connect]);

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
        }
      });
    })();

    return () => {
      try {
        dispose();
      } catch (e) {
        if (IS_DEV) console.warn('Push dispose failed:', e?.message || e);
      }
    };
  }, [user, registerPushToken, handlePushPayload]);

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
    setActiveFriend(null);
    setUnreadCounts({});

    setMessages([]);
    setPeerName(null);
    setPeerUsername(null);
    setPeerId(null);
    setIsPeerTyping(false);
    setRoomId(null);
    setChatMode('anon');

    if (imageFetchTimeoutRef.current) {
      clearTimeout(imageFetchTimeoutRef.current);
      imageFetchTimeoutRef.current = null;
    }
    setImageViewer(initialImageViewer);
  };

  const handleStartAnon = () => {
    if (!isWsReady()) {
      showToast('TalkX', 'Baglanti yeniden kuruluyor. Lutfen tekrar deneyin.', 4500);
      connectWsFnRef.current();
      return;
    }
    ws.current?.send(JSON.stringify({ type: 'joinQueue' }));
    setScreen('matching');
  };

  const handleStartFriendChat = async (friend) => {
    if (IS_DEV) console.log('Selected friend:', friend);
    setActiveFriend(friend);
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
          text: entry.kind === 'direct_image_send' ? 'Fotograf' : entry.text,
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
    if (!window.confirm('Bu arkadasi silmek ve engellemek istediginize emin misiniz?')) return;
    try {
      await friends.delete(friendId);
      loadFriends();
    } catch (e) {
      console.error(e);
      alert('Silinemedi.');
    }
  };

  const handleAddFriend = async () => {
    if (!peerUsername) return alert('Kullanici adi bilgisi yok.');
    try {
      await friends.request(peerUsername);
      alert('Arkadaslik istegi gonderildi.');
    } catch (e) {
      alert(e.response?.data?.error || 'Istek gonderilemedi.');
    }
  };

  const handleLeaveChat = () => {
    if (chatMode === 'anon') {
      if (status === 'queued') {
        ws.current?.send(JSON.stringify({ type: 'leaveQueue' }));
      } else {
        ws.current?.send(JSON.stringify({ type: 'leave' }));
      }
    }

    setScreen('home');
    setMessages([]);
    setRoomId(null);
    setActiveFriend(null);
  };

  const handleSendMessage = (text) => {
    if (chatMode === 'anon' && roomId) {
      if (!isWsReady()) {
        showToast('TalkX', 'Baglanti yok. Mesaj gonderilemedi.', 4500);
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
    const reason = prompt('Lutfen rapor sebebini belirtin (spam, hakaret, vb.):');
    if (!reason || !isWsReady()) return;

    if (chatMode === 'anon' && roomId) {
      ws.current.send(JSON.stringify({ type: 'report', roomId, reason }));
    } else if (chatMode === 'friends' && activeFriend) {
      ws.current.send(JSON.stringify({ type: 'report', targetUserId: activeFriend.user_id, reason }));
    }

    alert('Raporunuz iletildi.');
  };

  const handleSupportReport = async ({ subject, description, email, mediaFiles = [] }) => {
    const normalizedSubject = normalizeSupportSubject(subject);
    if (!normalizedSubject) {
      const message = 'Gecersiz konu secimi.';
      showToast('TalkX', message, 6500);
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
        showToast('TalkX', 'Bildirimin alindi. Ekip en kisa surede inceleyecek.', 6500);
      } else {
        showToast('TalkX', 'Sorun bildirimi alindi. Tesekkurler.', 6500);
      }
      return { ok: true };
    } catch (error) {
      const message = error?.response?.data?.error || 'Sorun bildirimi gonderilemedi.';
      showToast('TalkX', message, 6500);
      return { ok: false, error: message };
    } finally {
      setSupportSubmitting(false);
    }
  };

  const closeImageViewer = () => {
    if (imageFetchTimeoutRef.current) {
      clearTimeout(imageFetchTimeoutRef.current);
      imageFetchTimeoutRef.current = null;
    }
    setImageViewer(initialImageViewer);
  };

  const handleSendImage = (base64) => {
    if (chatMode !== 'friends' || !activeFriend?.user_id) return;
    const clientMsgId = randomId();
    const queueItem = {
      clientMsgId,
      kind: 'direct_image_send',
      targetUserId: activeFriend.user_id,
      text: 'Fotograf',
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
      text: 'Fotograf',
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
      showToast('TalkX', 'Baglanti yok. Fotograf simdi acilamiyor.', 4500);
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
        return { ...prev, status: 'error', error: 'Zaman asimi. Tekrar deneyin.' };
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
          <button className="admin-toast-close" onClick={() => dismissToast(notice.id)} aria-label="Close">x</button>
          <div className="admin-toast-header">
            <span className="admin-toast-tag">Bildirim</span>
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
  ), [notices, dismissToast]);

  const withToasts = (content) => (
    <>
      {content}
      {toastStack}
    </>
  );

  if (!user) return withToasts(<Auth onLogin={setUser} />);

  if (screen === 'splash') {
    return withToasts(<SplashScreen onFinish={() => setScreen('home')} />);
  }

  if (screen === 'home') {
    const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);
    return withToasts(
      <HomeScreen
        onlineCount={onlineCount}
        unreadCount={totalUnread + (friendRequests.length || 0)}
        onLogout={handleLogout}
        onSupportSubmit={handleSupportReport}
        supportSubmitting={supportSubmitting}
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
        unreadCounts={unreadCounts}
        onBack={() => setScreen('home')}
        onChat={handleStartFriendChat}
        onAccept={handleAcceptRequest}
        onReject={handleRejectRequest}
        onDelete={handleDeleteFriend}
      />
    );
  }

  if (screen === 'matching') {
    return withToasts(
      <MatchScreen
        onCancel={handleLeaveChat}
        onMatchMock={() => undefined}
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

  return withToasts(<div>Unknown State</div>);
}

export default App;
