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
                // Auto login after register? Or ask to login?
                // For simplified UX, let's just login
                const res = await auth.login(username, password, localStorage.getItem('anon_device_id') || 'unknown');
                localStorage.setItem('session_token', res.data.token);
                onLogin(res.data.user);
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Bir hata oluştu.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <h1>AnonChat v2</h1>
                <p className="subtitle">{isLogin ? 'Tekrar Hoşgeldin!' : 'Yeni Hesap Oluştur'}</p>

                <form onSubmit={handleSubmit}>
                    <input
                        placeholder="Kullanıcı Adı"
                        value={username} onChange={e => setUsername(e.target.value)}
                        autoFocus
                    />
                    <input
                        type="password"
                        placeholder="Şifre"
                        value={password} onChange={e => setPassword(e.target.value)}
                    />

                    {error && <div className="error-text">{error}</div>}

                    {!isLogin && (
                        <div style={{ backgroundColor: 'rgba(231, 76, 60, 0.1)', border: '1px solid var(--danger)', borderRadius: '8px', padding: '10px', marginTop: '10px', marginBottom: '10px', fontSize: '0.85em', color: 'var(--danger)', textAlign: 'left' }}>
                            <strong>⚠️ Önemli Uyarı:</strong><br />
                            E-posta istemiyoruz. Bu yüzden şifreni unutursan hesabını <u>kurtaramazsın</u>. Şifreni bir yere not et!
                        </div>
                    )}

                    <button type="submit" disabled={loading}>
                        {loading ? 'İşleniyor...' : (isLogin ? 'Giriş Yap' : 'Kayıt Ol')}
                    </button>

                    <p style={{ marginTop: '15px', fontSize: '0.9em', color: '#666' }}>
                        {isLogin ? 'Hesabın yok mu? ' : 'Zaten hesabın var mı? '}
                        <span
                            style={{ color: '#3498db', cursor: 'pointer', fontWeight: 'bold' }}
                            onClick={() => { setIsLogin(!isLogin); setError(''); }}
                        >
                            {isLogin ? 'Kayıt Ol' : 'Giriş Yap'}
                        </span>
                    </p>
                </form>
            </div>
        </div>
    );
}
