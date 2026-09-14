import { Link } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { useState, useEffect } from 'react';
import { fetchCategoriesFromApi, fetchCatalogStats } from '../data/catalog';
import type { Category } from '../types';
import { SearchIcon, DocumentIcon, CartIcon, DatabaseIcon, ArrowIcon } from '../components/icons';
import HeroShowcase from '../components/HeroShowcase';
import MarketTicker from '../components/MarketTicker';
import PlatformApplications from '../components/PlatformApplications';
import OfficialDeviceShowcase from '../components/OfficialDeviceShowcase';
import FeaturedProductRail from '../components/home/FeaturedProductRail';
import ProductStream from '../components/home/ProductStream';
import IndustrySectors from '../components/home/IndustrySectors';
import HowShananWorks from '../components/home/HowShananWorks';
import AIProcurement from '../components/home/AIProcurement';
import KnowledgeRail from '../components/home/KnowledgeRail';

function formatCount(value: number): string {
  return value > 0 ? value.toLocaleString('en-US') + '+' : '—';
}

export default function Home() {
  const { t, locale } = useLanguage();
  const [categories, setCategories] = useState<Category[]>([]);
  const [stats, setStats] = useState<{ products: string; categories: string; brands: string }>({
    products: '—',
    categories: '—',
    brands: '—',
  });

  useEffect(() => {
    fetchCategoriesFromApi().then(setCategories);
    fetchCatalogStats().then(s =>
      setStats({
        products: formatCount(s.products),
        categories: formatCount(s.categories),
        brands: formatCount(s.brands),
      }),
    );
  }, []);

  const features = [
    { icon: <SearchIcon />, title: t('home.feature1Title'), desc: t('home.feature1Desc') },
    { icon: <DocumentIcon />, title: t('home.feature2Title'), desc: t('home.feature2Desc') },
    { icon: <CartIcon />, title: t('home.feature3Title'), desc: t('home.feature3Desc') },
    { icon: <DatabaseIcon />, title: t('home.feature4Title'), desc: t('home.feature4Desc') },
  ];

  const offers = [
    {
      title: t('home.offer1Title'),
      desc: t('home.offer1Desc'),
      tag: t('home.offer1Tag'),
      image: 'https://images.pexels.com/photos/19911421/pexels-photo-19911421.jpeg?auto=compress&cs=tinysrgb&h=400&w=600',
      color: '#E9A23B',
    },
    {
      title: t('home.offer2Title'),
      desc: t('home.offer2Desc'),
      tag: t('home.offer2Tag'),
      image: 'https://images.pexels.com/photos/10290624/pexels-photo-10290624.jpeg?auto=compress&cs=tinysrgb&h=400&w=600',
      color: '#3A7CA5',
    },
    {
      title: t('home.offer3Title'),
      desc: t('home.offer3Desc'),
      tag: t('home.offer3Tag'),
      image: 'https://images.pexels.com/photos/17728787/pexels-photo-17728787.jpeg?auto=compress&cs=tinysrgb&h=400&w=600',
      color: '#5FB87C',
    },
  ];

  const supplierSteps = [
    { num: '01', text: t('home.supplierStep1') },
    { num: '02', text: t('home.supplierStep2') },
    { num: '03', text: t('home.supplierStep3') },
  ];

  return (
    <div className="home">
      {/* 01 — Cinematic Hero */}
      <HeroShowcase stats={stats} />

      {/* 02 — SHANAN LIVE */}
      <MarketTicker />

      {/* 03 — Industrial Capability: live platform data + introduction + categories */}
      <section className="home-stats">
        <div className="container">
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-value">{stats.products}</span>
              <span className="stat-label">{t('home.statsProducts')}</span>
              <span className="stat-sub">{t('home.heroCapabilityLabel')}</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{stats.categories}</span>
              <span className="stat-label">{t('home.statsCategories')}</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{stats.brands}</span>
              <span className="stat-label">{t('home.statsBrands')}</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">—</span>
              <span className="stat-label">{t('home.statsRequests')}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section section-tight">
        <div className="container">
          <div className="home-intro">
            <div className="home-intro-content">
              <span className="home-intro-badge">{t('brand.tagline')}</span>
              <h2 className="home-intro-title">{t('home.introTitle')}</h2>
              <p className="home-intro-subtitle">{t('home.introSubtitle')}</p>
              <p className="home-intro-text">{t('home.introText')}</p>
              <Link to="/about" className="btn btn-outline btn-lg">
                {t('home.introCta')}
                <ArrowIcon />
              </Link>
            </div>
            <div className="home-intro-visual">
              <img src="https://images.pexels.com/photos/34207359/pexels-photo-34207359.jpeg?auto=compress&cs=tinysrgb&h=500&w=700" alt="Industrial automation" className="home-intro-img" />
              <div className="home-intro-stat">
                <span className="home-intro-stat-value">{stats.products}</span>
                <span className="home-intro-stat-label">{t('home.statsProducts')}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container">
          <div className="section-header section-header-tight">
            <div>
              <h2 className="section-title">{t('home.categoriesTitle')}</h2>
              <p className="section-subtitle">{t('home.categoriesSubtitle')}</p>
            </div>
            <Link to="/categories" className="btn btn-outline">
              {t('home.categoriesCta')}
              <ArrowIcon />
            </Link>
          </div>
          <div className="categories-preview-grid">
            {categories.slice(0, 8).map(cat => (
              <Link key={cat.id} to={`/catalog?category=${cat.id}`} className="category-preview-card">
                <div className="category-preview-icon">
                  <CategoryIcon />
                </div>
                <h3 className="category-preview-name">{cat.name[locale]}</h3>
                <p className="category-preview-desc">{cat.description?.[locale] ?? '—'}</p>
                <span className="category-preview-dynamic">
                  <span className="category-preview-dot" />
                  {t('home.categoriesDynamic')}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 04 — Featured Products (real catalog rail) */}
      <FeaturedProductRail />

      {/* 04b — SHANAN Product Stream (independent live feed) */}
      <ProductStream />

      {/* 05 — Industry Sectors */}
      <IndustrySectors />

      {/* 06 — How SHANAN Works */}
      <HowShananWorks />

      {/* 07 — AI Procurement Experience (UI intake) */}
      <AIProcurement />

      {/* 08 — Knowledge, News, Projects & Events */}
      <KnowledgeRail />

      {/* 09 — Current Offers (commercial band) */}
      <section className="section section-tight">
        <div className="container">
          <div className="section-header section-header-tight">
            <div>
              <h2 className="section-title">{t('home.offersTitle')}</h2>
              <p className="section-subtitle">{t('home.offersSubtitle')}</p>
            </div>
            <Link to="/supply-request" className="btn btn-outline">
              {t('home.offersCta')}
              <ArrowIcon />
            </Link>
          </div>
          <div className="offers-grid">
            {offers.map((offer, i) => (
              <div key={i} className="offer-card">
                <div className="offer-card-img-wrap">
                  <img src={offer.image} alt="" className="offer-card-img" loading="lazy" />
                  <span className="offer-card-tag" style={{ background: offer.color }}>{offer.tag}</span>
                </div>
                <div className="offer-card-body">
                  <h3 className="offer-card-title">{offer.title}</h3>
                  <p className="offer-card-desc">{offer.desc}</p>
                  <Link to="/supply-request" className="offer-card-link">
                    {t('home.showcase.ctaSecondary')}
                    <ArrowIcon />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 10 — Platform Applications */}
      <PlatformApplications />

      {/* 11 — Official Device Showcase */}
      <OfficialDeviceShowcase />

      {/* 12 — Platform Value (Features) */}
      <section className="section section-tight section-alt">
        <div className="container">
          <div className="section-header section-header-tight">
            <h2 className="section-title">{t('home.featuresTitle')}</h2>
            <p className="section-subtitle">{t('home.featuresSubtitle')}</p>
          </div>
          <div className="features-grid">
            {features.map((feature, i) => (
              <div key={i} className="feature-card">
                <div className="feature-icon">{feature.icon}</div>
                <h3 className="feature-title">{feature.title}</h3>
                <p className="feature-desc">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 12b — Supplier / Procurement Preview */}
      <section className="section section-alt">
        <div className="container">
          <div className="supplier-preview">
            <div className="supplier-preview-content">
              <span className="supplier-preview-badge">{t('home.supplierTitle')}</span>
              <h2 className="supplier-preview-title">{t('home.supplierSubtitle')}</h2>
              <p className="supplier-preview-text">{t('home.supplierText')}</p>
              <Link to="/contact" className="btn btn-primary btn-lg">
                {t('home.supplierCta')}
                <ArrowIcon />
              </Link>
            </div>
            <div className="supplier-preview-steps">
              {supplierSteps.map((step, i) => (
                <div key={i} className="supplier-step">
                  <span className="supplier-step-num">{step.num}</span>
                  <span className="supplier-step-text">{step.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 13 — Final CTA */}
      <section className="home-cta">
        <div className="container">
          <div className="home-cta-inner">
            <h2 className="home-cta-title">{t('home.ctaTitle')}</h2>
            <p className="home-cta-subtitle">{t('home.ctaSubtitle')}</p>
            <Link to="/supply-request" className="btn btn-primary btn-lg">
              {t('home.ctaButton')}
              <ArrowIcon />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function CategoryIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}