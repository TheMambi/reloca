#!/usr/bin/env bash
# Builds the schema from supabase/migrations in a throwaway database on a LOCAL
# PostgreSQL server, then checks it. Run it after changing a migration:
#
#   pnpm db:check
#
# It connects the way psql does (PGHOST, PGPORT, PGUSER, PGPASSWORD), as a role
# that may create roles and databases, and refuses a host that is not this
# machine, so it cannot be pointed at the hosted database by mistake.
#
# What it does:
#   1. creates the roles a Supabase database has (anon, authenticated,
#      service_role) if the server lacks them. They stay on the local server.
#   2. creates an empty database and applies every migration in order, twice,
#      each file in one transaction. The second pass proves a re-run is safe.
#   3. runs supabase/tests/*.sql.
#   4. runs lib/supabase/schema-drift.test.ts against it, which compares the
#      database with the row schemas and with lib/supabase/types.ts.
#   5. drops the database.
set -euo pipefail
cd "$(dirname "$0")/.."

# PGHOSTADDR and PGSERVICE can name a server without PGHOST saying so.
if [ -n "${PGHOSTADDR:-}${PGSERVICE:-}" ]; then
  echo "db-check: unset PGHOSTADDR and PGSERVICE. This script only runs against a local server named by PGHOST." >&2
  exit 1
fi
case "${PGHOST:-}" in
  "" | localhost | 127.0.0.1 | ::1 | /*) ;;
  *)
    echo "db-check: PGHOST is not this machine. This script only runs against a local server." >&2
    exit 1
    ;;
esac

db="reloca_check_$$"
run() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }
trap 'psql -X -q -d postgres -c "DROP DATABASE IF EXISTS $db" >/dev/null 2>&1' EXIT

run -d postgres <<'SQL'
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END
$roles$;
SQL
run -d postgres -c "CREATE DATABASE $db"
run -d "$db" -c "GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role"

for pass in first second; do
  for file in supabase/migrations/*.sql; do
    # NOTICE lines ("already exists, skipping") are expected on the second pass.
    PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning" run -d "$db" -1 -f "$file" \
      || { echo "db-check: $file failed on the $pass pass" >&2; exit 1; }
  done
done
echo "db-check: every migration applied twice."

for file in supabase/tests/*.sql; do
  PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning" run -d "$db" -f "$file" >/dev/null \
    || { echo "db-check: $file failed" >&2; exit 1; }
done
echo "db-check: supabase/tests passed."

RELOCA_CHECK_DB="dbname=$db" node_modules/.bin/tsx --conditions=react-server lib/supabase/schema-drift.test.ts
