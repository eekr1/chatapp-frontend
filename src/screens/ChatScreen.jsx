import React, { useEffect, useRef, useState } from 'react';
import GlassCard from '../components/GlassCard';

const SendIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="22" y1="2" x2="11" y2="13"></line>
        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
    </svg>
);

const CameraIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
        <circle cx="12" cy="13" r="4"></circle>
    </svg>
);

const COOL_NAMES = ['ShadowFox', 'NeonWraith', 'VoidRaven', 'EclipseOwl', 'CyberWolf', 'GhostDrifter'];

const ChatScreen = ({
    messages,
    onSend,
    onLeave,
    onNewMatch,
    onReport,
    peerName,
    isTyping,
    onTyping,
    isFriendMode = false,
    isChatEnded = false,
    onSendImage,
    onViewImage,
    onRetryViewImage,
    onCloseImage,
    imageViewer,
    onAddFriend,
}) => {
    const [inputValue, setInputValue] = useState('');
    const [randomName] = useState(() => COOL_NAMES[Math.floor(Math.random() * COOL_NAMES.length)]);
    const endRef = useRef(null);
    const fileInputRef = useRef(null);

    const displayName = peerName || randomName || 'Anonim';

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping, isChatEnded]);

    const handleSubmit = (e) => {
        if (e?.preventDefault) e.preventDefault();
        if (!inputValue.trim() || isChatEnded) return;
        onSend(inputValue);
        setInputValue('');
    };

    const handleInput = (e) => {
        setInputValue(e.target.value);
        if (onTyping) onTyping();
    };

    return (
        <div className="screen-container" style={{ padding: 0 }}>
            <div style={{
                position: 'sticky',
                top: 0,
                width: '100%',
                zIndex: 100,
                padding: 'calc(var(--safe-top) + 10px) 15px 10px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: 'rgba(23, 23, 35, 0.95)',
                backdropFilter: 'blur(10px)',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                        width: 44,
                        height: 44,
                        borderRadius: '50%',
                        background: 'var(--bg-dark)',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        border: '2px solid var(--primary)',
                        boxShadow: '0 0 10px rgba(0,240,255,0.3)'
                    }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>BOT</span>
                    </div>
                    <div>
                        <h3 style={{ fontSize: '1rem', color: isFriendMode ? 'var(--accent)' : 'var(--primary)' }}>{displayName}</h3>
                        <span style={{ fontSize: '0.75rem', color: 'var(--success)' }}>
                            {isChatEnded ? 'Sonlandi' : 'Online'}
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                    {!isFriendMode && onAddFriend && (
                        <button onClick={onAddFriend} title="Arkadas Ekle" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>
                            +
                        </button>
                    )}
                    <button onClick={onReport} title="Raporla" style={{
                        background: 'transparent',
                        color: 'var(--danger)',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        fontSize: '1.2rem'
                    }}>
                        !
                    </button>
                    <button onClick={onLeave} style={{
                        background: 'rgba(255,56,96,0.1)',
                        color: 'var(--danger)',
                        border: 'none',
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        x
                    </button>
                </div>
            </div>

            <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: 'calc(var(--safe-top) + 72px) 20px calc(var(--safe-bottom) + var(--keyboard-offset, 0px) + 110px) 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12
            }}>
                {messages.map((m, i) => (
                    <div key={i} className={m.from === 'me' ? 'chat-bubble-me animate-slide-up' : 'chat-bubble-peer animate-slide-up'}>
                        {m.msgType === 'image' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                {m.mediaExpired ? (
                                    <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>Fotograf acildi</span>
                                ) : (
                                    m.from === 'me' ? (
                                        <span style={{ fontStyle: 'italic', fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)' }}>Fotograf gonderildi</span>
                                    ) : (
                                        <button className="btn-neon-sm" style={{ padding: '4px 12px', fontSize: '0.8rem' }} onClick={() => onViewImage && onViewImage(m.mediaId)}>
                                            Fotografi Goruntule
                                        </button>
                                    )
                                )}
                            </div>
                        ) : (
                            m.text
                        )}
                    </div>
                ))}

                {isTyping && (
                    <div className="chat-bubble-peer animate-fade-in" style={{ width: 60, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4, padding: 12 }}>
                        <span className="dot">.</span><span className="dot">.</span><span className="dot">.</span>
                    </div>
                )}

                <div ref={endRef}></div>
            </div>

            {isChatEnded && (
                <div className="animate-fade-in" style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background: 'rgba(0,0,0,0.85)',
                    backdropFilter: 'blur(10px)',
                    padding: 30,
                    zIndex: 60,
                    borderTop: '1px solid var(--danger)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 15
                }}>
                    <h3 style={{ color: 'var(--danger)', fontSize: '1.2rem' }}>Sohbet Sonlandi</h3>
                    <div style={{ display: 'flex', gap: 15, width: '100%' }}>
                        <button onClick={onLeave} className="btn-neon" style={{ flex: 1, borderColor: 'var(--text-dim)', color: 'var(--text-dim)' }}>
                            Ana Sayfa
                        </button>
                        <button onClick={onNewMatch} className="btn-solid-purple" style={{ flex: 1 }}>
                            Yeni Eslesme
                        </button>
                    </div>
                </div>
            )}

            {imageViewer?.open && (
                <div className="animate-fade-in" style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.95)',
                    zIndex: 100,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    {imageViewer.status === 'ready' && imageViewer.dataUrl && (
                        <img src={imageViewer.dataUrl} style={{ maxWidth: '90%', maxHeight: '80vh', borderRadius: 8, border: '2px solid var(--primary)' }} />
                    )}

                    {imageViewer.status === 'loading' && (
                        <div className="center-flex" style={{ gap: 12, padding: 20 }}>
                            <div className="animate-pulse" style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--primary)', boxShadow: 'var(--glow-cyan)' }} />
                            <p style={{ color: '#fff' }}>Fotograf yukleniyor...</p>
                        </div>
                    )}

                    {imageViewer.status === 'error' && (
                        <div className="center-flex" style={{ gap: 12, padding: 20, textAlign: 'center' }}>
                            <p style={{ color: 'var(--danger)', fontWeight: 700 }}>Fotograf acilamadi</p>
                            <p style={{ color: '#fff', opacity: 0.85, maxWidth: 320 }}>{imageViewer.error || 'Bilinmeyen hata.'}</p>
                            {imageViewer.mediaId && (
                                <button onClick={() => onRetryViewImage ? onRetryViewImage(imageViewer.mediaId) : onViewImage?.(imageViewer.mediaId)} className="btn-neon" style={{ marginTop: 6 }}>
                                    Tekrar Dene
                                </button>
                            )}
                        </div>
                    )}

                    <p style={{ color: '#fff', marginTop: 20 }}>Bu fotograf kapatildiginda silinecektir.</p>
                    <button onClick={() => { if (onCloseImage) onCloseImage(); }} className="btn-solid-purple" style={{ marginTop: 20 }}>
                        Kapat
                    </button>
                </div>
            )}

            {!isChatEnded && (
                <div style={{
                    position: 'fixed',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    padding: '12px 16px calc(var(--safe-bottom) + var(--keyboard-offset, 0px) + 12px)',
                    background: 'linear-gradient(to top, var(--bg-deep) 40%, transparent)',
                    zIndex: 50
                }}>
                    <GlassCard style={{ padding: 10, borderRadius: 24, display: 'flex', alignItems: 'center', gap: 10, maxWidth: 980, margin: '0 auto' }}>
                        {isFriendMode && (
                            <>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    style={{ display: 'none' }}
                                    accept="image/*"
                                    onChange={(e) => {
                                        const file = e.target.files && e.target.files[0];
                                        if (!file) return;
                                        if (file.size > 2 * 1024 * 1024) return alert('Dosya boyutu 2MB dan kucuk olmali.');

                                        const reader = new FileReader();
                                        reader.onload = () => {
                                            if (onSendImage) onSendImage(reader.result);
                                        };
                                        reader.readAsDataURL(file);
                                        e.target.value = '';
                                    }}
                                />
                                <button onClick={() => fileInputRef.current?.click()} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 8 }}>
                                    <CameraIcon />
                                </button>
                            </>
                        )}

                        <form style={{ flex: 1, display: 'flex' }} onSubmit={handleSubmit}>
                            <input
                                className="input-glass"
                                style={{ flex: 1, border: 'none', padding: '10px 0', background: 'transparent' }}
                                placeholder="Bir seyler yaz..."
                                value={inputValue}
                                onChange={handleInput}
                            />
                        </form>

                        <button
                            onClick={handleSubmit}
                            style={{
                                background: 'var(--primary)',
                                border: 'none',
                                borderRadius: '50%',
                                width: 44,
                                height: 44,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#000',
                                cursor: 'pointer',
                                boxShadow: 'var(--glow-cyan)',
                                transition: 'transform 0.2s'
                            }}
                            onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.9)'; }}
                            onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                        >
                            <SendIcon />
                        </button>
                    </GlassCard>
                </div>
            )}

            <style>{`
                .dot {
                    width: 4px;
                    height: 4px;
                    background: var(--text-dim);
                    border-radius: 50%;
                    animation: bounce 1.4s infinite ease-in-out both;
                }
                .dot:nth-child(1) { animation-delay: -0.32s; }
                .dot:nth-child(2) { animation-delay: -0.16s; }
            `}</style>
        </div>
    );
};

export default ChatScreen;
