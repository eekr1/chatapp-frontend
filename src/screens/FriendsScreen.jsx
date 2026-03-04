import React, { useState } from 'react';
import GlassCard from '../components/GlassCard';

const BackIcon = () => (
    <svg className="friends-back-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14.5 5L8 11.5L14.5 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const InboxIcon = () => (
    <svg className="friends-inline-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-11Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M4 12h5l1.6 2h2.8L15 12h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const TrashIcon = () => (
    <svg className="friends-inline-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 7h14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        <path d="M9 7V5.8A1.8 1.8 0 0 1 10.8 4h2.4A1.8 1.8 0 0 1 15 5.8V7" fill="none" stroke="currentColor" strokeWidth="1.9" />
        <path d="M7.6 7l.7 10a2 2 0 0 0 2 1.8h3.4a2 2 0 0 0 2-1.8l.7-10" fill="none" stroke="currentColor" strokeWidth="1.9" />
    </svg>
);

const BlockIcon = () => (
    <svg className="friends-inline-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 5.8A2.8 2.8 0 0 1 9.8 3h4.4A2.8 2.8 0 0 1 17 5.8V8h.9A2.1 2.1 0 0 1 20 10.1v8.8A2.1 2.1 0 0 1 17.9 21H6.1A2.1 2.1 0 0 1 4 18.9v-8.8A2.1 2.1 0 0 1 6.1 8H7V5.8Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M7 8h10" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 16h8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
);

const CheckIcon = () => (
    <svg className="friends-inline-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5.5 12.5L10.2 17L18.5 8.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const CloseIcon = () => (
    <svg className="friends-inline-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
);

const getAvatarInitial = (name) => {
    const normalized = String(name || '').trim();
    if (!normalized) return '?';
    const chars = Array.from(normalized);
    return (chars[0] || '?').toLocaleUpperCase('tr-TR');
};

const FriendsScreen = ({
    friends,
    requests,
    blockedUsers = [],
    onBack,
    onChat,
    onAccept,
    onReject,
    onDelete,
    onBlock,
    onUnblock,
    unreadCounts = {}
}) => {
    const [tab, setTab] = useState('list');

    return (
        <div className="screen-container animate-fade-in" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
                <button onClick={onBack} className="friends-back-btn" aria-label="Geri">
                    <BackIcon />
                </button>
                <h2 style={{ fontSize: '1.5rem', color: 'var(--accent)' }}>ARKADAŞLAR</h2>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
                <button
                    className={tab === 'list' ? 'btn-solid-purple' : 'btn-neon'}
                    style={tab !== 'list' ? { borderColor: 'var(--text-dim)', color: 'var(--text-dim)' } : {}}
                    onClick={() => setTab('list')}
                >
                    Arkadaşlarım
                </button>
                <button
                    className={tab === 'requests' ? 'btn-solid-purple' : 'btn-neon'}
                    style={tab !== 'requests' ? { borderColor: 'var(--text-dim)', color: 'var(--text-dim)' } : {}}
                    onClick={() => setTab('requests')}
                >
                    İstekler {requests.length > 0 && <span className="friends-tab-badge">{requests.length}</span>}
                </button>
                <button
                    className={tab === 'blocked' ? 'btn-solid-purple' : 'btn-neon'}
                    style={tab !== 'blocked' ? { borderColor: 'var(--text-dim)', color: 'var(--text-dim)' } : {}}
                    onClick={() => setTab('blocked')}
                >
                    Engellenenler {blockedUsers.length > 0 && <span className="friends-tab-badge">{blockedUsers.length}</span>}
                </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 15, flex: 1, overflowY: 'auto' }}>
                {tab === 'list' && (
                    friends.length === 0 ? (
                        <div className="center-flex" style={{ flex: 1, color: 'var(--text-dim)', opacity: 0.6 }}>
                            <p>Henüz arkadaşın yok.</p>
                            <p style={{ fontSize: '0.9rem' }}>Anonim sohbetlerden ekleyebilirsin.</p>
                        </div>
                    ) : (
                        friends.map((f) => {
                            const count = unreadCounts[f.user_id] || 0;
                            const name = f.display_name || f.username;
                            return (
                                <GlassCard
                                    key={f.user_id}
                                    className="animate-slide-up"
                                    style={{ padding: 15, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 15, minWidth: 0 }}>
                                        <div className="friends-avatar">
                                            <span className="friends-avatar-initial">{getAvatarInitial(name)}</span>
                                            {count > 0 && <span className="friends-avatar-badge">{count}</span>}
                                            {f.is_online && <span className="friends-avatar-online" title="Çevrimiçi" />}
                                        </div>
                                        <div style={{ minWidth: 0 }}>
                                            <h4 style={{ color: 'white', fontSize: '1.1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {name}
                                            </h4>
                                            <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>@{f.username}</span>
                                        </div>
                                    </div>

                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                                        <button onClick={() => onChat(f)} className="btn-neon" style={{ padding: '8px 16px', fontSize: '0.9rem' }}>
                                            MESAJ
                                        </button>
                                        <button
                                            onClick={() => onBlock?.(f.user_id)}
                                            className="friends-block-btn"
                                            title="Kullanıcıyı engelle"
                                            aria-label="Kullanıcıyı engelle"
                                        >
                                            <BlockIcon />
                                        </button>
                                        <button
                                            onClick={() => onDelete(f.user_id)}
                                            className="friends-delete-btn"
                                            title="Arkadaşı sil"
                                            aria-label="Arkadaşı sil"
                                        >
                                            <TrashIcon />
                                        </button>
                                    </div>
                                </GlassCard>
                            );
                        })
                    )
                )}

                {tab === 'requests' && (
                    requests.length === 0 ? (
                        <div className="center-flex" style={{ flex: 1, color: 'var(--text-dim)', opacity: 0.6 }}>
                            <p>Bekleyen istek yok.</p>
                        </div>
                    ) : (
                        requests.map((r) => (
                            <GlassCard key={r.user_id} className="animate-slide-up" style={{ padding: 15, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                                    <span className="friends-request-icon"><InboxIcon /></span>
                                    <h4 style={{ color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>@{r.username}</h4>
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button onClick={() => onAccept(r.user_id)} className="friends-request-btn is-accept" aria-label="İsteği kabul et">
                                        <CheckIcon />
                                    </button>
                                    <button onClick={() => onReject(r.user_id)} className="friends-request-btn is-reject" aria-label="İsteği reddet">
                                        <CloseIcon />
                                    </button>
                                </div>
                            </GlassCard>
                        ))
                    )
                )}

                {tab === 'blocked' && (
                    blockedUsers.length === 0 ? (
                        <div className="center-flex" style={{ flex: 1, color: 'var(--text-dim)', opacity: 0.6 }}>
                            <p>Engellenen kullanıcı yok.</p>
                        </div>
                    ) : (
                        blockedUsers.map((blocked) => {
                            const name = blocked.display_name || blocked.username;
                            return (
                                <GlassCard
                                    key={blocked.user_id}
                                    className="animate-slide-up"
                                    style={{ padding: 15, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 15, minWidth: 0 }}>
                                        <div className="friends-avatar">
                                            <span className="friends-avatar-initial">{getAvatarInitial(name)}</span>
                                        </div>
                                        <div style={{ minWidth: 0 }}>
                                            <h4 style={{ color: 'white', fontSize: '1.02rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {name}
                                            </h4>
                                            <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>@{blocked.username}</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => onUnblock?.(blocked.user_id)}
                                        className="friends-unblock-btn"
                                        title="Engeli kaldır"
                                        aria-label="Engeli kaldır"
                                    >
                                        Engeli Kaldır
                                    </button>
                                </GlassCard>
                            );
                        })
                    )
                )}
            </div>
        </div>
    );
};

export default FriendsScreen;
