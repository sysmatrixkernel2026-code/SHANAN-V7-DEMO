import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { LoadingState } from '../../components/LoadingEmptyStates';

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
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
}

interface ProductTerm {
  id: string;
  product_id: string;
  supplier_product_code: string | null;
  supplier_product_name: string | null;
  unit_price: number;
  currency: string | null;
  minimum_order_quantity: number | null;
  price_valid_from: string | null;
  price_valid_to: string | null;
  availability_status: string;
  available_quantity: number | null;
  lead_time_days: number | null;
  status: string;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
  canonical_product_sku: string | null;
  canonical_product_name_en: string | null;
}

interface AgreementData {
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

const TERM_STATUS_BADGE: Record<string, string> = {
  active: 'badge-success',
  inactive: 'badge-secondary',
};

const AVAILABILITY_BADGE: Record<string, string> = {
  available: 'badge-success',
  limited: 'badge-warning',
  unavailable: 'badge-error',
  expected: 'badge-info',
};

const CURRENCIES = ['JOD', 'USD', 'EUR', 'GBP', 'SAR', 'AED'];

interface TermForm {
  productId: string;
  unitPrice: string;
  currency: string;
  minimumOrderQuantity: string;
  leadTimeDays: string;
  availabilityStatus: string;
  supplierProductCode: string;
  supplierProductName: string;
  internalNotes: string;
}

const EMPTY_FORM: TermForm = { productId: '', unitPrice: '', currency: 'JOD', minimumOrderQuantity: '', leadTimeDays: '', availabilityStatus: 'available', supplierProductCode: '', supplierProductName: '', internalNotes: '' };

export default function SupplierAgreementDetail() {
  const { id } = useParams<{ id: string }>();
  const { t } = useLanguage();
  const { token } = useAuth();
  const [data, setData] = useState<AgreementData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAddTerm, setShowAddTerm] = useState(false);
  const [form, setForm] = useState<TermForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [deactivating, setDeactivating] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  const loadAgreement = useCallback(async () => {
    if (!token || !id) return;
    try {
      const res = await fetch(`${API_URL}/api/supplier/agreements/${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed');
      setData(await res.json());
    } catch {
      setError(t('supplier.agrLoadError'));
    }
  }, [token, id, t]);

  useEffect(() => { loadAgreement(); }, [loadAgreement]);

  useEffect(() => {
    if (!successMsg) return;
    const timer = setTimeout(() => setSuccessMsg(null), 3000);
    return () => clearTimeout(timer);
  }, [successMsg]);

  const handleAddTerm = async () => {
    if (!id) return;
    const price = parseFloat(form.unitPrice);
    if (!form.productId.trim()) { setError(t('supplier.termProductIdRequired')); return; }
    if (!price || price < 0) { setError(t('supplier.termPriceRequired')); return; }
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { productId: form.productId.trim(), unitPrice: price, currency: form.currency };
      if (form.supplierProductCode) body.supplierProductCode = form.supplierProductCode;
      if (form.supplierProductName) body.supplierProductName = form.supplierProductName;
      if (form.minimumOrderQuantity) body.minimumOrderQuantity = parseInt(form.minimumOrderQuantity);
      if (form.leadTimeDays) body.leadTimeDays = parseInt(form.leadTimeDays);
      if (form.availabilityStatus) body.availabilityStatus = form.availabilityStatus;
      if (form.internalNotes) body.internalNotes = form.internalNotes;
      const res = await fetch(`${API_URL}/api/supplier/agreements/${id}/terms`, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!res.ok) { const err = await res.json(); setError(err.error || t('supplier.termAddError')); return; }
      setSuccessMsg(t('supplier.termAdded'));
      setShowAddTerm(false);
      setForm(EMPTY_FORM);
      await loadAgreement();
    } catch {
      setError(t('supplier.termAddError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (termId: string) => {
    if (!id) return;
    if (!confirm(t('supplier.termDeactivateConfirm'))) return;
    setDeactivating(termId);
    try {
      const res = await fetch(`${API_URL}/api/supplier/agreements/${id}/terms/${termId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) { const err = await res.json(); setError(err.error || t('supplier.termDeactivateError')); return; }
      setSuccessMsg(t('supplier.termDeactivated'));
      await loadAgreement();
    } catch {
      setError(t('supplier.termDeactivateError'));
    } finally {
      setDeactivating(null);
    }
  };

  const updateForm = (field: keyof TermForm, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  if (error && !data) return <div className="admin-error-state"><p>{error}</p></div>;
  if (!data) return <LoadingState type="detail" />;

  const a = data.agreement;

  return (
    <div style={{ padding: '32px 0 64px' }}>
      <Link to="/supplier/agreements" className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }}>
        {t('supplier.backToAgreements')}
      </Link>

      {error && <div className="admin-error-state" style={{ marginBottom: 16 }}><p>{error}</p><button className="btn btn-ghost btn-sm" onClick={() => setError(null)}>x</button></div>}
      {successMsg && <div className="admin-success-state" style={{ marginBottom: 16 }}><p>{successMsg}</p></div>}

      {/* Agreement Header */}
      <div className="card" style={{ padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <span className="admin-eyebrow">
              <span className="admin-eyebrow-dot" />
              {t('supplier.agrEyebrow')}
            </span>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: '8px 0 4px' }}>{a.agreement_number}</h1>
          </div>
          <span className={`badge ${STATUS_BADGE[a.status] || 'badge-neutral'}`}>{a.status}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginTop: 20 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('supplier.agrCurrency')}</div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{a.currency}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('supplier.agrPaymentTerms')}</div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{a.payment_terms_days != null ? `Net ${a.payment_terms_days}` : '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('supplier.agrEffectiveFrom')}</div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{a.effective_from ? new Date(a.effective_from).toLocaleDateString() : '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('supplier.agrEffectiveTo')}</div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{a.effective_to ? new Date(a.effective_to).toLocaleDateString() : '—'}</div>
          </div>
          {a.supplier_credit_limit && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('supplier.agrCreditLimit')}</div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{a.supplier_credit_limit}</div>
            </div>
          )}
        </div>
        {a.trade_terms_notes && (
          <div style={{ marginTop: 16, padding: '12px 16px', background: '#f8fafc', borderRadius: 8, fontSize: 13 }}>
            <div style={{ fontWeight: 500, marginBottom: 4 }}>{t('supplier.agrTradeTerms')}</div>
            <div style={{ color: 'var(--text-secondary)' }}>{a.trade_terms_notes}</div>
          </div>
        )}
      </div>

      {/* Product Terms */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>{t('supplier.agrProductTerms')} ({data.productTermsCount})</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAddTerm(!showAddTerm)}>
          {showAddTerm ? t('common.cancel') : t('supplier.termAdd')}
        </button>
      </div>

      {/* Add Term Form */}
      {showAddTerm && (
        <div className="card" style={{ padding: 20, marginBottom: 20, border: '1px solid var(--color-primary)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>{t('supplier.termAddNew')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>{t('supplier.termProductId')} *</label>
              <input className="input" value={form.productId} onChange={e => updateForm('productId', e.target.value)} placeholder="prod-SHN-JB-..." />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>{t('supplier.termUnitPrice')} *</label>
              <input className="input" type="number" step="0.01" min="0" value={form.unitPrice} onChange={e => updateForm('unitPrice', e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>{t('supplier.termCurrency')}</label>
              <select className="input" value={form.currency} onChange={e => updateForm('currency', e.target.value)}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>{t('supplier.termMOQ')}</label>
              <input className="input" type="number" min="0" value={form.minimumOrderQuantity} onChange={e => updateForm('minimumOrderQuantity', e.target.value)} placeholder="0" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>{t('supplier.termLeadTime')}</label>
              <input className="input" type="number" min="0" value={form.leadTimeDays} onChange={e => updateForm('leadTimeDays', e.target.value)} placeholder="0" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>{t('supplier.termAvailability')}</label>
              <select className="input" value={form.availabilityStatus} onChange={e => updateForm('availabilityStatus', e.target.value)}>
                <option value="available">{t('supplier.avail_available')}</option>
                <option value="limited">{t('supplier.avail_limited')}</option>
                <option value="unavailable">{t('supplier.avail_unavailable')}</option>
                <option value="expected">{t('supplier.avail_expected')}</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>{t('supplier.termSupplierSKU')}</label>
              <input className="input" value={form.supplierProductCode} onChange={e => updateForm('supplierProductCode', e.target.value)} placeholder={t('supplier.fieldSupplierSkuPlaceholder')} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>{t('supplier.termSupplierName')}</label>
              <input className="input" value={form.supplierProductName} onChange={e => updateForm('supplierProductName', e.target.value)} placeholder={t('supplier.fieldSupplierNamePlaceholder')} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { setShowAddTerm(false); setForm(EMPTY_FORM); }}>{t('common.cancel')}</button>
            <button className="btn btn-primary btn-sm" disabled={submitting} onClick={handleAddTerm}>{submitting ? '...' : t('supplier.termAddSubmit')}</button>
          </div>
        </div>
      )}

      {/* Terms List */}
      {data.productTerms.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{t('supplier.noProductTerms')}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {data.productTerms.map(term => (
            <div key={term.id} className="card" style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{term.canonical_product_name_en || term.product_id}</span>
                    <span className={`badge ${TERM_STATUS_BADGE[term.status] || 'badge-neutral'}`}>{term.status}</span>
                    <span className={`badge ${AVAILABILITY_BADGE[term.availability_status] || 'badge-neutral'}`}>{term.availability_status}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--text-secondary)' }}>
                    <span>{t('supplier.termSKU')}: {term.canonical_product_sku || term.product_id}</span>
                    {term.supplier_product_code && <span>{t('supplier.termSupplierSKU')}: {term.supplier_product_code}</span>}
                    {term.supplier_product_name && <span>{t('supplier.termSupplierName')}: {term.supplier_product_name}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, marginTop: 8 }}>
                    <span style={{ fontWeight: 600 }}>{t('supplier.termUnitPrice')}: {term.unit_price} {term.currency || a.currency}</span>
                    {term.minimum_order_quantity != null && <span>{t('supplier.termMOQ')}: {term.minimum_order_quantity}</span>}
                    {term.lead_time_days != null && <span>{t('supplier.termLeadTime')}: {term.lead_time_days}d</span>}
                    {term.available_quantity != null && <span>{t('supplier.termAvailableQty')}: {term.available_quantity}</span>}
                  </div>
                </div>
                {term.status === 'active' && (
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ color: 'var(--color-error, #dc2626)', flexShrink: 0 }}
                    disabled={deactivating === term.id}
                    onClick={() => handleDeactivate(term.id)}
                  >
                    {deactivating === term.id ? '...' : t('supplier.termDeactivate')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
