import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { LoadingState, EmptyState } from '../components/LoadingEmptyStates';

// ============================================================
// RfqsAdmin — Internal SHANAN staff page.
// Route: /admin/rfqs  (ProtectedRoute requireInternal)
//
// Lists all RFQs / sourcing cases with key operational info.
// Internal-only — never linked from Customer Portal.
// ============================================================

const API_URL = import.meta.env.VITE_API_URL || '';

interface Rfq {
  id: string;
  reference: string;
  supply_request_id: string;
  supply_request_reference: string | null;
  supply_request_status: string | null;
  status: 'draft' | 'ready_to_send' | 'sent' | 'partially_responded' | 'responded' | 'closed' | 'cancelled';
  sent_at: string | null;
  closed_at: string | null;
  internal_notes: string | null;
  created_at: string;
  // computed aggregates from the API
  suppliers_count: number;
  responded_count: number;
  items_count: number;
}

const STATUS_BADGE: Record<string, string> = {
  draft: 'badge-neutral',
  ready_to_send: 'badge-info',
  sent: 'badge-info',
  partially_responded: 'badge-warning',
  responded: 'badge-success',
  closed: 'badge-success',
  cancelled: 'badge-error',
};

const STATUS_LABEL_KEYS: Record<string, 'rfq.statusDraft' | 'rfq.statusReadyToSend' | 'rfq.statusSent' | 'rfq.statusPartiallyResponded' | 'rfq.statusResponded' | 'rfq.statusClosed' | 'rfq.statusCancelled'> = {
  draft: 'rfq.statusDraft',
  ready_to_send: 'rfq.statusReadyToSend',
  sent: 'rfq.statusSent',
  partially_responded: 'rfq.statusPartiallyResponded',
  responded: 'rfq.statusResponded',
  closed: 'rfq.statusClosed',
  cancelled: 'rfq.statusCancelled',
};

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }); }
  catch { return iso; }
}

export default function RfqsAdmin() {
  const { t } = useLanguage();
  const { token } = useAuth();

  const [list, setList] = useState<Rfq[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);

  const loadList = useCallback(async () => {
    if (!token) return;
    setListLoading(true);
    setListError(null);
    try {
      const res = await fetch(`${API_URL}/api/rfqs`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.status === 401) {
        setListError('Authentication required');
        setList([]);
        return;
      }
      if (res.status === 403) {
        setListError('Internal access required');
        setList([]);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setList(data.rfqs ?? []);
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Could not load RFQs.');
      setList(null);
    } finally {
      setListLoading(false);
    }
  }, [token]);

  useEffect(() => { loadList(); }, [loadList]);

  return (
    <div className="container" style={{ padding: '40px 0 64px' }}>
      <div className="page-header" style={{ marginBottom: 32 }}>
        <span className="admin-eyebrow">
          <span className="admin-eyebrow-dot" />
          {t('rfq.eyebrow')}
        </span>
        <h1 className="page-title">{t('rfq.title')}</h1>
        <p className="page-subtitle">{t('rfq.subtitle')}</p>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/admin/supply-requests" className="btn btn-ghost btn-sm">{t('admin.title')}</Link>
          <Link to="/admin/suppliers" className="btn btn-ghost btn-sm">{t('suppliers.title')}</Link>
          <Link to="/admin/agreements" className="btn btn-ghost btn-sm">{t('agreements.title')}</Link>
        </div>
      </div>

      <div className="admin-layout">
        <section className="admin-list-panel" aria-label="RFQ list">
          <header className="admin-list-header">
            <h2 className="admin-list-title">
              {t('rfq.title')}
              {list && <span className="admin-list-count">({list.length})</span>}
            </h2>
            <button type="button" className="btn btn-ghost btn-sm" onClick={loadList} disabled={listLoading}>
              {t('rfq.refresh')}
            </button>
          </header>

          {listLoading && <LoadingState type="card" count={3} />}

          {listError && !listLoading && (
            <div className="admin-error-state" role="alert">
              <p className="admin-error-title">{t('rfq.loadError')}</p>
              <p className="admin-error-detail">{listError}</p>
              <button type="button" className="btn btn-outline btn-sm" onClick={loadList}>{t('admin.retry')}</button>
            </div>
          )}

          {!listLoading && !listError && list && list.length === 0 && (
            <EmptyState title={t('rfq.emptyTitle')} description={t('rfq.emptyDesc')} />
          )}

          {!listLoading && !listError && list && list.length > 0 && (
            <ul className="admin-request-list">
              {list.map(r => (
                <li key={r.id}>
                  <Link to={`/admin/rfqs/${r.id}`} className="admin-request-row" style={{ display: 'block', padding: 12, textDecoration: 'none', color: 'inherit' }}>
                    <div className="admin-request-row-top">
                      <span className="admin-request-reference">{r.reference}</span>
                      <span className={`badge ${STATUS_BADGE[r.status] || 'badge-neutral'}`}>
                        {t(STATUS_LABEL_KEYS[r.status] || 'rfq.statusDraft')}
                      </span>
                    </div>
                    <div className="admin-request-row-mid">
                      <span className="admin-request-name">{r.supply_request_reference || r.supply_request_id}</span>
                    </div>
                    <div className="admin-request-row-bot">
                      <span className="admin-request-location">
                        {t('rfq.colSuppliers')}: {r.suppliers_count} ({r.responded_count} {t('rfq.colResponse')}) · {t('rfq.colItems')}: {r.items_count}
                      </span>
                      <span className="admin-request-date">{formatDate(r.created_at)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="admin-detail-panel">
          {!listLoading && !listError && list && (
            <div className="admin-detail-empty">
              <p>{t('rfq.selectPrompt')}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
