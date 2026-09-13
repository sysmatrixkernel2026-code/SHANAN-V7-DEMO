import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../i18n/LanguageContext';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';
import SectionHeading from './SectionHeading';

type SectorKey = 'sec1' | 'sec2' | 'sec3' | 'sec4' | 'sec5' | 'sec6';

interface Sector {
  id: SectorKey;
  image: string;
}

const AUTOPLAY_MS = 3000;

const sectors: Sector[] = [
  { id: 'sec1', image: 'https://images.pexels.com/photos/1108101/pexels-photo-1108101.jpeg?auto=compress&cs=tinysrgb&h=700&w=1000' },
  { id: 'sec2', image: 'https://images.pexels.com/photos/1797270/pexels-photo-1797270.jpeg?auto=compress&cs=tinysrgb&h=700&w=1000' },
  { id: 'sec3', image: 'https://images.pexels.com/photos/2607249/pexels-photo-2607249.jpeg?auto=compress&cs=tinysrgb&h=700&w=1000' },
  { id: 'sec4', image: 'https://images.pexels.com/photos/633850/machine-mill-industry-steam-633850.jpeg?auto=compress&cs=tinysrgb&h=700&w=1000' },
  { id: 'sec5', image: 'https://images.pexels.com/photos/93400/pexels-photo-93400.jpeg?auto=compress&cs=tinysrgb&h=700&w=1000' },
  { id: 'sec6', image: 'https://images.pexels.com/photos/1142990/pexels-photo-1142990.jpeg?auto=compress&cs=tinysrgb&h=700&w=1000' },
];

export default function IndustrySectors() {
  const { t } = useLanguage();
  const reducedMotion = usePrefersReducedMotion();
  const [active, setActive] = useState(0);
  const [autoplayOn, setAutoplayOn] = useState(() => !reducedMotion);
  const [hoverPaused, setHoverPaused] = useState(false);

  const next = useCallback(
    () => setActive(a => (a + 1) % sectors.length),
    [],
  );
  const prev = useCallback(
    () => setActive(a => (a - 1 + sectors.length) % sectors.length),
    [],
  );

  useEffect(() => {
    if (!autoplayOn || hoverPaused || reducedMotion) return;
    const timer = setInterval(next, AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [autoplayOn, hoverPaused, reducedMotion, next]);

  const current = sectors[active];
  const titleKey = `home.industry.${current.id}.title`;
  const descKey = `home.industry.${current.id}.desc`;

  return (
    <section
      className="section section-tight ee-industry"
      aria-roledescription="carousel"
      aria-label={t('home.industry.aria' as never)}
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
      onFocusCapture={() => setHoverPaused(true)}
      onBlurCapture={() => setHoverPaused(false)}
    >
      <div className="container">
        <SectionHeading
          eyebrow={t('home.industry.eyebrow' as never)}
          title={t('home.industry.title' as never)}
          subtitle={t('home.industry.subtitle' as never)}
          action={
            <Link to="/catalog" className="btn btn-outline btn-sm">
              {t('home.industry.cta' as never)}
              <span className="rtl-flip ee-arrow">→</span>
            </Link>
          }
        />

        <div className="ee-industry-stage">
          {sectors.map((s, i) => (
            <div
              key={s.id}
              className={`ee-industry-slide ${i === active ? 'ee-industry-slide-active' : ''}`}
              aria-hidden={i !== active}
            >
              <img
                src={s.image}
                alt=""
                loading={i === 0 ? 'eager' : 'lazy'}
                className="ee-industry-img"
                onError={e => e.currentTarget.classList.add('ee-industry-img-hidden')}
              />
              <div className="ee-industry-overlay" />
            </div>
          ))}

          <div className="ee-industry-caption">
            <span className="ee-eyebrow">
              <span className="ee-eyebrow-dot" />
              {t('home.industry.eyebrow' as never)}
            </span>
            <h3 className="ee-industry-title">{t(titleKey as never)}</h3>
            <p className="ee-industry-desc">{t(descKey as never)}</p>
            <div className="ee-industry-caption-meta">
              <span className="ee-industry-count">
                {String(active + 1).padStart(2, '0')} / {String(sectors.length).padStart(2, '0')}
              </span>
              <span className="ee-industry-hint">
                <kbd>◀</kbd> <kbd>▶</kbd>
              </span>
            </div>
          </div>

          <button
            type="button"
            className="ee-industry-arrow ee-industry-arrow-prev"
            onClick={prev}
            aria-label={t('home.motion.prev' as never)}
          >
            <Chevron />
          </button>
          <button
            type="button"
            className="ee-industry-arrow ee-industry-arrow-next"
            onClick={next}
            aria-label={t('home.motion.next' as never)}
          >
            <Chevron />
          </button>
        </div>

        <div className="ee-industry-tabs">
          {sectors.map((s, i) => (
            <button
              type="button"
              key={s.id}
              className={`ee-industry-tab ${i === active ? 'ee-industry-tab-active' : ''}`}
              onClick={() => setActive(i)}
              aria-pressed={i === active}
            >
              <span className="ee-industry-tab-num">{String(i + 1).padStart(2, '0')}</span>
              <span className="ee-industry-tab-name">{t(`home.industry.${s.id}.title` as never)}</span>
            </button>
          ))}
          <button
            type="button"
            className="ee-motion-btn ee-industry-pause"
            onClick={() => setAutoplayOn(v => !v)}
            aria-pressed={!autoplayOn}
            aria-label={autoplayOn ? t('home.motion.pause' as never) : t('home.motion.play' as never)}
          >
            {autoplayOn ? <PauseGlyph /> : <PlayGlyph />}
          </button>
        </div>
      </div>
    </section>
  );
}

function Chevron() {
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
    >
      <polyline points="9 18 15 12 9 6" />
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