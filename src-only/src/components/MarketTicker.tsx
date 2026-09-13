import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { usePrefersReducedMotion } from './home/usePrefersReducedMotion';

type TickerType = 'market' | 'offer' | 'job' | 'event' | 'shanan';

interface TickerItem {
  id: string;
  type: TickerType;
  label: string;
  labelAr: string;
  text: string;
  textAr: string;
  priority: 'normal' | 'high';
  isActive: boolean;
  start?: string;
  end?: string;
  route?: string;
  trend?: 'up' | 'down' | 'neutral';
}

const tickerItems: TickerItem[] = [
  { id: 'm1', type: 'market', label: 'MARKET', labelAr: 'السوق', text: 'Steel HR Coil — $612/Ton', textAr: 'لفائف الصلب — 612$/طن', priority: 'normal', isActive: true, trend: 'up' },
  { id: 'o1', type: 'offer', label: 'OFFER', labelAr: 'عرض', text: 'SKF Bearings — 15% off bulk orders until Sep 30', textAr: 'محامل SKF — خصم 15% على الطلبات بالجملة حتى 30 سبتمبر', priority: 'high', isActive: true, end: '2030-09-30', route: '/supply-request' },
  { id: 'j1', type: 'job', label: 'JOB', labelAr: 'وظيفة', text: 'Procurement Manager — Amman, Jordan', textAr: 'مدير مشتريات — عمّان، الأردن', priority: 'normal', isActive: true },
  { id: 'e1', type: 'event', label: 'EVENT', labelAr: 'فعالية', text: 'Jordan Industrial Manufacturing Expo — Nov 2026, Amman', textAr: 'معرض التصنيع الصناعي الأردني — نوفمبر 2026، عمّان', priority: 'high', isActive: true },
  { id: 's1', type: 'shanan', label: 'SHANAN', labelAr: 'شانان', text: 'New category added: Industrial Automation & Control', textAr: 'فئة جديدة: الأتمتة والتحكم الصناعي', priority: 'normal', isActive: true },
  { id: 'm2', type: 'market', label: 'MARKET', labelAr: 'السوق', text: 'Copper Cathode — $8,420/Ton', textAr: 'النحاس — 8,420$/طن', priority: 'normal', isActive: true, trend: 'down' },
  { id: 'o2', type: 'offer', label: 'OFFER', labelAr: 'عرض', text: 'Schneider Contactors — Free shipping on orders over 50 units', textAr: 'كونتاكتورات شنايدر — شحن مجاني للطلبات فوق 50 وحدة', priority: 'normal', isActive: true, route: '/supply-request' },
  { id: 'm3', type: 'market', label: 'MARKET', labelAr: 'السوق', text: 'Aluminum Ingot — $2,180/Ton', textAr: 'الألمنيوم — 2,180$/طن', priority: 'normal', isActive: true, trend: 'neutral' },
  { id: 'j2', type: 'job', label: 'JOB', labelAr: 'وظيفة', text: 'Field Sales Engineer — Irbid, Jordan', textAr: 'مهندس مبيعات ميداني — إربد، الأردن', priority: 'normal', isActive: true },
  { id: 'e2', type: 'event', label: 'EVENT', labelAr: 'فعالية', text: 'Jordan Build & Construct Expo — Dec 2026, Amman', textAr: 'معرض البناء والتشييد الأردني — ديسمبر 2026، عمّان', priority: 'high', isActive: true },
  { id: 's2', type: 'shanan', label: 'SHANAN', labelAr: 'شانان', text: 'Live product catalog — structured specs and technical documents', textAr: 'كتالوج المنتجات المباشر — مواصفات منظمة ووثائق فنية', priority: 'normal', isActive: true, route: '/catalog' },
  { id: 'o3', type: 'offer', label: 'OFFER', labelAr: 'عرض', text: 'Parker Hydraulic Valves — 10% off for registered buyers', textAr: 'صمامات باركر الهيدروليكية — خصم 10% للمشترين المسجلين', priority: 'normal', isActive: true, route: '/supply-request' },
];

const typeColors: Record<TickerType, string> = {
  market: '#3A7CA5',
  offer: '#E9A23B',
  job: '#5FB87C',
  event: '#6CB6E3',
  shanan: '#D62828',
};

export default function MarketTicker() {
  const { t, locale } = useLanguage();
  const isRtl = locale === 'ar';
  const reducedMotion = usePrefersReducedMotion();
  const [paused, setPaused] = useState(false);

  const items = [...tickerItems, ...tickerItems];
  const frozen = reducedMotion || paused;

  const renderItem = (item: TickerItem, index: number) => {
    const label = isRtl ? item.labelAr : item.label;
    const text = isRtl ? item.textAr : item.text;
    const color = typeColors[item.type];

    const inner = (
      <>
        <span className="ticker-label" style={{ color, borderColor: color }}>
          {label}
        </span>
        <span className="ticker-text">{text}</span>
        {item.trend === 'up' && <span className="ticker-trend ticker-trend-up">▲</span>}
        {item.trend === 'down' && <span className="ticker-trend ticker-trend-down">▼</span>}
      </>
    );

    return (
      <span className="ticker-item" key={`${item.id}-${index}`}>
        {item.route ? (
          <Link to={item.route} className="ticker-inner" onClick={e => e.stopPropagation()}>
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
      <div className="shanan-live-viewport">
        <div
          className="shanan-live-track"
          style={{ animationDirection: isRtl ? 'reverse' : 'normal', animationPlayState: frozen ? 'paused' : 'running' }}
        >
          {items.map(renderItem)}
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