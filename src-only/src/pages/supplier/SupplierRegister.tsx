import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../i18n/LanguageContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function SupplierRegister() {
  const { t } = useLanguage();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState({
    companyName: '', companyNameAr: '', email: '', password: '',
    contactName: '', contactPhone: '', country: '', city: '',
    address: '', website: '', taxId: '',
  });

  const handleChange = (field: string, value: string) => {
    setForm(f => ({ ...f, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.companyName.trim() || !form.email.trim() || !form.password || !form.contactName.trim()) {
      setError(t('supplier.registerRequired'));
      return;
    }
    if (form.password.length < 8) {
      setError(t('supplier.registerPasswordMin'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/register-supplier`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Registration failed');
      }
      const data = await res.json();
      // H1: Registration no longer issues a session for a pending supplier.
      // If a token is present (legacy/active path), auto-login as before.
      // Otherwise show a pending-approval message instead of navigating into
      // the supplier portal (where the user would be unauthenticated).
      if (typeof data.token === 'string' && data.token) {
        localStorage.setItem('shanan_auth_token', data.token);
        navigate('/supplier/dashboard');
        window.location.reload();
        return;
      }
      setPending(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('supplier.registerError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="portal-login-page">
      <div className="portal-login-card" style={{ maxWidth: 560 }}>
        <img src="/shanan-logo.png" alt="SHANAN" className="portal-login-logo" width="64" height="64" />
        <h1 className="portal-login-title">{t('supplier.registerTitle')}</h1>
        <p className="portal-login-subtitle">{t('supplier.registerSubtitle')}</p>

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', marginBottom: 16, fontSize: 14 }}>
            {error}
          </div>
        )}

        {pending && (
          <div style={{ padding: '10px 14px', borderRadius: 8, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', marginBottom: 16, fontSize: 14 }}>
            {t('supplier.registerPending')}
          </div>
        )}

        <form onSubmit={handleSubmit} className="portal-login-form">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">{t('supplier.registerCompany')} *</label>
              <input className="form-input" value={form.companyName} onChange={e => handleChange('companyName', e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">{t('supplier.nameAr')}</label>
              <input className="form-input" value={form.companyNameAr} onChange={e => handleChange('companyNameAr', e.target.value)} dir="rtl" />
            </div>
            <div className="form-group">
              <label className="form-label">{t('supplier.registerEmail')} *</label>
              <input type="email" className="form-input" value={form.email} onChange={e => handleChange('email', e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">{t('supplier.registerPassword')} *</label>
              <input type="password" className="form-input" value={form.password} onChange={e => handleChange('password', e.target.value)} minLength={8} required />
            </div>
            <div className="form-group">
              <label className="form-label">{t('supplier.contactName')} *</label>
              <input className="form-input" value={form.contactName} onChange={e => handleChange('contactName', e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">{t('supplier.contactPhone')}</label>
              <input className="form-input" value={form.contactPhone} onChange={e => handleChange('contactPhone', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('supplier.country')}</label>
              <input className="form-input" value={form.country} onChange={e => handleChange('country', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('supplier.city')}</label>
              <input className="form-input" value={form.city} onChange={e => handleChange('city', e.target.value)} />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">{t('supplier.address')}</label>
              <input className="form-input" value={form.address} onChange={e => handleChange('address', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('supplier.website')}</label>
              <input className="form-input" value={form.website} onChange={e => handleChange('website', e.target.value)} placeholder="https://" />
            </div>
            <div className="form-group">
              <label className="form-label">{t('supplier.taxId')}</label>
              <input className="form-input" value={form.taxId} onChange={e => handleChange('taxId', e.target.value)} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 16 }} disabled={submitting}>
            {submitting ? '...' : t('supplier.registerSubmit')}
          </button>
        </form>
        <div style={{ marginTop: 16, textAlign: 'center', fontSize: 14 }}>
          {t('supplier.registerHasAccount')} <Link to="/login" style={{ color: 'var(--color-primary)' }}>{t('supplier.registerLogin')}</Link>
        </div>
      </div>
    </div>
  );
}
