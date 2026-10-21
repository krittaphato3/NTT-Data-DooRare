-- Test data for the transport API: four in-flight borrow shipments (the mock data has only RECEIVED tasks).
-- Safe to re-run (skips when the first seeded request already exists). Numbers continue the real sequences (BR-/TR-<year>-<next>). Does not touch schema.sql or the mock CSVs.
--   docker compose exec -T db psql -U doorare -d doorare -v ON_ERROR_STOP=1 < db/seed/transport_pending.sql
--
--   #  lender -> borrower  task status        leg status   stock effect (matches the state)
--   1  HA -> HB            WAITING_DISPATCH   ACCEPTED     10 units held on the lender lot
--   2  HA -> HC            LOADED             LOADED       10 units already out of the lender lot (LEND_OUT)
--   3  HB -> HA            IN_TRANSIT         IN_TRANSIT   already out of HB; driver of HB assigned
--   4  HC -> HA            ARRIVED            IN_TRANSIT   already out of HC; ready for HA's officer to receive
-- `npm run db:reset` wipes this; run the file again afterwards.
DO $$
DECLARE
  sc record;
  drug uuid;
  lender uuid; borrower uuid; lot uuid; req uuid; item uuid; leg uuid; task uuid; veh uuid; drv uuid; pharm uuid;
  qty numeric := 10;
  tstat transport_status; lstat leg_status;
  n int := 0;
  yr text := to_char(current_date, 'YYYY');
  req_base int; task_base int;
BEGIN
  IF EXISTS (SELECT 1 FROM borrow_request WHERE id = md5('seed-transport-req-1')::uuid) THEN
    RAISE NOTICE 'transport seed already present - skipped';
    RETURN;
  END IF;

  SELECT COALESCE(max(substring(request_no FROM '[0-9]+$')::int), 0) INTO req_base  FROM borrow_request WHERE request_no LIKE 'BR-' || yr || '-%';
  SELECT COALESCE(max(substring(task_no    FROM '[0-9]+$')::int), 0) INTO task_base FROM transport_task  WHERE task_no    LIKE 'TR-' || yr || '-%';

  FOR sc IN SELECT * FROM (VALUES
      (1, 'HA', 'HB', 'WAITING_DISPATCH', 'ACCEPTED'),
      (2, 'HA', 'HC', 'LOADED',           'LOADED'),
      (3, 'HB', 'HA', 'IN_TRANSIT',       'IN_TRANSIT'),
      (4, 'HC', 'HA', 'ARRIVED',          'IN_TRANSIT')
    ) AS t(no, lender_code, borrower_code, task_status, leg_status)
  LOOP
    n := sc.no;
    tstat := sc.task_status::transport_status;
    lstat := sc.leg_status::leg_status;
    SELECT id INTO lender   FROM hospital WHERE code = sc.lender_code;
    SELECT id INTO borrower FROM hospital WHERE code = sc.borrower_code;

    -- a drug every hospital lists, with a lender lot that has free stock and a long shelf life
    SELECT hd.drug_master_id, sl.id INTO drug, lot
      FROM stock_lot sl JOIN hospital_drug hd ON hd.id = sl.hospital_drug_id
     WHERE sl.hospital_id = lender AND sl.qty_on_hand - sl.qty_held >= 40 AND sl.expiry_date > current_date + 180
       AND hd.drug_master_id IN (SELECT drug_master_id FROM hospital_drug WHERE drug_master_id IS NOT NULL GROUP BY 1 HAVING count(DISTINCT hospital_id) = 5)
     ORDER BY sl.expiry_date, sl.lot_no OFFSET (n - 1) LIMIT 1;
    IF lot IS NULL THEN RAISE EXCEPTION 'no suitable lot for scenario %', n; END IF;

    SELECT id INTO pharm FROM app_user WHERE role = 'PHARMACIST' AND hospital_id = borrower ORDER BY email LIMIT 1;
    SELECT id INTO veh   FROM vehicle  WHERE hospital_id = lender ORDER BY plate LIMIT 1;
    SELECT id INTO drv   FROM app_user WHERE role = 'DRIVER' AND hospital_id = lender ORDER BY email LIMIT 1;

    req  := md5('seed-transport-req-'  || n)::uuid;
    item := md5('seed-transport-item-' || n)::uuid;
    leg  := md5('seed-transport-leg-'  || n)::uuid;
    task := md5('seed-transport-task-' || n)::uuid;

    INSERT INTO borrow_request (id, request_no, borrower_hospital_id, context, status, urgency, reason, created_by, approved_by, approved_at, created_at, updated_at)
    VALUES (req, 'BR-' || yr || '-' || lpad((req_base + n)::text, 6, '0'), borrower, 'MANUAL', 'IN_PROGRESS', 'NORMAL', 'seed: transport test', pharm, pharm, now() - interval '3 hours', now() - interval '4 hours', now());
    INSERT INTO borrow_request_item (id, request_id, kind, drug_master_id, qty_requested) VALUES (item, req, 'DRUG', drug, qty);
    INSERT INTO borrow_leg (id, request_id, request_item_id, lender_hospital_id, round_no, rank_in_ladder, status, qty_asked, qty_accepted, sent_at, responded_at, responded_by)
    VALUES (leg, req, item, lender, 1, 1, lstat, qty, qty, now() - interval '3 hours', now() - interval '2 hours', pharm);
    INSERT INTO borrow_leg_lot (leg_id, lot_id, qty) VALUES (leg, lot, qty);

    INSERT INTO transport_task (id, ref_type, ref_id, from_hospital_id, to_hospital_id, status, driver_id, vehicle_id, task_no, eta_at,
                                loaded_at, departed_at, arrived_at, created_at, updated_at)
    VALUES (task, 'BORROW_LEG', leg, lender, borrower, tstat, drv, veh, 'TR-' || yr || '-' || lpad((task_base + n)::text, 6, '0'), now() + interval '2 hours',
            CASE WHEN tstat <> 'WAITING_DISPATCH' THEN now() - interval '90 minutes' END,
            CASE WHEN tstat IN ('IN_TRANSIT', 'ARRIVED') THEN now() - interval '75 minutes' END,
            CASE WHEN tstat = 'ARRIVED' THEN now() - interval '10 minutes' END,
            now() - interval '2 hours', now());

    IF tstat = 'WAITING_DISPATCH' THEN
      UPDATE stock_lot SET qty_held = qty_held + qty WHERE id = lot;                       -- accepted leg reserves the lot
    ELSE
      UPDATE stock_lot SET qty_on_hand = qty_on_hand - qty, updated_at = now(), version = version + 1 WHERE id = lot;   -- already loaded
      INSERT INTO stock_ledger (hospital_id, lot_id, delta, reason, ref_type, ref_id) VALUES (lender, lot, -qty, 'LEND_OUT', 'borrow_leg', leg);
      INSERT INTO transport_event (task_id, client_event_id, seq, to_status, captured_at, applied, photo_keys, actor_id)
      VALUES (task, gen_random_uuid(), 1, 'LOADED', now() - interval '90 minutes', true, ARRAY['seed/loaded.jpg'], drv);
      IF tstat IN ('IN_TRANSIT', 'ARRIVED') THEN
        INSERT INTO transport_event (task_id, client_event_id, seq, to_status, captured_at, applied, actor_id)
        VALUES (task, gen_random_uuid(), 2, 'IN_TRANSIT', now() - interval '75 minutes', true, drv);
      END IF;
      IF tstat = 'ARRIVED' THEN
        INSERT INTO transport_event (task_id, client_event_id, seq, to_status, captured_at, applied, photo_keys, actor_id)
        VALUES (task, gen_random_uuid(), 3, 'ARRIVED', now() - interval '10 minutes', true, ARRAY['seed/arrived.jpg'], drv);
      END IF;
    END IF;
  END LOOP;
  RAISE NOTICE 'transport seed inserted (4 shipments)';
END $$;
