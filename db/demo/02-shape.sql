-- Step 2 of the demo data: shapes the 19-21 Oct situation on top of 01-backfill (db/demo/01-backfill.sql).
--   * usage spike on 20-21 Oct that leaves a few V/E drugs low at HA (2 very low, 3 low), HB (2) and HC (1)
--   * lots close to expiry (HA 5, HB 3, HC 2) and 2 lots already expired at HA, so the pharmacist/warehouse have work
-- All new lots are named DEMO-NE-* / DEMO-EXP-*; spikes are ledger rows with ref_type DEMO_SPIKE.
\set ON_ERROR_STOP on
-- old mock requests left half-done for years (all their legs are already finished) are closed, so they do not count as open work
UPDATE borrow_request SET status = 'CLOSED_UNFULFILLED', updated_at = now(), version = version + 1
 WHERE status IN ('PARTIALLY_FULFILLED', 'ESCALATED') AND created_at < '2026-10-15';

DO $$
DECLARE
  spec record; hd record; lot record; free numeric; target numeric; take numeric; remaining numeric; n int;
BEGIN
  IF EXISTS (SELECT 1 FROM stock_ledger WHERE ref_type = 'DEMO_SPIKE') THEN RAISE EXCEPTION 'demo shape already applied'; END IF;

  -- candidates: V/E, has drug_master, not blood/controlled/cold chain, 3+ hospitals list it, big stock at the hospital
  FOR spec IN SELECT * FROM (VALUES ('HA', 2, 0.97), ('HA', 3, 0.88), ('HB', 2, 0.9), ('HC', 1, 0.9)) v(code, cnt, frac) LOOP
    n := 0;
    FOR hd IN
      SELECT d.id, d.hospital_id, d.drug_master_id
        FROM hospital_drug d
        JOIN hospital h ON h.id = d.hospital_id AND h.code = spec.code
        JOIN drug_master dm ON dm.id = d.drug_master_id
       WHERE d.active AND d.ved IN ('V', 'E') AND NOT dm.is_blood_product AND NOT dm.is_cold_chain AND NOT dm.is_controlled
         AND (SELECT count(DISTINCT d2.hospital_id) FROM hospital_drug d2 WHERE d2.drug_master_id = d.drug_master_id AND d2.active) >= 4
         AND NOT EXISTS (SELECT 1 FROM stock_ledger sl JOIN stock_lot l ON l.id = sl.lot_id WHERE l.hospital_drug_id = d.id AND sl.ref_type = 'DEMO_SPIKE')
         AND NOT EXISTS (SELECT 1 FROM borrow_request br JOIN borrow_request_item i ON i.request_id = br.id
                          WHERE br.borrower_hospital_id = d.hospital_id AND i.drug_master_id = d.drug_master_id AND br.status::text NOT IN ('FULFILLED','CLOSED_UNFULFILLED','CANCELLED'))
         AND (SELECT COALESCE(sum(qty_on_hand - qty_held), 0) FROM stock_lot l WHERE l.hospital_drug_id = d.id AND l.expiry_date > current_date) BETWEEN 100 AND 20000
       ORDER BY (SELECT sum(qty_used) FROM usage_daily u WHERE u.hospital_drug_id = d.id AND u.usage_date > '2026-09-20') DESC, d.id
       OFFSET (CASE spec.code WHEN 'HA' THEN (CASE WHEN spec.cnt = 2 THEN 0 ELSE 3 END) ELSE 2 END)
    LOOP
      EXIT WHEN n >= spec.cnt;
      SELECT COALESCE(sum(qty_on_hand - qty_held), 0) INTO free FROM stock_lot WHERE hospital_drug_id = hd.id AND expiry_date > current_date;
      remaining := round(free * spec.frac);
      FOR lot IN SELECT id, hospital_id, qty_on_hand - qty_held AS f FROM stock_lot
                 WHERE hospital_drug_id = hd.id AND expiry_date > current_date AND qty_on_hand - qty_held > 0 ORDER BY expiry_date, id LOOP
        EXIT WHEN remaining <= 0;
        take := least(lot.f, remaining);
        INSERT INTO stock_ledger(hospital_id, lot_id, delta, reason, ref_type, occurred_at) VALUES (lot.hospital_id, lot.id, -take, 'ISSUE_USAGE', 'DEMO_SPIKE', timestamptz '2026-10-21 12:00+07');
        UPDATE stock_lot SET qty_on_hand = qty_on_hand - take, updated_at = timestamptz '2026-10-21 12:00+07', version = version + 1 WHERE id = lot.id;
        remaining := remaining - take;
      END LOOP;
      UPDATE usage_daily SET qty_used = qty_used + (round(free * spec.frac) - remaining) / 2 WHERE hospital_drug_id = hd.id AND usage_date IN ('2026-10-20', '2026-10-21');
      n := n + 1;
    END LOOP;
  END LOOP;

  -- near-expiry lots (days from today) and expired-in-stock lots
  FOR spec IN SELECT * FROM (VALUES ('HA', 1, 18), ('HA', 2, 33), ('HA', 3, 47), ('HA', 4, 62), ('HA', 5, 85), ('HB', 1, 25), ('HB', 2, 52), ('HB', 3, 78), ('HC', 1, 40), ('HC', 2, 70)) v(code, k, days) LOOP
    SELECT d.id, d.hospital_id, d.drug_master_id INTO hd
      FROM hospital_drug d JOIN hospital h ON h.id = d.hospital_id AND h.code = spec.code JOIN drug_master dm ON dm.id = d.drug_master_id
     WHERE d.active AND d.unit_price_thb > 0 AND NOT dm.is_blood_product AND NOT dm.is_cold_chain AND NOT dm.is_controlled
       AND (SELECT count(DISTINCT d2.hospital_id) FROM hospital_drug d2 WHERE d2.drug_master_id = d.drug_master_id AND d2.active) >= 4
       AND NOT EXISTS (SELECT 1 FROM stock_lot l WHERE l.hospital_drug_id = d.id AND l.lot_no LIKE 'DEMO-NE-%')
       AND NOT EXISTS (SELECT 1 FROM stock_ledger sl JOIN stock_lot l ON l.id = sl.lot_id WHERE l.hospital_drug_id = d.id AND sl.ref_type = 'DEMO_SPIKE')
     ORDER BY (SELECT count(*) FROM hospital_drug o
                WHERE o.drug_master_id = d.drug_master_id AND o.active AND o.hospital_id <> d.hospital_id
                  AND COALESCE((SELECT avg(qty_used) FROM usage_daily u WHERE u.hospital_drug_id = o.id AND u.usage_date > '2026-09-20'), 0) > 0
                  AND COALESCE((SELECT sum(qty_on_hand - qty_held) FROM stock_lot l WHERE l.hospital_drug_id = o.id AND l.expiry_date > current_date), 0)
                      < 22 * (SELECT avg(qty_used) FROM usage_daily u WHERE u.hospital_drug_id = o.id AND u.usage_date > '2026-09-20')) DESC,
              md5(d.id::text || spec.code || spec.k) LIMIT 1;
    SELECT GREATEST(60, round(COALESCE(avg(qty_used), 0) * spec.days * 2.2)) INTO target FROM usage_daily WHERE hospital_drug_id = hd.id AND usage_date > '2026-09-20';
    INSERT INTO stock_lot(hospital_id, hospital_drug_id, lot_no, expiry_date, manufacturer, pack_size_base_units, qty_on_hand, updated_at)
      VALUES (hd.hospital_id, hd.id, 'DEMO-NE-' || spec.code || spec.k, current_date + spec.days, 'องค์การเภสัชกรรม (ตัวอย่าง)',
              (SELECT pack_size_base_units FROM stock_lot WHERE hospital_drug_id = hd.id AND pack_size_base_units IS NOT NULL LIMIT 1), target, timestamptz '2026-10-05 10:00+07')
      RETURNING id INTO lot.id;
    INSERT INTO stock_ledger(hospital_id, lot_id, delta, reason, occurred_at) VALUES (hd.hospital_id, lot.id, target, 'IMPORT', timestamptz '2026-10-05 10:00+07');
  END LOOP;

  FOR spec IN SELECT * FROM (VALUES (1, 12), (2, 5)) v(k, ago) LOOP
    SELECT d.id, d.hospital_id INTO hd FROM hospital_drug d JOIN hospital h ON h.id = d.hospital_id AND h.code = 'HA' JOIN drug_master dm ON dm.id = d.drug_master_id
     WHERE d.active AND d.unit_price_thb > 0 AND NOT dm.is_blood_product
       AND NOT EXISTS (SELECT 1 FROM stock_lot l WHERE l.hospital_drug_id = d.id AND l.lot_no LIKE 'DEMO-%')
       AND NOT EXISTS (SELECT 1 FROM stock_ledger sl JOIN stock_lot l ON l.id = sl.lot_id WHERE l.hospital_drug_id = d.id AND sl.ref_type = 'DEMO_SPIKE')
     ORDER BY md5(d.id::text || 'exp' || spec.k) LIMIT 1;
    INSERT INTO stock_lot(hospital_id, hospital_drug_id, lot_no, expiry_date, manufacturer, pack_size_base_units, qty_on_hand, updated_at)
      VALUES (hd.hospital_id, hd.id, 'DEMO-EXP-HA' || spec.k, current_date - spec.ago, 'บริษัท ยาไทยเคมี จำกัด (ตัวอย่าง)',
              (SELECT pack_size_base_units FROM stock_lot WHERE hospital_drug_id = hd.id AND pack_size_base_units IS NOT NULL LIMIT 1), 40 * spec.k, timestamptz '2026-04-01 10:00+07')
      RETURNING id INTO lot.id;
    INSERT INTO stock_ledger(hospital_id, lot_id, delta, reason, occurred_at) VALUES (hd.hospital_id, lot.id, 40 * spec.k, 'IMPORT', timestamptz '2026-04-01 10:00+07');
  END LOOP;
END $$;
-- HA runs short of the loose components of three kits, so a plan cannot pack them and has to borrow whole sets
DO $$
DECLARE hd record; lot record; remaining numeric; take numeric;
BEGIN
  FOR hd IN SELECT DISTINCT d.id FROM kit_component kc JOIN kit_type kt ON kt.id = kc.kit_type_id AND kt.code IN ('TRAUMA_RESUS', 'INTUBATION', 'CHEST_TUBE')
              JOIN hospital_drug d ON d.drug_master_id = kc.drug_master_id AND d.active JOIN hospital h ON h.id = d.hospital_id AND h.code = 'HA'
              JOIN drug_master dm ON dm.id = d.drug_master_id AND NOT dm.is_controlled AND NOT dm.is_cold_chain
             WHERE NOT EXISTS (SELECT 1 FROM stock_ledger sl JOIN stock_lot l ON l.id = sl.lot_id WHERE l.hospital_drug_id = d.id AND sl.ref_type = 'DEMO_SPIKE') LOOP
    SELECT round(COALESCE(sum(qty_on_hand - qty_held), 0) * 0.97) INTO remaining FROM stock_lot WHERE hospital_drug_id = hd.id AND expiry_date > current_date;
    FOR lot IN SELECT id, hospital_id, qty_on_hand - qty_held AS f FROM stock_lot WHERE hospital_drug_id = hd.id AND expiry_date > current_date AND qty_on_hand - qty_held > 0 AND lot_no NOT LIKE 'DEMO-NE-%' ORDER BY expiry_date, id LOOP
      EXIT WHEN remaining <= 0;
      take := least(lot.f, remaining);
      INSERT INTO stock_ledger(hospital_id, lot_id, delta, reason, ref_type, occurred_at) VALUES (lot.hospital_id, lot.id, -take, 'ISSUE_USAGE', 'DEMO_SPIKE', timestamptz '2026-10-21 12:00+07');
      UPDATE stock_lot SET qty_on_hand = qty_on_hand - take, updated_at = timestamptz '2026-10-21 12:00+07', version = version + 1 WHERE id = lot.id;
      remaining := remaining - take;
    END LOOP;
  END LOOP;
END $$;

-- HA kit stock is low (ER bus-crash scenario has to borrow kits from the neighbours)
UPDATE kit_stock ks SET qty_ready = v.r, qty_held = 0, updated_at = now()
  FROM (VALUES ('TRAUMA_RESUS', 3), ('INTUBATION', 2), ('IV_SET', 6), ('CHEST_TUBE', 1), ('BURN', 1), ('SPLINT', 4), ('MINOR_WOUND', 8)) v(code, r), kit_type kt, hospital h
 WHERE kt.code = v.code AND ks.kit_type_id = kt.id AND h.id = ks.hospital_id AND h.code = 'HA';

SELECT h.code, count(*) FILTER (WHERE l.lot_no LIKE 'DEMO-NE-%') near_lots, count(*) FILTER (WHERE l.lot_no LIKE 'DEMO-EXP-%') expired_lots
  FROM stock_lot l JOIN hospital h ON h.id = l.hospital_id WHERE l.lot_no LIKE 'DEMO-%' GROUP BY 1 ORDER BY 1;
