import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../i18n/LanguageContext';
import SectionHeading from './SectionHeading';

const chips = ['home.ai.chip1', 'home.ai.chip2', 'home.ai.chip3'];
const stages = ['home.ai.stage1', 'home.ai.stage2', 'home.ai.stage3', 'home.ai.stage4'];

export default function AIProcurement() {
  const { t } = useLanguage();
  const [requirement, setRequirement] = useState('');
  const [received, setReceived] = useState(false);
  const [copied, setCopied] = useState(false);

  const submit = () => {
    if (!requirement.trim()) return;
    setReceived(true);
  };

  const edit = () => {
    setReceived(false);
    setCopied(false);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(requirement.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="section section-tight section-alt ee-ai">
      <div className="container">
        <SectionHeading
          eyebrow={t('home.ai.eyebrow' as never)}
          title={t('home.ai.title' as never)}
          subtitle={t('home.ai.subtitle' as never)}
          align="center"
        />

        <div className="ee-ai-panel">
          <div className="ee-ai-form">
            <label className="ee-ai-label" htmlFor="ee-ai-input">
              {t('home.ai.title' as never)}
            </label>
            <textarea
              id="ee-ai-input"
              className="ee-ai-input"
              rows={4}
              placeholder={t('home.ai.placeholder' as never)}
              value={requirement}
              onChange={e => setRequirement(e.target.value)}
              disabled={received}
              dir="auto"
            />

            <div className="ee-ai-chips">
              {chips.map(chip => (
                <button
                  type="button"
                  key={chip}
                  className="ee-ai-chip"
                  onClick={() => setRequirement(t(chip as never))}
                  disabled={received}
                >
                  {t(chip as never)}
                </button>
              ))}
            </div>

            {!received ? (
              <div className="ee-ai-actions">
                <button type="button" className="btn btn-primary" onClick={submit} disabled={!requirement.trim()}>
                  {t('home.ai.submit' as never)}
                </button>
              </div>
            ) : (
              <div className="ee-ai-received">
                <p className="ee-ai-received-text">
                  <CheckGlyph />
                  {t('home.ai.received' as never)}
                </p>
                <div className="ee-ai-received-actions">
                  <button type="button" className="btn btn-outline btn-sm" onClick={edit}>
                    {t('home.ai.edit' as never)}
                  </button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => void copy()}>
                    {copied ? t('home.ai.copied' as never) : t('home.ai.copy' as never)}
                  </button>
                  <Link to="/supply-request" className="btn btn-primary btn-sm">
                    {t('home.ai.cta' as never)}
                  </Link>
                </div>
              </div>
            )}
          </div>

          <div className="ee-ai-pipeline" aria-hidden={!received}>
            {stages.map((stage, i) => (
              <div
                key={stage}
                className={`ee-ai-stage ${received ? 'ee-ai-stage-on' : ''}`}
                style={{ '--ee-stage': i } as React.CSSProperties}
              >
                <span className="ee-ai-stage-dot">
                  <span className="ee-ai-stage-dot-inner" />
                </span>
                <span className="ee-ai-stage-label">{t(stage as never)}</span>
                {i < stages.length - 1 && <span className="ee-ai-stage-line" />}
              </div>
            ))}
            <p className="ee-ai-pipeline-note">
              {t('home.how.principle' as never)}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function CheckGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}