import { useI18n } from '../i18n';
import { MATCH_SCOPES } from '../state/matchScope';

const MatchScopeControl = ({ state, active = false, disabled = false, onChange }) => {
  const { t } = useI18n();
  if (!state?.capability) return null;
  const selected = active && state.effectiveMatchScope
    ? state.effectiveMatchScope
    : state.preferredMatchScope;
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
              tabIndex={selected === scope ? 0 : -1}
              className={selected === scope ? 'is-active' : ''}
              disabled={busy || unavailable}
              onClick={() => onChange?.(scope)}
            >
              {scope === MATCH_SCOPES.GLOBAL
                ? t('match.scope.global')
                : t('match.scope.country', { country: state.country?.displayName || t('match.scope.myCountry') })}
            </button>
          );
        })}
      </div>
      {!state.countryAvailable && <p className="match-scope__hint">{t('match.scope.unavailable')}</p>}
      {state.scopeChangeStatus === 'switching' && <p className="match-scope__hint" aria-live="polite">{t('match.scope.switching')}</p>}
      {state.scopeChangeStatus === 'failed' && <p className="match-scope__hint is-error" role="alert">{t('match.scope.failed')}</p>}
    </div>
  );
};

export default MatchScopeControl;
