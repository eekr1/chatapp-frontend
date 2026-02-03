import React from 'react';
import GlassCard from '../components/GlassCard';

/* Simple Icons as SVGs to avoid dependency hell */
const MaskIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary)', filter: 'drop-shadow(0 0 8px var(--primary))' }}>
        <path d="M2 12a5 5 0 0 0 5 5 8 8 0 0 1 5 2 8 8 0 0 1 5-2 5 5 0 0 0 5-5V7h-5a9.02 9.02 0 0 0-10 0H2v5Z" />
        <path d="M12 7a5 5 0 0 0-5-5H2" />
        <path d="M12 7a5 5 0 0 1 5-5h5" />
    </svg>
);

const FriendsIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent-2)', filter: 'drop-shadow(0 0 8px var(--accent-2))' }}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
);

const HomeScreen = ({ onSelectMode, onlineCount }) => {
    return (
        <div className="screen-container animate-fade-in" style={{ justifyContent: 'space-between' }}>

            {/* Header */}
            <header style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: 10
            }}>
                <h2 className="logo-text" style={{ fontSize: '1.5rem' }}>TALK X</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, background: 'var(--success)', borderRadius: '50%', boxShadow: '0 0 5px var(--success)' }}></span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontFamily: 'var(--font-display)' }}>
                        {onlineCount} Online
                    </span>
                </div>
            </header>

            {/* Main Selection Area */}
            <main className="center-flex" style={{ flex: 1, gap: 40 }}>

                {/* Anonim Module */}
                <div className="center-flex"
                    style={{ gap: 15, cursor: 'pointer', transition: 'transform 0.2s', width: '100%' }}
                    onClick={() => onSelectMode('anon')}
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                    <GlassCard className="center-flex" style={{
                        width: 180,
                        height: 180,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, rgba(0,240,255,0.05), rgba(0,240,255,0.15))',
                        border: '2px solid rgba(0,240,255,0.3)',
                        boxShadow: '0 0 30px rgba(0,240,255,0.15)'
                    }}>
                        <MaskIcon />
                    </GlassCard>
                    <h3 style={{ fontSize: '1.2rem', color: 'var(--primary)', letterSpacing: 1 }}>ANONİM</h3>
                </div>

                {/* Divider */}
                <div style={{ width: 50, height: 1, background: 'var(--glass-border)' }}></div>

                {/* Friends Module */}
                <div className="center-flex"
                    style={{ gap: 15, cursor: 'pointer', transition: 'transform 0.2s', width: '100%' }}
                    onClick={() => onSelectMode('friends')}
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                    <GlassCard className="center-flex" style={{
                        width: 180,
                        height: 180,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, rgba(168,85,247,0.05), rgba(168,85,247,0.15))',
                        border: '2px solid rgba(168,85,247,0.3)',
                        boxShadow: '0 0 30px rgba(168,85,247,0.15)'
                    }}>
                        <FriendsIcon />
                    </GlassCard>
                    <h3 style={{ fontSize: '1.2rem', color: 'var(--accent)', letterSpacing: 1 }}>ARKADAŞLAR</h3>
                </div>

            </main>

            {/* Footer */}
            <footer className="center-flex" style={{ paddingBottom: 20 }}>
                <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', opacity: 0.6 }}>Kimliğini gizle, özgürce konuş.</p>
            </footer>

        </div>
    );
};

export default HomeScreen;
