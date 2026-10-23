-- DooRare schema.sql  (PostgreSQL 16)
-- v1.5 (on top of v1.4): the UI can now be fed from the database.
--   hospital profile (province, tier, beds, address, phone) · vehicle + transport task number/ETA/cancel reason + temperature
--   triage_level +UNKNOWN · incident.cancel_reason · audit_log.reason/agent_run_id (inside the hash)
--   several roles per user (app_user_role; app_user.role stays the primary role) · login_event + app_user.mfa_enabled/last_login_at/last_seen_at
--   v_transport_item: a receiving hospital sees drug/lot/expiry/qty of what is on its way (security-definer view, RLS keeps the tables closed)
-- v1.4 (on top of spec v1.3): closes gaps found when reading the spec against the mock data.
--   G1 missing columns : forecast/alert granularity, incident type+ETA, borrow_leg.request_item_id,
--                        hospital/drug flags (agent_participation, is_controlled, lend_in_packs, ...), document versioning
--   G2 security        : RLS on pool_entry, allocation_plan, transport_task, return_obligation, document;
--                        audit_log hash chain serialised via audit_chain_head (+1 table = 63) and audit_chain_verify() for JOB-15
--   G2b bug fix        : borrow_request <-> borrow_leg RLS policies recursed infinitely (spec v1.3); now via app_is_lender_of / app_is_borrower_of
--   G3 enums           : mapping_status +DEPRECATED, alert_type +ORDER_AHEAD/ORDER_EARLIER/MIN_MAX
--   All new columns are nullable or defaulted, so existing v1.3 data/CSV still loads.
-- Multi-tenant by hospital via Row-Level Security. Session vars set per request:
--   SET app.user_id = '<uuid>'; SET app.role = '<ROLE>'; SET app.hospital_id = '<uuid>'; SET app.region_id = '<uuid>';
-- gen_random_uuid() and sha256() are built in (PostgreSQL 13+); no extensions required.

-- ---------- helper functions ----------
CREATE OR REPLACE FUNCTION app_hospital() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.hospital_id', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION app_region() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.region_id', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION app_role() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT COALESCE(current_setting('app.role', true), '') $$;
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN NEW.updated_at := now(); NEW.version := OLD.version + 1; RETURN NEW; END $$;

-- ---------- enums ----------
CREATE TYPE role_code AS ENUM ('SYSTEM_ADMIN','REGION_ADMIN','HOSPITAL_ADMIN','PHARMACIST','PROCUREMENT_OFFICER','WAREHOUSE_OFFICER','ER_STAFF','DRIVER','DATA_ADMIN','AUDITOR');
CREATE TYPE ved_class AS ENUM ('V','E','D');
CREATE TYPE abc_class AS ENUM ('A','B','C');
CREATE TYPE forecast_method AS ENUM ('MA_ES','QUANTILE_LGBM','MIN_MAX','COLD_START');
CREATE TYPE alert_severity AS ENUM ('NORMAL','URGENT','VERY_URGENT');
CREATE TYPE alert_status AS ENUM ('OPEN','ACKNOWLEDGED','LINKED_TO_REQUEST','SNOOZED','RESOLVED','AUTO_CLOSED');
CREATE TYPE alert_type AS ENUM ('LOW_STOCK','OVERSTOCK','DATA_STALE','LOW_CONFIDENCE','ORDER_AHEAD','ORDER_EARLIER','MIN_MAX');   -- v1.4: ORDER_AHEAD / ORDER_EARLIER / MIN_MAX per BR-F1a-014/015/020
CREATE TYPE request_context AS ENUM ('STOCK_ALERT','MANUAL','EMERGENCY');
CREATE TYPE request_status AS ENUM ('DRAFT','PENDING_APPROVAL','APPROVED','IN_PROGRESS','PARTIALLY_FULFILLED','FULFILLED','ESCALATED','CLOSED_UNFULFILLED','CANCELLED');
CREATE TYPE leg_status AS ENUM ('PENDING','SENT','ACCEPTED','PARTIAL','REJECTED','TIMED_OUT','CANCELLED','LOADED','IN_TRANSIT','RECEIVED');
CREATE TYPE item_kind AS ENUM ('DRUG','KIT');
CREATE TYPE catalog_item_type AS ENUM ('DRUG','SUPPLY','BLOOD');   -- rev 1.3: DRUG = TMT-coded medicine; SUPPLY = non-drug medical supply (central list, no TMT); BLOOD = blood component (F3 only)
CREATE TYPE expiry_status AS ENUM ('DETECTED','KEPT','DISMISSED','RELEASED_TO_POOL','ALLOCATED','TRANSFERRED');
CREATE TYPE plan_status AS ENUM ('DRAFT','READY_FOR_APPROVAL','AUTO_APPROVED','APPROVED','NEEDS_DISCUSSION','TRANSPORTING','COMPLETED','CANCELLED');
CREATE TYPE transport_status AS ENUM ('WAITING_DISPATCH','LOADED','IN_TRANSIT','ARRIVED','RECEIVED','CANCELLED');
CREATE TYPE incident_status AS ENUM ('OPEN','PLAN_REVIEW','ACTIVE','CLOSE_REQUESTED','RECONCILED','CANCELLED');
CREATE TYPE mapping_status AS ENUM ('UNMATCHED','SUGGESTED','VERIFIED','REJECTED','DEPRECATED');   -- v1.4: DEPRECATED (TMT release change / local code inactivated); LOW_CONFIDENCE and UNMAPPED are derived from confidence
CREATE TYPE return_status AS ENUM ('OPEN','REMINDED','RETURNED','OVERDUE','WAIVED');
CREATE TYPE approval_decision AS ENUM ('PENDING','APPROVED','REJECTED');
CREATE TYPE job_status AS ENUM ('QUEUED','RUNNING','SUCCEEDED','FAILED','SKIPPED');
CREATE TYPE ledger_reason AS ENUM ('RECEIPT','ISSUE_USAGE','ADJUST','LEND_OUT','BORROW_IN','RETURN_IN','RETURN_OUT','POOL_TRANSFER_OUT','POOL_TRANSFER_IN','KIT_PACK','KIT_UNPACK','EXPIRED_WRITEOFF','IMPORT');
CREATE TYPE triage_level AS ENUM ('RED','YELLOW','GREEN','BLACK','UNKNOWN');   -- BLACK and UNKNOWN (count/level not yet clear) are counted in incident_patient_count but have no kit_recipe / incident_extra_rule rows (kits are not computed for them)
CREATE TYPE forecast_granularity AS ENUM ('WEEK','MONTH');   -- v1.4
CREATE TYPE eta_source AS ENUM ('REPORTED','ROUTE','UNAVAILABLE');   -- v1.4: F-26
CREATE TYPE notif_channel AS ENUM ('IN_APP','EMAIL','LINE');

-- ---------- tenancy & identity ----------
CREATE TABLE region (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE, name_th text NOT NULL, name_en text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE network (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id uuid NOT NULL REFERENCES region(id),
  name text NOT NULL, auto_approve boolean NOT NULL DEFAULT true
);
CREATE TABLE hospital (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id uuid NOT NULL REFERENCES region(id),
  network_id uuid REFERENCES network(id),
  code text NOT NULL UNIQUE, name_th text NOT NULL, name_en text,
  lat numeric(9,6), lon numeric(9,6), is_urban boolean NOT NULL DEFAULT true,
  has_cold_chain boolean NOT NULL DEFAULT false,
  has_blood_bank boolean NOT NULL DEFAULT false,   -- rev 1.2: may lend/borrow PRC group O in F3 (ASM-47)
  agent_participation boolean NOT NULL DEFAULT true,   -- v1.4: lender must participate in the agent flow (F-12, ASM-20)
  province text, tier text CHECK (tier IN ('TERTIARY','SECONDARY','COMMUNITY','PRIMARY')), bed_count int CHECK (bed_count >= 0),   -- v1.5: ADM-01 hospital list
  address text, phone text,                                                                                                      -- v1.5: document headers (UI-15)
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), version int NOT NULL DEFAULT 1
);
CREATE TABLE app_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cognito_sub text NOT NULL UNIQUE, email text NOT NULL UNIQUE, display_name text NOT NULL,
  role role_code NOT NULL, hospital_id uuid REFERENCES hospital(id), region_id uuid REFERENCES region(id),
  phone text, active boolean NOT NULL DEFAULT true,
  mfa_enabled boolean NOT NULL DEFAULT false, last_login_at timestamptz, last_seen_at timestamptz,   -- v1.5: no Cognito, the app keeps these (last_seen_at < 15 min = online)
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (role IN ('SYSTEM_ADMIN','AUDITOR') OR hospital_id IS NOT NULL OR region_id IS NOT NULL)
);
CREATE TABLE app_user_role (   -- v1.5: a user may hold several roles in the same hospital/region. app_user.role is the PRIMARY role (default at login) and is always listed here too.
  user_id uuid NOT NULL REFERENCES app_user(id), role role_code NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(), granted_by uuid REFERENCES app_user(id),
  PRIMARY KEY (user_id, role)
);
CREATE TABLE app_user_role_history (   -- which role did the user really hold at time T (forensics); one row per (user, role) period
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, user_id uuid NOT NULL REFERENCES app_user(id),
  role role_code NOT NULL, hospital_id uuid REFERENCES hospital(id), region_id uuid REFERENCES region(id),
  valid_from timestamptz NOT NULL DEFAULT now(), valid_to timestamptz, changed_by uuid REFERENCES app_user(id), reason text,
  CHECK (valid_to IS NULL OR valid_to >= valid_from)   -- >= : now() is constant inside a transaction, so open+close in one tx gives a zero-length period
);
CREATE UNIQUE INDEX role_history_one_open ON app_user_role_history(user_id, role) WHERE valid_to IS NULL;
CREATE INDEX role_history_time_idx ON app_user_role_history(user_id, valid_from, valid_to);
-- Separation of duties (rbac-permissions §1.4 / §9): SYSTEM_ADMIN and AUDITOR hold exactly one role; HOSPITAL_ADMIN never combines with an operational role.
CREATE OR REPLACE FUNCTION app_user_role_rules() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE others role_code[]; ops role_code[] := ARRAY['PHARMACIST','PROCUREMENT_OFFICER','WAREHOUSE_OFFICER','ER_STAFF','DRIVER']::role_code[];
BEGIN
  SELECT coalesce(array_agg(role), '{}') INTO others FROM app_user_role WHERE user_id = NEW.user_id AND role <> NEW.role;
  IF cardinality(others) = 0 THEN RETURN NEW; END IF;
  IF NEW.role IN ('SYSTEM_ADMIN','AUDITOR') OR others && ARRAY['SYSTEM_ADMIN','AUDITOR']::role_code[] THEN
    RAISE EXCEPTION 'SYSTEM_ADMIN and AUDITOR accounts must hold exactly one role';
  END IF;
  IF (NEW.role = 'HOSPITAL_ADMIN' AND others && ops) OR (NEW.role = ANY(ops) AND 'HOSPITAL_ADMIN' = ANY(others)) THEN
    RAISE EXCEPTION 'HOSPITAL_ADMIN cannot be combined with an operational role (separation of duties)';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER app_user_role_rules_trg BEFORE INSERT ON app_user_role FOR EACH ROW EXECUTE FUNCTION app_user_role_rules();
-- (user_id, role) of a row never changes: an UPDATE would skip the SoD rules above and leave app_user_role_history out of sync. To change a role, DELETE then INSERT.
CREATE OR REPLACE FUNCTION app_user_role_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'app_user_role.user_id / role cannot be updated; delete the row and insert a new one'; END $$;
CREATE TRIGGER app_user_role_immutable_trg BEFORE UPDATE OF user_id, role ON app_user_role FOR EACH ROW EXECUTE FUNCTION app_user_role_immutable();
-- keep app_user.role (primary) listed in app_user_role; changing the primary replaces the old primary role.
CREATE OR REPLACE FUNCTION app_user_primary_role_sync() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
    DELETE FROM app_user_role WHERE user_id = NEW.id AND role = OLD.role;
  END IF;
  INSERT INTO app_user_role(user_id, role) VALUES (NEW.id, NEW.role) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER app_user_primary_role_trg AFTER INSERT OR UPDATE OF role ON app_user FOR EACH ROW EXECUTE FUNCTION app_user_primary_role_sync();
CREATE OR REPLACE FUNCTION app_user_role_guard_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.role = (SELECT role FROM app_user WHERE id = OLD.user_id) THEN RAISE EXCEPTION 'cannot remove the primary role; change app_user.role instead'; END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER app_user_role_guard_del_trg BEFORE DELETE ON app_user_role FOR EACH ROW EXECUTE FUNCTION app_user_role_guard_delete();
CREATE OR REPLACE FUNCTION app_user_role_hist_open() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO app_user_role_history(user_id, role, hospital_id, region_id, reason)
    SELECT NEW.user_id, NEW.role, u.hospital_id, u.region_id, 'granted' FROM app_user u WHERE u.id = NEW.user_id;
  RETURN NEW;
END $$;
CREATE TRIGGER app_user_role_hist_open_trg AFTER INSERT ON app_user_role FOR EACH ROW EXECUTE FUNCTION app_user_role_hist_open();
CREATE OR REPLACE FUNCTION app_user_role_hist_close() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE app_user_role_history SET valid_to = now() WHERE user_id = OLD.user_id AND role = OLD.role AND valid_to IS NULL;
  RETURN OLD;
END $$;
CREATE TRIGGER app_user_role_hist_close_trg AFTER DELETE ON app_user_role FOR EACH ROW EXECUTE FUNCTION app_user_role_hist_close();
-- hospital / region / active changed: close every open period and reopen one per role
CREATE OR REPLACE FUNCTION app_user_scope_track() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE app_user_role_history SET valid_to = now() WHERE user_id = NEW.id AND valid_to IS NULL;
  INSERT INTO app_user_role_history(user_id, role, hospital_id, region_id, reason)
    SELECT NEW.id, r.role, NEW.hospital_id, NEW.region_id, CASE WHEN NOT NEW.active THEN 'deactivated' ELSE 'changed' END
    FROM app_user_role r WHERE r.user_id = NEW.id;
  RETURN NEW;
END $$;
CREATE TRIGGER app_user_scope_track_trg AFTER UPDATE ON app_user FOR EACH ROW
  WHEN (NEW.hospital_id IS DISTINCT FROM OLD.hospital_id OR NEW.region_id IS DISTINCT FROM OLD.region_id OR NEW.active IS DISTINCT FROM OLD.active)
  EXECUTE FUNCTION app_user_scope_track();
CREATE OR REPLACE FUNCTION forbid_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'app_user rows are never deleted; deactivate instead'; END $$;
CREATE TRIGGER app_user_no_delete BEFORE DELETE ON app_user FOR EACH ROW EXECUTE FUNCTION forbid_delete();

CREATE TABLE hospital_distance (
  from_hospital_id uuid NOT NULL REFERENCES hospital(id),
  to_hospital_id uuid NOT NULL REFERENCES hospital(id),
  distance_km numeric(8,2) NOT NULL, duration_min_normal numeric(8,1), duration_min_peak numeric(8,1),
  travel_minutes numeric(8,1),            -- pre-stored value used by F1/F3 (ASM-29)
  travel_minutes_override numeric(8,1),   -- admin override of a pair

  source text NOT NULL DEFAULT 'LOCATION_SERVICE', refreshed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (from_hospital_id, to_hospital_id), CHECK (from_hospital_id <> to_hospital_id)
);
CREATE TABLE config_setting (
  key text NOT NULL, scope text NOT NULL DEFAULT 'GLOBAL',      -- GLOBAL | REGION:<id> | HOSPITAL:<id>
  value jsonb NOT NULL, description text, updated_by uuid REFERENCES app_user(id),
  updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (key, scope)
);

-- ---------- drug master & mapping ----------
CREATE TABLE drug_master (            -- canonical, region-wide, built from VERIFIED mappings
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type catalog_item_type NOT NULL DEFAULT 'DRUG',   -- rev 1.3 (ASM-48)
  gp_id text UNIQUE,                  -- TMT GP id (canonical key for DRUG; Q-22). NULL for SUPPLY/BLOOD (not covered by TMT)
  internal_code text UNIQUE,          -- rev 1.3: system code for SUPPLY/BLOOD central-list items (e.g. SUP-0001); NULL for DRUG
  generic_name text NOT NULL, strength text, dosage_form text, base_unit text NOT NULL,
  is_cold_chain boolean NOT NULL DEFAULT false,
  is_blood_product boolean NOT NULL DEFAULT false,  -- rev 1.2: excluded from F1/F2; borrowable only in F3 emergency between blood-bank hospitals (ASM-47)
  is_high_alert boolean NOT NULL DEFAULT false,
  is_controlled boolean NOT NULL DEFAULT false,   -- v1.4: narcotics/psychotropics, never automated (BR-F1b-014, F-12)
  emergency_class text NOT NULL DEFAULT 'SUPPORTIVE' CHECK (emergency_class IN ('CRITICAL','SUPPORTIVE')),  -- F3 timeouts 3/5 min (Q-12)
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (item_type <> 'DRUG' OR gp_id IS NOT NULL),                 -- a medicine must carry its TMT GP
  CHECK (item_type = 'DRUG' OR (gp_id IS NULL AND internal_code IS NOT NULL)),   -- supplies/blood use the central-list internal code
  CHECK ((item_type = 'BLOOD') = is_blood_product)
);
CREATE TABLE hospital_drug (          -- imported HIS drug list
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES hospital(id),
  local_code text NOT NULL, local_name text NOT NULL, unit_price_thb numeric(12,2),
  local_unit text NOT NULL, tmt_id text, gp_id text, active boolean NOT NULL DEFAULT true,
  ved ved_class NOT NULL DEFAULT 'E', abc abc_class,
  expiry_threshold_days int,          -- pharmacist-set; NULL => config default
  lend_in_packs boolean NOT NULL DEFAULT false,        -- v1.4: round lending up to whole packs (ASM-04, F-32)
  method_override forecast_method,                     -- v1.4: DATA_ADMIN override of F-02 (never MIN_MAX for V/E, ASM-09)
  is_seasonal boolean NOT NULL DEFAULT false,          -- v1.4: manual seasonal flag for F-02
  standard_lead_time_days int CHECK (standard_lead_time_days > 0),   -- v1.4: L when no open PO (F-08)
  min_level numeric(14,3), max_level numeric(14,3),    -- v1.4: Min-Max items (BR-F1a-020)
  drug_master_id uuid REFERENCES drug_master(id),
  UNIQUE (hospital_id, local_code),
  CHECK (method_override IS DISTINCT FROM 'MIN_MAX' OR ved = 'D'),
  CHECK (max_level IS NULL OR min_level IS NULL OR max_level >= min_level)
);
CREATE INDEX hospital_drug_master_idx ON hospital_drug(drug_master_id);
CREATE TABLE drug_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_drug_id uuid NOT NULL REFERENCES hospital_drug(id),
  drug_master_id uuid REFERENCES drug_master(id),
  status mapping_status NOT NULL DEFAULT 'UNMATCHED',
  method text NOT NULL DEFAULT 'TMT' CHECK (method IN ('TMT','CENTRAL_LIST')),   -- rev 1.3: TMT = suggested by name/strength/form (DRUG); CENTRAL_LIST = hospital picked an item from the admin central list (SUPPLY/BLOOD; no confidence score)
  confidence numeric(4,3) CHECK (confidence BETWEEN 0 AND 1),
  unit_conversion_factor numeric(14,6) NOT NULL DEFAULT 1 CHECK (unit_conversion_factor > 0),  -- base units per ONE local unit
  local_pack_unit text,                  -- e.g. กล่อง
  base_units_per_pack numeric(14,3) CHECK (base_units_per_pack > 0),   -- this hospital's pack size, in base units
  manufacturer text,
  suggested_by text NOT NULL DEFAULT 'RULES', verified_by uuid REFERENCES app_user(id), verified_at timestamptz,
  reject_reason text, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), version int NOT NULL DEFAULT 1,
  UNIQUE (hospital_drug_id),
  CHECK (status <> 'VERIFIED' OR (drug_master_id IS NOT NULL AND verified_by IS NOT NULL AND base_units_per_pack IS NOT NULL))
);
CREATE TABLE tmt_reference (
  tmt_id text PRIMARY KEY, level text NOT NULL, name text NOT NULL, parent_tmt_id text, gp_id text
);
CREATE TABLE mapping_candidate (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drug_mapping_id uuid NOT NULL REFERENCES drug_mapping(id) ON DELETE CASCADE,
  tmt_id text REFERENCES tmt_reference(tmt_id), score numeric(4,3) NOT NULL,
  score_parts jsonb NOT NULL, rank int NOT NULL
);
CREATE TABLE hospital_import (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hospital_id uuid NOT NULL REFERENCES hospital(id),
  kind text NOT NULL CHECK (kind IN ('DRUG_LIST','STOCK','USAGE','LOTS')), file_key text NOT NULL,
  rows_total int, rows_ok int, rows_error int, errors jsonb, created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- stock ----------
CREATE TABLE stock_lot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES hospital(id), hospital_drug_id uuid NOT NULL REFERENCES hospital_drug(id),
  lot_no text NOT NULL, expiry_date date NOT NULL,
  manufacturer text, pack_size_base_units numeric(14,3) CHECK (pack_size_base_units > 0),   -- overrides mapping pack size (F-32)
  qty_on_hand numeric(14,3) NOT NULL DEFAULT 0 CHECK (qty_on_hand >= 0),
  qty_held numeric(14,3) NOT NULL DEFAULT 0 CHECK (qty_held >= 0),
  CHECK (qty_held <= qty_on_hand),
  UNIQUE (hospital_id, hospital_drug_id, lot_no),
  updated_at timestamptz NOT NULL DEFAULT now(), version int NOT NULL DEFAULT 1
);
CREATE INDEX stock_lot_expiry_idx ON stock_lot(hospital_id, expiry_date);
CREATE TABLE stock_ledger (          -- source of truth for movements (append-only)
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hospital_id uuid NOT NULL REFERENCES hospital(id), lot_id uuid NOT NULL REFERENCES stock_lot(id),
  delta numeric(14,3) NOT NULL, reason ledger_reason NOT NULL,
  ref_type text, ref_id uuid, occurred_at timestamptz NOT NULL DEFAULT now(), actor_id uuid REFERENCES app_user(id)
);
CREATE INDEX stock_ledger_lot_idx ON stock_ledger(lot_id, occurred_at);
CREATE TABLE stock_snapshot (        -- daily per hospital x drug
  hospital_id uuid NOT NULL REFERENCES hospital(id), hospital_drug_id uuid NOT NULL REFERENCES hospital_drug(id),
  snap_date date NOT NULL, qty_on_hand numeric(14,3) NOT NULL, qty_incoming numeric(14,3) NOT NULL DEFAULT 0,
  qty_held numeric(14,3) NOT NULL DEFAULT 0, PRIMARY KEY (hospital_id, hospital_drug_id, snap_date)
);
CREATE TABLE usage_daily (
  hospital_id uuid NOT NULL REFERENCES hospital(id), hospital_drug_id uuid NOT NULL REFERENCES hospital_drug(id),
  usage_date date NOT NULL, qty_used numeric(14,3) NOT NULL CHECK (qty_used >= 0),
  PRIMARY KEY (hospital_id, hospital_drug_id, usage_date)
);
CREATE TABLE incoming_order (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hospital_id uuid NOT NULL REFERENCES hospital(id),
  hospital_drug_id uuid NOT NULL REFERENCES hospital_drug(id), qty numeric(14,3) NOT NULL CHECK (qty > 0),
  expected_date date NOT NULL, status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RECEIVED','CANCELLED')),
  lead_time_days int
);

-- ---------- forecasting ----------
CREATE TABLE forecast_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz, status job_status NOT NULL DEFAULT 'RUNNING', model_version text, n_items int, n_fallback int, notes text
);
CREATE TABLE forecast_result (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES forecast_run(id) ON DELETE CASCADE,
  hospital_id uuid NOT NULL REFERENCES hospital(id), hospital_drug_id uuid NOT NULL REFERENCES hospital_drug(id),
  granularity forecast_granularity NOT NULL DEFAULT 'WEEK', period_start date,   -- v1.4: one row per period (FR-F1a-005)
  method forecast_method NOT NULL, ved ved_class NOT NULL, abc abc_class,
  u_per_day numeric(14,4) NOT NULL, sigma_per_day numeric(14,4), lead_time_days numeric(6,2) NOT NULL,
  demand_pattern text NOT NULL DEFAULT 'REGULAR' CHECK (demand_pattern IN ('REGULAR','INTERMITTENT','NO_USAGE')),
  lead_time_quantile numeric(14,3),     -- Q_q(L): V P95 / E P90 over lead time; used by F-09 B for INTERMITTENT
  p50 numeric(14,3), p90 numeric(14,3), p95 numeric(14,3),
  total_target numeric(14,3), rop numeric(14,3), min_level numeric(14,3), max_level numeric(14,3),
  confidence_flag text, coverage_ok boolean, computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (run_id, hospital_id, hospital_drug_id, granularity, period_start)
);
CREATE INDEX forecast_result_latest_idx ON forecast_result(hospital_id, hospital_drug_id, granularity, computed_at DESC);
CREATE TABLE forecast_backtest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES forecast_run(id) ON DELETE CASCADE,
  hospital_id uuid NOT NULL, hospital_drug_id uuid NOT NULL, week_start date NOT NULL,
  predicted numeric(14,3), actual numeric(14,3), residual numeric(14,3)
);
CREATE TABLE context_signal (        -- XC-3 context agent signals (seasonality, outbreaks)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), region_id uuid REFERENCES region(id),
  signal_type text NOT NULL, payload jsonb NOT NULL, valid_from date NOT NULL, valid_to date,
  source text NOT NULL, approved_by uuid REFERENCES app_user(id), created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- alerts ----------
CREATE TABLE stock_alert (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hospital_id uuid NOT NULL REFERENCES hospital(id),
  hospital_drug_id uuid NOT NULL REFERENCES hospital_drug(id), type alert_type NOT NULL,
  granularity forecast_granularity NOT NULL DEFAULT 'WEEK',   -- v1.4: one open alert per drug x type x granularity
  severity alert_severity NOT NULL DEFAULT 'NORMAL', status alert_status NOT NULL DEFAULT 'OPEN',
  stock_qty numeric(14,3), incoming_qty numeric(14,3), days_cover numeric(8,2), suggested_borrow_qty numeric(14,3),
  forecast_result_id uuid REFERENCES forecast_result(id), snoozed_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), version int NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX stock_alert_one_open ON stock_alert(hospital_id, hospital_drug_id, type, granularity)
  WHERE status IN ('OPEN','ACKNOWLEDGED','LINKED_TO_REQUEST','SNOOZED');

-- ---------- borrowing ----------
CREATE TABLE borrow_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_no text NOT NULL UNIQUE,
  borrower_hospital_id uuid NOT NULL REFERENCES hospital(id), context request_context NOT NULL,
  status request_status NOT NULL DEFAULT 'DRAFT', urgency alert_severity NOT NULL DEFAULT 'NORMAL',
  stock_alert_id uuid REFERENCES stock_alert(id), incident_id uuid,   -- FK added below
  reason text, created_by uuid NOT NULL REFERENCES app_user(id), approved_by uuid REFERENCES app_user(id), approved_at timestamptz,
  ladder jsonb,                       -- frozen ordered lender ladder (ASM-10)
  first_round_qty numeric(14,3), stop_threshold numeric(14,3),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), version int NOT NULL DEFAULT 1
);
CREATE INDEX borrow_request_status_idx ON borrow_request(borrower_hospital_id, status);
CREATE TABLE borrow_request_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES borrow_request(id) ON DELETE CASCADE,
  kind item_kind NOT NULL DEFAULT 'DRUG', drug_master_id uuid REFERENCES drug_master(id), kit_type_id uuid,
  qty_requested numeric(14,3) NOT NULL CHECK (qty_requested > 0), qty_fulfilled numeric(14,3) NOT NULL DEFAULT 0,
  r_value numeric(14,3), CHECK ((kind='DRUG' AND drug_master_id IS NOT NULL) OR (kind='KIT' AND kit_type_id IS NOT NULL))
);
CREATE FUNCTION borrow_item_blood_guard() RETURNS trigger AS $$   -- rev 1.2 (ASM-47): blood lines only in EMERGENCY context, between blood-bank hospitals
DECLARE blood boolean; ctx request_context; hb boolean;
BEGIN
  IF NEW.drug_master_id IS NULL THEN RETURN NEW; END IF;
  SELECT is_blood_product INTO blood FROM drug_master WHERE id = NEW.drug_master_id;
  IF NOT blood THEN RETURN NEW; END IF;
  SELECT r.context, h.has_blood_bank INTO ctx, hb FROM borrow_request r JOIN hospital h ON h.id = r.borrower_hospital_id WHERE r.id = NEW.request_id;
  IF ctx <> 'EMERGENCY' OR NOT hb THEN RAISE EXCEPTION 'blood product may be borrowed only in an EMERGENCY request by a hospital with a blood bank'; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER borrow_item_blood_guard_trg BEFORE INSERT OR UPDATE ON borrow_request_item FOR EACH ROW EXECUTE FUNCTION borrow_item_blood_guard();
CREATE TABLE borrow_leg (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES borrow_request(id) ON DELETE CASCADE,
  request_item_id uuid REFERENCES borrow_request_item(id),   -- v1.4: which line (drug or kit) this leg asks for; qty_* are for that line
  lender_hospital_id uuid NOT NULL REFERENCES hospital(id), round_no int NOT NULL DEFAULT 1, rank_in_ladder int NOT NULL,
  status leg_status NOT NULL DEFAULT 'PENDING', score_si numeric(5,4), score_parts jsonb, t_transit_min numeric(7,1), window_max_days numeric(7,2),
  qty_asked numeric(14,3) NOT NULL, qty_accepted numeric(14,3), qty_received numeric(14,3),
  sent_at timestamptz, deadline_at timestamptz, reminded_at timestamptz, responded_at timestamptz, responded_by uuid REFERENCES app_user(id),
  reject_reason text, message_text text,
  UNIQUE NULLS NOT DISTINCT (request_id, request_item_id, lender_hospital_id, round_no)
);
CREATE INDEX borrow_leg_item_idx ON borrow_leg(request_item_id);
CREATE INDEX borrow_leg_deadline_idx ON borrow_leg(deadline_at) WHERE status = 'SENT';
CREATE TABLE borrow_leg_lot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), leg_id uuid NOT NULL REFERENCES borrow_leg(id) ON DELETE CASCADE,
  lot_id uuid NOT NULL REFERENCES stock_lot(id), qty numeric(14,3) NOT NULL CHECK (qty > 0)
);
CREATE INDEX borrow_leg_lot_leg_idx ON borrow_leg_lot(leg_id);   -- v1.5: join key of v_transport_item
CREATE TABLE return_obligation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), leg_id uuid NOT NULL REFERENCES borrow_leg(id),
  debtor_hospital_id uuid NOT NULL REFERENCES hospital(id), creditor_hospital_id uuid NOT NULL REFERENCES hospital(id),
  drug_master_id uuid REFERENCES drug_master(id), kit_type_id uuid, qty numeric(14,3) NOT NULL CHECK (qty > 0),   -- base units; return is IN KIND ONLY: same drug, same quantity (ASM-24)
  qty_returned numeric(14,3) NOT NULL DEFAULT 0 CHECK (qty_returned >= 0 AND qty_returned <= qty),
  return_mode text NOT NULL DEFAULT 'IN_KIND' CHECK (return_mode IN ('IN_KIND','BLOOD_REPLACEMENT')),   -- rev 1.2: blood returned by replacement via blood bank (BR-XC-013)
  due_date date NOT NULL, status return_status NOT NULL DEFAULT 'OPEN', returned_at timestamptz, waived_reason text, waived_by uuid REFERENCES app_user(id)
);
CREATE TABLE return_receipt (          -- partial returns; obligation closes when cumulative = borrowed
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), obligation_id uuid NOT NULL REFERENCES return_obligation(id) ON DELETE CASCADE,
  drug_master_id uuid NOT NULL REFERENCES drug_master(id), lot_id uuid REFERENCES stock_lot(id),
  qty_local numeric(14,3) NOT NULL CHECK (qty_local > 0), qty_base numeric(14,3) NOT NULL CHECK (qty_base > 0),
  received_by uuid REFERENCES app_user(id), received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE reliability_stat (
  lender_hospital_id uuid NOT NULL REFERENCES hospital(id), month date NOT NULL,
  requests_received int NOT NULL DEFAULT 0, accepted_on_time int NOT NULL DEFAULT 0, PRIMARY KEY (lender_hospital_id, month)
);
CREATE TABLE document (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL CHECK (kind IN ('BORROW_SLIP','RETURN_SLIP','TRANSFER_SLIP','INCIDENT_REPORT','UCEP_REPORT')),
  ref_type text NOT NULL, ref_id uuid NOT NULL, hospital_id uuid REFERENCES hospital(id), s3_key text NOT NULL, sha256 text NOT NULL,
  counterparty_hospital_id uuid REFERENCES hospital(id),   -- v1.4: the other party; both hospitals may read (FR-XC-006)
  doc_no text NOT NULL,                                    -- v1.4: DR-<hospital>-<yyyy>-<seq6> (BR-XC-007)
  version int NOT NULL DEFAULT 1,                          -- v1.4: issued documents are immutable; a correction = new version
  status text NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED','VOID')),
  supersedes_id uuid REFERENCES document(id), payload jsonb,   -- payload = document lines (lot, expiry, qty, units)
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (doc_no, version)
);

-- ---------- near-expiry (F2) ----------
CREATE TABLE near_expiry_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hospital_id uuid NOT NULL REFERENCES hospital(id), lot_id uuid NOT NULL REFERENCES stock_lot(id),
  status expiry_status NOT NULL DEFAULT 'DETECTED', qty numeric(14,3) NOT NULL CHECK (qty > 0), days_left int NOT NULL,
  value_thb numeric(14,2), decided_by uuid REFERENCES app_user(id), decided_at timestamptz, note text, review_after date,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), version int NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX near_expiry_one_active ON near_expiry_item(lot_id) WHERE status IN ('DETECTED','KEPT','RELEASED_TO_POOL','ALLOCATED');
CREATE TABLE pool_entry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), region_id uuid NOT NULL REFERENCES region(id), near_expiry_item_id uuid NOT NULL UNIQUE REFERENCES near_expiry_item(id),
  qty_available numeric(14,3) NOT NULL CHECK (qty_available >= 0), released_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE allocation_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plan_no text NOT NULL UNIQUE, region_id uuid NOT NULL REFERENCES region(id),
  pool_entry_id uuid NOT NULL REFERENCES pool_entry(id), status plan_status NOT NULL DEFAULT 'DRAFT',
  total_value_thb numeric(14,2), total_transport_cost_thb numeric(14,2), cost_ratio numeric(6,4), economical boolean,
  option_chosen text CHECK (option_chosen IN ('MERGE_SHIPMENTS','RAISE_VALUE','DONATE_OR_DISCARD','HOLD')),
  agent_run_id uuid, approval_deadline timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), version int NOT NULL DEFAULT 1
);
CREATE TABLE allocation_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plan_id uuid NOT NULL REFERENCES allocation_plan(id) ON DELETE CASCADE,
  receiver_hospital_id uuid NOT NULL REFERENCES hospital(id), qty numeric(14,3) NOT NULL CHECK (qty > 0), value_thb numeric(14,2),
  expected_use_before_expiry boolean NOT NULL, distance_km numeric(8,2), transport_cost_thb numeric(12,2), cold_chain boolean NOT NULL DEFAULT false
);
CREATE TABLE plan_approval (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plan_id uuid NOT NULL REFERENCES allocation_plan(id) ON DELETE CASCADE,
  hospital_id uuid NOT NULL REFERENCES hospital(id), decision approval_decision NOT NULL DEFAULT 'PENDING',
  decided_by uuid REFERENCES app_user(id), decided_at timestamptz, comment text, UNIQUE (plan_id, hospital_id)
);
CREATE TABLE vehicle (               -- v1.5: delivery vehicles of a hospital (plate shown on the transport screens)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hospital_id uuid NOT NULL REFERENCES hospital(id), plate text NOT NULL,
  has_cold_box boolean NOT NULL DEFAULT false, active boolean NOT NULL DEFAULT true, UNIQUE (hospital_id, plate)
);
CREATE TABLE transport_task (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ref_type text NOT NULL CHECK (ref_type IN ('ALLOCATION_LINE','BORROW_LEG')),
  ref_id uuid NOT NULL, from_hospital_id uuid NOT NULL REFERENCES hospital(id), to_hospital_id uuid NOT NULL REFERENCES hospital(id),
  status transport_status NOT NULL DEFAULT 'WAITING_DISPATCH', driver_id uuid REFERENCES app_user(id),
  cancel_requested_by uuid REFERENCES hospital(id), cancel_consent_by uuid REFERENCES hospital(id),
  task_no text UNIQUE, vehicle_id uuid REFERENCES vehicle(id), eta_at timestamptz, cancel_reason text,   -- v1.5
  loaded_at timestamptz, departed_at timestamptz, arrived_at timestamptz, received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), version int NOT NULL DEFAULT 1
);
CREATE TABLE transport_photo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), task_id uuid NOT NULL REFERENCES transport_task(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('LOADED','IN_TRANSIT','ARRIVED','RECEIVED')), s3_key text NOT NULL, client_photo_id uuid UNIQUE, taken_at timestamptz NOT NULL DEFAULT now(), received_at timestamptz NOT NULL DEFAULT now(), taken_by uuid REFERENCES app_user(id)
);
CREATE TABLE transport_event (        -- offline-first driver events, synced idempotently (FR-F2a-016)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), task_id uuid NOT NULL REFERENCES transport_task(id) ON DELETE CASCADE,
  client_event_id uuid NOT NULL, seq int NOT NULL, to_status transport_status NOT NULL,
  captured_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), actor_id uuid REFERENCES app_user(id),
  photo_keys text[] NOT NULL DEFAULT '{}', applied boolean NOT NULL DEFAULT false, reject_reason text,
  temperature_c numeric(4,1),            -- v1.5: cold-chain reading taken with the event
  UNIQUE (task_id, client_event_id)
);
CREATE TABLE repeat_expiry_flag (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hospital_id uuid NOT NULL REFERENCES hospital(id), drug_master_id uuid NOT NULL REFERENCES drug_master(id),
  level text NOT NULL CHECK (level IN ('WATCH','RECOMMEND')), lots_12m int NOT NULL, value_12m_thb numeric(14,2),
  suggestion jsonb, dismissed_until date, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (hospital_id, drug_master_id)
);

-- ---------- emergency (F3) ----------
CREATE TABLE kit_type (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, name text NOT NULL, description text,
  needs_cold_chain boolean NOT NULL DEFAULT false, active boolean NOT NULL DEFAULT true
);
ALTER TABLE borrow_request_item ADD CONSTRAINT bri_kit_fk FOREIGN KEY (kit_type_id) REFERENCES kit_type(id);
ALTER TABLE return_obligation ADD CONSTRAINT ro_kit_fk FOREIGN KEY (kit_type_id) REFERENCES kit_type(id);
CREATE TABLE kit_component (
  kit_type_id uuid NOT NULL REFERENCES kit_type(id) ON DELETE CASCADE, drug_master_id uuid NOT NULL REFERENCES drug_master(id),
  qty_per_kit numeric(10,3) NOT NULL CHECK (qty_per_kit > 0), PRIMARY KEY (kit_type_id, drug_master_id)
);
CREATE TABLE kit_recipe (            -- Preset Kit per patient by triage level
  triage triage_level NOT NULL, kit_type_id uuid NOT NULL REFERENCES kit_type(id), qty_per_patient numeric(6,2) NOT NULL CHECK (qty_per_patient >= 0),
  is_critical_min boolean NOT NULL DEFAULT false, PRIMARY KEY (triage, kit_type_id)
);
CREATE TABLE kit_stock (
  hospital_id uuid NOT NULL REFERENCES hospital(id), kit_type_id uuid NOT NULL REFERENCES kit_type(id),
  qty_ready int NOT NULL DEFAULT 0 CHECK (qty_ready >= 0), qty_held int NOT NULL DEFAULT 0 CHECK (qty_held >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (hospital_id, kit_type_id)
);
CREATE TABLE incident (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), incident_no text NOT NULL UNIQUE, hospital_id uuid NOT NULL REFERENCES hospital(id),
  status incident_status NOT NULL DEFAULT 'OPEN', location_lat numeric(9,6), location_lon numeric(9,6), location_text text,
  incident_type text, description text,                      -- v1.4: FR-F3-001 (type and free-text description; no patient data, ASM-27)
  eta_unsure boolean NOT NULL DEFAULT false, eta_minutes int CHECK (eta_minutes >= 0), eta_source eta_source,   -- v1.4: F-26 result; UNAVAILABLE = radio notice, no number
  reported_eta_min int, created_by uuid NOT NULL REFERENCES app_user(id), duplicate_of uuid REFERENCES incident(id),
  cancel_reason text,                                      -- v1.5: given when status = CANCELLED (reported by mistake)
  closed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), version int NOT NULL DEFAULT 1
);
ALTER TABLE borrow_request ADD CONSTRAINT br_incident_fk FOREIGN KEY (incident_id) REFERENCES incident(id);
CREATE TABLE incident_patient_count (
  incident_id uuid NOT NULL REFERENCES incident(id) ON DELETE CASCADE, triage triage_level NOT NULL, count int NOT NULL CHECK (count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (incident_id, triage)
);
CREATE TABLE emergency_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), incident_id uuid NOT NULL REFERENCES incident(id) ON DELETE CASCADE, revision int NOT NULL DEFAULT 1,
  status plan_status NOT NULL DEFAULT 'DRAFT', estimated_need jsonb NOT NULL, critical_min jsonb NOT NULL, buffer jsonb NOT NULL,
  steps jsonb NOT NULL, shortfall jsonb, approved_by uuid REFERENCES app_user(id), approved_at timestamptz,
  agent_run_id uuid, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (incident_id, revision)
);
CREATE TABLE kit_pack_task (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plan_id uuid NOT NULL REFERENCES emergency_plan(id) ON DELETE CASCADE, hospital_id uuid NOT NULL REFERENCES hospital(id),
  kit_type_id uuid NOT NULL REFERENCES kit_type(id), qty int NOT NULL CHECK (qty > 0), status text NOT NULL DEFAULT 'TODO' CHECK (status IN ('TODO','DONE')),
  confirmed_by uuid REFERENCES app_user(id), confirmed_at timestamptz
);
CREATE TABLE incident_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), incident_id uuid NOT NULL REFERENCES incident(id) ON DELETE CASCADE,
  drug_master_id uuid REFERENCES drug_master(id), kit_type_id uuid REFERENCES kit_type(id), qty_used numeric(14,3) NOT NULL, recorded_by uuid REFERENCES app_user(id)
);

-- ---------- agents & audit ----------
CREATE TABLE agent_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agent text NOT NULL, task text NOT NULL, ref_type text, ref_id uuid, hospital_id uuid REFERENCES hospital(id),
  model_id text, input_hash text NOT NULL, input jsonb NOT NULL, output jsonb, status text NOT NULL CHECK (status IN ('OK','INVALID','FALLBACK','ERROR','SKIPPED')),
  steps int, latency_ms int, tokens_in int, tokens_out int, guardrail_hits jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE agent_tool_call (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, run_id uuid NOT NULL REFERENCES agent_run(id) ON DELETE CASCADE, seq int NOT NULL,
  tool text NOT NULL, args jsonb NOT NULL, result jsonb, error text, latency_ms int
);
CREATE TABLE decision_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agent_run_id uuid REFERENCES agent_run(id), ref_type text NOT NULL, ref_id uuid NOT NULL,
  decision text NOT NULL, rationale text, human_actor_id uuid REFERENCES app_user(id), human_action text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audit_log (               -- append-only, hash-chained
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid, actor_role text, hospital_id uuid, action text NOT NULL, entity_type text NOT NULL, entity_id uuid,
  before jsonb, after jsonb, request_id text, prev_hash text, row_hash text NOT NULL,
  reason text, agent_run_id uuid REFERENCES agent_run(id)   -- v1.5: why (waive, config change...) and the Agent run behind it; reason is part of the hash
);
CREATE TABLE audit_log_context (      -- personal data kept OUTSIDE the hash chain so it can be deleted after retention (12 months)
  audit_id bigint PRIMARY KEY REFERENCES audit_log(id), ip inet, user_agent text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_entity_idx ON audit_log(entity_type, entity_id);
CREATE TABLE login_event (            -- v1.5: sign-in history (ADM-01 KPIs, ADM-02/03 account tables). Personal data (ip, device): purge after the same 12-month retention as audit_log_context.
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, user_id uuid REFERENCES app_user(id),   -- NULL when the e-mail matches no account
  email text NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(), success boolean NOT NULL, failure_reason text,
  ip inet, device text, browser text, user_agent text
);
CREATE INDEX login_event_time_idx ON login_event(occurred_at);
CREATE INDEX login_event_user_idx ON login_event(user_id, occurred_at);
CREATE TABLE audit_chain_head (       -- v1.4: one row = tail of the hash chain; locked per insert so concurrent writers queue up instead of forking the chain
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton), last_hash text
);
INSERT INTO audit_chain_head(singleton) VALUES (true);
CREATE OR REPLACE FUNCTION audit_log_chain() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE p text;
BEGIN
  SELECT last_hash INTO p FROM audit_chain_head WHERE singleton FOR UPDATE;   -- lock held until commit; id is assigned BEFORE this lock, so chain order = commit order, not id order
  NEW.prev_hash := p;
  NEW.row_hash := encode(sha256(convert_to(coalesce(p,'') || extract(epoch FROM NEW.occurred_at)::text || coalesce(NEW.actor_id::text,'') || NEW.action || NEW.entity_type
                     || coalesce(NEW.entity_id::text,'') || coalesce(NEW.after::text,'') || coalesce(NEW.reason,''), 'UTF8')), 'hex');
  UPDATE audit_chain_head SET last_hash = NEW.row_hash WHERE singleton;
  RETURN NEW;
END $$;
CREATE TRIGGER audit_log_chain_trg BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_log_chain();
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME; END $$;
CREATE TRIGGER audit_log_ro BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER stock_ledger_ro BEFORE UPDATE OR DELETE ON stock_ledger FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE OR REPLACE FUNCTION audit_chain_verify() RETURNS bigint LANGUAGE sql STABLE AS $$   -- JOB-15: number of problems (0 = chain intact). Walks by prev_hash, never by id.
  SELECT (SELECT CASE WHEN count(*) = 0 THEN 0 ELSE abs(count(*) FILTER (WHERE prev_hash IS NULL) - 1) END FROM audit_log)   -- exactly one genesis row
       + (SELECT count(*) FROM (SELECT prev_hash FROM audit_log WHERE prev_hash IS NOT NULL GROUP BY 1 HAVING count(*) > 1) f)                         -- forks
       + (SELECT count(*) FROM audit_log a WHERE a.prev_hash IS NOT NULL AND NOT EXISTS (SELECT 1 FROM audit_log x WHERE x.row_hash = a.prev_hash))      -- missing parent
       + (SELECT count(*) FROM audit_log a WHERE a.row_hash <> encode(sha256(convert_to(coalesce(a.prev_hash,'') || extract(epoch FROM a.occurred_at)::text
           || coalesce(a.actor_id::text,'') || a.action || a.entity_type || coalesce(a.entity_id::text,'') || coalesce(a.after::text,'') || coalesce(a.reason,''), 'UTF8')), 'hex'))  -- tampered
$$;

-- ---------- notifications, jobs, reporting ----------
CREATE TABLE notification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES app_user(id), hospital_id uuid REFERENCES hospital(id),
  channel notif_channel NOT NULL DEFAULT 'IN_APP', kind text NOT NULL, title text NOT NULL, body text, ref_type text, ref_id uuid,
  read_at timestamptz, sent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notification_user_idx ON notification(user_id, read_at);
CREATE TABLE job_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_code text NOT NULL, status job_status NOT NULL DEFAULT 'QUEUED',
  started_at timestamptz, finished_at timestamptz, stats jsonb, error text
);
CREATE TABLE idempotency_key (
  key text NOT NULL, user_id uuid NOT NULL, request_hash text NOT NULL, response jsonb, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (key, user_id)
);
CREATE TABLE value_record (            -- XC-4 value dashboard
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hospital_id uuid REFERENCES hospital(id), region_id uuid REFERENCES region(id),
  metric text NOT NULL, period date NOT NULL, value_thb numeric(16,2), value_qty numeric(16,3), ref_type text, ref_id uuid, detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX value_record_idx ON value_record(metric, period);


-- ---------- additional reference tables ----------
CREATE TABLE drug_mapping_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, drug_mapping_id uuid NOT NULL REFERENCES drug_mapping(id) ON DELETE CASCADE,
  from_status mapping_status, to_status mapping_status NOT NULL, actor_id uuid REFERENCES app_user(id), note text, occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE incident_extra_rule (        -- extra items outside kits, per triage level
  triage triage_level NOT NULL, drug_master_id uuid NOT NULL REFERENCES drug_master(id), qty_per_patient numeric(10,3) NOT NULL CHECK (qty_per_patient >= 0),
  is_critical_min boolean NOT NULL DEFAULT false, PRIMARY KEY (triage, drug_master_id)
);
CREATE TABLE regional_warehouse_stock (   -- optional regional warehouse balance (ASSUMPTION ASM-42)
  region_id uuid NOT NULL REFERENCES region(id), drug_master_id uuid NOT NULL REFERENCES drug_master(id), qty numeric(14,3) NOT NULL DEFAULT 0 CHECK (qty >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (region_id, drug_master_id)
);
CREATE TABLE report_definition (
  id text PRIMARY KEY, name text NOT NULL, description text, query_spec jsonb NOT NULL, roles role_code[] NOT NULL
);

-- ---------- updated_at triggers ----------
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['hospital','drug_mapping','stock_lot','stock_alert','borrow_request','near_expiry_item','allocation_plan','transport_task','incident'] LOOP
    EXECUTE format('CREATE TRIGGER %I_touch BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_updated_at()', t, t);
  END LOOP;
END $$;

-- ---------- Row-Level Security ----------
-- Pattern: rows visible when row.hospital matches session hospital, OR role is region/system/auditor within the region.
-- The application role "doorare_app" is NOT a superuser and does not BYPASSRLS.
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='doorare_app') THEN CREATE ROLE doorare_app NOLOGIN; END IF; END $$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['stock_lot','stock_ledger','stock_snapshot','usage_daily','incoming_order','forecast_result','stock_alert','near_expiry_item','hospital_drug','kit_stock','incident','notification','hospital_import','vehicle'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY %I_tenant ON %I USING (
        app_role() IN ('SYSTEM_ADMIN','AUDITOR','REGION_ADMIN','DATA_ADMIN') OR hospital_id = app_hospital()) $f$, t, t);
  END LOOP;
END $$;
-- Borrowing is bilateral: borrower and each lender can see the request / legs.
-- v1.4 fix: the two policies used to query each other's table, which Postgres rejects with
-- "infinite recursion detected in policy". These SECURITY DEFINER helpers read the other table without RLS.
CREATE OR REPLACE FUNCTION app_is_lender_of(req uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$ SELECT EXISTS (SELECT 1 FROM borrow_leg l WHERE l.request_id = req AND l.lender_hospital_id = app_hospital() AND l.status <> 'PENDING') $$;
CREATE OR REPLACE FUNCTION app_is_borrower_of(req uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$ SELECT EXISTS (SELECT 1 FROM borrow_request r WHERE r.id = req AND r.borrower_hospital_id = app_hospital()) $$;
ALTER TABLE borrow_request ENABLE ROW LEVEL SECURITY;
CREATE POLICY borrow_request_party ON borrow_request USING (
  app_role() IN ('SYSTEM_ADMIN','AUDITOR','REGION_ADMIN') OR borrower_hospital_id = app_hospital() OR app_is_lender_of(id));
ALTER TABLE borrow_leg ENABLE ROW LEVEL SECURITY;
CREATE POLICY borrow_leg_party ON borrow_leg USING (
  app_role() IN ('SYSTEM_ADMIN','AUDITOR','REGION_ADMIN') OR lender_hospital_id = app_hospital() OR app_is_borrower_of(request_id));
ALTER TABLE plan_approval ENABLE ROW LEVEL SECURITY;
CREATE POLICY plan_approval_party ON plan_approval USING (app_role() IN ('SYSTEM_ADMIN','AUDITOR','REGION_ADMIN') OR hospital_id = app_hospital());
-- v1.4: remaining hospital-scoped tables (SEC-003)
ALTER TABLE pool_entry ENABLE ROW LEVEL SECURITY;      -- pool is region-wide data (ASM-12, Q-19)
CREATE POLICY pool_entry_region ON pool_entry USING (app_role() IN ('SYSTEM_ADMIN','AUDITOR') OR region_id = app_region());
ALTER TABLE allocation_plan ENABLE ROW LEVEL SECURITY;  -- origin, receivers and approvers of the plan
CREATE POLICY allocation_plan_party ON allocation_plan USING (
  app_role() IN ('SYSTEM_ADMIN','AUDITOR','REGION_ADMIN')
  OR EXISTS (SELECT 1 FROM plan_approval a WHERE a.plan_id = allocation_plan.id AND a.hospital_id = app_hospital())
  OR EXISTS (SELECT 1 FROM allocation_line l WHERE l.plan_id = allocation_plan.id AND l.receiver_hospital_id = app_hospital())
  OR EXISTS (SELECT 1 FROM pool_entry p JOIN near_expiry_item n ON n.id = p.near_expiry_item_id
             WHERE p.id = allocation_plan.pool_entry_id AND n.hospital_id = app_hospital()));
ALTER TABLE transport_task ENABLE ROW LEVEL SECURITY;
CREATE POLICY transport_task_party ON transport_task USING (
  app_role() IN ('SYSTEM_ADMIN','AUDITOR','REGION_ADMIN') OR from_hospital_id = app_hospital() OR to_hospital_id = app_hospital());
ALTER TABLE return_obligation ENABLE ROW LEVEL SECURITY;
CREATE POLICY return_obligation_party ON return_obligation USING (
  app_role() IN ('SYSTEM_ADMIN','AUDITOR','REGION_ADMIN') OR debtor_hospital_id = app_hospital() OR creditor_hospital_id = app_hospital());
ALTER TABLE document ENABLE ROW LEVEL SECURITY;
CREATE POLICY document_party ON document USING (
  app_role() IN ('SYSTEM_ADMIN','AUDITOR','REGION_ADMIN') OR hospital_id = app_hospital() OR counterparty_hospital_id = app_hospital());
-- v1.5: user-scoped tables. app_user has no hospital column the policy can use on these rows, so a SECURITY DEFINER helper looks it up.
CREATE OR REPLACE FUNCTION app_user_hospital(uid uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$ SELECT hospital_id FROM app_user WHERE id = uid $$;
ALTER TABLE app_user_role ENABLE ROW LEVEL SECURITY;
CREATE POLICY app_user_role_scope ON app_user_role USING (
  app_role() IN ('SYSTEM_ADMIN','AUDITOR','REGION_ADMIN') OR app_user_hospital(user_id) = app_hospital());
ALTER TABLE login_event ENABLE ROW LEVEL SECURITY;      -- SYSTEM_ADMIN/AUDITOR see all; a hospital sees its own users' sign-ins
CREATE POLICY login_event_read ON login_event FOR SELECT USING (
  app_role() IN ('SYSTEM_ADMIN','AUDITOR') OR app_user_hospital(user_id) = app_hospital());
CREATE POLICY login_event_insert ON login_event FOR INSERT WITH CHECK (true);   -- written by the sign-in service before a role is known
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_read ON audit_log FOR SELECT USING (app_role() IN ('SYSTEM_ADMIN','AUDITOR') OR hospital_id = app_hospital());
CREATE POLICY audit_insert ON audit_log FOR INSERT WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO doorare_app;
REVOKE UPDATE, DELETE ON audit_log, stock_ledger FROM doorare_app;
REVOKE UPDATE ON login_event FROM doorare_app;   -- history is never edited
REVOKE INSERT, UPDATE, DELETE ON audit_chain_head FROM doorare_app;   -- only the SECURITY DEFINER trigger moves the chain head
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO doorare_app;

-- ---------- convenience views ----------
CREATE VIEW v_lendable_stock AS
SELECT l.hospital_id, hd.drug_master_id, l.id AS lot_id, l.expiry_date,
       (l.qty_on_hand - l.qty_held) AS free_qty
FROM stock_lot l JOIN hospital_drug hd ON hd.id = l.hospital_drug_id
JOIN drug_mapping m ON m.hospital_drug_id = hd.id AND m.status = 'VERIFIED'
JOIN drug_master dm ON dm.id = hd.drug_master_id
JOIN hospital hh ON hh.id = l.hospital_id
WHERE l.qty_on_hand - l.qty_held > 0
  AND (NOT dm.is_blood_product OR hh.has_blood_bank);   -- rev 1.2: blood visible only at blood-bank hospitals; F1 callers also filter is_blood_product=false     -- LendableStock = max(0, stock - TT) is applied in code (F-10)

CREATE VIEW v_latest_forecast AS
SELECT DISTINCT ON (hospital_id, hospital_drug_id, granularity, period_start) * FROM forecast_result ORDER BY hospital_id, hospital_drug_id, granularity, period_start, computed_at DESC;

-- ---------- cross-hospital shipment detail ----------
-- A receiving hospital must see WHAT is on its way (drug, lot, expiry, qty, cold chain), but RLS hides the sender's
-- stock_lot / near_expiry_item / pool_entry. This view runs with the owner's rights (so it can read those tables) and does
-- its own filtering: a row is visible only to the sending or receiving hospital of the task. SYSTEM_ADMIN/AUDITOR are
-- deliberately NOT included (RBAC: no lot-level data). No price and no remaining stock of the sender are exposed (RBAC §3).
-- DEPLOYMENT: a view runs with its OWNER's rights. It only sees the sender's rows if the owner also owns the tables (the migration role creates
-- both, as here; no BYPASSRLS needed) and the tables do NOT use FORCE ROW LEVEL SECURITY. Keep it that way, or the receiver will see 0 rows.
CREATE OR REPLACE VIEW v_transport_item WITH (security_barrier = true) AS
SELECT t.id AS task_id, t.ref_type, t.ref_id, t.from_hospital_id, t.to_hospital_id, t.status,
       dm.id AS drug_master_id, dm.generic_name, dm.strength, dm.dosage_form, dm.base_unit,
       dm.is_cold_chain, dm.is_blood_product,
       l.lot_no, l.expiry_date, bl.qty AS qty,
       t.task_no, t.eta_at, veh.plate AS vehicle_plate, drv.display_name AS driver_name
FROM transport_task t
LEFT JOIN vehicle veh ON veh.id = t.vehicle_id
LEFT JOIN app_user drv ON drv.id = t.driver_id
JOIN borrow_leg_lot bl ON t.ref_type = 'BORROW_LEG' AND bl.leg_id = t.ref_id
JOIN stock_lot l ON l.id = bl.lot_id
JOIN hospital_drug hd ON hd.id = l.hospital_drug_id
JOIN drug_master dm ON dm.id = hd.drug_master_id
WHERE t.from_hospital_id = app_hospital() OR t.to_hospital_id = app_hospital()
UNION ALL
SELECT t.id, t.ref_type, t.ref_id, t.from_hospital_id, t.to_hospital_id, t.status,
       dm.id, dm.generic_name, dm.strength, dm.dosage_form, dm.base_unit,
       dm.is_cold_chain, dm.is_blood_product,
       l.lot_no, l.expiry_date, al.qty,
       t.task_no, t.eta_at, veh.plate, drv.display_name
FROM transport_task t
LEFT JOIN vehicle veh ON veh.id = t.vehicle_id
LEFT JOIN app_user drv ON drv.id = t.driver_id
JOIN allocation_line al ON t.ref_type = 'ALLOCATION_LINE' AND al.id = t.ref_id
JOIN allocation_plan ap ON ap.id = al.plan_id
JOIN pool_entry pe ON pe.id = ap.pool_entry_id
JOIN near_expiry_item ne ON ne.id = pe.near_expiry_item_id
JOIN stock_lot l ON l.id = ne.lot_id
JOIN hospital_drug hd ON hd.id = l.hospital_drug_id
JOIN drug_master dm ON dm.id = hd.drug_master_id
WHERE t.from_hospital_id = app_hospital() OR t.to_hospital_id = app_hospital();
GRANT SELECT ON v_transport_item TO doorare_app;
