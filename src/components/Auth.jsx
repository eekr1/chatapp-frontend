import { useEffect, useMemo, useRef, useState } from 'react';
import { auth, getLocalizedApiError } from '../api';
import { consumeAuthNotice, resolveAuthNoticeKey } from '../auth/authPolicy';
import { useI18n } from '../i18n';
import ClientStateMessage from './ClientStateMessage';

const DEFAULT_LEGAL_FOOTER = Object.freeze({
    privacyLabel: 'Gizlilik Politikasi',
    privacyUrl: '/privacy-policy',
    termsLabel: 'Kullanim Sartlari',
    termsUrl: '/terms-of-use'
});

const DEFAULT_LEGAL_VERSIONS = Object.freeze({
    terms: 'v1',
    privacy: 'v1'
});

const isExternalUrl = (value) => /^https:\/\//i.test(String(value || '').trim());
const createCommandId = () => (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID()
    : `legal-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

export default function Auth({ onLogin, legalFooter, legalVersions, legalReleaseId, legalAvailable = false }) {
    const { t, locale } = useI18n();
    const [isLogin, setIsLogin] = useState(true);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [acceptLegal, setAcceptLegal] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [notice, setNotice] = useState(null);
    const usernameRef = useRef(null);
    const errorRef = useRef(null);

    const footer = useMemo(
        () => ({ ...DEFAULT_LEGAL_FOOTER, ...(legalFooter || {}) }),
        [legalFooter]
    );
    const versions = useMemo(
        () => ({ ...DEFAULT_LEGAL_VERSIONS, ...(legalVersions || {}) }),
        [legalVersions]
    );
    const noticeKey = resolveAuthNoticeKey(notice);

    useEffect(() => {
        setNotice(consumeAuthNotice(sessionStorage));
    }, []);

    useEffect(() => {
        if (error) errorRef.current?.focus();
    }, [error]);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError('');
        setNotice(null);
        setLoading(true);

        try {
            if (isLogin) {
                const response = await auth.login(username, password, localStorage.getItem('anon_device_id') || 'unknown');
                localStorage.setItem('session_token', response.data.token);
                onLogin(response.data.user);
                return;
            }

            if (!acceptLegal) {
                setError(t('auth.legalRequired'));
                return;
            }
            if (!legalAvailable || !legalReleaseId) {
                setError(t('legal.statusUnavailable'));
                return;
            }

            await auth.register(username, password, {
                terms_accepted: true,
                terms_version: versions.terms,
                privacy_version: versions.privacy,
                expected_release_id: legalReleaseId,
                command_id: createCommandId()
            }, locale);

            const response = await auth.login(username, password, localStorage.getItem('anon_device_id') || 'unknown');
            localStorage.setItem('session_token', response.data.token);
            onLogin(response.data.user);
        } catch (submitError) {
            setError(getLocalizedApiError(t, submitError, 'auth.genericError'));
        } finally {
            setLoading(false);
        }
    };

    const switchMode = () => {
        setIsLogin((current) => !current);
        setError('');
        setNotice(null);
        setPassword('');
        setShowPassword(false);
        setAcceptLegal(false);
        requestAnimationFrame(() => usernameRef.current?.focus());
    };

    const usernameDescription = error ? 'auth-username-help auth-form-error' : 'auth-username-help';
    const passwordDescription = error ? 'auth-password-help auth-form-error' : 'auth-password-help';

    return (
        <main className="login-container center-flex auth-page">
            <section className="glass-card auth-card" aria-labelledby="auth-title">
                <div className="brand-lockup auth-brand-lockup">
                    <img src="/brand/talkx-icon-256.png" alt="" className="brand-lockup-icon" />
                    <h1 id="auth-title" className="brand-lockup-text">TalkX</h1>
                </div>
                <p className="subtitle">{isLogin ? t('auth.welcomeBack') : t('auth.createAccount')}</p>

                {noticeKey && (
                    <ClientStateMessage state="stale">
                        {t(noticeKey)}
                    </ClientStateMessage>
                )}

                <form onSubmit={handleSubmit} className="auth-form" aria-busy={loading}>
                    <div className="auth-field">
                        <label htmlFor="auth-username">{t('auth.username')}</label>
                        <input
                            ref={usernameRef}
                            id="auth-username"
                            name="username"
                            className="input-glass"
                            value={username}
                            onChange={(event) => setUsername(event.target.value)}
                            autoComplete="username"
                            aria-describedby={usernameDescription}
                            aria-invalid={Boolean(error)}
                            required
                            autoFocus
                        />
                        <span id="auth-username-help" className="auth-help">{t('auth.usernameHelp')}</span>
                    </div>

                    <div className="auth-field">
                        <label htmlFor="auth-password">{t('auth.password')}</label>
                        <input
                            id="auth-password"
                            name="password"
                            className="input-glass"
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            autoComplete={isLogin ? 'current-password' : 'new-password'}
                            aria-describedby={passwordDescription}
                            aria-invalid={Boolean(error)}
                            required
                        />
                        <span id="auth-password-help" className="auth-help">
                            {t(isLogin ? 'auth.passwordLoginHelp' : 'auth.passwordRegisterHelp')}
                        </span>
                    </div>

                    <button
                        type="button"
                        className="auth-password-toggle"
                        onClick={() => setShowPassword((current) => !current)}
                        aria-controls="auth-password"
                        aria-pressed={showPassword}
                    >
                        {showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                    </button>

                    {!isLogin && (
                        <label className="auth-legal-check">
                            <input
                                type="checkbox"
                                checked={acceptLegal}
                                onChange={(event) => {
                                    const checked = event.target.checked;
                                    setAcceptLegal(checked);
                                    if (checked) setError('');
                                }}
                            />
                            <span>
                                <a
                                    href={footer.privacyUrl}
                                    {...(isExternalUrl(footer.privacyUrl) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                                >
                                    {footer.privacyLabel}
                                </a>
                                {' '}{t('auth.acceptLegalMiddle')}{' '}
                                <a
                                    href={footer.termsUrl}
                                    {...(isExternalUrl(footer.termsUrl) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                                >
                                    {footer.termsLabel}
                                </a>
                                {' '}{t('auth.acceptLegalSuffix')}
                            </span>
                        </label>
                    )}

                    {error && (
                        <ClientStateMessage state="partial_error" id="auth-form-error" focusable>
                            <span ref={errorRef} tabIndex={-1}>{error}</span>
                        </ClientStateMessage>
                    )}

                    {!isLogin && (
                        <div className="auth-warning" role="note">
                            <strong>{t('auth.importantWarning')}</strong>
                            <span>{t('auth.noEmailRecovery')}</span>
                        </div>
                    )}

                    <button type="submit" disabled={loading} className="btn-solid-purple auth-submit">
                        {loading ? t('auth.processing') : (isLogin ? t('auth.submitLogin') : t('auth.submitRegister'))}
                    </button>

                    <p className="auth-mode-prompt">
                        {isLogin ? `${t('auth.noAccount')} ` : `${t('auth.haveAccount')} `}
                        <button type="button" className="auth-mode-switch" onClick={switchMode}>
                            {isLogin ? t('auth.submitRegister') : t('auth.submitLogin')}
                        </button>
                    </p>
                </form>
            </section>
        </main>
    );
}
