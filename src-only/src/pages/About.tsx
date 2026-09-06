import { useEffect, useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { fetchCatalogStats } from '../data/catalog';
import { ShieldIcon, UsersIcon, LightbulbIcon, StarIcon, DatabaseIcon, CartIcon } from '../components/icons';

export default function About() {
  const { t } = useLanguage();
  const [stats, setStats] = useState<{ products: string; categories: string; brands: string }>({
    products: '—',
    categories: '—',
    brands: '—',
  });

  useEffect(() => {
    fetchCatalogStats().then(s =>
      setStats({
        products: s.products > 0 ? s.products.toLocaleString('en-US') + '+' : '—',
        categories: s.categories > 0 ? s.categories.toLocaleString('en-US') + '+' : '—',
        brands: s.brands > 0 ? s.brands.toLocaleString('en-US') + '+' : '—',
      }),
    );
  }, []);

  const statCards = [
    { value: stats.products, label: t('home.statsProducts'), icon: <DatabaseIcon /> },
    { value: stats.categories, label: t('home.statsCategories'), icon: <ShieldIcon /> },
    { value: stats.brands, label: t('home.statsBrands'), icon: <StarIcon /> },
    { value: '—', label: t('home.statsRequests'), icon: <CartIcon /> },
  ];

  const values = [
    { icon: <StarIcon />, title: t('about.value1'), desc: t('about.value1Desc') },
    { icon: <UsersIcon />, title: t('about.value2'), desc: t('about.value2Desc') },
    { icon: <ShieldIcon />, title: t('about.value3'), desc: t('about.value3Desc') },
    { icon: <LightbulbIcon />, title: t('about.value4'), desc: t('about.value4Desc') },
  ];

  return (
    <div className="about-page">
      {/* Hero */}
      <section className="about-hero">
        <div className="container">
          <h1 className="page-title">{t('about.title')}</h1>
          <p className="page-subtitle" style={{ maxWidth: 720, margin: '0 auto' }}>
            {t('brand.tagline')}
          </p>
        </div>
      </section>

      <div className="container" style={{ padding: '0 0 48px' }}>
        <div className="placeholder-notice">{t('home.placeholderNotice')}</div>
      </div>

      {/* ============================================================
          SECTION 1 — OUR MISSION (image LEFT, content RIGHT)
          ============================================================ */}
      <section className="section section-tight">
        <div className="container">
          <div className="about-mv-block about-mv-block-mission">
            <div className="about-mv-image-wrap">
              <img
                src="/about-mission.jpg"
                alt={t('about.missionImgAlt')}
                className="about-mv-img"
                loading="lazy"
              />
            </div>
            <div className="about-mv-content">
              <span className="about-mv-eyebrow">{t('about.missionTitle')}</span>
              <h2 className="about-mv-title">{t('about.missionText')}</h2>
              <p className="about-mv-desc">{t('about.missionDesc')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
          SECTION 2 — OUR VISION (content LEFT, image RIGHT)
          ============================================================ */}
      <section className="section section-tight section-alt">
        <div className="container">
          <div className="about-mv-block about-mv-block-vision">
            <div className="about-mv-content">
              <span className="about-mv-eyebrow about-mv-eyebrow-accent">{t('about.visionTitle')}</span>
              <h2 className="about-mv-title">{t('about.visionText')}</h2>
              <p className="about-mv-desc">{t('about.visionDesc')}</p>
            </div>
            <div className="about-mv-image-wrap">
              <img
                src="/about-vision.jpg"
                alt={t('about.visionImgAlt')}
                className="about-mv-img"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
          SECTION 3 — PLATFORM BY THE NUMBERS
          ============================================================ */}
      <section className="section section-gray">
        <div className="container">
          <div className="section-header section-header-tight">
            <h2 className="section-title">{t('about.statsTitle')}</h2>
            <p className="section-subtitle">{t('about.statsIntro')}</p>
          </div>
          <div className="stats-grid">
            {statCards.map((stat, i) => (
              <div key={i} className="stat-card about-stat-card">
                <div className="about-stat-icon">{stat.icon}</div>
                <span className="stat-value">{stat.value}</span>
                <span className="stat-label">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================
          SECTION 4 — OUR VALUES
          ============================================================ */}
      <section className="section">
        <div className="container">
          <div className="section-header section-header-tight">
            <h2 className="section-title">{t('about.valuesTitle')}</h2>
          </div>
          <div className="values-grid">
            {values.map((value, i) => (
              <div key={i} className="value-card about-value-card">
                <div className="value-icon">{value.icon}</div>
                <h3 className="value-title">{value.title}</h3>
                <p className="about-value-desc">{value.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
