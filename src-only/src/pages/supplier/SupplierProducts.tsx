import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { LoadingState, EmptyState } from '../../components/LoadingEmptyStates';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface MasterProduct {
  id: string;
  sku: string;
  productCode: string;
  name: { en: string; ar: string };
  categoryId: string;
  brandId: string;
  brandName: string | null;
  categoryName: { en: string; ar: string } | null;
  availability: string;
  sellPrice: number | null;
  currency: string;
  primaryImage: string | null;
}

interface SupplierProduct {
  id: string;
  supplierId: string;
  productId: string;
  supplierSku: string | null;
  supplierProductName: string | null;
  unitPrice: number | null;
  currency: string;
  minimumOrderQuantity: number | null;
  leadTimeDays: number | null;
  availabilityStatus: string;
  paymentTerms: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  masterProduct: MasterProduct;
}

interface SupplierProductDetail extends SupplierProduct {
  masterProduct: MasterProduct & {
    description: { en: string; ar: string };
    manufacturer: string | null;
    stockQuantity: number | null;
    brandSlug: string;
    categorySlug: string;
    images: { id: string; url: string; alt: { en: string; ar: string }; isPrimary: boolean; sortOrder: number }[];
    specifications: { label: { en: string; ar: string }; value: { en: string; ar: string }; group: { en: string; ar: string } }[];
  };
}

interface CatalogResponse {
  items: MasterProduct[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface SupplierProductsResponse {
  items: SupplierProduct[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface Summary {
  totalProducts: number;
  activeProducts: number;
  withPrice: number;
  withoutPrice: number;
  activeRfqs: number;
}

type Tab = 'my-products' | 'browse';

const AVAILABILITY_OPTIONS = ['available', 'limited', 'unavailable', 'expected'] as const;
const CURRENCY_OPTIONS = ['JOD', 'USD', 'EUR', 'GBP', 'SAR', 'AED'] as const;

export default function SupplierProducts() {
  const { t, locale } = useLanguage();
  const { token } = useAuth();
  const [tab, setTab] = useState<Tab>('my-products');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // My Products state
  const [myProducts, setMyProducts] = useState<SupplierProductsResponse | null>(null);
  const [myPage, setMyPage] = useState(1);
  const [mySearch, setMySearch] = useState('');
  const [myActiveFilter, setMyActiveFilter] = useState<string>('');
  const [myPriceFilter, setMyPriceFilter] = useState<string>('');

  // Browse catalog state
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [browsePage, setBrowsePage] = useState(1);
  const [browseSearch, setBrowseSearch] = useState('');
  const [browseCategoryId, setBrowseCategoryId] = useState('');
  const [browseBrandId, setBrowseBrandId] = useState('');

  // Detail/edit modal state
  const [selectedProduct, setSelectedProduct] = useState<SupplierProductDetail | null>(null);
  const [editForm, setEditForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [addingProductId, setAddingProductId] = useState<string | null>(null);

  // Categories + Brands for filters
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);

  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  // --- Load summary ---
  const loadSummary = useCallback(() => {
    if (!token) return;
    fetch(`${API_URL}/api/supplier/products/summary`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setSummary(d))
      .catch(() => {});
  }, [token]);

  // --- Load my products ---
  const loadMyProducts = useCallback(() => {
    if (!token) return;
    const params = new URLSearchParams({ page: String(myPage), pageSize: '12' });
    if (mySearch) params.set('search', mySearch);
    if (myActiveFilter) params.set('activeOnly', myActiveFilter);
    if (myPriceFilter) params.set('withPrice', myPriceFilter);
    fetch(`${API_URL}/api/supplier/products?${params}`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed')))
      .then(d => setMyProducts(d))
      .catch(e => setError(e.message));
  }, [token, myPage, mySearch, myActiveFilter, myPriceFilter]);

  // --- Load browse catalog ---
  const loadBrowseCatalog = useCallback(() => {
    if (!token) return;
    const params = new URLSearchParams({ page: String(browsePage), pageSize: '12' });
    if (browseSearch) params.set('search', browseSearch);
    if (browseCategoryId) params.set('categoryId', browseCategoryId);
    if (browseBrandId) params.set('brandId', browseBrandId);
    fetch(`${API_URL}/api/products?${params}`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed')))
      .then(d => setCatalog(d))
      .catch(e => setError(e.message));
  }, [token, browsePage, browseSearch, browseCategoryId, browseBrandId]);

  // --- Load categories + brands for filters ---
  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api/categories`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.categories) setCategories(d.categories.map((c: any) => ({ id: c.id, name: c.name_en || c.name_ar || '' }))); })
      .catch(() => {});
    fetch(`${API_URL}/api/brands`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.brands) setBrands(d.brands.map((b: any) => ({ id: b.id, name: b.name || '' }))); })
      .catch(() => {});
  }, [token]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadMyProducts(); }, [loadMyProducts]);
  useEffect(() => { loadBrowseCatalog(); }, [loadBrowseCatalog]);

  // Clear success after 3s
  useEffect(() => {
    if (!successMsg) return;
    const timer = setTimeout(() => setSuccessMsg(null), 3000);
    return () => clearTimeout(timer);
  }, [successMsg]);

  // --- Add product to catalog ---
  const handleAddToCatalog = async (productId: string) => {
    setAddingProductId(productId);
    try {
      const res = await fetch(`${API_URL}/api/supplier/products`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ productId }),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || 'Failed to add product');
        return;
      }
      setSuccessMsg(t('supplier.productAdded'));
      loadMyProducts();
      loadSummary();
    } catch {
      setError(t('supplier.productAddError'));
    } finally {
      setAddingProductId(null);
    }
  };

  // --- Open detail/edit ---
  const handleViewDetail = async (spId: string) => {
    try {
      const res = await fetch(`${API_URL}/api/supplier/products/${spId}`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed');
      const data: SupplierProductDetail = await res.json();
      setSelectedProduct(data);
      setEditForm({
        supplierSku: data.supplierSku || '',
        supplierProductName: data.supplierProductName || '',
        unitPrice: data.unitPrice ?? '',
        currency: data.currency,
        minimumOrderQuantity: data.minimumOrderQuantity ?? '',
        leadTimeDays: data.leadTimeDays ?? '',
        availabilityStatus: data.availabilityStatus,
        paymentTerms: data.paymentTerms || '',
        notes: data.notes || '',
      });
    } catch {
      setError(t('supplier.productLoadError'));
    }
  };

  // --- Save edits ---
  const handleSave = async () => {
    if (!selectedProduct) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (typeof editForm.supplierSku === 'string') body.supplierSku = editForm.supplierSku || null;
      if (typeof editForm.supplierProductName === 'string') body.supplierProductName = editForm.supplierProductName || null;
      if (editForm.unitPrice === '' || editForm.unitPrice === null) body.unitPrice = null;
      else if (typeof editForm.unitPrice === 'string') body.unitPrice = parseFloat(editForm.unitPrice) || null;
      else body.unitPrice = editForm.unitPrice;
      if (typeof editForm.currency === 'string') body.currency = editForm.currency;
      if (editForm.minimumOrderQuantity === '' || editForm.minimumOrderQuantity === null) body.minimumOrderQuantity = null;
      else if (typeof editForm.minimumOrderQuantity === 'string') body.minimumOrderQuantity = parseInt(editForm.minimumOrderQuantity as string) || null;
      else body.minimumOrderQuantity = editForm.minimumOrderQuantity;
      if (editForm.leadTimeDays === '' || editForm.leadTimeDays === null) body.leadTimeDays = null;
      else if (typeof editForm.leadTimeDays === 'string') body.leadTimeDays = parseInt(editForm.leadTimeDays as string) || null;
      else body.leadTimeDays = editForm.leadTimeDays;
      if (typeof editForm.availabilityStatus === 'string') body.availabilityStatus = editForm.availabilityStatus;
      if (typeof editForm.paymentTerms === 'string') body.paymentTerms = editForm.paymentTerms || null;
      if (typeof editForm.notes === 'string') body.notes = editForm.notes || null;

      const res = await fetch(`${API_URL}/api/supplier/products/${selectedProduct.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed');
      setSuccessMsg(t('supplier.productSaved'));
      setSelectedProduct(null);
      loadMyProducts();
      loadSummary();
    } catch {
      setError(t('supplier.productSaveError'));
    } finally {
      setSaving(false);
    }
  };

  // --- Deactivate ---
  const handleDeactivate = async (spId: string) => {
    if (!confirm(t('supplier.productDeactivateConfirm'))) return;
    try {
      const res = await fetch(`${API_URL}/api/supplier/products/${spId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed');
      setSuccessMsg(t('supplier.productDeactivated'));
      setSelectedProduct(null);
      loadMyProducts();
      loadSummary();
    } catch {
      setError(t('supplier.productDeactivateError'));
    }
  };

  if (error && !myProducts && !catalog) return <div className="admin-error-state"><p>{error}</p></div>;

  const localeKey = locale === 'ar' ? 'ar' : 'en';

  return (
    <div style={{ padding: '32px 0 64px' }}>
      <div className="page-header" style={{ marginBottom: 32 }}>
        <span className="admin-eyebrow">
          <span className="admin-eyebrow-dot" />
          {t('supplier.productsEyebrow')}
        </span>
        <h1 className="page-title">{t('supplier.productsTitle')}</h1>
        <p className="page-subtitle">{t('supplier.productsSubtitle')}</p>
      </div>

      {error && <div className="admin-error-state" style={{ marginBottom: 16 }}><p>{error}</p><button className="btn btn-ghost btn-sm" onClick={() => setError(null)}>x</button></div>}
      {successMsg && <div className="admin-success-state" style={{ marginBottom: 16 }}><p>{successMsg}</p></div>}

      {/* Summary Cards */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
          {[
            { label: t('supplier.summaryTotal'), value: summary.totalProducts },
            { label: t('supplier.summaryActive'), value: summary.activeProducts },
            { label: t('supplier.summaryWithPrice'), value: summary.withPrice },
            { label: t('supplier.summaryWithoutPrice'), value: summary.withoutPrice },
            { label: t('supplier.summaryActiveRfqs'), value: summary.activeRfqs },
          ].map(card => (
            <div key={card.label} className="card" style={{ padding: '16px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-navy, #1a2744)' }}>{card.value}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{card.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--border-color, #e2e8f0)', marginBottom: 24 }}>
        {([
          { key: 'my-products' as Tab, label: t('supplier.tabMyProducts') },
          { key: 'browse' as Tab, label: t('supplier.tabBrowseCatalog') },
        ]).map(tb => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            style={{
              padding: '12px 24px', fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer',
              borderBottom: tab === tb.key ? '2px solid var(--color-navy, #1a2744)' : '2px solid transparent',
              marginBottom: -2, background: 'transparent',
              color: tab === tb.key ? 'var(--color-navy, #1a2744)' : 'var(--text-secondary, #64748b)',
            }}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {/* === MY PRODUCTS TAB === */}
      {tab === 'my-products' && (
        <>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              placeholder={t('nav.searchPlaceholder')}
              value={mySearch}
              onChange={e => { setMySearch(e.target.value); setMyPage(1); }}
              className="input"
              style={{ flex: '1 1 200px', maxWidth: 360 }}
            />
            <select
              value={myActiveFilter}
              onChange={e => { setMyActiveFilter(e.target.value); setMyPage(1); }}
              className="input"
              style={{ width: 140 }}
            >
              <option value="">{t('supplier.filterAll')}</option>
              <option value="1">{t('supplier.filterActive')}</option>
              <option value="0">{t('supplier.filterInactive')}</option>
            </select>
            <select
              value={myPriceFilter}
              onChange={e => { setMyPriceFilter(e.target.value); setMyPage(1); }}
              className="input"
              style={{ width: 160 }}
            >
              <option value="">{t('supplier.filterAll')}</option>
              <option value="1">{t('supplier.filterWithPrice')}</option>
              <option value="0">{t('supplier.filterWithoutPrice')}</option>
            </select>
          </div>

          {!myProducts ? <LoadingState type="card" count={3} /> : myProducts.items.length === 0 ? (
            <EmptyState
              title={t('supplier.noProducts')}
              description={t('supplier.noProductsDesc')}
              action={
                <button className="btn btn-primary" onClick={() => setTab('browse')}>
                  {t('supplier.browseTo')}
                </button>
              }
            />
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {myProducts.items.map(sp => (
                  <div key={sp.id} className="card" style={{ padding: 0, overflow: 'hidden', cursor: 'pointer' }} onClick={() => handleViewDetail(sp.id)}>
                    <div style={{ height: 160, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {sp.masterProduct.primaryImage ? (
                        <img src={`${API_URL}${sp.masterProduct.primaryImage}`} alt={sp.masterProduct.name[localeKey]} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                      ) : (
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                      )}
                    </div>
                    <div style={{ padding: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{sp.masterProduct.sku}</div>
                          <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3, marginTop: 2 }}>
                            {sp.supplierProductName || sp.masterProduct.name[localeKey]}
                          </div>
                        </div>
                        <span className={`badge ${sp.isActive ? 'badge-success' : 'badge-secondary'}`}>
                          {sp.isActive ? t('supplier.badgeActive') : t('supplier.badgeInactive')}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                        {sp.masterProduct.brandName || '—'} {sp.masterProduct.categoryName ? `/ ${sp.masterProduct.categoryName[localeKey]}` : ''}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-navy, #1a2744)' }}>
                          {sp.unitPrice != null ? `${sp.unitPrice.toFixed(2)} ${sp.currency}` : <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>{t('supplier.noPriceSet')}</span>}
                        </div>
                        {sp.leadTimeDays != null && (
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{sp.leadTimeDays}d</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Pagination */}
              {myProducts.totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 24 }}>
                  <button className="btn btn-ghost btn-sm" disabled={myPage <= 1} onClick={() => setMyPage(p => p - 1)}>{t('common.prev')}</button>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '6px 12px' }}>{myPage} / {myProducts.totalPages}</span>
                  <button className="btn btn-ghost btn-sm" disabled={myPage >= myProducts.totalPages} onClick={() => setMyPage(p => p + 1)}>{t('common.next')}</button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* === BROWSE CATALOG TAB === */}
      {tab === 'browse' && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              placeholder={t('nav.searchPlaceholder')}
              value={browseSearch}
              onChange={e => { setBrowseSearch(e.target.value); setBrowsePage(1); }}
              className="input"
              style={{ flex: '1 1 200px', maxWidth: 360 }}
            />
            <select
              value={browseCategoryId}
              onChange={e => { setBrowseCategoryId(e.target.value); setBrowsePage(1); }}
              className="input"
              style={{ width: 180 }}
            >
              <option value="">{t('supplier.allCategories')}</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select
              value={browseBrandId}
              onChange={e => { setBrowseBrandId(e.target.value); setBrowsePage(1); }}
              className="input"
              style={{ width: 160 }}
            >
              <option value="">{t('supplier.allBrands')}</option>
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          {!catalog ? <LoadingState type="card" count={6} /> : catalog.items.length === 0 ? (
            <EmptyState title={t('supplier.noCatalogResults')} />
          ) : (
            <>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                {catalog.total} {t('supplier.productsFound')}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {catalog.items.map(p => (
                  <div key={p.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ height: 160, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {p.primaryImage ? (
                        <img src={`${API_URL}${p.primaryImage}`} alt={p.name[localeKey]} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                      ) : (
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                      )}
                    </div>
                    <div style={{ padding: 16 }}>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{p.sku}</div>
                      <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3, marginTop: 2 }}>{p.name[localeKey]}</div>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                        {p.brandName || '—'} {p.categoryName ? `/ ${p.categoryName[localeKey]}` : ''}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>
                          {p.sellPrice != null ? `${p.sellPrice.toFixed(2)} ${p.currency}` : '—'}
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 4 }}>{t('supplier.shananPrice')}</span>
                        </div>
                      </div>
                      <button
                        className="btn btn-primary btn-sm"
                        style={{ width: '100%', marginTop: 12 }}
                        disabled={addingProductId === p.id}
                        onClick={() => handleAddToCatalog(p.id)}
                      >
                        {addingProductId === p.id ? '...' : t('supplier.addToCatalog')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {catalog.totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 24 }}>
                  <button className="btn btn-ghost btn-sm" disabled={browsePage <= 1} onClick={() => setBrowsePage(p => p - 1)}>{t('common.prev')}</button>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '6px 12px' }}>{browsePage} / {catalog.totalPages}</span>
                  <button className="btn btn-ghost btn-sm" disabled={browsePage >= catalog.totalPages} onClick={() => setBrowsePage(p => p + 1)}>{t('common.next')}</button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* === DETAIL / EDIT MODAL === */}
      {selectedProduct && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={() => setSelectedProduct(null)}>
          <div className="card" style={{ width: '100%', maxWidth: 720, maxHeight: '90vh', overflow: 'auto', padding: 0 }} onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
              <div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{selectedProduct.masterProduct.sku}</div>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: '4px 0 0' }}>{selectedProduct.masterProduct.name[localeKey]}</h2>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedProduct(null)} style={{ fontSize: 20, padding: '4px 8px' }}>x</button>
            </div>

            {/* Master Product Info */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color, #e2e8f0)', display: 'flex', gap: 20 }}>
              {selectedProduct.masterProduct.images?.[0] && (
                <img src={`${API_URL}${selectedProduct.masterProduct.images[0].url}`} alt="" style={{ width: 120, height: 120, objectFit: 'contain', borderRadius: 8, background: '#f1f5f9' }} />
              )}
              <div style={{ flex: 1, fontSize: 13 }}>
                <div><strong>{t('supplier.masterSku')}:</strong> {selectedProduct.masterProduct.sku}</div>
                {selectedProduct.masterProduct.manufacturer && <div><strong>{t('supplier.masterManufacturer')}:</strong> {selectedProduct.masterProduct.manufacturer}</div>}
                <div><strong>{t('supplier.masterBrand')}:</strong> {selectedProduct.masterProduct.brandName || '—'}</div>
                <div><strong>{t('supplier.masterCategory')}:</strong> {selectedProduct.masterProduct.categoryName?.[localeKey] || '—'}</div>
                <div><strong>{t('supplier.masterPrice')}:</strong> {selectedProduct.masterProduct.sellPrice != null ? `${selectedProduct.masterProduct.sellPrice.toFixed(2)} ${selectedProduct.masterProduct.currency}` : '—'}</div>
                <div><strong>{t('supplier.masterStock')}:</strong> {selectedProduct.masterProduct.stockQuantity ?? '—'}</div>
              </div>
            </div>

            {/* Edit Form */}
            <div style={{ padding: '20px 24px' }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>{t('supplier.supplierCommercialInfo')}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>{t('supplier.fieldSupplierSku')}</label>
                  <input className="input" value={String(editForm.supplierSku || '')} onChange={e => setEditForm(f => ({ ...f, supplierSku: e.target.value }))} placeholder={t('supplier.fieldSupplierSkuPlaceholder')} />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>{t('supplier.fieldSupplierName')}</label>
                  <input className="input" value={String(editForm.supplierProductName || '')} onChange={e => setEditForm(f => ({ ...f, supplierProductName: e.target.value }))} placeholder={t('supplier.fieldSupplierNamePlaceholder')} />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>{t('supplier.unitPrice')}</label>
                  <input className="input" type="number" step="0.01" min="0" value={editForm.unitPrice === null || editForm.unitPrice === undefined ? '' : String(editForm.unitPrice)} onChange={e => setEditForm(f => ({ ...f, unitPrice: e.target.value }))} placeholder="0.00" />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>{t('supplier.currency')}</label>
                  <select className="input" value={String(editForm.currency)} onChange={e => setEditForm(f => ({ ...f, currency: e.target.value }))}>
                    {CURRENCY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>{t('supplier.fieldMoq')}</label>
                  <input className="input" type="number" min="1" value={editForm.minimumOrderQuantity === null || editForm.minimumOrderQuantity === undefined ? '' : String(editForm.minimumOrderQuantity)} onChange={e => setEditForm(f => ({ ...f, minimumOrderQuantity: e.target.value }))} placeholder="1" />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>{t('supplier.leadTimeDays')}</label>
                  <input className="input" type="number" min="0" value={editForm.leadTimeDays === null || editForm.leadTimeDays === undefined ? '' : String(editForm.leadTimeDays)} onChange={e => setEditForm(f => ({ ...f, leadTimeDays: e.target.value }))} placeholder="0" />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>{t('supplier.fieldAvailability')}</label>
                  <select className="input" value={String(editForm.availabilityStatus)} onChange={e => setEditForm(f => ({ ...f, availabilityStatus: e.target.value }))}>
                    {AVAILABILITY_OPTIONS.map(a => <option key={a} value={a}>{t(`supplier.avail_${a}`)}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>{t('supplier.paymentTerms')}</label>
                  <input className="input" value={String(editForm.paymentTerms || '')} onChange={e => setEditForm(f => ({ ...f, paymentTerms: e.target.value }))} placeholder={t('supplier.paymentTermsPlaceholder')} />
                </div>
              </div>
              <div style={{ marginTop: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>{t('supplier.notes')}</label>
                <textarea className="input" rows={3} value={String(editForm.notes || '')} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} style={{ resize: 'vertical' }} />
              </div>

              {/* Specifications (read-only) */}
              {selectedProduct.masterProduct.specifications.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{t('supplier.masterSpecs')}</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: 13 }}>
                    {selectedProduct.masterProduct.specifications.map((spec, i) => (
                      <div key={i} style={{ display: 'contents' }}>
                        <div style={{ color: 'var(--text-secondary)' }}>{spec.label[localeKey]}</div>
                        <div style={{ fontWeight: 500 }}>{spec.value[localeKey]}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderTop: '1px solid var(--border-color, #e2e8f0)' }}>
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--color-error, #dc2626)' }}
                onClick={() => handleDeactivate(selectedProduct.id)}
              >
                {t('supplier.deactivateProduct')}
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost" onClick={() => setSelectedProduct(null)}>{t('common.cancel')}</button>
                <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
                  {saving ? '...' : t('supplier.saveProduct')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
