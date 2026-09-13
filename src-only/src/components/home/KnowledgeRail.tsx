import { Link } from 'react-router-dom';
import { useLanguage } from '../../i18n/LanguageContext';
import SectionHeading from './SectionHeading';

const knowledgeCards = [
  {
    typeKey: 'home.knowledge.type.engineering',
    titleKey: 'home.knowledge.k1Title',
    descKey: 'home.knowledge.k1Desc',
    link: '/catalog',
  },
  {
    typeKey: 'home.knowledge.type.sourcing',
    titleKey: 'home.knowledge.k2Title',
    descKey: 'home.knowledge.k2Desc',
    link: '/about',
  },
  {
    typeKey: 'home.knowledge.type.procurement',
    titleKey: 'home.knowledge.k3Title',
    descKey: 'home.knowledge.k3Desc',
    link: '/supply-request',
  },
];

const events = [
  {
    titleKey: 'home.event1Title',
    dateKey: 'home.event1Date',
    locationKey: 'home.event1Location',
    image: 'https://images.pexels.com/photos/860227/pexels-photo-860227.jpeg?auto=compress&cs=tinysrgb&h=400&w=600',
  },
  {
    titleKey: 'home.event2Title',
    dateKey: 'home.event2Date',
    locationKey: 'home.event2Location',
    image: 'https://images.pexels.com/photos/19425035/pexels-photo-19425035.jpeg?auto=compress&cs=tinysrgb&h=400&w=600',
  },
  {
    titleKey: 'home.event3Title',
    dateKey: 'home.event3Date',
    locationKey: 'home.event3Location',
    image: 'https://images.pexels.com/photos/34207359/pexels-photo-34207359.jpeg?auto=compress&cs=tinysrgb&h=400&w=600',
  },
];

export default function KnowledgeRail() {
  const { t } = useLanguage();

  return (
    <section className="section section-tight ee-knowledge" aria-label={t('home.knowledge.aria' as never)}>
      <div className="container">
        <SectionHeading
          eyebrow={t('home.knowledge.eyebrow' as never)}
          title={t('home.knowledge.title' as never)}
          subtitle={t('home.knowledge.subtitle' as never)}
          action={
            <Link to="/about" className="btn btn-outline btn-sm">
              {t('home.knowledge.cta' as never)}
              <span className="rtl-flip ee-arrow">→</span>
            </Link>
          }
        />

        <div className="ee-knowledge-grid">
          <div className="ee-knowledge-list">
            {knowledgeCards.map(card => (
              <Link to={card.link} key={card.titleKey} className="ee-knowledge-card">
                <span className="ee-knowledge-type">{t(card.typeKey as never)}</span>
                <h3 className="ee-knowledge-title">{t(card.titleKey as never)}</h3>
                <p className="ee-knowledge-desc">{t(card.descKey as never)}</p>
                <span className="ee-knowledge-open">
                  {t('home.knowledge.cta' as never)}
                  <span className="rtl-flip">→</span>
                </span>
              </Link>
            ))}
          </div>

          <div className="ee-knowledge-events">
            {events.map(ev => (
              <article key={ev.titleKey} className="ee-knowledge-event">
                <div className="ee-knowledge-event-imgwrap">
                  <img src={ev.image} alt="" loading="lazy" className="ee-knowledge-event-img" />
                  <span className="ee-knowledge-event-type">{t('home.knowledge.type.event' as never)}</span>
                </div>
                <div className="ee-knowledge-event-body">
                  <h3 className="ee-knowledge-event-title">{t(ev.titleKey as never)}</h3>
                  <div className="ee-knowledge-event-meta">
                    <span className="ee-knowledge-event-meta-item">
                      <CalendarGlyph />
                      {t(ev.dateKey as never)}
                    </span>
                    <span className="ee-knowledge-event-meta-item">
                      <PinGlyph />
                      {t(ev.locationKey as never)}
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function CalendarGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function PinGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}