-- Puts HD (บางบ่อ) and HE (บางเสาธง) in a second network so that near-expiry plans which involve them are NOT auto-approved
-- (auto-approve = every receiver in the origin's network, see backend/src/modules/expiry/matching.ts) and wait on the "แผนรอเห็นชอบ" tab.
-- Data only, no schema change. Safe to run again. Undo: UPDATE hospital SET network_id = (SELECT id FROM network WHERE name = 'เครือข่ายทดสอบ') WHERE code IN ('HD', 'HE');
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO network (region_id, name, auto_approve)
SELECT h.region_id, 'เครือข่ายตัวอย่าง B', true
  FROM hospital h
 WHERE h.code = 'HD'
   AND NOT EXISTS (SELECT 1 FROM network n WHERE n.name = 'เครือข่ายตัวอย่าง B');

UPDATE hospital h
   SET network_id = (SELECT id FROM network WHERE name = 'เครือข่ายตัวอย่าง B'), updated_at = now(), version = version + 1
 WHERE h.code IN ('HD', 'HE')
   AND h.network_id IS DISTINCT FROM (SELECT id FROM network WHERE name = 'เครือข่ายตัวอย่าง B');
COMMIT;
SELECT h.code, n.name AS network FROM hospital h JOIN network n ON n.id = h.network_id ORDER BY h.code;
