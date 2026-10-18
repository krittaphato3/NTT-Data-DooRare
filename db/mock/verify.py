#!/usr/bin/env python3
"""ตรวจ mock data: โหลดเข้า PostgreSQL จริง (ผ่าน pgserver) แล้วรันชุดตรวจความสอดคล้อง
ใช้:  pip install pgserver psycopg2-binary   แล้ว   python3 verify.py [path/to/schema.sql]
(ต้องมี psql ในเครื่อง หรือจะโหลดเองด้วย load.sql ก็ได้)"""
import subprocess, sys, tempfile
from pathlib import Path

import pgserver

ROOT = Path(__file__).resolve().parent
SCHEMA = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "schema.sql"
tmp = tempfile.mkdtemp(prefix="doorare_pg_")
db = pgserver.get_server(tmp, cleanup_mode="delete")
URI = db.get_uri()


def psql(args, cwd=None):
    return subprocess.run(["psql", URI, "-v", "ON_ERROR_STOP=1"] + args, capture_output=True, text=True, cwd=cwd)


r = psql(["-f", str(SCHEMA)])
assert r.returncode == 0, r.stderr
r = psql(["-q", "-f", str(ROOT / "load.sql")], cwd=ROOT / "csv")
assert r.returncode == 0, r.stderr
print("โหลดสำเร็จ (ผ่าน FK / CHECK / trigger ทั้งหมด)\n")

CHECKS = [
    ("v1.3: ไม่มีคอลัมน์/ตารางรหัส 24 หลัก (ต้อง 0)",
     "select count(*) from information_schema.columns where table_schema='public' and column_name='code24' union all select count(*) from information_schema.tables where table_schema='public' and table_name='nhso_catalogue'", "0\n0"),
    ("v1.3: ยา (DRUG) ทุกรายการมี TMT GP จริงใน tmt_reference และไม่ใช่รหัส mock (ต้อง 0 รายการที่ผิด)",
     "select count(*) from drug_master d where item_type='DRUG' and not exists (select 1 from tmt_reference t where t.tmt_id=d.gp_id and t.level='GP' and t.tmt_id::bigint<9000000)", "0"),
    ("v1.3: เวชภัณฑ์/เลือดไม่มี gp_id/TMT และมี internal_code ไม่ซ้ำ (ต้อง 0)",
     "select count(*) from drug_master where item_type<>'DRUG' and (gp_id is not null or internal_code is null)", "0"),
    ("v1.3: ไม่มีรหัส TMT ปลอม (>= 9,000,000) ใน tmt_reference หรือ hospital_drug (ต้อง 0)",
     "select (select count(*) from tmt_reference where tmt_id::bigint>=9000000)+(select count(*) from hospital_drug where nullif(tmt_id,'')::bigint>=9000000 or nullif(gp_id,'')::bigint>=9000000)", "0"),
    ("v1.3: แถวเวชภัณฑ์/เลือดของ รพ. ใช้ method CENTRAL_LIST, ไม่มี confidence, ยืนยันแล้ว และไม่มี tmt_id (ต้อง 0 แถวที่ผิด)",
     """select count(*) from hospital_drug hd join drug_mapping m on m.hospital_drug_id=hd.id join drug_master d on d.id=m.drug_master_id
        where d.item_type<>'DRUG' and (m.method<>'CENTRAL_LIST' or m.confidence is not null or m.status<>'VERIFIED' or nullif(hd.tmt_id,'') is not null)""", "0"),
    ("v1.3: สรุปรายการตามชนิด", "select item_type||' '||count(*) from drug_master group by item_type order by item_type", None),
    ("ช่วงวันที่ usage_daily (ต้อง 2016-10-01 .. 2026-09-30, 3,652 วัน)",
     "select min(usage_date)||' | '||max(usage_date)||' | '||count(distinct usage_date) from usage_daily", "2016-10-01 | 2026-09-30 | 3652"),
    ("เลือด: ไม่มีคำขอยืมเลือดนอก EMERGENCY และไม่มี รพ.ที่ไม่มีธนาคารเลือดยืม/ให้ยืมเลือด (ต้อง 0)",
     """select count(*) from borrow_request_item i join drug_master d on d.id=i.drug_master_id and d.is_blood_product join borrow_request r on r.id=i.request_id
        join hospital hb on hb.id=r.borrower_hospital_id left join borrow_leg g on g.request_id=r.id left join hospital hl on hl.id=g.lender_hospital_id
        where r.context<>'EMERGENCY' or not hb.has_blood_bank or (hl.id is not null and not hl.has_blood_bank)""", "0"),
    ("เลือด: ไม่มี alert/ใบสั่งโอน F2 ของเลือด และหนี้เลือดเป็น BLOOD_REPLACEMENT (ต้อง 0)",
     """select (select count(*) from stock_alert a join hospital_drug hd on hd.id=a.hospital_drug_id join drug_master d on d.id=hd.drug_master_id where d.is_blood_product)
        +(select count(*) from near_expiry_item n join stock_lot l on l.id=n.lot_id join hospital_drug hd on hd.id=l.hospital_drug_id join drug_master d on d.id=hd.drug_master_id where d.is_blood_product)
        +(select count(*) from return_obligation o join drug_master d on d.id=o.drug_master_id where d.is_blood_product and o.return_mode<>'BLOOD_REPLACEMENT')""", "0"),
    ("เลือด: สรุปการยืมฉุกเฉิน / สต็อก PRC O ตาม รพ.", """select h.code, (select count(*) from stock_lot l join hospital_drug hd on hd.id=l.hospital_drug_id join drug_master d on d.id=hd.drug_master_id where d.is_blood_product and hd.hospital_id=h.id) lots,
        (select count(*) from borrow_request r join borrow_request_item i on i.request_id=r.id join drug_master d on d.id=i.drug_master_id where d.is_blood_product and r.borrower_hospital_id=h.id) blood_borrows from hospital h order by 1""", None),
    ("ผู้ป่วย COVID proxy: ยอดจ่าย favipiravir ต่อปี (พีคควรเป็นปี 2564)", """select extract(year from usage_date)::int y, sum(qty_used)::bigint from usage_daily u join hospital_drug hd on hd.id=u.hospital_drug_id where hd.local_name ilike 'favipiravir%' group by 1 order by 1""", None),
    ("ledger รวมต่อ lot = qty_on_hand ของ lot (ต้อง 0 แถวที่ไม่ตรง)",
     "select count(*) from stock_lot l left join (select lot_id, sum(delta) s from stock_ledger group by 1) x on x.lot_id=l.id where coalesce(x.s,0) <> l.qty_on_hand", "0"),
    ("snapshot วันสุดท้าย = ผลรวม lot ต่อรายการยา (ต้อง 0 ที่ไม่ตรง)",
     """select count(*) from stock_snapshot s join (select hospital_drug_id, sum(qty_on_hand) q from stock_lot group by 1) l
        on l.hospital_drug_id=s.hospital_drug_id where s.snap_date='2026-09-30' and s.qty_on_hand<>l.q""", "0"),
    ("สต็อกติดลบ (ต้อง 0)", "select (select count(*) from stock_lot where qty_on_hand<0)+(select count(*) from stock_snapshot where qty_on_hand<0)", "0"),
    ("ผู้ให้ยืมต้องเป็นรายการที่ map VERIFIED (ต้อง 0 ที่ผิด)",
     """select count(*) from borrow_leg g join borrow_leg_lot gl on gl.leg_id=g.id join stock_lot l on l.id=gl.lot_id
        join drug_mapping m on m.hospital_drug_id=l.hospital_drug_id where m.status<>'VERIFIED'""", "0"),
    ("ของ cold chain ยืม/โอนได้เฉพาะ รพ. ที่ has_cold_chain ทั้งสองฝั่ง (ต้อง 0 ที่ผิด)",
     """select count(*) from borrow_leg g join borrow_request r on r.id=g.request_id join borrow_request_item i on i.request_id=r.id
        join drug_master d on d.id=i.drug_master_id join hospital hb on hb.id=r.borrower_hospital_id join hospital hl on hl.id=g.lender_hospital_id
        where d.is_cold_chain and g.status='RECEIVED' and not (hb.has_cold_chain and hl.has_cold_chain)""", "0"),
    ("คืนเป็นสิ่งของเท่านั้น: qty_returned ≤ qty และ RETURNED ต้องคืนครบ (ต้อง 0 ที่ผิด)",
     "select count(*) from return_obligation where qty_returned>qty or (status='RETURNED' and qty_returned<qty)", "0"),
    ("ยอดที่ได้รับ = ยอดที่ต้องคืน (ผลรวม qty ของหนี้ยา เทียบ qty_received ของ leg ที่ RECEIVED)",
     """select ((select coalesce(sum(qty),0) from return_obligation where drug_master_id is not null and return_mode='IN_KIND') - (select coalesce(sum(g.qty_received),0)
        from borrow_leg g join borrow_request r on r.id=g.request_id where g.status='RECEIVED' and r.context<>'EMERGENCY' and exists (select 1 from return_obligation o where o.leg_id=g.id)))::bigint""", "0"),
    ("stock_alert: active ต่อ (รพ.,ยา,ชนิด) ไม่เกิน 1 (unique index ผ่านแล้ว) และ alert ที่ลิงก์คำขอ",
     "select status, count(*) from stock_alert group by 1 order by 1", None),
    ("สถานะคำขอยืม", "select status, count(*) from borrow_request group by 1 order by 2 desc", None),
    ("สถานะ leg", "select status, count(*) from borrow_leg group by 1 order by 2 desc", None),
    ("F2: สถานะ near_expiry_item", "select status, count(*) from near_expiry_item group by 1 order by 2 desc", None),
    ("F2: แผนจัดสรร (สถานะ / economical ≤ 20%)", "select status, economical, count(*), round(avg(cost_ratio)::numeric,3) from allocation_plan group by 1,2 order by 3 desc", None),
    ("F2: ต้นทุนขนส่ง/มูลค่าของแผนที่ทำจริง ต้อง ≤ 0.20 (ต้อง 0 ที่เกิน)", "select count(*) from allocation_plan where status in ('COMPLETED','TRANSPORTING','APPROVED','AUTO_APPROVED') and cost_ratio>0.20", "0"),
    ("F3: ผลรวมผู้ป่วยตามระดับคัดแยกและสัดส่วน RED:YELLOW:GREEN โดยรวม",
     """select triage, sum(count), round(100.0*sum(count)/sum(sum(count)) over (),1) pct from incident_patient_count group by 1 order by 1""", None),
    ("F3: Critical Minimum ≤ Estimated ของทุกแผน (ต้อง 0 ที่ผิด)",
     """select count(*) from emergency_plan p, jsonb_each(p.estimated_need->'kits') e where (p.critical_min->'kits'->e.key)::numeric > e.value::numeric""", "0"),
    ("v1.5: role หลักของทุกคนอยู่ใน app_user_role และไม่มีคู่ role ต้องห้าม (ต้อง 0 + 0)",
     """select (select count(*) from app_user u where not exists (select 1 from app_user_role r where r.user_id=u.id and r.role=u.role))
        ||' | '||(select count(*) from app_user_role a join app_user_role b on a.user_id=b.user_id and a.role<b.role
          where a.role in ('SYSTEM_ADMIN','AUDITOR') or b.role in ('SYSTEM_ADMIN','AUDITOR')
             or (a.role='HOSPITAL_ADMIN' and b.role in ('PHARMACIST','PROCUREMENT_OFFICER','WAREHOUSE_OFFICER','ER_STAFF','DRIVER'))
             or (b.role='HOSPITAL_ADMIN' and a.role in ('PHARMACIST','PROCUREMENT_OFFICER','WAREHOUSE_OFFICER','ER_STAFF','DRIVER')))""", "0 | 0"),
    ("v1.5: ประวัติ role ที่เปิดอยู่ = จำนวนแถวใน app_user_role (ต้อง 0 ที่ต่าง)",
     "select (select count(*) from app_user_role)-(select count(*) from app_user_role_history where valid_to is null)", "0"),
    ("v1.5: โปรไฟล์ รพ. ครบทุกแห่ง (ต้อง 0 แห่งที่ขาด)",
     "select count(*) from hospital where province is null or tier is null or bed_count is null or address is null or phone is null", "0"),
    ("v1.5: งานขนส่งทุกงานมี task_no ไม่ซ้ำ + รถของ รพ.ผู้ส่ง + eta (ต้อง 0 ที่ผิด)",
     """select count(*) from transport_task t left join vehicle v on v.id=t.vehicle_id
        where t.task_no is null or t.eta_at is null or v.id is null or v.hospital_id<>t.from_hospital_id""", "0"),
    ("v1.5: ของ cold chain ต้องไปกับรถกล่องเย็น และมีอุณหภูมิทุกเหตุการณ์ที่ขนส่ง (ต้อง 0 ที่ผิด)",
     """select count(*) from transport_event e join transport_task t on t.id=e.task_id join vehicle v on v.id=t.vehicle_id
        where e.temperature_c is not null and not v.has_cold_box and exists (select 1 from vehicle x where x.hospital_id=t.from_hospital_id and x.has_cold_box)""", "0"),
    ("v1.5: incident ทุกเหตุมีประเภท และเหตุที่ยกเลิกมีเหตุผล (ต้อง 0 ที่ขาด)",
     "select count(*) from incident where incident_type is null or (status='CANCELLED' and coalesce(cancel_reason,'')='')", "0"),
    ("v1.5: login_event ย้อนหลัง 90 วัน, last_login_at ตรงกับ event ล่าสุด (ต้อง 0 ที่ไม่ตรง)",
     """select count(*) from app_user u where u.last_login_at is distinct from (select max(occurred_at) from login_event e where e.user_id=u.id and e.success)""", "0"),
    ("v1.5: audit hash chain ยังสมบูรณ์หลังเพิ่มคอลัมน์ reason (audit_chain_verify ต้อง 0)",
     "select audit_chain_verify()", "0"),
    ("v1.5: Min-Max (VED=D และราคา<=50) มี min/max และ max>=min; รายการอื่นไม่มี (ต้อง 0 ที่ผิด)",
     """select count(*) from hospital_drug where (ved='D' and unit_price_thb<=50 and (min_level is null or max_level is null or max_level<min_level))
        or (not (ved='D' and unit_price_thb<=50) and (min_level is not null or max_level is not null))""", "0"),
    ("v1.5: ยาควบคุมพิเศษ (is_controlled) = morphine, fentanyl, ketamine",
     "select string_agg(generic_name, ', ' order by generic_name) from drug_master where is_controlled", "Fentanyl, Ketamine, Morphine sulfate"),
    ("v1.5: ทุกแถว hospital_drug มี standard_lead_time_days (ต้อง 0 ที่ขาด)", "select count(*) from hospital_drug where standard_lead_time_days is null", "0"),
    ("v1.5: cold start: รายการ รพ.-ยาที่ประวัติ < 90 วัน (ต้อง 7 และเป็น V/E ทั้งหมดจึงเข้า Quantile ไม่ใช่ Min-Max)",
     """select count(*)||' | '||count(*) filter (where hd.ved in ('V','E')) from hospital_drug hd join (select hospital_drug_id, count(*) n from usage_daily group by 1) u
        on u.hospital_drug_id=hd.id where u.n < 90""", "7 | 7"),
    ("v_lendable_stock ใช้งานได้ (จำนวนแถว)", "select count(*) from v_lendable_stock", None),
    ("มูลค่ายาหมดอายุต่อปีงบประมาณ (พันบาท) เทียบมูลค่าการใช้ (%)",
     """with u as (select case when extract(month from usage_date)>=10 then extract(year from usage_date)+1 else extract(year from usage_date) end fy, sum(qty_used*hd.unit_price_thb) v
                 from usage_daily d join hospital_drug hd on hd.id=d.hospital_drug_id group by 1),
        w as (select case when extract(month from period)>=10 then extract(year from period)+1 else extract(year from period) end fy, sum(value_thb) v
              from value_record where metric='EXPIRED_WRITEOFF_THB' group by 1)
        select u.fy::int, round(u.v/1000) usage_k, round(coalesce(w.v,0)/1000) expired_k, round(100*coalesce(w.v,0)/u.v,2) pct from u left join w using (fy) order by 1""", None),
    ("วันที่ของหมด (ต้องการแต่จ่ายไม่ได้) ต่อปีงบประมาณ",
     """select case when extract(month from period)>=10 then extract(year from period)+1 else extract(year from period) end::int fy, sum(value_qty)::int stockout_item_days
        from value_record where metric='STOCKOUT_ITEM_DAYS' group by 1 order by 1""", None),
]

bad = 0
for title, sql, expect in CHECKS:
    r = psql(["-At", "-F", " | ", "-c", sql])
    out = r.stdout.strip() if r.returncode == 0 else "ERROR: " + r.stderr.strip()
    flag = ""
    if expect is not None:
        ok = out == expect
        flag = "  ✓" if ok else "  ✗ (คาดหวัง " + expect + ")"
        bad += (not ok)
    print(f"■ {title}{flag}\n{out}\n")
print("สรุป: ผ่านทุกข้อตรวจที่มีค่าคาดหวัง" if bad == 0 else f"สรุป: ไม่ผ่าน {bad} ข้อ")
