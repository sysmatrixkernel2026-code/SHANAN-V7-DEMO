import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { LoadingState, EmptyState } from '../components/LoadingEmptyStates';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface PrSummary {
  id: string;
  reference: string;
  supply_request_id: string;
  sourcing_decision_id: string;
  supplier_id: string;
  status: string;
  total_amount: number | null;
  currency: string;
  notes: string | null;
  supplier_name: string;
  supplier_reference: string;
  supply_request_reference: string;
  sourcing_decision_reference: string;
  created_by_name: string | null;
  created_at: string;
  item_count: number;
}

interface PrItem {
  id: number;
  pr_id: string;
  product_id: string;
  product_name: string;
  sku: string;
  quantity: number;
  unit_price: number | null;
  currency: string | null;
  total_price: number | null;
  source_type: string | null;
  rfq_offer_id: string | null;
}

interface PrDetail {
  id: string;
  reference: string;
  supply_request_id: string;
  sourcing_decision_id: string;
  supplier_id: string;
  status: string;
  total_amount: number | null;
  currency: string;
  notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  supplier_name: string;
  supplier_reference: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  supply_request_reference: string;
  customer_po_number: string | null;
  sourcing_decision_reference: string;
  snapshot_unit_price: number | null;
  snapshot_currency: string | null;
  snapshot_lead_time_days: number | null;
  created_by_name: string | null;
  approved_by_name: string | null;
  items: PrItem[];
  purchaseOrder: { id: string; reference: string; status: string } | null;
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', submitted: 'Submitted', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled',
};
const STATUS_BADGE: Record<string, string> = {
  draft: 'badge-warning', submitted: 'badge-info', approved: 'badge-success', rejected: 'badge-error', cancelled: 'badge-error',
};

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return iso; }
}

function formatMoney(amount: number | null, currency: string | null): string {
  if (amount == null) return '—';
  return `${amount.toFixed(2)} ${currency || ''}`;
}

export default function PurchaseRequestsAdmin() {
  const { t } = useLanguage();
  const { token } = useAuth();
  const [list, setList] = useState<PrSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PrDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const res = await fetch(`${API_URL}/api/purchase-requests`, { headers: token ? { 'Authorization': `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { purchaseRequests: PrSummary[]; count: number };
      setList(data.purchaseRequests ?? []);
    } catch (e) { setListError(e instanceof Error ? e.message : t('pr.loadError')); setList(null); }
    finally { setListLoading(false); }
  }, [token, t]);

  useEffect(() => { loadList(); }, [loadList]);

  const selectPr = useCallback(async (id: string) => {
    setSelectedId(id); setDetail(null); setDetailError(null); setDetailLoading(true); setActionMsg(null);
    try {
      const res = await fetch(`${API_URL}/api/purchase-requests/${encodeURIComponent(id)}`, { headers: token ? { 'Authorization': `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { purchaseRequest: PrDetail };
      setDetail(data.purchaseRequest);
    } catch (e) { setDetailError(e instanceof Error ? e.message : t('pr.detailLoadError')); setDetail(null); }
    finally { setDetailLoading(false); }
  }, [token, t]);

  const patchStatus = useCallback(async (status: string, extra?: Record<string, unknown>) => {
    if (!detail) return;
    setActionLoading(true); setActionMsg(null);
    try {
      const res = await fetch(`${API_URL}/api/purchase-requests/${encodeURIComponent(detail.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify({ status, ...extra }),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || `HTTP ${res.status}`); }
      const data = await res.json() as { purchaseRequest: PrDetail };
      setDetail(data.purchaseRequest);
      setActionMsg(status === 'approved' ? t('pr.approveSuccess') : status === 'rejected' ? t('pr.rejectSuccess') : t('pr.submitSuccess'));
      loadList();
    } catch (e) { setActionMsg(e instanceof Error ? e.message : 'Error'); }
    finally { setActionLoading(false); }
  }, [detail, token, t, loadList]);

  const createPo = useCallback(async () => {
    if (!detail) return;
    setActionLoading(true); setActionMsg(null);
    try {
      const res = await fetch(`${API_URL}/api/purchase-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify({ purchaseRequestId: detail.id }),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || `HTTP ${res.status}`); }
      const data = await res.json() as { purchaseOrder: { id: string; reference: string } };
      setActionMsg(`${t('pr.createPoSuccess')} ${data.purchaseOrder.reference}`);
      selectPr(detail.id);
    } catch (e) { setActionMsg(e instanceof Error ? e.message : t('pr.createPoError')); }
    finally { setActionLoading(false); }
  }, [detail, token, t, selectPr]);

  const summary = list ? {
    total: list.length,
    draft: list.filter(r => r.status === 'draft').length,
    submitted: list.filter(r => r.status === 'submitted').length,
    approved: list.filter(r => r.status === 'approved').length,
    rejected: list.filter(r => r.status === 'rejected').length,
  } : null;

  return (
    <div className="container" style={{ padding: '40px 0 64px' }}>
      <div className="page-header" style={{ marginBottom: 32 }}>
        <span className="admin-eyebrow"><span className="admin-eyebrow-dot" />{t('pr.eyebrow')}</span>
        <h1 className="page-title">{t('pr.title')}</h1>
        <p className="page-subtitle">{t('pr.subtitle')}</p>
      </div>

      {summary && (
        <div className="admin-summary-grid">
          <SummaryTile label={t('pr.summaryTotal')} value={summary.total} variant="primary" />
          <SummaryTile label={t('pr.summaryDraft')} value={summary.draft} variant="warning" />
          <SummaryTile label={t('pr.summarySubmitted')} value={summary.submitted} variant="info" />
          <SummaryTile label={t('pr.summaryApproved')} value={summary.approved} variant="success" />
          {summary.rejected > 0 && <SummaryTile label={t('pr.summaryRejected')} value={summary.rejected} variant="error" />}
        </div>
      )}

      <div className="admin-layout">
        <section className="admin-list-panel" aria-label="Purchase requests list">
          <header className="admin-list-header">
            <h2 className="admin-list-title">{t('pr.title')} {list && <span className="admin-list-count">({list.length})</span>}</h2>
            <button type="button" className="btn btn-ghost btn-sm" onClick={loadList} disabled={listLoading}>
              <span style={{ marginInlineStart: 6 }}>{t('admin.refresh')}</span>
            </button>
          </header>
          {listLoading && <LoadingState type="card" count={3} />}
          {listError && !listLoading && (
            <div className="admin-error-state" role="alert"><p className="admin-error-title">{t('pr.loadError')}</p><p className="admin-error-detail">{listError}</p></div>
          )}
          {!listLoading && !listError && list && list.length === 0 && (
            <EmptyState title={t('pr.emptyTitle')} description={t('pr.emptyDesc')} />
          )}
          {!listLoading && !listError && list && list.length > 0 && (
            <ul className="admin-request-list">
              {list.map(r => (
                <li key={r.id}>
                  <button type="button" className={`admin-request-row ${selectedId === r.id ? 'admin-request-row-active' : ''}`} onClick={() => selectPr(r.id)}>
                    <div className="admin-request-row-top">
                      <span className="admin-request-reference">{r.reference}</span>
                      <span className={`badge ${STATUS_BADGE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                    </div>
                    <div className="admin-request-row-mid">
                      <span className="admin-request-name">{r.supplier_name}</span>
                      <span className="admin-request-sep">·</span>
                      <span>{r.supply_request_reference}</span>
                    </div>
                    <div className="admin-request-row-bot">
                      <span>{r.item_count} items</span>
                      <span>{formatMoney(r.total_amount, r.currency)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="admin-detail-panel" aria-label="Purchase request details">
          {!selectedId && !detailLoading && (
            <div className="admin-detail-empty"><p>{t('pr.selectPrompt')}</p></div>
          )}
          {detailLoading && <LoadingState type="detail" />}
          {detailError && !detailLoading && (
            <div className="admin-error-state" role="alert"><p className="admin-error-title">{t('pr.detailLoadError')}</p><p className="admin-error-detail">{detailError}</p></div>
          )}
          {detail && !detailLoading && (
            <article className="admin-detail-card">
              <header className="admin-detail-header">
                <div>
                  <span className="admin-detail-eyebrow">{t('pr.fieldReference')}</span>
                  <h3 className="admin-detail-reference">{detail.reference}</h3>
                </div>
                <span className={`badge ${STATUS_BADGE[detail.status]}`}>{STATUS_LABEL[detail.status]}</span>
              </header>

              {actionMsg && (
                <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 6, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', fontSize: 13 }}>
                  {actionMsg}
                </div>
              )}

              {/* Action buttons */}
              <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {detail.status === 'draft' && (
                  <button className="btn btn-primary btn-sm" disabled={actionLoading} onClick={() => patchStatus('submitted')}>
                    {t('pr.actionSubmit')}
                  </button>
                )}
                {detail.status === 'submitted' && (
                  <>
                    <button className="btn btn-success btn-sm" disabled={actionLoading} onClick={() => patchStatus('approved')}>
                      {t('pr.actionApprove')}
                    </button>
                    <button className="btn btn-outline btn-sm" disabled={actionLoading} onClick={() => patchStatus('rejected')}>
                      {t('pr.actionReject')}
                    </button>
                  </>
                )}
                {detail.status === 'approved' && !detail.purchaseOrder && (
                  <button className="btn btn-primary btn-sm" disabled={actionLoading} onClick={createPo}>
                    {t('pr.actionCreatePo')}
                  </button>
                )}
                {detail.purchaseOrder && (
                  <Link to={`/admin/purchase-orders/${detail.purchaseOrder.id}`} className="btn btn-ghost btn-sm">
                    {detail.purchaseOrder.reference} →
                  </Link>
                )}
              </div>

              <div className="admin-detail-meta">
                <div className="admin-detail-meta-item">
                  <span className="admin-detail-meta-label">{t('pr.fieldCreatedAt')}</span>
                  <span className="admin-detail-meta-value">{formatDate(detail.created_at)}</span>
                </div>
                <div className="admin-detail-meta-item">
                  <span className="admin-detail-meta-label">{t('pr.fieldCreatedBy')}</span>
                  <span className="admin-detail-meta-value">{detail.created_by_name || '—'}</span>
                </div>
                {detail.approved_by_name && (
                  <div className="admin-detail-meta-item">
                    <span className="admin-detail-meta-label">{t('pr.fieldApprovedBy')}</span>
                    <span className="admin-detail-meta-value">{detail.approved_by_name}</span>
                  </div>
                )}
              </div>

              <section className="admin-detail-section">
                <h4 className="admin-detail-section-title">{t('pr.fieldSupplier')}</h4>
                <dl className="admin-detail-grid">
                  <div className="admin-detail-field"><dt>{t('pr.fieldSupplier')}</dt><dd>{detail.supplier_name} ({detail.supplier_reference})</dd></div>
                  <div className="admin-detail-field"><dt>{t('pr.fieldSupplyRequest')}</dt><dd><Link to={`/admin/supply-requests`}>{detail.supply_request_reference}</Link></dd></div>
                  <div className="admin-detail-field"><dt>{t('pr.fieldSourcingDecision')}</dt><dd>{detail.sourcing_decision_reference}</dd></div>
                  <div className="admin-detail-field"><dt>{t('pr.fieldTotal')}</dt><dd>{formatMoney(detail.total_amount, detail.currency)}</dd></div>
                  {detail.contact_name && <div className="admin-detail-field"><dt>Contact</dt><dd>{detail.contact_name}</dd></div>}
                  {detail.contact_email && <div className="admin-detail-field"><dt>Email</dt><dd>{detail.contact_email}</dd></div>}
                </dl>
              </section>

              <section className="admin-detail-section">
                <h4 className="admin-detail-section-title">{t('pr.itemsTitle')}</h4>
                {detail.items.length === 0 ? <p style={{ color: 'var(--text-secondary)' }}>No items</p> : (
                  <table className="admin-table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'start' }}>{t('pr.colProduct')}</th>
                        <th style={{ textAlign: 'start' }}>{t('pr.colSku')}</th>
                        <th style={{ textAlign: 'end' }}>{t('pr.colQty')}</th>
                        <th style={{ textAlign: 'end' }}>{t('pr.colUnitPrice')}</th>
                        <th style={{ textAlign: 'end' }}>{t('pr.colTotal')}</th>
                        <th style={{ textAlign: 'start' }}>{t('pr.colSource')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.items.map(item => (
                        <tr key={item.id}>
                          <td>{item.product_name}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{item.sku}</td>
                          <td style={{ textAlign: 'end' }}>{item.quantity}</td>
                          <td style={{ textAlign: 'end' }}>{formatMoney(item.unit_price, item.currency)}</td>
                          <td style={{ textAlign: 'end', fontWeight: 600 }}>{formatMoney(item.total_price, item.currency)}</td>
                          <td>{item.source_type === 'rfq_offer' ? 'RFQ Offer' : item.source_type === 'agreement_term' ? 'Agreement' : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            </article>
          )}
        </section>
      </div>
    </div>
  );
}

function SummaryTile({ label, value, variant }: { label: string; value: number; variant: string }) {
  const colors: Record<string, string> = { primary: '#1e40af', warning: '#d97706', info: '#0891b2', success: '#059669', error: '#dc2626' };
  return (
    <div style={{ padding: '12px 16px', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)' }}>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: colors[variant] || 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}
