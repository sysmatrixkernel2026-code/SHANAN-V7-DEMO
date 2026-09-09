import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { LoadingState, EmptyState } from '../components/LoadingEmptyStates';

/**
 * SupplyRequestsAdmin — Internal SHANAN staff page.
 * Route: /admin/supply-requests
 *
 * Loads real supply requests from the local Bun API (port 3001)
 * and shows the request list + a detail panel with linked items.
 *
 * Requires authenticated internal access.
 */

// ---- API response shapes (match api/server.ts) ----
interface AdminRequestSummary {
  id: string;
  reference: string;
  requester_name: string;
  company_name: string;
  email: string;
  phone: string;
  country: string;
  city: string;
  message: string | null;
  status: 'pending' | 'draft' | 'submitted' | 'under_review' | 'processing' | 'ready_for_commercial_action' | 'reviewing' | 'quoted' | 'fulfilled' | 'rejected' | 'closed';
  created_at: string;
}

interface AdminRequestItem {
  id: number;
  request_id: string;
  product_id: string;
  product_name: string;
  sku: string;
  quantity: number;
  notes: string | null;
}

interface AdminRequestDetail {
  request: AdminRequestSummary;
  items: AdminRequestItem[];
}

interface ListResponse {
  requests: AdminRequestSummary[];
  count: number;
}

const API_URL = import.meta.env.VITE_API_URL || '';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under Review',
  processing: 'Processing',
  ready_for_commercial_action: 'Ready for Action',
  reviewing: 'Reviewing',
  quoted: 'Quoted',
  fulfilled: 'Fulfilled',
  rejected: 'Rejected',
  closed: 'Closed',
};

const STATUS_BADGE: Record<string, string> = {
  pending: 'badge-warning',
  draft: 'badge-warning',
  submitted: 'badge-info',
  under_review: 'badge-info',
  processing: 'badge-info',
  ready_for_commercial_action: 'badge-success',
  reviewing: 'badge-info',
  quoted: 'badge-info',
  fulfilled: 'badge-success',
  rejected: 'badge-error',
  closed: 'badge-success',
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function SupplyRequestsAdmin() {
  const { t } = useLanguage();
  const { token } = useAuth();

  const [list, setList] = useState<AdminRequestSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminRequestDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Load list
  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const res = await fetch(`${API_URL}/api/supply-requests`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ListResponse;
      setList(data.requests ?? []);
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Could not load supply requests.');
      setList(null);
    } finally {
      setListLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  // Load detail when selection changes
  const selectRequest = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/supply-requests/${encodeURIComponent(id)}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as AdminRequestDetail;
      setDetail(data);
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : 'Could not load request details.');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, [token]);

  // Real summary metrics derived from the loaded list
  const summary = list
    ? {
        total: list.length,
        pending: list.filter(r => r.status === 'pending' || r.status === 'draft' || r.status === 'submitted').length,
        inReview: list.filter(r => r.status === 'under_review' || r.status === 'processing' || r.status === 'reviewing').length,
        ready: list.filter(r => r.status === 'ready_for_commercial_action').length,
        closed: list.filter(r => r.status === 'closed' || r.status === 'fulfilled').length,
        rejected: list.filter(r => r.status === 'rejected').length,
      }
    : null;

  return (
    <div className="container" style={{ padding: '40px 0 64px' }}>
      {/* Page header */}
      <div className="page-header" style={{ marginBottom: 32 }}>
        <span className="admin-eyebrow">
          <span className="admin-eyebrow-dot" />
          {t('admin.eyebrow')}
        </span>
        <h1 className="page-title">{t('admin.title')}</h1>
        <p className="page-subtitle">{t('admin.subtitle')}</p>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/admin/suppliers" className="btn btn-ghost btn-sm">{t('suppliers.title')}</Link>
          <Link to="/admin/agreements" className="btn btn-ghost btn-sm">{t('agreements.title')}</Link>
          <Link to="/admin/rfqs" className="btn btn-ghost btn-sm">{t('rfq.title')}</Link>
        </div>
      </div>

      {/* Summary tiles — only when real list is loaded */}
      {summary && (
        <div className="admin-summary-grid">
          <SummaryTile label={t('admin.summaryTotal')} value={summary.total} variant="primary" />
          <SummaryTile label={t('admin.summaryPending')} value={summary.pending} variant="warning" />
          {summary.inReview > 0 && (
            <SummaryTile label="In Review" value={summary.inReview} variant="info" />
          )}
          {summary.ready > 0 && (
            <SummaryTile label="Ready" value={summary.ready} variant="success" />
          )}
          {summary.closed > 0 && (
            <SummaryTile label="Closed" value={summary.closed} variant="success" />
          )}
          {summary.rejected > 0 && (
            <SummaryTile label={t('admin.summaryRejected')} value={summary.rejected} variant="error" />
          )}
        </div>
      )}

      {/* List + Detail layout */}
      <div className="admin-layout">
        {/* LIST */}
        <section className="admin-list-panel" aria-label="Supply requests list">
          <header className="admin-list-header">
            <h2 className="admin-list-title">
              {t('admin.listTitle')}
              {list && <span className="admin-list-count">({list.length})</span>}
            </h2>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={loadList}
              disabled={listLoading}
              aria-label="Refresh list"
            >
              <RefreshIcon spinning={listLoading} />
              <span style={{ marginInlineStart: 6 }}>{t('admin.refresh')}</span>
            </button>
          </header>

          {listLoading && <LoadingState type="card" count={3} />}

          {listError && !listLoading && (
            <div className="admin-error-state" role="alert">
              <AlertIcon />
              <div>
                <p className="admin-error-title">{t('admin.loadError')}</p>
                <p className="admin-error-detail">{listError}</p>
                <button type="button" className="btn btn-outline btn-sm" onClick={loadList}>
                  {t('admin.retry')}
                </button>
              </div>
            </div>
          )}

          {!listLoading && !listError && list && list.length === 0 && (
            <EmptyState
              title={t('admin.emptyTitle')}
              description={t('admin.emptyDesc')}
              icon={<InboxIcon />}
              action={
                <Link to="/supply-request" className="btn btn-primary btn-sm">
                  {t('admin.emptyCta')}
                </Link>
              }
            />
          )}

          {!listLoading && !listError && list && list.length > 0 && (
            <ul className="admin-request-list">
              {list.map(r => {
                const isActive = selectedId === r.id || selectedId === r.reference;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      className={`admin-request-row ${isActive ? 'admin-request-row-active' : ''}`}
                      onClick={() => selectRequest(r.id)}
                      aria-pressed={isActive}
                    >
                      <div className="admin-request-row-top">
                        <span className="admin-request-reference">{r.reference}</span>
                        <span className={`badge ${STATUS_BADGE[r.status]}`}>
                          {STATUS_LABELS[r.status]}
                        </span>
                      </div>
                      <div className="admin-request-row-mid">
                        <span className="admin-request-name">{r.requester_name}</span>
                        <span className="admin-request-sep">·</span>
                        <span className="admin-request-company">{r.company_name}</span>
                      </div>
                      <div className="admin-request-row-bot">
                        <span className="admin-request-location">
                          <PinIcon />
                          {r.city}, {r.country}
                        </span>
                        <span className="admin-request-date">{formatDate(r.created_at)}</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* DETAIL */}
        <section className="admin-detail-panel" aria-label="Request details">
          {!selectedId && !detailLoading && !detail && !detailError && (
            <div className="admin-detail-empty">
              <ClipboardIcon />
              <p>{t('admin.selectPrompt')}</p>
            </div>
          )}

          {detailLoading && <LoadingState type="detail" />}

          {detailError && !detailLoading && (
            <div className="admin-error-state" role="alert">
              <AlertIcon />
              <div>
                <p className="admin-error-title">{t('admin.detailLoadError')}</p>
                <p className="admin-error-detail">{detailError}</p>
              </div>
            </div>
          )}

          {detail && !detailLoading && !detailError && (
            <article className="admin-detail-card">
              {/* Detail header */}
              <header className="admin-detail-header">
                <div>
                  <span className="admin-detail-eyebrow">{t('admin.detailReference')}</span>
                  <h3 className="admin-detail-reference">{detail.request.reference}</h3>
                </div>
                <span className={`badge ${STATUS_BADGE[detail.request.status]}`}>
                  {STATUS_LABELS[detail.request.status]}
                </span>
              </header>

              {/* A11 nav link to sourcing evaluation */}
              <div style={{ marginBottom: 16 }}>
                <Link to={`/admin/supply-requests/${detail.request.id}/sourcing`} className="btn btn-outline btn-sm">
                  {t('sourcing.evaluateSourcing')}
                </Link>
              </div>

              {/* Meta */}
              <div className="admin-detail-meta">
                <div className="admin-detail-meta-item">
                  <span className="admin-detail-meta-label">{t('admin.detailCreatedAt')}</span>
                  <span className="admin-detail-meta-value">{formatDate(detail.request.created_at)}</span>
                </div>
                <div className="admin-detail-meta-item">
                  <span className="admin-detail-meta-label">{t('admin.detailRequestId')}</span>
                  <span className="admin-detail-meta-value mono">{detail.request.id}</span>
                </div>
              </div>

              {/* Requester info */}
              <section className="admin-detail-section">
                <h4 className="admin-detail-section-title">{t('admin.detailRequesterInfo')}</h4>
                <dl className="admin-detail-grid">
                  <div className="admin-detail-field">
                    <dt>{t('admin.fieldRequesterName')}</dt>
                    <dd>{detail.request.requester_name}</dd>
                  </div>
                  <div className="admin-detail-field">
                    <dt>{t('admin.fieldCompany')}</dt>
                    <dd>{detail.request.company_name}</dd>
                  </div>
                  <div className="admin-detail-field">
                    <dt>{t('admin.fieldEmail')}</dt>
                    <dd>
                      <a href={`mailto:${detail.request.email}`}>{detail.request.email}</a>
                    </dd>
                  </div>
                  <div className="admin-detail-field">
                    <dt>{t('admin.fieldPhone')}</dt>
                    <dd>
                      <a href={`tel:${detail.request.phone}`}>{detail.request.phone}</a>
                    </dd>
                  </div>
                  <div className="admin-detail-field">
                    <dt>{t('admin.fieldCountry')}</dt>
                    <dd>{detail.request.country}</dd>
                  </div>
                  <div className="admin-detail-field">
                    <dt>{t('admin.fieldCity')}</dt>
                    <dd>{detail.request.city}</dd>
                  </div>
                </dl>
              </section>

              {/* Message (if any) */}
              {detail.request.message && detail.request.message.trim() !== '' && (
                <section className="admin-detail-section">
                  <h4 className="admin-detail-section-title">{t('admin.fieldMessage')}</h4>
                  <blockquote className="admin-detail-message">{detail.request.message}</blockquote>
                </section>
              )}

              {/* Items */}
              <section className="admin-detail-section">
                <h4 className="admin-detail-section-title">
                  {t('admin.detailItemsTitle')}
                  <span className="admin-detail-items-count">
                    {detail.items.length}
                  </span>
                </h4>

                {detail.items.length === 0 ? (
                  <p className="admin-detail-no-items">{t('admin.detailNoItems')}</p>
                ) : (
                  <div className="admin-items-table-wrap">
                    <table className="admin-items-table">
                      <thead>
                        <tr>
                          <th>{t('admin.colProduct')}</th>
                          <th>{t('admin.colSku')}</th>
                          <th>{t('admin.colProductId')}</th>
                          <th className="admin-col-num">{t('admin.colQty')}</th>
                          <th>{t('admin.colNotes')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.items.map(item => (
                          <tr key={item.id}>
                            <td className="admin-cell-name">{item.product_name}</td>
                            <td className="mono">{item.sku}</td>
                            <td className="mono admin-cell-product-id">
                              <Link to={`/product/${item.product_id}`}>{item.product_id}</Link>
                            </td>
                            <td className="admin-col-num">{item.quantity}</td>
                            <td className="admin-cell-notes">
                              {item.notes ? item.notes : <span className="admin-dash">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Footer actions */}
              <footer className="admin-detail-footer">
                <Link to="/supply-request" className="btn btn-outline btn-sm">
                  {t('admin.newRequest')}
                </Link>
                <Link to="/catalog" className="btn btn-ghost btn-sm">
                  {t('admin.browseCatalog')}
                </Link>
              </footer>
            </article>
          )}
        </section>
      </div>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function SummaryTile({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant: 'primary' | 'warning' | 'info' | 'success' | 'error';
}) {
  return (
    <div className={`admin-summary-tile admin-summary-tile-${variant}`}>
      <span className="admin-summary-tile-value">{value}</span>
      <span className="admin-summary-tile-label">{label}</span>
    </div>
  );
}

// ---- Icons ----
function RefreshIcon({ spinning }: { spinning?: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={spinning ? { animation: 'adminSpin 0.8s linear infinite' } : undefined}
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function InboxIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    </svg>
  );
}
