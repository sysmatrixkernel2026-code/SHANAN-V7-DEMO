import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { LoadingState, EmptyState } from '../../components/LoadingEmptyStates';

const API_URL = import.meta.env.VITE_API_URL || '';

interface SupplierRfq {
  id: string;
  reference: string;
  status: string;
  supply_request_reference: string | null;
  created_at: string;
  updated_at: string;
}

interface Summary {
  totalProducts: number;
  activeProducts: number;
  withPrice: number;
  withoutPrice: number;
  activeRfqs: number;
}

const RFQ_STATUS_BADGE: Record<string, string> = {
  draft: 'badge-secondary',
  ready_to_send: 'badge-info',
  sent: 'badge-warning',
  partially_responded: 'badge-info',
  responded: 'badge-success',
  closed: 'badge-secondary',
  cancelled: 'badge-error',
};

export default function SupplierDashboard() {
  const { t } = useLanguage();
  const { token } = useAuth();
  const [rfqs, setRfqs] = useState<SupplierRfq[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api/supplier/rfqs`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed')))
      .then(d => setRfqs(d.rfqs || []))
      .catch(e => setError(e.message));

    fetch(`${API_URL}/api/supplier/products/summary`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setSummary(d))
      .catch(() => {});
  }, [token]);

  if (error) return <div className="admin-error-state"><p>{error}</p></div>;
  if (!rfqs) return <LoadingState type="card" count={3} />;

  return (
    <div style={{ padding: '32px 0 64px' }}>
      <div className="page-header" style={{ marginBottom: 32 }}>
        <span className="admin-eyebrow">
          <span className="admin-eyebrow-dot" />
          {t('supplier.dashboardEyebrow')}
        </span>
        <h1 className="page-title">{t('supplier.dashboardTitle')}</h1>
        <p className="page-subtitle">{t('supplier.dashboardSubtitle')}</p>
      </div>

      {/* Product Summary Cards */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 32 }}>
          <Link to="/supplier/products" className="card" style={{ padding: '16px 20px', textDecoration: 'none', color: 'inherit', textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-navy, #1a2744)' }}>{summary.totalProducts}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{t('supplier.summaryTotal')}</div>
          </Link>
          <Link to="/supplier/products" className="card" style={{ padding: '16px 20px', textDecoration: 'none', color: 'inherit', textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#16a34a' }}>{summary.activeProducts}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{t('supplier.summaryActive')}</div>
          </Link>
          <div className="card" style={{ padding: '16px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#2563eb' }}>{summary.withPrice}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{t('supplier.summaryWithPrice')}</div>
          </div>
          <div className="card" style={{ padding: '16px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#d97706' }}>{summary.withoutPrice}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{t('supplier.summaryWithoutPrice')}</div>
          </div>
          <div className="card" style={{ padding: '16px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-navy, #1a2744)' }}>{summary.activeRfqs}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{t('supplier.summaryActiveRfqs')}</div>
          </div>
        </div>
      )}

      {/* RFQs Section */}
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>{t('supplier.navRfqs')}</h2>
      {rfqs.length === 0 ? (
        <EmptyState title={t('supplier.noRfqs')} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rfqs.map(rfq => (
            <Link
              key={rfq.id}
              to={`/supplier/rfqs/${rfq.id}`}
              className="card"
              style={{ padding: '16px 20px', textDecoration: 'none', color: 'inherit', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{rfq.reference}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {rfq.supply_request_reference || '—'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className={`badge ${RFQ_STATUS_BADGE[rfq.status] || 'badge-secondary'}`}>
                  {rfq.status.replace(/_/g, ' ')}
                </span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
