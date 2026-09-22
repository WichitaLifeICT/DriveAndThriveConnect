#!/usr/bin/env bash
# Apply every migration to a throwaway Postgres database and run the
# access-control tests against it.
#
# Usage: supabase/tests/run.sh
# Connection comes from the standard PG* environment variables
# (PGHOST, PGPORT, PGUSER, PGPASSWORD). Needs a superuser.
set -euo pipefail

cd "$(dirname "$0")/../.."

DB="dtc_policy_test_$$"
PSQL=(psql -v ON_ERROR_STOP=1 -q -X)
export PGOPTIONS="-c client_min_messages=error"

cleanup() { "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS $DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT

"${PSQL[@]}" -d postgres -c "CREATE DATABASE $DB"

"${PSQL[@]}" -d "$DB" -f supabase/tests/supabase_stub.sql

for f in supabase/migrations/*.sql; do
  echo "Applying $f"
  "${PSQL[@]}" -d "$DB" -f "$f"
done

PGOPTIONS="-c client_min_messages=notice" \
  "${PSQL[@]}" -d "$DB" -P pager=off -f supabase/tests/policies.test.sql
