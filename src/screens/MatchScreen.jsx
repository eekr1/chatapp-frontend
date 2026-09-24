import React, { useEffect, useMemo, useState } from 'react';
import GlassCard from '../components/GlassCard';
import { useI18n } from '../i18n';
import { getPrompt } from '../match/promptCatalog';
import { getSearchDisplayTier, getSearchElapsedMs } from '../state/searchLifecycle';

const MOODS = ['random', 'fun', 'casual', 'deep'];

const MatchScreen = ({
    status,
    offer,
    search,
    onAccept,
    onReject,
    onCancel,
    onMoodChange,
    onNextPrompt,
    onRetry
}) => {
    const { t, locale } = useI18n();
    const [nowMs, setNowMs] = useState(() => Date.now());

    const isOffer = Boolean(offer && typeof offer === 'object');
    const isAccepted = Boolean(offer?.accepted) || status === 'match_waiting';
    const showPeerAcceptedHint = Boolean(offer?.peerAccepted) && !isAccepted;
    const prompt = getPrompt(search?.promptId, locale);
    const tier = getSearchDisplayTier(search || {}, nowMs);
    const elapsedMs = getSearchElapsedMs(search || {}, nowMs);
    const elapsedSeconds = elapsedMs == null ? null : Math.floor(elapsedMs / 1000);
    const peerUsername = String(offer?.peerUsername || '').trim();
    const peerNickname = String(offer?.peerNickname || '').trim();
    const displayUsername = peerUsername || t('chat.anonymous');
    const showNickname = peerNickname && peerNickname !== displayUsername;

    const countdownSeconds = useMemo(() => {
        if (!isOffer || isAccepted) return 0;
        const target = Number(offer?.autoAcceptAt);
        if (!Number.isFinite(target)) return 0;
        return Math.max(0, Math.ceil((target - nowMs) / 1000));
    }, [isAccepted, isOffer, nowMs, offer?.autoAcceptAt]);

    useEffect(() => {
        if (!isOffer && !['queued', 'extended'].includes(search?.phase)) return undefined;
        const timer = setInterval(() => setNowMs(Date.now()), isOffer ? 250 : 1000);
        return () => clearInterval(timer);
    }, [isOffer, offer?.autoAcceptAt, search?.phase]);

    const statusKey = ['preparing', 'searching', 'continuing', 'quiet', 'extended', 'reconnecting', 'offline'].includes(tier)
        ? tier
        : 'searching';

    return (
        <main className="match-journey screen-container">
            <section className="match-journey__content">
                {!isOffer && (
                    <div className="match-journey__signal" aria-hidden="true">
                        <span className="match-journey__particle match-journey__particle--one" />
                        <span className="match-journey__particle match-journey__particle--two" />
                    </div>
                )}

                <div className="match-journey__eyebrow">TalkX</div>
                <h1 aria-live="polite">{isOffer ? t('match.offerTitle') : t(`match.status.${statusKey}.title`)}</h1>
                {!isOffer && (
                    <p className="match-journey__status-copy">
                        {t(`match.status.${statusKey}.body`)}
                        {elapsedSeconds != null && <span className="match-journey__timer">{t('match.elapsed', { seconds: elapsedSeconds })}</span>}
                    </p>
                )}

                {!isOffer ? (
                    <GlassCard className="match-journey__card animate-slide-up bg-glass">
                        <div className="match-journey__section-label">{t('match.moodLabel')}</div>
                        <div className="match-journey__moods" role="group" aria-label={t('match.moodLabel')}>
                            {MOODS.map((mood) => (
                                <button
                                    className={search?.moodId === mood ? 'is-active' : ''}
                                    key={mood}
                                    type="button"
                                    onClick={() => onMoodChange?.(mood)}
                                    aria-pressed={search?.moodId === mood}
                                >
                                    {t(`match.mood.${mood}`)}
                                </button>
                            ))}
                        </div>
                        <div className="match-journey__prompt">
                            <div>
                                <span>{t('match.promptLabel')}</span>
                                <p>{prompt?.label || t('match.promptFallback')}</p>
                            </div>
                            <button type="button" onClick={onNextPrompt}>{t('match.nextPrompt')}</button>
                        </div>
                        {['extended', 'offline'].includes(tier) && (
                            <button className="match-journey__retry" type="button" onClick={onRetry}>
                                {t('match.retry')}
                            </button>
                        )}
                    </GlassCard>
                ) : (
                    <GlassCard className="match-journey__card match-journey__offer animate-slide-up bg-glass">
                        <div className="match-journey__offer-label">{t('match.offerSubtitle', { username: displayUsername })}</div>
                        <div className="match-journey__peer">@{displayUsername}</div>
                        {showNickname && <div className="match-journey__nickname">{peerNickname}</div>}
                        {prompt && <div className="match-journey__offer-prompt">“{prompt.label}”</div>}
                        <div className="match-journey__offer-state">
                            {isAccepted ? t('match.waitingPeer') : t('match.autoAcceptIn', { seconds: countdownSeconds })}
                        </div>
                        <div className="match-journey__decisions">
                            <button className="is-reject" onClick={onReject} disabled={isAccepted}>{t('match.reject')}</button>
                            <button className="is-accept" onClick={onAccept} disabled={isAccepted}>{t('match.accept')}</button>
                        </div>
                        {showPeerAcceptedHint && <div className="match-journey__peer-hint">{t('match.peerAcceptedHint')}</div>}
                    </GlassCard>
                )}

                <button className="match-journey__cancel" onClick={onCancel} disabled={search?.cancelPending}>
                    {search?.cancelPending ? t('match.cancelling') : t('match.cancel')}
                </button>
            </section>
        </main>
    );
};

export default MatchScreen;
