import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { LoadingState, EmptyState } from '../components/LoadingEmptyStates';

// ============================================================
// SourcingEvaluation — Internal SHANAN staff page.
// Route: /admin/supply-requests/:id/sourcing  (ProtectedRoute requireInternal)
//
// Shows the runtime-derived sourcing evaluation (from A9 + A10 data)
// for a single supply request, plus the latest decision (if any),
// and lets the internal user record a new decision.
//
// Internal-only — never exposed to customers.
// ============================================================

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface SourcingOptionFlag {
  type: 'blocking' | 'warning' | 'info';
  code: string;
  message: string;
}

interface SourcingOption {
  source_type: 'agreement_term' | 'rfq_offer';
  source_id: string;
  rfq_item_id: string | null;
  supplier_id: string;
  supplier_reference: string | null;
  supplier_name_en: string | null;
  supplier_status: string | null;
  agreement_number: string | null;
  agreement_status: string | null;
  agreement_effective_from: string | null;
  agreement_effective_to: string | null;
  agreement_currency: string | null;
  agreement_payment_terms_days: number | null;
  agreement_supplier_credit_limit: string | null;
  rfq_reference: string | null;
  rfq_status: string | null;
  product_id: string;
  canonical_product_sku: string | null;
  canonical_product_name_en: string | null;
  unit_price: number | null;
  currency: string | null;
  minimum_order_quantity: number | null;
  price_valid_from: string | null;
  price_valid_to: string | null;
  availability_status: string | null;
  available_quantity: number | null;
  expected_available_date: string | null;
  lead_time_days: number | null;
  payment_terms: string | null;
  offer_status: string | null;
  eligibility: 'ELIGIBLE' | 'ELIGIBLE_WITH_WARNINGS' | 'NOT_ELIGIBLE' | 'INSUFFICIENT_DATA';
  flags: SourcingOptionFlag[];
  data_completeness: 'complete' | 'partial' | 'missing_critical';
  recommendation: 'recommended' | 'alternative' | 'requires_review' | 'not_eligible' | 'insufficient_data';
}

interface ItemEvaluation {
  request_item_id: number;
  product_id: string;
  product_name: string;
  sku: string;
  requested_quantity: number;
  options: SourcingOption[];
  recommendation_summary: {
    recommended_option_id: string | null;
    recommendation_tag: 'recommended' | 'alternative' | 'requires_review' | 'not_eligible' | 'insufficient_data';
    note: string;
  };
}

interface SourcingEvaluation {
  supply_request_id: string;
  supply_request_reference: string | null;
  supply_request_status: string | null;
  customer_company_id: string | null;
  customer_company_name: string | null;
  customer_po_number: string | null;
  items: ItemEvaluation[];
  evaluated_at: string;
  has_eligible_options: boolean;
  has_any_options: boolean;
  currencies_present: string[];
}

interface Decision {
  id: string;
  reference: string;
  supply_request_id: string;
  decision_state: 'not_decided' | 'recommended_for_review' | 'selected' | 'needs_more_sourcing' | 'rejected';
  selected_source_type: 'agreement_term' | 'rfq_offer' | null;
  selected_agreement_term_id: string | null;
  selected_rfq_offer_id: string | null;
  snapshot_supplier_id: string | null;
  snapshot_product_id: string | null;
  snapshot_unit_price: number | null;
  snapshot_currency: string | null;
  snapshot_lead_time_days: number | null;
  decision_notes: string | null;
  decided_by: string | null;
  decided_by_name: string | null;
  decided_at: string;
}

interface EvaluationResponse {
  evaluation: SourcingEvaluation;
  latestDecision: Decision | null;
}

const ELIGIBILITY_BADGE: Record<string, string> = {
  ELIGIBLE: 'badge-success',
  ELIGIBLE_WITH_WARNINGS: 'badge-warning',
  NOT_ELIGIBLE: 'badge-error',
  INSUFFICIENT_DATA: 'badge-neutral',
};

const ELIGIBILITY_LABEL_KEYS: Record<string, 'sourcing.eligible' | 'sourcing.eligibleWithWarnings' | 'sourcing.notEligible' | 'sourcing.insufficientData'> = {
  ELIGIBLE: 'sourcing.eligible',
  ELIGIBLE_WITH_WARNINGS: 'sourcing.eligibleWithWarnings',
  NOT_ELIGIBLE: 'sourcing.notEligible',
  INSUFFICIENT_DATA: 'sourcing.insufficientData',
};

const RECOMMENDATION_BADGE: Record<string, string> = {
  recommended: 'badge-success',
  alternative: 'badge-info',
  requires_review: 'badge-warning',
  not_eligible: 'badge-error',
  insufficient_data: 'badge-neutral',
};

const RECOMMENDATION_LABEL_KEYS: Record<string, 'sourcing.recommended' | 'sourcing.alternative' | 'sourcing.requiresReview' | 'sourcing.notEligible' | 'sourcing.insufficientData'> = {
  recommended: 'sourcing.recommended',
  alternative: 'sourcing.alternative',
  requires_review: 'sourcing.requiresReview',
  not_eligible: 'sourcing.notEligible',
  insufficient_data: 'sourcing.insufficientData',
};

const DECISION_STATE_LABEL_KEYS: Record<string, 'sourcing.stateNotDecided' | 'sourcing.stateRecommendedForReview' | 'sourcing.stateSelected' | 'sourcing.stateNeedsMoreSourcing' | 'sourcing.stateRejected'> = {
  not_decided: 'sourcing.stateNotDecided',
  recommended_for_review: 'sourcing.stateRecommendedForReview',
  selected: 'sourcing.stateSelected',
  needs_more_sourcing: 'sourcing.stateNeedsMoreSourcing',
  rejected: 'sourcing.stateRejected',
};

function formatDateTime(iso: string): string {
  try { return new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
}

export default function SourcingEvaluation() {
  const { id } = useParams<{ id: string }>();
  const { t } = useLanguage();
  const { token } = useAuth();

  const [data, setData] = useState<EvaluationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Decision form state
  const [decisionState, setDecisionState] = useState<'not_decided' | 'recommended_for_review' | 'selected' | 'needs_more_sourcing' | 'rejected'>('not_decided');
  const [selectedOptionKey, setSelectedOptionKey] = useState<string>(''); // `${source_type}:${source_id}:${request_item_id}`
  const [decisionNotes, setDecisionNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!id || !token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/supply-requests/${encodeURIComponent(id)}/sourcing-evaluation`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.status === 401) { setError(t('common.errAuth')); setData(null); return; }
      if (res.status === 403) { setError(t('common.errInternal')); setData(null); return; }
      if (res.status === 404) { setError(t('sourcing.errNotFound')); setData(null); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('sourcing.errLoad'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => { loadData(); }, [loadData]);

  // Build a flat list of selectable options (only ELIGIBLE or ELIGIBLE_WITH_WARNINGS)
  const selectableOptions: { option: SourcingOption; request_item_id: number; key: string }[] = [];
  if (data?.evaluation) {
    for (const item of data.evaluation.items) {
      for (const opt of item.options) {
        if (opt.eligibility === 'ELIGIBLE' || opt.eligibility === 'ELIGIBLE_WITH_WARNINGS') {
          const key = `${opt.source_type}:${opt.source_id}:${item.request_item_id}`;
          selectableOptions.push({ option: opt, request_item_id: item.request_item_id, key });
        }
      }
    }
  }

  const handleRecordDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data || !token || !id) return;
    setSaving(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const body: Record<string, unknown> = {
        decisionState,
        decisionNotes: decisionNotes.trim() || null,
      };
      if (decisionState === 'selected') {
        if (!selectedOptionKey) {
          setActionError(t('sourcing.errSelectOption'));
          setSaving(false);
          return;
        }
        const [sourceType, sourceId] = selectedOptionKey.split(':');
        body.selectedSourceType = sourceType;
        body.selectedSourceId = sourceId;
      }
      const res = await fetch(`${API_URL}/api/supply-requests/${encodeURIComponent(id)}/sourcing-decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      setActionSuccess(t('sourcing.decisionRecorded'));
      setDecisionNotes('');
      setSelectedOptionKey('');
      setDecisionState('not_decided');
      await loadData();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t('sourcing.decisionError'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState type="detail" />;
  if (error || !data) {
    return (
      <EmptyState
        title={error || 'Not found'}
        description=""
        action={<Link to="/admin/supply-requests" className="btn btn-primary">{t('admin.title')}</Link>}
      />
    );
  }

  const ev = data.evaluation;
  const dec = data.latestDecision;

  return (
    <div className="container" style={{ padding: '40px 0 64px' }}>
      <Link to="/admin/supply-requests" className="portal-back-link">← {t('admin.title')}</Link>
      <Link to={`/admin/rfqs?supplyRequestId=${ev.supply_request_id}`} className="portal-back-link" style={{ marginInlineStart: 12 }}>{t('rfq.title')}</Link>

      <div className="page-header" style={{ marginBottom: 32 }}>
        <span className="admin-eyebrow">
          <span className="admin-eyebrow-dot" />
          {t('sourcing.eyebrow')}
        </span>
        <h1 className="page-title">{t('sourcing.title')}</h1>
        <p className="page-subtitle">{t('sourcing.subtitle')}</p>
        <div style={{ marginTop: 8, fontSize: 13, color: '#6b7280' }}>
          {t('admin.title')}: <strong>{ev.supply_request_reference || ev.supply_request_id}</strong>
          {ev.customer_company_name && <> · {ev.customer_company_name}</>}
          {ev.customer_po_number && <> · PO: {ev.customer_po_number}</>}
          <br />
          {t('sourcing.evaluatedAt')}: {formatDateTime(ev.evaluated_at)}
        </div>
      </div>

      {actionError && <div className="portal-error-banner" style={{ marginBottom: 16 }}>{actionError}</div>}
      {actionSuccess && <div className="portal-detail-section" style={{ marginBottom: 16, padding: 12, border: '1px solid #10b981', borderRadius: 6, background: '#ecfdf5', color: '#065f46' }}>{actionSuccess}</div>}

      {/* Current decision summary */}
      <section className="admin-detail-panel" style={{ marginBottom: 24 }}>
        <article className="admin-detail-card">
          <header className="admin-detail-header">
            <div>
              <h2 className="admin-detail-title">{t('sourcing.currentDecision')}</h2>
            </div>
            {dec && (
              <span className={`badge ${dec.decision_state === 'selected' ? 'badge-success' : dec.decision_state === 'rejected' ? 'badge-error' : 'badge-info'}`}>
                {t(DECISION_STATE_LABEL_KEYS[dec.decision_state] || 'sourcing.stateNotDecided')}
              </span>
            )}
          </header>
          {!dec ? (
            <p className="portal-no-items">{t('sourcing.noDecisionYet')}</p>
          ) : (
            <div>
              <div className="admin-detail-grid">
                <div>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{t('sourcing.decisionState')}</span>
                  <div style={{ marginTop: 4 }}>{t(DECISION_STATE_LABEL_KEYS[dec.decision_state] || 'sourcing.stateNotDecided')}</div>
                </div>
                <div>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{t('rfq.colRef')}</span>
                  <div style={{ marginTop: 4, fontFamily: 'monospace' }}>{dec.reference}</div>
                </div>
                <div>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{t('sourcing.decidedBy')}</span>
                  <div style={{ marginTop: 4 }}>{dec.decided_by_name || '—'}</div>
                </div>
                <div>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{t('sourcing.decidedAt')}</span>
                  <div style={{ marginTop: 4 }}>{formatDateTime(dec.decided_at)}</div>
                </div>
              </div>
              {dec.decision_state === 'selected' && (
                <div style={{ marginTop: 16 }}>
                  <h3 style={{ fontSize: 14, margin: 0 }}>{t('sourcing.snapshotTitle')}</h3>
                  <div className="admin-detail-grid" style={{ marginTop: 8 }}>
                    <div><span style={{ fontSize: 12, color: '#6b7280' }}>{t('sourcing.colPrice')}</span><div style={{ marginTop: 4 }}>{dec.snapshot_unit_price != null ? dec.snapshot_unit_price : '—'} {dec.snapshot_currency || ''}</div></div>
                    <div><span style={{ fontSize: 12, color: '#6b7280' }}>{t('sourcing.colLeadTime')}</span><div style={{ marginTop: 4 }}>{dec.snapshot_lead_time_days != null ? `${dec.snapshot_lead_time_days}d` : '—'}</div></div>
                    <div><span style={{ fontSize: 12, color: '#6b7280' }}>{t('sourcing.product')}</span><div style={{ marginTop: 4, fontFamily: 'monospace' }}>{dec.snapshot_product_id || '—'}</div></div>
                    <div><span style={{ fontSize: 12, color: '#6b7280' }}>{t('sourcing.colSupplier')}</span><div style={{ marginTop: 4, fontFamily: 'monospace' }}>{dec.snapshot_supplier_id || '—'}</div></div>
                  </div>
                </div>
              )}
              {dec.decision_notes && (
                <div style={{ marginTop: 16 }}>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{t('sourcing.decisionNotes')}</span>
                  <p style={{ marginTop: 4, marginBottom: 0 }}>{dec.decision_notes}</p>
                </div>
              )}
            </div>
          )}
        </article>
      </section>

      {/* Evaluation per item */}
      {ev.items.length === 0 ? (
        <p className="portal-no-items">{t('sourcing.noItems')}</p>
      ) : (
        ev.items.map((item) => (
          <section key={item.request_item_id} className="admin-detail-panel" style={{ marginBottom: 24 }}>
            <article className="admin-detail-card">
              <header className="admin-detail-header">
                <div>
                  <h2 className="admin-detail-title">{item.product_name}</h2>
                  <p className="admin-detail-reference">{item.sku} · {t('sourcing.requestedQty')}: {item.requested_quantity}</p>
                </div>
                <span className="badge badge-info">{item.options.length} {t('sourcing.optionsCount')}</span>
              </header>

              {/* Recommendation summary */}
              <div style={{ marginBottom: 16, padding: 12, background: '#f8f9fa', borderRadius: 6 }}>
                <strong>{t('sourcing.recommendationTitle')}:</strong>{' '}
                <span className={`badge ${RECOMMENDATION_BADGE[item.recommendation_summary.recommendation_tag] || 'badge-neutral'}`}>
                  {t(RECOMMENDATION_LABEL_KEYS[item.recommendation_summary.recommendation_tag] || 'sourcing.requiresReview')}
                </span>
                <div style={{ marginTop: 8, fontSize: 13, color: '#374151' }}>
                  <strong>{t('sourcing.recommendationNote')}:</strong> {item.recommendation_summary.note}
                </div>
              </div>

              {/* Options table */}
              {item.options.length === 0 ? (
                <p className="portal-no-items">{t('sourcing.noOptions')}</p>
              ) : (
                <div className="portal-items-table-wrap">
                  <table className="portal-items-table">
                    <thead>
                      <tr>
                        <th>{t('sourcing.colSource')}</th>
                        <th>{t('sourcing.colSupplier')}</th>
                        <th className="num">{t('sourcing.colPrice')}</th>
                        <th>{t('sourcing.colCurrency')}</th>
                        <th>{t('sourcing.colAvailability')}</th>
                        <th className="num">{t('sourcing.colLeadTime')}</th>
                        <th className="num">{t('sourcing.colMOQ')}</th>
                        <th>{t('sourcing.colEligibility')}</th>
                        <th>{t('sourcing.colRecommendation')}</th>
                        <th>{t('sourcing.colFlags')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.options.map((opt) => (
                        <tr key={`${opt.source_type}:${opt.source_id}`} style={{ opacity: opt.eligibility === 'NOT_ELIGIBLE' ? 0.6 : 1 }}>
                          <td>
                            {opt.source_type === 'agreement_term' ? t('sourcing.sourceAgreementTerm') : t('sourcing.sourceRfqOffer')}
                            {opt.agreement_number && <div style={{ fontSize: 11, color: '#6b7280' }}>{opt.agreement_number}</div>}
                            {opt.rfq_reference && <div style={{ fontSize: 11, color: '#6b7280' }}>{opt.rfq_reference}</div>}
                          </td>
                          <td>{opt.supplier_name_en || opt.supplier_reference || '—'}</td>
                          <td className="num">{opt.unit_price != null ? opt.unit_price : '—'}</td>
                          <td>{opt.currency || '—'}</td>
                          <td>
                            {opt.availability_status || '—'}
                            {opt.available_quantity != null && <div style={{ fontSize: 11 }}>{opt.available_quantity}</div>}
                          </td>
                          <td className="num">{opt.lead_time_days != null ? `${opt.lead_time_days}d` : '—'}</td>
                          <td className="num">{opt.minimum_order_quantity != null ? opt.minimum_order_quantity : '—'}</td>
                          <td>
                            <span className={`badge ${ELIGIBILITY_BADGE[opt.eligibility] || 'badge-neutral'}`}>
                              {t(ELIGIBILITY_LABEL_KEYS[opt.eligibility] || 'sourcing.requiresReview')}
                            </span>
                            <div style={{ fontSize: 11, marginTop: 2, color: '#6b7280' }}>
                              {opt.data_completeness === 'complete' ? t('sourcing.dataComplete') :
                                opt.data_completeness === 'partial' ? t('sourcing.dataPartial') :
                                t('sourcing.dataMissingCritical')}
                            </div>
                          </td>
                          <td>
                            <span className={`badge ${RECOMMENDATION_BADGE[opt.recommendation] || 'badge-neutral'}`}>
                              {t(RECOMMENDATION_LABEL_KEYS[opt.recommendation] || 'sourcing.requiresReview')}
                            </span>
                          </td>
                          <td>
                            {opt.flags.length === 0 ? (
                              <span style={{ color: '#9ca3af' }}>—</span>
                            ) : (
                              <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 11 }}>
                                {opt.flags.map((f, i) => (
                                  <li key={i} style={{
                                    color: f.type === 'blocking' ? '#dc2626' : f.type === 'warning' ? '#d97706' : '#6b7280',
                                    marginBottom: 2,
                                  }}>
                                    <strong>{f.type === 'blocking' ? '⛔' : f.type === 'warning' ? '⚠' : 'ℹ'} {f.code}</strong>: {f.message}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </section>
        ))
      )}

      {/* Record new decision form */}
      <section className="admin-detail-panel">
        <article className="admin-detail-card">
          <header className="admin-detail-header">
            <div>
              <h2 className="admin-detail-title">{t('sourcing.recordDecision')}</h2>
              <p className="admin-detail-reference">{t('sourcing.subtitle')}</p>
            </div>
          </header>
          <form onSubmit={handleRecordDecision} style={{ padding: 16 }}>
            <label style={{ display: 'block', marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: '#6b7280' }}>{t('sourcing.decisionState')}</span>
              <select
                className="form-input"
                value={decisionState}
                onChange={e => setDecisionState(e.target.value as any)}
                style={{ marginTop: 4 }}
              >
                <option value="not_decided">{t('sourcing.stateNotDecided')}</option>
                <option value="recommended_for_review">{t('sourcing.stateRecommendedForReview')}</option>
                <option value="selected">{t('sourcing.stateSelected')}</option>
                <option value="needs_more_sourcing">{t('sourcing.stateNeedsMoreSourcing')}</option>
                <option value="rejected">{t('sourcing.stateRejected')}</option>
              </select>
            </label>

            {decisionState === 'selected' && (
              <label style={{ display: 'block', marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: '#6b7280' }}>{t('sourcing.selectOption')}</span>
                <select
                  className="form-input"
                  value={selectedOptionKey}
                  onChange={e => setSelectedOptionKey(e.target.value)}
                  style={{ marginTop: 4 }}
                  required
                >
                  <option value="">—</option>
                  {selectableOptions.map(({ option, request_item_id, key }) => (
                    <option key={key} value={key}>
                      [{request_item_id}] {option.source_type === 'agreement_term' ? t('sourcing.sourceAgreementTerm') : t('sourcing.sourceRfqOffer')} — {option.supplier_name_en || option.supplier_reference} — {option.unit_price} {option.currency || ''}
                    </option>
                  ))}
                </select>
                {selectableOptions.length === 0 && (
                  <div style={{ marginTop: 4, fontSize: 12, color: '#dc2626' }}>
                    {t('sourcing.errNoEligible')}
                  </div>
                )}
              </label>
            )}

            <label style={{ display: 'block', marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: '#6b7280' }}>{t('sourcing.decisionNotes')}</span>
              <textarea
                className="form-input"
                rows={3}
                value={decisionNotes}
                onChange={e => setDecisionNotes(e.target.value)}
                style={{ marginTop: 4 }}
              />
            </label>

            {actionError && <div className="portal-error-banner" style={{ marginBottom: 12 }}>{actionError}</div>}

            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={saving || (decisionState === 'selected' && !selectedOptionKey)}
            >
              {saving ? t('sourcing.refresh') : t('sourcing.confirmDecision')}
            </button>
          </form>
        </article>
      </section>
    </div>
  );
}
