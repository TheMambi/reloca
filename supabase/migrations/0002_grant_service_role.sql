-- Reloca migration 0002 — grant service_role on checklist_items
--
-- Migration 0001 granted CRUD only to `anon` and `authenticated`. The admin
-- client (`createAdminClient` in lib/supabase/server.ts) uses the service-role
-- JWT, which is a separate Postgres role and needs its own grant. Without
-- this, the seed-on-first-load path fails with 42501 "permission denied".
--
-- Idempotent: GRANT is repeat-safe.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_items TO service_role;
