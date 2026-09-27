import { useId } from 'react';
import { useI18n } from '../i18n';
import { MATCH_SCOPES } from '../state/matchScope';

const ScopeIcon = ({ type }) => {
  if (type === 'lock') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5" y="10" width="14" height="10" rx="3" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        <path d="M12 14v2" />
      </svg>
    );
  }

  if (type === 'country') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  );
};

const MatchScopeControl = ({ state, active = false, disabled = false, onChange }) => {
  const { t } = useI18n();
  const hintId = useId();
  if (!state?.capability) return null;
  const requestedScope = active && state.effectiveMatchScope
    ? state.effectiveMatchScope
    : state.preferredMatchScope;
  const selected = requestedScope === MATCH_SCOPES.COUNTRY && !state.countryAvailable
    ? MATCH_SCOPES.GLOBAL
    : requestedScope;
  const busy = disabled || state.scopeChangeStatus === 'switching';
  const scopes = [MATCH_SCOPES.GLOBAL, MATCH_SCOPES.COUNTRY];
  const handleKeyDown = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const next = selected === MATCH_SCOPES.GLOBAL ? MATCH_SCOPES.COUNTRY : MATCH_SCOPES.GLOBAL;
    if (next === MATCH_SCOPES.COUNTRY && !state.countryAvailable) return;
    onChange?.(next);
  };

  return (
    <div className="match-scope">
      <div className="match-scope__label">{t('match.scope.label')}</div>
      <div className="match-scope__control" role="radiogroup" aria-label={t('match.scope.label')} onKeyDown={handleKeyDown}>
        {scopes.map((scope) => {
          const unavailable = scope === MATCH_SCOPES.COUNTRY && !state.countryAvailable;
          return (
            <button
              key={scope}
              type="button"
              role="radio"
              aria-checked={selected === scope}
              aria-describedby={unavailable ? hintId : undefined}
              tabIndex={selected === scope ? 0 : -1}
              className={[
                selected === scope ? 'is-active' : '',
                unavailable ? 'is-unavailable' : ''
              ].filter(Boolean).join(' ')}
              disabled={busy || unavailable}
              onClick={() => onChange?.(scope)}
            >
              <span className="match-scope__option">
                <span className="match-scope__icon">
                  <ScopeIcon type={scope === MATCH_SCOPES.GLOBAL ? 'global' : unavailable ? 'lock' : 'country'} />
                </span>
                <span>
                  {scope === MATCH_SCOPES.GLOBAL
                    ? t('match.scope.global')
                    : t('match.scope.country', { country: state.country?.displayName || t('match.scope.myCountry') })}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {!state.countryAvailable && <p className="match-scope__hint" id={hintId}>{t('match.scope.unavailable')}</p>}
      {state.scopeChangeStatus === 'switching' && <p className="match-scope__hint" aria-live="polite">{t('match.scope.switching')}</p>}
      {state.scopeChangeStatus === 'failed' && <p className="match-scope__hint is-error" role="alert">{t('match.scope.failed')}</p>}
    </div>
  );
};

export default MatchScopeControl;
