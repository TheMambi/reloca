-- Reloca migration 0026: new functions and sequences start closed
--
-- Migration 0025 changed the default privileges for tables only. Supabase also
-- grants every new function and sequence in the public schema to `anon` and
-- `authenticated` by name, and Postgres itself lets PUBLIC run every new
-- function. A function added later would therefore be callable through the
-- REST API with the anon key, even after `REVOKE ... FROM PUBLIC`.
--
-- After this, functions and sequences created in the public schema by the role
-- that runs it get no grant to PUBLIC, anon or authenticated. The server's role
-- keeps its own default grants. Objects that already exist are not touched:
-- 0025 closed the one function, and a sequence privilege opens no table data.
--
-- Run it after 0025, exactly as written: there is no placeholder. It is a single
-- statement, and running it again changes nothing. Default privileges belong to
-- the role that sets them, so an object created by a different role can still
-- start open. Check 1 in docs/security-lockdown.md finds those.

DO $defaults$
BEGIN
  -- The schema-level revoke removes what Supabase granted per schema.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;

  -- EXECUTE for PUBLIC is built into Postgres, not granted per schema, and a
  -- per-schema revoke cannot take a built-in default away. Only the form
  -- without a schema does. It covers functions this role creates anywhere.
  ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

  GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO service_role;
END
$defaults$;
