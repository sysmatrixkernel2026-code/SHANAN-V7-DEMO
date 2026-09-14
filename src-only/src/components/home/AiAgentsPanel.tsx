import { useEffect, useState } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

/**
 * AI Agents panel — visual representation of SHANAN's multi-model / multi-agent
 * architecture. Providers are shown as brand-color wordmarks (official logos are
 * NOT reproduced). The panel is an AI-READINESS indicator, never a claim that
 * every provider is currently connected.
 */
const AGENTS = [
  { name: 'Claude', cls: 'ee-ai-agent-claude' },
  { name: 'OpenAI', cls: 'ee-ai-agent-openai' },
  { name: 'Gemini', cls: 'ee-ai-agent-gemini' },
  { name: 'Qwen', cls: 'ee-ai-agent-qwen' },
  { name: 'Llama', cls: 'ee-ai-agent-llama' },
] as const;

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
        <p className="ee-ai-agents-subtitle">{t('home.agents.subtitle')}</p>
      </div>
      <ul className="ee-ai-agents-list">
        {AGENTS.map((a, i) => (
          <li key={a.name} className={`ee-ai-agent ${a.cls} ${active === i ? 'ee-ai-agent-on' : ''}`}>
            <span className="ee-ai-agent-badge" aria-hidden="true">
              {a.name.charAt(0)}
            </span>
            <span className="ee-ai-agent-name">{a.name}</span>
            <span className="ee-ai-agent-accent" aria-hidden="true" />
            <span className="ee-ai-agent-idx">{`0${i + 1}`}</span>
          </li>
        ))}
      </ul>
      <p className="ee-ai-agents-note">{t('home.agents.gateway')}</p>
      <p className="ee-ai-agents-tag">
        <span className="ee-ai-agents-tag-dot" aria-hidden="true" />
        {t('home.agents.readiness')}
      </p>
    </aside>
  );
}