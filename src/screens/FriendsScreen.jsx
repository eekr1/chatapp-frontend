import React, { useState } from 'react';
import GlassCard from '../components/GlassCard';

const FriendsScreen = ({ friends, requests, onBack, onChat, onAccept, onReject }) => {
    const [tab, setTab] = useState('list'); // 'list' or 'requests'

    return (
        <div className="screen-container animate-fade-in" style={{ padding: 20 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
                <button onClick={onBack} className="btn-ghost" style={{ fontSize: '1.5rem', marginRight: 10 }}>←</button>
                <h2 style={{ fontSize: '1.5rem', color: 'var(--accent)' }}>ARKADAŞLAR</h2>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
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
                    İstekler {requests.length > 0 && <span style={{ background: 'var(--danger)', color: 'white', padding: '2px 6px', borderRadius: '50%', fontSize: '0.8rem', marginLeft: 5 }}>{requests.length}</span>}
                </button>
            </div>

            {/* Content */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 15, flex: 1, overflowY: 'auto' }}>

                {tab === 'list' && (
                    friends.length === 0 ? (
                        <div className="center-flex" style={{ flex: 1, color: 'var(--text-dim)', opacity: 0.6 }}>
                            <p>Henüz arkadaşın yok.</p>
                            <p style={{ fontSize: '0.9rem' }}>Anonim sohbetlerden ekleyebilirsin.</p>
                        </div>
                    ) : (
                        friends.map(f => (
                            <GlassCard key={f.user_id} className="animate-slide-up" style={{ padding: 15, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
                                    <div style={{ width: 50, height: 50, borderRadius: '50%', background: 'var(--bg-dark)', border: '2px solid var(--accent)', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '1.5rem' }}>
                                        👤
                                    </div>
                                    <div>
                                        <h4 style={{ color: 'white', fontSize: '1.1rem' }}>{f.display_name || f.username}</h4>
                                        <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>@{f.username}</span>
                                    </div>
                                </div>
                                <button onClick={() => onChat(f)} className="btn-neon" style={{ padding: '8px 16px', fontSize: '0.9rem' }}>
                                    MESAJ
                                </button>
                            </GlassCard>
                        ))
                    )
                )}

                {tab === 'requests' && (
                    requests.length === 0 ? (
                        <div className="center-flex" style={{ flex: 1, color: 'var(--text-dim)', opacity: 0.6 }}>
                            <p>Bekleyen istek yok.</p>
                        </div>
                    ) : (
                        requests.map(r => (
                            <GlassCard key={r.id} className="animate-slide-up" style={{ padding: 15, display: 'flex', alignRequests: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span style={{ fontSize: '1.2rem' }}>📩</span>
                                    <div>
                                        <h4 style={{ color: 'white' }}>@{r.sender_username}</h4>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button onClick={() => onAccept(r.id)} style={{ background: 'var(--success)', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: 'black' }}>✓</button>
                                    <button onClick={() => onReject(r.id)} style={{ background: 'var(--danger)', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: 'white' }}>✕</button>
                                </div>
                            </GlassCard>
                        ))
                    )
                )}

            </div>
        </div>
    );
};

export default FriendsScreen;
