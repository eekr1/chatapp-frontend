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
    onNewMatch, // New prop
    onReport,   // New prop
    peerName,
    isTyping,
    onTyping,
    isFriendMode = false,
    isChatEnded = false, // New prop
    onSendImage, // New
    onViewImage, // New
    onRetryViewImage, // New
    onCloseImage, // New
    imageViewer, // New
    onAddFriend, // New
}) => {
    const [inputValue, setInputValue] = useState("");
    const [randomName] = useState(() => COOL_NAMES[Math.floor(Math.random() * COOL_NAMES.length)]);
    const endRef = useRef(null);

    const displayName = peerName || randomName || "Anonim";

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping, isChatEnded]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!inputValue.trim() || isChatEnded) return;
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
            <div style={{
                position: 'sticky', top: 0, width: '100%', zIndex: 100,
                padding: '10px 15px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                backgroundColor: 'rgba(23, 23, 35, 0.95)', backdropFilter: 'blur(10px)',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
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
                        <span style={{ fontSize: '0.75rem', color: 'var(--success)' }}>
                            {isChatEnded ? '🔴 Sonlandı' : '● Online'}
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                    {!isFriendMode && onAddFriend && (
                        <button onClick={onAddFriend} title="Arkadaş Ekle" style={{
                            background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem'
                        }}>
                            ➕
                        </button>
                    )}
                    <button onClick={onReport} style={{
                        background: 'transparent', color: 'var(--danger)', border: 'none',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', fontSize: '1.5rem'
                    }} title="Raporla">
                        ⚠️
                    </button>
                    <button onClick={onLeave} style={{
                        background: 'rgba(255,56,96,0.1)', color: 'var(--danger)', border: 'none',
                        width: 36, height: 36, borderRadius: '50%', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        ✕
                    </button>
                </div>
            </div>

            {/* Messages Area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '100px 20px 100px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {messages.map((m, i) => (
                    <div key={i} className={m.from === 'me' ? 'chat-bubble-me animate-slide-up' : 'chat-bubble-peer animate-slide-up'}>
                        {m.msgType === 'image' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: '1.5em' }}>📸</span>
                                {m.mediaExpired ? (
                                    <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>Fotoğraf Açıldı</span>
                                ) : (
                                    m.from === 'me' ? (
                                        <span style={{ fontStyle: 'italic', fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)' }}>Fotoğraf gönderildi</span>
                                    ) : (
                                        <button
                                            className="btn-neon-sm"
                                            style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                                            onClick={() => onViewImage && onViewImage(m.mediaId)}
                                        >
                                            Fotoğrafı Görüntüle
                                        </button>
                                    )
                                )}
                            </div>
                        ) : (
                            m.text
                        )}
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

            {/* Chat Ended Overlay */}
            {isChatEnded && (
                <div className="animate-fade-in" style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)',
                    padding: 30, zIndex: 60, borderTop: '1px solid var(--danger)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 15
                }}>
                    <h3 style={{ color: 'var(--danger)', fontSize: '1.2rem' }}>Sohbet Sonlandı</h3>
                    <div style={{ display: 'flex', gap: 15, width: '100%' }}>
                        <button onClick={onLeave} className="btn-neon" style={{ flex: 1, borderColor: 'var(--text-dim)', color: 'var(--text-dim)' }}>
                            Ana Sayfa
                        </button>
                        <button onClick={onNewMatch} className="btn-solid-purple" style={{ flex: 1 }}>
                            Yeni Eşleşme
                        </button>
                    </div>
                </div>
            )}

            {/* Image View Modal */}
            {imageViewer?.open && (
                <div className="animate-fade-in" style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.95)', zIndex: 100,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
                }}>
                    {imageViewer.status === 'ready' && imageViewer.dataUrl && (
                        <img src={imageViewer.dataUrl} style={{ maxWidth: '90%', maxHeight: '80vh', borderRadius: 8, border: '2px solid var(--primary)' }} />
                    )}

                    {imageViewer.status === 'loading' && (
                        <div className="center-flex" style={{ gap: 12, padding: 20 }}>
                            <div className="animate-pulse" style={{
                                width: 18, height: 18, borderRadius: '50%',
                                background: 'var(--primary)', boxShadow: 'var(--glow-cyan)'
                            }} />
                            <p style={{ color: '#fff' }}>Fotoğraf yükleniyor...</p>
                        </div>
                    )}

                    {imageViewer.status === 'error' && (
                        <div className="center-flex" style={{ gap: 12, padding: 20, textAlign: 'center' }}>
                            <p style={{ color: 'var(--danger)', fontWeight: 700 }}>Fotoğraf açılamadı</p>
                            <p style={{ color: '#fff', opacity: 0.85, maxWidth: 320 }}>{imageViewer.error || 'Bilinmeyen hata.'}</p>
                            {imageViewer.mediaId && (
                                <button
                                    onClick={() => onRetryViewImage ? onRetryViewImage(imageViewer.mediaId) : onViewImage?.(imageViewer.mediaId)}
                                    className="btn-neon"
                                    style={{ marginTop: 6 }}
                                >
                                    Tekrar Dene
                                </button>
                            )}
                        </div>
                    )}
                    <p style={{ color: '#fff', marginTop: 20 }}>Bu fotoğraf kapatıldığında silinecektir.</p>
                    <button onClick={() => { if (onCloseImage) onCloseImage(); }}
                        className="btn-solid-purple" style={{ marginTop: 20 }}>
                        Kapat
                    </button>
                </div>
            )}

            {/* Input Area (Hidden if Ended) */}
            {!isChatEnded && (
                <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    padding: 20, background: 'linear-gradient(to top, var(--bg-deep) 40%, transparent)',
                    zIndex: 50
                }}>
                    <GlassCard style={{ padding: 10, borderRadius: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <input
                            type="file"
                            id="imgInput"
                            style={{ display: 'none' }}
                            accept="image/*"
                            onChange={(e) => {
                                const file = e.target.files[0];
                                if (!file) return;
                                if (file.size > 2 * 1024 * 1024) return alert('Dosya boyutu 2MB\'dan küçük olmalı.');

                                const reader = new FileReader();
                                reader.onload = () => {
                                    if (onSendImage) onSendImage(reader.result);
                                };
                                reader.readAsDataURL(file);
                            }}
                        />
                        <button
                            onClick={() => document.getElementById('imgInput').click()}
                            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 8 }}>
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
            )}

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
