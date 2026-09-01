import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import type { TranslationKey } from '../i18n/translations';
import { LoadingState, EmptyState } from '../components/LoadingEmptyStates';
// Products are now managed via the API Product Master
const allProducts: any[] = []; // No longer imported from catalog

// ============================================================
// SuppliersAdmin — Internal SHANAN staff page.
// Route: /admin/suppliers  (ProtectedRoute requireInternal)
//
// Lists all suppliers + detail panel showing supplier info,
// agreements list, and inline "create supplier" form.
// All data is INTERNAL CONFIDENTIAL — never exposed to customers.
// ============================================================

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface Supplier {
  id: string;
  reference: string;
  name_en: string;
  name_ar: string | null;
  status: 'pending' | 'under_review' | 'active' | 'suspended' | 'terminated';
  country: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  tax_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface AgreementSummary {
  id: string;
  agreement_number: string;
  status: string;
  effective_from: string | null;
  effective_to: string | null;
  currency: string;
  payment_terms_days: number | null;
  supplier_credit_limit: string | null;
  created_at: string;
}

interface SupplierDetail {
  supplier: Supplier;
  agreements: AgreementSummary[];
  agreementsCount: number;
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'badge-warning',
  under_review: 'badge-info',
  active: 'badge-success',
  suspended: 'badge-warning',
  terminated: 'badge-error',
};

const STATUS_LABEL_KEYS: Record<string, TranslationKey> = {
  pending: 'suppliers.statusPending',
  under_review: 'suppliers.statusUnderReview',
  active: 'suppliers.statusActive',
  suspended: 'suppliers.statusSuspended',
  terminated: 'suppliers.statusTerminated',
};

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }); }
  catch { return iso; }
}

export default function SuppliersAdmin() {
  const { t, locale } = useLanguage();
  const { token } = useAuth();

  const [list, setList] = useState<Supplier[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SupplierDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Inline create-supplier form state
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    nameEn: '', nameAr: '', country: '', contactName: '', contactEmail: '', contactPhone: '', taxId: '', notes: '',
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Inline edit form state
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    if (!token) return;
    setListLoading(true);
    setListError(null);
    try {
      const res = await fetch(`${API_URL}/api/suppliers`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.status === 401 || res.status === 403) {
        setListError(res.status === 401 ? 'Authentication required' : 'Internal access required');
        setList([]);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setList(data.suppliers ?? []);
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Could not load suppliers.');
      setList(null);
    } finally {
      setListLoading(false);
    }
  }, [token]);

  useEffect(() => { loadList(); }, [loadList]);

  const selectSupplier = useCallback(async (id: string) => {
    if (!token) return;
    setSelectedId(id);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/suppliers/${encodeURIComponent(id)}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDetail(data);
      // Seed edit form
      const s = data.supplier;
      setEditForm({
        nameEn: s.name_en || '',
        nameAr: s.name_ar || '',
        status: s.status || 'active',
        country: s.country || '',
        contactName: s.contact_name || '',
        contactEmail: s.contact_email || '',
        contactPhone: s.contact_phone || '',
        taxId: s.tax_id || '',
        notes: s.notes || '',
      });
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : 'Could not load supplier.');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, [token]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch(`${API_URL}/api/suppliers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          nameEn: createForm.nameEn.trim(),
          nameAr: createForm.nameAr.trim() || null,
          country: createForm.country.trim() || null,
          contactName: createForm.contactName.trim() || null,
          contactEmail: createForm.contactEmail.trim() || null,
          contactPhone: createForm.contactPhone.trim() || null,
          taxId: createForm.taxId.trim() || null,
          notes: createForm.notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setShowCreate(false);
      setCreateForm({ nameEn: '', nameAr: '', country: '', contactName: '', contactEmail: '', contactPhone: '', taxId: '', notes: '' });
      await loadList();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Could not create supplier.');
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async () => {
    if (!detail || !token) return;
    setSaving(true);
    setSaveError(null);
    try {
      const body: Record<string, unknown> = {};
      if (editForm.nameEn !== (detail.supplier.name_en || '')) body.nameEn = editForm.nameEn.trim();
      if (editForm.nameAr !== (detail.supplier.name_ar || '')) body.nameAr = editForm.nameAr.trim() || null;
      if (editForm.status !== detail.supplier.status) body.status = editForm.status;
      if (editForm.country !== (detail.supplier.country || '')) body.country = editForm.country.trim() || null;
      if (editForm.contactName !== (detail.supplier.contact_name || '')) body.contactName = editForm.contactName.trim() || null;
      if (editForm.contactEmail !== (detail.supplier.contact_email || '')) body.contactEmail = editForm.contactEmail.trim() || null;
      if (editForm.contactPhone !== (detail.supplier.contact_phone || '')) body.contactPhone = editForm.contactPhone.trim() || null;
      if (editForm.taxId !== (detail.supplier.tax_id || '')) body.taxId = editForm.taxId.trim() || null;
      if (editForm.notes !== (detail.supplier.notes || '')) body.notes = editForm.notes.trim() || null;
      if (Object.keys(body).length === 0) {
        setSaveError('No changes to save.');
        return;
      }
      const res = await fetch(`${API_URL}/api/suppliers/${encodeURIComponent(detail.supplier.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      await selectSupplier(detail.supplier.id);
      await loadList();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save supplier.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container" style={{ padding: '40px 0 64px' }}>
      {/* Page header */}
      <div className="page-header" style={{ marginBottom: 32 }}>
        <span className="admin-eyebrow">
          <span className="admin-eyebrow-dot" />
          {t('suppliers.eyebrow')}
        </span>
        <h1 className="page-title">{t('suppliers.title')}</h1>
        <p className="page-subtitle">{t('suppliers.subtitle')}</p>
      </div>

      {/* List + Detail layout */}
      <div className="admin-layout">
        {/* LIST */}
        <section className="admin-list-panel" aria-label="Suppliers list">
          <header className="admin-list-header">
            <h2 className="admin-list-title">
              {t('suppliers.title')}
              {list && <span className="admin-list-count">({list.length})</span>}
            </h2>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={loadList}
              disabled={listLoading}
            >
              {t('suppliers.refresh')}
            </button>
          </header>

          <div style={{ marginBottom: 12 }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setShowCreate(s => !s)}
            >
              {t('suppliers.newSupplier')}
            </button>
            <Link to="/admin/supply-requests" className="btn btn-ghost btn-sm" style={{ marginInlineStart: 8 }}>
              {t('admin.title')}
            </Link>
            <Link to="/admin/agreements" className="btn btn-ghost btn-sm" style={{ marginInlineStart: 8 }}>
              {t('agreements.title')}
            </Link>
          </div>

          {showCreate && (
            <form onSubmit={handleCreate} style={{ marginBottom: 16, padding: 12, border: '1px solid #e5e7eb', borderRadius: 6, background: '#fafafa' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input className="form-input" placeholder={t('suppliers.fieldNameEn')} value={createForm.nameEn} onChange={e => setCreateForm({ ...createForm, nameEn: e.target.value })} required />
                <input className="form-input" placeholder={t('suppliers.fieldNameAr')} value={createForm.nameAr} onChange={e => setCreateForm({ ...createForm, nameAr: e.target.value })} />
                <input className="form-input" placeholder={t('suppliers.fieldCountry')} value={createForm.country} onChange={e => setCreateForm({ ...createForm, country: e.target.value })} />
                <input className="form-input" placeholder={t('suppliers.fieldContactName')} value={createForm.contactName} onChange={e => setCreateForm({ ...createForm, contactName: e.target.value })} />
                <input className="form-input" placeholder={t('suppliers.fieldContactEmail')} value={createForm.contactEmail} onChange={e => setCreateForm({ ...createForm, contactEmail: e.target.value })} />
                <input className="form-input" placeholder={t('suppliers.fieldContactPhone')} value={createForm.contactPhone} onChange={e => setCreateForm({ ...createForm, contactPhone: e.target.value })} />
                <input className="form-input" placeholder={t('suppliers.fieldTaxId')} value={createForm.taxId} onChange={e => setCreateForm({ ...createForm, taxId: e.target.value })} />
              </div>
              <textarea className="form-input" style={{ marginTop: 8, width: '100%' }} placeholder={t('suppliers.fieldNotes')} value={createForm.notes} onChange={e => setCreateForm({ ...createForm, notes: e.target.value })} rows={2} />
              {createError && <div className="portal-error-banner" style={{ marginTop: 8 }}>{createError}</div>}
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-primary btn-sm" disabled={creating}>{creating ? t('suppliers.saving') : t('suppliers.save')}</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowCreate(false)}>×</button>
              </div>
            </form>
          )}

          {listLoading && <LoadingState type="card" count={3} />}

          {listError && !listLoading && (
            <div className="admin-error-state" role="alert">
              <p className="admin-error-title">{t('suppliers.loadError')}</p>
              <p className="admin-error-detail">{listError}</p>
              <button type="button" className="btn btn-outline btn-sm" onClick={loadList}>{t('admin.retry')}</button>
            </div>
          )}

          {!listLoading && !listError && list && list.length === 0 && (
            <EmptyState title={t('suppliers.emptyTitle')} description={t('suppliers.emptyDesc')} />
          )}

          {!listLoading && !listError && list && list.length > 0 && (
            <ul className="admin-request-list">
              {list.map(s => {
                const isActive = selectedId === s.id || selectedId === s.reference;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={`admin-request-row ${isActive ? 'admin-request-row-active' : ''}`}
                      onClick={() => selectSupplier(s.id)}
                      aria-pressed={isActive}
                    >
                      <div className="admin-request-row-top">
                        <span className="admin-request-reference">{s.reference}</span>
                        <span className={`badge ${STATUS_BADGE[s.status] || 'badge-neutral'}`}>
                          {t(STATUS_LABEL_KEYS[s.status] || 'suppliers.statusActive')}
                        </span>
                      </div>
                      <div className="admin-request-row-mid">
                        <span className="admin-request-name">{locale === 'ar' && s.name_ar ? s.name_ar : s.name_en}</span>
                      </div>
                      <div className="admin-request-row-bot">
                        <span className="admin-request-location">{s.country || '—'}</span>
                        <span className="admin-request-date">{formatDate(s.created_at)}</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* DETAIL */}
        <section className="admin-detail-panel" aria-label="Supplier details">
          {!selectedId && !detailLoading && !detail && !detailError && (
            <div className="admin-detail-empty">
              <p>{t('suppliers.selectPrompt')}</p>
            </div>
          )}

          {detailLoading && <LoadingState type="detail" />}

          {detailError && !detailLoading && (
            <div className="admin-error-state" role="alert">
              <p className="admin-error-title">{t('suppliers.loadError')}</p>
              <p className="admin-error-detail">{detailError}</p>
            </div>
          )}

          {detail && !detailLoading && !detailError && (
            <article className="admin-detail-card">
              <header className="admin-detail-header">
                <div>
                  <h2 className="admin-detail-title">{locale === 'ar' && detail.supplier.name_ar ? detail.supplier.name_ar : detail.supplier.name_en}</h2>
                  <p className="admin-detail-reference">{detail.supplier.reference}</p>
                </div>
                <span className={`badge ${STATUS_BADGE[detail.supplier.status] || 'badge-neutral'}`}>
                  {t(STATUS_LABEL_KEYS[detail.supplier.status] || 'suppliers.statusActive')}
                </span>
              </header>

              <div className="admin-detail-grid">
                <label>
                  <span>{t('suppliers.fieldNameEn')}</span>
                  <input className="form-input" value={editForm.nameEn || ''} onChange={e => setEditForm({ ...editForm, nameEn: e.target.value })} />
                </label>
                <label>
                  <span>{t('suppliers.fieldNameAr')}</span>
                  <input className="form-input" value={editForm.nameAr || ''} onChange={e => setEditForm({ ...editForm, nameAr: e.target.value })} />
                </label>
                <label>
                  <span>{t('suppliers.fieldStatus')}</span>
                  <select className="form-input" value={editForm.status || 'active'} onChange={e => setEditForm({ ...editForm, status: e.target.value })}>
                    <option value="active">{t('suppliers.statusActive')}</option>
                    <option value="suspended">{t('suppliers.statusSuspended')}</option>
                    <option value="terminated">{t('suppliers.statusTerminated')}</option>
                  </select>
                </label>
                <label>
                  <span>{t('suppliers.fieldCountry')}</span>
                  <input className="form-input" value={editForm.country || ''} onChange={e => setEditForm({ ...editForm, country: e.target.value })} />
                </label>
                <label>
                  <span>{t('suppliers.fieldContactName')}</span>
                  <input className="form-input" value={editForm.contactName || ''} onChange={e => setEditForm({ ...editForm, contactName: e.target.value })} />
                </label>
                <label>
                  <span>{t('suppliers.fieldContactEmail')}</span>
                  <input className="form-input" value={editForm.contactEmail || ''} onChange={e => setEditForm({ ...editForm, contactEmail: e.target.value })} />
                </label>
                <label>
                  <span>{t('suppliers.fieldContactPhone')}</span>
                  <input className="form-input" value={editForm.contactPhone || ''} onChange={e => setEditForm({ ...editForm, contactPhone: e.target.value })} />
                </label>
                <label>
                  <span>{t('suppliers.fieldTaxId')}</span>
                  <input className="form-input" value={editForm.taxId || ''} onChange={e => setEditForm({ ...editForm, taxId: e.target.value })} />
                </label>
              </div>

              <label style={{ display: 'block', marginTop: 12 }}>
                <span>{t('suppliers.fieldNotes')}</span>
                <textarea className="form-input" rows={3} value={editForm.notes || ''} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} />
              </label>

              {saveError && <div className="portal-error-banner" style={{ marginTop: 8 }}>{saveError}</div>}

              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                  {saving ? t('suppliers.saving') : t('suppliers.save')}
                </button>
              </div>

              {/* Agreements summary */}
              <div style={{ marginTop: 24 }}>
                <h3 className="admin-detail-section-title">
                  {t('suppliers.agreementsTitle')} ({detail.agreementsCount})
                </h3>
                {detail.agreements.length === 0 ? (
                  <p className="portal-no-items">{t('suppliers.noAgreements')}</p>
                ) : (
                  <ul className="admin-request-list" style={{ marginTop: 8 }}>
                    {detail.agreements.map(a => (
                      <li key={a.id}>
                        <Link to={`/admin/agreements/${a.id}`} className="admin-request-row" style={{ display: 'block', padding: 12, textDecoration: 'none', color: 'inherit' }}>
                          <div className="admin-request-row-top">
                            <span className="admin-request-reference">{a.agreement_number}</span>
                            <span className={`badge ${a.status === 'active' ? 'badge-success' : a.status === 'suspended' ? 'badge-warning' : 'badge-neutral'}`}>
                              {a.status}
                            </span>
                          </div>
                          <div className="admin-request-row-bot">
                            <span className="admin-request-location">{a.currency} {a.supplier_credit_limit || ''}</span>
                            <span className="admin-request-date">{formatDate(a.created_at)}</span>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </article>
          )}
        </section>
      </div>
    </div>
  );
}


