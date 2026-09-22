import { useState, useEffect } from 'react';
import { friends } from '../api';

export default function Friends({ onClose, onStartChat }) {
    const [list, setList] = useState({ friends: [], incoming: [], outgoing: [] });
    const [, setLoading] = useState(true);
    const [targetUsername, setTargetUsername] = useState('');
    const [msg, setMsg] = useState('');

    useEffect(() => {
        loadFriends();
    }, []);

    const loadFriends = async () => {
        try {
            const res = await friends.list();
            setList(res.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const sendRequest = async (e) => {
        e.preventDefault();
        try {
            await friends.request(targetUsername);
            setMsg('İstek gönderildi!');
            setTargetUsername('');
            loadFriends();
        } catch (e) {
            setMsg('Hata: ' + (e.response?.data?.error || 'Sunucu hatası'));
        }
        setTimeout(() => setMsg(''), 3000);
    };

    const handleAccept = async (id) => {
        try {
            await friends.accept(id);
            loadFriends();
        } catch (e) { console.error(e); }
    };

    const handleReject = async (id) => {
        try {
            await friends.reject(id);
            loadFriends();
        } catch (e) { console.error(e); }
    };

    // Note: onStartChat is placeholder if we implement direct chat later.
    // Ideally we would trigger a chat room functionality.

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <div className="modal-header">
                    <h2>Arkadaşlar</h2>
                    <button className="close-btn" onClick={onClose}>&times;</button>
                </div>

                <div className="friend-add-section">
                    <form onSubmit={sendRequest} style={{ display: 'flex', gap: '10px' }}>
                        <input
                            value={targetUsername}
                            onChange={e => setTargetUsername(e.target.value)}
                            placeholder="Kullanıcı adı gir..."
                        />
                        <button type="submit" className="btn-primary">Ekle</button>
                    </form>
                    {msg && <div className="info-text-small">{msg}</div>}
                </div>

                <div className="friends-lists">
                    {list.incoming.length > 0 && (
                        <div className="list-section">
                            <h3>İstekler ({list.incoming.length})</h3>
                            {list.incoming.map(u => (
                                <div key={u.user_id} className="user-row">
                                    <span>{u.display_name || u.username}</span>
                                    <div>
                                        <button onClick={() => handleAccept(u.user_id)} className="btn-sm-success">✓</button>
                                        <button onClick={() => handleReject(u.user_id)} className="btn-sm-danger">✗</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="list-section">
                        <h3>Arkadaşların ({list.friends.length})</h3>
                        {list.friends.length === 0 && <p className="empty-text">Henüz arkadaşın yok.</p>}
                        {list.friends.map(u => (
                            <div key={u.user_id} className="user-row">
                                <div className="avatar-container">
                                    <img src={`https://api.dicebear.com/9.x/bottts/svg?seed=${u.user_id}`} alt="av" className="avatar-img" />
                                    {u.is_online && <span className="status-dot"></span>}
                                </div>
                                <div className="user-info" style={{ flex: 1 }}>
                                    <span className="dname">{u.display_name || u.username}</span>
                                    <span className="uname">@{u.username}</span>
                                </div>
                                <div>
                                    <button onClick={() => {
                                        onStartChat({
                                            userId: u.user_id,
                                            nickname: u.display_name || u.username,
                                            username: u.username
                                        });
                                        onClose();
                                    }} className="btn-sm-primary" title="Mesaj At">💬</button>
                                    <button onClick={() => handleReject(u.user_id)} className="btn-sm-danger" title="Sil">🗑️</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
