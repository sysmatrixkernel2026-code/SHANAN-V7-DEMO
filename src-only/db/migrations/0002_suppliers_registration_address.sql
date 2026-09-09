-- SHANAN Phase 4 — A9.1a approved migration (single-table suppliers)
-- Supplier registration + internal review workflow support.
-- Contains ONLY: additive columns (city/address/website) on public.suppliers,
-- plus a narrowly-scoped status CHECK replacement that ADDS the two states
-- required by the legacy contract ('pending','under_review') while keeping
-- the three existing states ('active','suspended','terminated').
-- No rows are modified. No other object is created, altered, or dropped.
-- RLS and FORCE RLS are intentionally NOT applied (Phase 4 deferral).

-- 1) Additive address columns (absent from the live production schema but
--    required by SupplierRegister + SupplierProfile UI and the legacy API).
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS website TEXT;

-- 2) Extend status CHECK to include the registration/review states. The prior
--    constraint name is dropped and re-created with the superset enum so the
--    migration is idempotent and replayable.
ALTER TABLE public.suppliers DROP CONSTRAINT IF EXISTS suppliers_status_check;
ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_status_check
  CHECK (status IN ('pending','under_review','active','suspended','terminated'));