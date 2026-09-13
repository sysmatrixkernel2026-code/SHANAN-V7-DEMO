import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { ArrowIcon } from './icons';
import { usePrefersReducedMotion } from './home/usePrefersReducedMotion';

// The brand film is prepared as a future controlled capability. Until the
// production film asset exists, FILM_SRC stays empty and the player falls
// back to an honest "in production" poster instead of fabricated video.
const FILM_SRC = '';

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
  const { t } = useLanguage();
  const reducedMotion = usePrefersReducedMotion();
  const [current, setCurrent] = useState(0);
  const [autoplayOn, setAutoplayOn] = useState(() => !reducedMotion);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [filmOpen, setFilmOpen] = useState(false);

  const next = useCallback(() => setCurrent(c => (c + 1) % slides.length), []);
  const prev = useCallback(() => setCurrent(c => (c - 1 + slides.length) % slides.length), []);

  useEffect(() => {
    if (!autoplayOn || hoverPaused || reducedMotion) return;
    const timer = setInterval(next, SLIDE_DURATION);
    return () => clearInterval(timer);
  }, [autoplayOn, hoverPaused, reducedMotion, next]);

  const slide = slides[current];

  return (
    <section
      className="hero-showcase ee-hero"
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
    >
      <div className="ee-hero-stage">
        {slides.map((s, i) => (
          <div
            key={s.id}
            className={`ee-hero-slide ${i === current ? 'ee-hero-slide-active' : ''}`}
            aria-hidden={i !== current}
          >
            <img
              src={s.image}
              alt=""
              className="ee-hero-slide-img"
              loading={i === 0 ? 'eager' : 'lazy'}
              onError={e => e.currentTarget.classList.add('ee-hero-slide-img-hidden')}
            />
          </div>
        ))}
        <div className="ee-hero-shade" />
        <div className="ee-hero-shade ee-hero-shade-alt" />

        <div className="container ee-hero-copy-wrap">
          <div className="ee-hero-content">
            <div className="ee-hero-logo-tile">
              <img src="/shanan-logo.png" alt="SHANAN" width="104" height="104" />
            </div>
            <p className="ee-hero-brand-line">{t('home.heroBrandLine')}</p>
            <h1 className="ee-hero-headline">{t('home.heroTitle')}</h1>
            <p className="ee-hero-subtitle">{t('home.heroSubtitle')}</p>
            <div className="ee-hero-pills">
              <span className="ee-hero-pill">{t('home.heroPill1')}</span>
              <span className="ee-hero-pill">{t('home.heroPill2')}</span>
              <span className="ee-hero-pill">{t('home.heroPill3')}</span>
              <span className="ee-hero-pill">{t('home.heroPill4')}</span>
            </div>
            <div className="ee-hero-actions">
              <Link to="/catalog" className="btn btn-primary btn-lg ee-hero-cta">
                {t('home.heroCta')}
                <ArrowIcon />
              </Link>
              <button
                type="button"
                className="btn btn-outline btn-lg ee-hero-story"
                onClick={() => setFilmOpen(true)}
              >
                <PlayGlyph />
                {t('home.hero.watchStory')}
              </button>
            </div>
          </div>
        </div>

        <div className="ee-hero-stage-ui container">
          <div className="ee-hero-caption-stack">
            {slides.map((item, i) => (
              <div
                key={item.id}
                className={`ee-hero-caption ${i === current ? 'ee-hero-caption-active' : ''}`}
                aria-hidden={i !== current}
              >
                <span className={`ee-hero-caption-badge ee-hero-caption-badge-${item.type}`}>
                  <BadgeIcon type={item.type} />
                  {t(item.badgeKey as never)}
                </span>
                <h2 className="ee-hero-caption-title">{t(item.titleKey as never)}</h2>
                <p className="ee-hero-caption-desc">{t(item.descKey as never)}</p>
                {item.extra && (
                  <div className="ee-hero-caption-extra">
                    {item.extra.map((ex, j) => (
                      <span key={j} className="ee-hero-caption-extra-item">
                        <ExtraIcon icon={ex.icon} />
                        {t(ex.key as never)}
                      </span>
                    ))}
                  </div>
                )}
                <div className="ee-hero-caption-links">
                  <Link to={item.ctaLink} className="ee-hero-caption-link">
                    {t(item.ctaKey as never)}
                    <ArrowIcon />
                  </Link>
                  {item.secondaryKey && item.secondaryLink && (
                    <Link to={item.secondaryLink} className="ee-hero-caption-link ee-hero-caption-link-secondary">
                      {t(item.secondaryKey as never)}
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="ee-hero-controls">
            <button
              type="button"
              className="ee-hero-arrow"
              onClick={prev}
              aria-label={t('home.motion.prev' as never)}
            >
              <ChevronIcon dir="prev" />
            </button>
            <button
              type="button"
              className="ee-hero-motion"
              onClick={() => setAutoplayOn(v => !v)}
              aria-pressed={!autoplayOn}
              aria-label={autoplayOn ? t('home.motion.pause' as never) : t('home.motion.play' as never)}
            >
              {autoplayOn ? <PauseGlyph /> : <PlayGlyph />}
            </button>
            <button
              type="button"
              className="ee-hero-arrow"
              onClick={next}
              aria-label={t('home.motion.next' as never)}
            >
              <ChevronIcon dir="next" />
            </button>
          </div>

          <div className="ee-hero-thumbs">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className={`ee-hero-thumb ${i === current ? 'ee-hero-thumb-active' : ''}`}
                onClick={() => setCurrent(i)}
                aria-label={`${t('home.showcase.slideLabel' as never)} ${i + 1}`}
              >
                <span className="ee-hero-thumb-bar" />
              </button>
            ))}
          </div>

          <div className="ee-hero-progress">
            <div
              className="ee-hero-progress-bar"
              key={current}
              style={{
                animation:
                  !autoplayOn || hoverPaused || reducedMotion ? 'none' : `eeHeroProgress ${SLIDE_DURATION}ms linear`,
              }}
            />
          </div>
        </div>
      </div>

      {filmOpen && <FilmPlayer slide={slide} onClose={() => setFilmOpen(false)} />}
    </section>
  );
}

function FilmPlayer({ slide, onClose }: { slide: Slide; onClose: () => void }) {
  const { t } = useLanguage();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div className="ee-film" role="dialog" aria-modal="true" aria-label={t('home.hero.filmCaption' as never)}>
      <button
        type="button"
        className="ee-film-backdrop"
        onClick={onClose}
        tabIndex={-1}
        aria-hidden="true"
      />
      <div className="ee-film-panel">
        <div className="ee-film-media">
          {FILM_SRC ? (
            <video className="ee-film-video" src={FILM_SRC} controls preload="none" aria-label={t('home.hero.filmCaption' as never)} />
          ) : (
            <div className="ee-film-poster">
              <img src={slide.image} alt="" />
              <div className="ee-film-poster-shade" />
              <div className="ee-film-poster-content">
                <span className="ee-film-poster-badge">
                  <PlayGlyph />
                </span>
                <h3 className="ee-film-poster-title">{t('home.hero.filmCaption' as never)}</h3>
                <p className="ee-film-poster-text">{t('home.hero.filmFallback' as never)}</p>
              </div>
            </div>
          )}
        </div>
        <div className="ee-film-meta">
          <div>
            <span className="ee-film-brand">SHANAN</span>
            <span className="ee-film-name">{t(slide.titleKey as never)}</span>
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
            {t('home.hero.close' as never)}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- Icons ---- */
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
    <svg
      className="rtl-flip"
      width="22"
      height="22"
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
function PlayGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
function PauseGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}