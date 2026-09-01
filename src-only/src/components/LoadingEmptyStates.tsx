import type { ReactNode } from 'react';

interface LoadingStateProps {
  count?: number;
  type?: 'card' | 'detail';
}

export function LoadingState({ count = 12, type = 'card' }: LoadingStateProps) {
  if (type === 'detail') {
    return (
      <div className="product-detail-loading">
        <div className="skeleton" style={{ height: 400, marginBottom: 24 }} />
        <div className="skeleton" style={{ height: 32, width: '60%', marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 20, width: '40%', marginBottom: 24 }} />
        <div className="skeleton" style={{ height: 100, marginBottom: 24 }} />
        <div className="skeleton" style={{ height: 200 }} />
      </div>
    );
  }

  return (
    <div className="product-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="product-card-skeleton">
          <div className="skeleton" style={{ height: 200 }} />
          <div style={{ padding: 16 }}>
            <div className="skeleton" style={{ height: 12, width: '40%', marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 16, width: '80%', marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 12, width: '60%', marginBottom: 16 }} />
            <div className="skeleton" style={{ height: 32, width: '100%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-state-icon">{icon}</div>}
      <h3 className="empty-state-title">{title}</h3>
      {description && <p className="empty-state-desc">{description}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
