import { useLanguage } from '../i18n/LanguageContext';

type TickerType = 'market' | 'offer' | 'job' | 'event' | 'shanan';

interface TickerItem {
  type: TickerType;
  label: string;
  labelAr: string;
  text: string;
  textAr: string;
  trend?: 'up' | 'down' | 'neutral';
}

const tickerItems: TickerItem[] = [
  { type: 'market', label: 'MARKET', labelAr: 'السوق', text: 'Steel HR Coil — $612/Ton', textAr: 'لفائف الصلب — 612$/طن', trend: 'up' },
  { type: 'offer', label: 'OFFER', labelAr: 'عرض', text: 'SKF Bearings — 15% off bulk orders until Sep 30', textAr: 'محامل SKF — خصم 15% على الطلبات بالجملة حتى 30 سبتمبر' },
  { type: 'job', label: 'JOB', labelAr: 'وظيفة', text: 'Procurement Manager — Amman, Jordan', textAr: 'مدير مشتريات — عمّان، الأردن' },
  { type: 'event', label: 'EVENT', labelAr: 'فعالية', text: 'Jordan Industrial Manufacturing Expo — Nov 2026, Amman', textAr: 'معرض التصنيع الصناعي الأردني — نوفمبر 2026، عمّان' },
  { type: 'shanan', label: 'SHANAN', labelAr: 'شانان', text: 'New category added: Industrial Automation & Control', textAr: 'فئة جديدة: الأتمتة والتحكم الصناعي' },
  { type: 'market', label: 'MARKET', labelAr: 'السوق', text: 'Copper Cathode — $8,420/Ton', textAr: 'النحاس — 8,420$/طن', trend: 'down' },
  { type: 'offer', label: 'OFFER', labelAr: 'عرض', text: 'Schneider Contactors — Free shipping on orders over 50 units', textAr: 'كونتاكتورات شنايدر — شحن مجاني للطلبات فوق 50 وحدة' },
  { type: 'market', label: 'MARKET', labelAr: 'السوق', text: 'Aluminum Ingot — $2,180/Ton', textAr: 'الألمنيوم — 2,180$/طن', trend: 'neutral' },
  { type: 'job', label: 'JOB', labelAr: 'وظيفة', text: 'Field Sales Engineer — Irbid, Jordan', textAr: 'مهندس مبيعات ميداني — إربد، الأردن' },
  { type: 'event', label: 'EVENT', labelAr: 'فعالية', text: 'Jordan Build & Construct Expo — Dec 2026, Amman', textAr: 'معرض البناء والتشييد الأردني — ديسمبر 2026، عمّان' },
  { type: 'shanan', label: 'SHANAN', labelAr: 'شانان', text: 'Catalog expanded — 13,000+ products now indexed', textAr: 'توسع الكتالوج — أكثر من 13,000 منتج مفهرس الآن' },
  { type: 'offer', label: 'OFFER', labelAr: 'عرض', text: 'Parker Hydraulic Valves — 10% off for registered buyers', textAr: 'صمامات باركر الهيدروليكية — خصم 10% للمشترين المسجلين' },
];

const typeColors: Record<TickerType, string> = {
  market: '#3A7CA5',
  offer: '#E9A23B',
  job: '#5FB87C',
  event: '#6CB6E3',
  shanan: '#D62828',
};

export default function MarketTicker() {
  const { locale } = useLanguage();
  const isRtl = locale === 'ar';

  const renderItem = (item: TickerItem, index: number) => {
    const label = isRtl ? item.labelAr : item.label;
    const text = isRtl ? item.textAr : item.text;
    const color = typeColors[item.type];

    return (
      <span className="ticker-item" key={`item-${index}`}>
        <span className="ticker-label" style={{ color, borderColor: color }}>
          {label}
        </span>
        <span className="ticker-text">{text}</span>
        {item.trend === 'up' && <span className="ticker-trend ticker-trend-up">▲</span>}
        {item.trend === 'down' && <span className="ticker-trend ticker-trend-down">▼</span>}
        <span className="ticker-sep" />
      </span>
    );
  };

  const items = [...tickerItems, ...tickerItems];

  return (
    <div className="market-ticker" role="marquee" aria-label="SHANAN Live Market and Opportunities">
      <div className="ticker-live">
        <span className="ticker-live-dot" />
        <span className="ticker-live-text">LIVE</span>
      </div>
      <div className="ticker-track-wrapper">
        <div className="ticker-track" style={{ animationDirection: isRtl ? 'reverse' : 'normal' }}>
          {items.map(renderItem)}
        </div>
      </div>
    </div>
  );
}
