import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { LoadingState, EmptyState } from '../components/LoadingEmptyStates';
import type { TranslationKey } from '../i18n/translations';

// ============================================================
// FollowUpTasksAdmin — V6 Dedicated cross-opportunity Task Queue
// Route: /admin/tasks  (ProtectedRoute requireInternal)
//
// Lists ALL follow-up tasks across all opportunities, with filters.
// Reuses V5 priority-badge + V6 task-status-badge CSS classes.
// Each task links back to its parent opportunity in /admin/opportunities.
// ============================================================

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// ---- V6 task types (mirrored from OpportunitiesAdmin.tsx) ----
type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
type TaskPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

interface FollowUpTask {
  id: string;
  opportunity_id: string;
  dedup_key: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_user_id: string | null;
  created_by: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  assignee_name: string | null;
  created_by_name: string | null;
  // Cross-opportunity endpoint adds these joined fields:
  opportunity_type?: string;
  rule?: string;
  opportunity_status?: string;
}

interface TaskListResponse {
  tasks: FollowUpTask[];
  count: number;
}

interface InternalUser {
  id: string;
  name: string;
  email: string;
  user_type: string;
  role: string;
  is_active: number | boolean;
}

const TASK_STATUS_OPTIONS: TaskStatus[] = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const TASK_PRIORITY_OPTIONS: TaskPriority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

const TASK_STATUS_LABEL_KEYS: Record<TaskStatus, TranslationKey> = {
  PENDING: 'opps.taskStatusPending',
  IN_PROGRESS: 'opps.taskStatusInProgress',
  COMPLETED: 'opps.taskStatusCompleted',
  CANCELLED: 'opps.taskStatusCancelled',
};

const TASK_PRIORITY_LABEL_KEYS: Record<TaskPriority, TranslationKey> = {
  CRITICAL: 'opps.taskPriorityCritical',
  HIGH: 'opps.taskPriorityHigh',
  MEDIUM: 'opps.taskPriorityMedium',
  LOW: 'opps.taskPriorityLow',
};

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function FollowUpTasksAdmin() {
  const { t } = useLanguage();
  const { token, user } = useAuth();

  const [tasks, setTasks] = useState<FollowUpTask[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterPriority, setFilterPriority] = useState<string>('');
  const [filterAssignee, setFilterAssignee] = useState<string>('');

  // Internal users (for assignee filter dropdown + display)
  const [internalUsers, setInternalUsers] = useState<InternalUser[] | null>(null);

  // Inline update state
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // ---- Load task list ----
  const loadTasks = useCallback(async () => {
    if (!token) {
      setTasks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const url = new URL(`${API_URL}/api/admin/follow-up-tasks`);
      if (filterStatus) url.searchParams.set('status', filterStatus);
      if (filterPriority) url.searchParams.set('priority', filterPriority);
      if (filterAssignee === 'unassigned') {
        // No direct API param for unassigned; client-side filter
      } else if (filterAssignee === 'mine' && user) {
        url.searchParams.set('assigneeUserId', user.id);
      } else if (filterAssignee) {
        url.searchParams.set('assigneeUserId', filterAssignee);
      }
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) { setError(t('common.errAuth')); setTasks([]); return; }
      if (res.status === 403) { setError(t('common.errInternal')); setTasks([]); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as TaskListResponse;
      let list = data.tasks ?? [];
      // Client-side "unassigned" filter
      if (filterAssignee === 'unassigned') {
        list = list.filter(tk => !tk.assignee_user_id);
      }
      setTasks(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('opps.tasksLoadError'));
      setTasks(null);
    } finally {
      setLoading(false);
    }
  }, [token, filterStatus, filterPriority, filterAssignee, user]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  // ---- Load internal users ----
  const loadInternalUsers = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { users: InternalUser[] };
      setInternalUsers((data.users ?? []).filter(u => u.user_type === 'internal'));
    } catch {
      setInternalUsers([]);
    }
  }, [token]);

  useEffect(() => { loadInternalUsers(); }, [loadInternalUsers]);

  // ---- Inline task update (status / priority / assignee) ----
  const handleUpdate = useCallback(async (taskId: string, patch: Record<string, unknown>) => {
    if (!token || updatingId) return;
    setUpdatingId(taskId);
    setUpdateError(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/follow-up-tasks/${encodeURIComponent(taskId)}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error || `HTTP ${res.status}`);
      }
      await loadTasks();
    } catch (e) {
      setUpdateError(e instanceof Error ? e.message : t('opps.tasksUpdateError'));
    } finally {
      setUpdatingId(null);
    }
  }, [token, updatingId, loadTasks]);

  // ---- Summary chips ----
  const summary = tasks ? {
    total: tasks.length,
    open: tasks.filter(t => t.status === 'PENDING' || t.status === 'IN_PROGRESS').length,
    completed: tasks.filter(t => t.status === 'COMPLETED').length,
    cancelled: tasks.filter(t => t.status === 'CANCELLED').length,
  } : null;

  return (
    <div className="container" style={{ padding: '40px 0 64px' }}>
      {/* Page header */}
      <div className="page-header" style={{ marginBottom: 24 }}>
        <span className="admin-eyebrow">
          <span className="admin-eyebrow-dot" />
          {t('tasks.eyebrow')}
        </span>
        <h1 className="page-title">{t('tasks.title')}</h1>
        <p className="page-subtitle">{t('tasks.subtitle')}</p>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/admin/opportunities" className="btn btn-ghost btn-sm">{t('opps.title')}</Link>
          <Link to="/admin/supply-requests" className="btn btn-ghost btn-sm">{t('admin.title')}</Link>
          <Link to="/admin/rfqs" className="btn btn-ghost btn-sm">{t('rfq.title')}</Link>
          <Link to="/admin/products" className="btn btn-ghost btn-sm">{t('nav.adminProducts')}</Link>
        </div>
      </div>

      {/* Summary tiles */}
      {summary && (
        <div className="admin-summary-grid" style={{ marginBottom: 24 }}>
          <div className="admin-summary-tile admin-summary-tile-primary">
            <span className="admin-summary-tile-value">{summary.total}</span>
            <span className="admin-summary-tile-label">{t('opps.taskAllCount')}</span>
          </div>
          <div className="admin-summary-tile admin-summary-tile-warning">
            <span className="admin-summary-tile-value">{summary.open}</span>
            <span className="admin-summary-tile-label">{t('opps.taskOpenCount')}</span>
          </div>
          <div className="admin-summary-tile admin-summary-tile-success">
            <span className="admin-summary-tile-value">{summary.completed}</span>
            <span className="admin-summary-tile-label">{t('opps.taskStatusCompleted')}</span>
          </div>
          <div className="admin-summary-tile admin-summary-tile-neutral">
            <span className="admin-summary-tile-value">{summary.cancelled}</span>
            <span className="admin-summary-tile-label">{t('opps.taskStatusCancelled')}</span>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="tasks-filters" role="region" aria-label={t('tasks.ariaFilter')}>
        <div className="opps-filter-item">
          <label className="opps-filter-label" htmlFor="tasks-filter-status">{t('opps.taskFilterStatus')}</label>
          <select
            id="tasks-filter-status"
            className="form-select"
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
          >
            <option value="">{t('opps.taskFilterAll')}</option>
            {TASK_STATUS_OPTIONS.map(s => (
              <option key={s} value={s}>{t(TASK_STATUS_LABEL_KEYS[s])}</option>
            ))}
          </select>
        </div>
        <div className="opps-filter-item">
          <label className="opps-filter-label" htmlFor="tasks-filter-priority">{t('opps.taskFilterPriority')}</label>
          <select
            id="tasks-filter-priority"
            className="form-select"
            value={filterPriority}
            onChange={e => setFilterPriority(e.target.value)}
          >
            <option value="">{t('opps.taskFilterAll')}</option>
            {TASK_PRIORITY_OPTIONS.map(p => (
              <option key={p} value={p}>{t(TASK_PRIORITY_LABEL_KEYS[p])}</option>
            ))}
          </select>
        </div>
        <div className="opps-filter-item">
          <label className="opps-filter-label" htmlFor="tasks-filter-assignee">{t('opps.taskFilterAssignee')}</label>
          <select
            id="tasks-filter-assignee"
            className="form-select"
            value={filterAssignee}
            onChange={e => setFilterAssignee(e.target.value)}
          >
            <option value="">{t('opps.taskFilterAll')}</option>
            <option value="unassigned">{t('opps.taskFilterUnassigned')}</option>
            <option value="mine">{t('opps.taskFilterAssignedToMe')}</option>
            {internalUsers && internalUsers.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        <div className="opps-filter-item" style={{ justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={loadTasks}
            disabled={loading}
          >
            {loading ? t('common.loading') : t('tasks.refresh')}
          </button>
        </div>
      </div>

      {/* Task list */}
      {loading && <LoadingState type="card" count={3} />}

      {error && !loading && (
        <div className="admin-error-state" role="alert">
          <p className="admin-error-title">{t('opps.tasksLoadError')}</p>
          <p className="admin-error-detail">{error}</p>
          <button type="button" className="btn btn-outline btn-sm" onClick={loadTasks}>
            {t('common.retry')}
          </button>
        </div>
      )}

      {!loading && !error && tasks && tasks.length === 0 && (
        <EmptyState
          title={t('tasks.emptyTitle')}
          description={t('tasks.emptyDesc')}
        />
      )}

      {!loading && !error && tasks && tasks.length > 0 && (
        <div className="tasks-table-wrap">
          <table className="tasks-table">
            <thead>
              <tr>
                <th>{t('tasks.colTitle')}</th>
                <th>{t('tasks.colPriority')}</th>
                <th>{t('tasks.colStatus')}</th>
                <th>{t('tasks.colAssignee')}</th>
                <th>{t('tasks.colOpportunity')}</th>
                <th>{t('tasks.colDueDate')}</th>
                <th>{t('tasks.colCreated')}</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map(tk => (
                <tr key={tk.id}>
                  <td className="tasks-table-cell-title">
                    <div style={{ fontWeight: 600 }}>{tk.title}</div>
                    {tk.description && (
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-500)', marginTop: 2 }}>
                        {tk.description.length > 100 ? tk.description.slice(0, 100) + '…' : tk.description}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={`opps-priority-badge opps-priority-badge-${tk.priority}`}>
                      {t(TASK_PRIORITY_LABEL_KEYS[tk.priority])}
                    </span>
                  </td>
                  <td>
                    <select
                      className="opps-task-status-select"
                      value={tk.status}
                      onChange={e => handleUpdate(tk.id, { status: e.target.value })}
                      disabled={updatingId === tk.id}
                      aria-label={t('opps.taskStatus')}
                    >
                      {TASK_STATUS_OPTIONS.map(s => (
                        <option key={s} value={s}>{t(TASK_STATUS_LABEL_KEYS[s])}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className="opps-task-assign-select"
                      value={tk.assignee_user_id || ''}
                      onChange={e => handleUpdate(tk.id, e.target.value ? { assigneeUserId: e.target.value } : { assigneeUserId: null })}
                      disabled={updatingId === tk.id}
                      aria-label={t('opps.taskAssignee')}
                    >
                      <option value="">{t('opps.taskUnassigned')}</option>
                      {internalUsers && internalUsers.map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="tasks-table-cell-opp">
                    <div className="tasks-table-cell-opp-type">
                      {tk.opportunity_type ? tk.opportunity_type.replace(/_/g, ' ').toLowerCase() : '—'}
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <Link to={`/admin/opportunities`} title={t('tasks.viewOpportunity')}>
                        {tk.rule || '—'} · {tk.opportunity_status || '—'}
                      </Link>
                    </div>
                  </td>
                  <td>{formatDate(tk.due_date)}</td>
                  <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-500)' }}>
                    {formatDateTime(tk.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {updateError && (
        <p className="opps-action-error" role="alert" style={{ marginTop: 12 }}>
          {t('opps.tasksUpdateError')} {updateError}
        </p>
      )}
    </div>
  );
}
