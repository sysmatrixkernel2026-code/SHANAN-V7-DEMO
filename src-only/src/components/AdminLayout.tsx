import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';

const adminNavItems = [
  { to: '/admin/supply-requests', label: 'nav.adminSupplyRequests', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { to: '/admin/suppliers', label: 'nav.adminSuppliers', icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75' },
  { to: '/admin/agreements', label: 'nav.adminAgreements', icon: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8' },
  { to: '/admin/rfqs', label: 'nav.adminRfqs', icon: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6' },
  { to: '/admin/purchase-requests', label: 'nav.adminPurchaseRequests', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2 M9 12h6 M9 16h6' },
  { to: '/admin/purchase-orders', label: 'nav.adminPurchaseOrders', icon: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M12 18v-6 M9 15h6' },
  { to: '/admin/products', label: 'nav.adminProducts', icon: 'M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z M7 7h.01' },
  { to: '/admin/opportunities', label: 'nav.adminOpportunities', icon: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z' },
  { to: '/admin/tasks', label: 'nav.adminTasks', icon: 'M9 11l3 3L22 4 M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11' },
];

export default function AdminLayout() {
  const { t, locale, toggleLocale } = useLanguage();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="admin-layout-shell">
      {/* Sidebar */}
      <aside className={`admin-sidebar ${sidebarOpen ? 'admin-sidebar-open' : ''}`}>
        <div className="admin-sidebar-header">
          <Link to="/admin/supply-requests" className="admin-sidebar-brand" onClick={() => setSidebarOpen(false)}>
            <img src="/shanan-logo.png" alt="SHANAN" width="28" height="28" className="admin-sidebar-logo" />
            <span className="admin-sidebar-brand-text">
              <span className="admin-sidebar-brand-name">SHANAN</span>
              <span className="admin-sidebar-brand-label">{t('nav.adminDashboard')}</span>
            </span>
          </Link>
        </div>

        <nav className="admin-sidebar-nav">
          {adminNavItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/admin/agreements' || item.to === '/admin/rfqs' || item.to === '/admin/supply-requests' || item.to === '/admin/products'}
              className={({ isActive }) => `admin-sidebar-link ${isActive ? 'admin-sidebar-link-active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <svg className="admin-sidebar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={item.icon} />
              </svg>
              <span>{t(item.label as any)}</span>
            </NavLink>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <button className="admin-sidebar-lang" onClick={toggleLocale}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
            </svg>
            <span>{locale === 'en' ? 'العربية' : 'English'}</span>
          </button>
          <div className="admin-sidebar-user">
            <span className="admin-sidebar-user-name">{user?.name}</span>
            <span className="admin-sidebar-user-role">{user?.role}</span>
          </div>
          <button className="admin-sidebar-logout" onClick={handleLogout}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>{t('portal.logout')}</span>
          </button>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && <div className="admin-sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      {/* Main content area */}
      <div className="admin-main-area">
        <header className="admin-topbar">
          <button className="admin-topbar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label={t('common.ariaMenu')}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="admin-topbar-title">{t('nav.adminDashboard')}</span>
          <div className="admin-topbar-user">
            <span className="admin-topbar-user-name">{user?.name}</span>
          </div>
        </header>
        <main className="admin-main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
