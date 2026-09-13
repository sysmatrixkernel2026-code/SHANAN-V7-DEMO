import { Link } from 'react-router-dom';
import { useLanguage } from '../../i18n/LanguageContext';
import SectionHeading from './SectionHeading';

interface HowStep {
  num: string;
  titleKey: string;
  textKey: string;
  protected?: boolean;
}

const steps: HowStep[] = [
  { num: '01', titleKey: 'home.how.s1.title', textKey: 'home.how.s1.text' },
  { num: '02', titleKey: 'home.how.s2.title', textKey: 'home.how.s2.text' },
  { num: '03', titleKey: 'home.how.s3.title', textKey: 'home.how.s3.text' },
  { num: '04', titleKey: 'home.how.s4.title', textKey: 'home.how.s4.text' },
  { num: '05', titleKey: 'home.how.s5.title', textKey: 'home.how.s5.text', protected: true },
  { num: '06', titleKey: 'home.how.s6.title', textKey: 'home.how.s6.text', protected: true },
  { num: '07', titleKey: 'home.how.s7.title', textKey: 'home.how.s7.text' },
  { num: '08', titleKey: 'home.how.s8.title', textKey: 'home.how.s8.text' },
  { num: '09', titleKey: 'home.how.s9.title', textKey: 'home.how.s9.text' },
  { num: '10', titleKey: 'home.how.s10.title', textKey: 'home.how.s10.text' },
];

export default function HowShananWorks() {
  const { t } = useLanguage();

  return (
    <section className="ee-how" aria-label={t('home.how.aria' as never)}>
      <div className="container">
        <SectionHeading
          eyebrow={t('home.how.eyebrow' as never)}
          title={t('home.how.title' as never)}
          subtitle={t('home.how.subtitle' as never)}
          align="center"
        />

        <div className="ee-how-model" aria-hidden="true">
          <div className="ee-how-node">{t('home.how.customerLabel' as never)}</div>
          <div className="ee-how-flow" />
          <div className="ee-how-node ee-how-node-shanan">{t('home.how.shananLabel' as never)}</div>
          <div className="ee-how-flow" />
          <div className="ee-how-node ee-how-node-shield">
            <ShieldGlyph />
            <span>{t('home.how.protectedLabel' as never)}</span>
          </div>
          <div className="ee-how-flow" />
          <div className="ee-how-node ee-how-node-shanan">{t('home.how.quotationLabel' as never)}</div>
          <div className="ee-how-flow" />
          <div className="ee-how-node">{t('home.how.customerLabel' as never)}</div>
        </div>

        <div className="ee-how-grid">
          {steps.map(step => (
            <article
              key={step.num}
              className={`ee-how-card ${step.protected ? 'ee-how-card-protected' : ''}`}
            >
              <span className="ee-how-num">{step.num}</span>
              {step.protected && (
                <span className="ee-how-shield">
                  <ShieldGlyph />
                </span>
              )}
              <h3 className="ee-how-title">{t(step.titleKey as never)}</h3>
              <p className="ee-how-text">{t(step.textKey as never)}</p>
            </article>
          ))}
        </div>

        <div className="ee-how-principle">
          <ShieldGlyph />
          <p>{t('home.how.principle' as never)}</p>
        </div>

        <div className="ee-how-cta">
          <Link to="/supply-request" className="btn btn-primary btn-lg">
            {t('home.how.cta' as never)}
          </Link>
        </div>
      </div>
    </section>
  );
}

function ShieldGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2 3 6v6c0 5 4 8 9 10 5-2 9-5 9-10V6z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}