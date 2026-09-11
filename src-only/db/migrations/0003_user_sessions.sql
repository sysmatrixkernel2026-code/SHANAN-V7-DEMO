-- SHANAN Phase 4 — A5 reproducibility migration (single object)
-- Reconstruction of the runtime-created user_sessions table, which
-- production/auth depends on but which exists in the tracked sources
-- ONLY inside the legacy SQLite bootstrap (legacy/api/server.ts A5).
--
-- Evidence (P0-00B investigation, 2026-09-11):
--   * Columns: token (PK), user_id (FK users ON DELETE CASCADE),
--     expires_at (TEXT), created_at (TEXT, has a default because every
--     runtime INSERT lists only token,user_id,expires_at).
--   * token uniqueness is REQUIRED by auth upsert semantics:
--       api/postgres.ts   -> INSERT ... ON CONFLICT(token) DO UPDATE
--       api/auth/[[...route]].ts -> INSERT INTO user_sessions (token, ...)
--   * expires_at is TEXT (not timestamptz): established by commit
--     ed7c541 "compare session expiry as text on TEXT expires_at column".
--   * Index names follow the SQLite legacy (idx_user_sessions_user_id,
--     idx_user_sessions_expires_at) translated to Postgres.
--
-- SAFETY PROPERTIES:
--   * All statements are idempotent (IF NOT EXISTS). On the live
--     production database this migration is a NO-OP because the table
--     already exists; it is provided so a FRESH Supabase project built
--     from db/migrations/* recreates the exact runtime contract.
--   * Contains ONLY this table and its indexes. No rows are touched,
--     no other object created/altered/dropped.
--   * RLS and FORCE RLS intentionally NOT applied — sessions are read
--     and written exclusively by the API service role (Phase 4 deferral,
--     identical to migrations 0001/0002).

CREATE TABLE IF NOT EXISTS public.user_sessions (
  token          TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  expires_at     TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id
  ON public.user_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at
  ON public.user_sessions(expires_at);