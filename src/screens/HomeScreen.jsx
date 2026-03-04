import React, { useState } from 'react';
import GlassCard from '../components/GlassCard';
import { profile } from '../api';

const SUPPORT_SUBJECTS = [
    { value: 'connection', label: 'Baglanti' },
    { value: 'message', label: 'Mesaj' },
    { value: 'photo', label: 'Foto' },
    { value: 'other', label: 'Diger' }
];
const MAX_MEDIA_FILES = 3;
const MAX_MEDIA_FILE_BYTES = 8 * 1024 * 1024;
const MAX_MEDIA_TOTAL_BYTES = 16 * 1024 * 1024;
const DEFAULT_LEGAL_FOOTER = Object.freeze({
    tagline: 'Kimligini gizle, ozgurce konus.',
    privacyLabel: 'Gizlilik Politikasi',
    privacyUrl: '/privacy-policy',
    termsLabel: 'Kullanim Sartlari',
    termsUrl: '/terms-of-use'
});

/* Simple icons as SVGs to avoid extra dependencies */
const MaskIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary)', filter: 'drop-shadow(0 0 8px var(--primary))' }}>
        <path d="M2 12a5 5 0 0 0 5 5 8 8 0 0 1 5 2 8 8 0 0 1 5-2 5 5 0 0 0 5-5V7h-5a9.02 9.02 0 0 0-10 0H2v5Z" />
        <path d="M12 7a5 5 0 0 0-5-5H2" />
        <path d="M12 7a5 5 0 0 1 5-5h5" />
    </svg>
);

const FriendsIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent-2)', filter: 'drop-shadow(0 0 8px var(--accent-2))' }}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
);

const isEmailValid = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
const isExternalUrl = (value) => /^https:\/\//i.test(String(value || '').trim());

const HomeScreen = ({
    currentUser,
    onUpdateUser,
    onSelectMode,
    onlineCount,
    unreadCount = 0,
    onLogout,
    onSupportSubmit,
    supportSubmitting = false,
    legalFooter = DEFAULT_LEGAL_FOOTER
}) => {
    const footer = { ...DEFAULT_LEGAL_FOOTER, ...(legalFooter || {}) };
    const [supportOpen, setSupportOpen] = useState(false);
    const [supportSubject, setSupportSubject] = useState('connection');
    const [supportDescription, setSupportDescription] = useState('');
    const [supportEmail, setSupportEmail] = useState('');
    const [supportMediaFiles, setSupportMediaFiles] = useState([]);
    const [supportError, setSupportError] = useState('');
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [settingsDisplayName, setSettingsDisplayName] = useState(currentUser?.display_name || currentUser?.username || '');
    const [settingsCurrentPassword, setSettingsCurrentPassword] = useState('');
    const [settingsNewPassword, setSettingsNewPassword] = useState('');
    const [settingsShowPassword, setSettingsShowPassword] = useState(false);
    const [settingsSavingProfile, setSettingsSavingProfile] = useState(false);
    const [settingsSavingPassword, setSettingsSavingPassword] = useState(false);
    const [settingsMessage, setSettingsMessage] = useState('');
    const [settingsError, setSettingsError] = useState('');

    const resetSupportForm = () => {
        setSupportSubject('connection');
        setSupportDescription('');
        setSupportEmail('');
        setSupportMediaFiles([]);
        setSupportError('');
    };

    const openSupportModal = () => {
        setSupportError('');
        setSupportOpen(true);
    };

    const closeSupportModal = () => {
        if (supportSubmitting) return;
        setSupportOpen(false);
        setSupportError('');
    };

    const openSettingsModal = () => {
        setSettingsDisplayName(currentUser?.display_name || currentUser?.username || '');
        setSettingsCurrentPassword('');
        setSettingsNewPassword('');
        setSettingsShowPassword(false);
        setSettingsMessage('');
        setSettingsError('');
        setSettingsOpen(true);
    };

    const closeSettingsModal = () => {
        if (settingsSavingProfile || settingsSavingPassword) return;
        setSettingsOpen(false);
        setSettingsMessage('');
        setSettingsError('');
    };

    const handleSettingsProfileSave = async (event) => {
        event.preventDefault();
        const nextDisplayName = String(settingsDisplayName || '').trim();
        if (!nextDisplayName) {
            setSettingsError('Gorunen isim bos olamaz.');
            setSettingsMessage('');
            return;
        }

        setSettingsSavingProfile(true);
        setSettingsError('');
        setSettingsMessage('');
        try {
            await profile.updateMe({ display_name: nextDisplayName });
            if (typeof onUpdateUser === 'function') {
                onUpdateUser((prev) => {
                    if (!prev || typeof prev !== 'object') return prev;
                    return { ...prev, display_name: nextDisplayName };
                });
            }
            setSettingsMessage('Gorunen isim guncellendi.');
        } catch (error) {
            setSettingsError(error?.response?.data?.error || 'Gorunen isim guncellenemedi.');
        } finally {
            setSettingsSavingProfile(false);
        }
    };

    const handleSettingsPasswordSave = async (event) => {
        event.preventDefault();
        const currentPassword = String(settingsCurrentPassword || '');
        const newPassword = String(settingsNewPassword || '');

        if (!currentPassword || !newPassword) {
            setSettingsError('Mevcut sifre ve yeni sifre gerekli.');
            setSettingsMessage('');
            return;
        }
        if (newPassword.length < 6) {
            setSettingsError('Yeni sifre en az 6 karakter olmali.');
            setSettingsMessage('');
            return;
        }

        setSettingsSavingPassword(true);
        setSettingsError('');
        setSettingsMessage('');
        try {
            const response = await profile.changePassword(currentPassword, newPassword);
            setSettingsCurrentPassword('');
            setSettingsNewPassword('');
            setSettingsShowPassword(false);
            setSettingsMessage(response?.data?.message || 'Sifre guncellendi.');
        } catch (error) {
            setSettingsError(error?.response?.data?.error || 'Sifre guncellenemedi.');
        } finally {
            setSettingsSavingPassword(false);
        }
    };

    const handleMediaSelection = (event) => {
        const selected = Array.from(event.target.files || []);
        event.target.value = '';
        if (!selected.length) return;

        const merged = [...supportMediaFiles, ...selected].slice(0, MAX_MEDIA_FILES);
        if (supportMediaFiles.length + selected.length > MAX_MEDIA_FILES) {
            setSupportError(`En fazla ${MAX_MEDIA_FILES} medya dosyasi ekleyebilirsiniz.`);
            return;
        }

        let totalBytes = 0;
        for (const file of merged) {
            totalBytes += Number(file.size) || 0;
            if ((Number(file.size) || 0) > MAX_MEDIA_FILE_BYTES) {
                setSupportError(`Tek dosya boyutu en fazla ${Math.round(MAX_MEDIA_FILE_BYTES / (1024 * 1024))} MB olabilir.`);
                return;
            }
            if (file.type && !/^(image|video)\//i.test(file.type)) {
                setSupportError('Sadece foto veya video yukleyebilirsiniz.');
                return;
            }
        }

        if (totalBytes > MAX_MEDIA_TOTAL_BYTES) {
            setSupportError(`Toplam medya boyutu en fazla ${Math.round(MAX_MEDIA_TOTAL_BYTES / (1024 * 1024))} MB olabilir.`);
            return;
        }

        setSupportError('');
        setSupportMediaFiles(merged);
    };

    const removeMediaFile = (index) => {
        setSupportMediaFiles((prev) => prev.filter((_, i) => i !== index));
    };

    const handleSupportSubmit = async (event) => {
        event.preventDefault();
        const description = supportDescription.trim();
        const email = supportEmail.trim();

        if (description.length < 10) {
            setSupportError('Aciklama en az 10 karakter olmali.');
            return;
        }

        if (email && !isEmailValid(email)) {
            setSupportError('E-posta formati gecersiz.');
            return;
        }

        if (typeof onSupportSubmit !== 'function') {
            setSupportError('Destek servisi su an kullanilamiyor.');
            return;
        }

        setSupportError('');
        const result = await onSupportSubmit({
            subject: supportSubject,
            description,
            email: email || null,
            mediaFiles: supportMediaFiles
        });

        if (result?.ok) {
            resetSupportForm();
            setSupportOpen(false);
            return;
        }

        setSupportError(result?.error || 'Sorun bildirimi gonderilemedi.');
    };

    return (
        <div className="screen-container animate-fade-in" style={{ justifyContent: 'space-between' }}>
            <header style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: 10
            }}>
                <div className="brand-lockup brand-lockup-compact">
                    <img src="/brand/talkx-icon-256.png" alt="TalkX icon" className="brand-lockup-icon" />
                    <h2 className="brand-lockup-text" style={{ fontSize: '1.5rem' }}>TalkX</h2>
                </div>
                <div className="home-header-right">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, background: 'var(--success)', borderRadius: '50%', boxShadow: '0 0 5px var(--success)' }} />
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontFamily: 'var(--font-display)' }}>
                            {onlineCount} Online
                        </span>
                    </div>
                    <div className="home-header-actions">
                        {onLogout && (
                            <button
                                onClick={onLogout}
                                className="btn-neon home-header-btn"
                                title="Cikis Yap"
                            >
                                Cikis
                            </button>
                        )}
                        <button
                            onClick={openSettingsModal}
                            className="btn-neon home-header-btn home-settings-btn"
                            title="Ayarlar"
                        >
                            Ayarlar
                        </button>
                    </div>
                </div>
            </header>

            <main className="center-flex" style={{ flex: 1, gap: 40 }}>
                <div
                    className="center-flex"
                    style={{ gap: 15, cursor: 'pointer', transition: 'transform 0.2s', width: '100%' }}
                    onClick={() => onSelectMode('anon')}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                >
                    <GlassCard className="center-flex" style={{
                        width: 180,
                        height: 180,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, rgba(0,240,255,0.05), rgba(0,240,255,0.15))',
                        border: '2px solid rgba(0,240,255,0.3)',
                        boxShadow: '0 0 30px rgba(0,240,255,0.15)'
                    }}>
                        <MaskIcon />
                    </GlassCard>
                    <h3 style={{ fontSize: '1.2rem', color: 'var(--primary)', letterSpacing: 1 }}>ANONIM</h3>
                </div>

                <div style={{ width: 50, height: 1, background: 'var(--glass-border)' }} />

                <div
                    className="center-flex"
                    style={{ gap: 15, cursor: 'pointer', transition: 'transform 0.2s', width: '100%' }}
                    onClick={() => onSelectMode('friends')}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                >
                    <GlassCard className="center-flex" style={{
                        width: 180,
                        height: 180,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, rgba(168,85,247,0.05), rgba(168,85,247,0.15))',
                        border: '2px solid rgba(168,85,247,0.3)',
                        boxShadow: '0 0 30px rgba(168,85,247,0.15)',
                        position: 'relative'
                    }}>
                        <FriendsIcon />
                        {unreadCount > 0 && (
                            <div className="animate-pulse" style={{
                                position: 'absolute',
                                top: 10,
                                right: 10,
                                background: 'var(--danger)',
                                color: 'white',
                                width: 32,
                                height: 32,
                                borderRadius: '50%',
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                fontWeight: 'bold',
                                boxShadow: '0 0 10px var(--danger)'
                            }}>
                                {unreadCount}
                            </div>
                        )}
                    </GlassCard>
                    <h3 style={{ fontSize: '1.2rem', color: 'var(--accent)', letterSpacing: 1 }}>ARKADASLAR</h3>
                </div>
            </main>

            <footer className="center-flex home-footer">
                <p className="home-tagline">{footer.tagline}</p>
                <nav className="home-legal-links" aria-label="Yasal linkler">
                    <a
                        href={footer.privacyUrl}
                        className="home-legal-link"
                        {...(isExternalUrl(footer.privacyUrl) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    >
                        {footer.privacyLabel}
                    </a>
                    <span className="home-legal-separator">•</span>
                    <a
                        href={footer.termsUrl}
                        className="home-legal-link"
                        {...(isExternalUrl(footer.termsUrl) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    >
                        {footer.termsLabel}
                    </a>
                </nav>
            </footer>

            <button
                type="button"
                className="support-fab"
                onClick={openSupportModal}
                aria-label="Sorun bildir"
            >
                !
                <span>Sorun Bildir</span>
            </button>

            {supportOpen && (
                <div className="support-modal-overlay" onClick={closeSupportModal}>
                    <div className="support-modal-card glass-card" onClick={(event) => event.stopPropagation()}>
                        <div className="support-modal-header">
                            <h3>Sorun Bildir</h3>
                            <button type="button" className="support-close-btn" onClick={closeSupportModal} aria-label="Kapat">x</button>
                        </div>

                        <form className="support-form" onSubmit={handleSupportSubmit}>
                            <label htmlFor="support-subject">Konu</label>
                            <select
                                id="support-subject"
                                className="support-select input-glass"
                                value={supportSubject}
                                onChange={(event) => setSupportSubject(event.target.value)}
                                disabled={supportSubmitting}
                            >
                                {SUPPORT_SUBJECTS.map((item) => (
                                    <option key={item.value} value={item.value}>{item.label}</option>
                                ))}
                            </select>

                            <label htmlFor="support-description">Aciklama</label>
                            <textarea
                                id="support-description"
                                className="support-textarea input-glass"
                                value={supportDescription}
                                onChange={(event) => setSupportDescription(event.target.value)}
                                placeholder="Sorunu adim adim aciklayin..."
                                maxLength={2000}
                                disabled={supportSubmitting}
                            />
                            <div className="support-counter">{supportDescription.trim().length}/2000</div>

                            <label htmlFor="support-email">E-posta (opsiyonel)</label>
                            <input
                                id="support-email"
                                type="email"
                                className="input-glass"
                                value={supportEmail}
                                onChange={(event) => setSupportEmail(event.target.value)}
                                placeholder="size-donus@example.com"
                                maxLength={254}
                                disabled={supportSubmitting}
                            />

                            <label htmlFor="support-media">Medya (opsiyonel, foto/video)</label>
                            <input
                                id="support-media"
                                type="file"
                                accept="image/*,video/*"
                                multiple
                                className="input-glass"
                                onChange={handleMediaSelection}
                                disabled={supportSubmitting}
                            />
                            {supportMediaFiles.length > 0 && (
                                <div className="support-media-list">
                                    {supportMediaFiles.map((file, index) => (
                                        <div key={`${file.name}-${index}`} className="support-media-item">
                                            <span>{file.name} ({(Number(file.size || 0) / 1024 / 1024).toFixed(2)} MB)</span>
                                            <button type="button" onClick={() => removeMediaFile(index)} disabled={supportSubmitting}>Kaldir</button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="support-auto-meta">
                                Otomatik eklenecek: app version, platform, cihaz modeli, saat, network tipi, son hata kodu.
                            </div>

                            {supportError && <div className="support-error">{supportError}</div>}

                            <div className="support-actions">
                                <button type="button" className="btn-neon" onClick={closeSupportModal} disabled={supportSubmitting}>
                                    Vazgec
                                </button>
                                <button type="submit" className="btn-solid-purple" disabled={supportSubmitting}>
                                    {supportSubmitting ? 'Gonderiliyor...' : 'Gonder'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {settingsOpen && (
                <div className="support-modal-overlay" onClick={closeSettingsModal}>
                    <div className="settings-modal-card glass-card" onClick={(event) => event.stopPropagation()}>
                        <div className="support-modal-header">
                            <h3>Ayarlar</h3>
                            <button type="button" className="support-close-btn" onClick={closeSettingsModal} aria-label="Kapat">x</button>
                        </div>

                        <div className="settings-section">
                            <h4>Hesap Bilgileri</h4>
                            <label htmlFor="settings-username">Kullanici Adi</label>
                            <input
                                id="settings-username"
                                className="input-glass settings-readonly"
                                value={currentUser?.username || ''}
                                readOnly
                            />
                        </div>

                        <form className="settings-section" onSubmit={handleSettingsProfileSave}>
                            <h4>Gorunen Isim</h4>
                            <label htmlFor="settings-display-name">Gorunen Isim</label>
                            <input
                                id="settings-display-name"
                                className="input-glass"
                                value={settingsDisplayName}
                                onChange={(event) => setSettingsDisplayName(event.target.value)}
                                maxLength={40}
                                disabled={settingsSavingProfile}
                            />
                            <div className="settings-actions">
                                <button type="submit" className="btn-solid-purple" disabled={settingsSavingProfile}>
                                    {settingsSavingProfile ? 'Kaydediliyor...' : 'Kaydet'}
                                </button>
                            </div>
                        </form>

                        <form className="settings-section" onSubmit={handleSettingsPasswordSave}>
                            <h4>Sifre Degistir</h4>
                            <label htmlFor="settings-current-password">Mevcut Sifre</label>
                            <input
                                id="settings-current-password"
                                className="input-glass"
                                type={settingsShowPassword ? 'text' : 'password'}
                                value={settingsCurrentPassword}
                                onChange={(event) => setSettingsCurrentPassword(event.target.value)}
                                disabled={settingsSavingPassword}
                            />
                            <label htmlFor="settings-new-password">Yeni Sifre</label>
                            <input
                                id="settings-new-password"
                                className="input-glass"
                                type={settingsShowPassword ? 'text' : 'password'}
                                value={settingsNewPassword}
                                onChange={(event) => setSettingsNewPassword(event.target.value)}
                                disabled={settingsSavingPassword}
                            />
                            <button
                                type="button"
                                className="settings-toggle-btn"
                                onClick={() => setSettingsShowPassword((prev) => !prev)}
                                disabled={settingsSavingPassword}
                            >
                                {settingsShowPassword ? 'Sifreyi Gizle' : 'Sifreyi Goster'}
                            </button>
                            <div className="settings-actions">
                                <button type="submit" className="btn-solid-purple" disabled={settingsSavingPassword}>
                                    {settingsSavingPassword ? 'Guncelleniyor...' : 'Sifreyi Degistir'}
                                </button>
                            </div>
                        </form>

                        {settingsError && <div className="support-error">{settingsError}</div>}
                        {settingsMessage && <div className="settings-success">{settingsMessage}</div>}
                    </div>
                </div>
            )}
        </div>
    );
};

export default HomeScreen;
