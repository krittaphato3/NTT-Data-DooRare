# Demo data (1 Oct -> 22 Oct 2026) and role scenarios

The mock history stops at 30 Sep 2026. This folder extends it to today and leaves unfinished work for the four demo roles
(pharmacist, ER, warehouse, driver). One database only: the sample data is for dev/demo and is removed by restoring the snapshot.

## Commands (repo root; Postgres container up)

The extended data (to 21 Oct) is part of the normal load, there is no snapshot or restore:

```bash
npm run db:reset        # drop the volume, load the mock CSV (to 30 Sep), then 01-backfill + 02-shape (to 21 Oct)
cd backend && npx tsx src/index.ts      # start the backend (separate terminal)
npm run db:scenarios    # pending work per role through the API (once per fresh DB, ~1 minute)
```

- `npm run db:scenarios-f2` (backend running) adds fresh near-expiry lots that other hospitals can really use, runs the scan, lets the owner
  pharmacists release the first lot of each hospital and leaves the others waiting for a live decision. Unlike `db:scenarios` it can be
  repeated; every run uses new lot names `DEMO-F2-<code><run>-<k>`. Then open the pool and press the allocation round. Settings: `HOSPITALS`
  (default HA,HB,HC), `LOTS_PER_HOSPITAL` (2), `RELEASE` (1), `CLEAN=1` (first cancel plans not moving yet and withdraw pool lots, history kept),
  `KEEP_DETECTED=HA` (those hospitals release nothing: their lots wait for the pharmacist). Local Docker DB only; see the Thai guide below for a shared DB.
- `npm run db:networks` moves HD and HE to a second network (`03-networks.sql`) so near-expiry plans that involve them wait for approval instead of auto-approving.
- `db:reset` always gives the same starting point again (this is how you "reset"). `db:load` does the same on an empty DB.
- `db:scenarios` refuses to run twice on the same DB (it looks for requests whose reason starts `DEMO:`): run `db:reset` first.
- The CSV (`db/mock/csv/`) is not in git: copy it from the mock zip or run `python3 db/mock/generate.py`.

## What each step does

| File | What |
|---|---|
| `db/demo/01-backfill.sql` (run by `db:load`) | 1-21 Oct, day by day: usage near the recent average (weekday/weekend, jitter), FEFO stock decrements, receipt of due orders (the 36 left OPEN on 30 Sep arrive 1-4 Oct), reorders when cover < 14 days, expired lots written off until 18 Oct, daily `stock_snapshot`. New lots `DEMO-R*`. |
| `db/demo/02-shape.sql` (run by `db:load`) | 19-21 Oct situation: usage spike (ledger `DEMO_SPIKE`) that leaves V/E drugs low at HA / HB / HC, HA short of loose components of 3 kits and low on ready kit sets, near-expiry lots `DEMO-NE-*` (HA 5, HB 3, HC 2), expired lots in stock `DEMO-EXP-HA*`. |
| `backend/scripts/demo-scenarios.ts` (run by `db:scenarios`) | Real API calls as each role (rules, audit, stock holds, notifications are the real ones): forecast run, expiry scan, borrow flows, near-expiry decisions, the Agent's matching (stand-in through `createPlanFromAgentProposal`), ER incidents. |

Requests created by the scenarios have `reason` starting `DEMO:` (manual ones); everything is dated 22 Oct (the scenario run time).

## Accounts (password `doorare123`, OTP `123456`)

| Role | Login | What waits for them |
|---|---|---|
| Pharmacist HA | `pharmacist1.ha@example.org` | LOW_STOCK alerts (5 very urgent); a borrow request waiting for approval, a draft, one where the lender rejected, one where the lender accepted; lender queue with 3 requests to answer; 4 near-expiry lots to decide (release / keep), 1 allocation plan waiting for approval, 1 lot released and waiting for the Agent, return obligations overdue (3) |
| Pharmacist HB / HC | `pharmacist1.hb@` / `pharmacist1.hc@` | lender queue items, own near-expiry lots (HB1 already released and shipped by the Agent plan) |
| Warehouse HA | `warehouse_officer1.ha@example.org` | tasks to load (2), goods ARRIVED to receive (2), kit pack tasks (5), emergency kit lending |
| Driver HA | `driver1.ha@example.org` | tasks LOADED to depart, IN_TRANSIT to confirm arrival |
| ER HA | `er_staff1.ha@example.org` | incident 1 (bus crash: plan approved, kits borrowed, one lender confirmed, packing in progress), incident 2 (chemical leak: plan waiting for approval) |

Hospital admin (`hospital_admin1.ha@`) and system admin (`system_admin1.region@`) work as before.

## Notes

- The Agent is not connected. Where the Agent would match near-expiry lots, the script plays it for two lots; lot HA2 is left released and waiting.
- The 15-minute expiry job in the backend keeps scanning; it may add near-expiry items as days pass. `db:reset` + `db:scenarios` resets that.
- Forecast artifacts end around 21 Sep; alerts compare them with the current stock, so the severity of alerts comes from the forecast numbers, not from 1-21 Oct usage.

## คู่มือการรันสถานการณ์เดโม่ (ภาษาไทย)

ใช้เมื่อดึงโค้ดไปแล้วต้องการให้ Docker ของตัวเองมีสถานการณ์เดโม่เหมือนกัน (ทุกคำสั่งทำกับฐานข้อมูลใน Docker ของเครื่องตัวเองเท่านั้น)

### สิ่งที่ต้องมี

- Docker, Node.js และ npm; ติดตั้งแพ็กเกจฝั่ง backend ครั้งแรก: `cd backend && npm ci`
- ไฟล์ข้อมูลจำลอง `db/mock/csv/` (ไม่อยู่ใน git) ขอจากทีม หรือสร้างด้วย `python3 db/mock/generate.py`
- ผลพยากรณ์ `backend/models/artifacts/forecasts/` (ไม่อยู่ใน git) ถ้าไม่มี แจ้งเตือนสต็อกจะไม่ทำงาน (API ตอบ 404) ให้ขอไฟล์จากทีมแล้วสร้าง `docker-compose.override.yml` (ไฟล์นี้ใช้เฉพาะเครื่อง ห้าม commit):

```yaml
services:
  backend:
    environment:
      FORECASTS_DIR: /app/forecasts
    volumes:
      - ./backend/models/artifacts/forecasts:/app/forecasts:ro
```

### ขั้นตอน (ครั้งแรก หรือเมื่ออยากเริ่มใหม่ทั้งหมด)

1. เปิดระบบ: `docker compose build && docker compose up -d` (backend ที่ http://localhost:3001, หน้าเว็บที่ http://localhost:8080)
2. รีเซ็ตฐานข้อมูล: `npm run db:reset` **ลบข้อมูลทั้งหมดในฐานของเครื่องตัวเอง** ใช้เวลาประมาณ 3-5 นาที แล้ว `docker compose restart backend`
3. ใส่งานค้างของแต่ละบทบาท: `npm run db:scenarios` (backend ต้องรันอยู่ ใช้ครั้งเดียวต่อหนึ่งฐาน ประมาณ 1 นาที ผลที่ดี: `done 25, skipped 1`)
4. แยกเครือข่าย รพ. เพื่อให้เดโม่ขั้น "แผนรอเห็นชอบ" ได้: `npm run db:networks` (HD และ HE ไปอยู่เครือข่ายตัวอย่าง B; รันซ้ำได้)
5. จัดจุดเริ่มต้นของ F2 (ยาใกล้หมดอายุ → คลังกลาง → แผน) ให้ไหลเองตามหน้าจอ:

```bash
CLEAN=1 RELEASE=2 HOSPITALS=HA,HB,HC,HD,HE KEEP_DETECTED=HA npm run db:scenarios-f2
```

ผลที่ได้: คลังกลางมี 4 ล็อตรอจับคู่ (HB, HC, HD, HE), HA มี 4 ล็อตรอตัดสินใจ, ไม่มีแผนรอเห็นชอบ

6. เปิดหน้าเว็บ ล็อกอินจากการ์ดบทบาทบนหน้า login (รหัสผ่าน `doorare123` OTP `123456`) แล้วเดโม่ตามลำดับ:
   - เภสัช HA: "ยาใกล้หมดอายุ" → กด "ตรวจล็อตใกล้หมดอายุตอนนี้" → ปล่อยเข้าคลังกลาง
   - "คลังกลาง · แผนจัดสรร" → กดให้ agent จับคู่ → แผนของ รพ. ในเครือข่ายเดียวกันอนุมัติอัตโนมัติ ส่วนแผนของ HD/HE (ผู้รับคนละเครือข่าย) ไปรอที่แท็บ "แผนรอเห็นชอบ" ต้องให้เภสัชของทุก รพ. ที่เกี่ยวข้องกดเห็นชอบ
   - คลังและคนขับของ รพ. ต้นทาง/ปลายทาง: โหลดของ ออกเดินทาง ยืนยันถึงปลายทาง

### เริ่มรอบเดโม่ใหม่โดยไม่รีเซ็ตทั้งฐาน

รันคำสั่งในข้อ 5 ซ้ำ (ใช้ได้ถ้ายังมีล็อตที่ รพ. ผู้รับขาดยาอยู่) แผนที่ยังไม่เริ่มขนส่งจะถูกยกเลิกและล็อตในคลังกลางถูกถอนก่อน แต่แผนที่ขนส่งไปแล้วยกเลิกไม่ได้ และเมื่อทุกแผนจับคู่ไปหมดแล้วความต้องการยาของผู้รับจะหมด ล็อตที่ปล่อยจะขึ้นว่าไม่มีผู้รับ ถ้าเป็นแบบนั้นให้ทำข้อ 2-5 ใหม่

### ตั้งค่า LLM (ไม่บังคับ)

ไม่ตั้งค่า agent (F1 เลือกผู้ให้ยืม, F2 จับคู่, F3 ของนอกชุด) จะใช้กฎแทน ขึ้นป้าย FALLBACK ถ้าต้องการใช้ LLM จริง ล็อกอินเป็น `system_admin1.region@example.org` ไปหน้าตั้งค่า BYOK แล้วใส่ provider/key เอง (ห้าม commit key) การรีเซ็ตฐานทำให้ค่านี้หาย

### ปัญหาที่พบบ่อย

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| `start the backend first` | backend ยังไม่รัน: `docker compose up -d` แล้วรอสักครู่ |
| `db:scenarios` ข้ามหลายขั้น หรือแจ้งเตือนสต็อกว่าง | ไม่มีไฟล์พยากรณ์ใน backend ทำตามหัวข้อ "สิ่งที่ต้องมี" แล้ว `db:reset` ใหม่ |
| `database already has data` | ใช้ `npm run db:reset` |
| หน้าเว็บเห็นข้อมูลตัวอย่างค้าง / ฟอร์มมีค่าตายตัว | ล้างโหมด mock เก่าในเบราว์เซอร์ (โค้ดล่าสุดปิดโหมดนี้แล้ว) รีเฟรชแรงๆ แล้วล็อกอินใหม่ |
| ล็อกอินไม่ได้หลังรีเซ็ต | ฐานถูกสร้างใหม่ ให้ล็อกอินใหม่ |
| ล็อตที่ปล่อยขึ้นว่าไม่มีผู้รับ | ความต้องการยาของผู้รับถูกใช้ไปแล้ว ทำข้อ 2-5 ใหม่ |

### ใช้กับฐานที่แชร์ (RDS)

อย่ารัน `db:reset` หรือ `CLEAN=1` กับฐานที่มีคนใช้อยู่ ต้องตกลงกับทีมก่อนและ backup ก่อนเสมอ เครื่องส่วนตัวมักต่อ RDS ตรงๆ ไม่ได้ ให้ทำจาก EC2 สคริปต์ F2 ทำกับฐานที่ไม่ใช่เครื่องตัวเองได้ก็ต่อเมื่อตั้ง `REMOTE=1`, `API`, `DB_HOST` (และ DB_PORT/DB_NAME/DB_USER/DB_PASSWORD) และ `CONFIRM_HOST=<ค่าเดียวกับ DB_HOST>` ไม่เช่นนั้นสคริปต์ปฏิเสธ ส่วนการย้ายเครือข่าย ให้คนที่ต่อ RDS ได้รันไฟล์ `db/demo/03-networks.sql` ด้วย psql เอง
