import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import './index.css';
import { auth, profile, friends, push as pushApi } from './api';
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
  showLocalNotification
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

function App() {
  const [screen, setScreen] = useState('splash');

  const [user, setUser] = useState(null);
  const [onlineCount, setOnlineCount] = useState(0);
  const [status, setStatus] = useState('disconnected');

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

  const ws = useRef(null);
  const typingTimeoutRef = useRef(null);
  const lastTypingSentRef = useRef(0);
  const toastTimersRef = useRef(new Map());
  const pushTokenRef = useRef(null);

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

  const showToast = useCallback((title, body, durationMs = 10000) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const safeDuration = Math.max(3000, Math.min(60000, Number(durationMs) || 10000));
    setNotices(prev => [...prev, { id, title: title || 'TalkX', body: body || '' }]);

    const timer = window.setTimeout(() => {
      setNotices(prev => prev.filter(item => item.id !== id));
      toastTimersRef.current.delete(id);
    }, safeDuration);

    toastTimersRef.current.set(id, timer);
  }, []);

  const dismissToast = useCallback((id) => {
    const timer = toastTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      toastTimersRef.current.delete(id);
    }
    setNotices(prev => prev.filter(item => item.id !== id));
  }, []);

  useEffect(() => {
    const timers = toastTimersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
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

  const registerPushToken = useCallback(async (tokenValue) => {
    if (!user || !tokenValue) return;
    if (pushTokenRef.current === tokenValue) return;

    pushTokenRef.current = tokenValue;
    try {
      await pushApi.register({
        token: tokenValue,
        platform: 'android',
        deviceId: DEVICE_ID
      });
      if (IS_DEV) console.log('Push token registered');
    } catch (e) {
      console.warn('Push token register failed:', e?.response?.data || e.message);
    }
  }, [user]);

  const handlePushPayload = useCallback(async (payload = {}, fromPushEvent = false) => {
    const data = payload.data || {};
    const title = payload.title || payload.notification?.title || data.title || 'TalkX';
    const body = payload.body || payload.notification?.body || data.body || '';
    const type = data.type || payload.type;

    if (type === 'admin_notice') {
      const durationMs = Number(data.durationMs || 10000);
      showToast(title, body, durationMs);
      if (fromPushEvent) {
        await showLocalNotification({ title, body, data });
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
          data,
          durationMs: 10000,
          local: true
        });
      }
      return;
    }

    if (fromPushEvent) {
      await showLocalNotification({ title, body, data });
    }
  }, [notifyIncoming, showToast]);

  useEffect(() => {
    if (!user) return;
    let dispose = () => { };

    (async () => {
      dispose = await initNativePush({
        onToken: registerPushToken,
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

  const connect = useCallback(() => {
    if (!user || ws.current?.readyState === WebSocket.OPEN) return;

    const host = window.location.host;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const fallbackUrl = `${protocol}//${host}`;
    const WS_URL = import.meta.env.VITE_WS_URL || (IS_NATIVE ? 'ws://10.0.2.2:3000' : (host.includes('localhost') ? 'ws://localhost:3000' : fallbackUrl));

    const socket = new WebSocket(WS_URL);
    ws.current = socket;

    socket.onopen = () => {
      if (IS_DEV) console.log('WS connected');
      setStatus('idle');
      socket.send(JSON.stringify({
        type: 'hello_ack',
        deviceId: DEVICE_ID,
        token: localStorage.getItem('session_token'),
        platform: IS_NATIVE ? 'android' : 'web'
      }));
    };

    const playSound = () => {
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
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (IS_DEV) console.log('[WS]', data.type, data);

        switch (data.type) {
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
          case 'direct_message': {
            const senderId = data.fromUserId;
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
                  msgType: data.msgType || 'direct'
                },
                local: true
              });
            }

            if (isActiveConversation || !IS_NATIVE) {
              playSound();
            }
            break;
          }
          case 'image_sent':
            setMessages(prev => [...prev, {
              from: 'me',
              text: 'Fotograf',
              msgType: 'image',
              mediaId: data.mediaId
            }]);
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
            const durationMs = Number(data.durationMs || 10000);
            showToast(data.title || 'Duyuru', data.body || '', durationMs);
            break;
          }
          default:
            break;
        }
      } catch (e) {
        console.error(e);
      }
    };

    socket.onclose = () => {
      setStatus('disconnected');
      ws.current = null;
    };
  }, [user, loadFriends, notifyIncoming, showToast]);

  useEffect(() => {
    if (user) connect();
  }, [user, connect]);

  const handleLogout = async () => {
    if (pushTokenRef.current) {
      try {
        await pushApi.unregister({ token: pushTokenRef.current, deviceId: DEVICE_ID });
      } catch (e) {
        if (IS_DEV) console.warn('Push unregister failed:', e?.message || e);
      }
      pushTokenRef.current = null;
    }

    try { await auth.logout(); } catch (e) { console.error('Logout error:', e); }

    try { ws.current?.close(); } catch (e) { if (IS_DEV) console.warn('WS close failed:', e); }
    ws.current = null;

    setUser(null);
    setScreen('splash');
    setStatus('disconnected');
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
        mediaId: m.mediaId,
        mediaExpired: m.mediaExpired
      }));
      setMessages(histMsgs);
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
    setMessages(prev => [...prev, { from: 'me', text }]);

    if (chatMode === 'anon' && roomId) {
      ws.current?.send(JSON.stringify({ type: 'message', roomId, text }));
      return;
    }

    if (chatMode === 'friends' && activeFriend) {
      ws.current?.send(JSON.stringify({
        type: 'direct_message',
        targetUserId: activeFriend.user_id,
        text
      }));
      return;
    }

    if (IS_DEV) console.warn('[App] Message not sent: invalid state', { chatMode, roomId, activeFriend });
  };

  const handleTyping = () => {
    if (ws.current?.readyState !== WebSocket.OPEN) return;

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
    if (!reason || ws.current?.readyState !== WebSocket.OPEN) return;

    if (chatMode === 'anon' && roomId) {
      ws.current.send(JSON.stringify({ type: 'report', roomId, reason }));
    } else if (chatMode === 'friends' && activeFriend) {
      ws.current.send(JSON.stringify({ type: 'report', targetUserId: activeFriend.user_id, reason }));
    }

    alert('Raporunuz iletildi.');
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

    ws.current?.send(JSON.stringify({
      type: 'direct_image_send',
      targetUserId: activeFriend.user_id,
      imageData: base64
    }));
  };

  const handleViewImage = (mediaId) => {
    if (!mediaId) return;

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
        <div key={notice.id} className="admin-toast" role="status" aria-live="polite">
          <button className="admin-toast-close" onClick={() => dismissToast(notice.id)} aria-label="Close">x</button>
          <div className="admin-toast-title">{notice.title}</div>
          <div className="admin-toast-body">{notice.body}</div>
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
