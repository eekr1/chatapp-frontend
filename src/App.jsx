import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

// Persistent Device ID
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
  const [status, setStatus] = useState('disconnected');
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [error, setError] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [reportResult, setReportResult] = useState(null);
  const [showBlockOption, setShowBlockOption] = useState(false);

  // V6 Features
  // Username is now fetched from server or set by user
  // Initial state is empty to allow auto-login check
  const [username, setUsername] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [peerUsername, setPeerUsername] = useState('Anonim');
  const [onlineCount, setOnlineCount] = useState(0);

  const ws = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return;

    const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3000';
    const socket = new WebSocket(WS_URL);
    ws.current = socket;

    socket.onopen = () => {
      console.log('WS Connected');
      setStatus('connecting'); // Connecting state
      setError(null);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type !== 'onlineCount') console.log('In:', data);

        switch (data.type) {
          case 'hello':
            socket.send(JSON.stringify({ type: 'hello_ack', deviceId: DEVICE_ID }));
            break;
          case 'welcome':
            // V6: Auto Login
            setUsername(data.nickname);
            setIsJoined(true);
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
            setReportResult(null);
            setShowBlockOption(false);
            break;
          case 'matched':
            setStatus('matched');
            setMessages([]);
            setError(null);
            setRoomId(data.roomId);
            setPeerUsername(data.peerNickname || 'Anonim'); // V6
            setReportResult(null);
            setShowBlockOption(false);
            break;
          case 'message':
            setMessages(prev => [...prev, { from: 'peer', text: data.text }]);
            break;
          case 'ended':
            if (status === 'queued') return;
            setStatus('ended');
            setError(null);
            if (data.reason === 'blocked') {
              setError('Sohbet engelleme nedeniyle sonlandırıldı.');
            }
            break;
          case 'error':
            setError(data.message);
            if (data.code === 'BANNED') {
              setStatus('banned');
              ws.current?.close();
            }
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
  }, [status]);

  useEffect(() => {
    connect();
    return () => ws.current?.close();
  }, []);

  // V6: Register Nickname
  const handleSetNickname = (e) => {
    e.preventDefault();
    if (!username.trim() || !ws.current) return;

    ws.current.send(JSON.stringify({ type: 'setNickname', nickname: username }));
  };

  const handleStart = () => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      connect();
      return;
    }
    ws.current.send(JSON.stringify({ type: 'joinQueue' }));
  };

  const handleNext = () => {
    if (!ws.current) return;
    ws.current.send(JSON.stringify({ type: 'next' }));
    setStatus('queued');
    setMessages([]);
    setReportResult(null);
    setShowBlockOption(false);
  };

  const handleLeave = () => {
    if (!ws.current) return;
    ws.current.send(JSON.stringify({ type: 'leave' }));
    setStatus('idle');
    setReportResult(null);
    setShowBlockOption(false);
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!inputText.trim() || !roomId) return;

    ws.current.send(JSON.stringify({
      type: 'message',
      roomId: roomId,
      text: inputText
    }));
    setMessages(prev => [...prev, { from: 'me', text: inputText }]);
    setInputText('');
  };

  const handleReport = (reason) => {
    if (!ws.current || !roomId) return;
    ws.current.send(JSON.stringify({
      type: 'report',
      roomId,
      reason
    }));
    setReportResult('Rapor iletildi.');
    setShowBlockOption(true);
  };

  const handleBlock = () => {
    if (!ws.current || !roomId) return;
    ws.current.send(JSON.stringify({
      type: 'block',
      roomId
    }));
    setReportResult('Kullanıcı engellendi.');
    setShowBlockOption(false);
  };

  // LOGIN SCREEN (Only if not joined)
  if (!isJoined) {
    return (
      <div className="login-container">
        <div className="login-card">
          <h1>AnonChat</h1>
          <p className="subtitle">Rastgele İnsanlarla, Anonim Olarak Sohbet Et.</p>
          {onlineCount > 0 && <div className="online-badge-login">Canlı: {onlineCount} Kişi</div>}

          <form onSubmit={handleSetNickname}>
            {status === 'connecting' ? (
              <p>Bağlanıyor...</p>
            ) : (
              <>
                <input
                  type="text"
                  placeholder="Rumuzunuz (örn: Gezgin, Kedi...)"
                  maxLength={15}
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoFocus
                />
                <button type="submit" disabled={!username.trim()}>Giriş Yap</button>
                {error && <div className="error-text">{error}</div>}
              </>
            )}
          </form>
        </div>
      </div>
    );
  }

  // MAIN CHAT SCREEN
  return (
    <div className="app-container">
      <div className="main-card">
        <header className="header">
          <div className="header-info">
            <h1>AnonChat</h1>
            <span className="online-count">{onlineCount} online</span>
          </div>
          <div className={`status-badge ${status}`}>
            {status === 'matched' ? peerUsername : status.toUpperCase()}
          </div>
        </header>

        {(status === 'disconnected' || status === 'banned') && (
          <div className="overlay-screen">
            <h2>{status === 'banned' ? 'Yasaklandınız' : 'Bağlantı Koptu'}</h2>
            <div className="error-message">{error}</div>
            {status !== 'banned' && <button onClick={connect}>Tekrar Bağlan</button>}
          </div>
        )}

        <div className="chat-area">
          {messages.length === 0 && status === 'matched' && (
            <div className="info-message">
              <strong>{peerUsername}</strong> ile eşleştin!<br />Merhaba de 👋
            </div>
          )}
          {status === 'queued' && (
            <div className="info-message pulsing">Kullanıcı aranıyor...</div>
          )}
          {status === 'idle' && (
            <div className="info-message">
              Merhaba <strong>{username}</strong>!<br />Sohbete başlamak için butona bas.
            </div>
          )}
          {status === 'ended' && (
            <div className="info-message">
              Sohbet sonlandı.
              {error && <div className="error-text-small">{error}</div>}
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`message-bubble ${m.from}`}>
              {m.text}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {error && status !== 'banned' && status !== 'ended' && <div className="error-bar">{error}</div>}

        {reportResult && (
          <div className="success-bar">
            {reportResult}
            {showBlockOption && (
              <button className="btn-xs-block" onClick={handleBlock}>
                ⛔ Engelle
              </button>
            )}
          </div>
        )}

        <div className="controls">
          {status === 'matched' ? (
            <form className="input-group" onSubmit={sendMessage}>
              <input
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                placeholder="Mesaj yaz..."
                autoFocus
              />
              <button type="submit" className="send-btn">
                <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
              </button>
            </form>
          ) : (
            <div className="action-buttons">
              {(status === 'idle' || status === 'ended') && (
                <button className="btn-primary start-btn" onClick={handleStart}>Eşleşmeye Başla</button>
              )}
            </div>
          )}

          <div className="secondary-controls">
            {status === 'matched' && (
              <>
                <button className="btn-secondary" onClick={handleNext}>Sonraki</button>
                <button className="btn-danger" onClick={handleLeave}>Ayrıl</button>
                <button className="btn-ghost" onClick={() => handleReport('spam')} title="Rapor Et">⚠️</button>
              </>
            )}
            {status === 'queued' && (
              <button className="btn-danger" onClick={handleLeave}>İptal</button>
            )}
            {status === 'ended' && (
              <button className="btn-secondary" onClick={handleNext}>Yeni Kişi Bul</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
