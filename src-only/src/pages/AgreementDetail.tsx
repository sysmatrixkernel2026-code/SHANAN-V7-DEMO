import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { LoadingState, EmptyState } from '../components/LoadingEmptyStates';

// ============================================================
// AgreementDetail — Internal SHANAN staff page.
// Route: /admin/agreements/:id  (ProtectedRoute requireInternal)
//
// Shows one supplier agreement's full details + a product-terms
// management table. Supports adding, editing, and deactivating
// product terms linked to canonical SHANAN products.
// ============================================================

const API_URL = import.meta.env.VITE_API_URL || '';

interface Agreement {
  id: string;
  agreement_number: string;
  supplier_id: string;
  supplier_name: string | null;
  supplier_reference: string | null;
  status: 'draft' | 'active' | 'suspended' | 'expired' | 'terminated';
  effective_from: string | null;
  effective_to: string | null;
  currency: string;
  payment_terms_days: number | null;
  supplier_credit_limit: string | null;
  trade_terms_notes: string | null;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
}

interface ProductTerm {
  id: string;
  agreement_id: string;
  product_id: string;
  supplier_product_code: string | null;
  supplier_product_name: string | null;
  unit_price: number;
  currency: string | null;
  minimum_order_quantity: number | null;
  price_valid_from: string | null;
  price_valid_to: string | null;
  availability_status: 'available' | 'limited' | 'unavailable' | 'expected';
  available_quantity: number | null;
  availability_updated_at: string | null;
  expected_available_date: string | null;
  lead_time_days: number | null;
  status: 'active' | 'inactive';
  internal_notes: string | null;
  // Enriched canonical product fields (server joins them on read)
  canonical_product_sku: string | null;
  canonical_product_code: string | null;
  canonical_product_name_en: string | null;
}

interface AgreementDetailData {
  agreement: Agreement;
  productTerms: ProductTerm[];
  productTermsCount: number;
}

const STATUS_BADGE: Record<string, string> = {
  draft: 'badge-neutral',
  active: 'badge-success',
  suspended: 'badge-warning',
  expired: 'badge-info',
  terminated: 'badge-error',
};

const STATUS_LABEL_KEYS: Record<string, 'agreements.statusDraft' | 'agreements.statusActive' | 'agreements.statusSuspended' | 'agreements.statusExpired' | 'agreements.statusTerminated'> = {
  draft: 'agreements.statusDraft',
  active: 'agreements.statusActive',
  suspended: 'agreements.statusSuspended',
  expired: 'agreements.statusExpired',
  terminated: 'agreements.statusTerminated',
};

const AVAIL_BADGE: Record<string, string> = {
  available: 'badge-success',
  limited: 'badge-warning',
  unavailable: 'badge-error',
  expected: 'badge-info',
};

const AVAIL_LABEL_KEYS: Record<string, 'agreements.availAvailable' | 'agreements.availLimited' | 'agreements.availUnavailable' | 'agreements.availExpected'> = {
  available: 'agreements.availAvailable',
  limited: 'agreements.availLimited',
  unavailable: 'agreements.availUnavailable',
  expected: 'agreements.availExpected',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }); }
  catch { return iso; }
}

export default function AgreementDetail() {
  const { id } = useParams<{ id: string }>();
  const { t } = useLanguage();
  const { token } = useAuth();

  const [detail, setDetail] = useState<AgreementDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // A12-2: Async product search state (moved inside component — V7 fix:
  // module-level useState/useEffect calls caused "Cannot read properties of
  // null (reading 'useState')" crash because React's dispatcher is null
  // outside component render context)
  const [productSearchResults, setProductSearchResults] = useState<any[]>([]);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [productSearchLoading, setProductSearchLoading] = useState(false);

  // Debounced product search
  useEffect(() => {
    if (!productSearchQuery || productSearchQuery.length < 2) {
      setProductSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setProductSearchLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/products?search=${encodeURIComponent(productSearchQuery)}&pageSize=20`);
        if (res.ok) {
          const data = await res.json();
          setProductSearchResults(data.items || []);
        }
      } catch {
        setProductSearchResults([]);
      } finally {
        setProductSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [productSearchQuery]);

  // Edit form state
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // New product term form
  const [showAddTerm, setShowAddTerm] = useState(false);
  const [termForm, setTermForm] = useState({
    productId: '',
    supplierProductCode: '',
    supplierProductName: '',
    unitPrice: '',
    currency: '',
    minimumOrderQuantity: '',
    priceValidFrom: '',
    priceValidTo: '',
    availabilityStatus: 'available',
    availableQuantity: '',
    expectedAvailableDate: '',
    leadTimeDays: '',
    status: 'active',
    internalNotes: '',
  });
  const [termSaving, setTermSaving] = useState(false);
  const [termError, setTermError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    if (!id || !token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/supplier-agreements/${encodeURIComponent(id)}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.status === 404) {
        setError('Agreement not found');
        setDetail(null);
        return;
      }
      if (res.status === 401 || res.status === 403) {
        setError(res.status === 401 ? 'Authentication required' : 'Internal access required');
        setDetail(null);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDetail(data);
      // Seed edit form
      const a = data.agreement;
      setEditForm({
        status: a.status || 'draft',
        effectiveFrom: a.effective_from || '',
        effectiveTo: a.effective_to || '',
        currency: a.currency || 'JOD',
        paymentTermsDays: a.payment_terms_days != null ? String(a.payment_terms_days) : '',
        supplierCreditLimit: a.supplier_credit_limit || '',
        tradeTermsNotes: a.trade_terms_notes || '',
        internalNotes: a.internal_notes || '',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load agreement.');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  const handleSave = async () => {
    if (!detail || !token) return;
    setSaving(true);
    setSaveError(null);
    try {
      const body: Record<string, unknown> = {};
      const a = detail.agreement;
      if (editForm.status !== a.status) body.status = editForm.status;
      if ((editForm.effectiveFrom || null) !== (a.effective_from || null)) body.effectiveFrom = editForm.effectiveFrom || null;
      if ((editForm.effectiveTo || null) !== (a.effective_to || null)) body.effectiveTo = editForm.effectiveTo || null;
      if ((editForm.currency || 'JOD') !== (a.currency || 'JOD')) body.currency = editForm.currency.trim() || 'JOD';
      const ptDays = editForm.paymentTermsDays === '' ? null : Number(editForm.paymentTermsDays);
      const aPtDays = a.payment_terms_days;
      if (ptDays !== aPtDays) {
        if (ptDays === null) body.paymentTermsDays = null;
        else if (Number.isInteger(ptDays) && ptDays >= 0) body.paymentTermsDays = ptDays;
      }
      if ((editForm.supplierCreditLimit || null) !== (a.supplier_credit_limit || null)) {
        body.supplierCreditLimit = editForm.supplierCreditLimit.trim() || null;
      }
      if ((editForm.tradeTermsNotes || null) !== (a.trade_terms_notes || null)) {
        body.tradeTermsNotes = editForm.tradeTermsNotes.trim() || null;
      }
      if ((editForm.internalNotes || null) !== (a.internal_notes || null)) {
        body.internalNotes = editForm.internalNotes.trim() || null;
      }
      if (Object.keys(body).length === 0) {
        setSaveError('No changes to save.');
        return;
      }
      const res = await fetch(`${API_URL}/api/supplier-agreements/${encodeURIComponent(detail.agreement.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      await loadDetail();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save agreement.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddTerm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail || !token) return;
    setTermSaving(true);
    setTermError(null);
    if (!termForm.productId) {
      setTermError(t('agreements.invalidProduct'));
      setTermSaving(false);
      return;
    }
    const unitPrice = Number(termForm.unitPrice);
    if (isNaN(unitPrice) || unitPrice < 0) {
      setTermError(t('agreements.fieldUnitPrice') + ': must be a non-negative number');
      setTermSaving(false);
      return;
    }
    try {
      const body: Record<string, unknown> = {
        productId: termForm.productId,
        unitPrice,
        availabilityStatus: termForm.availabilityStatus,
        status: termForm.status,
        supplierProductCode: termForm.supplierProductCode.trim() || null,
        supplierProductName: termForm.supplierProductName.trim() || null,
        currency: termForm.currency.trim() || null,
        priceValidFrom: termForm.priceValidFrom || null,
        priceValidTo: termForm.priceValidTo || null,
        internalNotes: termForm.internalNotes.trim() || null,
      };
      if (termForm.minimumOrderQuantity !== '') {
        const n = parseInt(termForm.minimumOrderQuantity, 10);
        if (!isNaN(n) && n >= 0) body.minimumOrderQuantity = n;
      }
      if (termForm.availableQuantity !== '') {
        const n = parseInt(termForm.availableQuantity, 10);
        if (!isNaN(n) && n >= 0) body.availableQuantity = n;
      }
      if (termForm.leadTimeDays !== '') {
        const n = parseInt(termForm.leadTimeDays, 10);
        if (!isNaN(n) && n >= 0) body.leadTimeDays = n;
      }
      if (termForm.expectedAvailableDate) {
        body.expectedAvailableDate = termForm.expectedAvailableDate;
      }
      const res = await fetch(`${API_URL}/api/supplier-agreements/${encodeURIComponent(detail.agreement.id)}/product-terms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setShowAddTerm(false);
      setTermForm({
        productId: '', supplierProductCode: '', supplierProductName: '', unitPrice: '', currency: '',
        minimumOrderQuantity: '', priceValidFrom: '', priceValidTo: '', availabilityStatus: 'available',
        availableQuantity: '', expectedAvailableDate: '', leadTimeDays: '', status: 'active', internalNotes: '',
      });
      await loadDetail();
    } catch (e) {
      setTermError(e instanceof Error ? e.message : 'Could not add product term.');
    } finally {
      setTermSaving(false);
    }
  };

  const handleDeactivateTerm = async (termId: string) => {
    if (!detail || !token) return;
    if (!confirm('Deactivate this product term? (status → inactive)')) return;
    try {
      const res = await fetch(`${API_URL}/api/supplier-agreements/${encodeURIComponent(detail.agreement.id)}/product-terms/${termId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      await loadDetail();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not deactivate product term.');
    }
  };

  if (loading) return <LoadingState type="detail" />;
  if (error || !detail) {
    return (
      <EmptyState
        title={error || 'Not found'}
        description=""
        action={<Link to="/admin/agreements" className="btn btn-primary">{t('agreements.title')}</Link>}
      />
    );
  }

  const a = detail.agreement;

  return (
    <div className="container" style={{ padding: '40px 0 64px' }}>
      <Link to="/admin/agreements" className="portal-back-link">← {t('agreements.title')}</Link>

      <div className="page-header" style={{ marginBottom: 32 }}>
        <span className="admin-eyebrow">
          <span className="admin-eyebrow-dot" />
          {t('agreements.eyebrow')}
        </span>
        <h1 className="page-title">{a.agreement_number}</h1>
        <p className="page-subtitle">
          {a.supplier_name || '—'} {a.supplier_reference ? `(${a.supplier_reference})` : ''}
        </p>
      </div>

      <div className="admin-layout">
        {/* LEFT: agreement details + edit */}
        <section className="admin-detail-panel">
          <article className="admin-detail-card">
            <header className="admin-detail-header">
              <div>
                <h2 className="admin-detail-title">{t('agreements.detailHeader')}</h2>
                <p className="admin-detail-reference">{a.agreement_number}</p>
              </div>
              <span className={`badge ${STATUS_BADGE[a.status] || 'badge-neutral'}`}>
                {t(STATUS_LABEL_KEYS[a.status] || 'agreements.statusDraft')}
              </span>
            </header>

            <div className="admin-detail-grid">
              <label>
                <span>{t('agreements.fieldStatus')}</span>
                <select className="form-input" value={editForm.status || 'draft'} onChange={e => setEditForm({ ...editForm, status: e.target.value })}>
                  <option value="draft">{t('agreements.statusDraft')}</option>
                  <option value="active">{t('agreements.statusActive')}</option>
                  <option value="suspended">{t('agreements.statusSuspended')}</option>
                  <option value="expired">{t('agreements.statusExpired')}</option>
                  <option value="terminated">{t('agreements.statusTerminated')}</option>
                </select>
              </label>
              <label>
                <span>{t('agreements.fieldCurrency')}</span>
                <input className="form-input" value={editForm.currency || ''} onChange={e => setEditForm({ ...editForm, currency: e.target.value })} />
              </label>
              <label>
                <span>{t('agreements.fieldEffectiveFrom')}</span>
                <input type="date" className="form-input" value={editForm.effectiveFrom || ''} onChange={e => setEditForm({ ...editForm, effectiveFrom: e.target.value })} />
              </label>
              <label>
                <span>{t('agreements.fieldEffectiveTo')}</span>
                <input type="date" className="form-input" value={editForm.effectiveTo || ''} onChange={e => setEditForm({ ...editForm, effectiveTo: e.target.value })} />
              </label>
              <label>
                <span>{t('agreements.fieldPaymentTermsDays')}</span>
                <input type="number" min={0} className="form-input" value={editForm.paymentTermsDays || ''} onChange={e => setEditForm({ ...editForm, paymentTermsDays: e.target.value })} />
              </label>
              <label>
                <span>{t('agreements.fieldSupplierCreditLimit')}</span>
                <input className="form-input" value={editForm.supplierCreditLimit || ''} onChange={e => setEditForm({ ...editForm, supplierCreditLimit: e.target.value })} />
              </label>
            </div>

            <label style={{ display: 'block', marginTop: 12 }}>
              <span>{t('agreements.fieldTradeTermsNotes')}</span>
              <textarea className="form-input" rows={2} value={editForm.tradeTermsNotes || ''} onChange={e => setEditForm({ ...editForm, tradeTermsNotes: e.target.value })} />
            </label>
            <label style={{ display: 'block', marginTop: 12 }}>
              <span>{t('agreements.fieldInternalNotes')}</span>
              <textarea className="form-input" rows={2} value={editForm.internalNotes || ''} onChange={e => setEditForm({ ...editForm, internalNotes: e.target.value })} />
            </label>

            {saveError && <div className="portal-error-banner" style={{ marginTop: 8 }}>{saveError}</div>}

            <div style={{ marginTop: 12 }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                {saving ? t('agreements.saving') : t('agreements.save')}
              </button>
            </div>
          </article>
        </section>

        {/* RIGHT: product terms */}
        <section className="admin-list-panel">
          <header className="admin-list-header">
            <h2 className="admin-list-title">
              {t('agreements.productTermsTitle')} ({detail.productTermsCount})
            </h2>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowAddTerm(s => !s)}>
              {t('agreements.newProductTerm')}
            </button>
          </header>

          {showAddTerm && (
            <form onSubmit={handleAddTerm} style={{ marginBottom: 16, padding: 12, border: '1px solid #e5e7eb', borderRadius: 6, background: '#fafafa' }}>
              <label style={{ display: 'block', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: '#6b7280' }}>{t('agreements.fieldProduct')} *</span>
                <input
                  className="form-input"
                  type="search"
                  placeholder="Search products by name or SKU..."
                  value={productSearchQuery}
                  onChange={e => { setProductSearchQuery(e.target.value); setTermForm({ ...termForm, productId: '' }); }}
                  list="product-search-list"
                />
                <datalist id="product-search-list">
                  {productSearchResults.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.sku} — {p.name.en}</option>
                  ))}
                </datalist>
                {productSearchLoading && <span style={{ fontSize: 11, color: '#6b7280' }}>Searching...</span>}
                {productSearchResults.length > 0 && !termForm.productId && (
                  <div style={{ marginTop: 4, maxHeight: 200, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 4 }}>
                    {productSearchResults.map((p: any) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { setTermForm({ ...termForm, productId: p.id }); setProductSearchQuery(`${p.sku} — ${p.name.en}`); }}
                        style={{ display: 'block', width: '100%', padding: '8px 12px', border: 'none', background: 'white', textAlign: 'left', cursor: 'pointer', fontSize: 13 }}
                      >
                        <strong>{p.sku}</strong> — {p.name.en}
                        {p.name.ar && <span style={{ color: '#6b7280', marginInlineStart: 8 }} dir="rtl">{p.name.ar}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {termForm.productId && (
                  <span style={{ fontSize: 11, color: '#10b981', marginTop: 4, display: 'block' }}>✓ Product selected: {termForm.productId}</span>
                )}
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input className="form-input" placeholder={t('agreements.fieldSupplierProductCode')} value={termForm.supplierProductCode} onChange={e => setTermForm({ ...termForm, supplierProductCode: e.target.value })} />
                <input className="form-input" placeholder={t('agreements.fieldSupplierProductName')} value={termForm.supplierProductName} onChange={e => setTermForm({ ...termForm, supplierProductName: e.target.value })} />
                <input type="number" step="0.01" min={0} className="form-input" placeholder={t('agreements.fieldUnitPrice') + ' *'} value={termForm.unitPrice} onChange={e => setTermForm({ ...termForm, unitPrice: e.target.value })} required />
                <input className="form-input" placeholder={t('agreements.fieldCurrency')} value={termForm.currency} onChange={e => setTermForm({ ...termForm, currency: e.target.value })} />
                <input type="number" min={0} className="form-input" placeholder={t('agreements.fieldMOQ')} value={termForm.minimumOrderQuantity} onChange={e => setTermForm({ ...termForm, minimumOrderQuantity: e.target.value })} />
                <input type="number" min={0} className="form-input" placeholder={t('agreements.fieldLeadTimeDays')} value={termForm.leadTimeDays} onChange={e => setTermForm({ ...termForm, leadTimeDays: e.target.value })} />
                <input type="number" min={0} className="form-input" placeholder={t('agreements.fieldAvailableQuantity')} value={termForm.availableQuantity} onChange={e => setTermForm({ ...termForm, availableQuantity: e.target.value })} />
                <select className="form-input" value={termForm.availabilityStatus} onChange={e => setTermForm({ ...termForm, availabilityStatus: e.target.value })}>
                  <option value="available">{t('agreements.availAvailable')}</option>
                  <option value="limited">{t('agreements.availLimited')}</option>
                  <option value="unavailable">{t('agreements.availUnavailable')}</option>
                  <option value="expected">{t('agreements.availExpected')}</option>
                </select>
                <input type="date" className="form-input" placeholder={t('agreements.fieldPriceValidFrom')} value={termForm.priceValidFrom} onChange={e => setTermForm({ ...termForm, priceValidFrom: e.target.value })} />
                <input type="date" className="form-input" placeholder={t('agreements.fieldPriceValidTo')} value={termForm.priceValidTo} onChange={e => setTermForm({ ...termForm, priceValidTo: e.target.value })} />
                <input type="date" className="form-input" placeholder={t('agreements.fieldExpectedAvailableDate')} value={termForm.expectedAvailableDate} onChange={e => setTermForm({ ...termForm, expectedAvailableDate: e.target.value })} />
                <select className="form-input" value={termForm.status} onChange={e => setTermForm({ ...termForm, status: e.target.value })}>
                  <option value="active">{t('agreements.termStatusActive')}</option>
                  <option value="inactive">{t('agreements.termStatusInactive')}</option>
                </select>
              </div>
              <textarea className="form-input" style={{ marginTop: 8, width: '100%' }} rows={2} placeholder={t('agreements.fieldInternalNotes')} value={termForm.internalNotes} onChange={e => setTermForm({ ...termForm, internalNotes: e.target.value })} />
              {termError && <div className="portal-error-banner" style={{ marginTop: 8 }}>{termError}</div>}
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-primary btn-sm" disabled={termSaving}>{termSaving ? t('agreements.saving') : t('agreements.save')}</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAddTerm(false)}>×</button>
              </div>
            </form>
          )}

          {detail.productTerms.length === 0 ? (
            <p className="portal-no-items">{t('agreements.noProductTerms')}</p>
          ) : (
            <div className="portal-items-table-wrap">
              <table className="portal-items-table">
                <thead>
                  <tr>
                    <th>{t('agreements.colProduct')}</th>
                    <th>{t('agreements.colSku')}</th>
                    <th>{t('agreements.colSupplierCode')}</th>
                    <th className="num">{t('agreements.colUnitPrice')}</th>
                    <th>{t('agreements.colAvailability')}</th>
                    <th className="num">{t('agreements.colLeadTime')}</th>
                    <th>{t('agreements.colStatus')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {detail.productTerms.map(term => (
                    <tr key={term.id} style={{ opacity: term.status === 'inactive' ? 0.55 : 1 }}>
                      <td>{term.canonical_product_name_en || term.product_id}</td>
                      <td className="mono">{term.canonical_product_sku || '—'}</td>
                      <td>{term.supplier_product_code || '—'}</td>
                      <td className="num">{term.unit_price} {term.currency || a.currency}</td>
                      <td>
                        <span className={`badge ${AVAIL_BADGE[term.availability_status] || 'badge-neutral'}`}>
                          {t(AVAIL_LABEL_KEYS[term.availability_status] || 'agreements.availAvailable')}
                        </span>
                        {term.available_quantity != null && <div style={{ fontSize: 11, marginTop: 2 }}>{term.available_quantity}</div>}
                      </td>
                      <td className="num">{term.lead_time_days != null ? `${term.lead_time_days}d` : '—'}</td>
                      <td>
                        <span className={`badge ${term.status === 'active' ? 'badge-success' : 'badge-neutral'}`}>
                          {term.status === 'active' ? t('agreements.termStatusActive') : t('agreements.termStatusInactive')}
                        </span>
                      </td>
                      <td>
                        {term.status === 'active' && (
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleDeactivateTerm(term.id)}>
                            {t('agreements.deactivate')}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
