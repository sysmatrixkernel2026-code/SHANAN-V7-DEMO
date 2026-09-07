-- SHANAN Phase 4 — G-A approved migration (single object)
-- DB-backed login rate limiting.
-- Contains ONLY: CREATE TABLE IF NOT EXISTS public.login_attempts
-- plus the minimum required explicit index. No other object is
-- created, altered, or dropped. No data modifications.
-- RLS and FORCE RLS are intentionally NOT applied (Phase 4 deferral).

CREATE TABLE IF NOT EXISTS public.login_attempts (
  key               TEXT PRIMARY KEY,              -- sha256(ip|email)
  attempts          INTEGER NOT NULL DEFAULT 0,
  first_attempt_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Minimum required explicit index: window purge + touch lookups on updated_at.
CREATE INDEX IF NOT EXISTS idx_login_attempts_updated_at
  ON public.login_attempts (updated_at);