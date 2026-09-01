import { Link } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';

export default function Footer() {
  const { t, locale, setLocale } = useLanguage();
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="container footer-inner">
        {/* Brand column */}
        <div className="footer-col footer-col-brand">
          <Link to="/" className="footer-logo">
            <img src="/shanan-logo.png" alt="SHANAN — Engineering Knowledge Platform" className="logo-mark-img footer-logo-img" width="48" height="48" />
            <span className="logo-name">SHANAN</span>
          </Link>
          <p className="footer-about-text">{t('footer.aboutDesc')}</p>
          <p className="footer-placeholder-tag">{t('footer.placeholder')}</p>
        </div>

        {/* Catalog column */}
        <div className="footer-col">
          <h4 className="footer-col-title">{t('nav.catalog')}</h4>
          <ul className="footer-links">
            <li><Link to="/catalog">{t('nav.catalog')}</Link></li>
            <li><Link to="/categories">{t('nav.categories')}</Link></li>
            <li><Link to="/brands">{t('nav.brands')}</Link></li>
            <li><Link to="/supply-request">{t('nav.supplyRequest')}</Link></li>
          </ul>
        </div>

        {/* Company column */}
        <div className="footer-col">
          <h4 className="footer-col-title">{t('footer.company')}</h4>
          <ul className="footer-links">
            <li><Link to="/about">{t('nav.about')}</Link></li>
            <li><Link to="/contact">{t('nav.contact')}</Link></li>
          </ul>
        </div>

        {/* Contact + Language column */}
        <div className="footer-col">
          <h4 className="footer-col-title">{t('footer.contact')}</h4>
          <ul className="footer-links footer-contact-list">
            <li>{t('contact.address')}: —</li>
            <li>{t('contact.phoneLabel')}: —</li>
            <li>{t('contact.emailLabel')}: —</li>
            <li>{t('contact.hours')}: {t('contact.hoursValue')}</li>
          </ul>
          <div className="footer-language">
            <h4 className="footer-col-title">{t('footer.language')}</h4>
            <div className="footer-lang-group">
              <button
                className={`footer-lang-btn ${locale === 'en' ? 'footer-lang-active' : ''}`}
                onClick={() => setLocale('en')}
              >
                English
              </button>
              <span className="footer-lang-sep">|</span>
              <button
                className={`footer-lang-btn ${locale === 'ar' ? 'footer-lang-active' : ''}`}
                onClick={() => setLocale('ar')}
              >
                العربية
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <div className="container footer-bottom-inner">
          <span>© {year} SHANAN. {t('footer.rights')}</span>
          <span>{t('footer.placeholder')}</span>
        </div>
      </div>
    </footer>
  );
}
