#!/usr/bin/env bash
# Reloca — manual Supabase keepalive ping.
#
# Usage:  ./scripts/keepalive.sh
#
# Reads NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY from
# .env.local and pings the relocations table to keep the free-tier project
# from being paused.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$ROOT/.env.local"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ No .env.local found at $ENV_FILE"
  exit 1
fi

# shellcheck disable=SC1090
SUPABASE_URL=$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2-)
ANON_KEY=$(grep -E '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2-)

if [ -z "$SUPABASE_URL" ] || [ -z "$ANON_KEY" ]; then
  echo "❌ Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
  exit 1
fi

# Strip trailing slash
SUPABASE_URL="${SUPABASE_URL%/}"

echo "🏓 Pinging $SUPABASE_URL ..."

RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 \
  "$SUPABASE_URL/rest/v1/relocations?select=id&limit=1" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY")

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
