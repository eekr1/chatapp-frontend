import React, { useEffect, useRef, useState } from 'react';
import GlassCard from '../components/GlassCard';
import {
    pickImageFromCamera,
    pickImageFromGallery
} from '../utils/nativeBridge';
import { useI18n } from '../i18n';

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
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const getAvatarInitial = (name) => {
    const normalized = String(name || '').trim();
    if (!normalized) return '?';
    const chars = Array.from(normalized);
    return (chars[0] || '?').toLocaleUpperCase();
};

const dataUrlToBytes = (dataUrl) => {
    if (typeof dataUrl !== 'string') return 0;
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx < 0) return 0;
    const b64 = dataUrl.slice(commaIdx + 1);
    const padding = b64.endsWith('==') ? 2 : (b64.endsWith('=') ? 1 : 0);
    return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
};

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => reject(new Error('FILE_READ_FAILED'));
    reader.readAsDataURL(file);
});

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
    const { t } = useI18n();
    const [inputValue, setInputValue] = useState('');
    const [mediaMenuOpen, setMediaMenuOpen] = useState(false);
    const [imageError, setImageError] = useState('');
    const [randomName] = useState(() => COOL_NAMES[Math.floor(Math.random() * COOL_NAMES.length)]);
    const endRef = useRef(null);
    const cameraInputRef = useRef(null);
    const galleryInputRef = useRef(null);
    const mediaMenuRef = useRef(null);

    const displayName = peerName || randomName || t('chat.anonymous');
    const avatarInitial = getAvatarInitial(displayName);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping, isChatEnded]);

    useEffect(() => {
        if (!mediaMenuOpen) return undefined;
        const onPointerDown = (event) => {
            if (mediaMenuRef.current?.contains(event.target)) return;
            setMediaMenuOpen(false);
        };

        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, [mediaMenuOpen]);

    useEffect(() => {
        if (!isFriendMode || isChatEnded) {
            setMediaMenuOpen(false);
            setImageError('');
        }
    }, [isFriendMode, isChatEnded]);

    const handleSubmit = (e) => {
        if (e?.preventDefault) e.preventDefault();
        if (!inputValue.trim() || isChatEnded) return;
        onSend(inputValue);
        setInputValue('');
        setMediaMenuOpen(false);
    };

    const handleInput = (e) => {
        setInputValue(e.target.value);
        if (onTyping) onTyping();
    };

    const submitImageDataUrl = (dataUrl, explicitBytes = null) => {
        if (!onSendImage || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
            setImageError(t('chat.invalidImage'));
            return;
        }

        const sizeBytes = explicitBytes ?? dataUrlToBytes(dataUrl);
        if (sizeBytes > MAX_IMAGE_BYTES) {
            setImageError(t('chat.imageTooLarge'));
            return;
        }

        setImageError('');
        onSendImage(dataUrl);
    };

    const handleNativeSelection = async (mode) => {
        setMediaMenuOpen(false);
        setImageError('');

        const nativeDataUrl = mode === 'camera'
            ? await pickImageFromCamera()
            : await pickImageFromGallery();

        if (nativeDataUrl) {
            submitImageDataUrl(nativeDataUrl);
            return;
        }

        if (mode === 'camera') cameraInputRef.current?.click();
        else galleryInputRef.current?.click();
    };

    const handleFileSelection = async (event) => {
        const file = event.target.files && event.target.files[0];
        event.target.value = '';
        if (!file) return;

        if (file.size > MAX_IMAGE_BYTES) {
            setImageError(t('chat.imageTooLarge'));
            return;
        }

        try {
            const dataUrl = await readFileAsDataUrl(file);
            submitImageDataUrl(dataUrl, file.size);
        } catch (e) {
            setImageError(e?.message === 'FILE_READ_FAILED' ? t('chat.fileReadFailed') : (e?.message || t('chat.fileReadFailed')));
        }
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
                    <div className="chat-peer-avatar">
                        <span className="chat-peer-avatar-initial">{avatarInitial}</span>
                    </div>
                    <div>
                        <h3 style={{ fontSize: '1rem', color: isFriendMode ? 'var(--accent)' : 'var(--primary)' }}>{displayName}</h3>
                        <span style={{ fontSize: '0.75rem', color: 'var(--success)' }}>
                            {isChatEnded ? t('chat.ended') : t('common.online')}
                        </span>
                    </div>
                </div>

                <div className="chat-header-actions">
                    {!isFriendMode && onAddFriend && (
                        <button onClick={onAddFriend} title={t('chat.addFriend')} className="chat-add-friend-btn">
                            {t('chat.addFriend')}
                        </button>
                    )}
                    <button onClick={onReport} title={t('chat.report')} className="chat-report-btn">
                        !
                    </button>
                    <button onClick={onLeave} className="chat-leave-btn">
                        {t('chat.leave')}
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
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {m.msgType === 'image' ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {m.mediaExpired ? (
                                        <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>{t('chat.photoOpened')}</span>
                                    ) : (
                                        m.from === 'me' ? (
                                            <span style={{ fontStyle: 'italic', fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)' }}>{t('chat.photoSent')}</span>
                                        ) : (
                                            <button className="btn-neon-sm" style={{ padding: '4px 12px', fontSize: '0.8rem' }} onClick={() => onViewImage && onViewImage(m.mediaId)}>
                                                {t('chat.viewPhoto')}
                                            </button>
                                        )
                                    )}
                                </div>
                            ) : (
                                m.text
                            )}
                            {m.from === 'me' && m.sendState === 'pending' && (
                                <span style={{ fontSize: '0.72rem', opacity: 0.75 }}>{t('chat.sending')}</span>
                            )}
                            {m.from === 'me' && m.sendState === 'failed' && (
                                <span style={{ fontSize: '0.72rem', color: 'var(--danger)' }}>{t('chat.sendFailed')}</span>
                            )}
                        </div>
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
                    <h3 style={{ color: 'var(--danger)', fontSize: '1.2rem' }}>{t('chat.chatEndedTitle')}</h3>
                    <div style={{ display: 'flex', gap: 15, width: '100%' }}>
                        <button onClick={onLeave} className="btn-neon" style={{ flex: 1, borderColor: 'var(--text-dim)', color: 'var(--text-dim)' }}>
                            {isFriendMode ? t('chat.backToFriends') : t('chat.backToHome')}
                        </button>
                        <button onClick={onNewMatch} className="btn-solid-purple" style={{ flex: 1 }}>
                            {t('chat.newMatch')}
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
                            <p style={{ color: '#fff' }}>{t('chat.photoLoading')}</p>
                        </div>
                    )}

                    {imageViewer.status === 'error' && (
                        <div className="center-flex" style={{ gap: 12, padding: 20, textAlign: 'center' }}>
                            <p style={{ color: 'var(--danger)', fontWeight: 700 }}>{t('chat.photoOpenFailed')}</p>
                            <p style={{ color: '#fff', opacity: 0.85, maxWidth: 320 }}>{imageViewer.error || t('chat.unknownError')}</p>
                            {imageViewer.mediaId && (
                                <button onClick={() => onRetryViewImage ? onRetryViewImage(imageViewer.mediaId) : onViewImage?.(imageViewer.mediaId)} className="btn-neon" style={{ marginTop: 6 }}>
                                    {t('chat.retry')}
                                </button>
                            )}
                        </div>
                    )}

                    <p style={{ color: '#fff', marginTop: 20 }}>{t('chat.photoWillDelete')}</p>
                    <button onClick={() => { if (onCloseImage) onCloseImage(); }} className="btn-solid-purple" style={{ marginTop: 20 }}>
                        {t('common.close')}
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
                            <div ref={mediaMenuRef} className="chat-media-menu-wrap">
                                {mediaMenuOpen && (
                                    <div className="chat-media-menu">
                                        <button type="button" className="chat-media-menu-item" onClick={() => handleNativeSelection('camera')}>
                                            {t('chat.camera')}
                                        </button>
                                        <button type="button" className="chat-media-menu-item" onClick={() => handleNativeSelection('gallery')}>
                                            {t('chat.gallery')}
                                        </button>
                                    </div>
                                )}
                                <input
                                    ref={cameraInputRef}
                                    type="file"
                                    style={{ display: 'none' }}
                                    accept="image/*"
                                    capture="environment"
                                    onChange={handleFileSelection}
                                />
                                <input
                                    ref={galleryInputRef}
                                    type="file"
                                    style={{ display: 'none' }}
                                    accept="image/*"
                                    onChange={handleFileSelection}
                                />
                                <button
                                    type="button"
                                    className="chat-camera-btn"
                                    onClick={() => setMediaMenuOpen((prev) => !prev)}
                                    aria-label={t('chat.mediaSelect')}
                                >
                                    <CameraIcon />
                                </button>
                            </div>
                        )}

                        <form style={{ flex: 1, display: 'flex' }} onSubmit={handleSubmit}>
                            <input
                                className="input-glass"
                                style={{ flex: 1, border: 'none', padding: '10px 0', background: 'transparent' }}
                                placeholder={t('chat.writeMessage')}
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
                    {imageError && <div className="chat-image-error">{imageError}</div>}
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
