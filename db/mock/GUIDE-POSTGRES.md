# คู่มือ mock data แบบ PostgreSQL (Doo rare)

ข้อมูลจำลอง 10 ปี (1 ต.ค. 2559 – 30 ก.ย. 2569) · 5 โรงพยาบาล · 37 รายการ · รวม ~1.41 ล้านแถว · spec v1.3 · seed 20260930
รหัสยาใช้ **TMT จริง** (release 5 ต.ค. 2569) 30 จาก 37 รายการ (อีก 7 = เวชภัณฑ์ 6 + เลือด 1 ไม่ใช้ TMT)

## 1) ไฟล์ในชุดนี้

| ไฟล์ | ใช้ทำอะไร |
|---|---|
| `schema.sql` | สร้างตารางทั้งหมด (62 ตาราง + constraint + trigger) ตัวเดียวกับใน spec v1.3 |
| `csv/` | ข้อมูล 48 ไฟล์ ไฟล์ละตาราง (อีก 14 ตารางใน schema ไม่มีข้อมูลเริ่มต้น) |
| `load.sql` | คำสั่งโหลด csv เข้าตาราง (รันจากในโฟลเดอร์ `csv/`) |
| `views.sql` | **view ให้อ่านง่าย** มีชื่อ รพ./ชื่อยาแทน ID และ `v_f1_training` สำหรับ train |
| `verify.py` + `verify_output.txt` | ตัวตรวจ (โหลดเข้า PostgreSQL 16 แล้วตรวจ FK/CHECK/ยอดสต็อก/pattern) → ผ่านทุกข้อ |
| `generate.py`, `config/`, `tools/build_tmt.py` | สร้างข้อมูลใหม่ / ปรับ pattern / ดึงรหัสจากไฟล์ TMT |
| `SOURCES.md` | แหล่งอ้างอิงของ pattern และรหัสยา |

## 2) ใช้งาน (3 คำสั่ง)

```bash
createdb doorare
psql doorare -f schema.sql
cd csv && psql doorare -f ../load.sql && cd ..
psql doorare -f views.sql
```
ตาราง `app_user` ผูก Cognito แต่เป็นแค่ข้อความ ไม่ต้องมี Cognito ก็โหลดได้

## 3) ข้อมูลที่ train F1 กับข้อมูลใน schema เป็นชุดเดียวกัน

ไม่ต้องมีไฟล์แยก — ตาราง `usage_daily` (ยอดใช้) + `stock_snapshot` (สต็อกปลายวัน) + `context_signal` (ช่วง COVID/เทศกาล/น้ำท่วม) คือข้อมูล train ใช้ view `v_f1_training` ดึงมาเป็นตารางเดียวที่อ่านง่าย:

```sql
select * from v_f1_training where item_code = '747132' limit 5;
\copy (select * from v_f1_training order by date, hospital_code, item_code) to 'f1_training.csv' csv header
```
คอลัมน์: `date, hospital_code, hospital_name, item_type, item_code, drug_name, qty_used, qty_on_hand_end_of_day, qty_incoming, qty_held, day_of_week, month, covid_phase, event_tags` → 613,536 แถว (ตัดเลือดตาม BR-F1a-024)

F1 แบ่งยาเป็น 3 วิธีตาม spec F-02 (MA/ES, Quantile, Min-Max) ข้อมูลชุดเดียวนี้ใช้ได้ทุกวิธี การจัดกลุ่มคำนวณจาก CV และสัดส่วนวันที่มีการใช้ของแต่ละ รพ.+ยา

## 4) ตาราง (48 ตารางที่มีข้อมูล) แยกตามหมวด

**ข้อมูลหลัก**

| ตาราง | แถว | คอลัมน์ |
|---|---|---|
| `region` | 1 | id, code, name_th, name_en, created_at |
| `network` | 1 | id, region_id, name, auto_approve |
| `hospital` | 5 | id, region_id, network_id, code, name_th, name_en, lat, lon, is_urban, has_cold_chain, has_blood_bank, active, created_at, updated_at, version |
| `hospital_distance` | 20 | from_hospital_id, to_hospital_id, distance_km, duration_min_normal, duration_min_peak, travel_minutes, travel_minutes_override, source, refreshed_at |
| `app_user` | 44 | id, cognito_sub, email, display_name, role, hospital_id, region_id, phone, active, created_at |
| `config_setting` | 90 | key, scope, value, description, updated_by, updated_at |
| `report_definition` | 3 | id, name, description, query_spec, roles |

**ยา / TMT / สต็อก**

| ตาราง | แถว | คอลัมน์ |
|---|---|---|
| `drug_master` | 37 | id, item_type, gp_id, internal_code, generic_name, strength, dosage_form, base_unit, is_cold_chain, is_blood_product, is_high_alert, emergency_class, created_at |
| `tmt_reference` | 346 | tmt_id, level, name, parent_tmt_id, gp_id |
| `hospital_drug` | 171 | id, hospital_id, local_code, local_name, unit_price_thb, local_unit, tmt_id, gp_id, active, ved, abc, expiry_threshold_days, drug_master_id |
| `drug_mapping` | 171 | id, hospital_drug_id, drug_master_id, status, method, confidence, unit_conversion_factor, local_pack_unit, base_units_per_pack, manufacturer, suggested_by, verified_by, verified_at, reject_reason, created_at, updated_at, version |
| `mapping_candidate` | 42 | id, drug_mapping_id, tmt_id, score, score_parts, rank |
| `drug_mapping_history` | 460 | drug_mapping_id, from_status, to_status, actor_id, note, occurred_at |
| `hospital_import` | 605 | id, hospital_id, kind, file_key, rows_total, rows_ok, rows_error, errors, created_by, created_at |
| `stock_lot` | 15,173 | id, hospital_id, hospital_drug_id, lot_no, expiry_date, manufacturer, pack_size_base_units, qty_on_hand, qty_held, updated_at, version |
| `stock_ledger` | 118,506 | hospital_id, lot_id, delta, reason, ref_type, ref_id, occurred_at, actor_id |
| `stock_snapshot` | 624,492 | hospital_id, hospital_drug_id, snap_date, qty_on_hand, qty_incoming, qty_held |
| `usage_daily` | 624,492 | hospital_id, hospital_drug_id, usage_date, qty_used |
| `incoming_order` | 14,532 | id, hospital_id, hospital_drug_id, qty, expected_date, status, lead_time_days |
| `stock_alert` | 1,855 | id, hospital_id, hospital_drug_id, type, severity, status, stock_qty, incoming_qty, days_cover, suggested_borrow_qty, forecast_result_id, snoozed_until, created_at, updated_at, version |
| `regional_warehouse_stock` | 37 | region_id, drug_master_id, qty, updated_at |
| `context_signal` | 73 | id, region_id, signal_type, payload, valid_from, valid_to, source, approved_by, created_at |

**F1 ยืมยา**

| ตาราง | แถว | คอลัมน์ |
|---|---|---|
| `borrow_request` | 637 | id, request_no, borrower_hospital_id, context, status, urgency, stock_alert_id, incident_id, reason, created_by, approved_by, approved_at, ladder, first_round_qty, stop_threshold, created_at, updated_at, version |
| `borrow_request_item` | 669 | id, request_id, kind, drug_master_id, kit_type_id, qty_requested, qty_fulfilled, r_value |
| `borrow_leg` | 856 | id, request_id, lender_hospital_id, round_no, rank_in_ladder, status, score_si, score_parts, t_transit_min, window_max_days, qty_asked, qty_accepted, qty_received, sent_at, deadline_at, reminded_at, responded_at, responded_by, reject_reason, message_text |
| `borrow_leg_lot` | 704 | id, leg_id, lot_id, qty |
| `return_obligation` | 721 | id, leg_id, debtor_hospital_id, creditor_hospital_id, drug_master_id, kit_type_id, qty, qty_returned, return_mode, due_date, status, returned_at, waived_reason, waived_by |
| `return_receipt` | 938 | id, obligation_id, drug_master_id, lot_id, qty_local, qty_base, received_by, received_at |
| `transport_task` | 744 | id, ref_type, ref_id, from_hospital_id, to_hospital_id, status, driver_id, cancel_requested_by, cancel_consent_by, loaded_at, departed_at, arrived_at, received_at, created_at, updated_at, version |
| `transport_event` | 2,976 | id, task_id, client_event_id, seq, to_status, captured_at, received_at, actor_id, photo_keys, applied, reject_reason |
| `reliability_stat` | 374 | lender_hospital_id, month, requests_received, accepted_on_time |

**F2 ใกล้หมดอายุ**

| ตาราง | แถว | คอลัมน์ |
|---|---|---|
| `near_expiry_item` | 128 | id, hospital_id, lot_id, status, qty, days_left, value_thb, decided_by, decided_at, note, review_after, created_at, updated_at, version |
| `pool_entry` | 81 | id, region_id, near_expiry_item_id, qty_available, released_at |
| `allocation_plan` | 81 | id, plan_no, region_id, pool_entry_id, status, total_value_thb, total_transport_cost_thb, cost_ratio, economical, option_chosen, agent_run_id, approval_deadline, created_at, updated_at, version |
| `allocation_line` | 55 | id, plan_id, receiver_hospital_id, qty, value_thb, expected_use_before_expiry, distance_km, transport_cost_thb, cold_chain |
| `plan_approval` | 85 | id, plan_id, hospital_id, decision, decided_by, decided_at, comment |
| `repeat_expiry_flag` | 5 | id, hospital_id, drug_master_id, level, lots_12m, value_12m_thb, suggestion, dismissed_until, created_at |
| `value_record` | 613 | id, hospital_id, region_id, metric, period, value_thb, value_qty, ref_type, ref_id, detail, created_at |

**F3 เหตุหมู่**

| ตาราง | แถว | คอลัมน์ |
|---|---|---|
| `incident` | 66 | id, incident_no, hospital_id, status, location_lat, location_lon, location_text, reported_eta_min, created_by, duplicate_of, closed_at, created_at, updated_at, version |
| `incident_patient_count` | 264 | incident_id, triage, count, updated_at |
| `incident_usage` | 1,277 | id, incident_id, drug_master_id, kit_type_id, qty_used, recorded_by |
| `emergency_plan` | 62 | id, incident_id, revision, status, estimated_need, critical_min, buffer, steps, shortfall, approved_by, approved_at, agent_run_id, created_at |
| `kit_type` | 7 | id, code, name, description, needs_cold_chain, active |
| `kit_component` | 29 | kit_type_id, drug_master_id, qty_per_kit |
| `kit_recipe` | 18 | triage, kit_type_id, qty_per_patient, is_critical_min |
| `incident_extra_rule` | 10 | triage, drug_master_id, qty_per_patient, is_critical_min |
| `kit_stock` | 35 | hospital_id, kit_type_id, qty_ready, qty_held, updated_at |
| `kit_pack_task` | 45 | id, plan_id, hospital_id, kit_type_id, qty, status, confirmed_by, confirmed_at |

คอลัมน์ `*_id` เป็น UUID เชื่อมตารางกัน (อ่านยาก) จึงมี view ใน `views.sql`: `v_f1_training`, `v_hospital_drug`, `v_stock_lot`, `v_borrow`

## 5) รหัสยา: TMT กับรายการกลาง (spec v1.3)

`drug_master.item_type` มี 3 ชนิด

| ชนิด | จำนวน | รหัส | การจับคู่ (`drug_mapping.method`) |
|---|---|---|---|
| DRUG | 30 | `gp_id` = TMT GP จริง (เช่น Paracetamol 500 mg tablet = `747132`) | `TMT` (VERIFIED 124 / SUGGESTED 8 / UNMATCHED 6) |
| SUPPLY | 6 | ไม่มี TMT, `gp_id` ว่าง, ใช้ `internal_code` SUP-0001..0006 | `CENTRAL_LIST` ผู้ดูแลระบบดูแลรายการกลาง, VERIFIED ทั้งหมด, ไม่มีคะแนนแนะนำ |
| BLOOD | 1 | `internal_code` BLD-0001 | `CENTRAL_LIST` |

- DRUG 30 รายการ: `tmt_reference` มีสาย SUBS→VTM→GP→GPU→GPP และ GP→TP→TPU→TPP ชื่อ FSN จริงทั้งหมด (ORS จริงถึง GP/GPP เท่านั้น เพราะ TMT ไม่มีระดับอื่น) ไม่มีรหัส TMT ปลอมในข้อมูลแล้ว
- **ไม่มีรหัส สปสช. 24 หลักแล้ว** (ตัดทั้งคอลัมน์และตาราง `nhso_catalogue`)
- เวชภัณฑ์ 6 รายการ: N95, PPE, ATK, ถุงมือไนไตรล์, IV catheter 18G, ชุดทำแผล
- F4 (จับคู่รหัส) เป็นฟีเจอร์ย่อยของ F2

## 6) จริงหรือ mock

| ส่วน | สถานะ |
|---|---|
| รหัส/ชื่อ TMT ของยา 30 รายการ | จริง |
| เวชภัณฑ์ 6 + เลือด 1 (ชื่อ, รหัสภายใน) | mock |
| วันที่ระลอก COVID, ปีไข้เลือดออก/ไข้หวัดใหญ่ระบาด, เทศกาล | อิงข้อมูลสาธารณะ (ดู `SOURCES.md`) |
| ความแรงของ pattern ต่อยาแต่ละตัว | สมมติ |
| รพ. ผู้ใช้ ยอดใช้ สต็อก ราคา lead time คำขอยืม เหตุหมู่ | mock ทั้งหมด |

ใช้ทดสอบระบบและ pipeline ได้ แต่ **ความแม่นยำของโมเดลที่วัดจากข้อมูลนี้ไม่ใช่ความแม่นยำจริง** ต้องใช้ข้อมูล รพ. จริง train ใหม่

## 7) ทำใหม่

```bash
python3 tools/build_tmt.py <โฟลเดอร์ TMTRF…_BONUS>   # (ทำแล้ว ผลอยู่ใน config/tmt_real.json)
python3 generate.py     # สร้าง csv/ + load.sql ใหม่ (ผลเหมือนเดิมทุกครั้ง)
python3 verify.py       # ต้อง pip install pgserver psycopg2-binary
```
