import { Link } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';

/**
 * PlatformApplications — premium showcase of the SHANAN Mobile + Desktop experiences.
 * Two distinct compositions, both built on the existing SHANAN design system.
 *
 * Layout (desktop):
 *   Mobile section  → device LEFT  / content RIGHT
 *   Desktop section → content LEFT / device RIGHT
 *
 * Subtle "intelligent system" visual language: technical grid lines,
 * small structured data labels, monospace micro-labels.
 */
export default function PlatformApplications() {
  const { t } = useLanguage();

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
                  {/* Product cards (vertical list) */}
                  <div className="phone-app-list">
                    <div className="phone-app-product">
                      <div className="phone-app-product-img phone-app-product-img-bearings" />
                      <div className="phone-app-product-meta">
                        <span className="phone-app-product-name">{t('home.apps.product1Name')}</span>
                        <span className="phone-app-product-sku">SHN-SKU-00001</span>
                        <span className="phone-app-product-badge">{t('home.apps.badgeInStock')}</span>
                      </div>
                      <span className="phone-app-product-add">+</span>
                    </div>
                    <div className="phone-app-product">
                      <div className="phone-app-product-img phone-app-product-img-electrical" />
                      <div className="phone-app-product-meta">
                        <span className="phone-app-product-name">{t('home.apps.product2Name')}</span>
                        <span className="phone-app-product-sku">SHN-SKU-00002</span>
                        <span className="phone-app-product-badge phone-app-product-badge-warn">{t('home.apps.badgeLimited')}</span>
                      </div>
                      <span className="phone-app-product-add">+</span>
                    </div>
                    <div className="phone-app-product">
                      <div className="phone-app-product-img phone-app-product-img-tools" />
                      <div className="phone-app-product-meta">
                        <span className="phone-app-product-name">{t('home.apps.product3Name')}</span>
                        <span className="phone-app-product-sku">SHN-SKU-00003</span>
                        <span className="phone-app-product-badge">{t('home.apps.badgeInStock')}</span>
                      </div>
                      <span className="phone-app-product-add">+</span>
                    </div>
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
                      {/* Product grid */}
                      <div className="laptop-app-catalog">
                        <div className="laptop-catalog-header">
                          <span className="laptop-catalog-title">Fasteners</span>
                          <span className="laptop-catalog-count">48 products</span>
                        </div>
                        <div className="laptop-catalog-grid">
                          <div className="laptop-product-card">
                            <div className="laptop-product-img laptop-product-img-fasteners" />
                            <span className="laptop-product-name">Hex Bolt M10</span>
                            <span className="laptop-product-sku">SHN-SKU-00001</span>
                            <span className="laptop-product-badge">In Stock</span>
                          </div>
                          <div className="laptop-product-card">
                            <div className="laptop-product-img laptop-product-img-bearings" />
                            <span className="laptop-product-name">Bearing 6204</span>
                            <span className="laptop-product-sku">SHN-SKU-00002</span>
                            <span className="laptop-product-badge laptop-product-badge-warn">Limited</span>
                          </div>
                          <div className="laptop-product-card">
                            <div className="laptop-product-img laptop-product-img-electrical" />
                            <span className="laptop-product-name">Contactor 25A</span>
                            <span className="laptop-product-sku">SHN-SKU-00003</span>
                            <span className="laptop-product-badge">In Stock</span>
                          </div>
                          <div className="laptop-product-card">
                            <div className="laptop-product-img laptop-product-img-tools" />
                            <span className="laptop-product-name">Coupling 8mm</span>
                            <span className="laptop-product-sku">SHN-SKU-00004</span>
                            <span className="laptop-product-badge">In Stock</span>
                          </div>
                          <div className="laptop-product-card">
                            <div className="laptop-product-img laptop-product-img-fasteners" />
                            <span className="laptop-product-name">Washer M10</span>
                            <span className="laptop-product-sku">SHN-SKU-00005</span>
                            <span className="laptop-product-badge laptop-product-badge-info">On Request</span>
                          </div>
                          <div className="laptop-product-card">
                            <div className="laptop-product-img laptop-product-img-bearings" />
                            <span className="laptop-product-name">Bearing 6308</span>
                            <span className="laptop-product-sku">SHN-SKU-00006</span>
                            <span className="laptop-product-badge">In Stock</span>
                          </div>
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
