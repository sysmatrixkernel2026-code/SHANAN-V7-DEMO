import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { getCategoriesWithCounts } from '../data/catalog';
import type { Category } from '../types';
import { ArrowIcon, SearchIcon } from '../components/icons';

const PAGE_SIZE = 24;

const CATEGORY_GRADIENTS = [
  'linear-gradient(135deg, #0B2545 0%, #13315C 100%)',
  'linear-gradient(135deg, #1a3a5c 0%, #0B2545 100%)',
  'linear-gradient(135deg, #0d2d4f 0%, #1a3a5c 100%)',
  'linear-gradient(135deg, #13315C 0%, #1e4a6e 100%)',
  'linear-gradient(135deg, #0B2545 0%, #0d2d4f 100%)',
  'linear-gradient(135deg, #162f4d 0%, #13315C 100%)',
  'linear-gradient(135deg, #0e3050 0%, #1a3a5c 100%)',
  'linear-gradient(135deg, #13315C 0%, #0B2545 100%)',
];

function getCategoryGradient(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  return CATEGORY_GRADIENTS[Math.abs(hash) % CATEGORY_GRADIENTS.length];
}

function CategoryCard({ cat, index }: { cat: Category; index: number }) {
  const { t, locale } = useLanguage();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.1, rootMargin: '40px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const count = cat.productCount ?? 0;
  const hasImage = !!cat.image;

  return (
    <div
      ref={ref}
      className={`category-page-card ${visible ? 'category-page-card-visible' : ''}`}
      style={{ animationDelay: `${(index % PAGE_SIZE) * 40}ms` }}
    >
      <Link to={`/catalog?category=${cat.id}`} className="category-page-card-link">
        <div className="category-page-card-visual" style={hasImage ? undefined : { background: getCategoryGradient(cat.id) }}>
          {hasImage ? (
            <img
              className="category-page-card-img"
              src={cat.image!}
              alt={cat.name[locale]}
              loading="lazy"
            />
          ) : (
            <div className="category-page-card-icon-wrap">
              <DefaultCategoryIcon />
            </div>
          )}
        </div>
        <div className="category-page-card-body">
          <h3 className="category-page-card-name">{cat.name[locale]}</h3>
          {cat.description?.[locale] && (
            <p className="category-page-card-desc">{cat.description[locale]}</p>
          )}
          <div className="category-page-card-footer">
            <span className="category-page-card-count">
              {count} {locale === 'ar' ? 'منتج' : 'products'}
            </span>
            <span className="category-page-card-arrow">
              <ArrowIcon />
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}

export default function Categories() {
  const { t, locale } = useLanguage();
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getCategoriesWithCounts().then(cats => {
      setCategories(cats);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return categories;
    const q = search.toLowerCase();
    return categories.filter(c =>
      c.name.en?.toLowerCase().includes(q) ||
      c.name.ar?.includes(search) ||
      c.id.toLowerCase().includes(q)
    );
  }, [categories, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search]);

  const activeCategories = categories.filter(c => (c.productCount ?? 0) > 0);
  const totalProducts = categories.reduce((sum, c) => sum + (c.productCount ?? 0), 0);

  return (
    <div className="categories-page">
      <div className="container">
        <div className="categories-page-header">
          <div className="categories-page-header-text">
            <h1 className="categories-page-title">{t('categories.title')}</h1>
            <p className="categories-page-subtitle">{t('categories.subtitle')}</p>
          </div>
          <div className="categories-page-stats">
            <span className="categories-page-stat">
              <strong>{activeCategories.length}</strong> {locale === 'ar' ? 'فئة نشطة' : 'active categories'}
            </span>
            <span className="categories-page-stat-divider" />
            <span className="categories-page-stat">
              <strong>{totalProducts.toLocaleString()}</strong> {locale === 'ar' ? 'منتج' : 'total products'}
            </span>
          </div>
        </div>

        <div className="categories-page-search">
          <SearchIcon />
          <input
            type="text"
            className="categories-page-search-input"
            placeholder={locale === 'ar' ? 'ابحث عن فئة…' : 'Search categories…'}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="categories-page-search-clear" onClick={() => setSearch('')}>✕</button>
          )}
        </div>

        {loading ? (
          <div className="categories-page-grid">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="category-page-card category-page-card-skeleton">
                <div className="category-page-card-visual skeleton" />
                <div className="category-page-card-body">
                  <div className="skeleton" style={{ height: 20, width: '70%', marginBottom: 8 }} />
                  <div className="skeleton" style={{ height: 14, width: '90%', marginBottom: 8 }} />
                  <div className="skeleton" style={{ height: 14, width: '40%' }} />
                </div>
              </div>
            ))}
          </div>
        ) : paged.length === 0 ? (
          <div className="categories-page-empty">
            <SearchEmptyIcon />
            <h3>{t('catalog.noResults')}</h3>
            <p>{t('catalog.noResultsDesc')}</p>
          </div>
        ) : (
          <>
            <div className="categories-page-grid">
              {paged.map((cat, idx) => (
                <CategoryCard key={cat.id} cat={cat} index={idx} />
              ))}
            </div>
            {totalPages > 1 && (
              <div className="categories-page-pagination">
                <button
                  className="pagination-btn"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  {t('catalog.prev')}
                </button>
                <span className="categories-page-pagination-info">
                  {t('catalog.page')} {page} {t('catalog.of')} {totalPages}
                </span>
                <button
                  className="pagination-btn"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  {t('catalog.next')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DefaultCategoryIcon() {
  return (
    <svg viewBox="0 0 48 48" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function SearchEmptyIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-gray-400)' }}>
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  );
}
