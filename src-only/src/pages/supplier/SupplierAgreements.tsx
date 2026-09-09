import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { LoadingState, EmptyState } from '../../components/LoadingEmptyStates';

const API_URL = import.meta.env.VITE_API_URL || '';

interface Agreement {
  id: string;
  agreement_number: string;
  status: string;
  effective_from: string | null;
  effective_to: string | null;
  currency: string;
  payment_terms_days: number | null;
  supplier_credit_limit: string | null;
  trade_terms_notes: string | null;
  created_at: string;
  updated_at: string;
  term_count: number;
  active_term_count: number;
}

interface AgreementsResponse {
  agreements: Agreement[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const STATUS_BADGE: Record<string, string> = {
  draft: 'badge-neutral',
  active: 'badge-success',
  suspended: 'badge-warning',
  expired: 'badge-info',
  terminated: 'badge-error',
};

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'expired', label: 'Expired' },
  { value: 'terminated', label: 'Terminated' },
];

export default function SupplierAgreements() {
  const { t } = useLanguage();
  const { token } = useAuth();
  const [data, setData] = useState<AgreementsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const loadAgreements = useCallback(() => {
    if (!token) return;
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (statusFilter) params.set('status', statusFilter);
    if (search) params.set('search', search);
    fetch(`${API_URL}/api/supplier/agreements?${params}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed')))
      .then(d => setData(d))
      .catch(e => setError(e.message));
  }, [token, page, statusFilter, search]);

  useEffect(() => { loadAgreements(); }, [loadAgreements]);

  if (error) return <div className="admin-error-state"><p>{error}</p></div>;
  if (!data) return <LoadingState type="card" count={3} />;

  return (
    <div style={{ padding: '32px 0 64px' }}>
      <div className="page-header" style={{ marginBottom: 32 }}>
        <span className="admin-eyebrow">
          <span className="admin-eyebrow-dot" />
          {t('supplier.agrEyebrow')}
        </span>
        <h1 className="page-title">{t('supplier.agrTitle')}</h1>
        <p className="page-subtitle">{t('supplier.agrSubtitle')}</p>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder={t('supplier.agrSearchPlaceholder')}
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="input"
          style={{ flex: '1 1 200px', maxWidth: 320 }}
        />
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="input"
          style={{ width: 180 }}
        >
          {STATUS_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {data.agreements.length === 0 ? (
        <EmptyState title={t('supplier.noAgreements')} />
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'start' }}>{t('supplier.agrRef')}</th>
                  <th style={{ textAlign: 'start' }}>{t('supplier.agrStatus')}</th>
                  <th style={{ textAlign: 'start' }}>{t('supplier.agrCurrency')}</th>
                  <th style={{ textAlign: 'start' }}>{t('supplier.agrPaymentTerms')}</th>
                  <th style={{ textAlign: 'start' }}>{t('supplier.agrEffectiveFrom')}</th>
                  <th style={{ textAlign: 'start' }}>{t('supplier.agrEffectiveTo')}</th>
                  <th style={{ textAlign: 'center' }}>{t('supplier.agrProductTerms')}</th>
                  <th style={{ textAlign: 'end' }}></th>
                </tr>
              </thead>
              <tbody>
                {data.agreements.map(a => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 500 }}>{a.agreement_number}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[a.status] || 'badge-neutral'}`}>
                        {a.status}
                      </span>
                    </td>
                    <td>{a.currency}</td>
                    <td>{a.payment_terms_days != null ? `Net ${a.payment_terms_days}` : '—'}</td>
                    <td>{a.effective_from ? new Date(a.effective_from).toLocaleDateString() : '—'}</td>
                    <td>{a.effective_to ? new Date(a.effective_to).toLocaleDateString() : '—'}</td>
                    <td style={{ textAlign: 'center' }}>{a.active_term_count}/{a.term_count}</td>
                    <td style={{ textAlign: 'end' }}>
                      <Link to={`/supplier/agreements/${a.id}`} className="btn btn-ghost btn-sm">
                        {t('supplier.viewDetails')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 24 }}>
              <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t('common.prev')}</button>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '6px 12px' }}>{data.page} / {data.totalPages}</span>
              <button className="btn btn-ghost btn-sm" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}>{t('common.next')}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
