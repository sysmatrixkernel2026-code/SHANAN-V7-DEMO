import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../i18n/LanguageContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface AccountSummary {
  outstanding: number;
  paid: number;
  remaining: number;
  agingDays: number;
  totalRecords: number;
}

interface CreditApp {
  id: string;
  application_number: string;
  status: string;
  requested_credit_limit: string | null;
  submitted_at: string | null;
}

const CREDIT_STATUS_LABELS: Record<string, { en: string; ar: string }> = {
  draft: { en: 'Draft', ar: 'مسودة' },
  submitted: { en: 'Submitted', ar: 'مُرسل' },
  under_review: { en: 'Under Review', ar: 'قيد المراجعة' },
  returned_for_correction: { en: 'Returned for Correction', ar: 'مُعاد للتصحيح' },
  approved: { en: 'Approved', ar: 'مقبول' },
  rejected: { en: 'Rejected', ar: 'مرفوض' },
  cancelled: { en: 'Cancelled', ar: 'ملغي' },
};

export default function MyCompany() {
  const { t, locale } = useLanguage();
  const { user, token } = useAuth();
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [creditApps, setCreditApps] = useState<CreditApp[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      fetch(`${API_URL}/api/account-summary`, { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json()).catch(() => null),
      fetch(`${API_URL}/api/credit-applications`, { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json()).catch(() => null),
    ]).then(([s, c]) => {
      setSummary(s || { outstanding: 0, paid: 0, remaining: 0, agingDays: 0, totalRecords: 0 });
      setCreditApps(c?.applications || []);
      setLoading(false);
    });
  }, [token]);

  if (!user || loading) return null;

  return (
    <div className="portal-my-company">
      <h1 className="page-title">{t('portal.myCompany')}</h1>

      {/* User Identity */}
      <div className="portal-company-card">
        <div className="portal-company-card-header">
          <img src="/shanan-logo.png" alt="SHANAN" width="40" height="40" className="portal-company-logo" />
          <div>
            <h2 className="portal-company-name">{user.name}</h2>
            <span className="portal-company-role">{user.role}</span>
          </div>
        </div>
        <dl className="portal-company-grid">
          <div className="portal-company-field">
            <dt>{t('portal.email')}</dt><dd>{user.email}</dd>
          </div>
          <div className="portal-company-field">
            <dt>{t('portal.userType')}</dt>
            <dd>{user.userType === 'customer' ? t('portal.customer') : t('portal.internal')}</dd>
          </div>
        </dl>
      </div>

      {/* Financial Summary */}
      <div className="portal-company-card" style={{ marginTop: 16 }}>
        <h2 className="portal-section-title">{t('portal.accountStatus')}</h2>
        <div className="portal-financial-grid">
          <div className="portal-financial-item">
            <span className="portal-financial-label">{t('portal.outstanding')}</span>
            <span className="portal-financial-value">{summary?.outstanding?.toFixed(2) || '0.00'}</span>
          </div>
          <div className="portal-financial-item">
            <span className="portal-financial-label">{t('portal.paid')}</span>
            <span className="portal-financial-value">{summary?.paid?.toFixed(2) || '0.00'}</span>
          </div>
          <div className="portal-financial-item">
            <span className="portal-financial-label">{t('portal.remaining')}</span>
            <span className="portal-financial-value">{summary?.remaining?.toFixed(2) || '0.00'}</span>
          </div>
          <div className="portal-financial-item">
            <span className="portal-financial-label">{t('portal.agingDays')}</span>
            <span className="portal-financial-value">{summary?.agingDays || 0}</span>
          </div>
        </div>
        {summary?.totalRecords === 0 && (
          <p className="portal-empty-note">{t('portal.noFinancialData')}</p>
        )}
      </div>

      {/* Credit Applications */}
      <div className="portal-company-card" style={{ marginTop: 16 }}>
        <h2 className="portal-section-title">{t('portal.creditApplications')}</h2>
        {creditApps.length === 0 ? (
          <p className="portal-empty-note">{t('portal.noCreditApps')}</p>
        ) : (
          <div className="portal-credit-list">
            {creditApps.map(app => {
              const statusLabel = CREDIT_STATUS_LABELS[app.status] || { en: app.status, ar: app.status };
              return (
                <div key={app.id} className="portal-credit-item">
                  <span className="portal-credit-ref">{app.application_number}</span>
                  <span className="badge badge-neutral">{statusLabel[locale]}</span>
                  {app.requested_credit_limit && (
                    <span className="portal-credit-limit">{t('portal.creditLimit')}: {app.requested_credit_limit}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
