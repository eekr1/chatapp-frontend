import React, { useEffect, useRef, useState } from 'react';
import GlassCard from '../components/GlassCard';

/* Icons */
const SendIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
);
const CameraIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
);
const MoreIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
);

/* Names */
const COOL_NAMES = ["ShadowFox", "NeonWraith", "VoidRaven", "EclipseOwl", "CyberWolf", "GhostDrifter"];

const ChatScreen = ({
    messages,
    onSend,
    onLeave,
    peerName,
    isTyping,
    onTyping,
    // Friend specific props
    isFriendMode = false
}) => {
    const [inputValue, setInputValue] = useState("");
    const [randomName, setRandomName] = useState("");
    const endRef = useRef(null);

    // Assign random cool name if not provided
    useEffect(() => {
        if (!peerName) {
            setRandomName(COOL_NAMES[Math.floor(Math.random() * COOL_NAMES.length)]);
        }
    }, [peerName]);

    const displayName = peerName || randomName || "Anonim";

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!inputValue.trim()) return;
        onSend(inputValue);
        setInputValue("");
    };

    const handleInput = (e) => {
        setInputValue(e.target.value);
        if (onTyping) onTyping();
    };

    return (
        <div className="screen-container" style={{ padding: 0 }}>

            {/* Header */}
            <GlassCard style={{
                position: 'absolute', top: 20, left: 20, right: 20,
                padding: '15px 20px', zIndex: 50, borderRadius: 16,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {/* Avatar */}
                    <div style={{
                        width: 44, height: 44, borderRadius: '50%', background: 'var(--bg-dark)',
                        display: 'flex', justifyContent: 'center', alignItems: 'center',
                        border: '2px solid var(--primary)', boxShadow: '0 0 10px rgba(0,240,255,0.3)'
                    }}>
                        <span style={{ fontSize: '1.2rem' }}>🤖</span>
                    </div>
                    <div>
                        <h3 style={{ fontSize: '1rem', color: isFriendMode ? 'var(--accent)' : 'var(--primary)' }}>{displayName}</h3>
                        <span style={{ fontSize: '0.75rem', color: 'var(--success)' }}>● Online</span>
                    </div>
                </div>

                <button onClick={onLeave} style={{
                    background: 'rgba(255,56,96,0.1)', color: 'var(--danger)', border: 'none',
                    width: 36, height: 36, borderRadius: '50%', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    ✕
                </button>
            </GlassCard>

            {/* Messages Area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '100px 20px 100px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {messages.map((m, i) => (
                    <div key={i} className={m.from === 'me' ? 'chat-bubble-me animate-slide-up' : 'chat-bubble-peer animate-slide-up'}>
                        {m.text}
                        {m.opened !== undefined && <span style={{ display: 'block', fontSize: '0.7em', opacity: 0.6, marginTop: 4 }}>{m.opened ? 'Görüldü' : '"Aç"a bas'}</span>}
                    </div>
                ))}
                {isTyping && (
                    <div className="chat-bubble-peer animate-fade-in" style={{ width: 60, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4, padding: 12 }}>
                        <span className="dot">.</span><span className="dot">.</span><span className="dot">.</span>
                    </div>
                )}
                <div ref={endRef}></div>
            </div>

            {/* Input Area */}
            <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                padding: 20, background: 'linear-gradient(to top, var(--bg-deep) 40%, transparent)',
                zIndex: 50
            }}>
                <GlassCard style={{ padding: 10, borderRadius: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 8 }}>
                        <CameraIcon />
                    </button>

                    <form style={{ flex: 1, display: 'flex' }} onSubmit={handleSubmit}>
                        <input
                            className="input-glass"
                            style={{ flex: 1, border: 'none', padding: '10px 0', background: 'transparent' }}
                            placeholder="Bir şeyler yaz..."
                            value={inputValue}
                            onChange={handleInput}
                        />
                    </form>

                    <button
                        onClick={handleSubmit}
                        style={{
                            background: 'var(--primary)', border: 'none', borderRadius: '50%',
                            width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#000', cursor: 'pointer', boxShadow: 'var(--glow-cyan)',
                            transition: 'transform 0.2s'
                        }}
                        onMouseDown={e => e.currentTarget.style.transform = 'scale(0.9)'}
                        onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                    >
                        <SendIcon />
                    </button>
                </GlassCard>
            </div>

            {/* Typing animation dots styles if not global */}
            <style>{`
        .dot { width: 4px; height: 4px; background: var(--text-dim); border-radius: 50%; animation: bounce 1.4s infinite ease-in-out both; }
        .dot:nth-child(1) { animation-delay: -0.32s; }
        .dot:nth-child(2) { animation-delay: -0.16s; }
      `}</style>
        </div>
    );
};

export default ChatScreen;
