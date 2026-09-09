import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import type { TranslationKey } from '../i18n/translations';
import { LoadingState, EmptyState } from '../components/LoadingEmptyStates';
import Pagination from '../components/Pagination';

// ============================================================
// ProductsAdmin — Internal SHANAN staff page.
// Route: /admin/products  (ProtectedRoute requireInternal)
//
// Server/API-backed product management with search, filters,
// pagination, create/edit, and image upload.
// ============================================================

const API_URL = import.meta.env.VITE_API_URL || '';

interface ProductListItem {
  id: string;
  sku: string;
  productCode: string;
  slug: string;
  name: { en: string; ar: string };
  categoryId: string | null;
  brandId: string | null;
  manufacturer: string | null;
  availability: string;
  isSampleData: boolean;
  primaryImage: string | null;
  categoryName: { en: string; ar: string } | null;
  brandName: string | null;
  createdAt: string;
}

interface ProductDetail {
  id: string;
  sku: string;
  productCode: string;
  slug: string;
  name: { en: string; ar: string };
  description: { en: string; ar: string };
  categoryId: string | null;
  brandId: string | null;
  manufacturer: string | null;
  availability: string;
  isSampleData: boolean;
  images: any[];
  specifications: any[];
  technicalMetadata: any[];
  documents: any[];
  createdAt: string;
  updatedAt: string;
}

interface Category {
  id: string;
  slug: string;
  name: { en: string; ar: string };
  productCount?: number;
}

interface Brand {
  id: string;
  slug: string;
  name: string;
  productCount?: number;
}

interface ImageInfo {
  id: string;
  storageKey: string;
  publicUrl: string | null;
  filename: string;
  mimeType: string;
  fileSize: number | null;
  isPrimary: boolean;
  sortOrder: number;
  altEn: string | null;
  altAr: string | null;
}

const getAvailabilityOptions = (t: (k: TranslationKey) => string) => [
  { value: 'in_stock', label: t('products.availInStock') },
  { value: 'limited', label: t('products.availLimited') },
  { value: 'out_of_stock', label: t('products.availOutOfStock') },
  { value: 'on_request', label: t('products.availOnRequest') },
];

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }); }
  catch { return iso; }
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function ProductsAdmin() {
  const { t } = useLanguage();
  const { token } = useAuth();

  // List state
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [availability, setAvailability] = useState('');

  // Categories + brands for filter dropdowns
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);

  // Detail panel
  const [selectedProduct, setSelectedProduct] = useState<ProductDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Create/Edit form
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({
    id: '', sku: '', productCode: '', slug: '', nameEn: '', nameAr: '',
    descriptionEn: '', descriptionAr: '', categoryId: '', brandId: '',
    manufacturer: '', availability: 'in_stock',
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Image upload state
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Import state
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    status: string; total: number; created: number; updated: number; skipped: number; failed: number; errors: string[];
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importJobs, setImportJobs] = useState<any[]>([]);
  const [importJobsLoading, setImportJobsLoading] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  const authHeaders = {
    'Authorization': `Bearer ${token}`,
  };

  // Load categories and brands for filters
  useEffect(() => {
    fetch(`${API_URL}/api/categories`).then(r => r.json()).then(d => setCategories(d.categories || [])).catch(() => {});
    fetch(`${API_URL}/api/brands`).then(r => r.json()).then(d => setBrands(d.brands || [])).catch(() => {});
  }, []);

  // Load products
  const loadProducts = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      if (search) params.set('search', search);
      if (categoryId) params.set('categoryId', categoryId);
      if (brandId) params.set('brandId', brandId);
      if (availability) params.set('availability', availability);

      const res = await fetch(`${API_URL}/api/products?${params}`);
      if (res.status === 401 || res.status === 403) {
        setError(res.status === 401 ? t('products.errAuth') : t('products.errInternal'));
        setProducts([]);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setProducts(data.items || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('products.errLoadDefault'));
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [token, page, pageSize, search, categoryId, brandId, availability]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  // Load product detail
  const loadProductDetail = useCallback(async (productId: string) => {
    if (!token) return;
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await fetch(`${API_URL}/api/products/${productId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSelectedProduct(data.product);
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : t('products.loadDetailError'));
      setSelectedProduct(null);
    } finally {
      setDetailLoading(false);
    }
  }, [token]);

  // Handle create
  const handleCreate = () => {
    setEditing(false);
    setFormData({
      id: '', sku: '', productCode: '', slug: '', nameEn: '', nameAr: '',
      descriptionEn: '', descriptionAr: '', categoryId: '', brandId: '',
      manufacturer: '', availability: 'in_stock',
    });
    setShowForm(true);
    setFormError(null);
  };

  // Handle edit
  const handleEdit = (product: ProductDetail) => {
    setEditing(true);
    setFormData({
      id: product.id,
      sku: product.sku,
      productCode: product.productCode,
      slug: product.slug,
      nameEn: product.name.en,
      nameAr: product.name.ar || '',
      descriptionEn: product.description.en || '',
      descriptionAr: product.description.ar || '',
      categoryId: product.categoryId || '',
      brandId: product.brandId || '',
      manufacturer: product.manufacturer || '',
      availability: product.availability,
    });
    setShowForm(true);
    setFormError(null);
  };

  // Validate form before submission
  const validateProductForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!formData.sku.trim()) errors.sku = t('products.errSkuRequired');
    else if (!/^[A-Za-z0-9_-]+$/.test(formData.sku.trim())) errors.sku = t('products.errSkuFormat');
    if (!formData.productCode.trim()) errors.productCode = t('products.errProductCodeRequired');
    if (!formData.nameEn.trim()) errors.nameEn = t('products.errNameEnRequired');
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Save (create or edit)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setFormError(null);
    if (!validateProductForm()) { setSaving(false); return; }
    try {
      const body: Record<string, unknown> = {
        sku: formData.sku.trim(),
        productCode: formData.productCode.trim(),
        slug: formData.slug.trim() || undefined,
        nameEn: formData.nameEn.trim(),
        nameAr: formData.nameAr.trim() || null,
        descriptionEn: formData.descriptionEn.trim() || null,
        descriptionAr: formData.descriptionAr.trim() || null,
        categoryId: formData.categoryId || null,
        brandId: formData.brandId || null,
        manufacturer: formData.manufacturer.trim() || null,
        availability: formData.availability,
      };

      let res: Response;
      if (editing) {
        res = await fetch(`${API_URL}/api/admin/products/${formData.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch(`${API_URL}/api/admin/products`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify(body),
        });
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setShowForm(false);
      await loadProducts();
      if (editing && selectedProduct) {
        await loadProductDetail(selectedProduct.id);
      }
    } catch (e) {
      setFormError(e instanceof Error ? e.message : t('products.saveError'));
    } finally {
      setSaving(false);
    }
  };

  // Image upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !selectedProduct || !token) return;
    const file = e.target.files[0];
    setUploadingImage(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('isPrimary', String(selectedProduct.images?.length === 0));
      fd.append('sortOrder', String(selectedProduct.images?.length || 0));
      fd.append('altEn', `${selectedProduct.name.en} image`);

      const res = await fetch(`${API_URL}/api/admin/products/${selectedProduct.id}/images/upload`, {
        method: 'POST',
        headers: { ...authHeaders },
        body: fd,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      // Reload product detail to show new image
      await loadProductDetail(selectedProduct.id);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : t('products.uploadError'));
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Image delete
  const handleImageDelete = async (imageId: string) => {
    if (!selectedProduct || !token) return;
    if (!confirm(t('products.deleteImageConfirm'))) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/products/${selectedProduct.id}/images/${imageId}`, {
        method: 'DELETE',
        headers: { ...authHeaders },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      await loadProductDetail(selectedProduct.id);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : t('products.deleteImageError'));
    }
  };

  // --- CSV Import handlers ---
  const parseCsv = (text: string): Record<string, string>[] => {
    const allCells: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;
    for (let ci = 0; ci < text.length; ci++) {
      const ch = text[ci];
      if (inQuotes) {
        if (ch === '"') {
          if (ci + 1 < text.length && text[ci + 1] === '"') { field += '"'; ci++; } else { inQuotes = false; }
        } else { field += ch; }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === ',') { row.push(field); field = ''; }
        else if (ch === '\r') { row.push(field); field = ''; if (ci + 1 < text.length && text[ci + 1] === '\n') ci++; if (row.some(c => c !== '')) allCells.push(row); row = []; }
        else if (ch === '\n') { row.push(field); field = ''; if (row.some(c => c !== '')) allCells.push(row); row = []; }
        else { field += ch; }
      }
    }
    row.push(field);
    if (row.some(c => c !== '')) allCells.push(row);
    if (allCells.length < 2) return [];
    const headers = allCells[0].map(h => h.trim());
    return allCells.slice(1).map(cells => {
      const obj: Record<string, string> = {};
      for (let hi = 0; hi < headers.length; hi++) obj[headers[hi]] = (cells[hi] ?? '').trim();
      return obj;
    });
  };

  const mapCsvToProducts = (rows: Record<string, string>[]) => rows.map(row => ({
    sku: row.sku || row.SKU || row.product_sku || '',
    productCode: row.productCode || row.product_code || row.code || row.Code || '',
    nameEn: row.nameEn || row.name_en || row.NameEn || row['Name (EN)'] || '',
    nameAr: row.nameAr || row.name_ar || row.NameAr || row['Name (AR)'] || '',
    descriptionEn: row.descriptionEn || row.description_en || row.desc_en || row['Description (EN)'] || '',
    descriptionAr: row.descriptionAr || row.description_ar || row.desc_ar || row['Description (AR)'] || '',
    categoryId: row.categoryId || row.category_id || row.category || '',
    brandId: row.brandId || row.brand_id || row.brand || '',
    manufacturer: row.manufacturer || row.Manufacturer || '',
    availability: row.availability || row.Availability || 'in_stock',
  }));

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    setImporting(true);
    setImportResult(null);
    setImportError(null);
    try {
      const text = await file.text();
      const csvRows = parseCsv(text);
      if (csvRows.length === 0) throw new Error('CSV file is empty or has no data rows');
      const products = mapCsvToProducts(csvRows);
      const res = await fetch(`${API_URL}/api/admin/import/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ items: products }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const result = await res.json();
      setImportResult(result);
      await loadProducts();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
      if (importFileRef.current) importFileRef.current.value = '';
    }
  };

  const loadImportJobs = async () => {
    if (!token) return;
    setImportJobsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/import-jobs`, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setImportJobs(data.jobs || []);
      }
    } catch { /* ignore */ } finally {
      setImportJobsLoading(false);
    }
  };

  return (
    <div className="container" style={{ padding: '40px 0 64px' }}>
      {/* Page header */}
      <div className="page-header" style={{ marginBottom: 32 }}>
        <span className="admin-eyebrow">
          <span className="admin-eyebrow-dot" />
          {t('products.eyebrow')}
        </span>
        <h1 className="page-title">{t('products.title')}</h1>
        <p className="page-subtitle">{t('products.subtitle')}</p>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/admin/supply-requests" className="btn btn-ghost btn-sm">{t('nav.adminSupplyRequests')}</Link>
          <Link to="/admin/suppliers" className="btn btn-ghost btn-sm">{t('nav.adminSuppliers')}</Link>
          <Link to="/admin/agreements" className="btn btn-ghost btn-sm">{t('nav.adminAgreements')}</Link>
          <Link to="/admin/rfqs" className="btn btn-ghost btn-sm">{t('nav.adminRfqs')}</Link>
        </div>
      </div>

      <div className="admin-layout">
        {/* LIST */}
        <section className="admin-list-panel" aria-label={t('products.listTitle')}>
          <header className="admin-list-header">
            <h2 className="admin-list-title">
              {t('products.listTitle')} ({total})
            </h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={handleCreate}>
                {t('products.newProduct')}
              </button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => { setShowImport(!showImport); if (!showImport) loadImportJobs(); }}>
                {t('products.importButton')}
              </button>
            </div>
          </header>

          {/* Filters */}
          <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              className="form-input"
              placeholder={t('products.searchPlaceholder')}
              value={search}
              onChange={e => { setPage(1); setSearch(e.target.value); }}
              style={{ flex: '1 1 200px' }}
            />
            <select className="form-input" value={categoryId} onChange={e => { setPage(1); setCategoryId(e.target.value); }}>
              <option value="">{t('products.filterAllCategories')}</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name.en}</option>)}
            </select>
            <select className="form-input" value={brandId} onChange={e => { setPage(1); setBrandId(e.target.value); }}>
              <option value="">{t('products.filterAllBrands')}</option>
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select className="form-input" value={availability} onChange={e => { setPage(1); setAvailability(e.target.value); }}>
              <option value="">{t('products.filterAllAvailability')}</option>
              {getAvailabilityOptions(t).map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>

          {/* Import Panel */}
          {showImport && (
            <div style={{ marginBottom: 16, padding: 16, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fafafa' }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginTop: 0, marginBottom: 8 }}>{t('products.importTitle')}</h3>
              <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px' }}>{t('products.importFormatHint')}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <input ref={importFileRef} type="file" accept=".csv,text/csv" onChange={handleImportFile} style={{ display: 'none' }} />
                <button type="button" className="btn btn-primary btn-sm" onClick={() => importFileRef.current?.click()} disabled={importing}>
                  {importing ? t('products.importUploading') : t('products.importSelectFile')}
                </button>
                <span style={{ fontSize: 12, color: '#9ca3af' }}>{t('products.importDropHere')}</span>
              </div>

              {importError && (
                <div className="portal-error-banner" style={{ marginTop: 8 }}>{importError}</div>
              )}

              {importResult && (
                <div style={{ marginTop: 12, padding: 12, borderRadius: 6, background: importResult.status === 'completed' ? '#f0fdf4' : importResult.status === 'partial' ? '#fffbeb' : '#fef2f2', border: `1px solid ${importResult.status === 'completed' ? '#bbf7d0' : importResult.status === 'partial' ? '#fde68a' : '#fecaca'}` }}>
                  <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 8px' }}>
                    {importResult.status === 'completed' ? t('products.importSuccess') : importResult.status === 'partial' ? t('products.importPartial') : t('products.importFailed')}
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8, fontSize: 12 }}>
                    <div><span style={{ color: '#6b7280' }}>{t('products.importTotal')}:</span> {importResult.total}</div>
                    <div style={{ color: '#16a34a' }}><span>{t('products.importCreated')}:</span> {importResult.created}</div>
                    <div style={{ color: '#2563eb' }}><span>{t('products.importUpdated')}:</span> {importResult.updated}</div>
                    <div style={{ color: '#d97706' }}><span>{t('products.importSkipped')}:</span> {importResult.skipped}</div>
                    <div style={{ color: '#dc2626' }}><span>{t('products.importFailedCount')}:</span> {importResult.failed}</div>
                  </div>
                  {importResult.errors.length > 0 && (
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ fontSize: 12, color: '#dc2626', cursor: 'pointer' }}>{t('products.importErrors')} ({importResult.errors.length})</summary>
                      <ul style={{ fontSize: 11, color: '#6b7280', margin: '4px 0 0', paddingLeft: 16, maxHeight: 120, overflow: 'auto' }}>
                        {importResult.errors.slice(0, 20).map((err: string, i: number) => <li key={i}>{err}</li>)}
                        {importResult.errors.length > 20 && <li>…and {importResult.errors.length - 20} more</li>}
                      </ul>
                    </details>
                  )}
                </div>
              )}

              {importJobs.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <h4 style={{ fontSize: 12, fontWeight: 600, margin: '0 0 6px', color: '#6b7280' }}>{t('products.importHistory')}</h4>
                  <div style={{ maxHeight: 120, overflow: 'auto' }}>
                    <table style={{ fontSize: 11, width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                          <th style={{ textAlign: 'left', padding: '4px 6px', color: '#6b7280' }}>Type</th>
                          <th style={{ textAlign: 'left', padding: '4px 6px', color: '#6b7280' }}>Status</th>
                          <th style={{ textAlign: 'right', padding: '4px 6px', color: '#6b7280' }}>Total</th>
                          <th style={{ textAlign: 'right', padding: '4px 6px', color: '#16a34a' }}>Created</th>
                          <th style={{ textAlign: 'right', padding: '4px 6px', color: '#dc2626' }}>Failed</th>
                          <th style={{ textAlign: 'left', padding: '4px 6px', color: '#6b7280' }}>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importJobs.map((job: any) => (
                          <tr key={job.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '4px 6px' }}>{job.job_type}</td>
                            <td style={{ padding: '4px 6px' }}>
                              <span className={`badge ${job.status === 'completed' ? 'badge-success' : job.status === 'partial' ? 'badge-warning' : 'badge-neutral'}`}>{job.status}</span>
                            </td>
                            <td style={{ padding: '4px 6px', textAlign: 'right' }}>{job.total_rows}</td>
                            <td style={{ padding: '4px 6px', textAlign: 'right', color: '#16a34a' }}>{job.created_count}</td>
                            <td style={{ padding: '4px 6px', textAlign: 'right', color: '#dc2626' }}>{job.failed_count}</td>
                            <td style={{ padding: '4px 6px' }}>{formatDate(job.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {loading && <LoadingState type="card" count={3} />}

          {error && !loading && (
            <div className="admin-error-state" role="alert">
              <p className="admin-error-title">{t('products.loadProductsError')}</p>
              <p className="admin-error-detail">{error}</p>
              <button type="button" className="btn btn-outline btn-sm" onClick={loadProducts}>{t('products.retry')}</button>
            </div>
          )}

          {!loading && !error && products.length === 0 && (
            <EmptyState title={t('products.emptyTitle')} description={t('products.emptyDesc')} />
          )}

          {!loading && !error && products.length > 0 && (
            <>
              <ul className="admin-request-list">
                {products.map(p => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={`admin-request-row ${selectedProduct?.id === p.id ? 'admin-request-row-active' : ''}`}
                      onClick={() => loadProductDetail(p.id)}
                      aria-pressed={selectedProduct?.id === p.id}
                    >
                      <div className="admin-request-row-top">
                        <span className="admin-request-reference">{p.sku}</span>
                        {p.isSampleData && <span className="badge badge-neutral" style={{ fontSize: 10 }}>{t('products.sampleBadge')}</span>}
                      </div>
                      <div className="admin-request-row-mid">
                        <span className="admin-request-name">{p.name.en}</span>
                      </div>
                      <div className="admin-request-row-bot">
                        <span className="admin-request-location">
                          {p.brandName || '—'} · {p.categoryName?.en || '—'}
                        </span>
                        <span className="admin-request-date">{formatDate(p.createdAt)}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
              {totalPages > 1 && (
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  total={total}
                  pageSize={pageSize}
                  onPageChange={setPage}
                />
              )}
            </>
          )}
        </section>

        {/* DETAIL + FORM */}
        <section className="admin-detail-panel">
          {/* Create/Edit Form */}
          {showForm && (
            <article className="admin-detail-card" style={{ marginBottom: 16 }}>
              <header className="admin-detail-header">
                <div>
                  <h2 className="admin-detail-title">{editing ? t('products.editProduct') : t('products.newProduct')}</h2>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>×</button>
              </header>
              <form onSubmit={handleSave} style={{ padding: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <label>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>{t('products.fieldSku')}</span>
                    <input className="form-input" value={formData.sku} onChange={e => { setFormData({ ...formData, sku: e.target.value }); setFormErrors({}); }} required disabled={editing} pattern="[A-Za-z0-9_-]+" title={t('products.fieldSkuTitle')} />
                  {formErrors.sku && <span style={{ color: '#dc2626', fontSize: '12px', marginTop: '2px', display: 'block' }}>{formErrors.sku}</span>}
                  </label>
                  <label>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>{t('products.fieldProductCode')}</span>
                    <input className="form-input" value={formData.productCode} onChange={e => { setFormData({ ...formData, productCode: e.target.value }); setFormErrors({}); }} required disabled={editing} />
                  {formErrors.productCode && <span style={{ color: '#dc2626', fontSize: '12px', marginTop: '2px', display: 'block' }}>{formErrors.productCode}</span>}
                  </label>
                  <label>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>{t('products.fieldNameEn')}</span>
                    <input className="form-input" value={formData.nameEn} onChange={e => { setFormData({ ...formData, nameEn: e.target.value }); setFormErrors({}); }} required />
                  {formErrors.nameEn && <span style={{ color: '#dc2626', fontSize: '12px', marginTop: '2px', display: 'block' }}>{formErrors.nameEn}</span>}
                  </label>
                  <label>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>{t('products.fieldNameAr')}</span>
                    <input className="form-input" value={formData.nameAr} onChange={e => setFormData({ ...formData, nameAr: e.target.value })} dir="rtl" />
                  </label>
                  <label>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>{t('products.detailCategory')}</span>
                    <select className="form-input" value={formData.categoryId} onChange={e => setFormData({ ...formData, categoryId: e.target.value })}>
                      <option value="">—</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name.en}</option>)}
                    </select>
                  </label>
                  <label>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>{t('products.detailBrand')}</span>
                    <select className="form-input" value={formData.brandId} onChange={e => setFormData({ ...formData, brandId: e.target.value })}>
                      <option value="">—</option>
                      {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </label>
                  <label>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>{t('products.detailManufacturer')}</span>
                    <input className="form-input" value={formData.manufacturer} onChange={e => setFormData({ ...formData, manufacturer: e.target.value })} />
                  </label>
                  <label>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>{t('products.fieldAvailability')}</span>
                    <select className="form-input" value={formData.availability} onChange={e => setFormData({ ...formData, availability: e.target.value })}>
                      {getAvailabilityOptions(t).map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                    </select>
                  </label>
                </div>
                <label style={{ display: 'block', marginTop: 8 }}>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{t('products.fieldDescEn')}</span>
                  <textarea className="form-input" rows={2} value={formData.descriptionEn} onChange={e => setFormData({ ...formData, descriptionEn: e.target.value })} />
                </label>
                <label style={{ display: 'block', marginTop: 8 }}>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{t('products.fieldDescAr')}</span>
                  <textarea className="form-input" rows={2} value={formData.descriptionAr} onChange={e => setFormData({ ...formData, descriptionAr: e.target.value })} dir="rtl" />
                </label>
                {formError && <div className="portal-error-banner" style={{ marginTop: 8 }}>{formError}</div>}
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                    {saving ? t('products.saving') : t('products.save')}
                  </button>
                </div>
              </form>
            </article>
          )}

          {/* Product Detail */}
          {!showForm && (
            <>
              {!selectedProduct && !detailLoading && !detailError && (
                <div className="admin-detail-empty">
                  <p>{t('products.selectPrompt')}</p>
                </div>
              )}

              {detailLoading && <LoadingState type="detail" />}

              {detailError && !detailLoading && (
                <div className="admin-error-state" role="alert">
                  <p className="admin-error-title">{t('products.loadDetailError')}</p>
                  <p className="admin-error-detail">{detailError}</p>
                </div>
              )}

              {selectedProduct && !detailLoading && !detailError && (
                <article className="admin-detail-card">
                  <header className="admin-detail-header">
                    <div>
                      <span className="admin-detail-eyebrow">{selectedProduct.sku}</span>
                      <h3 className="admin-detail-title">{selectedProduct.name.en}</h3>
                      {selectedProduct.name.ar && <p style={{ fontSize: 14, color: '#6b7280' }} dir="rtl">{selectedProduct.name.ar}</p>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {selectedProduct.isSampleData && <span className="badge badge-neutral">{t('products.sampleBadge')}</span>}
                      <span className={`badge ${selectedProduct.availability === 'in_stock' ? 'badge-success' : 'badge-warning'}`}>
                        {getAvailabilityOptions(t).find(a => a.value === selectedProduct.availability)?.label || selectedProduct.availability}
                      </span>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => handleEdit(selectedProduct)}>{t('products.edit')}</button>
                    </div>
                  </header>

                  <div className="admin-detail-grid">
                    <div>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>{t('products.detailProductCode')}</span>
                      <div style={{ marginTop: 4, fontFamily: 'monospace' }}>{selectedProduct.productCode}</div>
                    </div>
                    <div>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>{t('products.detailSlug')}</span>
                      <div style={{ marginTop: 4, fontFamily: 'monospace' }}>{selectedProduct.slug}</div>
                    </div>
                    <div>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>{t('products.fieldCategory')}</span>
                      <div style={{ marginTop: 4 }}>{selectedProduct.categoryId || '—'}</div>
                    </div>
                    <div>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>{t('products.fieldBrand')}</span>
                      <div style={{ marginTop: 4 }}>{selectedProduct.brandId || '—'}</div>
                    </div>
                    <div>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>{t('products.fieldManufacturer')}</span>
                      <div style={{ marginTop: 4 }}>{selectedProduct.manufacturer || '—'}</div>
                    </div>
                    <div>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>{t('products.detailCreated')}</span>
                      <div style={{ marginTop: 4 }}>{formatDate(selectedProduct.createdAt)}</div>
                    </div>
                  </div>

                  {selectedProduct.description.en && (
                    <div style={{ marginTop: 16 }}>
                      <strong style={{ fontSize: 12, color: '#6b7280' }}>{t('products.detailDescEn')}</strong>
                      <p style={{ marginTop: 4 }}>{selectedProduct.description.en}</p>
                    </div>
                  )}
                  {selectedProduct.description.ar && (
                    <div style={{ marginTop: 8 }}>
                      <strong style={{ fontSize: 12, color: '#6b7280' }}>{t('products.detailDescAr')}</strong>
                      <p style={{ marginTop: 4 }} dir="rtl">{selectedProduct.description.ar}</p>
                    </div>
                  )}

                  {/* Images section */}
                  <div style={{ marginTop: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <h3 style={{ fontSize: 14, margin: 0 }}>{t('products.imagesTitle')} ({selectedProduct.images?.length || 0})</h3>
                      <div>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
                          onChange={handleImageUpload}
                          style={{ display: 'none' }}
                        />
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploadingImage}
                        >
                          {uploadingImage ? t('products.uploading') : t('products.uploadImage')}
                        </button>
                      </div>
                    </div>
                    {uploadError && <div className="portal-error-banner" style={{ marginBottom: 8 }}>{uploadError}</div>}
                    {(!selectedProduct.images || selectedProduct.images.length === 0) ? (
                      <p style={{ color: '#9ca3af', fontSize: 13 }}>{t('products.noImages')}</p>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12 }}>
                        {selectedProduct.images.map((img: any) => (
                          <div key={img.id} style={{ position: 'relative', border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
                            <img src={img.url} alt={img.alt?.en || ''} style={{ width: '100%', height: 100, objectFit: 'cover' }} />
                            {img.isPrimary && <span className="badge badge-success" style={{ position: 'absolute', top: 4, left: 4, fontSize: 10 }}>{t('products.primaryBadge')}</span>}
                            <div style={{ padding: 4, fontSize: 10, color: '#6b7280' }}>
                              {img.filename}
                              <br />
                              {formatBytes(img.fileSize || null)}
                              <br />
                              <button type="button" onClick={() => handleImageDelete(img.id)} style={{ color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, padding: 0, marginTop: 2 }}>
                                {t('products.deleteImage')}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Specifications */}
                  {selectedProduct.specifications.length > 0 && (
                    <div style={{ marginTop: 24 }}>
                      <h3 style={{ fontSize: 14, margin: 0, marginBottom: 8 }}>{t('products.specsTitle')} ({selectedProduct.specifications.length})</h3>
                      <table className="portal-items-table" style={{ fontSize: 13 }}>
                        <thead>
                          <tr>
                            <th>{t('products.specsLabel')}</th>
                            <th>{t('products.specsValue')}</th>
                            <th>{t('products.specsGroup')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedProduct.specifications.map((s: any) => (
                            <tr key={s.id}>
                              <td>{s.label?.en}</td>
                              <td>{s.value?.en}</td>
                              <td>{s.group?.en || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Technical Metadata */}
                  {selectedProduct.technicalMetadata.length > 0 && (
                    <div style={{ marginTop: 24 }}>
                      <h3 style={{ fontSize: 14, margin: 0, marginBottom: 8 }}>{t('products.techMetaTitle')} ({selectedProduct.technicalMetadata.length})</h3>
                      <table className="portal-items-table" style={{ fontSize: 13 }}>
                        <thead>
                          <tr>
                            <th>{t('products.techMetaKey')}</th>
                            <th>{t('products.techMetaValue')}</th>
                            <th>{t('products.techMetaUnit')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedProduct.technicalMetadata.map((m: any) => (
                            <tr key={m.id}>
                              <td>{m.key?.en}</td>
                              <td>{m.value}</td>
                              <td>{m.unit || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </article>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
