import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { useSupplyRequest } from '../context/SupplyRequestContext';

export default function Header() {
  const { t, locale, toggleLocale } = useLanguage();
  const { itemCount } = useSupplyRequest();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/catalog?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
      setMobileMenuOpen(false);
    }
  };

  const closeMenu = () => setMobileMenuOpen(false);

  const navItems = [
    { to: '/', label: t('nav.home') },
    { to: '/catalog', label: t('nav.catalog') },
    { to: '/categories', label: t('nav.categories') },
    { to: '/brands', label: t('nav.brands') },
    { to: '/supply-request', label: t('nav.supplyRequest') },
    { to: '/about', label: t('nav.about') },
    { to: '/contact', label: t('nav.contact') },
  ];

  const langSwitch = (
    <div className="lang-switcher-group">
      <button
        type="button"
        className={`lang-switcher-btn ${locale === 'en' ? 'lang-switcher-active' : ''}`}
        onClick={() => locale !== 'en' && toggleLocale()}
      >
        English
      </button>
      <span className="lang-switcher-sep">|</span>
      <button
        type="button"
        className={`lang-switcher-btn ${locale === 'ar' ? 'lang-switcher-active' : ''}`}
        onClick={() => locale !== 'ar' && toggleLocale()}
      >
        العربية
      </button>
    </div>
  );

  return (
    <header className={`header ${scrolled ? 'header-scrolled' : ''}`}>
      {/* Primary row */}
      <div className="header-main">
        <div className="container header-main-inner">
          <Link to="/" className="logo" onClick={closeMenu} aria-label="SHANAN — Home">
            <img src="/shanan-logo.png" alt="SHANAN — Engineering Knowledge Platform" className="logo-mark-img" width="44" height="44" />
            <span className="logo-text">
              <span className="logo-name">SHANAN</span>
              <span className="logo-tagline">{t('brand.tagline')}</span>
            </span>
          </Link>

          <form className="header-search" onSubmit={handleSearch} role="search">
            <SearchIcon />
            <input
              type="search"
              className="header-search-input"
              placeholder={t('nav.searchPlaceholder')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              aria-label={t('nav.search')}
            />
            <button type="submit" className="header-search-btn" aria-label={t('nav.search')}>
              <span className="header-search-btn-text">{t('nav.search')}</span>
            </button>
          </form>

          <Link to="/supply-request" className="header-cta" onClick={closeMenu} aria-label={t('nav.supplyRequest')}>
            <CartIcon />
            <span className="header-cta-text">{t('nav.supplyRequest')}</span>
            {itemCount > 0 && <span className="header-supply-count header-cta-count">{itemCount}</span>}
          </Link>

          <div className="header-lang">{langSwitch}</div>

          <Link to="/login" className="header-signin" onClick={closeMenu}>
            <UserIcon />
            <span className="header-signin-text">{t('nav.signIn')}</span>
          </Link>

          <button
            type="button"
            className="mobile-menu-toggle"
            onClick={() => setMobileMenuOpen(v => !v)}
            aria-label={t('common.ariaMenu')}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      {/* Secondary navigation */}
      <nav className={`header-nav ${mobileMenuOpen ? 'header-nav-open' : ''}`}>
        <div className="container header-nav-inner">
          <div className="header-nav-mobile-top">
            <form className="header-nav-search" onSubmit={handleSearch} role="search">
              <SearchIcon />
              <input
                type="search"
                className="header-nav-search-input"
                placeholder={t('nav.searchPlaceholder')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                aria-label={t('nav.search')}
              />
            </form>
          </div>

          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `header-nav-link ${isActive ? 'header-nav-link-active' : ''}`}
              onClick={closeMenu}
            >
              {item.label}
            </NavLink>
          ))}

          <div className="header-nav-mobile-actions">
            <Link to="/supply-request" className="header-nav-mobile-btn" onClick={closeMenu}>
              <CartIcon />
              <span>{t('nav.supplyRequest')}</span>
            </Link>
            <Link to="/login" className="header-nav-mobile-btn" onClick={closeMenu}>
              <UserIcon />
              <span>{t('nav.signIn')}</span>
            </Link>
            {langSwitch}
          </div>
        </div>
      </nav>
    </header>
  );
}

/* ---- Icons ---- */
function SearchIcon() {
  return (
    <svg className="header-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
function CartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
}
function MenuIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}