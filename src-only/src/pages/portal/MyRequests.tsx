import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { LoadingState, EmptyState } from '../../components/LoadingEmptyStates';
import { ClipboardIcon } from '../../components/icons';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface PortalRequest {
  id: string;
  reference: string;
  status: string;
  customer_po_number: string | null;
  created_at: string;
  updated_at: string | null;
  requester_name: string;
  item_count: number;
}

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
};

const STATUS_CLASSES: Record<string, string> = {
  pending: 'badge-neutral',
  draft: 'badge-neutral',
  submitted: 'badge-info',
  under_review: 'badge-warning',
  processing: 'badge-warning',
  ready_for_commercial_action: 'badge-success',
  reviewing: 'badge-warning',
  quoted: 'badge-info',
  fulfilled: 'badge-success',
  rejected: 'badge-error',
  closed: 'badge-success',
};

function formatRelativeDate(iso: string, locale: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const intlLocale = locale === 'ar' ? 'ar-EG' : 'en-US';
    return new Intl.DateTimeFormat(intlLocale, {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    }).format(d);
  } catch { return iso; }
}

export default function MyRequests() {
  const { t, locale } = useLanguage();
  const { token } = useAuth();
  const [requests, setRequests] = useState<PortalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetch(`${API_URL}/api/supply-requests`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed to load');
        return res.json();
      })
      .then(data => {
        setRequests(data.requests || []);
        setError(null);
      })
      .catch(() => setError(t('portal.loadError')))
      .finally(() => setLoading(false));
  }, [token, t]);

  if (loading) return <LoadingState count={3} />;
  if (error) return <div className="portal-error-banner">{error}</div>;

  if (requests.length === 0) {
    return (
      <div className="portal-page-header">
        <h1 className="page-title">{t('portal.myRequests')}</h1>
        <EmptyState
          title={t('myRequests.emptyTitle')}
          description={t('myRequests.emptyDesc')}
          action={
            <Link to="/catalog" className="btn btn-primary">
              {t('myRequests.newRequest')}
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="portal-page-header">
      <div className="portal-list-header">
        <h1 className="page-title">{t('portal.myRequests')}</h1>
        <Link to="/portal/new-request" className="btn btn-primary btn-sm">
          {t('myRequests.newRequest')}
        </Link>
      </div>
      <div className="portal-request-list">
        {requests.map(req => {
          const statusLabel = STATUS_LABELS[req.status] || { en: req.status, ar: req.status };
          const statusClass = STATUS_CLASSES[req.status] || 'badge-neutral';
          return (
            <Link key={req.id} to={`/portal/request/${req.reference}`} className="portal-request-card">
              <div className="portal-request-card-top">
                <div className="portal-request-card-ref">
                  <ClipboardIcon />
                  <span className="portal-request-ref">{req.reference}</span>
                </div>
                <span className={`badge ${statusClass}`}>{statusLabel[locale]}</span>
              </div>
              <div className="portal-request-card-mid">
                {req.customer_po_number && (
                  <span className="portal-request-po">{t('portal.poNumber')}: {req.customer_po_number}</span>
                )}
              </div>
              <div className="portal-request-card-bottom">
                <span className="portal-request-meta">
                  {req.item_count} {t('myRequests.itemCount')}
                </span>
                <span className="portal-request-meta">
                  {t('myRequests.lastUpdate')}: {formatRelativeDate(req.updated_at || req.created_at, locale)}
                </span>
              </div>
              <div className="portal-request-card-action">
                <span className="btn btn-outline btn-sm">{t('myRequests.viewDetails')}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
