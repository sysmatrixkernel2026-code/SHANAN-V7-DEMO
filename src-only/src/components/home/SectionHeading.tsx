import type { ReactNode } from 'react';

interface SectionHeadingProps {
  eyebrow: string;
  title: string;
  subtitle?: string;
  align?: 'start' | 'center';
  action?: ReactNode;
}

export default function SectionHeading({ eyebrow, title, subtitle, align = 'start', action }: SectionHeadingProps) {
  return (
    <div className={`ee-section-head ee-section-head-${align}`}>
      <div className="ee-section-head-copy">
        <span className="ee-eyebrow">
          <span className="ee-eyebrow-dot" />
          {eyebrow}
        </span>
        <h2 className="ee-section-title">{title}</h2>
        {subtitle && <p className="ee-section-subtitle">{subtitle}</p>}
      </div>
      {action && <div className="ee-section-head-action">{action}</div>}
    </div>
  );
}