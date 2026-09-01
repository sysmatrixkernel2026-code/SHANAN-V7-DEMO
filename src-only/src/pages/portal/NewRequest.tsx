import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { trackEvent, ActivityEvents } from '../../data/activity';
import { useLanguage } from '../../i18n/LanguageContext';
import { useSupplyRequest } from '../../context/SupplyRequestContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function NewRequest() {
  const { t } = useLanguage();
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const { items, clearItems } = useSupplyRequest();

  const [form, setForm] = useState({
    requesterName: user?.name || '',
    companyName: '',
    email: user?.email || '',
    phone: '',
    country: '',
    city: '',
    message: '',
    customerPoNumber: '',
    deliveryDate: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.requesterName.trim() || !form.companyName.trim() || !form.email.trim() || !form.phone.trim() || !form.country.trim() || !form.city.trim()) {
      setError(t('portal.fillRequired'));
      return;
    }
    if (items.length === 0) {
      setError(t('portal.fillItems'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/supply-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          ...form,
          deliveryDate: form.deliveryDate || null,
          items: items.map(it => ({
            productId: it.productId,
            productName: it.productName,
            sku: it.sku,
            quantity: it.quantity,
            notes: it.notes ?? '',
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Create failed');
      }
      const data = await res.json();
      // If PO number was entered, save it via PATCH
      if (form.customerPoNumber.trim()) {
        await fetch(`${API_URL}/api/supply-requests/${data.reference}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ customerPoNumber: form.customerPoNumber }),
        }).catch(() => {});
      }
      clearItems();
      navigate(`/portal/request/${data.reference}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('portal.createError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="portal-new-request">
      <Link to="/portal/my-requests" className="portal-back-link">← {t('portal.backToList')}</Link>
      <h1 className="page-title">{t('portal.newRequest')}</h1>

      <form onSubmit={handleSubmit} className="portal-form">
        {/* Items section — reuses existing SupplyRequestContext cart items */}
        <section className="portal-form-section">
          <h2 className="portal-form-section-title">
            {t('portal.items')}
            <span className="portal-items-count">{items.length}</span>
          </h2>
          {items.length === 0 ? (
            <div className="portal-empty-items">
              <p>{t('portal.noItems')}</p>
              <Link to="/catalog" className="btn btn-secondary">{t('nav.catalog')}</Link>
            </div>
          ) : (
            <div className="portal-cart-list">
              {items.map(item => (
                <div key={item.productId} className="portal-cart-item">
                  <div className="portal-cart-item-info">
                    <span className="portal-cart-item-name">{item.productName}</span>
                    <span className="portal-cart-item-sku">{t('portal.sku')}: {item.sku}</span>
                    <span className="portal-cart-item-qty">{t('portal.qty')}: {item.quantity}</span>
                  </div>
                </div>
              ))}
              <Link to="/catalog" className="btn btn-outline btn-sm">{t('portal.addItem')}</Link>
            </div>
          )}
        </section>

        {/* Contact info section */}
        <section className="portal-form-section">
          <h2 className="portal-form-section-title">{t('portal.contactInfo')}</h2>
          <div className="supply-form-grid">
            <div className="form-group">
              <label className="form-label">{t('portal.requesterName')} *</label>
              <input className="form-input" value={form.requesterName} onChange={e => setForm({ ...form, requesterName: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('portal.companyName')} *</label>
              <input className="form-input" value={form.companyName} onChange={e => setForm({ ...form, companyName: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('portal.email')} *</label>
              <input type="email" className="form-input" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('portal.phone')} *</label>
              <input className="form-input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('portal.country')} *</label>
              <input className="form-input" value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('portal.city')} *</label>
              <input className="form-input" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">{t('portal.poNumber')}</label>
            <input className="form-input" maxLength={100} value={form.customerPoNumber} onChange={e => setForm({ ...form, customerPoNumber: e.target.value })} placeholder={t('portal.poPlaceholder')} />
          </div>
          <div className="form-group">
            <label className="form-label">
              {t('portal.deliveryDate')}
              <span className="form-label-optional">({t('portal.deliveryDateOptional')})</span>
            </label>
            <input type="date" className="form-input" value={form.deliveryDate} onChange={e => setForm({ ...form, deliveryDate: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('portal.message')}</label>
            <textarea className="form-textarea" value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} />
          </div>
        </section>

        {error && <div className="portal-error-banner">{error}</div>}

        <div className="portal-detail-actions">
          <button type="submit" className="btn btn-primary btn-lg" disabled={submitting || items.length === 0}>
            {submitting ? t('portal.creating') : t('portal.createDraft')}
          </button>
        </div>
      </form>
    </div>
  );
}
