import { useState, useEffect } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../i18n/LanguageContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function SupplierLayout() {
  const { t, locale, toggleLocale } = useLanguage();
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Poll unread notifications every 60 seconds
  useEffect(() => {
    if (!token) return;
    const fetchUnread = () => {
      fetch(`${API_URL}/api/supplier/notifications?unreadOnly=1&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.unreadCount !== undefined) setUnreadCount(d.unreadCount); })
        .catch(() => {});
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 60000);
    return () => clearInterval(interval);
  }, [token]);

  const navItems = [
    { to: '/supplier/dashboard', label: t('supplier.navDashboard') },
    { to: '/supplier/products', label: t('supplier.navProducts') },
    { to: '/supplier/rfqs', label: t('supplier.navRfqs') },
    { to: '/supplier/agreements', label: t('supplier.navAgreements') },
    { to: '/supplier/notifications', label: t('supplier.navNotifications'), badge: unreadCount },
    { to: '/supplier/profile', label: t('supplier.navProfile') },
  ];

  return (
    <div className="portal-layout">
      <header className="portal-header">
        <div className="container portal-header-inner">
          <Link to="/supplier/dashboard" className="portal-brand">
            <img src="/shanan-logo.png" alt="SHANAN" width="32" height="32" className="portal-brand-logo" />
            <span className="portal-brand-name">SHANAN</span>
            <span className="portal-brand-portal">{t('supplier.portalLabel')}</span>
          </Link>
          <nav className="portal-nav">
            {navItems.map(item => (
              <Link key={item.to} to={item.to} className="portal-nav-link" style={{ position: 'relative' }}>
                {item.label}
                {'badge' in item && item.badge !== undefined && item.badge > 0 && (
                  <span style={{
                    position: 'absolute',
                    top: -6,
                    right: -10,
                    background: 'var(--color-error, #dc2626)',
                    color: '#fff',
                    borderRadius: 10,
                    fontSize: 10,
                    fontWeight: 700,
                    minWidth: 16,
                    height: 16,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 4px',
                    lineHeight: 1,
                  }}>
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
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
