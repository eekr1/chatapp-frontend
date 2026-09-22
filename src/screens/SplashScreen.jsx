import React, { useEffect } from 'react';
import { useI18n } from '../i18n';

const SplashScreen = ({ onFinish }) => {
    const { t } = useI18n();
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
                letterSpacing: '1.5px',
                fontSize: '0.9rem',
                textAlign: 'center',
                maxWidth: 320,
                padding: '0 16px',
                opacity: 0.9
            }} className="animate-slide-up">
                {t('splash.subtitle')}
            </p>

            {/* Abstract Neon Circle Spinner */}
            <div style={{
                marginTop: 30,
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
