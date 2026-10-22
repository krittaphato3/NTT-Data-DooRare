-- Demo backfill: extends the mock history from 2026-09-30 to 2026-10-21 (day by day).
-- Per drug and day: usage ~ recent average (deterministic jitter), taken FEFO from lots that are not expired
-- (and not held), receipts for open orders that fall due, reorders when cover < 14 days, expired lots written off
-- until 2026-10-18 (later ones stay in stock so the pharmacist/warehouse have something to handle).
-- New lots are named DEMO-R<yymmdd>-<n>. Undo = `npm run db:restore` (needs `npm run db:snapshot` before).
-- Not idempotent: run once on a snapshot-restored database.
\set ON_ERROR_STOP on
DO $$
DECLARE
  d date; h record; lot record; want numeric; take numeric; avail numeric; avg28 numeric; cover numeric;
  o record; n int; lead int; jit numeric; lot_id uuid; remaining numeric; seq int := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM usage_daily WHERE usage_date > '2026-09-30') THEN
    RAISE EXCEPTION 'usage_daily already has rows after 2026-09-30: restore the snapshot first';
  END IF;
  -- the 36 orders left OPEN on 30 Sep arrive over the first days of October
  UPDATE incoming_order SET expected_date = DATE '2026-10-01' + (abs(hashtext(id::text)) % 4)
   WHERE status = 'OPEN' AND expected_date <= '2026-09-30';

  FOR d IN SELECT g::date FROM generate_series('2026-10-01'::date, '2026-10-21'::date, '1 day') g LOOP
    -- 1) write off expired lots (until 18 Oct)
    IF d <= '2026-10-18' THEN
      FOR lot IN SELECT id, hospital_id, qty_on_hand FROM stock_lot
                 WHERE expiry_date < d AND qty_on_hand > 0 AND qty_held = 0 LOOP
        INSERT INTO stock_ledger(hospital_id, lot_id, delta, reason, occurred_at)
          VALUES (lot.hospital_id, lot.id, -lot.qty_on_hand, 'EXPIRED_WRITEOFF', d + time '08:00');
        UPDATE stock_lot SET qty_on_hand = 0, updated_at = d + time '08:00', version = version + 1 WHERE id = lot.id;
      END LOOP;
    END IF;

    -- 2) receipts of due orders
    FOR o IN SELECT io.*, hd.local_code FROM incoming_order io JOIN hospital_drug hd ON hd.id = io.hospital_drug_id
             WHERE io.status = 'OPEN' AND io.expected_date <= d ORDER BY io.expected_date, io.id LOOP
      seq := seq + 1;
      INSERT INTO stock_lot(hospital_id, hospital_drug_id, lot_no, expiry_date, manufacturer, pack_size_base_units, qty_on_hand, updated_at)
        VALUES (o.hospital_id, o.hospital_drug_id, 'DEMO-R' || to_char(d, 'YYMMDD') || '-' || seq,
                d + 420 + (abs(hashtext(o.id::text)) % 300), 'องค์การเภสัชกรรม (ตัวอย่าง)',
                (SELECT pack_size_base_units FROM stock_lot WHERE hospital_drug_id = o.hospital_drug_id AND pack_size_base_units IS NOT NULL LIMIT 1),
                o.qty, d + time '09:00')
        RETURNING id INTO lot_id;
      INSERT INTO stock_ledger(hospital_id, lot_id, delta, reason, ref_type, ref_id, occurred_at)
        VALUES (o.hospital_id, lot_id, o.qty, 'RECEIPT', 'INCOMING_ORDER', o.id, d + time '09:00');
      UPDATE incoming_order SET status = 'RECEIVED' WHERE id = o.id;
    END LOOP;

    -- 3) usage per drug, FEFO
    FOR h IN SELECT hd.id, hd.hospital_id, COALESCE(hd.standard_lead_time_days, 5) AS lead FROM hospital_drug hd WHERE hd.active LOOP
      SELECT COALESCE(avg(qty_used), 0) INTO avg28 FROM usage_daily
       WHERE hospital_drug_id = h.id AND usage_date >= d - 28 AND usage_date < d;
      jit := 0.8 + 0.4 * ((abs(hashtext(h.id::text || d::text)) % 1000) / 1000.0);
      want := round(avg28 * jit * CASE WHEN extract(isodow FROM d) IN (6, 7) THEN 0.7 ELSE 1.05 END);
      remaining := want;
      FOR lot IN SELECT id, hospital_id, qty_on_hand - qty_held AS free FROM stock_lot
                 WHERE hospital_drug_id = h.id AND expiry_date >= d AND qty_on_hand - qty_held > 0
                 ORDER BY expiry_date, id LOOP
        EXIT WHEN remaining <= 0;
        take := least(lot.free, remaining);
        INSERT INTO stock_ledger(hospital_id, lot_id, delta, reason, ref_type, occurred_at)
          VALUES (lot.hospital_id, lot.id, -take, 'ISSUE_USAGE', 'DEMO_DAILY', d + time '17:00');
        UPDATE stock_lot SET qty_on_hand = qty_on_hand - take, updated_at = d + time '17:00', version = version + 1 WHERE id = lot.id;
        remaining := remaining - take;
      END LOOP;
      INSERT INTO usage_daily(hospital_id, hospital_drug_id, usage_date, qty_used) VALUES (h.hospital_id, h.id, d, want - remaining);

      -- 4) reorder when cover (stock + open orders) is below 14 days of use
      SELECT COALESCE(sum(qty_on_hand), 0) INTO avail FROM stock_lot WHERE hospital_drug_id = h.id AND expiry_date >= d;
      SELECT avail + COALESCE(sum(qty), 0) INTO cover FROM incoming_order WHERE hospital_drug_id = h.id AND status = 'OPEN';
      IF avg28 > 0 AND cover < avg28 * 14 THEN
        INSERT INTO incoming_order(hospital_id, hospital_drug_id, qty, expected_date, status, lead_time_days)
          VALUES (h.hospital_id, h.id, ceil(avg28 * 30), d + h.lead, 'OPEN', h.lead);
      END IF;

      -- 5) end-of-day snapshot
      INSERT INTO stock_snapshot(hospital_id, hospital_drug_id, snap_date, qty_on_hand, qty_incoming, qty_held)
        SELECT h.hospital_id, h.id, d,
               COALESCE((SELECT sum(qty_on_hand) FROM stock_lot WHERE hospital_drug_id = h.id AND expiry_date >= d), 0),
               COALESCE((SELECT sum(qty) FROM incoming_order WHERE hospital_drug_id = h.id AND status = 'OPEN'), 0),
               COALESCE((SELECT sum(qty_held) FROM stock_lot WHERE hospital_drug_id = h.id), 0);
    END LOOP;
  END LOOP;
END $$;
SELECT (SELECT count(*) FROM usage_daily WHERE usage_date > '2026-09-30') usage_rows,
       (SELECT count(*) FROM stock_lot WHERE lot_no LIKE 'DEMO-%') new_lots,
       (SELECT count(*) FROM incoming_order WHERE status='OPEN') open_orders,
       (SELECT count(*) FROM stock_lot WHERE qty_on_hand>0 AND expiry_date<current_date) expired_in_stock;
