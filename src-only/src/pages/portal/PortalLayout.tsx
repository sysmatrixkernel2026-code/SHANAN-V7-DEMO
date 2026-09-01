import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../i18n/LanguageContext';

export default function PortalLayout() {
  const { t, locale, toggleLocale } = useLanguage();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/portal/my-requests', label: t('portal.myRequests') },
    { to: '/portal/new-request', label: t('portal.newRequest') },
    { to: '/portal/my-company', label: t('portal.myCompany') },
  ];

  return (
    <div className="portal-layout">
      <header className="portal-header">
        <div className="container portal-header-inner">
          <Link to="/portal/my-requests" className="portal-brand">
            <img src="/shanan-logo.png" alt="SHANAN" width="32" height="32" className="portal-brand-logo" />
            <span className="portal-brand-name">SHANAN</span>
            <span className="portal-brand-portal">{t('portal.portal')}</span>
          </Link>
          <nav className="portal-nav">
            {navItems.map(item => (
              <Link key={item.to} to={item.to} className="portal-nav-link">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="portal-user-area">
            <span className="portal-user-name">{user?.name}</span>
            <button className="portal-lang-btn" onClick={toggleLocale}>
              {locale === 'en' ? 'العربية' : 'English'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
              {t('portal.logout')}
            </button>
          </div>
        </div>
      </header>
      <main className="portal-main">
        <div className="container">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
