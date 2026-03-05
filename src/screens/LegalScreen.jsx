import React from 'react';
import { toSupportedLocale, useI18n } from '../i18n';

const normalizeKind = (kind) => (kind === 'terms' ? 'terms' : 'privacy');

const readQueryLang = () => {
    if (typeof window === 'undefined') return null;
    try {
        const params = new URLSearchParams(window.location.search || '');
        return toSupportedLocale(params.get('lang'), null);
    } catch {
        return null;
    }
};

const pickLocalizedDoc = (docByLang = {}, lang = 'en') => {
    if (!docByLang || typeof docByLang !== 'object') return {};
    return docByLang[lang] || docByLang.en || docByLang.tr || {};
};

const LegalScreen = ({ kind = 'privacy', legalContent = null, loading = false }) => {
    const { locale, t } = useI18n();
    const resolvedKind = normalizeKind(kind);
    const queryLang = readQueryLang();
    const activeLang = queryLang || toSupportedLocale(locale, 'en');

    const docs = legalContent?.documents || {};
    const selectedDoc = docs[resolvedKind] || {};
    const doc = pickLocalizedDoc(selectedDoc, activeLang);
    const title = doc.title || (resolvedKind === 'privacy' ? 'Privacy Policy' : 'Terms of Use');
    const content = doc.content || '';

    return (
        <div className="screen-container legal-screen-wrap">
            <div className="legal-screen-card glass-card">
                <header className="legal-screen-header">
                    <div className="legal-header-left">
                        <a href="/" className="legal-back-link">TalkX</a>
                        <a href="/" className="legal-back-btn" aria-label={t('legal.backHome')}>
                            {t('legal.backHome')}
                        </a>
                    </div>
                    <span className="legal-lang-pill">{activeLang.toUpperCase()}</span>
                </header>

                <h1 className="legal-screen-title">{title}</h1>

                {loading ? (
                    <p className="legal-screen-loading">{t('common.loading')}</p>
                ) : (
                    <article className="legal-screen-content">{content}</article>
                )}
            </div>
        </div>
    );
};

export default LegalScreen;
