import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { LoadingState, EmptyState } from '../../components/LoadingEmptyStates';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface Notification {
  id: string;
  event_type: string;
  title_en: string;
  title_ar: string;
  body_en: string;
  body_ar: string;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
}

interface NotificationsResponse {
  notifications: Notification[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  unreadCount: number;
}

const EVENT_ICONS: Record<string, string> = {
  rfq_offer_submitted: '📝',
  rfq_offer_updated: '✏️',
  rfq_offer_withdrawn: '❌',
  rfq_status_changed: '📊',
  rfq_assigned: '📩',
};

export default function SupplierNotifications() {
  const { t } = useLanguage();
  const { token } = useAuth();
  const [data, setData] = useState<NotificationsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [markingRead, setMarkingRead] = useState<string | null>(null);

  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  const loadNotifications = useCallback(() => {
    if (!token) return;
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (unreadOnly) params.set('unreadOnly', '1');
    fetch(`${API_URL}/api/supplier/notifications?${params}`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed')))
      .then(d => setData(d))
      .catch(e => setError(e.message));
  }, [token, page, unreadOnly]);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  const markAsRead = async (notifId: string) => {
    setMarkingRead(notifId);
    try {
      await fetch(`${API_URL}/api/supplier/notifications/${notifId}/read`, {
        method: 'PATCH', headers,
      });
      await loadNotifications();
    } catch {
      // ignore
    } finally {
      setMarkingRead(null);
    }
  };

  const markAllAsRead = async () => {
    try {
      await fetch(`${API_URL}/api/supplier/notifications/read-all`, {
        method: 'PATCH', headers,
      });
      await loadNotifications();
    } catch {
      // ignore
    }
  };

  if (error) return <div className="admin-error-state"><p>{error}</p></div>;
  if (!data) return <LoadingState type="card" count={5} />;

  return (
    <div style={{ padding: '32px 0 64px' }}>
      <div className="page-header" style={{ marginBottom: 32 }}>
        <span className="admin-eyebrow">
          <span className="admin-eyebrow-dot" />
          {t('supplier.notificationsEyebrow')}
        </span>
        <h1 className="page-title">{t('supplier.notificationsTitle')}</h1>
        <p className="page-subtitle">{t('supplier.notificationsSubtitle')}</p>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`btn btn-sm ${!unreadOnly ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => { setUnreadOnly(false); setPage(1); }}
          >
            {t('supplier.allNotifications')} {data.total > 0 ? `(${data.total})` : ''}
          </button>
          <button
            className={`btn btn-sm ${unreadOnly ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => { setUnreadOnly(true); setPage(1); }}
          >
            {t('supplier.unreadFilter')} {data.unreadCount > 0 ? `(${data.unreadCount})` : ''}
          </button>
        </div>
        {data.unreadCount > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={markAllAsRead}>
            {t('supplier.markAllRead')}
          </button>
        )}
      </div>

      {data.notifications.length === 0 ? (
        <EmptyState title={t('supplier.noNotifications')} />
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.notifications.map(n => (
              <div
                key={n.id}
                className="card"
                style={{
                  padding: '16px 20px',
                  display: 'flex',
                  gap: 16,
                  alignItems: 'start',
                  cursor: n.is_read ? 'default' : 'pointer',
                  background: n.is_read ? 'var(--bg-card, #fff)' : 'var(--color-navy-light, #f8fafc)',
                  opacity: n.is_read ? 0.85 : 1,
                }}
                onClick={() => { if (!n.is_read) markAsRead(n.id); }}
              >
                <span style={{ fontSize: 20, flexShrink: 0, lineHeight: 1.4 }}>
                  {EVENT_ICONS[n.event_type] || '🔔'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12 }}>
                    <div style={{ fontWeight: n.is_read ? 400 : 600, fontSize: 14 }}>
                      {t('lang.ar') === 'العربية' ? n.title_ar : n.title_en}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {new Date(n.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                    {t('lang.ar') === 'العربية' ? n.body_ar : n.body_en}
                  </div>
                </div>
                {!n.is_read && (
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-navy, #1a2744)', flexShrink: 0, marginTop: 6 }} />
                )}
              </div>
            ))}
          </div>

          {data.totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 24 }}>
              <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t('common.prev')}</button>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '6px 12px' }}>{data.page} / {data.totalPages}</span>
              <button className="btn btn-ghost btn-sm" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}>{t('common.next')}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
