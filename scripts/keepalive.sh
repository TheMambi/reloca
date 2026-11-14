#!/usr/bin/env bash
# Reloca — manual Supabase keepalive ping.
#
# Usage:  ./scripts/keepalive.sh
#
# Reads SUPABASE_URL (or the older NEXT_PUBLIC_SUPABASE_URL) and
# SUPABASE_SERVICE_ROLE_KEY from .env.local and reads one row id from the
# relocations table to keep the free-tier project from being paused.
#
# The anon key cannot read tables since migration 0025, so this uses the
# server key. curl gets it on stdin, never as an argument or in the URL, so it
# does not show in the process list.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$ROOT/.env.local"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ No .env.local found at $ENV_FILE"
  exit 1
fi

# `|| true`: a name that is absent must reach the message below, not end the script.
read_env() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- || true; }

SUPABASE_URL=$(read_env SUPABASE_URL)
[ -n "$SUPABASE_URL" ] || SUPABASE_URL=$(read_env NEXT_PUBLIC_SUPABASE_URL)
SERVICE_KEY=$(read_env SUPABASE_SERVICE_ROLE_KEY)

if [ -z "$SUPABASE_URL" ] || [ -z "$SERVICE_KEY" ]; then
  echo "❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  exit 1
fi

# Strip trailing slash
SUPABASE_URL="${SUPABASE_URL%/}"

echo "🏓 Pinging Supabase ..."

# printf is a shell builtin, so the key goes straight down the pipe. `|| true`
# keeps a failed connection from ending the script before it can explain.
RESPONSE=$(printf 'url = "%s"\nheader = "apikey: %s"\nheader = "Authorization: Bearer %s"\n' \
  "$SUPABASE_URL/rest/v1/relocations?select=id&limit=1" "$SERVICE_KEY" "$SERVICE_KEY" \
  | curl -s -o /dev/null -w "%{http_code}" --max-time 30 --config - || true)

if [ "$RESPONSE" -eq 200 ]; then
  echo "✅ Supabase responded with HTTP $RESPONSE — project is alive!"
else
  echo "⚠️  Supabase responded with HTTP $RESPONSE"
  if [ "$RESPONSE" -eq 000 ]; then
    echo "   DNS did not resolve — project is likely paused."
    echo "   Restore it at: https://supabase.com/dashboard"
  fi
  exit 1
fi
