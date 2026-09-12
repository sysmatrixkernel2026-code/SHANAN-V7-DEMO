-- SHANAN Phase 4 — P0-03 approved migration (customer contact model)
-- Customer organization contact-person foundation.
-- Contains ONLY: additive contact columns on public.customer_companies,
-- mirroring the existing suppliers contact pattern (contact_name/contact_email/
-- contact_phone) extended with a contact title.
-- No rows are modified. No other object is created, altered, or dropped.
-- Idempotent and replayable (ADD COLUMN IF NOT EXISTS).

ALTER TABLE public.customer_companies
  ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE public.customer_companies
  ADD COLUMN IF NOT EXISTS contact_title TEXT;
ALTER TABLE public.customer_companies
  ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE public.customer_companies
  ADD COLUMN IF NOT EXISTS contact_phone TEXT;