import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { LoadingState } from '../../components/LoadingEmptyStates';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface RfqItem {
  id: string;
  product_id: string;
  product_name: string;
  sku: string;
  requested_quantity: number;
  customer_notes: string | null;
  rfq_notes: string | null;
  existing_offer: {
    id: string;
    offer_status: string;
    quoted_unit_price: number | null;
    currency: string | null;
    offered_quantity: number | null;
    lead_time_days: number | null;
    validity_date: string | null;
    minimum_order_quantity: number | null;
    payment_terms: string | null;
    commercial_notes: string | null;
    responded_at: string | null;
  } | null;
}

interface RfqDetail {
  id: string;
  reference: string;
  status: string;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

interface RfqData {
  rfq: RfqDetail;
  items: RfqItem[];
}

interface ItemForm {
  unitPrice: string;
  currency: string;
  offeredQuantity: string;
  leadTimeDays: string;
  paymentTerms: string;
  notes: string;
}

const CURRENCIES = ['JOD', 'USD', 'EUR', 'GBP', 'SAR', 'AED'];

const RFQ_STATUS_BADGE: Record<string, string> = {
  sent: 'badge-warning',
  partially_responded: 'badge-info',
  responded: 'badge-success',
  closed: 'badge-secondary',
  cancelled: 'badge-error',
};

export default function SupplierRfqDetail() {
  const { id } = useParams<{ id: string }>();
  const { t } = useLanguage();
  const { token } = useAuth();
  const [data, setData] = useState<RfqData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, ItemForm>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  const loadRfq = useCallback(async () => {
    if (!token || !id) return;
    try {
      const res = await fetch(`${API_URL}/api/supplier/rfqs/${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed');
      const d: RfqData = await res.json();
      setData(d);
      // Initialize forms from existing offers
      const initialForms: Record<string, ItemForm> = {};
      for (const item of d.items) {
        const o = item.existing_offer;
        initialForms[item.id] = {
          unitPrice: o?.quoted_unit_price?.toString() || '',
          currency: o?.currency || 'JOD',
          offeredQuantity: o?.offered_quantity?.toString() || '',
          leadTimeDays: o?.lead_time_days?.toString() || '',
          paymentTerms: o?.payment_terms || '',
          notes: o?.commercial_notes || '',
        };
      }
      setForms(initialForms);
    } catch {
      setError(t('supplier.rfqLoadError'));
    }
  }, [token, id, t]);

  useEffect(() => { loadRfq(); }, [loadRfq]);

  useEffect(() => {
    if (!successMsg) return;
    const timer = setTimeout(() => setSuccessMsg(null), 3000);
    return () => clearTimeout(timer);
  }, [successMsg]);

  const canSubmit = data?.rfq.status === 'sent' || data?.rfq.status === 'partially_responded';

  const handleSubmit = async (itemId: string) => {
    if (!id) return;
    const form = forms[itemId];
    if (!form) return;
    const price = parseFloat(form.unitPrice);
    if (!price || price <= 0) {
      setError(t('supplier.offerPriceRequired'));
      return;
    }
    setSubmitting(itemId);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        rfqItemId: itemId,
        unitPrice: price,
        currency: form.currency,
      };
      if (form.offeredQuantity) body.offeredQuantity = parseInt(form.offeredQuantity);
      if (form.leadTimeDays) body.leadTimeDays = parseInt(form.leadTimeDays);
      if (form.paymentTerms) body.paymentTerms = form.paymentTerms;
      if (form.notes) body.notes = form.notes;

      const existingOffer = data?.items.find(i => i.id === itemId)?.existing_offer;
      let res: Response;
      if (existingOffer) {
        // Update existing offer
        res = await fetch(`${API_URL}/api/supplier/rfqs/${id}/offers/${existingOffer.id}`, {
          method: 'PUT', headers, body: JSON.stringify(body),
        });
      } else {
        // Create new offer
        res = await fetch(`${API_URL}/api/supplier/rfqs/${id}/offers`, {
          method: 'POST', headers, body: JSON.stringify(body),
        });
      }
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || t('supplier.offerSubmitError'));
        return;
      }
      setSuccessMsg(existingOffer ? t('supplier.offerUpdated') : t('supplier.offerSubmitted'));
      await loadRfq();
    } catch {
      setError(t('supplier.offerSubmitError'));
    } finally {
      setSubmitting(null);
    }
  };

  const handleWithdraw = async (itemId: string) => {
    if (!id) return;
    const offer = data?.items.find(i => i.id === itemId)?.existing_offer;
    if (!offer) return;
    if (!confirm(t('supplier.offerWithdrawConfirm'))) return;
    setWithdrawing(itemId);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/supplier/rfqs/${id}/offers/${offer.id}`, {
        method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || t('supplier.offerWithdrawError'));
        return;
      }
      setSuccessMsg(t('supplier.offerWithdrawn'));
      await loadRfq();
    } catch {
      setError(t('supplier.offerWithdrawError'));
    } finally {
      setWithdrawing(null);
    }
  };

  const updateForm = (itemId: string, field: keyof ItemForm, value: string) => {
    setForms(prev => ({ ...prev, [itemId]: { ...prev[itemId], [field]: value } }));
  };

  if (error && !data) return <div className="admin-error-state"><p>{error}</p></div>;
  if (!data) return <LoadingState type="detail" />;

  const allItemsCount = data.items.length;
  const offeredCount = data.items.filter(i => i.existing_offer).length;

  return (
    <div style={{ padding: '32px 0 64px' }}>
      <Link to="/supplier/rfqs" className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }}>
        {t('supplier.backToRfqs')}
      </Link>

      {error && <div className="admin-error-state" style={{ marginBottom: 16 }}><p>{error}</p><button className="btn btn-ghost btn-sm" onClick={() => setError(null)}>x</button></div>}
      {successMsg && <div className="admin-success-state" style={{ marginBottom: 16 }}><p>{successMsg}</p></div>}

      {/* RFQ Header */}
      <div className="card" style={{ padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <span className="admin-eyebrow">
              <span className="admin-eyebrow-dot" />
              {t('supplier.rfqEyebrow')}
            </span>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: '8px 0 4px' }}>{data.rfq.reference}</h1>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {t('supplier.rfqSent')}: {data.rfq.sent_at ? new Date(data.rfq.sent_at).toLocaleDateString() : '—'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className={`badge ${RFQ_STATUS_BADGE[data.rfq.status] || 'badge-secondary'}`}>
              {data.rfq.status.replace(/_/g, ' ')}
            </span>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {offeredCount}/{allItemsCount} {t('supplier.rfqOffered')}
            </div>
          </div>
        </div>
        {!canSubmit && data.rfq.status !== 'closed' && data.rfq.status !== 'cancelled' && (
          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            {t('supplier.rfqNotAcceptingOffers')}
          </div>
        )}
        {(data.rfq.status === 'closed' || data.rfq.status === 'cancelled') && (
          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            {t('supplier.rfqClosedOrCancelled')}
          </div>
        )}
      </div>

      {/* Items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {data.items.map((item, idx) => {
          const form = forms[item.id] || { unitPrice: '', currency: 'JOD', offeredQuantity: '', leadTimeDays: '', paymentTerms: '', notes: '' };
          const hasOffer = !!item.existing_offer;
          const isSubmitting = submitting === item.id;
          const isWithdrawing = withdrawing === item.id;

          return (
            <div key={item.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* Item Header */}
              <div style={{ padding: '16px 24px', background: '#f8fafc', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      {t('supplier.rfqItem')} #{idx + 1}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{item.product_name}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                      SKU: {item.sku} &middot; {t('supplier.requestedQty')}: {item.requested_quantity}
                    </div>
                  </div>
                  {hasOffer && (
                    <span className="badge badge-success">{t('supplier.offerOnFile')}</span>
                  )}
                </div>
                {(item.customer_notes || item.rfq_notes) && (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                    {item.customer_notes && <div>{t('supplier.rfqCustomerNotes')}: {item.customer_notes}</div>}
                    {item.rfq_notes && <div>{t('supplier.rfqInternalNotes')}: {item.rfq_notes}</div>}
                  </div>
                )}
              </div>

              {/* Quotation Form */}
              <div style={{ padding: '20px 24px' }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--color-navy, #1a2744)' }}>
                  {hasOffer ? t('supplier.yourQuotation') : t('supplier.prepareQuotation')}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>{t('supplier.unitPrice')} *</label>
                    <input
                      className="input"
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={form.unitPrice}
                      onChange={e => updateForm(item.id, 'unitPrice', e.target.value)}
                      disabled={!canSubmit}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>{t('supplier.currency')} *</label>
                    <select
                      className="input"
                      value={form.currency}
                      onChange={e => updateForm(item.id, 'currency', e.target.value)}
                      disabled={!canSubmit}
                    >
                      {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>{t('supplier.offeredQty')}</label>
                    <input
                      className="input"
                      type="number"
                      min="1"
                      value={form.offeredQuantity}
                      onChange={e => updateForm(item.id, 'offeredQuantity', e.target.value)}
                      disabled={!canSubmit}
                      placeholder={String(item.requested_quantity)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>{t('supplier.leadTimeDays')}</label>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      value={form.leadTimeDays}
                      onChange={e => updateForm(item.id, 'leadTimeDays', e.target.value)}
                      disabled={!canSubmit}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>{t('supplier.paymentTerms')}</label>
                    <input
                      className="input"
                      value={form.paymentTerms}
                      onChange={e => updateForm(item.id, 'paymentTerms', e.target.value)}
                      disabled={!canSubmit}
                      placeholder={t('supplier.paymentTermsPlaceholder')}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>{t('supplier.offerNotes')}</label>
                    <input
                      className="input"
                      value={form.notes}
                      onChange={e => updateForm(item.id, 'notes', e.target.value)}
                      disabled={!canSubmit}
                      placeholder={t('supplier.offerNotesPlaceholder')}
                    />
                  </div>
                </div>

                {/* Actions */}
                {canSubmit && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                    {hasOffer && (
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--color-error, #dc2626)' }}
                        disabled={isWithdrawing}
                        onClick={() => handleWithdraw(item.id)}
                      >
                        {isWithdrawing ? '...' : t('supplier.offerWithdraw')}
                      </button>
                    )}
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={isSubmitting}
                      onClick={() => handleSubmit(item.id)}
                    >
                      {isSubmitting ? '...' : hasOffer ? t('supplier.updateOffer') : t('supplier.submitOffer')}
                    </button>
                  </div>
                )}

                {/* Offer timestamp */}
                {hasOffer && item.existing_offer!.responded_at && (
                  <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
                    {t('supplier.offerSubmittedAt')}: {new Date(item.existing_offer!.responded_at).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
