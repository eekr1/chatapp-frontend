import { useState, useEffect, useRef, useCallback } from 'react';
import './index.css'; // New theme
import { POP_SOUND } from './utils/sounds'; // Sound
import { auth, profile, friends } from './api';
import Auth from './components/Auth';

// New Screens
import SplashScreen from './screens/SplashScreen';
import HomeScreen from './screens/HomeScreen';
import MatchScreen from './screens/MatchScreen';
import ChatScreen from './screens/ChatScreen';
import FriendsScreen from './screens/FriendsScreen';

// Legacy Device ID
const getDeviceId = () => {
  let id = localStorage.getItem('anon_device_id');
  if (!id) {
    id = 'dev-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36);
    localStorage.setItem('anon_device_id', id);
  }
  return id;
};
const DEVICE_ID = getDeviceId();

function App() {
  // Navigation State: 'splash', 'home', 'matching', 'chat', 'friends'
  const [screen, setScreen] = useState('splash');

  // App Data
  const [user, setUser] = useState(null);
  const [onlineCount, setOnlineCount] = useState(0);
  const [status, setStatus] = useState('disconnected'); // idle, queued, matched, ended

  // Friend Data
  const [friendList, setFriendList] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [activeFriend, setActiveFriend] = useState(null); // The friend we are chatting with
  const [unreadCounts, setUnreadCounts] = useState({}); // { userId: count }

  // Chat Data
  const [messages, setMessages] = useState([]); // Array of message objects
  const [peerName, setPeerName] = useState(null);
  const [peerUsername, setPeerUsername] = useState(null); // New
  const [peerId, setPeerId] = useState(null); // New
  const [isPeerTyping, setIsPeerTyping] = useState(false);
  const [roomId, setRoomId] = useState(null);
  const [chatMode, setChatMode] = useState('anon'); // 'anon' or 'friends'

  // Refs
  const ws = useRef(null);
  const typingTimeoutRef = useRef(null);
  const lastTypingSentRef = useRef(0);

  // State Refs (for WS closure access)
  const activeFriendRef = useRef(activeFriend);
  const chatModeRef = useRef(chatMode);

  // Sync Refs
  useEffect(() => { activeFriendRef.current = activeFriend; }, [activeFriend]);
  useEffect(() => { chatModeRef.current = chatMode; }, [chatMode]);

  // --- Auth & Init ---
  useEffect(() => {
    checkAuth();
  }, []);

  // Title Notification
  useEffect(() => {
    const total = Object.values(unreadCounts).reduce((a, b) => a + b, 0);
    document.title = total > 0 ? `(${total}) TalkX` : 'TalkX';
  }, [unreadCounts]);

  const checkAuth = async () => {
    const token = localStorage.getItem('session_token');
    if (token) {
      try {
        const res = await profile.getMe();
        setUser(res.data.user);
        loadFriends(); // Load friends on init
      } catch (e) {
        localStorage.removeItem('session_token');
      }
    }
  };

  const loadFriends = async () => {
    try {
      const res = await friends.list();
      setFriendList(res.data.friends || []);
      setFriendRequests(res.data.incoming || []);

      // Initialize Unread Counts from Backend
      const initialUnread = {};
      (res.data.friends || []).forEach(f => {
        if (f.unread_count > 0) initialUnread[f.user_id] = f.unread_count;
      });
      setUnreadCounts(initialUnread);

    } catch (e) { console.error('Friends load error:', e); }
  };

  // --- WebSocket Logic ---
  const connect = useCallback(() => {
    if (!user || ws.current?.readyState === WebSocket.OPEN) return;

    const host = window.location.host;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const fallbackUrl = `${protocol}//${host}`;
    const WS_URL = import.meta.env.VITE_WS_URL || (host.includes('localhost') ? 'ws://localhost:3000' : fallbackUrl);

    const socket = new WebSocket(WS_URL);
    ws.current = socket;

    socket.onopen = () => {
      console.log('WS Connected (Cyberpunk v2)');
      setStatus('idle');
      // Auth Handshake
      socket.send(JSON.stringify({
        type: 'hello_ack',
        deviceId: DEVICE_ID,
        token: localStorage.getItem('session_token')
      }));
    };

    const playSound = () => {
      try {
        const audio = new Audio(POP_SOUND);
        audio.volume = 1.0; // Max volume
        const promise = audio.play();
        if (promise !== undefined) {
          promise.then(() => console.log('Sound played'))
            .catch(e => console.warn('Audio blocked (interaction needed):', e));
        }
      } catch (e) { console.error('Audio error:', e); }
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[WS DEBUG]', data.type, data); // Debug all incoming

        switch (data.type) {
          case 'onlineCount': setOnlineCount(data.count); break;
          case 'queued':
            setStatus('queued');
            setScreen('matching');
            break;
          case 'debug':
            console.log('%c[SERVER DEBUG]', 'color: #ff00ff; font-weight: bold', data.msg, data);
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
            // Anon message
            setMessages(prev => [...prev, { from: 'peer', text: data.text }]);
            setIsPeerTyping(false);
            playSound();
            break;
          case 'direct_message':
            // Friend message
            const senderId = data.fromUserId;
            const currentActive = activeFriendRef.current;
            const currentMode = chatModeRef.current; // Access fresh ref

            if (currentMode === 'friends' && currentActive && currentActive.user_id === senderId) {
              setMessages(prev => [...prev, {
                from: 'peer',
                text: data.text,
                msgType: data.msgType, // Fix: capture image type
                mediaId: data.mediaId  // Fix: capture mediaId
              }]);
            } else {
              // Increment unread count
              setUnreadCounts(prev => ({
                ...prev,
                [senderId]: (prev[senderId] || 0) + 1
              }));
            }
            playSound();
            break;
          case 'image_sent':
            // Sender confirmation (Show 'View Photo' bubble on my side)
            setMessages(prev => [...prev, {
              from: 'me',
              text: '📸 Fotoğraf',
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
            setMessages(prev => [...prev, { from: 'system', text: 'Sohbet sonlandı.' }]);
            setStatus('ended');
            break;
          case 'image_data':
            setCurrentImage(data.imageData);
            // Mark as expired immediately (View Once)
            setMessages(prev => prev.map(m => m.mediaId === data.mediaId ? { ...m, mediaExpired: true } : m));
            break;
          case 'image_error':
            alert(data.message);
            // Mark as expired in UI
            setMessages(prev => prev.map(m => m.mediaId === data.mediaId ? { ...m, mediaExpired: true } : m));
            break;
          case 'friend_refresh':
            loadFriends();
            break;
        }
      } catch (e) { console.error(e); }
    };

    socket.onclose = () => {
      setStatus('disconnected');
      ws.current = null;
    };

  }, [user]); // Removed activeFriend and chatMode dependencies

  useEffect(() => {
    if (user) connect();
    // Do NOT close on unmount of effect unless user matches change, 
    // to keep connection alive during nav
    return () => {
      // Only close if user logs out or we really mean to Kill it. 
      // For now, let's keep it alive. 
      // Actually, React Strict Mode might kill it. 
      // Proper pattern: Check if user changed.
    };
  }, [user, connect]);


  // --- Actions ---
  const handleStartAnon = () => {
    ws.current?.send(JSON.stringify({ type: 'joinQueue' }));
    setScreen('matching');
  };

  const handleStartFriendChat = async (friend) => {
    console.log('Selected friend:', friend);
    setActiveFriend(friend);
    setRoomId(null); // Clear anon room
    setChatMode('friends');
    setPeerName(friend.display_name || friend.username);
    setMessages([]); // Clear previous messages
    setScreen('chat');
    setStatus('matched'); // Ensure status is active so input is shown

    // Clear unread
    setUnreadCounts(prev => {
      const newCounts = { ...prev };
      delete newCounts[friend.user_id];
      return newCounts;
    });

    // Load history
    try {
      const hist = await friends.getHistory(friend.user_id);
      const histMsgs = (hist.data.messages || []).map(m => ({
        from: m.from, // Backend already calculates 'me' or 'peer'
        text: m.text,
        msgType: m.msgType,
        mediaId: m.mediaId
      }));
      setMessages(histMsgs);
    } catch (e) { console.error('History error', e); }

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
    if (!window.confirm('Bu arkadaşı silmek ve engellemek istediğine emin misin?')) return;
    try {
      await friends.delete(friendId);
      loadFriends(); // Refresh list
    } catch (e) { console.error(e); alert('Silinemedi.'); }
  };

  const handleAddFriend = async () => {
    if (!peerUsername) return alert('Kullanıcı adı bilgisi yok.');
    try {
      await friends.request(peerUsername);
      alert('Arkadaşlık isteği gönderildi!');
    } catch (e) {
      alert(e.response?.data?.error || 'İstek gönderilemedi.');
    }
  };

  const handleLeaveChat = () => {
    if (chatMode === 'anon') {
      if (status === 'queued') {
        ws.current?.send(JSON.stringify({ type: 'leaveQueue' })); // Fix: Send explicit leaveQueue
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
    console.log('[App] handleSendMessage:', text, 'Mode:', chatMode);

    // Optimistic Update
    setMessages(prev => [...prev, { from: 'me', text }]);

    if (chatMode === 'anon' && roomId) {
      ws.current?.send(JSON.stringify({ type: 'message', roomId, text }));
    } else if (chatMode === 'friends' && activeFriend) {
      console.log('[App] Sending DM to:', activeFriend.user_id);
      if (!activeFriend.user_id) console.error('[App] activeFriend has no user_id!', activeFriend);

      ws.current?.send(JSON.stringify({
        type: 'direct_message',
        targetUserId: activeFriend.user_id,
        text
      }));
    } else {
      console.warn('[App] Message not sent. State invalid:', { chatMode, roomId, activeFriend });
    }
  };

  const handleTyping = () => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      const now = Date.now();
      // Only send 'typing' if it's been > 2s since last time
      if (now - lastTypingSentRef.current > 2000) {
        const payload = chatMode === 'friends' && activeFriend
          ? { type: 'typing', targetUserId: activeFriend.user_id }
          : { type: 'typing' };

        ws.current.send(JSON.stringify(payload));
        lastTypingSentRef.current = now;
      }

      // Always reset the stop timer on every keystroke
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        const stopPayload = chatMode === 'friends' && activeFriend
          ? { type: 'stop_typing', targetUserId: activeFriend.user_id }
          : { type: 'stop_typing' };
        ws.current.send(JSON.stringify(stopPayload));
      }, 1000);
    }
  };

  const handleReport = () => {
    const reason = prompt("Lütfen rapor sebebini belirtin (spam, hakaret, vb.):");
    if (reason && ws.current?.readyState === WebSocket.OPEN) {
      // Assuming backend supports 'report' type
      if (chatMode === 'anon' && roomId) {
        ws.current.send(JSON.stringify({ type: 'report', roomId, reason }));
      } else if (chatMode === 'friends' && activeFriend) {
        ws.current.send(JSON.stringify({ type: 'report', targetUserId: activeFriend.user_id, reason }));
      }
      alert('Raporunuz iletildi.');
    }
  };

  // Image State
  const [currentImage, setCurrentImage] = useState(null);

  // Sync to window for ChatScreen (Temporary Bridge)
  useEffect(() => { window.viewingImage = currentImage; }, [currentImage]);

  // ... Render Flow ...

  // Image Handlers
  const handleSendImage = (base64) => {
    if (chatMode === 'friends' && activeFriend) {
      ws.current?.send(JSON.stringify({
        type: 'direct_image_send',
        targetUserId: activeFriend.user_id,
        imageData: base64
      }));
      // Optimistic: Add "camera" message? Backend echoes back 'direct_message' with type image.
      // So we wait for echo.
    }
  };

  const handleViewImage = (mediaId) => {
    ws.current?.send(JSON.stringify({ type: 'fetch_image', mediaId }));
  };

  // Update socket.onmessage inside connect()
  // ...
  // See next Replace block for socket update

  // --- Render Flow ---
  if (!user) return <Auth onLogin={setUser} />;

  // 1. Splash
  if (screen === 'splash') {
    return <SplashScreen onFinish={() => setScreen('home')} />;
  }

  // 2. Home
  if (screen === 'home') {
    const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);
    return (
      <HomeScreen
        onlineCount={onlineCount}
        unreadCount={totalUnread + (friendRequests.length || 0)} // Add friend requests to badge
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

  // 5. Friends
  if (screen === 'friends') {
    return (
      <FriendsScreen
        friends={friendList}
        requests={friendRequests}
        unreadCounts={unreadCounts}
        onBack={() => setScreen('home')}
        onChat={handleStartFriendChat}
        onAccept={handleAcceptRequest}
        onReject={handleRejectRequest}
        onDelete={handleDeleteFriend} // New
      />
    );
  }

  // 3. Match / Queue
  if (screen === 'matching') {
    return (
      <MatchScreen
        onCancel={handleLeaveChat}
        onMatchMock={() => { }}
      />
    );
  }

  // 4. Chat
  if (screen === 'chat') {
    return (
      <ChatScreen
        messages={messages}
        currentUserId={user.id}
        peerName={peerName}
        onSend={handleSendMessage}
        onLeave={handleLeaveChat}
        onNewMatch={handleStartAnon}
        onReport={handleReport}
        onAddFriend={handleAddFriend} // New
        peerId={peerId} // New
        isTyping={isPeerTyping}
        onTyping={handleTyping}
        isFriendMode={chatMode === 'friends'}
        isChatEnded={status === 'ended'}
        // Image Logic
        onSendImage={handleSendImage}
        onViewImage={handleViewImage}
        onCloseImage={() => setCurrentImage(null)}
        viewingImage={currentImage} // Pass as prop
      />
    );
  }

  // Inject image into window for Modal (quick fix as ChatScreen manages modal via window/prop)
  // Actually ChatScreen uses window.viewingImage? Let's fix that design.
  // Better: ChatScreen receives the image data via prop.
  // Since ChatScreen logic used `window.viewingImage` in my previous step, I should pass it via check.
  // But wait, I put `window.viewingImage` inside ChatScreen render. 
  // Ideally, App.jsx manages the state `currentImage` and passes it to ChatScreen.
  // The ChatScreen logic I wrote earlier checks `window.viewingImage`. 
  // I should update ChatScreen to use a prop or simpler: App.jsx handles the modal?
  // No, let's just make ChatScreen use the prop.
  // Correction: I wrote `window.viewingImage` in ChatScreen. That was a bad practice placeholder.
  // I will rely on App.jsx setting `window.viewingImage` OR passed prop.
  // Let's stick to state in App.jsx and passing it?
  // Actually, let's keep it simple: App.jsx sets a state `viewingImage`. 
  // And we pass it to ChatScreen as a prop `viewingImageUrl`.
  // I need to update ChatScreen to use the prop instead of window. Noted.
  // For now, let's implement the handlers.

  return <div>Unknown State</div>;
}

export default App;
