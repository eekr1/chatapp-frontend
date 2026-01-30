import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

// Basit UUID üreteci (MVP için)
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Client ID Management
const getClientId = () => {
  let id = localStorage.getItem('anon_client_id');
  if (!id) {
    id = generateUUID();
    localStorage.setItem('anon_client_id', id);
  }
  return id;
};

function App() {
  const [status, setStatus] = useState('disconnected'); // disconnected, connecting, queued, matched
  const [messages, setMessages] = useState([]); // { from: 'me'|'peer', text: string }
  const [inputText, setInputText] = useState('');
  const [error, setError] = useState(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');

  const ws = useRef(null);
  const clientId = useRef(getClientId());
  const messagesEndRef = useRef(null);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const connect = useCallback(() => {
    if (ws.current) return;

    setStatus('connecting');
    const socket = new WebSocket('ws://localhost:3000'); // Env variable later: import.meta.env.VITE_WS_URL
    ws.current = socket;

    socket.onopen = () => {
      console.log('Connected');
      // Bağlandığında hemen bir şey yapmıyoruz, kullanıcı "Start"a basınca joinQueue yapacak.
      // Ancak bizim akışta "Start" -> "Connect & Join" daha mantıklı.
      // Şimdilik connected ise ve status 'connecting' ise joinQueue atmıyoruz, UI'dan bekliyoruz.
      setStatus('idle');
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('Received:', data);

      switch (data.type) {
        case 'queued':
          setStatus('queued');
          setMessages([]);
          setError(null);
          break;
        case 'matched':
          setStatus('matched');
          setMessages([]); // Yeni eşleşme, temiz sayfa (isteğe bağlı, önceki konuşma silinmeli)
          setError(null);
          break;
        case 'message':
          setMessages(prev => [...prev, { from: 'peer', text: data.text }]);
          break;
        case 'ended':
          // Eğer "Next" yaptıysak zaten queued'a geçeceğiz, ama peer left ise buraya düşeriz.
          // veya biz leave yaptık.
          // data.reason kontrol edilebilir.
          if (status !== 'queued') { // Eğer sıraya zaten girmediysek
            setStatus('ended');
            setError(data.reason === 'disconnect' ? 'Partner bağlantısı koptu.' : 'Konuşma sonlandı.');
          }
          break;
        case 'error':
          // Code: BANNED, RATE_LIMIT vs.
          setError(`Hata: ${data.message}`);
          if (data.code === 'BANNED') {
            setStatus('banned');
          }
          break;
        default:
          break;
      }
    };

    socket.onclose = () => {
      console.log('Disconnected');
      setStatus('disconnected');
      ws.current = null;
    };

    socket.onerror = (err) => {
      console.error('WS Error', err);
      setError('Bağlantı hatası.');
      setStatus('disconnected'); // veya error state
    };

  }, [status]);

  // İlk açılışta bağlanmayı deneme (Opsiyonel, kullanıcı Start'a basınca da olabilir)
  useEffect(() => {
    connect();
    return () => {
      ws.current?.close();
    };
  }, []);

  const handleStart = () => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      connect();
      // Connect async olduğu için onopen'i beklemek lazım, ama basitlik adına:
      // Reconnect logic lazım. Şimdilik connect() useEffect'te çağrılıyor.
      // Eğer koptuysa tekrar çağır.
      return;
    }

    ws.current.send(JSON.stringify({ type: 'joinQueue', clientId: clientId.current }));
  };

  const handleNext = () => {
    if (ws.current) {
      ws.current.send(JSON.stringify({ type: 'next' }));
      // Optimistic UI update
      setStatus('queued');
      setMessages([]);
    }
  };

  const handleLeave = () => {
    if (ws.current) {
      ws.current.send(JSON.stringify({ type: 'leave' }));
      setStatus('idle');
    }
  };

  const handleSend = (e) => {
    e.preventDefault();
    if (!inputText.trim() || status !== 'matched') return;

    // Optimistic update
    setMessages(prev => [...prev, { from: 'me', text: inputText }]);

    ws.current.send(JSON.stringify({
      type: 'message',
      roomId: 'ignored_by_client_logic_handled_in_backend', // Backend validate ediyor ama biz state'de tutmuyoruz roomId'yi (gerekirse tutarız)
      // Düzeltme: Backend message eventinde roomId istiyor mu?
      // Backend: `if (roomId !== data.roomId)` kontrolü yapıyor.
      // O zaman roomId'yi matched eventinden alıp saklamalıyız.
      // Hızlı fix: Backend'de roomId check opsiyonel veya client'a roomId saklatmalıyız.
      // Plan'da client roomId saklasın demiştik. O zaman state'e ekleyelim.
      // Şimdilik roomId'yi 'unknown' atarsak backend hata verir.
      // Geri dönüp roomId statini ekleyeyim mi? 
      // Evet, roomId state'e eklenmeli.
      // Kodun akışını bozmadan roomId state ekliyorum.
      text: inputText
    }));
    // Not: Aşağıda roomId'yi state'e ekleyeceğim ve burayı güncelleyeceğim.
    setInputText('');
  };

  // State for Room ID to send correct messages
  const [currentRoomId, setCurrentRoomId] = useState(null);

  // Update onmessage handled above for matched/message
  // I need to intercept the handlers to setRoomId.
  // ... refactoring handleSend logic inside the component render or distinct function?
  // I will restart the implementation of App function cleanly below in the final file content.

  /* ... */
}

export default function AppClean() {
  const [status, setStatus] = useState('disconnected'); // disconnected, connecting, idle, queued, matched, ended, banned
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [error, setError] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [reportResult, setReportResult] = useState(null);

  const ws = useRef(null);
  const clientId = useRef(getClientId());
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return;

    // Environment variable for WS URL (Render/Prod vs Local)
    const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3000';
    const socket = new WebSocket(WS_URL);
    ws.current = socket;

    socket.onopen = () => {
      console.log('WS Connected');
      setStatus('idle');
      setError(null);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('In:', data);

        switch (data.type) {
          case 'queued':
            setStatus('queued');
            setMessages([]);
            setError(null);
            setRoomId(null);
            break;
          case 'matched':
            setStatus('matched');
            setMessages([]);
            setError(null);
            setRoomId(data.roomId);
            break;
          case 'message':
            setMessages(prev => [...prev, { from: 'peer', text: data.text }]);
            break;
          case 'ended':
            if (status === 'queued') return; // Next bastıysak etkilemesin
            setStatus('ended');
            setError(null);
            // setRoomId(null); // Report için roomId lazım olabilir, hemen silmeyelim
            break;
          case 'error':
            // alert(data.message);
            setError(data.message);
            if (data.code === 'BANNED') setStatus('banned');
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
  }, []); // eslint-disable-line

  const handleStart = () => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      connect();
      return;
    }
    ws.current.send(JSON.stringify({ type: 'joinQueue', clientId: clientId.current }));
  };

  const handleNext = () => {
    if (!ws.current) return;
    ws.current.send(JSON.stringify({ type: 'next' }));
    setStatus('queued'); // Optimistic
    setMessages([]);
    setReportResult(null);
  };

  const handleLeave = () => {
    if (!ws.current) return;
    ws.current.send(JSON.stringify({ type: 'leave' }));
    setStatus('idle');
    setReportResult(null);
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
  };

  return (
    <div className="app-container">
      <div className="main-card">
        <header className="header">
          <h1>AnonChat</h1>
          <div className={`status-badge ${status}`}>{status.toUpperCase()}</div>
        </header>

        {(status === 'disconnected' || status === 'banned') && (
          <div className="overlay-screen">
            <h2>{status === 'banned' ? 'Yasaklandınız' : 'Bağlantı Koptu'}</h2>
            {status !== 'banned' && <button onClick={connect}>Tekrar Bağlan</button>}
          </div>
        )}

        <div className="chat-area">
          {messages.length === 0 && status === 'matched' && (
            <div className="info-message">Eşleşildi! Merhaba de.</div>
          )}
          {status === 'queued' && (
            <div className="info-message pulsing">Eşleşme aranıyor...</div>
          )}
          {status === 'idle' && (
            <div className="info-message">Başlamak için Start'a bas.</div>
          )}
          {status === 'ended' && (
            <div className="info-message">Sohbet sonlandı.</div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`message-bubble ${m.from}`}>
              {m.text}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {error && <div className="error-bar">{error}</div>}
        {reportResult && <div className="success-bar">{reportResult}</div>}

        <div className="controls">
          {status === 'matched' ? (
            <form className="input-group" onSubmit={sendMessage}>
              <input
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                placeholder="Bir şeyler yaz..."
                autoFocus
              />
              <button type="submit">Gönder</button>
            </form>
          ) : (
            <div className="action-buttons">
              {(status === 'idle' || status === 'ended') && (
                <button className="btn-primary" onClick={handleStart}>Start</button>
              )}
            </div>
          )}

          <div className="secondary-controls">
            {status === 'matched' && (
              <>
                <button className="btn-secondary" onClick={handleNext}>Next</button>
                <button className="btn-danger" onClick={handleLeave}>Leave</button>
                <button className="btn-warning" onClick={() => handleReport('spam')}>Rapor Et</button>
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
