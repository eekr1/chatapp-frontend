import { useMemo, useState } from 'react';
import { auth } from '../api';

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

export default function Auth({ onLogin, legalFooter, legalVersions }) {
    const [isLogin, setIsLogin] = useState(true);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [acceptLegal, setAcceptLegal] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const footer = useMemo(
        () => ({ ...DEFAULT_LEGAL_FOOTER, ...(legalFooter || {}) }),
        [legalFooter]
    );
    const versions = useMemo(
        () => ({ ...DEFAULT_LEGAL_VERSIONS, ...(legalVersions || {}) }),
        [legalVersions]
    );

    const submitDisabled = loading;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (isLogin) {
                const res = await auth.login(username, password, localStorage.getItem('anon_device_id') || 'unknown');
                localStorage.setItem('session_token', res.data.token);
                onLogin(res.data.user);
                return;
            }

            if (!acceptLegal) {
                setError('Kayit icin sozlesmeyi kabul etmelisiniz.');
                return;
            }

            await auth.register(username, password, {
                terms_accepted: true,
                terms_version: versions.terms,
                privacy_version: versions.privacy
            });

            const res = await auth.login(username, password, localStorage.getItem('anon_device_id') || 'unknown');
            localStorage.setItem('session_token', res.data.token);
            onLogin(res.data.user);
        } catch (err) {
            setError(err.response?.data?.error || 'Bir hata olustu.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container center-flex" style={{ minHeight: '100vh' }}>
            <div className="glass-card" style={{ padding: 40, width: '100%', maxWidth: 400, textAlign: 'center' }}>
                <div className="brand-lockup" style={{ justifyContent: 'center', marginBottom: 6 }}>
                    <img src="/brand/talkx-icon-256.png" alt="TalkX icon" className="brand-lockup-icon" />
                    <h1 className="brand-lockup-text" style={{ margin: 0 }}>TalkX</h1>
                </div>
                <p className="subtitle">{isLogin ? 'Tekrar hos geldin!' : 'Yeni hesap olustur'}</p>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 15, marginTop: 20 }}>
                    <input
                        className="input-glass"
                        placeholder="Kullanici adi"
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                        autoFocus
                    />
                    <input
                        className="input-glass"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Sifre"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                    />
                    <button
                        type="button"
                        className="auth-password-toggle"
                        onClick={() => setShowPassword((prev) => !prev)}
                    >
                        {showPassword ? 'Sifreyi Gizle' : 'Sifreyi Goster'}
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
                                {' '}
                                <a
                                    href={footer.privacyUrl}
                                    {...(isExternalUrl(footer.privacyUrl) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                                >
                                    {footer.privacyLabel}
                                </a>
                                {' '}ve{' '}
                                <a
                                    href={footer.termsUrl}
                                    {...(isExternalUrl(footer.termsUrl) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                                >
                                    {footer.termsLabel}
                                </a>
                                {' '}metinlerini okudum ve kabul ediyorum.
                            </span>
                        </label>
                    )}

                    {error && <div className="error-text">{error}</div>}

                    {!isLogin && (
                        <div style={{ backgroundColor: 'rgba(231, 76, 60, 0.1)', border: '1px solid var(--danger)', borderRadius: '8px', padding: '10px', marginTop: '10px', marginBottom: '10px', fontSize: '0.85em', color: 'var(--danger)', textAlign: 'left' }}>
                            <strong>Onemli Uyari:</strong><br />
                            E-posta istemiyoruz. Sifreni unutursan hesabini kurtaramazsin. Sifreni bir yere not et.
                        </div>
                    )}

                    <button type="submit" disabled={submitDisabled} className="btn-solid-purple" style={{ marginTop: 10, width: '100%' }}>
                        {loading ? 'Isleniyor...' : (isLogin ? 'Giris Yap' : 'Kayit Ol')}
                    </button>

                    <p style={{ marginTop: '15px', fontSize: '0.9em', color: '#666' }}>
                        {isLogin ? 'Hesabin yok mu? ' : 'Zaten hesabin var mi? '}
                        <span
                            style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 'bold' }}
                            onClick={() => {
                                setIsLogin(!isLogin);
                                setError('');
                                setShowPassword(false);
                                setAcceptLegal(false);
                            }}
                        >
                            {isLogin ? 'Kayit Ol' : 'Giris Yap'}
                        </span>
                    </p>
                </form>
            </div>
        </div>
    );
}
