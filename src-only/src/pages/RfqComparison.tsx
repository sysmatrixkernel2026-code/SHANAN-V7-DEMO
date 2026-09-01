import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { LoadingState, EmptyState } from '../components/LoadingEmptyStates';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface SupplierOffer {
  supplier_id: string;
  supplier_name: string;
  supplier_reference: string | null;
  response_state: string;
  offer_status: string;
  quoted_unit_price: number | null;
  currency: string | null;
  offered_quantity: number | null;
  lead_time_days: number | null;
  payment_terms: string | null;
  commercial_notes: string | null;
  offer_id: string | null;
}

interface ComparisonItem {
  rfq_item_id: string;
  product_id: string;
  product_name: string;
  sku: string;
  requested_quantity: number;
  offers: SupplierOffer[];
}

interface ComparisonData {
  rfq: { id: string; reference: string; status: string };
  items: ComparisonItem[];
  suppliers: Array<{ id: string; supplier_id: string; supplier_name: string; supplier_reference: string; response_state: string }>;
  evaluated_at: string;
}

const OFFER_STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  quoted: 'Quoted',
  declined: 'Declined',
  unavailable: 'Unavailable',
};

const OFFER_STATUS_BADGE: Record<string, string> = {
  pending: 'badge-warning',
  quoted: 'badge-success',
  declined: 'badge-error',
  unavailable: 'badge-error',
};

function formatCurrency(amount: number | null, currency: string | null): string {
  if (amount == null) return '—';
  return `${amount.toFixed(2)} ${currency || ''}`;
}

export default function RfqComparison() {
  const { id } = useParams<{ id: string }>();
  const { t } = useLanguage();
  const { token } = useAuth();
  const [data, setData] = useState<ComparisonData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectingWinner, setSelectingWinner] = useState<string | null>(null);
  const [winnerMessage, setWinnerMessage] = useState<string | null>(null);

  const loadComparison = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/rfqs/${encodeURIComponent(id)}/comparison`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json() as ComparisonData;
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('compare.loadError'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [id, token, t]);

  useEffect(() => { loadComparison(); }, [loadComparison]);

  const selectWinner = useCallback(async (rfqItemId: string, offerId: string, sourceType: 'rfq_offer' | 'agreement_term') => {
    if (!data) return;
    setSelectingWinner(offerId);
    setWinnerMessage(null);
    try {
      const res = await fetch(`${API_URL}/api/supply-requests/${data.rfq.id.split('').slice(0, 0).join('') || 'x'}/sourcing-decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          decisionState: 'selected',
          selectedSourceType: sourceType,
          selectedSourceId: offerId,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }
      setWinnerMessage(t('compare.winnerSelected'));
    } catch (e) {
      setWinnerMessage(e instanceof Error ? e.message : t('compare.winnerError'));
    } finally {
      setSelectingWinner(null);
    }
  }, [data, token, t]);

  // We need the supply_request_id to post the decision. Get it from the comparison data.
  // The comparison endpoint only returns rfq id, not supply_request_id.
  // We need to fetch the RFQ detail first to get supply_request_id.
  const [supplyRequestId, setSupplyRequestId] = useState<string | null>(null);
  useEffect(() => {
    if (!id || !token) return;
    fetch(`${API_URL}/api/rfqs/${encodeURIComponent(id)}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.rfq?.supply_request_id) setSupplyRequestId(d.rfq.supply_request_id); })
      .catch(() => {});
  }, [id, token]);

  const handleSelectWinner = useCallback(async (rfqItemId: string, offerId: string) => {
    if (!supplyRequestId) return;
    setSelectingWinner(offerId);
    setWinnerMessage(null);
    try {
      const res = await fetch(`${API_URL}/api/supply-requests/${encodeURIComponent(supplyRequestId)}/sourcing-decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          decisionState: 'selected',
          selectedSourceType: 'rfq_offer',
          selectedSourceId: offerId,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }
      setWinnerMessage(t('compare.winnerSelected'));
    } catch (e) {
      setWinnerMessage(e instanceof Error ? e.message : t('compare.winnerError'));
    } finally {
      setSelectingWinner(null);
    }
  }, [supplyRequestId, token, t]);

  if (loading) return <div className="container" style={{ padding: '40px 0' }}><LoadingState type="card" count={2} /></div>;
  if (error) return (
    <div className="container" style={{ padding: '40px 0' }}>
      <div className="admin-error-state" role="alert">
        <div><p className="admin-error-title">{t('compare.loadError')}</p><p className="admin-error-detail">{error}</p></div>
      </div>
      <Link to={id ? `/admin/rfqs/${id}` : '/admin/rfqs'} className="btn btn-ghost btn-sm" style={{ marginTop: 12 }}>{t('compare.backToRfq')}</Link>
    </div>
  );
  if (!data || data.items.length === 0) return (
    <div className="container" style={{ padding: '40px 0' }}>
      <EmptyState title={t('compare.empty')} icon={<span style={{ fontSize: 32 }}>📊</span>} />
      <Link to={id ? `/admin/rfqs/${id}` : '/admin/rfqs'} className="btn btn-ghost btn-sm" style={{ marginTop: 12 }}>{t('compare.backToRfq')}</Link>
    </div>
  );

  // Get all unique suppliers across items
  const allSupplierIds = [...new Set(data.items.flatMap(item => item.offers.map(o => o.supplier_id)))];
  const supplierMap = new Map<string, SupplierOffer>();
  for (const item of data.items) {
    for (const offer of item.offers) {
      if (!supplierMap.has(offer.supplier_id)) supplierMap.set(offer.supplier_id, offer);
    }
  }

  return (
    <div className="container" style={{ padding: '40px 0 64px' }}>
      <div className="page-header" style={{ marginBottom: 32 }}>
        <span className="admin-eyebrow">
          <span className="admin-eyebrow-dot" />
          {t('compare.eyebrow')}
        </span>
        <h1 className="page-title">{t('compare.title')}</h1>
        <p className="page-subtitle">{t('compare.subtitle')}</p>
        <div style={{ marginTop: 12 }}>
          <Link to={`/admin/rfqs/${id}`} className="btn btn-ghost btn-sm">{t('compare.backToRfq')}</Link>
        </div>
      </div>

      {winnerMessage && (
        <div className="admin-success-state" style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 8, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46' }}>
          {winnerMessage}
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <span className="badge badge-info">{data.rfq.reference}</span>
        <span style={{ marginInlineStart: 8, color: 'var(--text-secondary)' }}>{data.items.length} items · {allSupplierIds.length} suppliers</span>
      </div>

      {/* Comparison table */}
      <div style={{ overflowX: 'auto' }}>
        <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'start', padding: '8px 12px', borderBottom: '2px solid var(--border-primary)' }}>{t('compare.colProduct')}</th>
              <th style={{ textAlign: 'start', padding: '8px 12px', borderBottom: '2px solid var(--border-primary)' }}>{t('compare.colSku')}</th>
              <th style={{ textAlign: 'end', padding: '8px 12px', borderBottom: '2px solid var(--border-primary)' }}>{t('compare.colQty')}</th>
              {allSupplierIds.map(sId => {
                const sup = supplierMap.get(sId);
                return (
                  <th key={sId} style={{ textAlign: 'center', padding: '8px 12px', borderBottom: '2px solid var(--border-primary)', minWidth: 160 }}>
                    <div style={{ fontWeight: 600 }}>{sup?.supplier_name || sId}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{sup?.supplier_reference || ''}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {data.items.map(item => (
              <tr key={item.rfq_item_id}>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-primary)' }}>
                  <div style={{ fontWeight: 500 }}>{item.product_name}</div>
                </td>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-primary)', fontFamily: 'monospace', fontSize: 13 }}>{item.sku}</td>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-primary)', textAlign: 'end' }}>{item.requested_quantity}</td>
                {allSupplierIds.map(sId => {
                  const offer = item.offers.find(o => o.supplier_id === sId);
                  if (!offer) {
                    return <td key={sId} style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-primary)', textAlign: 'center', color: 'var(--text-secondary)' }}>—</td>;
                  }
                  return (
                    <td key={sId} style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-primary)', textAlign: 'center' }}>
                      <span className={`badge ${OFFER_STATUS_BADGE[offer.offer_status] || 'badge-warning'}`} style={{ marginBottom: 4 }}>
                        {OFFER_STATUS_LABEL[offer.offer_status] || offer.offer_status}
                      </span>
                      {offer.offer_status === 'quoted' && (
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{formatCurrency(offer.quoted_unit_price, offer.currency)}</div>
                          {offer.lead_time_days != null && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{offer.lead_time_days}d lead</div>}
                          {offer.payment_terms && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{offer.payment_terms}</div>}
                          {offer.offer_id && (
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              style={{ marginTop: 4, fontSize: 12 }}
                              disabled={selectingWinner === offer.offer_id}
                              onClick={() => handleSelectWinner(item.rfq_item_id, offer.offer_id!)}
                            >
                              {selectingWinner === offer.offer_id ? '...' : t('compare.selectWinner')}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
