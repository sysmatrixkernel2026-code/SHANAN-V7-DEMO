-- SHANAN Phase 4 — approved & APPLIED security migration (Production, 2026-09-09)
-- Repository-side synchronization of the migration already applied to the
-- Production Supabase database.
-- Effect: revoke EXECUTE on public.rls_auto_enable() from PUBLIC, anon, and
-- authenticated so external roles can no longer invoke RLS auto-enable
-- directly (internal/SECURITY DEFINER paths remain unaffected).
-- Contains ONLY: a single REVOKE statement. No grants, no policies, no RLS
-- toggles, no table DDL, no data modifications.

REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;