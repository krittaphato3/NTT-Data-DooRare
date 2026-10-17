"""v1.5 enrichment: adds the columns/tables schema v1.5 needs to the CSVs written by generate.py.

Runs at the end of generate.py. It uses its OWN random generator (seed + 15) and never touches generate.py's
streams, so every value that existed in v1.4 stays exactly the same.
Adds: hospital profile, vehicle.csv, transport_task (task_no/vehicle/eta/cancel_reason), transport_event.temperature_c,
incident.incident_type/cancel_reason, UNKNOWN triage counts, app_user (mfa/last_login/last_seen), app_user_role.csv
(extra roles only: the primary role is listed by a trigger), login_event.csv.
"""
import csv, datetime as dt, random, uuid
from collections import defaultdict
from pathlib import Path

TZ = dt.timezone(dt.timedelta(hours=7))
STRONG_MFA = {"HOSPITAL_ADMIN", "SYSTEM_ADMIN", "PHARMACIST", "AUDITOR", "REGION_ADMIN", "DATA_ADMIN"}   # rbac §8
DEVICES = [("Windows PC", "Chrome"), ("Windows PC", "Edge"), ("MacBook", "Safari"), ("MacBook", "Chrome"), ("Android", "Chrome"), ("iPhone", "Safari")]
FAIL_REASONS = ["รหัสผ่านไม่ถูกต้อง", "รหัสผ่านไม่ถูกต้อง", "MFA ไม่ผ่าน", "บัญชีถูกล็อกชั่วคราว"]
CANCEL_REASONS = ["แจ้งซ้ำกับเหตุที่มีอยู่", "แจ้งผิดจากหน่วยกู้ภัย", "หน่วยกู้ภัยไม่พบเหตุ ยกเลิก"]


def _read(path):
    with open(path, encoding="utf-8", newline="") as f:
        r = csv.DictReader(f)
        return list(r), r.fieldnames


def _write(path, rows, cols):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(cols)
        for r in rows:
            w.writerow([r.get(c, "") for c in cols])


def _t(s):
    return dt.datetime.fromisoformat(s) if s else None


def _iso(d):
    return d.astimezone(TZ).isoformat(timespec="seconds")


def run(out: Path, cfg: dict) -> dict:
    rnd = random.Random(cfg["seed"] + 15)
    v15 = cfg["v15"]
    counts = {}

    def uid():
        return str(uuid.UUID(int=rnd.getrandbits(128), version=4))

    # ---- hospital profile ------------------------------------------------------------------------
    hosp, cols = _read(out / "hospital.csv")
    yaml_h = {h["code"]: h for h in cfg["hospitals"]}
    for h in hosp:
        p = v15["hospital_profile"][h["code"]]
        name = h["name_th"]
        h["province"] = p["province"]
        h["tier"] = "TERTIARY" if "ตติยภูมิ" in name else "COMMUNITY" if "ชุมชน" in name else "SECONDARY"
        h["bed_count"] = yaml_h[h["code"]]["beds"]
        h["address"] = p["address"]
        h["phone"] = p["phone"]
    _write(out / "hospital.csv", hosp, cols + ["province", "tier", "bed_count", "address", "phone"])
    code_of = {h["id"]: h["code"] for h in hosp}
    cold_hosp = {h["code"] for h in hosp if h["has_cold_chain"] == "true"}

    # ---- vehicles ---------------------------------------------------------------------------------
    vehicles, by_hosp = [], defaultdict(list)
    letters = "กขคงจฉชซฌญ"
    for h in hosp:
        for i in range(v15["vehicles_per_hospital"][h["code"]]):
            v = {"id": uid(), "hospital_id": h["id"],
                 "plate": f"{rnd.randint(1, 9)}{rnd.choice(letters)}{rnd.choice(letters)} {rnd.randint(1000, 9999)}",
                 "has_cold_box": "true" if (i == 0 and h["code"] in cold_hosp) else "false", "active": "true"}
            vehicles.append(v)
            by_hosp[h["id"]].append(v)
    _write(out / "vehicle.csv", vehicles, ["id", "hospital_id", "plate", "has_cold_box", "active"])
    counts["vehicle"] = len(vehicles)

    # ---- which transport tasks carry cold-chain goods --------------------------------------------
    drug_cold = {r["id"]: r["is_cold_chain"] == "true" for r in _read(out / "drug_master.csv")[0]}
    hd_drug = {r["id"]: r["drug_master_id"] for r in _read(out / "hospital_drug.csv")[0]}
    lot_cold = {r["id"]: drug_cold.get(hd_drug.get(r["hospital_drug_id"], ""), False) for r in _read(out / "stock_lot.csv")[0]}
    leg_cold = defaultdict(bool)
    for r in _read(out / "borrow_leg_lot.csv")[0]:
        leg_cold[r["leg_id"]] |= lot_cold.get(r["lot_id"], False)
    lot_of_ne = {r["id"]: r["lot_id"] for r in _read(out / "near_expiry_item.csv")[0]}
    ne_of_pool = {r["id"]: r["near_expiry_item_id"] for r in _read(out / "pool_entry.csv")[0]}
    pool_of_plan = {r["id"]: r["pool_entry_id"] for r in _read(out / "allocation_plan.csv")[0]}
    plan_of_line = {r["id"]: r["plan_id"] for r in _read(out / "allocation_line.csv")[0]}

    def task_cold(t):
        if t["ref_type"] == "BORROW_LEG":
            return leg_cold.get(t["ref_id"], False)
        lot = lot_of_ne.get(ne_of_pool.get(pool_of_plan.get(plan_of_line.get(t["ref_id"], ""), ""), ""), "")
        return lot_cold.get(lot, False)

    # ---- transport_task / transport_event ----------------------------------------------------------
    tasks, tcols = _read(out / "transport_task.csv")
    seq_by_year = defaultdict(int)
    cold_of = {}
    for t in sorted(tasks, key=lambda r: (r["created_at"], r["id"])):
        y = t["created_at"][:4]
        seq_by_year[y] += 1
        t["task_no"] = f"TR-{y}-{seq_by_year[y]:06d}"
        cold = task_cold(t)
        cold_of[t["id"]] = cold
        pool = [v for v in by_hosp[t["from_hospital_id"]] if v["has_cold_box"] == "true"] if cold else []
        pool = pool or by_hosp[t["from_hospital_id"]]
        t["vehicle_id"] = pool[int(t["id"].replace("-", ""), 16) % len(pool)]["id"]
        dep, arr = _t(t["departed_at"]), _t(t["arrived_at"])
        t["eta_at"] = _iso(dep + (arr - dep) + dt.timedelta(minutes=rnd.randint(-8, 12))) if dep and arr else ""
        t["cancel_reason"] = ""
    _write(out / "transport_task.csv", tasks, tcols + ["task_no", "vehicle_id", "eta_at", "cancel_reason"])
    events, ecols = _read(out / "transport_event.csv")
    for e in events:
        if cold_of.get(e["task_id"]) and e["to_status"] in ("LOADED", "IN_TRANSIT", "ARRIVED"):
            t = round(rnd.uniform(2.0, 8.0) if rnd.random() > 0.03 else rnd.uniform(8.1, 9.6), 1)
            e["temperature_c"] = t
        else:
            e["temperature_c"] = ""
    _write(out / "transport_event.csv", events, ecols + ["temperature_c"])

    # ---- incidents ---------------------------------------------------------------------------------
    labels = [x["label"] for x in cfg["incident_types"]]
    inc, icols = _read(out / "incident.csv")
    for r in inc:
        lab = next((l for l in labels if r["location_text"].startswith(l)), labels[0])
        r["incident_type"] = lab
        r["cancel_reason"] = rnd.choice(CANCEL_REASONS) if r["status"] == "CANCELLED" else ""
    _write(out / "incident.csv", inc, icols + ["incident_type", "cancel_reason"])
    pc, pcols = _read(out / "incident_patient_count.csv")
    n_unknown = 0
    for r in inc:
        if r["status"] != "CANCELLED" and rnd.random() < v15["incident_unknown_fraction"]:
            first = next(p for p in pc if p["incident_id"] == r["id"])
            pc.append({"incident_id": r["id"], "triage": "UNKNOWN", "count": rnd.randint(1, 4), "updated_at": first["updated_at"]})
            n_unknown += 1
    _write(out / "incident_patient_count.csv", pc, pcols)
    counts["incident_patient_count"] = len(pc)

    # ---- users: roles, MFA, sign-in history ----------------------------------------------------------
    users, ucols = _read(out / "app_user.csv")
    by_hr = defaultdict(list)
    for u in users:
        by_hr[(code_of.get(u["hospital_id"], ""), u["role"])].append(u)
    extra = []
    for x in v15["roles_extra"]:
        u = by_hr[(x["hospital"], x["from"])][0]
        extra.append({"user_id": u["id"], "role": x["add"]})
    _write(out / "app_user_role.csv", extra, ["user_id", "role"])
    counts["app_user_role"] = len(extra)

    end = dt.datetime.combine(cfg["end_date"], dt.time(17, 45), tzinfo=TZ)
    days = v15["login_history_days"]
    events_l, last_login = [], {}
    for u in users:
        if u["active"] != "true":
            continue
        h = u["hospital_id"]
        sub = (list(code_of).index(h) + 1) if h in code_of else 20
        ops = u["role"] in ("PHARMACIST", "WAREHOUSE_OFFICER", "ER_STAFF", "DRIVER", "PROCUREMENT_OFFICER")
        p_wd = 0.9 if ops else 0.5
        for d in range(days, -1, -1):
            day = (end - dt.timedelta(days=d)).replace(hour=0, minute=0, second=0)
            wd = day.weekday() < 5
            if rnd.random() > (p_wd if wd else (0.35 if u["role"] in ("ER_STAFF", "DRIVER") else 0.08)):
                continue
            for _ in range(2 if rnd.random() < 0.15 else 1):
                hour = rnd.randint(0, 5) if u["role"] in ("ER_STAFF", "DRIVER") and rnd.random() < 0.2 else rnd.randint(6, 16)
                at = day.replace(hour=hour, minute=rnd.randint(0, 59), second=rnd.randint(0, 59))
                if at > end:
                    continue
                dev, br = rnd.choice(DEVICES)
                ip = f"10.{sub}.{rnd.randint(0, 20)}.{rnd.randint(2, 250)}"
                ok = rnd.random() > v15["login_fail_rate"]
                events_l.append({"user_id": u["id"], "email": u["email"], "occurred_at": at, "success": ok,
                                 "failure_reason": "" if ok else rnd.choice(FAIL_REASONS), "ip": ip, "device": dev, "browser": br,
                                 "user_agent": f"{br} on {dev}"})
                if ok:
                    last_login[u["id"]] = max(last_login.get(u["id"], at), at)
    for _ in range(v15["unknown_user_attempts"]):
        at = end - dt.timedelta(days=rnd.randint(0, days), minutes=rnd.randint(0, 600))
        dev, br = rnd.choice(DEVICES)
        events_l.append({"user_id": "", "email": f"unknown{rnd.randint(1, 99)}@example.org", "occurred_at": at, "success": False,
                         "failure_reason": "ไม่พบบัญชีผู้ใช้", "ip": f"203.0.113.{rnd.randint(2, 250)}", "device": dev, "browser": br,
                         "user_agent": f"{br} on {dev}"})
    events_l.sort(key=lambda e: e["occurred_at"])
    for e in events_l:
        e["occurred_at"] = _iso(e["occurred_at"])
        e["success"] = "true" if e["success"] else "false"
    _write(out / "login_event.csv", events_l, ["user_id", "email", "occurred_at", "success", "failure_reason", "ip", "device", "browser", "user_agent"])
    counts["login_event"] = len(events_l)

    for u in users:
        u["mfa_enabled"] = "true" if (u["role"] in STRONG_MFA or rnd.random() < 0.4) else "false"
        ll = last_login.get(u["id"])
        u["last_login_at"] = _iso(ll) if ll else ""
        if ll:
            seen = ll + dt.timedelta(minutes=rnd.randint(5, 180))
            u["last_seen_at"] = _iso(min(seen, end))
        else:
            u["last_seen_at"] = ""
    _write(out / "app_user.csv", users, ucols + ["mfa_enabled", "last_login_at", "last_seen_at"])
    return counts
