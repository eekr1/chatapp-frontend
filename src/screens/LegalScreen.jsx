import React, { useMemo } from 'react';

const SUPPORTED_LANGS = new Set(['tr', 'en']);

const resolveLang = () => {
    if (typeof window !== 'undefined') {
        try {
            const params = new URLSearchParams(window.location.search || '');
            const q = String(params.get('lang') || '').trim().toLowerCase();
            if (SUPPORTED_LANGS.has(q)) return q;
        } catch {
            // Ignore malformed query and continue with fallback chain.
        }
    }

    const navLang = typeof navigator !== 'undefined'
        ? String(navigator.language || navigator.userLanguage || '').trim().toLowerCase()
        : '';
    if (navLang.startsWith('en')) return 'en';
    if (navLang.startsWith('tr')) return 'tr';
    return 'tr';
};

const normalizeKind = (kind) => (kind === 'terms' ? 'terms' : 'privacy');

const LegalScreen = ({ kind = 'privacy', legalContent = null, loading = false }) => {
    const resolvedKind = normalizeKind(kind);
    const lang = useMemo(() => resolveLang(), []);

    const docs = legalContent?.documents || {};
    const selectedDoc = docs[resolvedKind] || {};
    const doc = selectedDoc[lang] || selectedDoc.tr || selectedDoc.en || {};
    const title = doc.title || (resolvedKind === 'privacy' ? 'Gizlilik Politikasi' : 'Kullanim Sartlari');
    const content = doc.content || '';

    return (
        <div className="screen-container legal-screen-wrap">
            <div className="legal-screen-card glass-card">
                <header className="legal-screen-header">
                    <a href="/" className="legal-back-link">TalkX</a>
                    <span className="legal-lang-pill">{lang.toUpperCase()}</span>
                </header>

                <h1 className="legal-screen-title">{title}</h1>

                {loading ? (
                    <p className="legal-screen-loading">Yukleniyor...</p>
                ) : (
                    <article className="legal-screen-content">{content}</article>
                )}
            </div>
        </div>
    );
};

export default LegalScreen;
