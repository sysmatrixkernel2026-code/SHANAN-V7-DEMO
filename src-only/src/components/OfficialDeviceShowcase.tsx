import { Link } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';

/**
 * OfficialDeviceShowcase — premium section featuring the official
 * SHANAN mobile app + desktop platform mockup images.
 *
 * Composition (desktop):
 *   - Intro heading + supporting text (centered)
 *   - Laptop feature block (broad, structured, operational feel)
 *   - Mobile feature block (faster, direct, accessible feel)
 *
 * Both device images are used directly — no fake UI inside, no overlays,
 * no cropping. Each sits on a clean white canvas with subtle depth.
 *
 * Bilingual content via the existing i18n system.
 */
export default function OfficialDeviceShowcase() {
  const { t } = useLanguage();

  const laptopBenefits = [
    t('home.showcaseOfficial.laptopBenefit1'),
    t('home.showcaseOfficial.laptopBenefit2'),
    t('home.showcaseOfficial.laptopBenefit3'),
    t('home.showcaseOfficial.laptopBenefit4'),
  ];

  const mobileBenefits = [
    t('home.showcaseOfficial.mobileBenefit1'),
    t('home.showcaseOfficial.mobileBenefit2'),
    t('home.showcaseOfficial.mobileBenefit3'),
    t('home.showcaseOfficial.mobileBenefit4'),
  ];

  return (
    <section className="official-showcase section section-tight" aria-label="SHANAN Platform — One Platform, Every Workspace">
      <div className="container">
        {/* ---- Intro ---- */}
        <div className="official-showcase-intro">
          <span className="official-showcase-eyebrow">
            <span className="official-showcase-eyebrow-dot" />
            {t('home.showcaseOfficial.eyebrow')}
          </span>
          <h2 className="official-showcase-title">{t('home.showcaseOfficial.title')}</h2>
          <p className="official-showcase-subtitle">{t('home.showcaseOfficial.subtitle')}</p>
        </div>

        {/* ---- LAPTOP / DESKTOP BLOCK ---- */}
        <article className="official-device-block official-device-block-laptop">
          <div className="official-device-image-wrap official-device-image-laptop">
            <img
              src="/shanan-laptop-app.jpg"
              alt={t('home.showcaseOfficial.laptopAlt')}
              className="official-device-img official-device-img-laptop"
              loading="lazy"
              width={1264}
              height={842}
            />
            <span className="official-device-tag official-device-tag-laptop">
              <span className="official-device-tag-dot" />
              DESKTOP · WORKSPACE
            </span>
          </div>

          <div className="official-device-content official-device-content-laptop">
            <span className="official-device-eyebrow">{t('home.showcaseOfficial.laptopEyebrow')}</span>
            <h3 className="official-device-title">{t('home.showcaseOfficial.laptopTitle')}</h3>
            <p className="official-device-desc">{t('home.showcaseOfficial.laptopDesc')}</p>
            <ul className="official-device-benefits">
              {laptopBenefits.map((b, i) => (
                <li key={i} className="official-device-benefit">
                  <span className="official-device-benefit-marker" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <Link to="/catalog" className="btn btn-primary">
              {t('home.showcaseOfficial.laptopCta')}
            </Link>
          </div>
        </article>

        {/* ---- MOBILE BLOCK ---- */}
        <article className="official-device-block official-device-block-mobile">
          <div className="official-device-image-wrap official-device-image-mobile">
            <img
              src="/shanan-mobile-app.jpg"
              alt={t('home.showcaseOfficial.mobileAlt')}
              className="official-device-img official-device-img-mobile"
              loading="lazy"
              width={1264}
              height={842}
            />
            <span className="official-device-tag official-device-tag-mobile">
              <span className="official-device-tag-dot" />
              MOBILE · FIELD
            </span>
          </div>

          <div className="official-device-content official-device-content-mobile">
            <span className="official-device-eyebrow official-device-eyebrow-accent">
              {t('home.showcaseOfficial.mobileEyebrow')}
            </span>
            <h3 className="official-device-title">{t('home.showcaseOfficial.mobileTitle')}</h3>
            <p className="official-device-desc">{t('home.showcaseOfficial.mobileDesc')}</p>
            <ul className="official-device-benefits">
              {mobileBenefits.map((b, i) => (
                <li key={i} className="official-device-benefit">
                  <span className="official-device-benefit-marker" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <Link to="/supply-request" className="btn btn-primary">
              {t('home.showcaseOfficial.mobileCta')}
            </Link>
          </div>
        </article>
      </div>
    </section>
  );
}
