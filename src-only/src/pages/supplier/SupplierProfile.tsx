import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { LoadingState } from '../../components/LoadingEmptyStates';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface SupplierProfile {
  id: string;
  reference: string;
  name_en: string;
  name_ar: string | null;
  status: string;
  country: string | null;
  city: string | null;
  address: string | null;
  website: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  tax_id: string | null;
  notes: string | null;
  created_at: string;
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'badge-warning',
  under_review: 'badge-info',
  active: 'badge-success',
  suspended: 'badge-error',
  terminated: 'badge-error',
};

export default function SupplierProfile() {
  const { t } = useLanguage();
  const { token } = useAuth();
  const [profile, setProfile] = useState<SupplierProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    nameAr: '', country: '', city: '', address: '', website: '',
    contactName: '', contactPhone: '', taxId: '', notes: '',
  });

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api/supplier/profile`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed')))
      .then(d => {
        const s = d.supplier;
        setProfile(s);
        setForm({
          nameAr: s.name_ar || '', country: s.country || '', city: s.city || '',
          address: s.address || '', website: s.website || '',
          contactName: s.contact_name || '', contactPhone: s.contact_phone || '',
          taxId: s.tax_id || '', notes: s.notes || '',
        });
      })
      .catch(e => setError(e.message));
  }, [token]);

  const handleSave = useCallback(async () => {
    if (!token) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch(`${API_URL}/api/supplier/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Save failed');
      const d = await res.json();
      setProfile(d.supplier);
      setSaveMsg(t('supplier.profileSaved'));
    } catch {
      setSaveMsg(t('supplier.profileSaveError'));
    } finally {
      setSaving(false);
    }
  }, [token, form, t]);

  if (error) return <div className="admin-error-state"><p>{error}</p></div>;
  if (!profile) return <LoadingState type="card" count={2} />;

  return (
    <div style={{ padding: '32px 0 64px', maxWidth: 720 }}>
      <div className="page-header" style={{ marginBottom: 32 }}>
        <span className="admin-eyebrow">
          <span className="admin-eyebrow-dot" />
          {t('supplier.profileEyebrow')}
        </span>
        <h1 className="page-title">{t('supplier.profileTitle')}</h1>
      </div>

      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 18 }}>{profile.name_en}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{profile.reference}</div>
          </div>
          <span className={`badge ${STATUS_BADGE[profile.status] || 'badge-secondary'}`}>
            {profile.status}
          </span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {t('supplier.registered')}: {new Date(profile.created_at).toLocaleDateString()}
        </div>
      </div>

      <div className="card" style={{ padding: 24 }}>
        <h3 style={{ fontWeight: 600, marginBottom: 16 }}>{t('supplier.profileDetails')}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {([
            ['nameAr', t('supplier.nameAr')],
            ['country', t('supplier.country')],
            ['city', t('supplier.city')],
            ['website', t('supplier.website')],
            ['contactName', t('supplier.contactName')],
            ['contactPhone', t('supplier.contactPhone')],
            ['taxId', t('supplier.taxId')],
          ] as [keyof typeof form, string][]).map(([key, label]) => (
            <div key={key} className="form-group">
              <label className="form-label">{label}</label>
              <input
                className="form-input"
                value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              />
            </div>
          ))}
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">{t('supplier.address')}</label>
            <input
              className="form-input"
              value={form.address}
              onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
            />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">{t('supplier.notes')}</label>
            <textarea
              className="form-input"
              rows={3}
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '...' : t('supplier.saveProfile')}
          </button>
          {saveMsg && <span style={{ fontSize: 13, color: saveMsg.includes('Error') ? '#dc2626' : '#059669' }}>{saveMsg}</span>}
        </div>
      </div>
    </div>
  );
}
