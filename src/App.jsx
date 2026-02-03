import { useState, useEffect, useRef, useCallback } from 'react';
import './index.css'; // New theme
import { auth, profile, friends } from './api';
import Auth from './components/Auth';

// New Screens
import SplashScreen from './screens/SplashScreen';
import HomeScreen from './screens/HomeScreen';
import MatchScreen from './screens/MatchScreen';
import ChatScreen from './screens/ChatScreen';

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
  // Navigation State: 'splash', 'home', 'matching', 'chat'
  const [screen, setScreen] = useState('splash');

  // App Data
  const [user, setUser] = useState(null);
  const [onlineCount, setOnlineCount] = useState(0);
  const [status, setStatus] = useState('disconnected'); // idle, queued, matched, ended

  // Chat Data
  const [messages, setMessages] = useState([]);
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
      } catch (e) {
        localStorage.removeItem('session_token');
      }
    }
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
            setMessages(prev => [...prev, { from: 'peer', text: data.text }]);
            setIsPeerTyping(false);
            break;
          case 'typing':
            if (data.fromUserId) {
              // Logic for friends typing
              setIsPeerTyping(true);
            } else {
              // Logic for anon typing
              setIsPeerTyping(true);
            }
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

  }, [user]);

  useEffect(() => {
    if (user) connect();
    return () => ws.current?.close();
  }, [user, connect]);


  // --- Actions ---
  const handleStartAnon = () => {
    ws.current?.send(JSON.stringify({ type: 'joinQueue' }));
    setScreen('matching');
  };

  const handleLeaveChat = () => {
    ws.current?.send(JSON.stringify({ type: 'leave' }));
    setScreen('home');
    setMessages([]);
    setRoomId(null);
  };

  const handleSendMessage = (text) => {
    if (chatMode === 'anon' && roomId) {
      ws.current?.send(JSON.stringify({ type: 'message', roomId, text }));
      setMessages(prev => [...prev, { from: 'me', text }]);
    }
    // TODO: Add Friend Chat implementation here reusing the new ChatScreen
  };

  const handleTyping = () => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      // Send typing event
      ws.current.send(JSON.stringify({ type: 'typing' }));
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        ws.current.send(JSON.stringify({ type: 'stop_typing' }));
      }, 1000);
    }
  };

  // --- Render Flow ---
  if (!user) return <Auth onLogin={setUser} />; // We need to style Auth page too later!

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
          else alert('Arkadaş modu bu demoda henüz aktif değil (Sadece UI).');
        }}
      />
    );
  }

  // 3. Match / Queue
  if (screen === 'matching') {
    return (
      <MatchScreen
        onCancel={handleLeaveChat}
        onMatchMock={() => {
          // Dev-only manual trigger if needed
        }}
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
        isTyping={isPeerTyping}
        onTyping={handleTyping}
      />
    );
  }

  return <div>Unknown State</div>;
}

export default App;
