import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { getLocalizedText, hasLocalizedText } from '../i18n/localization';
import { fetchProducts, fetchCategoriesFromApi, fetchBrandsFromApi } from '../data/catalog';
import { trackEvent, ActivityEvents } from '../data/activity';
import type { Category, Brand } from '../types';
import type { Product, CatalogFilters } from '../types';
import ProductCard from '../components/ProductCard';
import Pagination from '../components/Pagination';
import { LoadingState, EmptyState, ErrorState } from '../components/LoadingEmptyStates';
import { FilterIcon, CloseIcon, SearchIcon, SearchEmptyIcon } from '../components/icons';

const AVAILABILITY_OPTIONS = [
  { value: 'in_stock', key: 'catalog.avail.in_stock' },
  { value: 'limited', key: 'catalog.avail.limited' },
  { value: 'out_of_stock', key: 'catalog.avail.out_of_stock' },
  { value: 'on_request', key: 'catalog.avail.on_request' },
] as const;

const SORT_OPTIONS = [
  { value: 'newest', key: 'catalog.sort.newest' },
  { value: 'name_asc', key: 'catalog.sort.name_asc' },
  { value: 'name_desc', key: 'catalog.sort.name_desc' },
  { value: 'sku_asc', key: 'catalog.sort.sku_asc' },
  { value: 'sku_desc', key: 'catalog.sort.sku_desc' },
] as const;

export default function Catalog() {
  const { t, locale } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialPage = parseInt(searchParams.get('page') ?? '1', 10);
  const [filters, setFilters] = useState<CatalogFilters>({
    search: searchParams.get('search') ?? '',
    categoryId: searchParams.get('category') ?? null,
    brandId: searchParams.get('brand') ?? null,
    availability: searchParams.get('availability') ?? null,
    sortBy: 'newest',
    page: Number.isFinite(initialPage) && initialPage >= 1 ? initialPage : 1,
    pageSize: 24,
  });

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Search input is debounced so typing does not fire one API call per keystroke.
  const [searchDraft, setSearchDraft] = useState(searchParams.get('search') ?? '');
  const searchTimer = useRef<number | null>(null);

  useEffect(() => {
    if (searchTimer.current !== null) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => {
      searchTimer.current = null;
      setFilters(prev => (prev.search === searchDraft ? prev : { ...prev, search: searchDraft, page: 1 }));
    }, 350);
    return () => {
      if (searchTimer.current !== null) window.clearTimeout(searchTimer.current);
    };
  }, [searchDraft]);

  // Keep filters in sync with the URL (header search, back/forward, deep links).
  useEffect(() => {
    const nextSearch = searchParams.get('search') ?? '';
    const nextCategoryId = searchParams.get('category') ?? null;
    const nextBrandId = searchParams.get('brand') ?? null;
    const nextAvailability = searchParams.get('availability') ?? null;
    const nextPage = parseInt(searchParams.get('page') ?? '1', 10);
    const page = Number.isFinite(nextPage) && nextPage >= 1 ? nextPage : 1;
    setSearchDraft(nextSearch);
    setFilters(prev =>
      prev.search === nextSearch &&
      prev.categoryId === nextCategoryId &&
      prev.brandId === nextBrandId &&
      prev.availability === nextAvailability &&
      prev.page === page
        ? prev
        : { ...prev, search: nextSearch, categoryId: nextCategoryId, brandId: nextBrandId, availability: nextAvailability, page },
    );
  }, [searchParams]);

  const topCategories = useMemo(() => {
    if (categories.length === 0) return [];
    return [...categories]
      .filter(c => (c.productCount ?? 0) > 0)
      .sort((a, b) => (b.productCount ?? 0) - (a.productCount ?? 0))
      .slice(0, 12);
  }, [categories]);

  const activeCategory = useMemo(() => {
    if (!filters.categoryId) return null;
    return categories.find(c => c.id === filters.categoryId) ?? null;
  }, [categories, filters.categoryId]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      if (filters.search.trim()) {
        trackEvent(ActivityEvents.PRODUCT_SEARCHED, { metadata: filters.search.slice(0, 100) });
      }
      const result = await fetchProducts(filters);
      if (result.error) {
        setProducts([]);
        setTotal(0);
        setLoadError(true);
      } else {
        setProducts(result.items);
        setTotal(result.total);
        setTotalPages(result.totalPages);
        // Reconcile when the API clamped the page (e.g. ?page=999 beyond the last page).
        if (result.page !== filters.page) {
          setFilters(prev => (prev.page === result.page ? prev : { ...prev, page: result.page }));
        }
      }
    } catch {
      setProducts([]);
      setTotal(0);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    trackEvent(ActivityEvents.CATALOG_VIEWED);
    fetchCategoriesFromApi().then(setCategories);
    fetchBrandsFromApi().then(setBrands);
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    const params: Record<string, string> = {};
    if (filters.search) params.search = filters.search;
    if (filters.categoryId) params.category = filters.categoryId;
    if (filters.brandId) params.brand = filters.brandId;
    if (filters.availability) params.availability = filters.availability;
    if (filters.page > 1) params.page = String(filters.page);
    setSearchParams(params, { replace: true });
  }, [filters, setSearchParams]);

  const updateFilter = <K extends keyof CatalogFilters>(key: K, value: CatalogFilters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value, page: key !== 'page' ? 1 : value as number }));
  };

  const clearFilters = () => {
    setSearchDraft('');
    setFilters({
      search: '',
      categoryId: null,
      brandId: null,
      availability: null,
      sortBy: 'newest',
      page: 1,
      pageSize: 24,
    });
  };

  const hasActiveFilters = filters.search || filters.categoryId || filters.brandId || filters.availability;
  const showHero = !hasActiveFilters && filters.page === 1;
  const showShowcase = showHero;
  const activeCategoryName = activeCategory ? getLocalizedText(activeCategory.name, locale) : null;
  const activeBrandName = brands.find(b => b.id === filters.brandId)?.name;

  return (
    <div className="catalog-page">
      {/* Hero Search Section */}
      {showHero && (
        <section className="catalog-hero">
          <div className="catalog-hero-inner">
            <h1 className="catalog-hero-title">{t('catalog.heroTitle')}</h1>
            <p className="catalog-hero-subtitle">{t('catalog.heroSubtitle')}</p>
            <form
              className="catalog-hero-search"
              role="search"
              onSubmit={e => { e.preventDefault(); }}
            >
              <SearchIcon />
              <input
                type="search"
                className="catalog-hero-search-input"
                placeholder={t('catalog.heroSearchPlaceholder')}
                value={searchDraft}
                onChange={e => setSearchDraft(e.target.value)}
                aria-label={t('nav.search')}
              />
            </form>
          </div>
        </section>
      )}

      <div className="catalog-container">
        {/* Category Showcase — visual cards with real product images */}
        {showShowcase && topCategories.length > 0 && (
          <section className="catalog-showcase-section">
            <div className="catalog-showcase-header">
              <h2 className="catalog-showcase-title">{t('catalog.browseCategories')}</h2>
              <span className="catalog-showcase-subtitle">{t('catalog.browseCategoriesSubtitle')}</span>
            </div>
            <div className="catalog-category-showcase">
              {topCategories.map(cat => (
                <button
                  key={cat.id}
                  className="catalog-showcase-card"
                  onClick={() => updateFilter('categoryId', cat.id)}
                  aria-label={`${getLocalizedText(cat.name, locale)} — ${cat.productCount} ${t('catalog.productCount')}`}
                >
                  <div className="catalog-showcase-card-img">
                    {cat.image ? (
                      <img
                        src={cat.image}
                        alt={getLocalizedText(cat.name, locale)}
                        loading="lazy"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <div className="catalog-showcase-card-fallback">
                        <CategoryFallbackIcon />
                      </div>
                    )}
                    <div className="catalog-showcase-card-overlay" />
                  </div>
                  <div className="catalog-showcase-card-body">
                    <span className="catalog-showcase-card-name">{getLocalizedText(cat.name, locale)}</span>
                    <span className="catalog-showcase-card-count">{cat.productCount} {t('catalog.productCount')}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Brand Architecture — horizontal scrollable rail */}
        {brands.length > 0 && (
          <section className="catalog-brand-rail-section">
            <div className="catalog-showcase-header">
              <h2 className="catalog-showcase-title">{t('catalog.ourBrands')}</h2>
              <span className="catalog-showcase-subtitle">{t('catalog.brandsSubtitle')}</span>
            </div>
            <div className="catalog-brand-rail">
              <button
                className={`catalog-brand-pill ${!filters.brandId ? 'catalog-brand-pill-active' : ''}`}
                onClick={() => updateFilter('brandId', null)}
              >
                <span className="catalog-brand-pill-icon">*</span>
                <span className="catalog-brand-pill-name">{t('catalog.allProducts')}</span>
              </button>
              {brands.map(brand => (
                <button
                  key={brand.id}
                  className={`catalog-brand-pill ${filters.brandId === brand.id ? 'catalog-brand-pill-active' : ''}`}
                  onClick={() => updateFilter('brandId', filters.brandId === brand.id ? null : brand.id)}
                >
                  <span className="catalog-brand-pill-icon">{brand.name.charAt(0)}</span>
                  <span className="catalog-brand-pill-name">{brand.name}</span>
                  <span className="catalog-brand-pill-count">{brand.productCount}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Category Context Banner — visible when browsing a specific category */}
        {activeCategory && (
          <section className="catalog-category-context">
            <div className="catalog-category-context-img">
              {activeCategory.image ? (
                <img
                  src={activeCategory.image}
                  alt={getLocalizedText(activeCategory.name, locale)}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <div className="catalog-category-context-fallback">
                  <CategoryFallbackIcon />
                </div>
              )}
            </div>
            <div className="catalog-category-context-info">
              <h2 className="catalog-category-context-name">{getLocalizedText(activeCategory.name, locale)}</h2>
              <span className="catalog-category-context-count">
                {!loading && (
                  <>{total.toLocaleString()} {t('catalog.results')}</>
                )}
              </span>
              {hasLocalizedText(activeCategory.description) && (
                <p className="catalog-category-context-desc">{getLocalizedText(activeCategory.description, locale)}</p>
              )}
            </div>
            <button
              className="catalog-category-context-close"
              onClick={() => updateFilter('categoryId', null)}
              aria-label={t('catalog.clearFilters')}
            >
              <CloseIcon />
              <span>{t('catalog.viewAllProducts')}</span>
            </button>
          </section>
        )}

        {/* Main Content Area */}
        <div className="catalog-layout">
          {/* Sidebar Filters */}
          <aside className={`catalog-sidebar ${showMobileFilters ? 'catalog-sidebar-open' : ''}`}>
            <div className="catalog-sidebar-header">
              <h2 className="catalog-sidebar-title">
                <FilterIcon />
                {t('catalog.filters')}
              </h2>
              <button className="mobile-filter-close" onClick={() => setShowMobileFilters(false)}>
                <CloseIcon />
              </button>
            </div>

            <div className="filter-group">
              <label className="filter-label">{t('catalog.filterCategory')}</label>
              <select
                className="form-select"
                value={filters.categoryId ?? ''}
                onChange={e => updateFilter('categoryId', e.target.value || null)}
              >
                <option value="">{t('catalog.allCategories')}</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{getLocalizedText(cat.name, locale)}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label className="filter-label">{t('catalog.filterBrand')}</label>
              <select
                className="form-select"
                value={filters.brandId ?? ''}
                onChange={e => updateFilter('brandId', e.target.value || null)}
              >
                <option value="">{t('catalog.allBrands')}</option>
                {brands.map(brand => (
                  <option key={brand.id} value={brand.id}>{brand.name}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label className="filter-label">{t('catalog.filterAvailability')}</label>
              <select
                className="form-select"
                value={filters.availability ?? ''}
                onChange={e => updateFilter('availability', e.target.value || null)}
              >
                <option value="">{t('catalog.allAvailability')}</option>
                {AVAILABILITY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{t(opt.key)}</option>
                ))}
              </select>
            </div>

            {hasActiveFilters && (
              <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
                {t('catalog.clearFilters')}
              </button>
            )}
          </aside>

          {/* Main content */}
          <div className="catalog-main">
            {/* Toolbar */}
            <div className="catalog-toolbar">
              <button
                className="btn btn-outline btn-sm mobile-filter-toggle"
                onClick={() => setShowMobileFilters(true)}
              >
                <FilterIcon />
                {t('catalog.filters')}
              </button>

              <div className="catalog-results-info">
                {!loading && (
                  <>
                    <span className="catalog-results-count">{total.toLocaleString()}</span>
                    <span className="catalog-results-label">{t('catalog.results')}</span>
                    {filters.brandId && activeBrandName && (
                      <> — {activeBrandName}</>
                    )}
                  </>
                )}
              </div>

              <form
                className="catalog-search"
                role="search"
                onSubmit={e => { e.preventDefault(); }}
              >
                <SearchIcon />
                <input
                  type="search"
                  className="catalog-search-input"
                  placeholder={t('catalog.searchPlaceholder')}
                  value={searchDraft}
                  onChange={e => setSearchDraft(e.target.value)}
                  aria-label={t('nav.search')}
                />
              </form>

              <div className="catalog-sort">
                <label className="catalog-sort-label">{t('catalog.sortBy')}</label>
                <select
                  className="form-select catalog-sort-select"
                  value={filters.sortBy}
                  onChange={e => updateFilter('sortBy', e.target.value as CatalogFilters['sortBy'])}
                >
                  {SORT_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{t(opt.key)}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Active filter chips */}
            {hasActiveFilters && (
              <div className="catalog-active-chips">
                {filters.brandId && (
                  <span className="catalog-chip">
                    {brands.find(b => b.id === filters.brandId)?.name ?? filters.brandId}
                    <button className="catalog-chip-remove" onClick={() => updateFilter('brandId', null)}>×</button>
                  </span>
                )}
                {filters.categoryId && (
                  <span className="catalog-chip">
                    {activeCategoryName ?? filters.categoryId}
                    <button className="catalog-chip-remove" onClick={() => updateFilter('categoryId', null)}>×</button>
                  </span>
                )}
                {filters.search && (
                  <span className="catalog-chip">
                    "{filters.search}"
                    <button className="catalog-chip-remove" onClick={() => setSearchDraft('')}>×</button>
                  </span>
                )}
                {filters.availability && (
                  <span className="catalog-chip">
                    {t(`catalog.avail.${filters.availability}` as any)}
                    <button className="catalog-chip-remove" onClick={() => updateFilter('availability', null)}>×</button>
                  </span>
                )}
                <button className="catalog-chip catalog-chip-clear" onClick={clearFilters}>
                  {t('catalog.clearFilters')}
                </button>
              </div>
            )}

            {/* Products */}
            {loading ? (
              <LoadingState count={24} />
            ) : loadError ? (
              <ErrorState
                title={t('catalog.loadFailed')}
                description={t('catalog.loadFailedDesc')}
                icon={<SearchEmptyIcon />}
                onRetry={() => loadProducts()}
                retryLabel={t('catalog.retry')}
              />
            ) : products.length === 0 ? (
              <EmptyState
                title={t('catalog.noResults')}
                description={t('catalog.noResultsDesc')}
                icon={<SearchEmptyIcon />}
                action={
                  hasActiveFilters ? (
                    <button className="btn btn-primary" onClick={clearFilters}>
                      {t('catalog.clearFilters')}
                    </button>
                  ) : undefined
                }
              />
            ) : (
              <>
                <div className="product-grid">
                  {products.map(product => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>
                <Pagination
                  page={filters.page}
                  totalPages={totalPages}
                  total={total}
                  pageSize={filters.pageSize}
                  onPageChange={p => updateFilter('page', p)}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CategoryFallbackIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.4">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}
