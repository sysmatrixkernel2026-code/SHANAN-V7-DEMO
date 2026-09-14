import { useEffect, useState } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

const AGENTS = ['Claude', 'OpenAI', 'Gemini', 'Qwen', 'Llama'] as const;

export default function AiAgentsPanel() {
  const { t } = useLanguage();
  const reduced = usePrefersReducedMotion();
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const timer = setInterval(() => setActive(v => (v + 1) % AGENTS.length), 1800);
    return () => clearInterval(timer);
  }, [reduced]);

  return (
    <aside className="ee-ai-agents" aria-label={t('home.ai.aria')}>
      <div className="ee-ai-agents-head">
        <span className="ee-ai-agents-eyebrow">
          <span className="ee-ai-agents-throb" aria-hidden="true" />
          {t('home.agents.eyebrow')}
        </span>
        <h3 className="ee-ai-agents-title">{t('home.agents.title')}</h3>
      </div>
      <ul className="ee-ai-agents-list">
        {AGENTS.map((name, i) => (
          <li key={name} className={`ee-ai-agent ${active === i ? 'ee-ai-agent-on' : ''}`}>
            <span className="ee-ai-agent-icon" aria-hidden="true">
              <SparkGlyph />
            </span>
            <span className="ee-ai-agent-name">{name}</span>
            <span className="ee-ai-agent-dot" aria-hidden="true" />
          </li>
        ))}
      </ul>
      <p className="ee-ai-agents-note">{t('home.agents.gateway')}</p>
      <p className="ee-ai-agents-tag">{t('home.agents.readiness')}</p>
    </aside>
  );
}

function SparkGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v3M12 18v3M5.64 5.64l2.12 2.12M16.24 16.24l2.12 2.12M3 12h3M18 12h3M5.64 18.36l2.12-2.12M16.24 7.76l2.12-2.12" />
    </svg>
  );
}