import React, { useState } from 'react';
import GlassCard from '../components/GlassCard';
import { getLocalizedApiError, profile } from '../api';
import { useI18n } from '../i18n';

const SUPPORT_SUBJECTS = [
    { value: 'connection', labelKey: 'support.subject.connection' },
    { value: 'message', labelKey: 'support.subject.message' },
    { value: 'photo', labelKey: 'support.subject.photo' },
    { value: 'other', labelKey: 'support.subject.other' }
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
    onDeletionCompleted,
    onLocaleChange,
    currentLocale = 'en',
    onSelectMode,
    onlineCount,
    unreadCount = 0,
    onLogout,
    onSupportSubmit,
    supportSubmitting = false,
    legalFooter = DEFAULT_LEGAL_FOOTER
}) => {
    const { t } = useI18n();
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
    const [settingsDeleting, setSettingsDeleting] = useState(false);
    const [settingsDeletePassword, setSettingsDeletePassword] = useState('');
    const [settingsDeleteConfirm, setSettingsDeleteConfirm] = useState('');
    const [settingsMessage, setSettingsMessage] = useState('');
    const [settingsError, setSettingsError] = useState('');
    const [settingsLocale, setSettingsLocale] = useState(currentLocale);

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
        setSettingsLocale(currentLocale || 'en');
        setSettingsDeletePassword('');
        setSettingsDeleteConfirm('');
        setSettingsMessage('');
        setSettingsError('');
        setSettingsOpen(true);
    };

    const closeSettingsModal = () => {
        if (settingsSavingProfile || settingsSavingPassword || settingsDeleting) return;
        setSettingsOpen(false);
        setSettingsMessage('');
        setSettingsError('');
    };

    const handleSettingsProfileSave = async (event) => {
        event.preventDefault();
        const nextDisplayName = String(settingsDisplayName || '').trim();
        if (!nextDisplayName) {
            setSettingsError(t('home.displayNameEmpty'));
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
            setSettingsMessage(t('home.displayNameUpdated'));
        } catch (error) {
            setSettingsError(getLocalizedApiError(t, error, 'home.displayNameUpdateFailed'));
        } finally {
            setSettingsSavingProfile(false);
        }
    };

    const handleSettingsDeleteAccount = async (event) => {
        event.preventDefault();
        const currentPassword = String(settingsDeletePassword || '');
        const confirmText = String(settingsDeleteConfirm || '').trim();

        if (!currentPassword) {
            setSettingsError(t('home.deletePasswordRequired'));
            setSettingsMessage('');
            return;
        }
        if (confirmText !== 'HESABIMI SIL') {
            setSettingsError(t('home.deleteConfirmRequired'));
            setSettingsMessage('');
            return;
        }

        if (!window.confirm(t('home.deleteConfirmPrompt'))) {
            return;
        }

        setSettingsDeleting(true);
        setSettingsError('');
        setSettingsMessage('');
        try {
            const response = await profile.requestDeletion(currentPassword, confirmText);
            const message = response?.data?.message || t('home.deleteRequestSubmitted');
            setSettingsMessage(message);
            setSettingsDeletePassword('');
            setSettingsDeleteConfirm('');
            if (typeof onDeletionCompleted === 'function') {
                await onDeletionCompleted(message);
            }
        } catch (error) {
            setSettingsError(getLocalizedApiError(t, error, 'home.deleteRequestFailed'));
        } finally {
            setSettingsDeleting(false);
        }
    };

    const handleSettingsPasswordSave = async (event) => {
        event.preventDefault();
        const currentPassword = String(settingsCurrentPassword || '');
        const newPassword = String(settingsNewPassword || '');

        if (!currentPassword || !newPassword) {
            setSettingsError(t('home.passwordRequired'));
            setSettingsMessage('');
            return;
        }
        if (newPassword.length < 6) {
            setSettingsError(t('home.passwordMinLength'));
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
            setSettingsMessage(response?.data?.message || t('home.passwordUpdated'));
        } catch (error) {
            setSettingsError(getLocalizedApiError(t, error, 'home.passwordUpdateFailed'));
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
            setSupportError(t('home.mediaLimitError', { count: MAX_MEDIA_FILES }));
            return;
        }

        let totalBytes = 0;
        for (const file of merged) {
            totalBytes += Number(file.size) || 0;
            if ((Number(file.size) || 0) > MAX_MEDIA_FILE_BYTES) {
                setSupportError(t('home.mediaFileSizeError', { mb: Math.round(MAX_MEDIA_FILE_BYTES / (1024 * 1024)) }));
                return;
            }
            if (file.type && !/^(image|video)\//i.test(file.type)) {
                setSupportError(t('home.mediaTypeError'));
                return;
            }
        }

        if (totalBytes > MAX_MEDIA_TOTAL_BYTES) {
            setSupportError(t('home.mediaTotalSizeError', { mb: Math.round(MAX_MEDIA_TOTAL_BYTES / (1024 * 1024)) }));
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
            setSupportError(t('home.supportMinDescription'));
            return;
        }

        if (email && !isEmailValid(email)) {
            setSupportError(t('home.supportEmailInvalid'));
            return;
        }

        if (typeof onSupportSubmit !== 'function') {
            setSupportError(t('home.supportUnavailable'));
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

        setSupportError(result?.error || t('home.supportFailed'));
    };

    const handleLocaleSave = async (event) => {
        event.preventDefault();
        if (typeof onLocaleChange !== 'function') return;
        try {
            await onLocaleChange(settingsLocale);
            setSettingsMessage(t('home.languageUpdated'));
            setSettingsError('');
        } catch (error) {
            setSettingsError(getLocalizedApiError(t, error, 'common.error'));
        }
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
                            {onlineCount} {t('common.online')}
                        </span>
                    </div>
                    <div className="home-header-actions">
                        {onLogout && (
                            <button
                                onClick={onLogout}
                                className="btn-neon home-header-btn"
                                title={t('home.logout')}
                            >
                                {t('home.logout')}
                            </button>
                        )}
                        <button
                            onClick={openSettingsModal}
                            className="btn-neon home-header-btn home-settings-btn"
                            title={t('home.settingsTitle')}
                        >
                            {t('home.settingsTitle')}
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
                    <h3 style={{ fontSize: '1.2rem', color: 'var(--primary)', letterSpacing: 1 }}>{t('home.anonymous')}</h3>
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
                    <h3 style={{ fontSize: '1.2rem', color: 'var(--accent)', letterSpacing: 1 }}>{t('home.friends')}</h3>
                </div>
            </main>

            <footer className="center-flex home-footer">
                <p className="home-tagline">{footer.tagline}</p>
                <nav className="home-legal-links" aria-label={t('home.legalLinksAria')}>
                    <a
                        href={footer.privacyUrl}
                        className="home-legal-link"
                        {...(isExternalUrl(footer.privacyUrl) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    >
                        {footer.privacyLabel}
                    </a>
                    <span className="home-legal-separator">&middot;</span>
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
                aria-label={t('home.reportIssue')}
            >
                !
                <span>{t('home.reportIssue')}</span>
            </button>

            {supportOpen && (
                <div className="support-modal-overlay" onClick={closeSupportModal}>
                    <div className="support-modal-card glass-card" onClick={(event) => event.stopPropagation()}>
                        <div className="support-modal-header">
                            <h3>{t('home.supportTitle')}</h3>
                            <button type="button" className="support-close-btn" onClick={closeSupportModal} aria-label={t('common.close')}>x</button>
                        </div>

                        <form className="support-form" onSubmit={handleSupportSubmit}>
                            <label htmlFor="support-subject">{t('home.supportSubject')}</label>
                            <select
                                id="support-subject"
                                className="support-select input-glass"
                                value={supportSubject}
                                onChange={(event) => setSupportSubject(event.target.value)}
                                disabled={supportSubmitting}
                            >
                                {SUPPORT_SUBJECTS.map((item) => (
                                    <option key={item.value} value={item.value}>{t(item.labelKey, {}, item.value)}</option>
                                ))}
                            </select>

                            <label htmlFor="support-description">{t('home.supportDescription')}</label>
                            <textarea
                                id="support-description"
                                className="support-textarea input-glass"
                                value={supportDescription}
                                onChange={(event) => setSupportDescription(event.target.value)}
                                placeholder={t('home.supportDescriptionPlaceholder')}
                                maxLength={2000}
                                disabled={supportSubmitting}
                            />
                            <div className="support-counter">{supportDescription.trim().length}/2000</div>

                            <label htmlFor="support-email">{t('home.supportEmail')}</label>
                            <input
                                id="support-email"
                                type="email"
                                className="input-glass"
                                value={supportEmail}
                                onChange={(event) => setSupportEmail(event.target.value)}
                                placeholder={t('home.supportEmailPlaceholder')}
                                maxLength={254}
                                disabled={supportSubmitting}
                            />

                            <label htmlFor="support-media">{t('home.supportMedia')}</label>
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
                                            <button type="button" onClick={() => removeMediaFile(index)} disabled={supportSubmitting}>{t('common.delete')}</button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="support-auto-meta">
                                {t('home.supportAutoMeta')}
                            </div>

                            {supportError && <div className="support-error">{supportError}</div>}

                            <div className="support-actions">
                                <button type="button" className="btn-neon" onClick={closeSupportModal} disabled={supportSubmitting}>
                                    {t('home.supportCancel')}
                                </button>
                                <button type="submit" className="btn-solid-purple" disabled={supportSubmitting}>
                                    {supportSubmitting ? t('home.supportSending') : t('home.supportSubmit')}
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
                            <h3>{t('home.settingsTitle')}</h3>
                            <button type="button" className="support-close-btn" onClick={closeSettingsModal} aria-label={t('common.close')}>x</button>
                        </div>

                        <div className="settings-section">
                            <h4>{t('home.settingsAccountInfo')}</h4>
                            <label htmlFor="settings-username">{t('home.settingsUsername')}</label>
                            <input
                                id="settings-username"
                                className="input-glass settings-readonly"
                                value={currentUser?.username || ''}
                                readOnly
                            />
                        </div>

                        <form className="settings-section" onSubmit={handleLocaleSave}>
                            <h4>{t('home.languageTitle')}</h4>
                            <label htmlFor="settings-locale">{t('home.languageLabel')}</label>
                            <select
                                id="settings-locale"
                                className="input-glass support-select"
                                value={settingsLocale}
                                onChange={(event) => setSettingsLocale(event.target.value)}
                            >
                                <option value="tr">{t('home.languageTr')}</option>
                                <option value="en">{t('home.languageEn')}</option>
                            </select>
                            <div className="settings-actions">
                                <button type="submit" className="btn-solid-purple">{t('common.save')}</button>
                            </div>
                        </form>

                        <form className="settings-section" onSubmit={handleSettingsProfileSave}>
                            <h4>{t('home.settingsDisplayNameTitle')}</h4>
                            <label htmlFor="settings-display-name">{t('home.settingsDisplayName')}</label>
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
                                    {settingsSavingProfile ? t('home.settingsSaving') : t('home.settingsSave')}
                                </button>
                            </div>
                        </form>

                        <form className="settings-section" onSubmit={handleSettingsPasswordSave}>
                            <h4>{t('home.settingsPasswordTitle')}</h4>
                            <label htmlFor="settings-current-password">{t('home.settingsCurrentPassword')}</label>
                            <input
                                id="settings-current-password"
                                className="input-glass"
                                type={settingsShowPassword ? 'text' : 'password'}
                                value={settingsCurrentPassword}
                                onChange={(event) => setSettingsCurrentPassword(event.target.value)}
                                disabled={settingsSavingPassword}
                            />
                            <label htmlFor="settings-new-password">{t('home.settingsNewPassword')}</label>
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
                                {settingsShowPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                            </button>
                            <div className="settings-actions">
                                <button type="submit" className="btn-solid-purple" disabled={settingsSavingPassword}>
                                    {settingsSavingPassword ? t('home.settingsUpdating') : t('home.settingsChangePassword')}
                                </button>
                            </div>
                        </form>

                        <form className="settings-section" onSubmit={handleSettingsDeleteAccount}>
                            <h4>{t('home.settingsDeleteTitle')}</h4>
                            <label htmlFor="settings-delete-password">{t('home.settingsCurrentPassword')}</label>
                            <input
                                id="settings-delete-password"
                                className="input-glass"
                                type={settingsShowPassword ? 'text' : 'password'}
                                value={settingsDeletePassword}
                                onChange={(event) => setSettingsDeletePassword(event.target.value)}
                                disabled={settingsDeleting}
                            />
                            <label htmlFor="settings-delete-confirm">{t('home.settingsConfirmText')}</label>
                            <input
                                id="settings-delete-confirm"
                                className="input-glass"
                                value={settingsDeleteConfirm}
                                onChange={(event) => setSettingsDeleteConfirm(event.target.value)}
                                placeholder={t('home.settingsConfirmPlaceholder')}
                                disabled={settingsDeleting}
                            />
                            <div className="settings-delete-note">
                                {t('home.settingsDeleteNote')}
                            </div>
                            <div className="settings-actions">
                                <button type="submit" className="settings-delete-btn" disabled={settingsDeleting}>
                                    {settingsDeleting ? t('home.settingsWorking') : t('home.settingsDeleteAccount')}
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
