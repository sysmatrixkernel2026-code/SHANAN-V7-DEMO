-- SHANAN Phase 4 — P0-11 approved migration (privileged action audit attribution)
-- Adds server-derived actor identity columns so security-sensitive mutations
-- retain trustworthy evidence of WHO performed them:
--   * public.users      — role / is_active / password (reset) / name edits via PATCH /api/users/:id
--   * public.suppliers  — status (activate/suspend/terminate) and profile edits via PATCH /api/suppliers/:id
-- Actor is always auth.user.id written by the API, never client input.
-- Contains ONLY: two additive nullable actor columns.
-- No rows are modified. No other object is created, altered, or dropped.
-- Idempotent and replayable (ADD COLUMN IF NOT EXISTS).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS updated_by TEXT REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS updated_by TEXT REFERENCES public.users(id) ON DELETE SET NULL;