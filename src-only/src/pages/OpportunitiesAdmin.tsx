import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { LoadingState, EmptyState } from '../components/LoadingEmptyStates';
import type { TranslationKey } from '../i18n/translations';

// ============================================================
// OpportunitiesAdmin — V4 Internal Opportunity Management Dashboard
// Route: /admin/opportunities  (ProtectedRoute requireInternal)
//
// Consumes existing V3 backend APIs (no backend changes):
//   POST   /api/admin/activity/opportunities/sync
//   GET    /api/admin/activity/opportunities/tracked
//   GET    /api/admin/activity/opportunities/:id
//   PATCH  /api/admin/activity/opportunities/:id
//   POST   /api/admin/activity/opportunities/:id/actions
//   GET    /api/users                          (for assignment dropdown)
//
// All write operations go through the existing V3 authorization
// (requireInternal). The frontend only renders what the API returns.
// ============================================================

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// ---- API response shapes (match api/server.ts exactly) ----

interface TrackedOpportunity {
  id: string;
  opportunity_type:
    | 'STARTED_REQUEST_NOT_SUBMITTED'
    | 'REPEATED_PRODUCT_VIEWS_NO_SUBMISSION'
    | 'PRODUCT_INTEREST_NO_CONVERSION';
  dedup_key: string;
  rule: 'RULE_A' | 'RULE_B' | 'RULE_C';
  user_id: string | null;
  company_id: string | null;
  product_id: string | null;
  reason: string;
  evidence_json: string | null;
  status: 'NEW' | 'UNDER_REVIEW' | 'CONTACTED' | 'CONVERTED' | 'DISMISSED';
  assigned_to: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields (from the V3 tracked endpoint SELECT)
  assigned_to_name: string | null;
  user_name: string | null;
  company_name: string | null;
  product_name: string | null;
  product_sku: string | null;
  // V5 — optional priority fields (only present when fetched from /prioritized)
  priority_score?: number;
  priority_level?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  priority_factors?: PriorityFactor[];
}

// V5 — priority factor shape (matches backend computeOpportunityPriority output)
interface PriorityFactor {
  key: string;
  label: string;
  points: number;
  max: number;
  reason: string;
}

interface PriorityInfo {
  score: number;
  level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  factors: PriorityFactor[];
}

interface OpportunityAction {
  id: string;
  opportunity_id: string;
  action_type:
    | 'REVIEWED' | 'CONTACT_ATTEMPTED' | 'CUSTOMER_CONTACTED'
    | 'FOLLOW_UP_REQUIRED' | 'QUOTE_REQUESTED' | 'CONVERTED' | 'DISMISSED'
    | 'ASSIGNED' | 'REASSIGNED' | 'STATUS_CHANGED';
  actor_id: string;
  note: string | null;
  previous_status: string | null;
  new_status: string | null;
  created_at: string;
  // Joined field
  actor_name: string | null;
}

interface OpportunityDetailResponse {
  opportunity: TrackedOpportunity;
  actions: OpportunityAction[];
  actionCount: number;
  // V5 — priority info included in detail response
  priority?: PriorityInfo;
}

// V6 — Follow-up Task types (matches api/server.ts V6 response shape)
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
  // Joined fields
  assignee_name: string | null;
  created_by_name: string | null;
  // Only present when fetched from cross-opportunity endpoint
  opportunity_type?: string;
  rule?: string;
  opportunity_status?: string;
}

interface TaskListResponse {
  tasks: FollowUpTask[];
  count: number;
}

interface TrackedListResponse {
  opportunities: TrackedOpportunity[];
  count: number;
  // V5 — present only from /prioritized endpoint
  totalAvailable?: number;
}

interface SyncResponse {
  created: number;
  skipped: number;
  totalProcessed: number;
}

interface InternalUser {
  id: string;
  name: string;
  email: string;
  user_type: string;
  role: string;
  is_active: number | boolean;
}

// ---- Constants derived from V3 schema ----

const STATUS_OPTIONS: TrackedOpportunity['status'][] = [
  'NEW', 'UNDER_REVIEW', 'CONTACTED', 'CONVERTED', 'DISMISSED',
];

// User-selectable action types via POST /actions (V3 backend validates these)
const USER_ACTION_TYPES = [
  'REVIEWED',
  'CONTACT_ATTEMPTED',
  'CUSTOMER_CONTACTED',
  'FOLLOW_UP_REQUIRED',
  'QUOTE_REQUESTED',
  'CONVERTED',
  'DISMISSED',
] as const;

const OPPORTUNITY_TYPES: TrackedOpportunity['opportunity_type'][] = [
  'STARTED_REQUEST_NOT_SUBMITTED',
  'REPEATED_PRODUCT_VIEWS_NO_SUBMISSION',
  'PRODUCT_INTEREST_NO_CONVERSION',
];

const RULES: TrackedOpportunity['rule'][] = ['RULE_A', 'RULE_B', 'RULE_C'];

// All 10 action types that can appear in history (system-generated ones included)
const ALL_ACTION_TYPE_KEYS: Record<OpportunityAction['action_type'], TranslationKey> = {
  REVIEWED: 'opps.actionTypeReviewed',
  CONTACT_ATTEMPTED: 'opps.actionTypeContactAttempted',
  CUSTOMER_CONTACTED: 'opps.actionTypeCustomerContacted',
  FOLLOW_UP_REQUIRED: 'opps.actionTypeFollowUpRequired',
  QUOTE_REQUESTED: 'opps.actionTypeQuoteRequested',
  CONVERTED: 'opps.actionTypeConverted',
  DISMISSED: 'opps.actionTypeDismissed',
  ASSIGNED: 'opps.actionTypeAssigned',
  REASSIGNED: 'opps.actionTypeReassigned',
  STATUS_CHANGED: 'opps.actionTypeStatusChanged',
};

const STATUS_BADGE: Record<TrackedOpportunity['status'], string> = {
  NEW: 'badge-info',
  UNDER_REVIEW: 'badge-warning',
  CONTACTED: 'badge-info',
  CONVERTED: 'badge-success',
  DISMISSED: 'badge-neutral',
};

const STATUS_LABEL_KEYS: Record<TrackedOpportunity['status'], TranslationKey> = {
  NEW: 'opps.statusNew',
  UNDER_REVIEW: 'opps.statusUnderReview',
  CONTACTED: 'opps.statusContacted',
  CONVERTED: 'opps.statusConverted',
  DISMISSED: 'opps.statusDismissed',
};

const TYPE_LABEL_KEYS: Record<TrackedOpportunity['opportunity_type'], TranslationKey> = {
  STARTED_REQUEST_NOT_SUBMITTED: 'opps.typeStarted',
  REPEATED_PRODUCT_VIEWS_NO_SUBMISSION: 'opps.typeRepeated',
  PRODUCT_INTEREST_NO_CONVERSION: 'opps.typeProduct',
};

const RULE_LABEL_KEYS: Record<TrackedOpportunity['rule'], TranslationKey> = {
  RULE_A: 'opps.ruleA',
  RULE_B: 'opps.ruleB',
  RULE_C: 'opps.ruleC',
};

// V5 — Priority level translation keys
const PRIORITY_LABEL_KEYS: Record<NonNullable<TrackedOpportunity['priority_level']>, TranslationKey> = {
  CRITICAL: 'opps.priorityCritical',
  HIGH: 'opps.priorityHigh',
  MEDIUM: 'opps.priorityMedium',
  LOW: 'opps.priorityLow',
};

// V6 — Task status + priority constants (mirror backend CHECK constraints)
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

// ---- Helpers ----

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

function safeParseEvidence(json: string | null): { ok: true; data: unknown } | { ok: false } {
  if (!json) return { ok: false };
  try {
    const parsed = JSON.parse(json);
    return { ok: true, data: parsed };
  } catch {
    return { ok: false };
  }
}

function renderEvidencePretty(json: string | null): string {
  const result = safeParseEvidence(json);
  if (!result.ok) return '';
  return JSON.stringify(result.data, null, 2);
}

// ============================================================
// Main component
// ============================================================

export default function OpportunitiesAdmin() {
  const { t } = useLanguage();
  const { token, user } = useAuth();

  // --- List state ---
  const [list, setList] = useState<TrackedOpportunity[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);

  // --- Filters ---
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterRule, setFilterRule] = useState<string>('');
  const [filterAssignment, setFilterAssignment] = useState<string>('');
  const [filterSearch, setFilterSearch] = useState<string>('');

  // V5 — Priority sort toggle (default ON: prioritize most important first)
  const [sortByPriority, setSortByPriority] = useState<boolean>(true);

  // --- Selected + detail ---
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OpportunityDetailResponse | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // --- Internal users for assignment (loaded once) ---
  const [internalUsers, setInternalUsers] = useState<InternalUser[] | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);

  // --- Sync state ---
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResponse | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // --- Status update state ---
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  // --- Assignment state ---
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  // --- Action recorder state ---
  const [actionType, setActionType] = useState<string>('');
  const [actionNote, setActionNote] = useState<string>('');
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // --- V6 — Follow-up Tasks state ---
  const [tasks, setTasks] = useState<FollowUpTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  // New task form
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>('MEDIUM');
  const [newTaskAssignee, setNewTaskAssignee] = useState<string>('');
  const [newTaskDueDate, setNewTaskDueDate] = useState<string>('');
  const [taskCreating, setTaskCreating] = useState(false);
  const [taskCreateError, setTaskCreateError] = useState<string | null>(null);
  // Inline update state (per-task)
  const [taskUpdatingId, setTaskUpdatingId] = useState<string | null>(null);
  const [taskUpdateError, setTaskUpdateError] = useState<string | null>(null);

  // Refs to prevent race conditions
  const lastSelectedIdRef = useRef<string | null>(null);

  // ---- Load list ----
  // V5: when sortByPriority is ON, fetch from /prioritized (server-sorted by score DESC);
  // when OFF, fetch from /tracked (V3 behavior, sorted by created_at DESC).
  const loadList = useCallback(async () => {
    if (!token) {
      setList([]);
      setListLoading(false);
      return;
    }
    setListLoading(true);
    setListError(null);
    try {
      const endpoint = sortByPriority
        ? `${API_URL}/api/admin/activity/opportunities/prioritized`
        : `${API_URL}/api/admin/activity/opportunities/tracked`;
      const url = new URL(endpoint);
      if (filterStatus) url.searchParams.set('status', filterStatus);
      if (sortByPriority) url.searchParams.set('limit', '100');
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        setListError(t('common.errAuth'));
        setList([]);
        return;
      }
      if (res.status === 403) {
        setListError(t('common.errInternal'));
        setList([]);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as TrackedListResponse;
      setList(data.opportunities ?? []);
    } catch (e) {
      setListError(e instanceof Error ? e.message : t('opps.loadError'));
      setList(null);
    } finally {
      setListLoading(false);
    }
  }, [token, filterStatus, sortByPriority]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  // ---- Load detail when selection changes ----
  const loadDetail = useCallback(async (id: string) => {
    if (!token) return;
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    setStatusError(null);
    setAssignError(null);
    setActionError(null);
    setActionType('');
    setActionNote('');
    // V6 — reset task state on detail change
    setTasks([]);
    setTasksError(null);
    setNewTaskTitle('');
    setNewTaskDescription('');
    setNewTaskPriority('MEDIUM');
    setNewTaskAssignee('');
    setNewTaskDueDate('');
    setTaskCreateError(null);
    setTaskUpdateError(null);
    setTaskUpdatingId(null);
    try {
      const res = await fetch(
        `${API_URL}/api/admin/activity/opportunities/${encodeURIComponent(id)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.status === 401) {
        setDetailError(t('common.errAuth'));
        return;
      }
      if (res.status === 403) {
        setDetailError(t('common.errInternal'));
        return;
      }
      if (res.status === 404) {
        setDetailError(t('opps.errNotFound'));
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as OpportunityDetailResponse;
      setDetail(data);
      // V6 — fetch tasks for this opportunity (fire-and-forget; non-fatal if it fails)
      loadTasks(id);
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : t('opps.detailLoadError'));
    } finally {
      setDetailLoading(false);
    }
  }, [token]);

  // ---- V6 — Load tasks for an opportunity ----
  const loadTasks = useCallback(async (oppId: string) => {
    if (!token) return;
    setTasksLoading(true);
    setTasksError(null);
    try {
      const res = await fetch(
        `${API_URL}/api/admin/activity/opportunities/${encodeURIComponent(oppId)}/tasks`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as TaskListResponse;
      setTasks(data.tasks ?? []);
    } catch (e) {
      setTasksError(e instanceof Error ? e.message : t('opps.tasksLoadError'));
      setTasks([]);
    } finally {
      setTasksLoading(false);
    }
  }, [token]);

  // ---- V6 — Create a new task on the current opportunity ----
  const handleCreateTask = useCallback(async () => {
    if (!token || !detail || taskCreating) return;
    const title = newTaskTitle.trim();
    if (!title) {
      setTaskCreateError(t('opps.errTitleRequired'));
      return;
    }
    setTaskCreating(true);
    setTaskCreateError(null);
    try {
      const body: Record<string, unknown> = { title, priority: newTaskPriority };
      if (newTaskDescription.trim()) body.description = newTaskDescription.trim();
      if (newTaskAssignee) body.assigneeUserId = newTaskAssignee;
      if (newTaskDueDate) body.dueDate = newTaskDueDate;
      const res = await fetch(
        `${API_URL}/api/admin/activity/opportunities/${encodeURIComponent(detail.opportunity.id)}/tasks`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error || `HTTP ${res.status}`);
      }
      // Reset form + refresh task list
      setNewTaskTitle('');
      setNewTaskDescription('');
      setNewTaskPriority('MEDIUM');
      setNewTaskAssignee('');
      setNewTaskDueDate('');
      await loadTasks(detail.opportunity.id);
    } catch (e) {
      setTaskCreateError(e instanceof Error ? e.message : t('opps.tasksCreateError'));
    } finally {
      setTaskCreating(false);
    }
  }, [token, detail, taskCreating, newTaskTitle, newTaskDescription, newTaskPriority, newTaskAssignee, newTaskDueDate, loadTasks]);

  // ---- V6 — Update a task inline (status, priority, assignee) ----
  const handleUpdateTask = useCallback(async (taskId: string, patch: Record<string, unknown>) => {
    if (!token || !detail || taskUpdatingId) return;
    setTaskUpdatingId(taskId);
    setTaskUpdateError(null);
    try {
      const res = await fetch(
        `${API_URL}/api/admin/follow-up-tasks/${encodeURIComponent(taskId)}`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        },
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error || `HTTP ${res.status}`);
      }
      await loadTasks(detail.opportunity.id);
    } catch (e) {
      setTaskUpdateError(e instanceof Error ? e.message : t('opps.tasksUpdateError'));
    } finally {
      setTaskUpdatingId(null);
    }
  }, [token, detail, taskUpdatingId, loadTasks]);

  const selectOpportunity = useCallback((id: string) => {
    if (lastSelectedIdRef.current === id) return;
    lastSelectedIdRef.current = id;
    setSelectedId(id);
    loadDetail(id);
  }, [loadDetail]);

  // ---- Load internal users (for assignment dropdown) — once on mount ----
  const loadInternalUsers = useCallback(async () => {
    if (!token) return;
    setUsersLoading(true);
    setUsersError(null);
    try {
      const res = await fetch(`${API_URL}/api/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { users: InternalUser[]; count: number };
      // Filter to internal users only — frontend safety mirror of the backend's
      // own check (the V3 PATCH endpoint also rejects customer assignees).
      const internal = (data.users ?? []).filter(u => u.user_type === 'internal');
      setInternalUsers(internal);
    } catch (e) {
      setUsersError(e instanceof Error ? e.message : t('opps.errLoadUsers'));
      setInternalUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadInternalUsers();
  }, [loadInternalUsers]);

  // ---- Sync ----
  const handleSync = useCallback(async () => {
    if (!token || syncing) return;
    setSyncing(true);
    setSyncError(null);
    setSyncResult(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/activity/opportunities/sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        setSyncError(t('common.errAuth'));
        return;
      }
      if (res.status === 403) {
        setSyncError(t('common.errInternal'));
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as SyncResponse;
      setSyncResult(data);
      // Refresh the list after a successful sync
      await loadList();
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : t('opps.errSync'));
    } finally {
      setSyncing(false);
    }
  }, [token, syncing, loadList]);

  // ---- Status update (PATCH) ----
  const handleStatusChange = useCallback(async (newStatus: TrackedOpportunity['status']) => {
    if (!token || !detail || statusSaving) return;
    const oppId = detail.opportunity.id;
    if (detail.opportunity.status === newStatus) return;
    setStatusSaving(true);
    setStatusError(null);
    try {
      const res = await fetch(
        `${API_URL}/api/admin/activity/opportunities/${encodeURIComponent(oppId)}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: newStatus }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { opportunity: TrackedOpportunity };
      // Update local detail with the server response
      setDetail(prev => prev ? { ...prev, opportunity: { ...prev.opportunity, ...data.opportunity } } : prev);
      // Also update the list row so the list reflects the new status
      setList(prev => prev ? prev.map(o => o.id === oppId ? { ...o, ...data.opportunity } : o) : prev);
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : t('opps.statusUpdateError'));
    } finally {
      setStatusSaving(false);
    }
  }, [token, detail, statusSaving]);

  // ---- Assignment update (PATCH) ----
  const handleAssignmentChange = useCallback(async (newAssignedTo: string | null) => {
    if (!token || !detail || assignSaving) return;
    const oppId = detail.opportunity.id;
    if (detail.opportunity.assigned_to === newAssignedTo) return;
    setAssignSaving(true);
    setAssignError(null);
    try {
      const res = await fetch(
        `${API_URL}/api/admin/activity/opportunities/${encodeURIComponent(oppId)}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ assignedTo: newAssignedTo }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { opportunity: TrackedOpportunity };
      // After successful assignment, refresh the full detail to get the latest
      // action history (the backend records an ASSIGNED or REASSIGNED action).
      await loadDetail(oppId);
      setList(prev => prev ? prev.map(o => o.id === oppId ? { ...o, ...data.opportunity } : o) : prev);
    } catch (e) {
      setAssignError(e instanceof Error ? e.message : t('opps.assignError'));
    } finally {
      setAssignSaving(false);
    }
  }, [token, detail, assignSaving, loadDetail]);

  // ---- Record action (POST /actions) ----
  const handleRecordAction = useCallback(async () => {
    if (!token || !detail || actionSubmitting) return;
    if (!actionType) {
      setActionError(t('opps.errSelectActionType'));
      return;
    }
    const oppId = detail.opportunity.id;
    setActionSubmitting(true);
    setActionError(null);
    try {
      const body: { actionType: string; note?: string } = { actionType };
      const trimmedNote = actionNote.trim();
      if (trimmedNote) body.note = trimmedNote;
      const res = await fetch(
        `${API_URL}/api/admin/activity/opportunities/${encodeURIComponent(oppId)}/actions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      // Success — clear form and refresh detail (action + any auto-status change)
      setActionType('');
      setActionNote('');
      await loadDetail(oppId);
      // Also refresh the list row (status may have changed)
      setList(prev => prev ? prev.map(o => {
        if (o.id !== oppId) return o;
        return {
          ...o,
          status: detail?.opportunity.status || o.status,
          updated_at: new Date().toISOString(),
        };
      }) : prev);
      // Re-fetch list to get fresh status (more reliable than optimistic update)
      await loadList();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t('opps.actionError'));
    } finally {
      setActionSubmitting(false);
    }
  }, [token, detail, actionType, actionNote, actionSubmitting, loadDetail, loadList]);

  // ---- Client-side filtering (server only supports status filter) ----
  const filteredList = list ? list.filter(opp => {
    if (filterType && opp.opportunity_type !== filterType) return false;
    if (filterRule && opp.rule !== filterRule) return false;
    if (filterAssignment === 'unassigned' && opp.assigned_to) return false;
    if (filterAssignment === 'assigned' && !opp.assigned_to) return false;
    if (filterAssignment === 'mine' && opp.assigned_to !== user?.id) return false;
    if (filterSearch.trim()) {
      const q = filterSearch.trim().toLowerCase();
      const haystack = [
        opp.reason,
        opp.company_name,
        opp.product_name,
        opp.product_sku,
        opp.user_name,
        opp.opportunity_type,
        opp.rule,
        opp.dedup_key,
      ].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  }) : null;

  // ---- Summary tiles ----
  const summary = list ? {
    total: list.length,
    NEW: list.filter(o => o.status === 'NEW').length,
    UNDER_REVIEW: list.filter(o => o.status === 'UNDER_REVIEW').length,
    CONTACTED: list.filter(o => o.status === 'CONTACTED').length,
    CONVERTED: list.filter(o => o.status === 'CONVERTED').length,
    DISMISSED: list.filter(o => o.status === 'DISMISSED').length,
  } : null;

  return (
    <div className="container" style={{ padding: '40px 0 64px' }}>
      {/* Page header */}
      <div className="page-header" style={{ marginBottom: 24 }}>
        <span className="admin-eyebrow">
          <span className="admin-eyebrow-dot" />
          {t('opps.eyebrow')}
        </span>
        <h1 className="page-title">{t('opps.title')}</h1>
        <p className="page-subtitle">{t('opps.subtitle')}</p>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/admin/supply-requests" className="btn btn-ghost btn-sm">{t('admin.title')}</Link>
          <Link to="/admin/rfqs" className="btn btn-ghost btn-sm">{t('rfq.title')}</Link>
          <Link to="/admin/products" className="btn btn-ghost btn-sm">{t('nav.adminProducts')}</Link>
          <Link to="/admin/suppliers" className="btn btn-ghost btn-sm">{t('suppliers.title')}</Link>
          <Link to="/admin/tasks" className="btn btn-ghost btn-sm">{t('tasks.title')}</Link>
        </div>
      </div>

      {/* Sync control bar */}
      <div className="opps-sync-bar" role="region" aria-label={t('opps.ariaSync')}>
        <div>
          <p className="opps-sync-hint">{t('opps.syncHint')}</p>
          {syncResult && !syncError && (
            <p className="opps-sync-result" role="status">
              {t('opps.syncResult')} · {t('opps.summaryNew')}: {syncResult.created} · skipped: {syncResult.skipped} · total: {syncResult.totalProcessed}
            </p>
          )}
          {syncError && (
            <p className="opps-sync-result opps-sync-result-error" role="alert">
              {t('opps.syncError')}: {syncError}
            </p>
          )}
        </div>
        <div className="opps-sync-actions">
          {/* V5 — Sort toggle: Priority (default ON) vs Newest */}
          <button
            type="button"
            className={`btn btn-sm opps-sort-toggle ${sortByPriority ? 'opps-sort-toggle-active' : 'btn-outline'}`}
            onClick={() => setSortByPriority(prev => !prev)}
            aria-pressed={sortByPriority}
            title={t('opps.prioritySortHint')}
          >
            <PriorityIcon />
            <span style={{ marginInlineStart: 6 }}>
              {sortByPriority ? t('opps.sortByPriority') : t('opps.sortByCreated')}
            </span>
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleSync}
            disabled={syncing}
            aria-label={t('opps.sync')}
          >
            {syncing ? <RefreshIcon spinning /> : <SyncIcon />}
            <span style={{ marginInlineStart: 6 }}>{syncing ? t('opps.syncing') : t('opps.sync')}</span>
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={loadList}
            disabled={listLoading}
          >
            <RefreshIcon spinning={listLoading} />
            <span style={{ marginInlineStart: 6 }}>{t('opps.refresh')}</span>
          </button>
        </div>
      </div>

      {/* Summary tiles */}
      {summary && (
        <div className="admin-summary-grid" style={{ marginBottom: 24 }}>
          <SummaryTile label={t('opps.summaryNew')} value={summary.NEW} variant="info" />
          <SummaryTile label={t('opps.summaryReview')} value={summary.UNDER_REVIEW} variant="warning" />
          <SummaryTile label={t('opps.summaryContacted')} value={summary.CONTACTED} variant="info" />
          <SummaryTile label={t('opps.summaryConverted')} value={summary.CONVERTED} variant="success" />
          <SummaryTile label={t('opps.summaryDismissed')} value={summary.DISMISSED} variant="neutral" />
        </div>
      )}

      {/* Filter bar */}
      <div className="opps-filters" role="region" aria-label={t('opps.ariaFilter')}>
        <div className="opps-filter-item">
          <label className="opps-filter-label" htmlFor="opps-filter-status">{t('opps.filterStatus')}</label>
          <select
            id="opps-filter-status"
            className="form-select"
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
          >
            <option value="">{t('opps.filterAllStatuses')}</option>
            {STATUS_OPTIONS.map(s => (
              <option key={s} value={s}>{t(STATUS_LABEL_KEYS[s])}</option>
            ))}
          </select>
        </div>
        <div className="opps-filter-item">
          <label className="opps-filter-label" htmlFor="opps-filter-type">{t('opps.filterType')}</label>
          <select
            id="opps-filter-type"
            className="form-select"
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
          >
            <option value="">{t('opps.filterAllTypes')}</option>
            {OPPORTUNITY_TYPES.map(tp => (
              <option key={tp} value={tp}>{t(TYPE_LABEL_KEYS[tp])}</option>
            ))}
          </select>
        </div>
        <div className="opps-filter-item">
          <label className="opps-filter-label" htmlFor="opps-filter-rule">{t('opps.filterRule')}</label>
          <select
            id="opps-filter-rule"
            className="form-select"
            value={filterRule}
            onChange={e => setFilterRule(e.target.value)}
          >
            <option value="">{t('opps.filterAllRules')}</option>
            {RULES.map(r => (
              <option key={r} value={r}>{t(RULE_LABEL_KEYS[r])}</option>
            ))}
          </select>
        </div>
        <div className="opps-filter-item">
          <label className="opps-filter-label" htmlFor="opps-filter-assignment">{t('opps.filterAssignment')}</label>
          <select
            id="opps-filter-assignment"
            className="form-select"
            value={filterAssignment}
            onChange={e => setFilterAssignment(e.target.value)}
          >
            <option value="">{t('opps.filterAllAssignments')}</option>
            <option value="unassigned">{t('opps.filterUnassigned')}</option>
            <option value="assigned">{t('opps.filterAssigned')}</option>
            <option value="mine">{t('opps.assignToMe')}</option>
          </select>
        </div>
        <div className="opps-filter-item">
          <label className="opps-filter-label" htmlFor="opps-filter-search">{t('common.search')}</label>
          <input
            id="opps-filter-search"
            type="search"
            className="form-input"
            placeholder={t('opps.filterSearch')}
            value={filterSearch}
            onChange={e => setFilterSearch(e.target.value)}
            aria-label={t('opps.filterSearch')}
          />
        </div>
      </div>

      {/* List + Detail layout */}
      <div className="admin-layout">
        {/* LIST */}
        <section className="admin-list-panel" aria-label={t('opps.ariaList')}>
          <header className="admin-list-header">
            <h2 className="admin-list-title">
              {t('opps.listTitle')}
              {filteredList && <span className="admin-list-count">({filteredList.length})</span>}
            </h2>
          </header>

          {listLoading && <LoadingState type="card" count={3} />}

          {listError && !listLoading && (
            <div className="admin-error-state" role="alert">
              <AlertIcon />
              <div>
                <p className="admin-error-title">{t('opps.loadError')}</p>
                <p className="admin-error-detail">{listError}</p>
                <button type="button" className="btn btn-outline btn-sm" onClick={loadList}>
                  {t('opps.retry')}
                </button>
              </div>
            </div>
          )}

          {!listLoading && !listError && filteredList && filteredList.length === 0 && (
            <EmptyState
              title={t('opps.emptyTitle')}
              description={t('opps.emptyDesc')}
              icon={<InboxIcon />}
            />
          )}

          {!listLoading && !listError && filteredList && filteredList.length > 0 && (
            <ul className="admin-request-list">
              {filteredList.map(opp => {
                const isActive = selectedId === opp.id;
                return (
                  <li key={opp.id}>
                    <button
                      type="button"
                      className={`admin-request-row ${isActive ? 'admin-request-row-active' : ''}`}
                      onClick={() => selectOpportunity(opp.id)}
                      aria-pressed={isActive}
                    >
                      <div className="admin-request-row-top">
                        <span className="opps-row-type">{t(TYPE_LABEL_KEYS[opp.opportunity_type])}</span>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          {opp.priority_level && (
                            <span
                              className={`opps-priority-badge opps-priority-badge-${opp.priority_level}`}
                              title={opp.priority_score !== undefined ? `Score: ${opp.priority_score}/100` : undefined}
                            >
                              {opp.priority_score !== undefined ? `${opp.priority_score}` : ''} {t(PRIORITY_LABEL_KEYS[opp.priority_level])}
                            </span>
                          )}
                          <span className={`badge ${STATUS_BADGE[opp.status]}`}>
                            {t(STATUS_LABEL_KEYS[opp.status])}
                          </span>
                        </div>
                      </div>
                      <div className="admin-request-row-mid">
                        <span className="opps-rule-badge">{opp.rule}</span>
                        <span className="admin-request-sep">·</span>
                        <span className="admin-request-company">
                          {opp.company_name || opp.user_name || opp.product_name || opp.dedup_key}
                        </span>
                      </div>
                      <div className="opps-row-reason">{opp.reason}</div>
                      <div className="admin-request-row-bot">
                        <span className="opps-row-assignee">
                          {opp.assigned_to_name ? (
                            <>
                              <UserIcon />
                              {opp.assigned_to_name}
                            </>
                          ) : (
                            <span className="opps-row-assignee-none">{t('opps.unassigned')}</span>
                          )}
                        </span>
                        <span className="admin-request-date">{formatDateTime(opp.updated_at)}</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* DETAIL */}
        <section className="admin-detail-panel" aria-label={t('opps.ariaDetail')}>
          {!selectedId && !detailLoading && !detail && !detailError && (
            <div className="admin-detail-empty">
              <ClipboardIcon />
              <p>{t('opps.selectPrompt')}</p>
            </div>
          )}

          {detailLoading && <LoadingState type="detail" />}

          {detailError && !detailLoading && (
            <div className="admin-error-state" role="alert">
              <AlertIcon />
              <div>
                <p className="admin-error-title">{t('opps.detailLoadError')}</p>
                <p className="admin-error-detail">{detailError}</p>
                {selectedId && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => loadDetail(selectedId)}
                  >
                    {t('opps.retry')}
                  </button>
                )}
              </div>
            </div>
          )}

          {detail && !detailLoading && !detailError && (
            <article className="admin-detail-card">
              {/* Detail header */}
              <header className="admin-detail-header">
                <div>
                  <span className="admin-detail-eyebrow">{t('opps.fieldType')}</span>
                  <h3 className="admin-detail-reference">{t(TYPE_LABEL_KEYS[detail.opportunity.opportunity_type])}</h3>
                  <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span className="opps-rule-badge">{detail.opportunity.rule}</span>
                    <span className="admin-detail-meta-value mono" style={{ fontSize: '10px' }}>
                      {detail.opportunity.dedup_key}
                    </span>
                  </div>
                </div>
                <span className={`badge ${STATUS_BADGE[detail.opportunity.status]}`}>
                  {t(STATUS_LABEL_KEYS[detail.opportunity.status])}
                </span>
              </header>

              {/* Meta */}
              <div className="admin-detail-meta">
                <div className="admin-detail-meta-item">
                  <span className="admin-detail-meta-label">{t('opps.detailCreatedAt')}</span>
                  <span className="admin-detail-meta-value">{formatDateTime(detail.opportunity.created_at)}</span>
                </div>
                <div className="admin-detail-meta-item">
                  <span className="admin-detail-meta-label">{t('opps.detailUpdatedAt')}</span>
                  <span className="admin-detail-meta-value">{formatDateTime(detail.opportunity.updated_at)}</span>
                </div>
                <div className="admin-detail-meta-item">
                  <span className="admin-detail-meta-label">{t('opps.detailId')}</span>
                  <span className="admin-detail-meta-value mono">{detail.opportunity.id}</span>
                </div>
              </div>

              {/* V5 — PRIORITY SCORE BREAKDOWN (system-computed, read-only) */}
              {detail.priority && (
                <section className="admin-detail-section opps-priority-section">
                  <div className="opps-detail-section-title-row">
                    <h4 className="admin-detail-section-title">{t('opps.sectionPriority')}</h4>
                    <span className="opps-detail-section-desc">{t('opps.sectionPriorityDesc')}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
                    <div>
                      <span className="admin-detail-meta-label">{t('opps.priorityScore')}</span>
                      <div className={`opps-priority-score-num opps-priority-score-num-${detail.priority.level}`}>
                        {detail.priority.score}<span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-gray-500)' }}>/100</span>
                      </div>
                    </div>
                    <div>
                      <span className="admin-detail-meta-label">{t('opps.priorityLevel')}</span>
                      <div>
                        <span className={`opps-priority-badge opps-priority-badge-${detail.priority.level}`}>
                          {t(PRIORITY_LABEL_KEYS[detail.priority.level])}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="opps-priority-factors">
                    {detail.priority.factors.map(factor => {
                      const pct = factor.max > 0 ? Math.round((factor.points / factor.max) * 100) : 0;
                      return (
                        <div key={factor.key} className="opps-priority-factor-row">
                          <span className="opps-priority-factor-label">{factor.label}</span>
                          <span className="opps-priority-factor-points">
                            {factor.points}<span style={{ color: 'var(--color-gray-400)', fontWeight: 500 }}> / {factor.max}</span>
                          </span>
                          <span className="opps-priority-factor-points" style={{ color: 'var(--color-gray-500)', fontSize: 'var(--text-xs)' }}>
                            {pct}%
                          </span>
                          <div className="opps-priority-factor-bar">
                            <div className="opps-priority-factor-bar-fill" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="opps-priority-factor-reason">{factor.reason}</div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* SECTION A — SYSTEM INTELLIGENCE (read-only) */}
              <section className="admin-detail-section opps-detail-section-system">
                <div className="opps-detail-section-title-row">
                  <h4 className="admin-detail-section-title">{t('opps.sectionIntelligence')}</h4>
                  <span className="opps-detail-section-desc">{t('opps.sectionIntelligenceDesc')}</span>
                </div>
                <dl className="admin-detail-grid">
                  <div className="admin-detail-field">
                    <dt>{t('opps.fieldRule')}</dt>
                    <dd>
                      <span className="opps-rule-badge">{detail.opportunity.rule}</span>
                      <span style={{ marginInlineStart: 8 }}>
                        {t(RULE_LABEL_KEYS[detail.opportunity.rule])}
                      </span>
                    </dd>
                  </div>
                  <div className="admin-detail-field">
                    <dt>{t('opps.fieldType')}</dt>
                    <dd>{t(TYPE_LABEL_KEYS[detail.opportunity.opportunity_type])}</dd>
                  </div>
                  <div className="admin-detail-field" style={{ gridColumn: '1 / -1' }}>
                    <dt>{t('opps.fieldReason')}</dt>
                    <dd>{detail.opportunity.reason}</dd>
                  </div>
                  {/* Related user (RULE_A / RULE_B) */}
                  {detail.opportunity.user_id && (
                    <div className="admin-detail-field">
                      <dt>{t('opps.fieldUser')}</dt>
                      <dd>
                        {detail.opportunity.user_name || t('opps.relatedUserNone')}
                        <div className="mono" style={{ fontSize: '10px', color: 'var(--color-gray-400)' }}>
                          {detail.opportunity.user_id}
                        </div>
                      </dd>
                    </div>
                  )}
                  {/* Related company (RULE_A / RULE_B) */}
                  {detail.opportunity.company_id && (
                    <div className="admin-detail-field">
                      <dt>{t('opps.fieldCompany')}</dt>
                      <dd>
                        {detail.opportunity.company_name || '—'}
                        <div className="mono" style={{ fontSize: '10px', color: 'var(--color-gray-400)' }}>
                          {detail.opportunity.company_id}
                        </div>
                      </dd>
                    </div>
                  )}
                  {/* Related product (RULE_C) */}
                  {detail.opportunity.product_id && (
                    <div className="admin-detail-field">
                      <dt>{t('opps.fieldProduct')}</dt>
                      <dd>
                        {detail.opportunity.product_name ? (
                          <Link to={`/product/${encodeURIComponent(detail.opportunity.product_id)}`}>
                            {detail.opportunity.product_name}
                          </Link>
                        ) : (
                          detail.opportunity.product_id
                        )}
                        <div className="mono" style={{ fontSize: '10px', color: 'var(--color-gray-400)' }}>
                          {detail.opportunity.product_id}
                        </div>
                      </dd>
                    </div>
                  )}
                  {/* Product SKU */}
                  {detail.opportunity.product_sku && (
                    <div className="admin-detail-field">
                      <dt>{t('opps.fieldSku')}</dt>
                      <dd className="mono">{detail.opportunity.product_sku}</dd>
                    </div>
                  )}
                </dl>

                {/* Evidence block */}
                <div className="admin-detail-field">
                  <dt className="admin-detail-meta-label">{t('opps.fieldEvidence')}</dt>
                  <dd>
                    {(() => {
                      const pretty = renderEvidencePretty(detail.opportunity.evidence_json);
                      if (pretty) {
                        return (
                          <pre className="opps-evidence-block" aria-label={t('opps.ariaEvidence')}>
                            {pretty}
                          </pre>
                        );
                      }
                      if (detail.opportunity.evidence_json === null) {
                        return <span className="admin-detail-meta-value">—</span>;
                      }
                      return (
                        <p className="opps-evidence-block opps-evidence-parse-error">
                          {t('opps.evidenceParseError')}
                        </p>
                      );
                    })()}
                  </dd>
                </div>
              </section>

              {/* SECTION B — OPERATIONAL MANAGEMENT (employee-controlled) */}
              <section className="admin-detail-section opps-detail-section-employee">
                <div className="opps-detail-section-title-row">
                  <h4 className="admin-detail-section-title">{t('opps.sectionManagement')}</h4>
                  <span className="opps-detail-section-desc">{t('opps.sectionManagementDesc')}</span>
                </div>

                {/* Status control */}
                <div className="admin-detail-field">
                  <dt className="admin-detail-meta-label">{t('opps.fieldStatus')}</dt>
                  <dd style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <select
                      className="opps-status-select"
                      value={detail.opportunity.status}
                      onChange={e => handleStatusChange(e.target.value as TrackedOpportunity['status'])}
                      disabled={statusSaving}
                      aria-label={t('opps.fieldStatus')}
                      style={{ maxWidth: 280 }}
                    >
                      {STATUS_OPTIONS.map(s => (
                        <option key={s} value={s}>{t(STATUS_LABEL_KEYS[s])}</option>
                      ))}
                    </select>
                    {statusSaving && (
                      <span className="opps-saving-inline">
                        <span className="opps-saving-dot" />
                        {t('opps.statusSaving')}
                      </span>
                    )}
                  </dd>
                  {statusError && (
                    <p className="form-error" role="alert">
                      {t('opps.statusUpdateError')} {statusError}
                    </p>
                  )}
                </div>

                {/* Assignment control */}
                <div className="admin-detail-field">
                  <dt className="admin-detail-meta-label">{t('opps.fieldAssignedTo')}</dt>
                  <dd style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <select
                      className="opps-assign-select"
                      value={detail.opportunity.assigned_to || ''}
                      onChange={e => handleAssignmentChange(e.target.value || null)}
                      disabled={assignSaving || usersLoading}
                      aria-label={t('opps.fieldAssignedTo')}
                      style={{ maxWidth: 320 }}
                    >
                      <option value="">{t('opps.unassigned')}</option>
                      {usersLoading && <option disabled>{t('opps.loadingUsers')}</option>}
                      {!usersLoading && internalUsers && internalUsers.length === 0 && (
                        <option disabled>{t('opps.noInternalUsers')}</option>
                      )}
                      {!usersLoading && internalUsers && internalUsers.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.email})
                        </option>
                      ))}
                    </select>
                    {user && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleAssignmentChange(user.id)}
                        disabled={assignSaving || detail.opportunity.assigned_to === user.id}
                      >
                        {t('opps.assignToMe')}
                      </button>
                    )}
                    {detail.opportunity.assigned_to && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleAssignmentChange(null)}
                        disabled={assignSaving}
                      >
                        {t('opps.clearAssignment')}
                      </button>
                    )}
                    {assignSaving && (
                      <span className="opps-saving-inline">
                        <span className="opps-saving-dot" />
                        {t('opps.assignSaving')}
                      </span>
                    )}
                  </dd>
                  {usersError && (
                    <p className="form-error" role="alert">{usersError}</p>
                  )}
                  {assignError && (
                    <p className="form-error" role="alert">
                      {t('opps.assignError')} {assignError}
                    </p>
                  )}
                </div>
              </section>

              {/* SECTION C — RECORD AN ACTION */}
              <section className="admin-detail-section">
                <div className="opps-detail-section-title-row">
                  <h4 className="admin-detail-section-title">{t('opps.sectionActions')}</h4>
                  <span className="opps-detail-section-desc">{t('opps.sectionActionsDesc')}</span>
                </div>
                <div className="opps-action-recorder">
                  <div className="opps-action-recorder-row">
                    <div className="admin-detail-field">
                      <label className="admin-detail-meta-label" htmlFor="opps-action-type">
                        {t('opps.actionType')}
                      </label>
                      <select
                        id="opps-action-type"
                        className="opps-status-select"
                        value={actionType}
                        onChange={e => setActionType(e.target.value)}
                        disabled={actionSubmitting}
                      >
                        <option value="">{t('opps.actionTypePlaceholder')}</option>
                        {USER_ACTION_TYPES.map(at => (
                          <option key={at} value={at}>
                            {t(ALL_ACTION_TYPE_KEYS[at])}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={handleRecordAction}
                      disabled={actionSubmitting || !actionType}
                    >
                      {actionSubmitting ? t('opps.actionSubmitting') : t('opps.actionSubmit')}
                    </button>
                  </div>
                  <div className="admin-detail-field">
                    <label className="admin-detail-meta-label" htmlFor="opps-action-note">
                      {t('opps.actionNote')}
                    </label>
                    <textarea
                      id="opps-action-note"
                      className="form-textarea"
                      value={actionNote}
                      onChange={e => setActionNote(e.target.value.slice(0, 500))}
                      placeholder={t('opps.actionNotePlaceholder')}
                      disabled={actionSubmitting}
                      maxLength={500}
                      rows={3}
                    />
                    <p className="form-hint">
                      {t('opps.actionNoteHint')} ({actionNote.length}/500)
                    </p>
                  </div>
                  {actionError && (
                    <p className="opps-action-error" role="alert">
                      {t('opps.actionError')} {actionError}
                    </p>
                  )}
                </div>
              </section>

              {/* SECTION D — ACTION HISTORY */}
              <section className="admin-detail-section">
                <h4 className="admin-detail-section-title">
                  {t('opps.sectionHistory')}
                  <span className="admin-detail-items-count">{detail.actionCount}</span>
                </h4>
                {detail.actions.length === 0 ? (
                  <p className="admin-detail-no-items">{t('opps.historyEmpty')}</p>
                ) : (
                  <ul className="opps-history-list">
                    {detail.actions.map(act => (
                      <li key={act.id} className="opps-history-item">
                        <span className="opps-history-marker" />
                        <div className="opps-history-body">
                          <div className="opps-history-top">
                            <span className={`badge ${ACTION_BADGE[act.action_type] || 'badge-neutral'}`}>
                              {t(ALL_ACTION_TYPE_KEYS[act.action_type])}
                            </span>
                            <span className="opps-history-meta">
                              {act.actor_name || act.actor_id} · {formatDateTime(act.created_at)}
                            </span>
                          </div>
                          {(act.previous_status || act.new_status) && (
                            <span className="opps-history-status-change">
                              {act.previous_status || '—'}
                              <span className="opps-history-status-arrow">→</span>
                              {act.new_status || '—'}
                            </span>
                          )}
                          {act.note && (
                            <div className="opps-history-note">{act.note}</div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* SECTION E — FOLLOW-UP TASKS (V6, employee-controlled, green accent) */}
              <section className="admin-detail-section opps-tasks-section">
                <div className="opps-detail-section-title-row">
                  <h4 className="admin-detail-section-title">
                    {t('opps.sectionTasks')}
                    {tasks.length > 0 && (
                      <span className="admin-detail-items-count">
                        {tasks.filter(tk => tk.status === 'PENDING' || tk.status === 'IN_PROGRESS').length}/{tasks.length}
                      </span>
                    )}
                  </h4>
                  <span className="opps-detail-section-desc">{t('opps.sectionTasksDesc')}</span>
                </div>

                {/* Inline task create form */}
                <div className="opps-task-recorder">
                  <div className="opps-task-recorder-row">
                    <div className="admin-detail-field">
                      <label className="admin-detail-meta-label" htmlFor="opps-task-title-input">
                        {t('opps.taskTitle')}
                      </label>
                      <input
                        id="opps-task-title-input"
                        type="text"
                        className="form-input"
                        value={newTaskTitle}
                        onChange={e => setNewTaskTitle(e.target.value.slice(0, 200))}
                        placeholder={t('opps.taskTitlePlaceholder')}
                        disabled={taskCreating}
                        maxLength={200}
                      />
                    </div>
                    <div className="admin-detail-field">
                      <label className="admin-detail-meta-label" htmlFor="opps-task-priority-select">
                        {t('opps.taskPriority')}
                      </label>
                      <select
                        id="opps-task-priority-select"
                        className="opps-task-priority-select"
                        value={newTaskPriority}
                        onChange={e => setNewTaskPriority(e.target.value as TaskPriority)}
                        disabled={taskCreating}
                      >
                        {TASK_PRIORITY_OPTIONS.map(p => (
                          <option key={p} value={p}>{t(TASK_PRIORITY_LABEL_KEYS[p])}</option>
                        ))}
                      </select>
                    </div>
                    <div className="admin-detail-field">
                      <label className="admin-detail-meta-label" htmlFor="opps-task-assignee-select">
                        {t('opps.taskAssignee')}
                      </label>
                      <select
                        id="opps-task-assignee-select"
                        className="opps-task-assign-select"
                        value={newTaskAssignee}
                        onChange={e => setNewTaskAssignee(e.target.value)}
                        disabled={taskCreating || usersLoading}
                      >
                        <option value="">{t('opps.taskUnassigned')}</option>
                        {!usersLoading && internalUsers && internalUsers.map(u => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="admin-detail-field">
                      <label className="admin-detail-meta-label" htmlFor="opps-task-due-date-input">
                        {t('opps.taskDueDate')}
                      </label>
                      <input
                        id="opps-task-due-date-input"
                        type="date"
                        className="form-input"
                        value={newTaskDueDate}
                        onChange={e => setNewTaskDueDate(e.target.value)}
                        disabled={taskCreating}
                      />
                    </div>
                  </div>
                  <div className="admin-detail-field">
                    <label className="admin-detail-meta-label" htmlFor="opps-task-desc-input">
                      {t('opps.taskDescription')}
                    </label>
                    <textarea
                      id="opps-task-desc-input"
                      className="form-textarea"
                      value={newTaskDescription}
                      onChange={e => setNewTaskDescription(e.target.value.slice(0, 2000))}
                      placeholder={t('opps.taskDescriptionPlaceholder')}
                      disabled={taskCreating}
                      maxLength={2000}
                      rows={2}
                    />
                  </div>
                  <div className="opps-task-recorder-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={handleCreateTask}
                      disabled={taskCreating || !newTaskTitle.trim()}
                    >
                      {taskCreating ? t('opps.tasksAdding') : t('opps.tasksAdd')}
                    </button>
                  </div>
                  {taskCreateError && (
                    <p className="opps-action-error" role="alert">
                      {t('opps.tasksCreateError')} {taskCreateError}
                    </p>
                  )}
                </div>

                {/* Task list */}
                {tasksLoading ? (
                  <p className="admin-detail-no-items">{t('common.loading')}</p>
                ) : tasksError ? (
                  <p className="opps-action-error" role="alert">
                    {t('opps.tasksLoadError')} {tasksError}
                  </p>
                ) : tasks.length === 0 ? (
                  <p className="admin-detail-no-items">{t('opps.tasksEmpty')}</p>
                ) : (
                  <ul className="opps-task-list">
                    {tasks.map(tk => (
                      <li
                        key={tk.id}
                        className={`opps-task-item opps-task-item-priority-${tk.priority} opps-task-item-status-${tk.status}`}
                      >
                        <div className="opps-task-body">
                          <div className="opps-task-title">{tk.title}</div>
                          {tk.description && (
                            <div className="opps-task-desc">{tk.description}</div>
                          )}
                          <div className="opps-task-meta">
                            <span>
                              {t('opps.taskCreatedBy')}: {tk.created_by_name || '—'}
                            </span>
                            <span>·</span>
                            <span>{t('opps.taskCreatedAt')}: {formatDateTime(tk.created_at)}</span>
                            {tk.due_date && (
                              <>
                                <span>·</span>
                                <span>{t('opps.taskDueDate')}: {formatDateTime(tk.due_date)}</span>
                              </>
                            )}
                          </div>
                        </div>
                        {/* Inline controls */}
                        <div className="opps-task-controls">
                          <span className={`opps-priority-badge opps-priority-badge-${tk.priority}`}>
                            {t(TASK_PRIORITY_LABEL_KEYS[tk.priority])}
                          </span>
                          <select
                            className="opps-task-status-select"
                            value={tk.status}
                            onChange={e => handleUpdateTask(tk.id, { status: e.target.value })}
                            disabled={taskUpdatingId === tk.id}
                            aria-label={t('opps.taskStatus')}
                          >
                            {TASK_STATUS_OPTIONS.map(s => (
                              <option key={s} value={s}>{t(TASK_STATUS_LABEL_KEYS[s])}</option>
                            ))}
                          </select>
                          <select
                            className="opps-task-priority-select"
                            value={tk.priority}
                            onChange={e => handleUpdateTask(tk.id, { priority: e.target.value })}
                            disabled={taskUpdatingId === tk.id}
                            aria-label={t('opps.taskPriority')}
                          >
                            {TASK_PRIORITY_OPTIONS.map(p => (
                              <option key={p} value={p}>{t(TASK_PRIORITY_LABEL_KEYS[p])}</option>
                            ))}
                          </select>
                          <select
                            className="opps-task-assign-select"
                            value={tk.assignee_user_id || ''}
                            onChange={e => handleUpdateTask(tk.id, e.target.value ? { assigneeUserId: e.target.value } : { assigneeUserId: null })}
                            disabled={taskUpdatingId === tk.id || usersLoading}
                            aria-label={t('opps.taskAssignee')}
                          >
                            <option value="">{t('opps.taskUnassigned')}</option>
                            {!usersLoading && internalUsers && internalUsers.map(u => (
                              <option key={u.id} value={u.id}>{u.name}</option>
                            ))}
                          </select>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {taskUpdateError && (
                  <p className="opps-action-error" role="alert" style={{ marginTop: 8 }}>
                    {t('opps.tasksUpdateError')} {taskUpdateError}
                  </p>
                )}
              </section>
            </article>
          )}
        </section>
      </div>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function SummaryTile({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant: 'primary' | 'warning' | 'info' | 'success' | 'error' | 'neutral';
}) {
  return (
    <div className={`admin-summary-tile admin-summary-tile-${variant}`}>
      <span className="admin-summary-tile-value">{value}</span>
      <span className="admin-summary-tile-label">{label}</span>
    </div>
  );
}

// Badge styling for action types in history
const ACTION_BADGE: Record<OpportunityAction['action_type'], string> = {
  REVIEWED: 'badge-info',
  CONTACT_ATTEMPTED: 'badge-warning',
  CUSTOMER_CONTACTED: 'badge-info',
  FOLLOW_UP_REQUIRED: 'badge-warning',
  QUOTE_REQUESTED: 'badge-info',
  CONVERTED: 'badge-success',
  DISMISSED: 'badge-neutral',
  ASSIGNED: 'badge-info',
  REASSIGNED: 'badge-info',
  STATUS_CHANGED: 'badge-neutral',
};

// ---- Icons ----

function RefreshIcon({ spinning }: { spinning?: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={spinning ? { animation: 'adminSpin 0.8s linear infinite' } : undefined}
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function SyncIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="0 9 0 0 9 0" />
      <polyline points="24 15 24 24 15 24" />
      <path d="M21 9V3a2 2 0 0 0-2-2h-6M3 15v6a2 2 0 0 0 2 2h6" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function InboxIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

// V5 — Priority icon (signal/flag)
function PriorityIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}
