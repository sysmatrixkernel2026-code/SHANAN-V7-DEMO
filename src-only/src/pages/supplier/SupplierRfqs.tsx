import { useState, useEffect, useCallback } from 'react';
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
  response_state: string;
  responded_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
  item_count: number;
  offer_count: number;
}

interface RfqListResponse {
  rfqs: SupplierRfq[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
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

const RESPONSE_STATE_BADGE: Record<string, string> = {
  pending: 'badge-warning',
  responded: 'badge-success',
  declined: 'badge-error',
};

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'sent', label: 'Sent' },
  { value: 'partially_responded', label: 'Partially Responded' },
  { value: 'responded', label: 'Responded' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function SupplierRfqs() {
  const { t } = useLanguage();
  const { token } = useAuth();
  const [data, setData] = useState<RfqListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const loadRfqs = useCallback(() => {
    if (!token) return;
    const params = new URLSearchParams({ page: String(page), pageSize: '15' });
    if (statusFilter) params.set('status', statusFilter);
    if (search) params.set('search', search);
    fetch(`${API_URL}/api/supplier/rfqs?${params}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed')))
      .then(d => setData(d))
      .catch(e => setError(e.message));
  }, [token, page, statusFilter, search]);

  useEffect(() => { loadRfqs(); }, [loadRfqs]);

  if (error) return <div className="admin-error-state"><p>{error}</p></div>;
  if (!data) return <LoadingState type="card" count={3} />;

  return (
    <div style={{ padding: '32px 0 64px' }}>
      <div className="page-header" style={{ marginBottom: 32 }}>
        <span className="admin-eyebrow">
          <span className="admin-eyebrow-dot" />
          {t('supplier.rfqEyebrow')}
        </span>
        <h1 className="page-title">{t('supplier.rfqTitle')}</h1>
        <p className="page-subtitle">{t('supplier.rfqSubtitle')}</p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder={t('supplier.rfqSearchPlaceholder')}
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

      {data.rfqs.length === 0 ? (
        <EmptyState title={t('supplier.noRfqs')} />
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'start' }}>{t('supplier.rfqReference')}</th>
                  <th style={{ textAlign: 'start' }}>{t('supplier.rfqRequestRef')}</th>
                  <th style={{ textAlign: 'start' }}>{t('supplier.rfqStatus')}</th>
                  <th style={{ textAlign: 'start' }}>{t('supplier.rfqResponse')}</th>
                  <th style={{ textAlign: 'center' }}>{t('supplier.rfqItems')}</th>
                  <th style={{ textAlign: 'center' }}>{t('supplier.rfqOffers')}</th>
                  <th style={{ textAlign: 'start' }}>{t('supplier.rfqCreated')}</th>
                  <th style={{ textAlign: 'end' }}></th>
                </tr>
              </thead>
              <tbody>
                {data.rfqs.map(rfq => (
                  <tr key={rfq.id}>
                    <td style={{ fontWeight: 500 }}>{rfq.reference}</td>
                    <td>{rfq.supply_request_reference || '—'}</td>
                    <td>
                      <span className={`badge ${RFQ_STATUS_BADGE[rfq.status] || 'badge-secondary'}`}>
                        {rfq.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${RESPONSE_STATE_BADGE[rfq.response_state] || 'badge-secondary'}`}>
                        {rfq.response_state}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>{rfq.offer_count}/{rfq.item_count}</td>
                    <td style={{ textAlign: 'center' }}>{rfq.offer_count}</td>
                    <td>{new Date(rfq.created_at).toLocaleDateString()}</td>
                    <td style={{ textAlign: 'end' }}>
                      <Link to={`/supplier/rfqs/${rfq.id}`} className="btn btn-ghost btn-sm">
                        {rfq.response_state === 'pending' && rfq.status === 'sent' ? t('supplier.rfqRespond') : t('supplier.viewDetails')}
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
