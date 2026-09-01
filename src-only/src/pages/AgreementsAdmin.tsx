import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { LoadingState, EmptyState } from '../components/LoadingEmptyStates';

// ============================================================
// AgreementsAdmin — Internal SHANAN staff page.
// Route: /admin/agreements  (ProtectedRoute requireInternal)
//
// Lists all supplier agreements + inline create form.
// Clicking an agreement navigates to /admin/agreements/:id
// (handled by AgreementDetail page).
// ============================================================

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface Agreement {
  id: string;
  agreement_number: string;
  supplier_id: string;
  supplier_name: string | null;
  supplier_reference: string | null;
  status: 'draft' | 'active' | 'suspended' | 'expired' | 'terminated';
  effective_from: string | null;
  effective_to: string | null;
  currency: string;
  payment_terms_days: number | null;
  supplier_credit_limit: string | null;
  trade_terms_notes: string | null;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
}

interface Supplier {
  id: string;
  reference: string;
  name_en: string;
  status: string;
}

const STATUS_BADGE: Record<string, string> = {
  draft: 'badge-neutral',
  active: 'badge-success',
  suspended: 'badge-warning',
  expired: 'badge-info',
  terminated: 'badge-error',
};

const STATUS_LABEL_KEYS: Record<string, 'agreements.statusDraft' | 'agreements.statusActive' | 'agreements.statusSuspended' | 'agreements.statusExpired' | 'agreements.statusTerminated'> = {
  draft: 'agreements.statusDraft',
  active: 'agreements.statusActive',
  suspended: 'agreements.statusSuspended',
  expired: 'agreements.statusExpired',
  terminated: 'agreements.statusTerminated',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }); }
  catch { return iso; }
}

export default function AgreementsAdmin() {
  const { t } = useLanguage();
  const { token } = useAuth();

  const [list, setList] = useState<Agreement[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);

  // Create-agreement form state
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    supplierId: '',
    status: 'draft' as 'draft' | 'active' | 'suspended' | 'expired' | 'terminated',
    effectiveFrom: '',
    effectiveTo: '',
    currency: 'JOD',
    paymentTermsDays: '',
    supplierCreditLimit: '',
    tradeTermsNotes: '',
    internalNotes: '',
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    if (!token) return;
    setListLoading(true);
    setListError(null);
    try {
      const res = await fetch(`${API_URL}/api/supplier-agreements`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.status === 401 || res.status === 403) {
        setListError(res.status === 401 ? 'Authentication required' : 'Internal access required');
        setList([]);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setList(data.agreements ?? []);
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Could not load agreements.');
      setList(null);
    } finally {
      setListLoading(false);
    }
  }, [token]);

  // Load suppliers for the create-form dropdown
  const loadSuppliers = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/suppliers`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setSuppliers(data.suppliers ?? []);
    } catch {
      setSuppliers([]);
    }
  }, [token]);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { if (showCreate && suppliers.length === 0) loadSuppliers(); }, [showCreate, suppliers.length, loadSuppliers]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setCreating(true);
    setCreateError(null);
    try {
      const body: Record<string, unknown> = {
        supplierId: createForm.supplierId,
        status: createForm.status,
        currency: createForm.currency.trim() || 'JOD',
        effectiveFrom: createForm.effectiveFrom || null,
        effectiveTo: createForm.effectiveTo || null,
        supplierCreditLimit: createForm.supplierCreditLimit.trim() || null,
        tradeTermsNotes: createForm.tradeTermsNotes.trim() || null,
        internalNotes: createForm.internalNotes.trim() || null,
      };
      if (createForm.paymentTermsDays !== '') {
        const n = parseInt(createForm.paymentTermsDays, 10);
        if (!isNaN(n) && n >= 0) body.paymentTermsDays = n;
      }
      const res = await fetch(`${API_URL}/api/supplier-agreements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const created = await res.json();
      setShowCreate(false);
      setCreateForm({
        supplierId: '', status: 'draft', effectiveFrom: '', effectiveTo: '',
        currency: 'JOD', paymentTermsDays: '', supplierCreditLimit: '',
        tradeTermsNotes: '', internalNotes: '',
      });
      await loadList();
      // Navigate to the new agreement's detail page
      window.location.hash = `#/admin/agreements/${created.id}`;
      window.location.href = `/admin/agreements/${created.id}`;
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Could not create agreement.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="container" style={{ padding: '40px 0 64px' }}>
      {/* Page header */}
      <div className="page-header" style={{ marginBottom: 32 }}>
        <span className="admin-eyebrow">
          <span className="admin-eyebrow-dot" />
          {t('agreements.eyebrow')}
        </span>
        <h1 className="page-title">{t('agreements.title')}</h1>
        <p className="page-subtitle">{t('agreements.subtitle')}</p>
      </div>

      {/* Layout */}
      <div className="admin-layout">
        <section className="admin-list-panel" aria-label="Agreements list">
          <header className="admin-list-header">
            <h2 className="admin-list-title">
              {t('agreements.title')}
              {list && <span className="admin-list-count">({list.length})</span>}
            </h2>
            <button type="button" className="btn btn-ghost btn-sm" onClick={loadList} disabled={listLoading}>
              {t('agreements.refresh')}
            </button>
          </header>

          <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowCreate(s => !s)}>
              {t('agreements.newAgreement')}
            </button>
            <Link to="/admin/suppliers" className="btn btn-ghost btn-sm">{t('suppliers.title')}</Link>
            <Link to="/admin/supply-requests" className="btn btn-ghost btn-sm">{t('admin.title')}</Link>
          </div>

          {showCreate && (
            <form onSubmit={handleCreate} style={{ marginBottom: 16, padding: 12, border: '1px solid #e5e7eb', borderRadius: 6, background: '#fafafa' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <label style={{ gridColumn: 'span 2' }}>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{t('agreements.fieldSupplier')}</span>
                  <select className="form-input" value={createForm.supplierId} onChange={e => setCreateForm({ ...createForm, supplierId: e.target.value })} required>
                    <option value="">—</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name_en} ({s.reference})</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{t('agreements.fieldStatus')}</span>
                  <select className="form-input" value={createForm.status} onChange={e => setCreateForm({ ...createForm, status: e.target.value as any })}>
                    <option value="draft">{t('agreements.statusDraft')}</option>
                    <option value="active">{t('agreements.statusActive')}</option>
                    <option value="suspended">{t('agreements.statusSuspended')}</option>
                    <option value="expired">{t('agreements.statusExpired')}</option>
                    <option value="terminated">{t('agreements.statusTerminated')}</option>
                  </select>
                </label>
                <label>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{t('agreements.fieldCurrency')}</span>
                  <input className="form-input" value={createForm.currency} onChange={e => setCreateForm({ ...createForm, currency: e.target.value })} />
                </label>
                <label>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{t('agreements.fieldEffectiveFrom')}</span>
                  <input type="date" className="form-input" value={createForm.effectiveFrom} onChange={e => setCreateForm({ ...createForm, effectiveFrom: e.target.value })} />
                </label>
                <label>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{t('agreements.fieldEffectiveTo')}</span>
                  <input type="date" className="form-input" value={createForm.effectiveTo} onChange={e => setCreateForm({ ...createForm, effectiveTo: e.target.value })} />
                </label>
                <label>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{t('agreements.fieldPaymentTermsDays')}</span>
                  <input type="number" min={0} className="form-input" value={createForm.paymentTermsDays} onChange={e => setCreateForm({ ...createForm, paymentTermsDays: e.target.value })} placeholder="60" />
                </label>
                <label>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{t('agreements.fieldSupplierCreditLimit')}</span>
                  <input className="form-input" value={createForm.supplierCreditLimit} onChange={e => setCreateForm({ ...createForm, supplierCreditLimit: e.target.value })} placeholder="50,000 JOD" />
                </label>
              </div>
              <label style={{ display: 'block', marginTop: 8 }}>
                <span style={{ fontSize: 12, color: '#6b7280' }}>{t('agreements.fieldTradeTermsNotes')}</span>
                <textarea className="form-input" rows={2} value={createForm.tradeTermsNotes} onChange={e => setCreateForm({ ...createForm, tradeTermsNotes: e.target.value })} />
              </label>
              <label style={{ display: 'block', marginTop: 8 }}>
                <span style={{ fontSize: 12, color: '#6b7280' }}>{t('agreements.fieldInternalNotes')}</span>
                <textarea className="form-input" rows={2} value={createForm.internalNotes} onChange={e => setCreateForm({ ...createForm, internalNotes: e.target.value })} />
              </label>
              {createError && <div className="portal-error-banner" style={{ marginTop: 8 }}>{createError}</div>}
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-primary btn-sm" disabled={creating}>{creating ? t('agreements.saving') : t('agreements.save')}</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowCreate(false)}>×</button>
              </div>
            </form>
          )}

          {listLoading && <LoadingState type="card" count={3} />}

          {listError && !listLoading && (
            <div className="admin-error-state" role="alert">
              <p className="admin-error-title">{t('agreements.loadError')}</p>
              <p className="admin-error-detail">{listError}</p>
              <button type="button" className="btn btn-outline btn-sm" onClick={loadList}>{t('admin.retry')}</button>
            </div>
          )}

          {!listLoading && !listError && list && list.length === 0 && (
            <EmptyState title={t('agreements.emptyTitle')} description={t('agreements.emptyDesc')} />
          )}

          {!listLoading && !listError && list && list.length > 0 && (
            <ul className="admin-request-list">
              {list.map(a => (
                <li key={a.id}>
                  <Link to={`/admin/agreements/${a.id}`} className="admin-request-row" style={{ display: 'block', padding: 12, textDecoration: 'none', color: 'inherit' }}>
                    <div className="admin-request-row-top">
                      <span className="admin-request-reference">{a.agreement_number}</span>
                      <span className={`badge ${STATUS_BADGE[a.status] || 'badge-neutral'}`}>
                        {t(STATUS_LABEL_KEYS[a.status] || 'agreements.statusDraft')}
                      </span>
                    </div>
                    <div className="admin-request-row-mid">
                      <span className="admin-request-name">{a.supplier_name || '—'}</span>
                    </div>
                    <div className="admin-request-row-bot">
                      <span className="admin-request-location">
                        {a.currency} · {a.payment_terms_days != null ? `Net ${a.payment_terms_days}` : 'No payment terms'}
                        {a.supplier_credit_limit ? ` · ${a.supplier_credit_limit}` : ''}
                      </span>
                      <span className="admin-request-date">{formatDate(a.created_at)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="admin-detail-panel">
          {!listLoading && !listError && list && (
            <div className="admin-detail-empty">
              <p>{t('agreements.selectPrompt')}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
