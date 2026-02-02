import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import { auth, profile, friends } from './api';
import Auth from './components/Auth';
import Profile from './components/Profile';
import Friends from './components/Friends';

// Persistent Device ID (Legacy support or device tracking)
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
  // UI State
  const [view, setView] = useState('chat'); // chat, profile, friends
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showFriendsModal, setShowFriendsModal] = useState(false);

  // Auth State
  const [user, setUser] = useState(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  // Chat State
  const [status, setStatus] = useState('disconnected');
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [error, setError] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [reportResult, setReportResult] = useState(null);
  const [showBlockOption, setShowBlockOption] = useState(false);
  const [peerUsername, setPeerUsername] = useState('Anonim');
  const [peerRealUsername, setPeerRealUsername] = useState(''); // Unique username
  const [onlineCount, setOnlineCount] = useState(0);

  const ws = useRef(null);
  const messagesEndRef = useRef(null);

  const [incomingCount, setIncomingCount] = useState(0);

  // Check Auth on Mount
  useEffect(() => {
    checkAuth();
    const interval = setInterval(checkIncomingRequests, 10000); // 10s poll
    return () => clearInterval(interval);
  }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem('session_token');
    if (token) {
      try {
        const res = await profile.getMe();
        setUser(res.data.user);
        checkIncomingRequests(); // Initial check
      } catch (e) {
        console.error("Auth check failed", e);
        localStorage.removeItem('session_token');
      }
    }
    setIsAuthChecking(false);
  };

  const checkIncomingRequests = async () => {
    if (!localStorage.getItem('session_token')) return;
    try {
      const res = await friends.list();
      setIncomingCount(res.data.incoming.length);
    } catch (e) { /* ignore */ }
  };

  // WebSocket Logic
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const connect = useCallback(() => {
    if (!user) return; // Only connect if logged in

    if (ws.current?.readyState === WebSocket.OPEN) return;

    const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3000';
    const socket = new WebSocket(WS_URL);
    ws.current = socket;

    socket.onopen = () => {
      console.log('WS Connected');
      setStatus('connecting');
      setError(null);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        switch (data.type) {
          case 'hello':
            // Send handshake with Device ID (Legacy) AND Auth Token?
            // The backend 'hello_ack' logic currently uses Device ID to get user. 
            // BUT we changed backend to use explicit Auth API.
            // Wait, the backend WebSocket `hello_ack` handler still uses `getOrCreateUser(deviceId)`.
            // WE NEED TO UPDATE BACKEND WEBSOCKET TO AUTHENTICATE VIA TOKEN.
            // Or we can rely on dev id mapping if we are lazy, but we want proper auth.
            // For now, let's stick to what backend expects: `hello_ack` with `deviceId`.
            // The backend should recognize the user by device_id if we LINKED it during login?
            // Step 57 `auth.js` Login API:
            // `INSERT INTO sessions (..., device_id, ...)`
            // But `getOrCreateUser` in `index.js` uses `users_anon` table logic?
            // Wait. The backend might have mixed logic now.
            // Re-checking backend `index.js`...
            // It uses `users_anon`.
            // I did NOT update `index.js` to use `users` table for WebSocket auth!
            // This is a gap.
            // Ideally, I should send the TOKEN in `hello_ack` or URI.

            // For this step ("Frontend update"), I will modify client to send token.
            // I WILL NEED TO FIX BACKEND LATER IF IT DOESN'T SUPPORT IT.
            // But wait, the backend `index.js` logic was:
            // `const dbUser = await getOrCreateUser(deviceId, ip);`
            // I need to update Backend to support Token Auth in WS.
            // For now, I will send `token` in `hello_ack` and I will have to patch backend to read it.
            socket.send(JSON.stringify({
              type: 'hello_ack',
              deviceId: DEVICE_ID,
              token: localStorage.getItem('session_token') // Sending token
            }));
            break;
          case 'welcome':
            setStatus('idle');
            break;
          case 'need_nickname':
            // Should not happen if we are logged in with a proper user
            setStatus('idle');
            break;
          case 'onlineCount':
            setOnlineCount(data.count);
            break;
          case 'queued':
            setStatus('queued');
            setMessages([]);
            setError(null);
            setRoomId(null);
            setPeerUsername('...');
            break;
          case 'matched':
            setStatus('matched');
            setMessages([]); // Clear previous chat
            setRoomId(data.roomId);
            setPeerUsername(data.peerNickname || 'Anonim');
            setPeerRealUsername(data.peerUsername || ''); // New: Store unique username
            break;
          case 'message':
            setMessages(prev => [...prev, { from: 'peer', text: data.text }]);
            break;
          case 'ended':
            if (status === 'queued') return;
            setStatus('ended');
            // if (data.reason === 'blocked') setError('Engellendi.');
            break;
          case 'error':
            if (data.code === 'AUTH_ERROR') {
              // Token invalid
              localStorage.removeItem('session_token');
              setUser(null);
            }
            setError(data.message);
            break;
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
  }, [user, status]); // Re-connect if user changes

  useEffect(() => {
    if (user) {
      connect();
    } else {
      ws.current?.close();
    }
  }, [user, connect]);

  const handleLogout = async () => {
    try {
      await auth.logout();
    } catch (e) { /* ignore */ }
    localStorage.removeItem('session_token');
    setUser(null);
    ws.current?.close();
  };

  const handleStart = () => {
    ws.current?.send(JSON.stringify({ type: 'joinQueue' }));
  };

  const handleStartChat = (targetUsername) => {
    ws.current?.send(JSON.stringify({ type: 'joinDirect', targetUsername }));
    setShowFriendsModal(false); // Close modal
    // Note: If successful, we will get 'matched' event.
    // Error cases (not friend, offline) are handled in 'error' event or silently for now,
    // let's assume global error handler catches them. 
  };

  const handleAddFriend = async () => {
    if (!peerRealUsername) return;
    try {
      await friends.request(peerRealUsername);
      setReportResult(`İstek gönderildi: @${peerRealUsername}`);
    } catch (e) {
      setReportResult('Hata: ' + (e.response?.data?.error || 'Bilinmiyor'));
    }
    setTimeout(() => setReportResult(null), 3000);
  };

  const handleNext = () => {
    ws.current?.send(JSON.stringify({ type: 'next' }));
  };

  const handleLeave = () => {
    ws.current?.send(JSON.stringify({ type: 'leave' }));
    setStatus('idle');
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!inputText.trim() || !roomId) return;
    ws.current.send(JSON.stringify({ type: 'message', roomId, text: inputText }));
    setMessages(prev => [...prev, { from: 'me', text: inputText }]);
    setInputText('');
  };

  if (isAuthChecking) return <div className="app-container">Yükleniyor...</div>;

  if (!user) {
    return <Auth onLogin={setUser} />;
  }

  return (
    <div className="app-container">
      <div className="main-card">
        {/* Header */}
        <header className="header">
          <div className="header-info">
            <h1>AnonChat v2</h1>
            <span className="online-count">{onlineCount} online</span>
          </div>

          <div className="header-actions" style={{ display: 'flex', gap: '10px' }}>
            <button className="btn-ghost" onClick={() => setShowProfileModal(true)} title="Profil">👤</button>
            <button className="btn-ghost" onClick={() => setShowFriendsModal(true)} title="Arkadaşlar" style={{ position: 'relative' }}>
              👥
              {incomingCount > 0 && <span className="badge">{incomingCount}</span>}
            </button>
            <button className="btn-ghost" onClick={handleLogout} title="Çıkış">🚪</button>
          </div>
        </header>

        {/* Modals */}
        {showProfileModal && <Profile onClose={() => setShowProfileModal(false)} />}
        {showFriendsModal && <Friends onClose={() => setShowFriendsModal(false)} onStartChat={handleStartChat} />}

        {/* Chat Area */}
        <div className="chat-area">
          {/* Status Messages */}
          {status === 'idle' && (
            <div className="info-message">
              Merhaba <strong>{user.display_name || user.username}</strong>!<br />
              Sohbet aramaya başla.
            </div>
          )}
          {status === 'queued' && <div className="info-message pulsing">Kullanıcı aranıyor...</div>}
          {status === 'matched' && messages.length === 0 && (
            <div className="info-message">
              <strong>{peerUsername}</strong> ile eşleştin!<br />Selam ver 👋
            </div>
          )}
          {status === 'ended' && <div className="info-message">Sohbet sonlandı.</div>}
          {status === 'disconnected' && <div className="info-message error-text">Bağlantı koptu.</div>}

          {/* Messages */}
          {messages.map((m, i) => (
            <div key={i} className={`message-bubble ${m.from}`}>
              {m.text}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Controls */}
        <div className="controls">
          {status === 'matched' ? (
            <>
              <form className="input-group" onSubmit={sendMessage}>
                <input value={inputText} onChange={e => setInputText(e.target.value)} placeholder="Mesaj..." autoFocus />
                <button type="submit" className="send-btn">➤</button>
              </form>
              <div className="secondary-controls">
                {peerRealUsername && (
                  <button className="btn-secondary" onClick={handleAddFriend} title="Arkadaş Ekle">➕</button>
                )}
                <button className="btn-secondary" onClick={handleNext}>Sonraki</button>
                <button className="btn-danger" onClick={handleLeave}>Ayrıl</button>
              </div>
            </>
          ) : (
            <div className="action-buttons">
              {(status === 'idle' || status === 'ended') && (
                <button className="btn-primary start-btn" onClick={handleStart}>
                  {status === 'ended' ? 'Yeni Kişi Bul' : 'Eşleşmeye Başla'}
                </button>
              )}
              {status === 'queued' && (
                <button className="btn-danger" onClick={handleLeave}>İptal</button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
