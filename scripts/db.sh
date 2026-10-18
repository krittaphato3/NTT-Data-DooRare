#!/usr/bin/env bash
# Local DooRare database helper. Only touches the `db` service and the `doorare_pgdata` volume of this project.
#   up     start Postgres (applies db/schema.sql on first start)
#   load   load db/mock/csv into an empty database + create views
#   reset  drop the DB volume, recreate the schema, load mock data
#   psql   open psql   (host: 127.0.0.1:5442, user doorare, password doorare_dev, db doorare)
set -euo pipefail
export MSYS_NO_PATHCONV=1
cd "$(dirname "$0")/.."
DC="docker compose"
PSQL="$DC exec -T db psql -U doorare -d doorare -v ON_ERROR_STOP=1"

wait_ready() {
  for _ in $(seq 1 60); do
    [ "$($DC ps --format '{{.Health}}' db 2>/dev/null)" = "healthy" ] && return 0
    sleep 1
  done
  echo "db did not become healthy" >&2; exit 1
}

load() {
  [ -d db/mock/csv ] || { echo "db/mock/csv not found: copy it from the mock zip or run: python3 db/mock/generate.py" >&2; exit 1; }
  if [ "$($PSQL -tA -c 'select count(*) from region')" != "0" ]; then
    echo "database already has data. Use: npm run db:reset" >&2; exit 1
  fi
  echo "loading mock data (about 1.4M rows)..."
  $DC exec -T -w /mock/csv db psql -U doorare -d doorare -v ON_ERROR_STOP=1 -q -f /mock/load.sql
  $PSQL -q -f /mock/views.sql
  $PSQL -c "select (select count(*) from hospital) hospitals, (select count(*) from usage_daily) usage_daily, (select count(*) from borrow_request) borrow_requests, (select count(*) from stock_lot) lots"
}

case "${1:-}" in
  up)    $DC up -d db; wait_ready; echo "ready: postgresql://doorare:doorare_dev@127.0.0.1:5442/doorare" ;;
  load)  wait_ready; load ;;
  reset) $DC rm -sfv db >/dev/null; docker volume rm -f doorare_pgdata >/dev/null; $DC up -d db; wait_ready; load ;;
  psql)  exec $DC exec db psql -U doorare -d doorare ;;
  *)     echo "usage: $0 {up|load|reset|psql}" >&2; exit 1 ;;
esac
