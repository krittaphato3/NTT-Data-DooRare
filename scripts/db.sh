#!/usr/bin/env bash
# Local DooRare database helper. Only touches the `db` service and the `doorare_pgdata` volume of this project.
#   up     start Postgres (applies db/schema.sql on first start)
#   load   load db/mock/csv into an empty database + create views
#   reset  drop the DB volume, recreate the schema, load mock data
#   snapshot  copy the current DB to `doorare_baseline` (template), replacing an older copy
#   restore   put `doorare_baseline` back as `doorare` (stop the backend first or it is disconnected)
#   demo      restore the snapshot, then backfill 1-21 Oct, shape 19-21 Oct and run the role scenarios (backend must be running)
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
  snapshot) $DC exec -T db psql -U doorare -d postgres -v ON_ERROR_STOP=1 -q \
              -c "select pg_terminate_backend(pid) from pg_stat_activity where datname in ('doorare','doorare_baseline') and pid<>pg_backend_pid()" >/dev/null \
              -c "drop database if exists doorare_baseline" -c "create database doorare_baseline template doorare"
            echo "snapshot saved: doorare_baseline" ;;
  restore)  $DC exec -T db psql -U doorare -d postgres -v ON_ERROR_STOP=1 -q \
              -c "select pg_terminate_backend(pid) from pg_stat_activity where datname in ('doorare','doorare_baseline') and pid<>pg_backend_pid()" >/dev/null \
              -c "drop database doorare" -c "create database doorare template doorare_baseline"
            echo "restored doorare from doorare_baseline" ;;
  demo)  $DC exec -T db psql -U doorare -d postgres -tA -c "select 1 from pg_database where datname='doorare_baseline'" | grep -q 1 \
           || { echo "no snapshot: run 'npm run db:snapshot' on the original data first" >&2; exit 1; }
         curl -fs http://127.0.0.1:${PORT:-3001}/api/v1/health >/dev/null || { echo "start the backend first (cd backend && npx tsx src/index.ts)" >&2; exit 1; }
         "$0" restore
         echo "backfill 1-21 Oct..."; $PSQL -q < db/demo/01-backfill.sql
         echo "shape the 19-21 Oct situation..."; $PSQL -q < db/demo/02-shape.sql
         echo "run role scenarios through the API..."; (cd backend && API=http://127.0.0.1:${PORT:-3001}/api/v1 npx tsx scripts/demo-scenarios.ts) ;;
  psql)  exec $DC exec db psql -U doorare -d doorare ;;
  *)     echo "usage: $0 {up|load|reset|snapshot|restore|demo|psql}" >&2; exit 1 ;;
esac
