import React, { useEffect, useMemo, useState } from 'react';
import GlassCard from '../components/GlassCard';
import { useI18n } from '../i18n';

const MatchScreen = ({ status, offer, onAccept, onReject, onCancel }) => {
    const { t } = useI18n();
    const [questionIndex, setQuestionIndex] = useState(0);
    const [nowMs, setNowMs] = useState(Date.now());

    const isOffer = Boolean(offer && typeof offer === 'object');
    const isAccepted = Boolean(offer?.accepted) || status === 'match_waiting';
    const showPeerAcceptedHint = Boolean(offer?.peerAccepted) && !isAccepted;

    const peerUsername = String(offer?.peerUsername || '').trim();
    const peerNickname = String(offer?.peerNickname || '').trim();
    const displayUsername = peerUsername || t('chat.anonymous');
    const showNickname = peerNickname && peerNickname !== displayUsername;

    const questions = useMemo(() => ([
        t('match.q1'),
        t('match.q2'),
        t('match.q3'),
        t('match.q4'),
        t('match.q5')
    ]), [t]);

    const countdownSeconds = useMemo(() => {
        if (!isOffer || isAccepted) return 0;
        const target = Number(offer?.autoAcceptAt);
        if (!Number.isFinite(target)) return 0;
        return Math.max(0, Math.ceil((target - nowMs) / 1000));
    }, [isAccepted, isOffer, nowMs, offer?.autoAcceptAt]);

    useEffect(() => {
        if (isOffer) return undefined;
        const qInterval = setInterval(() => {
            setQuestionIndex((i) => (i + 1) % questions.length);
        }, 8000);
        return () => clearInterval(qInterval);
    }, [isOffer, questions.length]);

    useEffect(() => {
        if (!isOffer || isAccepted) return undefined;
        const timer = setInterval(() => setNowMs(Date.now()), 250);
        return () => clearInterval(timer);
    }, [isAccepted, isOffer, offer?.autoAcceptAt]);

    return (
        <div className="screen-container center-flex" style={{ justifyContent: 'center' }}>
            {!isOffer && (
                <div style={{ position: 'relative', width: 200, height: 200, marginBottom: 50 }}>
                    <div style={{
                        position: 'absolute',
                        width: '100%',
                        height: '100%',
                        borderRadius: '50%',
                        border: '2px solid var(--primary)',
                        opacity: 0.2,
                        animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite'
                    }} />
                    <div style={{
                        position: 'absolute',
                        width: '70%',
                        height: '70%',
                        top: '15%',
                        left: '15%',
                        borderRadius: '50%',
                        border: '2px solid var(--primary)',
                        opacity: 0.4
                    }} />

                    <div className="center-flex" style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        color: 'var(--primary)',
                        filter: 'drop-shadow(0 0 10px var(--primary))'
                    }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                        </svg>
                    </div>

                    <svg style={{ position: 'absolute', top: -10, left: -10, width: 220, height: 220, transform: 'rotate(-90deg)' }}>
                        <circle
                            cx="110"
                            cy="110"
                            r="105"
                            fill="none"
                            stroke="var(--primary)"
                            strokeWidth="2"
                            strokeDasharray="660"
                            strokeDashoffset="660"
                            strokeLinecap="round"
                            style={{ animation: 'scanProgress 5s linear infinite' }}
                        />
                    </svg>
                </div>
            )}

            <h2 style={{ marginBottom: 20 }}>{isOffer ? t('match.offerTitle') : t('match.title')}</h2>

            {!isOffer ? (
                <GlassCard className="animate-slide-up bg-glass" style={{ padding: 25, maxWidth: 320, textAlign: 'center', minHeight: 140, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <p style={{ fontSize: '1.2rem', fontStyle: 'italic', color: 'var(--text-main)' }}>
                        "{questions[questionIndex]}"
                    </p>
                </GlassCard>
            ) : (
                <GlassCard className="animate-slide-up bg-glass" style={{ padding: 24, maxWidth: 360, width: '100%', textAlign: 'center' }}>
                    <div style={{ color: 'var(--text-soft)', marginBottom: 8 }}>
                        {t('match.offerSubtitle', { username: displayUsername })}
                    </div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-main)' }}>
                        @{displayUsername}
                    </div>
                    {showNickname && (
                        <div style={{ fontSize: '0.95rem', color: 'var(--text-soft)', marginTop: 6 }}>
                            {peerNickname}
                        </div>
                    )}
                    <div style={{ marginTop: 16, color: 'var(--text-soft)', minHeight: 24 }}>
                        {isAccepted
                            ? t('match.waitingPeer')
                            : t('match.autoAcceptIn', { seconds: countdownSeconds })}
                    </div>

                    <div style={{ marginTop: 18, display: 'flex', gap: 12 }}>
                        <button
                            onClick={onReject}
                            disabled={isAccepted}
                            style={{
                                flex: 1,
                                padding: 14,
                                borderRadius: 12,
                                border: '1px solid var(--danger)',
                                color: 'var(--danger)',
                                background: 'transparent',
                                fontWeight: 600,
                                cursor: isAccepted ? 'not-allowed' : 'pointer',
                                opacity: isAccepted ? 0.55 : 1
                            }}
                        >
                            {t('match.reject')}
                        </button>
                        <button
                            onClick={onAccept}
                            disabled={isAccepted}
                            style={{
                                flex: 1,
                                padding: 14,
                                borderRadius: 12,
                                border: '1px solid rgba(0,0,0,0)',
                                color: '#0d1a23',
                                background: 'var(--primary)',
                                fontWeight: 700,
                                cursor: isAccepted ? 'not-allowed' : 'pointer',
                                opacity: isAccepted ? 0.7 : 1
                            }}
                        >
                            {t('match.accept')}
                        </button>
                    </div>
                    {showPeerAcceptedHint && (
                        <div style={{
                            marginTop: 12,
                            padding: '10px 12px',
                            borderRadius: 12,
                            background: 'rgba(76, 255, 180, 0.12)',
                            border: '1px solid rgba(76, 255, 180, 0.35)',
                            color: 'var(--text-main)',
                            fontSize: '0.9rem',
                            lineHeight: 1.35
                        }}>
                            {t('match.peerAcceptedHint')}
                        </div>
                    )}
                </GlassCard>
            )}

            <div style={{ marginTop: 26, width: '100%', maxWidth: 300 }}>
                <button
                    onClick={onCancel}
                    style={{
                        width: '100%',
                        padding: 14,
                        background: 'transparent',
                        border: '1px solid var(--danger)',
                        color: 'var(--danger)',
                        borderRadius: 12,
                        fontSize: '0.98rem',
                        cursor: 'pointer',
                        letterSpacing: 0.5
                    }}
                >
                    {t('match.cancel')}
                </button>
            </div>

            <style>{`
                @keyframes ping { 75%, 100% { transform: scale(1.5); opacity: 0; } }
                @keyframes scanProgress { from { stroke-dashoffset: 660; } to { stroke-dashoffset: 0; } }
            `}</style>
        </div>
    );
};

export default MatchScreen;
