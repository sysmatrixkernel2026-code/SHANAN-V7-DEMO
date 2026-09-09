import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { LoadingState, EmptyState } from '../../components/LoadingEmptyStates';
import { CheckIcon } from '../../components/icons';

const API_URL = import.meta.env.VITE_API_URL || '';

const STATUS_LABELS: Record<string, { en: string; ar: string }> = {
  pending: { en: 'Pending', ar: 'قيد الانتظار' },
  draft: { en: 'Draft', ar: 'مسودة' },
  submitted: { en: 'Submitted', ar: 'مُرسل' },
  under_review: { en: 'Under Review', ar: 'قيد المراجعة' },
  processing: { en: 'Processing', ar: 'قيد المعالجة' },
  ready_for_commercial_action: { en: 'Ready for Action', ar: 'جاهز للإجراء' },
  reviewing: { en: 'Reviewing', ar: 'قيد المراجعة' },
  quoted: { en: 'Quoted', ar: 'تم التسعير' },
  fulfilled: { en: 'Fulfilled', ar: 'تم التلبية' },
  rejected: { en: 'Rejected', ar: 'مرفوض' },
  closed: { en: 'Closed', ar: 'مُغلق' },
  ready_to_send: { en: 'Ready to Send', ar: 'جاهز للإرسال' },
  sent: { en: 'Sent', ar: 'تم الإرسال' },
  partially_responded: { en: 'Partially Responded', ar: 'تم الرد جزئياً' },
  responded: { en: 'Responded', ar: 'تم الرد' },
  cancelled: { en: 'Cancelled', ar: 'ملغي' },
  approved: { en: 'Approved', ar: 'تمت الموافقة' },
  issued: { en: 'Issued', ar: 'تم الإصدار' },
  confirmed: { en: 'Confirmed', ar: 'تم التأكيد' },
  partially_received: { en: 'Partially Received', ar: 'تم الاستلام جزئياً' },
  received: { en: 'Received', ar: 'تم الاستلام' },
};

const STATUS_CLASSES: Record<string, string> = {
  pending: 'badge-neutral', draft: 'badge-neutral',
  submitted: 'badge-info', under_review: 'badge-warning',
  processing: 'badge-warning', ready_for_commercial_action: 'badge-success',
  reviewing: 'badge-warning', quoted: 'badge-info',
  fulfilled: 'badge-success', rejected: 'badge-error',
  closed: 'badge-success',
  ready_to_send: 'badge-neutral', sent: 'badge-info',
  partially_responded: 'badge-warning', responded: 'badge-success',
  cancelled: 'badge-error',
  approved: 'badge-success', issued: 'badge-info',
  confirmed: 'badge-info', partially_received: 'badge-warning',
  received: 'badge-success',
};

const EDITABLE_STATUSES = ['pending', 'draft'];

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }); }
  catch { return iso; }
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

interface RequestItem {
  id: number;
  product_id: string;
  product_name: string;
  sku: string;
  quantity: number;
  notes: string | null;
}

interface CreditApplication {
  id: string;
  application_number: string;
  status: string;
  requested_credit_limit: string | null;
}

interface RequestDetail {
  id: string;
  reference: string;
  status: string;
  customer_po_number: string | null;
  created_at: string;
  updated_at: string | null;
  requester_name: string;
  company_name: string;
  email: string;
  phone: string;
  country: string;
  city: string;
  message: string | null;
  customer_company_name: string | null;
  credit_application_id?: string | null;
  official_doc_reference?: string | null;
  closed_at?: string | null;
  delivery_date?: string | null;
}

interface ProcurementRfq {
  id: string;
  reference: string;
  status: string;
  sent_at: string | null;
  created_at: string;
  supplier_count: number;
  responded_count: number;
  offer_count: number;
  items_count: number;
}

interface ProcurementDecision {
  id: string;
  reference: string;
  decision_state: string;
  selected_source_type: string | null;
  created_at: string;
}

interface ProcurementPr {
  id: string;
  reference: string;
  status: string;
  created_at: string;
}

interface ProcurementPo {
  id: string;
  reference: string;
  status: string;
  expected_delivery: string | null;
  created_at: string;
}

interface ProcurementStatus {
  supplyRequestStatus: string;
  rfq: ProcurementRfq | null;
  decision: ProcurementDecision | null;
  purchaseRequest: ProcurementPr | null;
  purchaseOrder: ProcurementPo | null;
}

const TIMELINE_STAGES = [
  { key: 'submitted', statusMatch: ['submitted', 'under_review', 'processing', 'ready_for_commercial_action', 'reviewing', 'quoted', 'fulfilled', 'closed'] },
  { key: 'under_review', statusMatch: ['under_review', 'processing', 'ready_for_commercial_action', 'reviewing', 'quoted', 'fulfilled', 'closed'] },
  { key: 'rfq_sent', statusMatch: ['processing', 'ready_for_commercial_action', 'reviewing', 'quoted', 'fulfilled', 'closed'], requiresRfq: true, requiresRfqSent: true },
  { key: 'quotation_received', statusMatch: ['quoted', 'fulfilled', 'closed'], requiresRfq: true, requiresOffers: true },
  { key: 'decision_made', statusMatch: ['fulfilled', 'closed'], requiresDecision: true },
  { key: 'purchase_request', statusMatch: ['fulfilled', 'closed'], requiresPr: true },
  { key: 'purchase_order', statusMatch: ['fulfilled', 'closed'], requiresPo: true },
];

const TIMELINE_KEY_MAP: Record<string, string> = {
  submitted: 'requestSubmitted',
  under_review: 'underReview',
  rfq_sent: 'rfqSent',
  quotation_received: 'quotationReceived',
  decision_made: 'decisionMade',
  purchase_request: 'purchaseRequest',
  purchase_order: 'purchaseOrder',
};

export default function RequestDetails() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLanguage();
  const { token } = useAuth();
  const [request, setRequest] = useState<RequestDetail | null>(null);
  const [items, setItems] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [poNumber, setPoNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [approvedApps, setApprovedApps] = useState<CreditApplication[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string>('');
  const [linkSaving, setLinkSaving] = useState(false);
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [procurementStatus, setProcurementStatus] = useState<ProcurementStatus | null>(null);

  useEffect(() => {
    if (!id || !token) return;
    setLoading(true);
    fetch(`${API_URL}/api/supply-requests/${id}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
      .then(res => {
        if (!res.ok) throw new Error('Not found');
        return res.json();
      })
      .then(data => {
        setRequest(data.request);
        setItems(data.items || []);
        setPoNumber(data.request?.customer_po_number || '');
        setSelectedAppId(data.request?.credit_application_id || '');
        setError(null);
      })
      .catch(() => setError(t('portal.notFound')))
      .finally(() => setLoading(false));
  }, [id, token, t]);

  useEffect(() => {
    if (!request?.id || !token) return;
    fetch(`${API_URL}/api/supply-requests/${request.id}/procurement-status`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setProcurementStatus(data); })
      .catch(() => setProcurementStatus(null));
  }, [request?.id, token]);

  useEffect(() => {
    if (!token || !request) return;
    if (!EDITABLE_STATUSES.includes(request.status)) return;
    fetch(`${API_URL}/api/credit-applications`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
      .then(res => res.ok ? res.json() : { applications: [] })
      .then(data => {
        const apps = (data.applications || []).filter((a: CreditApplication) => a.status === 'approved');
        setApprovedApps(apps);
      })
      .catch(() => setApprovedApps([]));
  }, [token, request?.status]);

  const isEditable = request && EDITABLE_STATUSES.includes(request.status);

  const handleSavePo = async () => {
    if (!request || !token) return;
    setSubmitting(true);
    setActionError(null);
    try {
      const res = await fetch(`${API_URL}/api/supply-requests/${request.reference}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ customerPoNumber: poNumber }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Save failed');
      }
      const data = await res.json();
      setRequest(data.request);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('portal.saveError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveCreditLink = async () => {
    if (!request || !token) return;
    setLinkSaving(true);
    setActionError(null);
    try {
      const res = await fetch(`${API_URL}/api/supply-requests/${request.reference}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ creditApplicationId: selectedAppId || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Save failed');
      }
      const data = await res.json();
      setRequest(data.request);
      setSelectedAppId(data.request?.credit_application_id || '');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('portal.saveError'));
    } finally {
      setLinkSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!request || !token) return;
    setSubmitting(true);
    setActionError(null);
    try {
      const res = await fetch(`${API_URL}/api/supply-requests/${request.reference}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ action: 'submit' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Submit failed');
      }
      const data = await res.json();
      setRequest(data.request);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('portal.submitError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!request || !token) return;
    setPdfDownloading(true);
    setActionError(null);
    try {
      const res = await fetch(`${API_URL}/api/supply-requests/${request.reference}/pdf`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Download failed');
      }
      const contentType = res.headers.get('Content-Type') || '';
      if (!contentType.startsWith('application/pdf')) {
        throw new Error(`Expected application/pdf, got ${contentType}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `SHANAN-${request.reference}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('portal.saveError'));
    } finally {
      setPdfDownloading(false);
    }
  };

  if (loading) return <LoadingState type="detail" />;
  if (error || !request) {
    return (
      <EmptyState
        title={t('portal.notFound')}
        description=""
        action={<Link to="/portal/my-requests" className="btn btn-primary">{t('portal.backToList')}</Link>}
      />
    );
  }

  const statusLabel = STATUS_LABELS[request.status] || { en: request.status, ar: request.status };
  const statusClass = STATUS_CLASSES[request.status] || 'badge-neutral';
  const linkedApp = request.credit_application_id
    ? approvedApps.find(a => a.id === request.credit_application_id)
    : null;

  const ps = procurementStatus;
  const rfqInfo = ps?.rfq || null;
  const sourcingDecision = ps?.decision || null;

  const currentStatus = request.status;
  const isRejected = currentStatus === 'rejected';
  const timelineStages = TIMELINE_STAGES.map(stage => ({
    ...stage,
    completed: !isRejected && stage.statusMatch.includes(currentStatus) &&
      (!stage.requiresRfq || !!rfqInfo) &&
      (!stage.requiresRfqSent || !!rfqInfo?.sent_at) &&
      (!stage.requiresOffers || (rfqInfo?.offer_count ?? 0) > 0) &&
      (!stage.requiresDecision || !!sourcingDecision) &&
      (!stage.requiresPr || !!ps?.purchaseRequest) &&
      (!stage.requiresPo || !!ps?.purchaseOrder),
  }));

  const getSourceTypeLabel = (type: string | null): string => {
    if (!type) return '';
    if (type === 'rfq_offer') return locale === 'ar' ? 'عرض أسعار' : 'RFQ Offer';
    if (type === 'agreement_term') return locale === 'ar' ? 'اتفاقية' : 'Agreement';
    return type;
  };

  return (
    <div className="portal-request-detail">
      <Link to="/portal/my-requests" className="portal-back-link">&larr; {t('portal.backToList')}</Link>

      <div className="portal-detail-header">
        <div>
          <h1 className="portal-detail-ref">{request.reference}</h1>
          <span className="portal-detail-company">{request.customer_company_name}</span>
        </div>
        <span className={`badge ${statusClass} portal-detail-status`}>{statusLabel[locale]}</span>
      </div>

      {/* Procurement Timeline */}
      <div className="procurement-timeline">
        <h2 className="procurement-timeline-title">{t('requestDetail.timeline')}</h2>
        <div className="procurement-timeline-track">
          {timelineStages.map((stage, idx) => (
            <div
              key={stage.key}
              className={`procurement-timeline-step ${stage.completed ? 'procurement-timeline-step-completed' : ''} ${idx === timelineStages.length - 1 ? 'procurement-timeline-step-last' : ''}`}
            >
              <div className="procurement-timeline-dot">
                {stage.completed && <CheckIcon />}
              </div>
              {idx < timelineStages.length - 1 && (
                <div className={`procurement-timeline-line ${stage.completed ? 'procurement-timeline-line-completed' : ''}`} />
              )}
              <span className="procurement-timeline-label">
                {t(`procurement.timeline.${TIMELINE_KEY_MAP[stage.key]}` as import('../../i18n/translations').TranslationKey)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="portal-detail-meta">
        <div className="portal-detail-meta-item">
          <span className="portal-detail-meta-label">{t('portal.date')}</span>
          <span className="portal-detail-meta-value">{formatDateTime(request.created_at)}</span>
        </div>
        {request.delivery_date && (
          <div className="portal-detail-meta-item">
            <span className="portal-detail-meta-label">{t('portal.deliveryDate')}</span>
            <span className="portal-detail-meta-value">{formatDate(request.delivery_date)}</span>
          </div>
        )}
        <div className="portal-detail-meta-item">
          <span className="portal-detail-meta-label">{t('portal.poNumber')}</span>
          {isEditable ? (
            <div className="portal-po-edit">
              <input
                type="text"
                className="form-input"
                value={poNumber}
                onChange={e => setPoNumber(e.target.value)}
                maxLength={100}
                placeholder={t('portal.poPlaceholder')}
              />
              <button className="btn btn-outline btn-sm" onClick={handleSavePo} disabled={submitting}>
                {t('portal.save')}
              </button>
            </div>
          ) : (
            <span className="portal-detail-meta-value">{request.customer_po_number || '—'}</span>
          )}
        </div>
        <div className="portal-detail-meta-item">
          <span className="portal-detail-meta-label">{t('portal.creditApplicationLink')}</span>
          {isEditable ? (
            <div className="portal-po-edit">
              <select className="form-input" value={selectedAppId} onChange={e => setSelectedAppId(e.target.value)}>
                <option value="">{t('portal.noCreditApplication')}</option>
                {approvedApps.map(app => (
                  <option key={app.id} value={app.id}>
                    {app.application_number}{app.requested_credit_limit ? ` — ${app.requested_credit_limit}` : ''}
                  </option>
                ))}
              </select>
              <button className="btn btn-outline btn-sm" onClick={handleSaveCreditLink} disabled={linkSaving}>
                {t('portal.save')}
              </button>
            </div>
          ) : (
            <span className="portal-detail-meta-value">
              {linkedApp ? linkedApp.application_number : (request.credit_application_id ? '—' : '—')}
            </span>
          )}
        </div>
      </div>

      {/* RFQ / Quotation Information */}
      {rfqInfo && (
        <div className="portal-detail-section">
          <h2 className="portal-detail-section-title">{t('quotation.title')}</h2>
          <div className="quotation-info-card">
            <div className="quotation-info-row">
              <span className="quotation-info-label">{t('quotation.status')}</span>
              <span className={`badge ${STATUS_CLASSES[rfqInfo.status] || 'badge-neutral'}`}>
                {STATUS_LABELS[rfqInfo.status]?.[locale] || rfqInfo.status}
              </span>
            </div>
            {rfqInfo.supplier_count > 0 && (
              <div className="quotation-info-row">
                <span className="quotation-info-label">{t('quotation.supplier')}</span>
                <span className="quotation-info-value">
                  {rfqInfo.supplier_count} {locale === 'ar' ? 'مورد' : 'suppliers'}
                  {rfqInfo.offer_count > 0 && ` — ${rfqInfo.offer_count} ${locale === 'ar' ? 'عرض' : 'offers'}`}
                </span>
              </div>
            )}
            {rfqInfo.sent_at && (
              <div className="quotation-info-row">
                <span className="quotation-info-label">{locale === 'ar' ? 'تاريخ الإرسال' : 'Sent Date'}</span>
                <span className="quotation-info-value">{formatDate(rfqInfo.sent_at)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sourcing Decision */}
      {sourcingDecision && (
        <div className="portal-detail-section">
          <h2 className="portal-detail-section-title">{locale === 'ar' ? 'قرار التوريد' : 'Sourcing Decision'}</h2>
          <div className="quotation-info-card">
            <div className="quotation-info-row">
              <span className="quotation-info-label">{t('quotation.status')}</span>
              <span className={`badge ${sourcingDecision.decision_state === 'selected' ? 'badge-success' : 'badge-warning'}`}>
                {sourcingDecision.decision_state === 'selected'
                  ? (locale === 'ar' ? 'تم التحديد' : 'Selected')
                  : (STATUS_LABELS[sourcingDecision.decision_state]?.[locale] || sourcingDecision.decision_state)}
              </span>
            </div>
            {sourcingDecision.selected_source_type && (
              <div className="quotation-info-row">
                <span className="quotation-info-label">{locale === 'ar' ? 'نوع المصدر' : 'Source Type'}</span>
                <span className="quotation-info-value">{getSourceTypeLabel(sourcingDecision.selected_source_type)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Purchase Request Information */}
      {ps?.purchaseRequest && (
        <div className="portal-detail-section">
          <h2 className="portal-detail-section-title">{locale === 'ar' ? 'طلب الشراء' : 'Purchase Request'}</h2>
          <div className="quotation-info-card">
            <div className="quotation-info-row">
              <span className="quotation-info-label">{locale === 'ar' ? 'المرجع' : 'Reference'}</span>
              <span className="quotation-info-value">{ps.purchaseRequest.reference}</span>
            </div>
            <div className="quotation-info-row">
              <span className="quotation-info-label">{t('quotation.status')}</span>
              <span className={`badge ${STATUS_CLASSES[ps.purchaseRequest.status] || 'badge-neutral'}`}>
                {STATUS_LABELS[ps.purchaseRequest.status]?.[locale] || ps.purchaseRequest.status}
              </span>
            </div>
            <div className="quotation-info-row">
              <span className="quotation-info-label">{locale === 'ar' ? 'تاريخ الإنشاء' : 'Created'}</span>
              <span className="quotation-info-value">{formatDate(ps.purchaseRequest.created_at)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Purchase Order Information */}
      {ps?.purchaseOrder && (
        <div className="portal-detail-section">
          <h2 className="portal-detail-section-title">{locale === 'ar' ? 'أمر الشراء' : 'Purchase Order'}</h2>
          <div className="quotation-info-card">
            <div className="quotation-info-row">
              <span className="quotation-info-label">{locale === 'ar' ? 'المرجع' : 'Reference'}</span>
              <span className="quotation-info-value">{ps.purchaseOrder.reference}</span>
            </div>
            <div className="quotation-info-row">
              <span className="quotation-info-label">{t('quotation.status')}</span>
              <span className={`badge ${STATUS_CLASSES[ps.purchaseOrder.status] || 'badge-neutral'}`}>
                {STATUS_LABELS[ps.purchaseOrder.status]?.[locale] || ps.purchaseOrder.status}
              </span>
            </div>
            {ps.purchaseOrder.expected_delivery && (
              <div className="quotation-info-row">
                <span className="quotation-info-label">{locale === 'ar' ? 'التسليم المتوقع' : 'Expected Delivery'}</span>
                <span className="quotation-info-value">{formatDate(ps.purchaseOrder.expected_delivery)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {request.message && (
        <div className="portal-detail-section">
          <h2 className="portal-detail-section-title">{t('portal.message')}</h2>
          <p className="portal-detail-message">{request.message}</p>
        </div>
      )}

      <div className="portal-detail-section">
        <h2 className="portal-detail-section-title">{t('portal.items')} ({items.length})</h2>
        {items.length > 0 ? (
          <div className="portal-items-table-wrap">
            <table className="portal-items-table">
              <thead>
                <tr>
                  <th>{t('portal.product')}</th>
                  <th>{t('portal.sku')}</th>
                  <th className="num">{t('portal.qty')}</th>
                  <th>{t('portal.notes')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id}>
                    <td>{item.product_name}</td>
                    <td className="mono">{item.sku}</td>
                    <td className="num">{item.quantity}</td>
                    <td>{item.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="portal-no-items">{t('portal.noItems')}</p>
        )}
      </div>

      {actionError && <div className="portal-error-banner">{actionError}</div>}

      {isEditable && items.length > 0 && (
        <div className="portal-detail-actions">
          <button className="btn btn-primary btn-lg" onClick={handleSubmit} disabled={submitting}>
            {submitting ? t('portal.submitting') : t('portal.submit')}
          </button>
        </div>
      )}

      <div className="portal-detail-actions">
        <button className="btn btn-outline" onClick={handleDownloadPdf} disabled={pdfDownloading}>
          {pdfDownloading ? t('portal.downloading') : t('portal.downloadPdf')}
        </button>
      </div>

      {request.official_doc_reference && (
        <div className="portal-detail-section">
          <h2 className="portal-detail-section-title">{t('portal.officialRef')}</h2>
          <p className="portal-detail-meta-value" style={{ fontFamily: 'monospace', fontSize: '16px' }}>
            {request.official_doc_reference}
          </p>
          {request.closed_at && (
            <p className="portal-detail-meta-value" style={{ marginTop: '8px' }}>
              {t('portal.closedOn')}: {formatDate(request.closed_at)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
