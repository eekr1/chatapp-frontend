import { useState, useEffect, useRef, useCallback } from 'react';
import './index.css'; // New theme
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

  // Chat Data
  const [messages, setMessages] = useState([]); // Array of message objects
  const [peerName, setPeerName] = useState(null);
  const [isPeerTyping, setIsPeerTyping] = useState(false);
  const [roomId, setRoomId] = useState(null);
  const [chatMode, setChatMode] = useState('anon'); // 'anon' or 'friends'

  // Refs
  const ws = useRef(null);
  const typingTimeoutRef = useRef(null);

  // --- Auth & Init ---
  useEffect(() => {
    checkAuth();
  }, []);

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
          case 'matched':
            setStatus('matched');
            setRoomId(data.roomId);
            setPeerName(data.peerNickname || 'Anonim');
            setMessages([]);
            setScreen('chat');
            setChatMode('anon');
            break;
          case 'message':
            // Anon message
            setMessages(prev => [...prev, { from: 'peer', text: data.text }]);
            setIsPeerTyping(false);
            break;
          case 'direct_message':
            // Friend message
            const senderId = data.fromUserId;
            if (chatMode === 'friends' && activeFriend && activeFriend.user_id === senderId) {
              setMessages(prev => [...prev, { from: 'peer', text: data.text }]);
            }
            // TODO: Show badge if not active
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
        }
      } catch (e) { console.error(e); }
    };

    socket.onclose = () => {
      setStatus('disconnected');
      ws.current = null;
    };

  }, [user, chatMode, activeFriend]);

  useEffect(() => {
    if (user) connect();
    return () => ws.current?.close();
  }, [user, connect]);


  // --- Actions ---
  const handleStartAnon = () => {
    ws.current?.send(JSON.stringify({ type: 'joinQueue' }));
    setScreen('matching');
  };

  const handleStartFriendChat = async (friend) => {
    setActiveFriend(friend);
    setChatMode('friends');
    setPeerName(friend.display_name || friend.username);
    setMessages([]);

    // Load history
    try {
      const hist = await friends.getHistory(friend.user_id);
      const histMsgs = (hist.data.messages || []).map(m => ({
        from: m.sender_id === user.id ? 'me' : 'peer',
        text: m.text
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

  const handleLeaveChat = () => {
    if (chatMode === 'anon') {
      ws.current?.send(JSON.stringify({ type: 'leave' }));
    }
    setScreen('home');
    setMessages([]);
    setRoomId(null);
    setActiveFriend(null);
  };

  const handleSendMessage = (text) => {
    // Optimistic Update
    setMessages(prev => [...prev, { from: 'me', text }]);

    if (chatMode === 'anon' && roomId) {
      ws.current?.send(JSON.stringify({ type: 'message', roomId, text }));
    } else if (chatMode === 'friends' && activeFriend) {
      ws.current?.send(JSON.stringify({
        type: 'direct_message',
        targetUserId: activeFriend.user_id,
        text
      }));
    }
  };

  const handleTyping = () => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      const payload = chatMode === 'friends' && activeFriend
        ? { type: 'typing', targetUserId: activeFriend.user_id }
        : { type: 'typing' }; // Anon usually implies target through Server room knowledge?
      // Actually Server 'typing' handler (Step 53 view) requires 'targetUserId' for friends.
      // For anon, it sends {type:'typing'} without targetId and Server handles room relay?
      // Let's re-verify Step 53 code snippet:
      // if (data.targetUserId) { ... } else { // Anon Typing logic ... }
      // So if I send {type:'typing'}, it hits Anon logic. Correct.

      ws.current.send(JSON.stringify(payload));

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

  // --- Render Flow ---
  if (!user) return <Auth onLogin={setUser} />;

  // 1. Splash
  if (screen === 'splash') {
    return <SplashScreen onFinish={() => setScreen('home')} />;
  }

  // 2. Home
  if (screen === 'home') {
    return (
      <HomeScreen
        onlineCount={onlineCount}
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
        onBack={() => setScreen('home')}
        onChat={handleStartFriendChat}
        onAccept={handleAcceptRequest}
        onReject={handleRejectRequest}
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
        isTyping={isPeerTyping}
        onTyping={handleTyping}
        isFriendMode={chatMode === 'friends'}
        isChatEnded={status === 'ended'}
      />
    );
  }

  return <div>Unknown State</div>;
}

export default App;
