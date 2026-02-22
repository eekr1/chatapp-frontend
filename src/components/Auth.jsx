import { useState } from 'react';
import { auth } from '../api';

export default function Auth({ onLogin }) {
    const [isLogin, setIsLogin] = useState(true);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (isLogin) {
                const res = await auth.login(username, password, localStorage.getItem('anon_device_id') || 'unknown');
                localStorage.setItem('session_token', res.data.token);
                onLogin(res.data.user);
            } else {
                await auth.register(username, password);
                const res = await auth.login(username, password, localStorage.getItem('anon_device_id') || 'unknown');
                localStorage.setItem('session_token', res.data.token);
                onLogin(res.data.user);
            }
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
                        onChange={e => setUsername(e.target.value)}
                        autoFocus
                    />
                    <input
                        className="input-glass"
                        type="password"
                        placeholder="Sifre"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                    />

                    {error && <div className="error-text">{error}</div>}

                    {!isLogin && (
                        <div style={{ backgroundColor: 'rgba(231, 76, 60, 0.1)', border: '1px solid var(--danger)', borderRadius: '8px', padding: '10px', marginTop: '10px', marginBottom: '10px', fontSize: '0.85em', color: 'var(--danger)', textAlign: 'left' }}>
                            <strong>Onemli Uyari:</strong><br />
                            E-posta istemiyoruz. Sifreni unutursan hesabini kurtaramazsin. Sifreni bir yere not et.
                        </div>
                    )}

                    <button type="submit" disabled={loading} className="btn-solid-purple" style={{ marginTop: 10, width: '100%' }}>
                        {loading ? 'Isleniyor...' : (isLogin ? 'Giris Yap' : 'Kayit Ol')}
                    </button>

                    <p style={{ marginTop: '15px', fontSize: '0.9em', color: '#666' }}>
                        {isLogin ? 'Hesabin yok mu? ' : 'Zaten hesabin var mi? '}
                        <span
                            style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 'bold' }}
                            onClick={() => { setIsLogin(!isLogin); setError(''); }}
                        >
                            {isLogin ? 'Kayit Ol' : 'Giris Yap'}
                        </span>
                    </p>
                </form>
            </div>
        </div>
    );
}