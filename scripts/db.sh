#!/usr/bin/env bash
# Local DooRare database helper. Only touches the `db` service and the `doorare_pgdata` volume of this project.
#   up     start Postgres (applies db/schema.sql on first start)
#   load   load db/mock/csv into an empty database + create views
#   reset  drop the DB volume, recreate the schema, load mock data
#   scenarios  leave pending work for pharmacist / ER / warehouse / driver through the API (backend must be running; once per fresh DB)
#   scenarios-f2  add fresh near-expiry lots with real receivers and release some to the pool (backend must be running; can be repeated)
#   networks  move HD + HE to a second network so near-expiry plans with them wait for approval (db/demo/03-networks.sql, can be repeated)
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
  echo "extending the data from 30 Sep to 21 Oct (db/demo)..."
  $PSQL -q < db/demo/01-backfill.sql >/dev/null
  $PSQL -q < db/demo/02-shape.sql >/dev/null
  $PSQL -c "select (select count(*) from hospital) hospitals, (select count(*) from usage_daily) usage_daily, (select count(*) from borrow_request) borrow_requests, (select count(*) from stock_lot) lots"
}

case "${1:-}" in
  up)    $DC up -d db; wait_ready; echo "ready: postgresql://doorare:doorare_dev@127.0.0.1:5442/doorare" ;;
  load)  wait_ready; load ;;
  reset) $DC rm -sfv db >/dev/null; docker volume rm -f doorare_pgdata >/dev/null; $DC up -d db; wait_ready; load ;;
  scenarios) curl -fs http://127.0.0.1:${PORT:-3001}/api/v1/health >/dev/null || { echo "start the backend first (cd backend && npx tsx src/index.ts)" >&2; exit 1; }
             # the DB variables are set here on purpose: the scenario imports backend code that loads backend/.env (which may point at RDS)
             (cd backend && DB_HOST=127.0.0.1 DB_PORT=5442 DB_NAME=doorare DB_USER=doorare DB_PASSWORD=doorare_dev API=http://127.0.0.1:${PORT:-3001}/api/v1 npx tsx scripts/demo-scenarios.ts) ;;
  scenarios-f2) if [ "${REMOTE:-}" = "1" ]; then
               # shared database (RDS): nothing is pinned, you pass API + DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD yourself and CONFIRM_HOST=<DB_HOST>
               : "${API:?set API=https://<backend>/api/v1}"; : "${DB_HOST:?set DB_HOST}"
               curl -fs "$API/health" >/dev/null || { echo "backend not reachable at $API" >&2; exit 1; }
               (cd backend && npx tsx scripts/demo-f2.ts)
             else
               curl -fs http://127.0.0.1:${PORT:-3001}/api/v1/health >/dev/null || { echo "start the backend first (cd backend && npx tsx src/index.ts)" >&2; exit 1; }
               (cd backend && DB_HOST=127.0.0.1 DB_PORT=5442 DB_NAME=doorare DB_USER=doorare DB_PASSWORD=doorare_dev API=http://127.0.0.1:${PORT:-3001}/api/v1 npx tsx scripts/demo-f2.ts)
             fi ;;
  networks) $PSQL < db/demo/03-networks.sql ;;
  psql)  exec $DC exec db psql -U doorare -d doorare ;;
  *)     echo "usage: $0 {up|load|reset|scenarios|scenarios-f2|networks|psql}" >&2; exit 1 ;;
esac
