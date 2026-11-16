-- Realtime change signal: after any write to a watched table, NOTIFY channel `doorare_change` with the table name.
-- The backend LISTENs on this channel and pushes the table name to open browsers over SSE (GET /api/v1/events);
-- each screen then re-fetches through its normal, hospital-scoped API. The payload carries no row data.
-- Statement-level triggers, and Postgres folds identical notifications inside one transaction, so a bulk write sends one signal.
-- Idempotent: safe to run again on an existing database (`psql -f db/realtime.sql`).

CREATE OR REPLACE FUNCTION doorare_notify_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('doorare_change', TG_TABLE_NAME);
  RETURN NULL;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'borrow_request', 'borrow_leg', 'return_obligation',
    'transport_task', 'transport_event',
    'incident', 'incident_patient_count', 'emergency_plan', 'kit_pack_task', 'kit_stock',
    'stock_alert', 'notification',
    'near_expiry_item', 'allocation_plan', 'plan_approval'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_doorare_change ON %I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_doorare_change AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH STATEMENT EXECUTE FUNCTION doorare_notify_change()',
      t
    );
  END LOOP;
END;
$$;
