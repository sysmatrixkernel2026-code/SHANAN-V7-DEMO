import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { LoadingState, EmptyState } from '../components/LoadingEmptyStates';

// ============================================================
// RfqDetail — Internal SHANAN staff page.
// Route: /admin/rfqs/:id  (ProtectedRoute requireInternal)
//
// Single RFQ view + supplier/item/offer management.
// Internal-only.
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
  updated_at: string;
}

interface RfqSupplier {
  id: string;
  rfq_id: string;
  supplier_id: string;
  response_state: 'pending' | 'responded' | 'declined';
  responded_at: string | null;
  created_at: string;
  supplier_reference: string | null;
  supplier_name_en: string | null;
  supplier_status: string | null;
}

interface RfqItem {
  id: string;
  rfq_id: string;
  supply_request_item_id: number;
  product_id: string;
  product_name: string;
  sku: string;
  requested_quantity: number;
  customer_notes: string | null;
  rfq_notes: string | null;
  canonical_product_sku: string | null;
  canonical_product_code: string | null;
  canonical_product_name_en: string | null;
}

interface RfqOffer {
  id: string;
  rfq_supplier_id: string;
  rfq_item_id: string;
  offer_status: 'pending' | 'quoted' | 'declined' | 'unavailable';
  quoted_unit_price: number | null;
  currency: string | null;
  offered_quantity: number | null;
  lead_time_days: number | null;
  validity_date: string | null;
  minimum_order_quantity: number | null;
  payment_terms: string | null;
  commercial_notes: string | null;
  responded_at: string | null;
  supplier_id: string;
  product_id: string;
}

interface RfqDetailData {
  rfq: Rfq;
  supplyRequestReference: string | null;
  items: RfqItem[];
  itemsCount: number;
  suppliers: RfqSupplier[];
  suppliersCount: number;
  respondedCount: number;
  offers: RfqOffer[];
  offersCount: number;
}

interface Supplier {
  id: string;
  reference: string;
  name_en: string;
  status: string;
}

interface SupplyRequestItem {
  id: number;
  product_id: string;
  product_name: string;
  sku: string;
  quantity: number;
  notes: string | null;
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

const OFFER_BADGE: Record<string, string> = {
  pending: 'badge-neutral',
  quoted: 'badge-success',
  declined: 'badge-error',
  unavailable: 'badge-warning',
};

const OFFER_LABEL_KEYS: Record<string, 'rfq.offerStatusPending' | 'rfq.offerStatusQuoted' | 'rfq.offerStatusDeclined' | 'rfq.offerStatusUnavailable'> = {
  pending: 'rfq.offerStatusPending',
  quoted: 'rfq.offerStatusQuoted',
  declined: 'rfq.offerStatusDeclined',
  unavailable: 'rfq.offerStatusUnavailable',
};

const RESPONSE_BADGE: Record<string, string> = {
  pending: 'badge-neutral',
  responded: 'badge-success',
  declined: 'badge-error',
};

const RESPONSE_LABEL_KEYS: Record<string, 'rfq.responseStatePending' | 'rfq.responseStateResponded' | 'rfq.responseStateDeclined'> = {
  pending: 'rfq.responseStatePending',
  responded: 'rfq.responseStateResponded',
  declined: 'rfq.responseStateDeclined',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }); }
  catch { return iso; }
}

export default function RfqDetail() {
  const { id } = useParams<{ id: string }>();
  const { t } = useLanguage();
  const { token } = useAuth();

  const [detail, setDetail] = useState<RfqDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit form
  const [internalNotes, setInternalNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionRunning, setActionRunning] = useState(false);

  // Add supplier form
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [addingSupplier, setAddingSupplier] = useState(false);

  // Add item form
  const [requestItems, setRequestItems] = useState<SupplyRequestItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<number | ''>('');
  const [addingItem, setAddingItem] = useState(false);

  // Offer form
  const [offerForm, setOfferForm] = useState({
    supplierId: '',
    rfqItemId: '',
    offerStatus: 'quoted' as 'pending' | 'quoted' | 'declined' | 'unavailable',
    quotedUnitPrice: '',
    currency: 'JOD',
    offeredQuantity: '',
    leadTimeDays: '',
    validityDate: '',
    minimumOrderQuantity: '',
    paymentTerms: '',
    commercialNotes: '',
  });
  const [savingOffer, setSavingOffer] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!id || !token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/rfqs/${encodeURIComponent(id)}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.status === 404) {
        setError(t('rfq.errNotFound'));
        setDetail(null);
        return;
      }
      if (res.status === 401 || res.status === 403) {
        setError(res.status === 401 ? t('common.errAuth') : t('common.errInternal'));
        setDetail(null);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDetail(data);
      setInternalNotes(data.rfq?.internal_notes || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('rfq.errLoadDetail'));
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  // Load suppliers for the dropdown (only when editable)
  useEffect(() => {
    if (!token || !detail) return;
    if (!['draft', 'ready_to_send'].includes(detail.rfq.status)) return;
    fetch(`${API_URL}/api/suppliers`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { suppliers: [] })
      .then(data => setSuppliers(data.suppliers || []))
      .catch(() => setSuppliers([]));
  }, [token, detail?.rfq.status]);

  // Load originating supply request items (only those not yet in this RFQ) for the add-item dropdown
  useEffect(() => {
    if (!token || !detail) return;
    if (!['draft', 'ready_to_send'].includes(detail.rfq.status)) return;
    fetch(`${API_URL}/api/supply-requests/${detail.rfq.supply_request_id}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : { items: [] })
      .then(data => {
        // Filter out items already in this RFQ
        const existingIds = new Set(detail.items.map(i => i.supply_request_item_id));
        setRequestItems((data.items || []).filter((it: SupplyRequestItem) => !existingIds.has(it.id)));
      })
      .catch(() => setRequestItems([]));
  }, [token, detail?.rfq.status, detail?.items.length]);

  const isEditable = detail && ['draft', 'ready_to_send'].includes(detail.rfq.status);
  const canAcceptOffers = detail && ['sent', 'partially_responded', 'responded'].includes(detail.rfq.status);

  const handleAction = async (action: 'mark_ready' | 'send' | 'close' | 'cancel') => {
    if (!detail || !token) return;
    if (action !== 'mark_ready' && action !== 'send' && action !== 'close' && action !== 'cancel') return;
    if (action === 'cancel' || action === 'close') {
      if (!confirm(t('rfq.confirmAction'))) return;
    }
    setActionRunning(true);
    setActionError(null);
    try {
      const res = await fetch(`${API_URL}/api/rfqs/${encodeURIComponent(detail.rfq.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      await loadDetail();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t('rfq.errActionFailed'));
    } finally {
      setActionRunning(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!detail || !token) return;
    setSavingNotes(true);
    setActionError(null);
    try {
      const res = await fetch(`${API_URL}/api/rfqs/${encodeURIComponent(detail.rfq.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ internalNotes }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      await loadDetail();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t('rfq.saveError'));
    } finally {
      setSavingNotes(false);
    }
  };

  const handleAddSupplier = async () => {
    if (!detail || !token || !selectedSupplierId) return;
    setAddingSupplier(true);
    setActionError(null);
    try {
      const res = await fetch(`${API_URL}/api/rfqs/${encodeURIComponent(detail.rfq.id)}/suppliers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ supplierId: selectedSupplierId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setSelectedSupplierId('');
      await loadDetail();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t('rfq.errAddSupplier'));
    } finally {
      setAddingSupplier(false);
    }
  };

  const handleRemoveSupplier = async (supplierId: string) => {
    if (!detail || !token) return;
    if (!confirm(t('rfq.confirmRemoveSupplier'))) return;
    setActionError(null);
    try {
      const res = await fetch(`${API_URL}/api/rfqs/${encodeURIComponent(detail.rfq.id)}/suppliers/${supplierId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      await loadDetail();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t('rfq.errRemoveSupplier'));
    }
  };

  const handleAddItem = async () => {
    if (!detail || !token || !selectedItemId) return;
    setAddingItem(true);
    setActionError(null);
    try {
      const res = await fetch(`${API_URL}/api/rfqs/${encodeURIComponent(detail.rfq.id)}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ requestItemId: selectedItemId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setSelectedItemId('');
      await loadDetail();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t('rfq.errAddItem'));
    } finally {
      setAddingItem(false);
    }
  };

  const handleRecordOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail || !token) return;
    if (!offerForm.supplierId || !offerForm.rfqItemId) {
      setActionError(t('rfq.errSupplierItemRequired'));
      return;
    }
    setSavingOffer(true);
    setActionError(null);
    try {
      const body: Record<string, unknown> = {
        supplierId: offerForm.supplierId,
        rfqItemId: offerForm.rfqItemId,
        offerStatus: offerForm.offerStatus,
        currency: offerForm.currency.trim() || null,
        validityDate: offerForm.validityDate || null,
        paymentTerms: offerForm.paymentTerms.trim() || null,
        commercialNotes: offerForm.commercialNotes.trim() || null,
      };
      if (offerForm.quotedUnitPrice !== '') {
        const n = Number(offerForm.quotedUnitPrice);
        if (isNaN(n) || n < 0) throw new Error(t('rfq.errInvalidPrice'));
        body.quotedUnitPrice = n;
      }
      if (offerForm.offeredQuantity !== '') {
        const n = parseInt(offerForm.offeredQuantity, 10);
        if (!isNaN(n) && n >= 0) body.offeredQuantity = n;
      }
      if (offerForm.leadTimeDays !== '') {
        const n = parseInt(offerForm.leadTimeDays, 10);
        if (!isNaN(n) && n >= 0) body.leadTimeDays = n;
      }
      if (offerForm.minimumOrderQuantity !== '') {
        const n = parseInt(offerForm.minimumOrderQuantity, 10);
        if (!isNaN(n) && n >= 0) body.minimumOrderQuantity = n;
      }
      const res = await fetch(`${API_URL}/api/rfqs/${encodeURIComponent(detail.rfq.id)}/offers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setOfferForm({
        supplierId: '', rfqItemId: '', offerStatus: 'quoted', quotedUnitPrice: '', currency: 'JOD',
        offeredQuantity: '', leadTimeDays: '', validityDate: '', minimumOrderQuantity: '',
        paymentTerms: '', commercialNotes: '',
      });
      await loadDetail();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t('rfq.errRecordOffer'));
    } finally {
      setSavingOffer(false);
    }
  };

  if (loading) return <LoadingState type="detail" />;
  if (error || !detail) {
    return (
      <EmptyState
        title={error || 'Not found'}
        description=""
        action={<Link to="/admin/rfqs" className="btn btn-primary">{t('rfq.title')}</Link>}
      />
    );
  }

  const r = detail.rfq;

  return (
    <div className="container" style={{ padding: '40px 0 64px' }}>
      <Link to="/admin/rfqs" className="portal-back-link">← {t('rfq.backToList')}</Link>

      <div className="page-header" style={{ marginBottom: 32 }}>
        <span className="admin-eyebrow">
          <span className="admin-eyebrow-dot" />
          {t('rfq.eyebrow')}
        </span>
        <h1 className="page-title">{r.reference}</h1>
        <p className="page-subtitle">
          {t('rfq.fieldSupplyRequest')}: <Link to={`/admin/supply-requests`}>{r.supply_request_reference || r.supply_request_id}</Link>
        </p>
        <div style={{ marginTop: 8 }}>
          <Link to={`/admin/rfqs/${r.id}/comparison`} className="btn btn-outline btn-sm">
            {t('compare.title')} →
          </Link>
        </div>
      </div>

      {actionError && <div className="portal-error-banner" style={{ marginBottom: 16 }}>{actionError}</div>}

      <div className="admin-layout">
        {/* LEFT: header + status + notes + actions */}
        <section className="admin-detail-panel">
          <article className="admin-detail-card">
            <header className="admin-detail-header">
              <div>
                <h2 className="admin-detail-title">{t('rfq.detailHeader')}</h2>
                <p className="admin-detail-reference">{r.reference}</p>
              </div>
              <span className={`badge ${STATUS_BADGE[r.status] || 'badge-neutral'}`}>
                {t(STATUS_LABEL_KEYS[r.status] || 'rfq.statusDraft')}
              </span>
            </header>

            <div className="admin-detail-grid">
              <label>
                <span>{t('rfq.fieldSupplyRequest')}</span>
                <input className="form-input" value={r.supply_request_reference || r.supply_request_id} readOnly />
              </label>
              <label>
                <span>{t('rfq.colItems')}</span>
                <input className="form-input" value={detail.itemsCount} readOnly />
              </label>
              <label>
                <span>{t('rfq.colSuppliers')}</span>
                <input className="form-input" value={`${detail.respondedCount}/${detail.suppliersCount}`} readOnly />
              </label>
              <label>
                <span>{t('rfq.sentAt')}</span>
                <input className="form-input" value={formatDate(r.sent_at)} readOnly />
              </label>
              <label>
                <span>{t('rfq.closedAt')}</span>
                <input className="form-input" value={formatDate(r.closed_at)} readOnly />
              </label>
              <label>
                <span>{t('rfq.colCreated')}</span>
                <input className="form-input" value={formatDate(r.created_at)} readOnly />
              </label>
            </div>

            <label style={{ display: 'block', marginTop: 12 }}>
              <span>{t('rfq.fieldInternalNotes')}</span>
              <textarea
                className="form-input"
                rows={3}
                value={internalNotes}
                onChange={e => setInternalNotes(e.target.value)}
                disabled={!isEditable}
              />
            </label>
            {isEditable && (
              <div style={{ marginTop: 8 }}>
                <button type="button" className="btn btn-primary btn-sm" onClick={handleSaveNotes} disabled={savingNotes}>
                  {savingNotes ? t('rfq.saving') : t('rfq.actionSave')}
                </button>
              </div>
            )}

            {/* Workflow actions */}
            <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {r.status === 'draft' && (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => handleAction('mark_ready')} disabled={actionRunning}>
                  {t('rfq.actionMarkReady')}
                </button>
              )}
              {r.status === 'ready_to_send' && (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => handleAction('send')} disabled={actionRunning}>
                  {t('rfq.actionSend')}
                </button>
              )}
              {(r.status === 'partially_responded' || r.status === 'responded') && (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => handleAction('close')} disabled={actionRunning}>
                  {t('rfq.actionClose')}
                </button>
              )}
              {r.status !== 'closed' && r.status !== 'cancelled' && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleAction('cancel')} disabled={actionRunning}>
                  {t('rfq.actionCancel')}
                </button>
              )}
            </div>
          </article>
        </section>

        {/* RIGHT: items + suppliers + offers */}
        <section className="admin-list-panel">
          {/* ITEMS */}
          <header className="admin-list-header">
            <h2 className="admin-list-title">{t('rfq.itemsTitle')} ({detail.itemsCount})</h2>
          </header>
          {detail.items.length === 0 ? (
            <p className="portal-no-items">{t('rfq.noItems')}</p>
          ) : (
            <div className="portal-items-table-wrap" style={{ marginBottom: 16 }}>
              <table className="portal-items-table">
                <thead>
                  <tr>
                    <th>{t('agreements.colProduct')}</th>
                    <th>{t('agreements.colSku')}</th>
                    <th className="num">{t('rfq.colQty')}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map(it => (
                    <tr key={it.id}>
                      <td>{it.canonical_product_name_en || it.product_name}</td>
                      <td className="mono">{it.canonical_product_sku || it.sku}</td>
                      <td className="num">{it.requested_quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {isEditable && requestItems.length > 0 && (
            <div style={{ marginBottom: 16, padding: 12, border: '1px solid #e5e7eb', borderRadius: 6, background: '#fafafa', display: 'flex', gap: 8, alignItems: 'center' }}>
              <select className="form-input" value={selectedItemId} onChange={e => setSelectedItemId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">{t('rfq.selectItem')}</option>
                {requestItems.map(it => (
                  <option key={it.id} value={it.id}>{it.product_name} ({it.sku}) — Qty {it.quantity}</option>
                ))}
              </select>
              <button type="button" className="btn btn-primary btn-sm" onClick={handleAddItem} disabled={addingItem || !selectedItemId}>
                {t('rfq.addItem')}
              </button>
            </div>
          )}

          {/* SUPPLIERS */}
          <header className="admin-list-header" style={{ marginTop: 16 }}>
            <h2 className="admin-list-title">{t('rfq.suppliersTitle')} ({detail.suppliersCount})</h2>
          </header>
          {detail.suppliers.length === 0 ? (
            <p className="portal-no-items">{t('rfq.noSuppliers')}</p>
          ) : (
            <div className="portal-items-table-wrap" style={{ marginBottom: 16 }}>
              <table className="portal-items-table">
                <thead>
                  <tr>
                    <th>{t('rfq.colSupplier')}</th>
                    <th>{t('rfq.colRef')}</th>
                    <th>{t('rfq.colResponse')}</th>
                    {isEditable && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {detail.suppliers.map(s => (
                    <tr key={s.id}>
                      <td>{s.supplier_name_en || '—'}</td>
                      <td className="mono">{s.supplier_reference || '—'}</td>
                      <td>
                        <span className={`badge ${RESPONSE_BADGE[s.response_state] || 'badge-neutral'}`}>
                          {t(RESPONSE_LABEL_KEYS[s.response_state] || 'rfq.responseStatePending')}
                        </span>
                      </td>
                      {isEditable && (
                        <td>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleRemoveSupplier(s.supplier_id)}>
                            {t('rfq.removeItem')}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {isEditable && suppliers.length > 0 && (
            <div style={{ marginBottom: 16, padding: 12, border: '1px solid #e5e7eb', borderRadius: 6, background: '#fafafa', display: 'flex', gap: 8, alignItems: 'center' }}>
              <select className="form-input" value={selectedSupplierId} onChange={e => setSelectedSupplierId(e.target.value)}>
                <option value="">{t('rfq.selectSupplier')}</option>
                {suppliers
                  .filter(s => !detail.suppliers.find(ds => ds.supplier_id === s.id))
                  .map(s => (
                    <option key={s.id} value={s.id}>{s.name_en} ({s.reference})</option>
                  ))}
              </select>
              <button type="button" className="btn btn-primary btn-sm" onClick={handleAddSupplier} disabled={addingSupplier || !selectedSupplierId}>
                {t('rfq.addSupplier')}
              </button>
            </div>
          )}

          {/* OFFERS */}
          <header className="admin-list-header" style={{ marginTop: 16 }}>
            <h2 className="admin-list-title">{t('rfq.offersTitle')} ({detail.offersCount})</h2>
          </header>
          {detail.offers.length === 0 ? (
            <p className="portal-no-items">{t('rfq.noOffers')}</p>
          ) : (
            <div className="portal-items-table-wrap" style={{ marginBottom: 16 }}>
              <table className="portal-items-table">
                <thead>
                  <tr>
                    <th>{t('rfq.offerSupplier')}</th>
                    <th>{t('rfq.offerItem')}</th>
                    <th>{t('rfq.offerStatus')}</th>
                    <th className="num">{t('rfq.offerQuotedPrice')}</th>
                    <th>{t('rfq.offerCurrency')}</th>
                    <th className="num">{t('rfq.offerLeadTime')}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.offers.map(o => {
                    const sup = detail.suppliers.find(s => s.id === o.rfq_supplier_id);
                    const it = detail.items.find(i => i.id === o.rfq_item_id);
                    return (
                      <tr key={o.id}>
                        <td>{sup?.supplier_name_en || '—'}</td>
                        <td>{it?.canonical_product_sku || it?.sku || '—'}</td>
                        <td>
                          <span className={`badge ${OFFER_BADGE[o.offer_status] || 'badge-neutral'}`}>
                            {t(OFFER_LABEL_KEYS[o.offer_status] || 'rfq.offerStatusPending')}
                          </span>
                        </td>
                        <td className="num">{o.quoted_unit_price != null ? o.quoted_unit_price : '—'}</td>
                        <td>{o.currency || '—'}</td>
                        <td className="num">{o.lead_time_days != null ? `${o.lead_time_days}d` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* RECORD OFFER FORM */}
          {canAcceptOffers && detail.suppliers.length > 0 && detail.items.length > 0 && (
            <form onSubmit={handleRecordOffer} style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 6, background: '#fafafa' }}>
              <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>{t('rfq.recordOffer')}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <label>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{t('rfq.offerSupplier')}</span>
                  <select className="form-input" value={offerForm.supplierId} onChange={e => setOfferForm({ ...offerForm, supplierId: e.target.value })} required>
                    <option value="">—</option>
                    {detail.suppliers.map(s => (
                      <option key={s.id} value={s.supplier_id}>{s.supplier_name_en} ({s.supplier_reference})</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{t('rfq.offerItem')}</span>
                  <select className="form-input" value={offerForm.rfqItemId} onChange={e => setOfferForm({ ...offerForm, rfqItemId: e.target.value })} required>
                    <option value="">—</option>
                    {detail.items.map(it => (
                      <option key={it.id} value={it.id}>{it.canonical_product_sku || it.sku}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{t('rfq.offerStatus')}</span>
                  <select className="form-input" value={offerForm.offerStatus} onChange={e => setOfferForm({ ...offerForm, offerStatus: e.target.value as any })}>
                    <option value="quoted">{t('rfq.offerStatusQuoted')}</option>
                    <option value="declined">{t('rfq.offerStatusDeclined')}</option>
                    <option value="unavailable">{t('rfq.offerStatusUnavailable')}</option>
                  </select>
                </label>
                <label>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{t('rfq.offerQuotedPrice')}</span>
                  <input type="number" step="0.01" min={0} className="form-input" value={offerForm.quotedUnitPrice} onChange={e => setOfferForm({ ...offerForm, quotedUnitPrice: e.target.value })} disabled={offerForm.offerStatus !== 'quoted'} />
                </label>
                <label>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{t('rfq.offerCurrency')}</span>
                  <input className="form-input" value={offerForm.currency} onChange={e => setOfferForm({ ...offerForm, currency: e.target.value })} />
                </label>
                <label>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{t('rfq.offerQty')}</span>
                  <input type="number" min={0} className="form-input" value={offerForm.offeredQuantity} onChange={e => setOfferForm({ ...offerForm, offeredQuantity: e.target.value })} />
                </label>
                <label>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{t('rfq.offerLeadTime')}</span>
                  <input type="number" min={0} className="form-input" value={offerForm.leadTimeDays} onChange={e => setOfferForm({ ...offerForm, leadTimeDays: e.target.value })} />
                </label>
                <label>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{t('rfq.offerMOQ')}</span>
                  <input type="number" min={0} className="form-input" value={offerForm.minimumOrderQuantity} onChange={e => setOfferForm({ ...offerForm, minimumOrderQuantity: e.target.value })} />
                </label>
                <label>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{t('rfq.offerValidity')}</span>
                  <input type="date" className="form-input" value={offerForm.validityDate} onChange={e => setOfferForm({ ...offerForm, validityDate: e.target.value })} />
                </label>
                <label>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{t('rfq.offerPaymentTerms')}</span>
                  <input className="form-input" value={offerForm.paymentTerms} onChange={e => setOfferForm({ ...offerForm, paymentTerms: e.target.value })} />
                </label>
              </div>
              <label style={{ display: 'block', marginTop: 8 }}>
                <span style={{ fontSize: 12, color: '#6b7280' }}>{t('rfq.offerNotes')}</span>
                <textarea className="form-input" rows={2} value={offerForm.commercialNotes} onChange={e => setOfferForm({ ...offerForm, commercialNotes: e.target.value })} />
              </label>
              <div style={{ marginTop: 8 }}>
                <button type="submit" className="btn btn-primary btn-sm" disabled={savingOffer || !offerForm.supplierId || !offerForm.rfqItemId}>
                  {savingOffer ? t('rfq.saving') : t('rfq.recordOffer')}
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
