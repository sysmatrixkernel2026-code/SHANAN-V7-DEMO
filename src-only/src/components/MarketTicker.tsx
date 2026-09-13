import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { usePrefersReducedMotion } from './home/usePrefersReducedMotion';
import { fetchProducts, fetchCategoriesFromApi, fetchBrandsFromApi } from '../data/catalog';
import { getLocalizedText } from '../i18n/localization';
import type { Product } from '../types';

// ------------------------------------------------------------------
// SHANAN LIVE ticker — real, continuous marquee.
//
// Content comes ONLY from the production API (products, prices when
// available, availability, catalog stats). If a content type has no
// real data it is omitted — we never invent items to fill the track.
// The marquee duplicates the item set into two identical halves and
// translates by -50%, which yields a perfect seamless loop. Duration
// is measured from the real track width so the speed (px/s) stays
// constant regardless of how many items exist.
// ------------------------------------------------------------------

const SPEED_PX_PER_SEC = 60;
const MIN_DURATION_SEC = 8;

type TickerKind = 'product' | 'price' | 'stock' | 'category' | 'brand' | 'catalog';

interface BuiltItem {
  key: string;
  kind: TickerKind;
  label: string;
  text: string;
  route?: string;
  trend?: 'up' | 'down' | 'neutral';
}

const typeColors: Record<TickerKind, string> = {
  product: '#3A7CA5',
  price: '#E9A23B',
  stock: '#5FB87C',
  category: '#6CB6E3',
  brand: '#6CB6E3',
  catalog: '#D62828',
};

function formatSellPrice(product: Product): string {
  const price = product.sellPrice;
  if (price == null || price <= 0) return '';
  const num = price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${num} ${product.currency || 'JOD'}`;
}

export default function MarketTicker() {
  const { t, locale } = useLanguage();
  const isRtl = locale === 'ar';
  const reducedMotion = usePrefersReducedMotion();

  const [products, setProducts] = useState<Product[]>([]);
  const [catCount, setCatCount] = useState(0);
  const [brandCount, setBrandCount] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const [paused, setPaused] = useState(false); // explicit pause/play button
  const [hoverPaused, setHoverPaused] = useState(false);
  const [focusPaused, setFocusPaused] = useState(false);

  const trackRef = useRef<HTMLDivElement>(null);
  const [durationSec, setDurationSec] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [pres, cats, brands] = await Promise.all([
        fetchProducts({
          search: '',
          categoryId: null,
          brandId: null,
          availability: null,
          sortBy: 'newest',
          page: 1,
          pageSize: 18,
        }),
        fetchCategoriesFromApi(),
        fetchBrandsFromApi(),
      ]);
      if (cancelled) return;
      setProducts(pres.items.filter(p => p.name?.en));
      setCatCount(cats.length);
      setBrandCount(brands.length);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Measure the real half-track width so the marquee speed is constant.
  useEffect(() => {
    if (!loaded) return;
    const el = trackRef.current;
    const update = () => {
      const half = (el?.scrollWidth ?? 0) / 2;
      if (half > 0) setDurationSec(Math.max(MIN_DURATION_SEC, Math.round(half / SPEED_PX_PER_SEC)));
    };
    update();
    const ro = new ResizeObserver(update);
    if (el) ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [loaded]);

  // Display list is derived from the raw catalog data per locale, so a
  // language switch re-renders the identical marquee in the right text.
  const display = useMemo<BuiltItem[]>(() => {
    if (!loaded) return [];
    const list: BuiltItem[] = [];

    const statText = `${products.length}+ ${t('home.live.statProducts')} · ${catCount} ${t('home.live.statCategories')} · ${brandCount} ${t('home.live.statBrands')}`;
    list.push({
      key: 'catalog-stat',
      kind: 'catalog',
      label: t('home.live.catalog'),
      text: statText,
    });

    for (const p of products) {
      const name = getLocalizedText(p.name, locale) || p.sku;
      const price = formatSellPrice(p);

      list.push({
        key: `product-${p.id}`,
        kind: 'product',
        label: t('home.live.new'),
        text: name,
        route: `/product/${p.id}`,
      });

      if (price) {
        list.push({
          key: `price-${p.id}`,
          kind: 'price',
          label: t('home.live.price'),
          text: `${name} — ${price}`,
          route: `/product/${p.id}`,
          trend: 'up',
        });
      }

      if (p.availability === 'in_stock' || p.availability === 'limited') {
        const avail =
          p.availability === 'in_stock' ? t('catalog.avail.in_stock') : t('catalog.avail.limited');
        list.push({
          key: `stock-${p.id}`,
          kind: 'stock',
          label: t('home.live.stock'),
          text: `${name} — ${avail}`,
          route: `/product/${p.id}`,
        });
      }
    }

    return list;
  }, [loaded, t, locale, products, catCount, brandCount]);

  const frozen = reducedMotion || paused || hoverPaused || focusPaused;

  // No real content → no empty "LIVE" bar.
  if (!loaded || display.length === 0) return null;

  const renderItem = (item: BuiltItem, index: number) => {
    const color = typeColors[item.kind];
    const trend = item.trend ?? 'neutral';
    const inner = (
      <>
        <span className="ticker-label" style={{ color, borderColor: color }}>
          {item.label}
        </span>
        <span className="ticker-text">{item.text}</span>
        {trend === 'up' && <span className="ticker-trend ticker-trend-up">▲</span>}
        {trend === 'down' && <span className="ticker-trend ticker-trend-down">▼</span>}
      </>
    );

    return (
      <span className="ticker-item" key={`${item.key}-${index}`}>
        {item.route ? (
          <Link to={item.route} className="ticker-inner" tabIndex={-1}>
            {inner}
          </Link>
        ) : (
          <span className="ticker-inner">{inner}</span>
        )}
        <span className="ticker-sep" />
      </span>
    );
  };

  return (
    <div
      className={`shanan-live ${frozen ? 'shanan-live-frozen' : ''}`}
      role="region"
      aria-label={t('home.live.aria' as never)}
    >
      <div className="shanan-live-badge">
        <span className="shanan-live-dot" />
        <span className="shanan-live-text">
          <span className="shanan-live-word">{t('home.how.shananLabel' as never)}</span>
          <span className="shanan-live-live">{t('home.live.label' as never)}</span>
        </span>
      </div>
      <div
        className="shanan-live-viewport"
        onMouseEnter={() => setHoverPaused(true)}
        onMouseLeave={() => setHoverPaused(false)}
        onFocusCapture={() => setFocusPaused(true)}
        onBlurCapture={() => setFocusPaused(false)}
      >
        <div
          ref={trackRef}
          className="shanan-live-track"
          style={{
            animationDuration: durationSec > 0 ? `${durationSec}s` : undefined,
            animationDirection: isRtl ? 'reverse' : 'normal',
            animationPlayState: frozen ? 'paused' : 'running',
          }}
        >
          {[...display, ...display].map(renderItem)}
        </div>
      </div>
      <div className="shanan-live-actions">
        <button
          type="button"
          className={`shanan-live-pause ${paused ? 'shanan-live-pause-on' : ''}`}
          onClick={() => setPaused(p => !p)}
          aria-pressed={paused}
          aria-label={paused ? t('home.motion.play' as never) : t('home.motion.pause' as never)}
        >
          {paused ? <PlayGlyph /> : <PauseGlyph />}
        </button>
      </div>
    </div>
  );
}

function PauseGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

function PlayGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}