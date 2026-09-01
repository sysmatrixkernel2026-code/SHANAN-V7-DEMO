import { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { LoadingState, EmptyState } from '../components/LoadingEmptyStates';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface PoSummary {
  id: string;
  reference: string;
  purchase_request_id: string;
  supply_request_id: string;
  supplier_id: string;
  status: string;
  total_amount: number | null;
  currency: string;
  issue_date: string | null;
  expected_delivery: string | null;
  notes: string | null;
  supplier_name: string;
  supplier_reference: string;
  purchase_request_reference: string;
  supply_request_reference: string;
  created_by_name: string | null;
  created_at: string;
}

interface PoItem {
  id: number;
  po_id: string;
  pr_item_id: number | null;
  product_id: string;
  product_name: string;
  sku: string;
  quantity: number;
  received_quantity: number;
  unit_price: number | null;
  currency: string | null;
  total_price: number | null;
  notes: string | null;
}

interface PoDetail {
  id: string;
  reference: string;
  purchase_request_id: string;
  supply_request_id: string;
  supplier_id: string;
  status: string;
  total_amount: number | null;
  currency: string;
  issue_date: string | null;
  expected_delivery: string | null;
  actual_delivery: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  supplier_name: string;
  supplier_reference: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  purchase_request_reference: string;
  sourcing_decision_id: string | null;
  supply_request_reference: string;
  created_by_name: string | null;
  items: PoItem[];
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', issued: 'Issued', confirmed: 'Confirmed', partially_received: 'Partially Received', received: 'Received', cancelled: 'Cancelled',
};
const STATUS_BADGE: Record<string, string> = {
  draft: 'badge-warning', issued: 'badge-info', confirmed: 'badge-info', partially_received: 'badge-warning', received: 'badge-success', cancelled: 'badge-error',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return iso; }
}
function formatMoney(amount: number | null, currency: string | null): string {
  if (amount == null) return '—';
  return `${amount.toFixed(2)} ${currency || ''}`;
}

// If URL has :id param, show detail view; otherwise show list+detail
function isDetailRoute(): boolean {
  return window.location.pathname.match(/\/admin\/purchase-orders\/[^/]+$/) !== null;
}

export default function PurchaseOrdersAdmin() {
  const { id: urlId } = useParams<{ id: string }>();
  const { t } = useLanguage();
  const { token } = useAuth();

  // Detail mode (when URL has :id)
  if (urlId) return <PoDetailPage id={urlId} />;

  // List mode
  const [list, setList] = useState<PoSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PoDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setListLoading(true); setListError(null);
    try {
      const res = await fetch(`${API_URL}/api/purchase-orders`, { headers: token ? { 'Authorization': `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { purchaseOrders: PoSummary[] };
      setList(data.purchaseOrders ?? []);
    } catch (e) { setListError(e instanceof Error ? e.message : t('po.loadError')); setList(null); }
    finally { setListLoading(false); }
  }, [token, t]);

  useEffect(() => { loadList(); }, [loadList]);

  const selectPo = useCallback(async (id: string) => {
    setSelectedId(id); setDetail(null); setDetailError(null); setDetailLoading(true); setActionMsg(null);
    try {
      const res = await fetch(`${API_URL}/api/purchase-orders/${encodeURIComponent(id)}`, { headers: token ? { 'Authorization': `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { purchaseOrder: PoDetail };
      setDetail(data.purchaseOrder);
    } catch (e) { setDetailError(e instanceof Error ? e.message : t('po.detailLoadError')); setDetail(null); }
    finally { setDetailLoading(false); }
  }, [token, t]);

  const patchStatus = useCallback(async (status: string) => {
    if (!detail) return;
    setActionLoading(true); setActionMsg(null);
    try {
      const res = await fetch(`${API_URL}/api/purchase-orders/${encodeURIComponent(detail.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || `HTTP ${res.status}`); }
      const data = await res.json() as { purchaseOrder: PoDetail };
      setDetail(data.purchaseOrder);
      setActionMsg(status === 'issued' ? t('po.issueSuccess') : status === 'confirmed' ? t('po.confirmSuccess') : t('po.receiveSuccess'));
      loadList();
    } catch (e) { setActionMsg(e instanceof Error ? e.message : 'Error'); }
    finally { setActionLoading(false); }
  }, [detail, token, t, loadList]);

  const summary = list ? {
    total: list.length,
    draft: list.filter(r => r.status === 'draft').length,
    issued: list.filter(r => r.status === 'issued').length,
    confirmed: list.filter(r => r.status === 'confirmed' || r.status === 'partially_received').length,
    received: list.filter(r => r.status === 'received').length,
  } : null;

  return (
    <div className="container" style={{ padding: '40px 0 64px' }}>
      <div className="page-header" style={{ marginBottom: 32 }}>
        <span className="admin-eyebrow"><span className="admin-eyebrow-dot" />{t('po.eyebrow')}</span>
        <h1 className="page-title">{t('po.title')}</h1>
        <p className="page-subtitle">{t('po.subtitle')}</p>
      </div>

      {summary && (
        <div className="admin-summary-grid">
          <SummaryTile label={t('po.summaryTotal')} value={summary.total} variant="primary" />
          <SummaryTile label={t('po.summaryDraft')} value={summary.draft} variant="warning" />
          <SummaryTile label={t('po.summaryIssued')} value={summary.issued} variant="info" />
          <SummaryTile label={t('po.summaryConfirmed')} value={summary.confirmed} variant="info" />
          <SummaryTile label={t('po.summaryReceived')} value={summary.received} variant="success" />
        </div>
      )}

      <div className="admin-layout">
        <section className="admin-list-panel">
          <header className="admin-list-header">
            <h2 className="admin-list-title">{t('po.title')} {list && <span className="admin-list-count">({list.length})</span>}</h2>
            <button type="button" className="btn btn-ghost btn-sm" onClick={loadList} disabled={listLoading}>
              <span style={{ marginInlineStart: 6 }}>{t('admin.refresh')}</span>
            </button>
          </header>
          {listLoading && <LoadingState type="card" count={3} />}
          {listError && !listLoading && <div className="admin-error-state"><p className="admin-error-title">{t('po.loadError')}</p><p className="admin-error-detail">{listError}</p></div>}
          {!listLoading && !listError && list && list.length === 0 && <EmptyState title={t('po.emptyTitle')} description={t('po.emptyDesc')} />}
          {!listLoading && !listError && list && list.length > 0 && (
            <ul className="admin-request-list">
              {list.map(r => (
                <li key={r.id}>
                  <button type="button" className={`admin-request-row ${selectedId === r.id ? 'admin-request-row-active' : ''}`} onClick={() => selectPo(r.id)}>
                    <div className="admin-request-row-top">
                      <span className="admin-request-reference">{r.reference}</span>
                      <span className={`badge ${STATUS_BADGE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                    </div>
                    <div className="admin-request-row-mid">
                      <span className="admin-request-name">{r.supplier_name}</span>
                      <span className="admin-request-sep">·</span>
                      <span>{r.purchase_request_reference}</span>
                    </div>
                    <div className="admin-request-row-bot">
                      <span>{formatMoney(r.total_amount, r.currency)}</span>
                      <span>{formatDate(r.created_at)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="admin-detail-panel">
          {!selectedId && !detailLoading && <div className="admin-detail-empty"><p>{t('po.selectPrompt')}</p></div>}
          {detailLoading && <LoadingState type="detail" />}
          {detailError && !detailLoading && <div className="admin-error-state"><p className="admin-error-title">{t('po.detailLoadError')}</p><p className="admin-error-detail">{detailError}</p></div>}
          {detail && !detailLoading && (
            <article className="admin-detail-card">
              <header className="admin-detail-header">
                <div>
                  <span className="admin-detail-eyebrow">{t('po.fieldReference')}</span>
                  <h3 className="admin-detail-reference">{detail.reference}</h3>
                </div>
                <span className={`badge ${STATUS_BADGE[detail.status]}`}>{STATUS_LABEL[detail.status]}</span>
              </header>

              {actionMsg && <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 6, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', fontSize: 13 }}>{actionMsg}</div>}

              <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {detail.status === 'draft' && <button className="btn btn-primary btn-sm" disabled={actionLoading} onClick={() => patchStatus('issued')}>{t('po.actionIssue')}</button>}
                {detail.status === 'issued' && <button className="btn btn-primary btn-sm" disabled={actionLoading} onClick={() => patchStatus('confirmed')}>{t('po.actionConfirm')}</button>}
                {(detail.status === 'confirmed' || detail.status === 'partially_received') && <button className="btn btn-primary btn-sm" disabled={actionLoading} onClick={() => patchStatus('received')}>{t('po.actionReceive')}</button>}
                <Link to={`/admin/purchase-requests`} className="btn btn-ghost btn-sm">{detail.purchase_request_reference}</Link>
              </div>

              <div className="admin-detail-meta">
                <div className="admin-detail-meta-item"><span className="admin-detail-meta-label">{t('po.fieldCreatedAt')}</span><span className="admin-detail-meta-value">{formatDate(detail.created_at)}</span></div>
                <div className="admin-detail-meta-item"><span className="admin-detail-meta-label">{t('po.fieldCreatedBy')}</span><span className="admin-detail-meta-value">{detail.created_by_name || '—'}</span></div>
                {detail.issue_date && <div className="admin-detail-meta-item"><span className="admin-detail-meta-label">{t('po.fieldIssueDate')}</span><span className="admin-detail-meta-value">{formatDate(detail.issue_date)}</span></div>}
                {detail.expected_delivery && <div className="admin-detail-meta-item"><span className="admin-detail-meta-label">{t('po.fieldExpectedDelivery')}</span><span className="admin-detail-meta-value">{formatDate(detail.expected_delivery)}</span></div>}
              </div>

              <section className="admin-detail-section">
                <h4 className="admin-detail-section-title">{t('po.fieldSupplier')}</h4>
                <dl className="admin-detail-grid">
                  <div className="admin-detail-field"><dt>{t('po.fieldSupplier')}</dt><dd>{detail.supplier_name} ({detail.supplier_reference})</dd></div>
                  <div className="admin-detail-field"><dt>{t('po.fieldPurchaseRequest')}</dt><dd>{detail.purchase_request_reference}</dd></div>
                  <div className="admin-detail-field"><dt>{t('po.fieldSupplyRequest')}</dt><dd>{detail.supply_request_reference}</dd></div>
                  <div className="admin-detail-field"><dt>{t('po.fieldTotal')}</dt><dd>{formatMoney(detail.total_amount, detail.currency)}</dd></div>
                  {detail.contact_name && <div className="admin-detail-field"><dt>Contact</dt><dd>{detail.contact_name}</dd></div>}
                  {detail.contact_email && <div className="admin-detail-field"><dt>Email</dt><dd>{detail.contact_email}</dd></div>}
                </dl>
              </section>

              <section className="admin-detail-section">
                <h4 className="admin-detail-section-title">{t('po.itemsTitle')}</h4>
                {detail.items.length === 0 ? <p style={{ color: 'var(--text-secondary)' }}>No items</p> : (
                  <table className="admin-table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'start' }}>{t('po.colProduct')}</th>
                        <th style={{ textAlign: 'start' }}>{t('po.colSku')}</th>
                        <th style={{ textAlign: 'end' }}>{t('po.colQty')}</th>
                        <th style={{ textAlign: 'end' }}>{t('po.colReceived')}</th>
                        <th style={{ textAlign: 'end' }}>{t('po.colUnitPrice')}</th>
                        <th style={{ textAlign: 'end' }}>{t('po.colTotal')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.items.map(item => (
                        <tr key={item.id}>
                          <td>{item.product_name}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{item.sku}</td>
                          <td style={{ textAlign: 'end' }}>{item.quantity}</td>
                          <td style={{ textAlign: 'end' }}>{item.received_quantity}</td>
                          <td style={{ textAlign: 'end' }}>{formatMoney(item.unit_price, item.currency)}</td>
                          <td style={{ textAlign: 'end', fontWeight: 600 }}>{formatMoney(item.total_price, item.currency)}</td>
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

function PoDetailPage({ id }: { id: string }) {
  const { t } = useLanguage();
  const { token } = useAuth();
  const [detail, setDetail] = useState<PoDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_URL}/api/purchase-orders/${encodeURIComponent(id)}`, { headers: token ? { 'Authorization': `Bearer ${token}` } : {} })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: { purchaseOrder: PoDetail }) => setDetail(d.purchaseOrder))
      .catch(e => setError(e instanceof Error ? e.message : t('po.detailLoadError')))
      .finally(() => setLoading(false));
  }, [id, token, t]);

  if (loading) return <div className="container" style={{ padding: '40px 0' }}><LoadingState type="detail" /></div>;
  if (error) return <div className="container" style={{ padding: '40px 0' }}><div className="admin-error-state"><p className="admin-error-title">{error}</p></div><Link to="/admin/purchase-orders" className="btn btn-ghost btn-sm" style={{ marginTop: 12 }}>← Back</Link></div>;
  if (!detail) return null;

  return (
    <div className="container" style={{ padding: '40px 0 64px' }}>
      <Link to="/admin/purchase-orders" className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }}>← {t('po.title')}</Link>
      <div className="page-header" style={{ marginBottom: 32 }}>
        <span className="admin-eyebrow"><span className="admin-eyebrow-dot" />{t('po.eyebrow')}</span>
        <h1 className="page-title">{detail.reference}</h1>
        <p className="page-subtitle"><span className={`badge ${STATUS_BADGE[detail.status]}`}>{STATUS_LABEL[detail.status]}</span></p>
      </div>
      <article className="admin-detail-card">
        <div className="admin-detail-meta">
          <div className="admin-detail-meta-item"><span className="admin-detail-meta-label">{t('po.fieldSupplier')}</span><span className="admin-detail-meta-value">{detail.supplier_name}</span></div>
          <div className="admin-detail-meta-item"><span className="admin-detail-meta-label">{t('po.fieldTotal')}</span><span className="admin-detail-meta-value">{formatMoney(detail.total_amount, detail.currency)}</span></div>
          <div className="admin-detail-meta-item"><span className="admin-detail-meta-label">{t('po.fieldCreatedAt')}</span><span className="admin-detail-meta-value">{formatDate(detail.created_at)}</span></div>
        </div>
        <section className="admin-detail-section">
          <h4 className="admin-detail-section-title">{t('po.itemsTitle')}</h4>
          <table className="admin-table" style={{ width: '100%' }}>
            <thead><tr><th style={{ textAlign: 'start' }}>{t('po.colProduct')}</th><th style={{ textAlign: 'start' }}>{t('po.colSku')}</th><th style={{ textAlign: 'end' }}>{t('po.colQty')}</th><th style={{ textAlign: 'end' }}>{t('po.colUnitPrice')}</th><th style={{ textAlign: 'end' }}>{t('po.colTotal')}</th></tr></thead>
            <tbody>{detail.items.map(item => (<tr key={item.id}><td>{item.product_name}</td><td style={{ fontFamily: 'monospace', fontSize: 13 }}>{item.sku}</td><td style={{ textAlign: 'end' }}>{item.quantity}</td><td style={{ textAlign: 'end' }}>{formatMoney(item.unit_price, item.currency)}</td><td style={{ textAlign: 'end', fontWeight: 600 }}>{formatMoney(item.total_price, item.currency)}</td></tr>))}</tbody>
          </table>
        </section>
      </article>
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
