import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { fetchProducts } from '../data/catalog';
import type { Product } from '../types';

/**
 * PlatformApplications — premium showcase of the SHANAN Mobile + Desktop experiences.
 * Two distinct compositions, both built on the existing SHANAN design system.
 *
 * The product rows inside the device mockups are populated with REAL products
 * from the production catalog API (newest first). When the API is unreachable
 * the showcase falls back to empty branded tiles — no mock product names/SKUs.
 *
 * Layout (desktop):
 *   Mobile section  → device LEFT  / content RIGHT
 *   Desktop section → content LEFT / device RIGHT
 *
 * Subtle "intelligent system" visual language: technical grid lines,
 * small structured data labels, monospace micro-labels.
 */

type Availability = Product['availability'];

interface MockupItem {
  id?: string;
  name?: string;
  sku?: string;
  image?: string | null;
  slug?: string;
  availability?: Availability;
}

const PHONE_SLUGS = ['bearings', 'electrical', 'tools'];
const LAPTOP_SLUGS = ['fasteners', 'bearings', 'electrical', 'tools', 'fasteners', 'bearings'];

function phoneThumbClass(slug?: string): string {
  if (slug === 'bearings') return 'phone-app-product-img-bearings';
  if (slug === 'electrical') return 'phone-app-product-img-electrical';
  return 'phone-app-product-img-tools';
}

function laptopThumbClass(slug?: string): string {
  if (slug === 'fasteners') return 'laptop-product-img-fasteners';
  if (slug === 'bearings') return 'laptop-product-img-bearings';
  if (slug === 'electrical') return 'laptop-product-img-electrical';
  return 'laptop-product-img-tools';
}

function resolveImageUrl(raw?: string | null): string | null {
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = import.meta.env.VITE_API_URL || '';
  return base + (raw.startsWith('/') ? raw : '/' + raw);
}

export default function PlatformApplications() {
  const { t, locale } = useLanguage();

  const [phoneItems, setPhoneItems] = useState<MockupItem[]>(() =>
    PHONE_SLUGS.map(slug => ({ slug, image: null, name: undefined, sku: undefined, availability: undefined })),
  );
  const [laptopItems, setLaptopItems] = useState<MockupItem[]>(() =>
    LAPTOP_SLUGS.map(slug => ({ slug, image: null, name: undefined, sku: undefined, availability: undefined })),
  );

  useEffect(() => {
    let cancelled = false;
    fetchProducts({ search: '', categoryId: null, brandId: null, availability: null, sortBy: 'newest', page: 1, pageSize: 9 })
      .then(result => {
        if (cancelled) return;
        const products = result.items;
        const toPhone = (i: number): MockupItem => {
          const p = products[i];
          if (!p) return { slug: PHONE_SLUGS[i], image: null, availability: undefined };
          return {
            id: p.id,
            name: p.name[locale],
            sku: p.sku,
            slug: p.category?.slug ?? p.categoryId ?? PHONE_SLUGS[i],
            image: resolveImageUrl(p.primaryImage || p.images?.[0]?.url),
            availability: p.availability,
          };
        };
        const toLaptop = (i: number): MockupItem => {
          const p = products[i];
          if (!p) return { slug: LAPTOP_SLUGS[i], image: null, availability: undefined };
          return {
            id: p.id,
            name: p.name[locale],
            sku: p.sku,
            slug: p.category?.slug ?? p.categoryId ?? LAPTOP_SLUGS[i],
            image: resolveImageUrl(p.primaryImage || p.images?.[0]?.url),
            availability: p.availability,
          };
        };
        setPhoneItems(PHONE_SLUGS.map((_, i) => toPhone(i)));
        setLaptopItems(LAPTOP_SLUGS.map((_, i) => toLaptop(i)));
      })
      .catch(() => {
        if (cancelled) return;
        setPhoneItems(PHONE_SLUGS.map(slug => ({ slug, image: null, availability: undefined })));
        setLaptopItems(LAPTOP_SLUGS.map(slug => ({ slug, image: null, availability: undefined })));
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const availLabel = (av: Availability | undefined): string => {
    switch (av) {
      case 'in_stock':
        return t('catalog.avail.in_stock');
      case 'limited':
        return t('catalog.avail.limited');
      case 'out_of_stock':
        return t('catalog.avail.out_of_stock');
      case 'on_request':
        return t('catalog.avail.on_request');
      default:
        return '';
    }
  };

  const phoneBadgeClass = (av: Availability | undefined): string =>
    av === 'limited' || av === 'out_of_stock' ? ' phone-app-product-badge-warn' : '';

  const laptopBadgeClass = (av: Availability | undefined): string => {
    if (av === 'limited' || av === 'out_of_stock') return ' laptop-product-badge-warn';
    if (av === 'on_request') return ' laptop-product-badge-info';
    return '';
  };

  const mobileFeatures = [
    t('home.apps.mobileFeature1'),
    t('home.apps.mobileFeature2'),
    t('home.apps.mobileFeature3'),
    t('home.apps.mobileFeature4'),
  ];

  const desktopFeatures = [
    t('home.apps.desktopFeature1'),
    t('home.apps.desktopFeature2'),
    t('home.apps.desktopFeature3'),
    t('home.apps.desktopFeature4'),
  ];

  return (
    <section className="platform-apps section section-tight section-alt" aria-label="SHANAN Platform Applications">
      <div className="container">
        {/* Section header */}
        <div className="section-header section-header-tight platform-apps-header">
          <span className="platform-apps-eyebrow">
            <span className="platform-apps-eyebrow-dot" />
            {t('home.apps.eyebrow')}
          </span>
          <h2 className="section-title">{t('home.apps.title')}</h2>
          <p className="section-subtitle">{t('home.apps.subtitle')}</p>
        </div>

        {/* ============================================================
            SECTION 1 — SHANAN MOBILE APPLICATION
            Composition: device LEFT / content RIGHT
        ============================================================ */}
        <div className="app-showcase app-showcase-mobile">
          {/* Mobile device mockup */}
          <div className="app-showcase-device app-showcase-device-mobile" aria-hidden="true">
            <div className="device-frame device-frame-phone">
              {/* Subtle technical grid backdrop */}
              <div className="device-tech-grid" />
              {/* Floating system labels */}
              <span className="tech-chip tech-chip-1">SYSTEM / READY</span>
              <span className="tech-chip tech-chip-2">DATA / STRUCTURED</span>

              <div className="phone-bezel">
                <div className="phone-notch" />
                <div className="phone-screen">
                  {/* Status bar */}
                  <div className="phone-status">
                    <span className="phone-status-time">9:41</span>
                    <span className="phone-status-icons">
                      <span className="phone-status-signal" />
                      <span className="phone-status-wifi" />
                      <span className="phone-status-battery" />
                    </span>
                  </div>
                  {/* App header */}
                  <div className="phone-app-header">
                    <img src="/shanan-logo.png" alt="" className="phone-app-logo" width="18" height="18" />
                    <span className="phone-app-name">SHANAN</span>
                    <span className="phone-app-cart">
                      <span className="phone-app-cart-dot">2</span>
                    </span>
                  </div>
                  {/* Search */}
                  <div className="phone-app-search">
                    <span className="phone-app-search-icon" />
                    <span className="phone-app-search-text">{t('home.apps.phoneSearchPlaceholder')}</span>
                  </div>
                  {/* Category chips */}
                  <div className="phone-app-cats">
                    <span className="phone-app-cat phone-app-cat-active">{t('home.apps.catAll')}</span>
                    <span className="phone-app-cat">{t('home.apps.catFasteners')}</span>
                    <span className="phone-app-cat">{t('home.apps.catTools')}</span>
                  </div>
                  {/* Product cards (vertical list) — live catalog data */}
                  <div className="phone-app-list">
                    {phoneItems.map((item, i) => (
                      <div className="phone-app-product" key={item.id ?? `phone-${i}`}>
                        <div className={`phone-app-product-img ${phoneThumbClass(item.slug)}`}>
                          {item.image && (
                            <img src={item.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
                          )}
                        </div>
                        <div className="phone-app-product-meta">
                          {item.name && <span className="phone-app-product-name">{item.name}</span>}
                          {item.sku && <span className="phone-app-product-sku">{item.sku}</span>}
                          {item.availability && (
                            <span className={`phone-app-product-badge${phoneBadgeClass(item.availability)}`}>{availLabel(item.availability)}</span>
                          )}
                        </div>
                        <span className="phone-app-product-add">+</span>
                      </div>
                    ))}
                  </div>
                  {/* Tab bar */}
                  <div className="phone-app-tabbar">
                    <span className="phone-app-tab phone-app-tab-active" />
                    <span className="phone-app-tab" />
                    <span className="phone-app-tab" />
                    <span className="phone-app-tab" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile content panel */}
          <div className="app-showcase-content app-showcase-content-mobile">
            <span className="app-eyebrow">{t('home.apps.mobileEyebrow')}</span>
            <h3 className="app-title">{t('home.apps.mobileTitle')}</h3>
            <p className="app-desc">{t('home.apps.mobileDesc')}</p>

            <ul className="app-features">
              {mobileFeatures.map((f, i) => (
                <li key={i} className="app-feature">
                  <span className="app-feature-marker" />
                  <span className="app-feature-text">{f}</span>
                </li>
              ))}
            </ul>

            <div className="app-actions">
              <Link to="/catalog" className="btn btn-primary">{t('home.apps.mobileCta')}</Link>
              <Link to="/supply-request" className="btn btn-outline">{t('home.apps.supplyCta')}</Link>
            </div>

            <div className="app-meta-row">
              <span className="app-meta-tag">SPEC / INDEXED</span>
              <span className="app-meta-tag">WORKFLOW / CONNECTED</span>
            </div>
          </div>
        </div>

        {/* ============================================================
            SECTION 2 — SHANAN DESKTOP / LAPTOP APPLICATION
            Composition: content LEFT / device RIGHT
        ============================================================ */}
        <div className="app-showcase app-showcase-desktop">
          {/* Desktop content panel */}
          <div className="app-showcase-content app-showcase-content-desktop">
            <span className="app-eyebrow app-eyebrow-accent">{t('home.apps.desktopEyebrow')}</span>
            <h3 className="app-title">{t('home.apps.desktopTitle')}</h3>
            <p className="app-desc">{t('home.apps.desktopDesc')}</p>

            <ul className="app-features">
              {desktopFeatures.map((f, i) => (
                <li key={i} className="app-feature">
                  <span className="app-feature-marker" />
                  <span className="app-feature-text">{f}</span>
                </li>
              ))}
            </ul>

            <div className="app-actions">
              <Link to="/catalog" className="btn btn-primary">{t('home.apps.desktopCta')}</Link>
              <Link to="/supply-request" className="btn btn-outline">{t('home.apps.supplyCta')}</Link>
            </div>

            <div className="app-meta-row">
              <span className="app-meta-tag">CATALOG / STRUCTURED</span>
              <span className="app-meta-tag">PROCUREMENT / READY</span>
            </div>
          </div>

          {/* Laptop / browser mockup */}
          <div className="app-showcase-device app-showcase-device-desktop" aria-hidden="true">
            <div className="device-frame device-frame-laptop">
              {/* Subtle technical grid backdrop */}
              <div className="device-tech-grid device-tech-grid-wide" />
              {/* Floating system labels */}
              <span className="tech-chip tech-chip-3">SYSTEM / READY</span>
              <span className="tech-chip tech-chip-4">SPEC / INDEXED</span>

              {/* Laptop lid + screen */}
              <div className="laptop-lid">
                <div className="laptop-screen">
                  {/* Browser bar */}
                  <div className="laptop-browser-bar">
                    <span className="laptop-dot laptop-dot-red" />
                    <span className="laptop-dot laptop-dot-yellow" />
                    <span className="laptop-dot laptop-dot-green" />
                    <span className="laptop-url-bar">shanan-platform · /catalog</span>
                  </div>
                  {/* App body */}
                  <div className="laptop-app-body">
                    {/* Top nav row */}
                    <div className="laptop-app-nav">
                      <div className="laptop-app-brand">
                        <img src="/shanan-logo.png" alt="" className="laptop-app-logo" width="16" height="16" />
                        <span className="laptop-app-name">SHANAN</span>
                      </div>
                      <div className="laptop-app-navlinks">
                        <span className="laptop-app-navlink laptop-app-navlink-active">Catalog</span>
                        <span className="laptop-app-navlink">Categories</span>
                        <span className="laptop-app-navlink">Brands</span>
                        <span className="laptop-app-navlink">Supply</span>
                      </div>
                      <div className="laptop-app-search">
                        <span className="laptop-app-search-icon" />
                        <span className="laptop-app-search-text">Search products, SKU…</span>
                      </div>
                      <div className="laptop-app-cart">
                        <span className="laptop-app-cart-badge">2</span>
                      </div>
                    </div>
                    {/* Main content split */}
                    <div className="laptop-app-main">
                      {/* Sidebar */}
                      <aside className="laptop-app-sidebar">
                        <span className="laptop-sidebar-label">FILTERS</span>
                        <div className="laptop-sidebar-group">
                          <span className="laptop-sidebar-title">Category</span>
                          <span className="laptop-sidebar-item laptop-sidebar-item-active">Fasteners</span>
                          <span className="laptop-sidebar-item">Bearings</span>
                          <span className="laptop-sidebar-item">Power Trans.</span>
                          <span className="laptop-sidebar-item">Electrical</span>
                        </div>
                        <div className="laptop-sidebar-group">
                          <span className="laptop-sidebar-title">Availability</span>
                          <span className="laptop-sidebar-chip">In Stock</span>
                          <span className="laptop-sidebar-chip">Limited</span>
                        </div>
                      </aside>
                      {/* Product grid — live catalog data */}
                      <div className="laptop-app-catalog">
                        <div className="laptop-catalog-header">
                          <span className="laptop-catalog-title">Latest</span>
                          <span className="laptop-catalog-count">{laptopItems.filter(i => i.sku).length || '—'} products</span>
                        </div>
                        <div className="laptop-catalog-grid">
                          {laptopItems.map((item, i) => (
                            <div className="laptop-product-card" key={item.id ?? `laptop-${i}`}>
                              <div className={`laptop-product-img ${laptopThumbClass(item.slug)}`} style={{ position: 'relative', overflow: 'hidden' }}>
                                {item.image && (
                                  <img src={item.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
                                )}
                                {item.availability && (
                                  <span className={`laptop-product-badge${laptopBadgeClass(item.availability)}`}>{availLabel(item.availability)}</span>
                                )}
                              </div>
                              {item.name && <span className="laptop-product-name">{item.name}</span>}
                              {item.sku && <span className="laptop-product-sku">{item.sku}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {/* Laptop base / trackpad */}
              <div className="laptop-base">
                <div className="laptop-trackpad" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}