import { Link } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';

export default function NotFound() {
  const { t } = useLanguage();

  return (
    <div className="container" style={{ padding: '80px 0', textAlign: 'center' }}>
      <div className="empty-state">
        <div className="empty-state-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h1 className="empty-state-title">{t('notFound.title')}</h1>
        <p className="empty-state-desc">{t('notFound.description')}</p>
        <div className="empty-state-action">
          <Link to="/" className="btn btn-primary">{t('notFound.goHome')}</Link>
          <Link to="/catalog" className="btn btn-outline" style={{ marginLeft: 12 }}>{t('notFound.goCatalog')}</Link>
        </div>
      </div>
    </div>
  );
}
