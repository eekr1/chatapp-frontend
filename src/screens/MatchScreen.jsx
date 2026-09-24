import React, { useEffect, useMemo, useState } from 'react';
import GlassCard from '../components/GlassCard';
import { useI18n } from '../i18n';
import { getPrompt } from '../match/promptCatalog';
import { getSearchDisplayTier, getSearchElapsedMs } from '../state/searchLifecycle';
import MatchScopeControl from '../components/MatchScopeControl';
import { getOfferTiming } from '../state/pendingMatch';

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
    onRetry,
    matchScope,
    onScopeChange,
    onFallbackContinue
}) => {
    const { t, locale } = useI18n();
    const [nowMs, setNowMs] = useState(() => Date.now());

    const isOffer = Boolean(offer && typeof offer === 'object');
    const isFinalizing = offer?.phase === 'finalizing' || status === 'match_finalizing';
    const isAccepted = Boolean(offer?.accepted) || status === 'match_waiting' || isFinalizing;
    const isDecisionPending = Boolean(offer?.decisionPending);
    const showPeerAcceptedHint = Boolean(offer?.peerAccepted) && !isAccepted;
    const prompt = getPrompt(search?.promptId, locale);
    const tier = getSearchDisplayTier(search || {}, nowMs);
    const elapsedMs = getSearchElapsedMs(search || {}, nowMs);
    const elapsedSeconds = elapsedMs == null ? null : Math.floor(elapsedMs / 1000);
    const peerPublicLabel = String(offer?.peerPublicLabel || '').trim() || t('chat.anonymous');
    const offerTiming = useMemo(() => getOfferTiming(offer, nowMs), [nowMs, offer]);

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

                {!isOffer && (
                    <MatchScopeControl
                        state={matchScope}
                        active
                        disabled={search?.cancelPending}
                        onChange={onScopeChange}
                    />
                )}

                {!isOffer && matchScope?.fallbackStatus === 'visible' && (
                    <div className="match-fallback" role="status">
                        <p>{t('match.scope.fallback')}</p>
                        <div>
                            <button type="button" onClick={() => onScopeChange?.('GLOBAL')}>{t('match.scope.goGlobal')}</button>
                            <button type="button" onClick={onFallbackContinue}>{t('match.scope.continueCountry')}</button>
                        </div>
                    </div>
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
                        <div className="match-journey__offer-visual" aria-hidden="true">
                            <span className="match-journey__bubble match-journey__bubble--cyan" />
                            <span className="match-journey__bubble match-journey__bubble--pink" />
                        </div>
                        <div className="match-journey__offer-label">{t('match.offerSubtitle')}</div>
                        <div className="match-journey__peer">{peerPublicLabel}</div>
                        {prompt && <div className="match-journey__offer-prompt">“{prompt.label}”</div>}
                        {!isAccepted && offerTiming.countdownSeconds != null && (
                            <div
                                className="match-journey__offer-progress"
                                role="progressbar"
                                aria-label={t('match.autoAcceptProgress')}
                                aria-valuemin="0"
                                aria-valuemax="100"
                                aria-valuenow={Math.round(offerTiming.progressPercent)}
                            >
                                <span style={{ transform: 'scaleX(' + (offerTiming.progressPercent / 100) + ')' }} />
                            </div>
                        )}
                        <div className="match-journey__offer-state" aria-live="polite">
                            {isFinalizing
                                ? t('match.finalizing')
                                : isDecisionPending
                                    ? t('match.submittingDecision')
                                    : isAccepted
                                        ? t('match.waitingPeer')
                                        : offerTiming.countdownSeconds == null
                                            ? t('match.autoAcceptPending')
                                            : t('match.autoAcceptIn', { seconds: offerTiming.countdownSeconds })}
                        </div>
                        <div className="match-journey__decisions">
                            <button className="is-accept" onClick={onAccept} disabled={isAccepted || isDecisionPending} aria-busy={isDecisionPending && offer?.pendingDecision === 'accept'}>
                                {t('match.accept')}
                            </button>
                            <button className="is-pass" onClick={onReject} disabled={isAccepted || isDecisionPending}>
                                {t('match.pass')}
                            </button>
                        </div>
                        {showPeerAcceptedHint && <div className="match-journey__peer-hint">{t('match.peerAcceptedHint')}</div>}
                    </GlassCard>
                )}

                <button className="match-journey__cancel" onClick={onCancel} disabled={search?.cancelPending}>
                    {search?.cancelPending ? t('match.cancelling') : (isOffer ? t('match.cancelMatch') : t('match.cancel'))}
                </button>
            </section>
        </main>
    );
};

export default MatchScreen;
