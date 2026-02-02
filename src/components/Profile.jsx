import { useState, useEffect } from 'react';
import { profile, getAvatar } from '../api';

export default function Profile({ onClose }) {
    const [data, setData] = useState({ display_name: '', bio: '', avatar_url: '' });
    const [loading, setLoading] = useState(true);
    const [msg, setMsg] = useState('');

    useEffect(() => {
        loadProfile();
    }, []);

    const loadProfile = async () => {
        try {
            const res = await profile.getMe();
            setData({
                display_name: res.data.user.display_name || '',
                bio: res.data.user.bio || '',
                avatar_url: res.data.user.avatar_url || ''
            });
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        try {
            await profile.updateMe(data);
            setMsg('Profil güncellendi!');
            setTimeout(() => setMsg(''), 3000);
        } catch (e) {
            setMsg('Hata: ' + (e.response?.data?.error || 'Sunucu hatası'));
        }
    };

    if (loading) return <div className="modal-overlay">Yükleniyor...</div>;

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <div className="modal-header">
                    <h2>Profil Düzenle</h2>
                    <button className="close-btn" onClick={onClose}>&times;</button>
                </div>

                <div style={{ textAlign: 'center', marginBottom: '15px' }}>
                    <img
                        src={data.avatar_url || getAvatar(data.display_name || 'user')}
                        alt="Avatar"
                        style={{ width: '80px', height: '80px', borderRadius: '50%', marginBottom: '10px' }}
                    />
                </div>

                <form onSubmit={handleSave}>
                    <label>Görünen İsim (Rumuz)</label>
                    <input
                        value={data.display_name}
                        onChange={e => setData({ ...data, display_name: e.target.value })}
                        maxLength={20}
                        placeholder="Örn: Gezgin"
                    />

                    <label>Bio (Hakkında)</label>
                    <textarea
                        value={data.bio}
                        onChange={e => setData({ ...data, bio: e.target.value })}
                        maxLength={100}
                        placeholder="Kendinden bahset..."
                    />

                    <div className="info-text">
                        Kullanıcı adınız değiştirilemez. <br />
                        Sohbetlerde görünen isminiz (rumuz) kullanılır.
                    </div>

                    {msg && <div className={msg.includes('Hata') ? 'error-text' : 'success-text'}>{msg}</div>}

                    <div className="modal-actions">
                        <button type="button" onClick={onClose} className="btn-secondary">Kapat</button>
                        <button type="submit" className="btn-primary">Kaydet</button>
                    </div>
                </form>
            </div>
        </div>
    );
}
