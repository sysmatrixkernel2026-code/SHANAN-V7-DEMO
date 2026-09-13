import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Locale, Product } from '../../types';
import type { TranslationKey } from '../../i18n/translations';
import { fetchCategoriesFromApi, fetchProducts } from '../../data/catalog';
import { useLanguage } from '../../i18n/LanguageContext';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';
import { getLocalizedText } from '../../i18n/localization';
import SectionHeading from './SectionHeading';

// ------------------------------------------------------------------
// SHANAN Product Stream — an independent live feed section.
//
// Data: real categories from /api/categories and real products from
// /api/products (never mock). Categories are visited in API order and
// only those with usable, image-bearing products are shown. The feed
// advances every 3s; incoming/outgoing panels crossfade+slide through
// two persistent layers (opacity/transform only — no layout
// animation, no reflow, no flicker). Hover, keyboard focus and the
// pause control freeze rotation; prefers-reduced-motion stops it.
// ------------------------------------------------------------------

const ROTATE_MS = 3000;
const MAX_POOL = 60;
const PER_CATEGORY = 6;
const TARGET_AHEAD = 5;

interface StreamCategory {
  id: string;
  name: { en: string; ar: string };
  productCount: number;
}

interface StreamItem {
  key: string;
  category: StreamCategory;
  product: Product;
}

interface PanelData {
  category: StreamCategory;
  product: Product;
}

function panelOf(item: StreamItem): PanelData {
  return { category: item.category, product: item.product };
}

function availabilityMeta(
  availability: string,
  t: (k: TranslationKey) => string,
): { label: string; cls: string } {
  switch (availability) {
    case 'in_stock':
      return { label: t('catalog.avail.in_stock'), cls: 'ps-avail-in' };
    case 'limited':
      return { label: t('catalog.avail.limited'), cls: 'ps-avail-limited' };
    case 'out_of_stock':
      return { label: t('catalog.avail.out_of_stock'), cls: 'ps-avail-out' };
    default:
      return { label: t('catalog.avail.on_request'), cls: 'ps-avail-request' };
  }
}

export default function ProductStream() {
  const { t, locale } = useLanguage();
  const reduced = usePrefersReducedMotion();

  const [status, setStatus] = useState<'idle' | 'empty' | 'ready'>('idle');
  const [items, setItems] = useState<StreamItem[]>([]);
  const [cursor, setCursor] = useState(0);
  const [autoplayOn, setAutoplayOn] = useState(() => !reduced);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [focusPaused, setFocusPaused] = useState(false);

  const [sideA, setSideA] = useState<PanelData | null>(null);
  const [sideB, setSideB] = useState<PanelData | null>(null);
  const [activeSide, setActiveSide] = useState<'a' | 'b'>('a');

  const itemsRef = useRef<StreamItem[]>([]);
  const cursorRef = useRef(0);
  const activeRef = useRef<'a' | 'b'>('a');
  const catsRef = useRef<StreamCategory[]>([]);
  const catIdxRef = useRef(0);
  const busyRef = useRef(false);
  const doneRef = useRef(false);
  const seededRef = useRef(false);

  const advance = useCallback((data: PanelData) => {
    const next = activeRef.current === 'a' ? 'b' : 'a';
    activeRef.current = next;
    if (next === 'b') setSideB(data);
    else setSideA(data);
    setActiveSide(next);
  }, []);

  const step = useCallback(
    (dir: 1 | -1) => {
      const len = itemsRef.current.length;
      if (len < 2) return;
      const nextIdx = (cursorRef.current + dir + len) % len;
      const next = itemsRef.current[nextIdx];
      if (!next) return;
      advance(panelOf(next));
      cursorRef.current = nextIdx;
      setCursor(nextIdx);
    },
    [advance],
  );

  // Sequentially build the rotation pool from real categories/products.
  const build = useCallback(async () => {
    if (busyRef.current || doneRef.current) return;
    busyRef.current = true;
    try {
      const cats = catsRef.current;
      if (cats.length === 0) return;
      while (itemsRef.current.length <= cursorRef.current + TARGET_AHEAD && itemsRef.current.length < MAX_POOL) {
        let attempts = 0;
        let placed = false;
        while (attempts < cats.length && !placed) {
          const cat = cats[catIdxRef.current % cats.length];
          catIdxRef.current += 1;
          attempts += 1;
          if (cat.productCount <= 0) continue;
          const res = await fetchProducts({
            search: '',
            categoryId: cat.id,
            brandId: null,
            availability: null,
            sortBy: 'newest',
            page: 1,
            pageSize: 100,
          });
          const usable = res.items
            .filter(
              p =>
                p &&
                p.name?.en &&
                p.availability &&
                p.primaryImage &&
                /^https?:\/\//i.test(p.primaryImage),
            )
            .slice(0, PER_CATEGORY);
          if (usable.length === 0) continue;
          const added: StreamItem[] = usable.map(p => ({
            key: `${cat.id}::${p.id}`,
            category: {
              id: cat.id,
              name: { en: cat.name.en, ar: cat.name.ar || cat.name.en },
              productCount: cat.productCount,
            },
            product: p,
          }));
          itemsRef.current.push(...added);
          setItems([...itemsRef.current]);
          placed = true;
        }
        if (!placed) {
          doneRef.current = true;
          break;
        }
      }
    } catch {
      // transient failure — the next attempt recovers
    } finally {
      busyRef.current = false;
    }
  }, []);

  // Load real categories once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cats = await fetchCategoriesFromApi();
        if (cancelled) return;
        const usable = cats.filter(c => (c.productCount ?? 0) > 0);
        catsRef.current = usable.map(c => ({
          id: c.id,
          name: { en: c.name?.en || c.slug, ar: c.name?.ar || c.name?.en || c.slug },
          productCount: typeof c.productCount === 'number' ? c.productCount : 0,
        }));
        if (catsRef.current.length === 0) {
          setStatus('empty');
          return;
        }
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('empty');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the pool topped up as we progress.
  useEffect(() => {
    if (status === 'ready') void build();
  }, [status, cursor, build]);

  // Seed the first panel once real data arrives (no placeholder content).
  useEffect(() => {
    if (status === 'ready' && items.length > 0 && !seededRef.current) {
      seededRef.current = true;
      const first = items[0];
      advance(panelOf(first));
    }
  }, [status, items, advance]);

  // 3-second rotation timer.
  useEffect(() => {
    if (status !== 'ready') return;
    if (reduced || !autoplayOn || hoverPaused || focusPaused) return;
    const id = setInterval(() => {
      const len = itemsRef.current.length;
      if (len < 2) return;
      const nextIdx = (cursorRef.current + 1) % len;
      const next = itemsRef.current[nextIdx];
      if (!next) return;
      advance(panelOf(next));
      cursorRef.current = nextIdx;
      setCursor(nextIdx);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [status, reduced, autoplayOn, hoverPaused, focusPaused, advance]);

  const poolLen = items.length;
  const current = activeSide === 'a' ? sideA : sideB;

  const nextCats = useMemo(() => {
    const out: { id: string; name: string }[] = [];
    if (poolLen < 2) return out;
    for (let i = 1; i <= 3; i++) {
      const it = items[(cursor + i) % poolLen];
      if (!it) continue;
      const name = getLocalizedText(it.category.name, locale);
      if (name && !out.some(o => o.id === it.category.id)) {
        out.push({ id: it.category.id, name });
      }
    }
    return out;
  }, [poolLen, items, cursor, locale]);

  // No real content → render nothing (never a fake/empty section).
  if (status !== 'ready' || poolLen === 0 || !current) return null;

  const liveLabel = t('home.live.label' as never);

  const renderProductLayer = (data: PanelData) => (
    <ProductStagePanel
      key={`${data.product.id}-${data.category.id}`}
      data={data}
      locale={locale}
      t={t}
    />
  );

  const catName = getLocalizedText(current.category.name, locale);

  return (
    <section
      className="ps-section"
      role="region"
      aria-label={t('home.stream.aria' as never)}
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
      onFocusCapture={() => setFocusPaused(true)}
      onBlurCapture={() => setFocusPaused(false)}
    >
      <div className="container">
        <SectionHeading
          eyebrow={t('home.stream.eyebrow' as never)}
          title={t('home.stream.title' as never)}
          subtitle={t('home.stream.subtitle' as never)}
          align="center"
          action={
            <Link to="/catalog" className="btn btn-outline">
              {t('home.stream.viewCatalog' as never)}
            </Link>
          }
        />

        <div className="ps-layout">
          {/* Category panel */}
          <div className="ps-cat">
            <div className="ps-cat-head">
              <span className="ps-live-pill">
                <span className="ps-live-dot" />
                {liveLabel}
              </span>
              <span className="ps-cat-count">
                {current.category.productCount.toLocaleString('en-US')} {t('home.stream.products' as never)}
              </span>
            </div>

            <span className="ps-cat-label">{t('home.stream.category' as never)}</span>
            <div className="ps-cat-name" title={catName}>
              {catName}
            </div>

            {nextCats.length > 0 && (
              <div className="ps-next-list">
                <span className="ps-next-label">{t('home.stream.next' as never)}</span>
                <div className="ps-next-chips">
                  {nextCats.map(cat => (
                    <Link key={cat.id} to={`/catalog?category=${cat.id}`} className="ps-next-chip">
                      {cat.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <Link to={`/catalog?category=${current.category.id}`} className="btn btn-outline btn-sm ps-cat-cta">
              {t('home.stream.viewCategory' as never)}
            </Link>
          </div>

          {/* Product stage (two persistent crossfading layers) */}
          <div className="ps-stage">
            <div className={`ps-layer ${activeSide === 'a' ? 'ps-layer-active' : ''}`} aria-hidden={activeSide !== 'a'}>
              {sideA && renderProductLayer(sideA)}
            </div>
            <div className={`ps-layer ${activeSide === 'b' ? 'ps-layer-active' : ''}`} aria-hidden={activeSide !== 'b'}>
              {sideB && renderProductLayer(sideB)}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="ps-controls">
          <div className="ps-counter">
            <span className="ps-counter-now">{String(cursor + 1).padStart(2, '0')}</span>
            <span className="ps-counter-of"> {t('home.stream.counter' as never)} </span>
            <span className="ps-counter-total">{poolLen}</span>
          </div>
          <div className="ps-control-btns">
            <button
              type="button"
              className="ps-btn"
              onClick={() => step(-1)}
              aria-label={t('home.stream.prev' as never)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <button
              type="button"
              className={`ps-btn ps-btn-play ${autoplayOn ? 'ps-btn-play-on' : ''}`}
              onClick={() => setAutoplayOn(v => !v)}
              aria-pressed={autoplayOn}
              aria-label={
                autoplayOn
                  ? (t('home.motion.pause' as never))
                  : (t('home.motion.play' as never))
              }
            >
              {autoplayOn ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
            <button
              type="button"
              className="ps-btn"
              onClick={() => step(1)}
              aria-label={t('home.stream.next' as never)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProductStagePanel({
  data,
  locale,
  t,
}: {
  data: PanelData;
  locale: Locale;
  t: (k: TranslationKey) => string;
}) {
  const { product, category } = data;
  const name = getLocalizedText(product.name, locale) || product.sku;
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => {
    setImgFailed(false);
  }, [product.primaryImage]);

  const price =
    product.sellPrice != null && product.sellPrice > 0
      ? product.sellPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : null;
  const currency = product.currency || 'JOD';
  const avail = availabilityMeta(product.availability ?? '', t);

  return (
    <div className="ps-card">
      <Link to={`/product/${product.id}`} className="ps-card-media" tabIndex={-1} aria-hidden="true">
        {!imgFailed ? (
          <img src={product.primaryImage} alt="" loading="lazy" className="ps-card-img" />
        ) : (
          <div className="ps-card-img ps-card-img-fallback">
            <span className="ps-card-fallback-text">{product.sku || name}</span>
          </div>
        )}
        {product.brandName && <span className="ps-card-brand">{product.brandName}</span>}
      </Link>
      <div className="ps-card-body">
        <span className={`ps-avail ${avail.cls}`}>
          <span className="ps-avail-dot" />
          {avail.label}
        </span>
        <h3 className="ps-card-name">
          <Link to={`/product/${product.id}`}>{name}</Link>
        </h3>
        <span className="ps-card-sku">{product.sku}</span>
        {price && (
          <div className="ps-card-price">
            <span className="ps-card-price-num">{price}</span>
            <span className="ps-card-price-cur">{currency}</span>
          </div>
        )}
        <div className="ps-card-actions">
          <Link to={`/product/${product.id}`} className="btn btn-primary btn-sm">
            {t('home.stream.viewProduct' as never)}
          </Link>
          <Link to={`/catalog?category=${category.id}`} className="btn btn-outline btn-sm">
            {t('home.stream.viewCategory' as never)}
          </Link>
        </div>
      </div>
    </div>
  );
}