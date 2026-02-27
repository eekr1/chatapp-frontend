import React, { useEffect, useState } from 'react';
import GlassCard from '../components/GlassCard';

const MatchScreen = ({ onCancel, onMatchMock }) => {
    const [questionIndex, setQuestionIndex] = useState(0);

    const questions = [
        "Bugün seni en çok ne güldürdü?",
        "En garip rüyan neydi?",
        "Süper güç istesen ne seçerdin?",
        "Kimse bilmesin dediğin bir şey var mı?",
        "Hangi film karakteri seni anlatıyor?"
    ];

    // Question Rotation
    useEffect(() => {
        const qInterval = setInterval(() => {
            setQuestionIndex(i => (i + 1) % questions.length);
        }, 8000);
        return () => clearInterval(qInterval);
    }, []);

    return (
        <div className="screen-container center-flex" style={{ justifyContent: 'center' }}>

            {/* Radar / Scanner Visual */}
            <div style={{ position: 'relative', width: 200, height: 200, marginBottom: 50 }}>
                {/* Pulse Circles */}
                <div style={{
                    position: 'absolute', width: '100%', height: '100%', borderRadius: '50%',
                    border: '2px solid var(--primary)', opacity: 0.2, animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite'
                }}></div>
                <div style={{
                    position: 'absolute', width: '70%', height: '70%', top: '15%', left: '15%', borderRadius: '50%',
                    border: '2px solid var(--primary)', opacity: 0.4
                }}></div>

                {/* Center Icon */}
                <div className="center-flex" style={{
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                    color: 'var(--primary)', filter: 'drop-shadow(0 0 10px var(--primary))'
                }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg>
                </div>

                {/* Circular Spinner overlay */}
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

            <h2 style={{ marginBottom: 20 }}>EŞLEŞTİRİLİYOR...</h2>

            {/* Question Card */}
            <GlassCard className="animate-slide-up bg-glass" style={{ padding: 25, maxWidth: 320, textAlign: 'center', minHeight: 140, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p style={{ fontSize: '1.2rem', fontStyle: 'italic', color: 'var(--text-main)' }}>
                    "{questions[questionIndex]}"
                </p>
            </GlassCard>

            <div style={{ marginTop: 40, width: '100%', maxWidth: 300 }}>
                {/* Cancel Button */}
                <button onClick={onCancel} style={{
                    width: '100%', padding: 15, background: 'transparent', border: '1px solid var(--danger)',
                    color: 'var(--danger)', borderRadius: 12, fontSize: '1rem', cursor: 'pointer',
                    letterSpacing: 1
                }}>
                    İPTAL ET
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
