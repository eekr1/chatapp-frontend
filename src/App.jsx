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

  // V7: Interactivity
  const [isPeerTyping, setIsPeerTyping] = useState(false);
  const typingTimeoutRef = useRef(null);

  // V8: Ephemeral Images
  const [viewingImage, setViewingImage] = useState(null);
  const fileInputRef = useRef(null);

  // V11: Report UI
  const [showReportModal, setShowReportModal] = useState(false);

  const playNotification = () => {
    try {
      const audio = new Audio('https://codeskulptor-demos.commondatastorage.googleapis.com/pang/pop.mp3');
      audio.volume = 0.5;
      audio.play().catch(e => console.log('Audio play error', e));
    } catch (e) { }
  };

  // Check Auth on Mount
  useEffect(() => {
    checkAuth();
    const interval = setInterval(checkIncomingRequests, 10000); // 10s poll
    return () => clearInterval(interval);
  }, []);

  const getAvatarUrl = (seed) => {
    return `https://robohash.org/${encodeURIComponent(seed || 'anon')}.png?set=set4&size=100x100`;
  };

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
            setPeerRealUsername(data.peerUsername || '');
            setIsPeerTyping(false);
            break;
          case 'message':
            playNotification();
            setMessages(prev => [...prev, { from: 'peer', text: data.text }]);
            setIsPeerTyping(false);
            break;
          case 'typing':
            setIsPeerTyping(true);
            break;
          case 'stop_typing':
            setIsPeerTyping(false);
            break;

          case 'image_sent':
            setMessages(prev => [...prev, { from: 'me', msgType: 'image_sent_ack', text: '📸 Fotoğraf gönderildi.' }]);
            break;

          case 'image_data':
            setViewingImage(data.imageData);
            setMessages(prev => prev.map(m => m.mediaId === data.mediaId ? { ...m, opened: true } : m));
            break;

          case 'image_error':
            alert(data.message);
            setMessages(prev => prev.map(m => m.mediaId === data.mediaId ? { ...m, opened: true } : m));
            break;

          case 'ended':
            if (status === 'queued') return;
            setStatus('ended');
            setIsPeerTyping(false);
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

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Compression
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX = 800;
        if (width > MAX || height > MAX) {
          if (width > height) { height *= MAX / width; width = MAX; }
          else { width *= MAX / height; height = MAX; }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

        if (ws.current?.readyState === WebSocket.OPEN && roomId) {
          ws.current.send(JSON.stringify({
            type: 'image_send',
            roomId,
            imageData: dataUrl
          }));
        }
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const requestImage = (mediaId) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'fetch_image', mediaId }));
    }
  };

  const handleReportSubmit = (reason) => {
    if (ws.current?.readyState === WebSocket.OPEN && roomId) {
      ws.current.send(JSON.stringify({ type: 'report', roomId, reason }));
      alert('Raporunuz alındı. Teşekkürler.');
      setShowReportModal(false);
    }
  };

  const handleIceBreaker = () => {
    if (ws.current?.readyState !== WebSocket.OPEN || !roomId) return;

    const breakers = [
      "🎲 Zar attım: " + (Math.floor(Math.random() * 6) + 1),
      "💡 Konu: En sevdiğin film hangisi?",
      "💡 Konu: Bir süper gücün olsa ne olurdu?",
      "💡 Konu: Issız bir adaya düşsen yanına alacağın 3 şey?",
      "💡 Konu: Çocukken ne olmak isterdin?",
      "❓ Soru: En son ne zaman kahkaha attın?",
      "🗿 Taş Kağıt Makas: " + ['Taş', 'Kağıt', 'Makas'][Math.floor(Math.random() * 3)]
    ];

    const text = breakers[Math.floor(Math.random() * breakers.length)];
    ws.current.send(JSON.stringify({ type: 'message', roomId, text }));
    setMessages(prev => [...prev, { from: 'me', text }]);
  };

  const handleInputChange = (e) => {
    setInputText(e.target.value);

    if (ws.current?.readyState === WebSocket.OPEN && roomId) {
      ws.current.send(JSON.stringify({ type: 'typing' }));

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

      typingTimeoutRef.current = setTimeout(() => {
        ws.current.send(JSON.stringify({ type: 'stop_typing' }));
      }, 1000);
    }
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
          <div className="header-info" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src={getAvatarUrl(user.username)} alt="Me" style={{ width: 36, height: 36, borderRadius: '50%', background: '#334155', border: '2px solid #3B82F6' }} />
            <div>
              <h1 style={{ lineHeight: 1 }}>TalkX</h1>
              <span className="online-count" style={{ marginTop: 2 }}>{onlineCount} online</span>
            </div>
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
        {viewingImage && (
          <div className="modal-overlay" onClick={() => setViewingImage(null)}>
            <div className="modal-content" style={{ maxWidth: '90%', maxHeight: '90%', padding: '20px', background: 'rgba(0,0,0,0.8)', border: '1px solid #333' }} onClick={e => e.stopPropagation()}>
              <img src={viewingImage} alt="View Once" style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 12, display: 'block', margin: 'auto' }} />
              <p style={{ textAlign: 'center', color: '#fff', marginTop: 15 }}>Bu fotoğraf kapatıldığında silinecektir.</p>
              <button className="btn-danger" onClick={() => setViewingImage(null)} style={{ marginTop: 15, width: '100%' }}>Kapat</button>
            </div>
          </div>
        )}
        {showReportModal && (
          <div className="modal-overlay" onClick={() => setShowReportModal(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <h3 style={{ marginBottom: 10 }}>Kullanıcıyı Raporla</h3>
              <p style={{ marginBottom: 15, color: 'var(--text-dim)' }}>Lütfen bir sebep seçin:</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button className="btn-secondary" style={{ textAlign: 'left', padding: 15 }} onClick={() => handleReportSubmit('threat')}>😡 Tehdit / Hakaret / Cinsel</button>
                <button className="btn-secondary" style={{ textAlign: 'left', padding: 15 }} onClick={() => handleReportSubmit('spam')}>🤖 Spam / Reklam</button>
                <button className="btn-secondary" style={{ textAlign: 'left', padding: 15 }} onClick={() => handleReportSubmit('other')}>🤔 Diğer</button>
              </div>
              <button className="btn-ghost" style={{ marginTop: 15 }} onClick={() => setShowReportModal(false)}>İptal</button>
            </div>
          </div>
        )}

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
              <img src={getAvatarUrl(peerRealUsername || peerUsername)} alt="Peer" style={{ width: 96, height: 96, borderRadius: '50%', marginBottom: 15, background: '#1e293b', border: '4px solid #3B82F6' }} />
              <div style={{ fontSize: '1.2rem', marginBottom: 5 }}><strong>{peerUsername}</strong> ile eşleştin!</div>
              <div style={{ opacity: 0.7 }}>Selam ver 👋</div>
            </div>
          )}
          {status === 'ended' && <div className="info-message">Sohbet sonlandı.</div>}
          {status === 'disconnected' && <div className="info-message error-text">Bağlantı koptu.</div>}

          {/* Messages */}
          {messages.map((m, i) => (
            <div key={i} className={`message-bubble ${m.from} ${m.msgType === 'image_sent_ack' ? 'success-bar' : ''}`}>
              {m.msgType === 'image' ? (
                <div style={{ textAlign: 'center', minWidth: 150 }}>
                  <div style={{ marginBottom: 5, fontSize: '0.85rem', opacity: 0.8 }}>🔒 Tek Seferlik Fotoğraf</div>
                  <button
                    className="btn-primary"
                    style={{ width: '100%', fontSize: '0.9rem', padding: '8px', background: m.opened ? '#475569' : 'var(--primary)' }}
                    onClick={() => requestImage(m.mediaId)}
                    disabled={m.opened}
                  >
                    {m.opened ? 'Açıldı (Silindi)' : '📸 Görüntüle'}
                  </button>
                </div>
              ) : (m.text)}
            </div>
          ))}
          {isPeerTyping && (
            <div className="message-bubble peer typing-indicator">
              <span className="dot">.</span><span className="dot">.</span><span className="dot">.</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Controls */}
        <div className="controls">
          {status === 'matched' ? (
            <>
              <form className="input-group" onSubmit={sendMessage}>
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={handleFileSelect}
                />
                <button type="button" className="btn-ghost" title="Fotoğraf" onClick={() => fileInputRef.current?.click()}>📷</button>
                <button type="button" className="btn-ghost" title="Buz Kırıcı / Eğlence" onClick={handleIceBreaker}>🎲</button>
                <input value={inputText} onChange={handleInputChange} placeholder="Mesaj..." autoFocus />
                <button type="submit" className="send-btn">➤</button>
              </form>
              <div className="secondary-controls">
                <button type="button" className="btn-ghost" title="Raporla" style={{ flex: 0, color: '#EF4444' }} onClick={() => setShowReportModal(true)}>⚠️</button>
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
