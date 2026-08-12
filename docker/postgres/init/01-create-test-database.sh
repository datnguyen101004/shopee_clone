#!/bin/sh
set -eu

case "${POSTGRES_TEST_DB:-}" in
  ''|*[!A-Za-z0-9_]*)
    echo 'POSTGRES_TEST_DB must contain only letters, numbers, and underscores.' >&2
    exit 1
    ;;
esac

case "$POSTGRES_TEST_DB" in
  *_test) ;;
  *)
    echo 'POSTGRES_TEST_DB must end with _test.' >&2
    exit 1
    ;;
esac

psql \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=ON_ERROR_STOP=1 \
  --set=test_db="$POSTGRES_TEST_DB" <<-'SQL'
SELECT format('CREATE DATABASE %I', :'test_db')
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_database
  WHERE datname = :'test_db'
) \gexec
SQL
