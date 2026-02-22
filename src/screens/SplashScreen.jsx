import React, { useEffect } from 'react';

const SplashScreen = ({ onFinish }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onFinish();
        }, 2500);
        return () => clearTimeout(timer);
    }, [onFinish]);

    return (
        <div className="screen-container center-flex" style={{ height: '100vh', gap: '20px' }}>
            <div className="animate-pulse brand-hero-wrap">
                <img
                    src="/brand/talkx-logo-full-1024.png"
                    alt="TalkX"
                    className="brand-hero-logo"
                />
            </div>
            <p style={{
                color: 'var(--text-dim)',
                letterSpacing: '4px',
                fontSize: '0.9rem',
                textTransform: 'uppercase',
                opacity: 0.8
            }} className="animate-slide-up">
                Cyber Connect
            </p>

            {/* Abstract Neon Circle Spinner */}
            <div style={{
                marginTop: 50,
                width: 50,
                height: 50,
                borderRadius: '50%',
                border: '3px solid transparent',
                borderTopColor: 'var(--primary)',
                borderRightColor: 'var(--accent)',
                animation: 'spin 1s linear infinite'
            }} />
            <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
        </div>
    );
};

export default SplashScreen;
