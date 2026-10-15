-- ดู/ส่งออกข้อมูลให้อ่านง่าย (รันหลังโหลดข้อมูลแล้ว)

-- 0) แถวยาของ รพ. -> รายการกลาง (ยา: จับด้วย drug_master_id หรือ TMT GP / เวชภัณฑ์,เลือด: drug_master_id จากรายการกลาง)
create or replace view v_hospital_item as
select hd.id as hospital_drug_id, hd.hospital_id, hd.local_code, hd.local_name, hd.unit_price_thb, hd.ved, hd.tmt_id as hospital_tmt_id,
       d.id as drug_master_id, d.item_type, d.gp_id, d.internal_code, d.generic_name, d.strength, d.dosage_form, d.base_unit, d.is_blood_product,
       d.generic_name||' '||coalesce(nullif(d.strength,'-'),'')||' ('||coalesce(d.dosage_form,'')||')' as item_name
from hospital_drug hd
join drug_master d on d.id = coalesce(hd.drug_master_id, (select x.id from drug_master x where x.gp_id = hd.gp_id));

-- 1) ข้อมูลสำหรับ train F1: 1 แถว = 1 วัน x 1 รพ. x 1 ยา (ตัดเลือดออกตาม BR-F1a-024)
create or replace view v_f1_training as
select u.usage_date                       as date,
       h.code                             as hospital_code,
       h.name_th                          as hospital_name,
       i.item_type,
       coalesce(i.gp_id, i.internal_code) as item_code,        -- ยา = TMT GP, เวชภัณฑ์ = รหัสภายใน (SUP-xxxx)
       i.item_name                        as drug_name,
       u.qty_used,
       s.qty_on_hand                      as qty_on_hand_end_of_day,
       s.qty_incoming,
       s.qty_held,
       to_char(u.usage_date,'Dy')         as day_of_week,
       extract(month from u.usage_date)::int as month,
       (select c.payload->>'name' from context_signal c
         where c.signal_type='COVID_PERIOD' and u.usage_date between c.valid_from and c.valid_to limit 1) as covid_phase,
       (select string_agg(case c.signal_type when 'SEVEN_DANGEROUS_DAYS' then '7วันอันตราย_'||(c.payload->>'festival')
                  when 'INFLUENZA_PEAK' then 'ไข้หวัดใหญ่_พีค' when 'DENGUE_PEAK' then 'ไข้เลือดออก_พีค' when 'PM25_SEASON' then 'PM2.5'
                  when 'FISCAL_YEAR_END_ORDERING' then 'ปลายปีงบสั่งซื้อ' when 'FLOOD' then 'น้ำท่วม' end, '|')
          from context_signal c
         where c.signal_type<>'COVID_PERIOD' and u.usage_date between c.valid_from and c.valid_to
           and (c.signal_type<>'FLOOD' or c.payload->>'hospital'=h.code)) as event_tags
from usage_daily u
join v_hospital_item i on i.hospital_drug_id=u.hospital_drug_id
join hospital h on h.id=u.hospital_id
left join stock_snapshot s on s.hospital_drug_id=u.hospital_drug_id and s.snap_date=u.usage_date
where not i.is_blood_product;

-- ส่งออกเป็น CSV:  \copy (select * from v_f1_training order by date, hospital_code, item_code) to 'f1_training.csv' csv header

-- 2) ยา/เวชภัณฑ์ของแต่ละ รพ. พร้อมชื่อ (แทนการเห็นแต่ ID)
create or replace view v_hospital_drug as
select h.code as hospital_code, h.name_th as hospital_name, i.local_code, i.local_name, i.unit_price_thb, i.ved,
       i.item_type, i.gp_id, i.internal_code, i.item_name, t.name as tmt_name, i.hospital_tmt_id as tmt_id, m.method, m.status as mapping_status
from v_hospital_item i join hospital h on h.id=i.hospital_id
left join tmt_reference t on t.tmt_id=i.hospital_tmt_id
left join drug_mapping m on m.hospital_drug_id=i.hospital_drug_id;

-- 3) สต็อกล็อตปัจจุบัน พร้อมชื่อ
create or replace view v_stock_lot as
select h.code as hospital_code, h.name_th as hospital_name, i.item_name as drug_name, i.item_type,
       l.lot_no, l.expiry_date, l.qty_on_hand, l.qty_held
from stock_lot l join hospital h on h.id=l.hospital_id join v_hospital_item i on i.hospital_drug_id=l.hospital_drug_id;

-- 4) คำขอยืมพร้อมชื่อ รพ.ผู้ขอ/ผู้ให้ยืม และยา
create or replace view v_borrow as
select r.request_no, r.context, r.status, r.urgency, r.created_at, hb.name_th as borrower, hl.name_th as lender,
       g.round_no, g.status as leg_status, g.qty_asked, g.qty_accepted, g.qty_received
from borrow_request r join hospital hb on hb.id=r.borrower_hospital_id
left join borrow_leg g on g.request_id=r.id left join hospital hl on hl.id=g.lender_hospital_id;
