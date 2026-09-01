import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { ArrowIcon } from './icons';

type SlideType = 'product' | 'video' | 'offer' | 'announce' | 'event';

interface Slide {
  id: string;
  type: SlideType;
  image: string;
  badgeKey: string;
  titleKey: string;
  descKey: string;
  ctaKey: string;
  ctaLink: string;
  secondaryKey?: string;
  secondaryLink?: string;
  extra?: { key: string; icon: 'calendar' | 'pin' | 'clock' }[];
}

const slides: Slide[] = [
  {
    id: 'product',
    type: 'product',
    image: 'https://images.pexels.com/photos/633850/machine-mill-industry-steam-633850.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    badgeKey: 'home.showcase.productBadge',
    titleKey: 'home.showcase.productTitle',
    descKey: 'home.showcase.productDesc',
    ctaKey: 'home.showcase.cta',
    ctaLink: '/catalog',
    secondaryKey: 'home.showcase.ctaSecondary',
    secondaryLink: '/supply-request',
  },
  {
    id: 'video',
    type: 'video',
    image: 'https://images.pexels.com/photos/10290624/pexels-photo-10290624.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    badgeKey: 'home.showcase.videoBadge',
    titleKey: 'home.showcase.videoTitle',
    descKey: 'home.showcase.videoDesc',
    ctaKey: 'home.showcase.cta',
    ctaLink: '/catalog',
    secondaryKey: 'home.showcase.ctaSecondary',
    secondaryLink: '/supply-request',
  },
  {
    id: 'offer',
    type: 'offer',
    image: 'https://images.pexels.com/photos/17728787/pexels-photo-17728787.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    badgeKey: 'home.showcase.offerBadge',
    titleKey: 'home.showcase.offerTitle',
    descKey: 'home.showcase.offerDesc',
    ctaKey: 'home.showcase.ctaSecondary',
    ctaLink: '/supply-request',
    secondaryKey: 'home.showcase.cta',
    secondaryLink: '/catalog',
    extra: [{ key: 'home.showcase.offerExpiry', icon: 'clock' }],
  },
  {
    id: 'announce',
    type: 'announce',
    image: 'https://images.pexels.com/photos/30335395/pexels-photo-30335395.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    badgeKey: 'home.showcase.announceBadge',
    titleKey: 'home.showcase.announceTitle',
    descKey: 'home.showcase.announceDesc',
    ctaKey: 'home.showcase.cta',
    ctaLink: '/catalog',
    secondaryKey: 'home.showcase.ctaSecondary',
    secondaryLink: '/supply-request',
  },
  {
    id: 'event',
    type: 'event',
    image: 'https://images.pexels.com/photos/860227/pexels-photo-860227.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    badgeKey: 'home.showcase.eventBadge',
    titleKey: 'home.showcase.eventTitle',
    descKey: 'home.showcase.eventDesc',
    ctaKey: 'home.showcase.cta',
    ctaLink: '/contact',
    secondaryKey: 'home.showcase.ctaSecondary',
    secondaryLink: '/supply-request',
    extra: [
      { key: 'home.showcase.eventDate', icon: 'calendar' },
      { key: 'home.showcase.eventLocation', icon: 'pin' },
    ],
  },
];

const SLIDE_DURATION = 6000;

export default function HeroShowcase() {
  const { t, locale } = useLanguage();
  const [current, setCurrent] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const next = useCallback(() => setCurrent(c => (c + 1) % slides.length), []);
  const prev = useCallback(() => setCurrent(c => (c - 1 + slides.length) % slides.length), []);

  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(next, SLIDE_DURATION);
    return () => clearInterval(timer);
  }, [isPaused, next]);

  const slide = slides[current];

  return (
    <section
      className="hero-showcase"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      aria-roledescription="carousel"
      aria-label="SHANAN showcase"
    >
      {/* Left: stable branded content */}
      <div className="hero-content-panel">
        <div className="container hero-content-inner">
          <span className="hero-brand-badge">
            <img src="/shanan-logo.png" alt="SHANAN" className="hero-brand-logo" width="28" height="28" />
            <span className="hero-brand-text">SHANAN</span>
          </span>
          <p className="hero-brand-line">{t('home.heroBrandLine')}</p>
          <h1 className="hero-headline">{t('home.heroTitle')}</h1>
          <p className="hero-subtitle">{t('home.heroSubtitle')}</p>
          <div className="hero-pills">
            <span className="hero-pill">{t('home.heroPill1')}</span>
            <span className="hero-pill">{t('home.heroPill2')}</span>
            <span className="hero-pill">{t('home.heroPill3')}</span>
            <span className="hero-pill">{t('home.heroPill4')}</span>
          </div>
          <div className="hero-actions">
            <Link to="/catalog" className="btn btn-primary btn-lg hero-enter-btn">
              {t('home.heroCta')}
              <ArrowIcon />
            </Link>
            <Link to="/supply-request" className="btn btn-outline btn-lg hero-outline-btn">
              {t('home.heroSecondary')}
            </Link>
          </div>
        </div>
      </div>

      {/* Right: cycling visual showcase */}
      <div className="hero-visual-panel">
        {/* Device mockups (laptop + phone + stats note) removed from hero —
            the official device images are presented in the dedicated
            OfficialDeviceShowcase section further down the page instead. */}
        <div className="hero-showcase-track">
          {slides.map((s, i) => (
            <div
              key={s.id}
              className={`hero-showcase-slide ${i === current ? 'hero-showcase-slide-active' : ''}`}
              aria-hidden={i !== current}
            >
              <div className="hero-showcase-bg">
                <img src={s.image} alt="" className="hero-showcase-img" loading={i === 0 ? 'eager' : 'lazy'} />
                <div className="hero-showcase-overlay" />
              </div>
              <div className="hero-showcase-slide-content">
                <span className={`hero-showcase-badge hero-showcase-badge-${s.type}`}>
                  <BadgeIcon type={s.type} />
                  {t(s.badgeKey as never)}
                </span>
                <h2 className="hero-showcase-title">{t(s.titleKey as never)}</h2>
                <p className="hero-showcase-desc">{t(s.descKey as never)}</p>
                {s.extra && (
                  <div className="hero-showcase-extra">
                    {s.extra.map((ex, j) => (
                      <span key={j} className="hero-showcase-extra-item">
                        <ExtraIcon icon={ex.icon} />
                        {t(ex.key as never)}
                      </span>
                    ))}
                  </div>
                )}
                <div className="hero-showcase-slide-actions">
                  <Link to={s.ctaLink} className="hero-showcase-slide-link">
                    {t(s.ctaKey as never)}
                    <ArrowIcon />
                  </Link>
                  {s.secondaryKey && s.secondaryLink && (
                    <Link to={s.secondaryLink} className="hero-showcase-slide-link-secondary">
                      {t(s.secondaryKey as never)}
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <button className="hero-showcase-arrow hero-showcase-arrow-prev" onClick={prev} aria-label="Previous slide">
          <ChevronIcon dir="prev" />
        </button>
        <button className="hero-showcase-arrow hero-showcase-arrow-next" onClick={next} aria-label="Next slide">
          <ChevronIcon dir="next" />
        </button>

        <div className="hero-showcase-indicators">
          {slides.map((s, i) => (
            <button
              key={s.id}
              className={`hero-showcase-indicator ${i === current ? 'hero-showcase-indicator-active' : ''}`}
              onClick={() => setCurrent(i)}
              aria-label={`${t('home.showcase.slideLabel' as never)} ${i + 1}`}
            >
              <span className="hero-showcase-indicator-type">{s.type}</span>
            </button>
          ))}
        </div>

        <div className="hero-showcase-progress">
          <div
            className="hero-showcase-progress-bar"
            key={current}
            style={{ animation: `${isPaused ? 'none' : 'heroShowcaseProgress'} ${SLIDE_DURATION}ms linear` }}
          />
        </div>
      </div>
    </section>
  );
}

function ShananMark() {
  // Kept for backward compatibility; brand badge now uses the official logo image directly.
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}

function BadgeIcon({ type }: { type: SlideType }) {
  if (type === 'product') return <ProductIcon />;
  if (type === 'video') return <VideoIcon />;
  if (type === 'offer') return <TagIcon />;
  if (type === 'announce') return <MegaphoneIcon />;
  return <CalendarIcon />;
}

function ProductIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}
function VideoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  );
}
function TagIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}
function MegaphoneIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
function ChevronIcon({ dir }: { dir: 'prev' | 'next' }) {
  return (
    <svg className="rtl-flip" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: dir === 'prev' ? 'rotate(180deg)' : 'none' }}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
function ExtraIcon({ icon }: { icon: 'calendar' | 'pin' | 'clock' }) {
  if (icon === 'calendar') return <CalendarIcon />;
  if (icon === 'pin') return <PinIcon />;
  return <ClockIcon />;
}
function PinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
