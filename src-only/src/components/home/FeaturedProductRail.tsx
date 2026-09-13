import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Product } from '../../types';
import { fetchProducts } from '../../data/catalog';
import { useLanguage } from '../../i18n/LanguageContext';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';
import ProductCard from '../ProductCard';
import SectionHeading from './SectionHeading';

type RailStatus = 'loading' | 'ready' | 'error';

const AUTOPLAY_MS = 2200;

function getPerView(): number {
  if (typeof window === 'undefined') return 4;
  const w = window.innerWidth;
  if (w >= 1080) return 4;
  if (w >= 760) return 3;
  if (w >= 480) return 2;
  return 1;
}

export default function FeaturedProductRail() {
  const { t } = useLanguage();
  const reducedMotion = usePrefersReducedMotion();

  const [products, setProducts] = useState<Product[]>([]);
  const [status, setStatus] = useState<RailStatus>('loading');
  const [pageIndex, setPageIndex] = useState(0);
  const [perView, setPerView] = useState(() => getPerView());
  const [autoplayOn, setAutoplayOn] = useState(() => !reducedMotion);
  const [hoverPaused, setHoverPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const maxPages = useMemo(
    () => Math.max(0, Math.ceil(products.length / perView) - 1),
    [products.length, perView],
  );

  const load = useCallback(async () => {
    setStatus('loading');
    const res = await fetchProducts({
      search: '',
      categoryId: null,
      brandId: null,
      availability: null,
      sortBy: 'newest',
      page: 1,
      pageSize: 12,
    });
    if (res.error && res.items.length === 0) {
      setStatus('error');
      return;
    }
    setProducts(res.items);
    setStatus('ready');
    setPageIndex(0);
  }, []);

  const next = useCallback(
    () => setPageIndex(p => (p >= maxPages ? 0 : p + 1)),
    [maxPages],
  );
  const prev = useCallback(
    () => setPageIndex(p => (p <= 0 ? maxPages : p - 1)),
    [maxPages],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onResize = () => setPerView(getPerView());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    setPageIndex(p => Math.min(p, maxPages));
  }, [maxPages]);

  useEffect(() => {
    if (!autoplayOn || hoverPaused || reducedMotion || status !== 'ready' || maxPages < 1) return;
    const timer = setInterval(next, AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [autoplayOn, hoverPaused, reducedMotion, status, next, maxPages]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 48) {
      if (dx < 0) next();
      else prev();
    }
    touchStartX.current = null;
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      next();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prev();
    }
  };

  return (
    <section
      className="section section-tight ee-featured"
      aria-roledescription="carousel"
      aria-label={t('home.featured.aria' as never)}
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
    >
      <div className="container">
        <SectionHeading
          eyebrow={t('home.featured.eyebrow' as never)}
          title={t('home.featured.title' as never)}
          subtitle={t('home.featured.subtitle' as never)}
          align="center"
          action={
            <Link to="/catalog" className="btn btn-outline btn-sm ee-featured-view">
              {t('home.featured.view' as never)}
              <ArrowGlyph />
            </Link>
          }
        />

        <div className="ee-rail" tabIndex={0} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {status === 'loading' && (
            <div className="ee-rail-track ee-rail-track-static" aria-hidden="true">
              {Array.from({ length: 4 }).map((_, i) => (
                <div className="ee-rail-item" key={i}>
                  <div className="ee-rail-skel" />
                </div>
              ))}
            </div>
          )}

          {status === 'error' && (
            <div className="ee-rail-error">
              <p>{t('catalog.loadFailed' as never)}</p>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void load()}>
                {t('catalog.retry' as never)}
              </button>
            </div>
          )}

          {status === 'ready' && products.length === 0 && (
            <div className="ee-rail-error">
              <p>{t('catalog.noResults' as never)}</p>
              <Link to="/catalog" className="btn btn-primary btn-sm">
                {t('home.featured.view' as never)}
              </Link>
            </div>
          )}

          {status === 'ready' && products.length > 0 && (
            <>
              <div
                className="ee-rail-motion"
                style={{ '--ee-index': pageIndex, '--ee-per-view': perView } as React.CSSProperties}
              >
                <div className="ee-rail-track">
                  {products.map(product => (
                    <div className="ee-rail-item" key={product.id}>
                      <ProductCard product={product} />
                    </div>
                  ))}
                </div>
                <div className="ee-rail-fade ee-rail-fade-start" aria-hidden="true" />
                <div className="ee-rail-fade ee-rail-fade-end" aria-hidden="true" />
              </div>

              <div className="ee-rail-controls">
                <button
                  type="button"
                  className="ee-rail-arrow"
                  onClick={prev}
                  aria-label={t('home.motion.prev' as never)}
                >
                  <Chevron dir="prev" />
                </button>

                <div className="ee-rail-dots">
                  {Array.from({ length: maxPages + 1 }).map((_, i) => (
                    <button
                      type="button"
                      key={i}
                      className={`ee-rail-dot ${i === pageIndex ? 'ee-rail-dot-active' : ''}`}
                      onClick={() => setPageIndex(i)}
                      aria-label={`${t('home.featured.aria' as never)} — ${i + 1}`}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  className="ee-rail-arrow"
                  onClick={next}
                  aria-label={t('home.motion.next' as never)}
                >
                  <Chevron dir="next" />
                </button>

                <button
                  type="button"
                  className="ee-motion-btn"
                  onClick={() => setAutoplayOn(v => !v)}
                  aria-pressed={!autoplayOn}
                  aria-label={autoplayOn ? t('home.motion.pause' as never) : t('home.motion.play' as never)}
                >
                  {autoplayOn ? <PauseGlyph /> : <PlayGlyph />}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function Chevron({ dir }: { dir: 'prev' | 'next' }) {
  return (
    <svg
      className="rtl-flip"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: dir === 'prev' ? 'rotate(180deg)' : 'none' }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function ArrowGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function PauseGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

function PlayGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}