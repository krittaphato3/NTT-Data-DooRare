#!/usr/bin/env python3
"""DooRare mock data generator  (10 ปี: 2016-10-01 .. 2026-09-30)
ใช้:  python3 generate.py            -> เขียน CSV ลงโฟลเดอร์ csv/
ค่าทั้งหมดที่เป็น "สมมติ" อยู่ใน config/mock_config.yaml  (ผลซ้ำได้เสมอ เพราะใช้ seed คงที่)
"""
import bisect, csv, datetime as dt, json, math, random, sys, uuid, zlib
from collections import defaultdict, deque
from pathlib import Path

import numpy as np
import yaml

ROOT = Path(__file__).resolve().parent
CFG = yaml.safe_load(open(ROOT / "config" / "mock_config.yaml", encoding="utf-8"))
OUT = ROOT / "csv"
OUT.mkdir(exist_ok=True)
rnd = random.Random(CFG["seed"])
rng = np.random.default_rng(CFG["seed"])

START = CFG["start_date"]
END = CFG["end_date"]
ND = (END - START).days + 1
DATES = [START + dt.timedelta(days=i) for i in range(ND)]
ORD0 = START.toordinal()


def uid():
    return str(uuid.UUID(int=rnd.getrandbits(128), version=4))


def ts(d, minutes=0):
    """date + minutes-from-midnight -> ISO timestamptz (+07:00)"""
    t = dt.datetime.combine(d, dt.time()) + dt.timedelta(minutes=minutes)
    return t.strftime("%Y-%m-%dT%H:%M:%S+07:00")


TABLES = defaultdict(list)


_SEEN_TMT = set()
_USED_LC = set()


def add(table, **row):
    if table == "tmt_reference":          # SUBS/VTM ใช้ร่วมกันหลายยา -> ใส่ครั้งเดียว
        if row["tmt_id"] in _SEEN_TMT:
            return row
        _SEEN_TMT.add(row["tmt_id"])
    TABLES[table].append(row)
    return row


# --------------------------------------------------------------------------------------
# 1) region / network / hospital / users / distances
# --------------------------------------------------------------------------------------
REGION_ID, NETWORK_ID = uid(), uid()
add("region", id=REGION_ID, code="R-DEMO", name_th="เขตสุขภาพทดสอบ", name_en="Demo Health Region", created_at=ts(START - dt.timedelta(days=30)))
add("network", id=NETWORK_ID, region_id=REGION_ID, name="เครือข่ายทดสอบ", auto_approve="true")

HOSP = []
for h in CFG["hospitals"]:
    hh = dict(h)
    hh["id"] = uid()
    HOSP.append(hh)
    add("hospital", id=hh["id"], region_id=REGION_ID, network_id=NETWORK_ID, code=h["code"], name_th=h["name_th"],
        name_en=h.get("name_en", f"Demo Hospital {h['code'][1]}"), lat=h["lat"], lon=h["lon"], is_urban=str(h["urban"]).lower(),
        has_cold_chain=str(h["cold"]).lower(), has_blood_bank=str(h["blood_bank"]).lower(), active="true", created_at=ts(START - dt.timedelta(days=30)),
        updated_at=ts(START - dt.timedelta(days=30)), version=1)
HBY = {h["code"]: h for h in HOSP}

FIRST = ["สมชาย", "สมหญิง", "วิชัย", "ประสิทธิ์", "นภา", "กมล", "ธนากร", "พิมพ์ใจ", "อรทัย", "ศิริพร", "ชาญชัย", "วรรณา", "สุรเชษฐ์", "ปราณี", "อนุชา", "กนกวรรณ", "มานพ", "จิราพร", "ภาณุพงศ์", "ณัฐธิดา"]
LAST = ["ใจดี", "รักษา", "สุขสวัสดิ์", "มั่นคง", "แสงทอง", "พงษ์ไพบูลย์", "ศรีสวัสดิ์", "บุญมี", "เจริญผล", "วงศ์ษา"]
USERS = defaultdict(list)   # (hcode, role) -> [user ids]
USER_ROWS = {}


def mk_user(role, hosp=None, region=None, n=1, label=None):
    uid_ = uid()
    code = (hosp["code"].lower() if hosp else "region")
    email = f"{(label or role.lower())}{n}.{code}@example.org"
    row = add("app_user", id=uid_, cognito_sub=uid(), email=email, display_name=f"{rnd.choice(FIRST)} {rnd.choice(LAST)}",
              role=role, hospital_id=hosp["id"] if hosp else "", region_id=region or "", phone=f"08{rnd.randint(1,9)}-{rnd.randint(100,999)}-{rnd.randint(1000,9999)}",
              active="true", created_at=ts(START - dt.timedelta(days=20)))
    USERS[(hosp["code"] if hosp else "REGION", role)].append(uid_)
    USER_ROWS[uid_] = row
    return uid_


for h in HOSP:
    mk_user("HOSPITAL_ADMIN", h)
    for n in (1, 2):
        mk_user("PHARMACIST", h, n=n)
    mk_user("PROCUREMENT_OFFICER", h)
    mk_user("WAREHOUSE_OFFICER", h)
    for n in (1, 2):
        mk_user("ER_STAFF", h, n=n)
    mk_user("DRIVER", h)
mk_user("REGION_ADMIN", region=REGION_ID)
mk_user("DATA_ADMIN", region=REGION_ID)
mk_user("SYSTEM_ADMIN")
mk_user("AUDITOR")
DATA_ADMIN = USERS[("REGION", "DATA_ADMIN")][0]
REGION_ADMIN = USERS[("REGION", "REGION_ADMIN")][0]


def user_of(hcode, role, k=0):
    lst = USERS[(hcode, role)]
    return lst[k % len(lst)]


def haversine(a, b):
    R = 6371.0
    p1, p2 = math.radians(a["lat"]), math.radians(b["lat"])
    dp, dl = p2 - p1, math.radians(b["lon"] - a["lon"])
    x = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(x))


DIST = {}      # (a_code,b_code) -> dict(km, normal, peak, travel)
for a in HOSP:
    for b in HOSP:
        if a is b:
            continue
        km = round(haversine(a, b) * 1.35, 2)
        slow = 1.25 if (not a["urban"] or not b["urban"]) else 1.0
        normal = round(km / 32 * 60 * slow + 5, 1)
        peak = round(km / 19 * 60 * slow + 8, 1)
        travel = round((normal + peak) / 2, 1)
        DIST[(a["code"], b["code"])] = dict(km=km, normal=normal, peak=peak, travel=travel)
        add("hospital_distance", from_hospital_id=a["id"], to_hospital_id=b["id"], distance_km=km, duration_min_normal=normal,
            duration_min_peak=peak, travel_minutes=travel, travel_minutes_override="", source="MOCK_HAVERSINE_x1.35",
            refreshed_at=ts(START - dt.timedelta(days=10)))

# --------------------------------------------------------------------------------------
# 2) drug master (DRUG/SUPPLY/BLOOD), TMT จริง, hospital_drug, drug_mapping (ไม่มีรหัส 24 หลัก — spec v1.3)
# --------------------------------------------------------------------------------------
DRUGS = CFG["drugs"]
DBY = {d["key"]: d for d in DRUGS}
MFR = [("81001", "บริษัท ยาไทยเคมี จำกัด (ตัวอย่าง)"), ("20399", "บริษัท เภสัชภัณฑ์ไทย จำกัด (ตัวอย่าง)"), ("43121", "องค์การเภสัชกรรม (ตัวอย่าง)")]
TMT = json.loads((ROOT / "config" / "tmt_real.json").read_text(encoding="utf-8"))   # รหัส TMT จริงจากไฟล์ TMTRF20261005 (tools/build_tmt.py)
SUP_SEQ = [0]

for d in DRUGS:
    d["id"] = uid()
    t = TMT.get(d["key"])
    d["shelf_days"] = int(d["shelf_y"] * 365)
    d["emergency"] = d.get("emergency", "SUPPORTIVE")
    d["cold"] = d["store"] == "cold"
    d["price"] = float(d["price"])
    d["tmt_names"] = {}          # tmt_id -> ชื่อ FSN จริง
    d["tps"], d["tpus"], d["tpps"] = [], [], []
    if t:
        d["item_type"] = "DRUG"
        d["internal_code"] = ""
        d["gp_id"] = t["gp"]
        d["tmt_names"][t["gp"]] = t["gp_name"]
        subs = [x["id"] for x in t["subs"]]
        vtm = t["vtm"][0]["id"] if t["vtm"] else None
        gpu = t["gpu"]["id"] if t["gpu"] else None
        gpp = t["gpp"][0]["id"] if t["gpp"] else None
        for x in t["subs"] + t["vtm"] + ([t["gpu"]] if t["gpu"] else []) + t["gpp"]:
            d["tmt_names"][x["id"]] = x["name"]
        for x in t["tps"]:
            d["tmt_names"][x["tp"]["id"]] = x["tp"]["name"]
            d["tmt_names"][x["tpu"]["id"]] = x["tpu"]["name"]
            for p in x["tpp"]:
                d["tmt_names"][p["id"]] = p["name"]
            d["tps"].append((x["tp"]["id"], x["tpu"]["id"]))
            d["tpus"].append(x["tpu"]["id"])
            d["tpps"].append(x["tpp"][0]["id"] if x["tpp"] else None)
        d["tmt"] = {"SUBS": subs[0] if subs else None, "VTM": vtm, "GP": d["gp_id"], "GPU": gpu, "GPP": gpp}
        d["tmt_subs_all"] = subs
        # รหัส TMT ที่ใช้ในแถวยาของ รพ. (ถ้า TMT ไม่มี TPU/GPU ของรายการนี้ ใช้ระดับ GP) — ไม่สร้างรหัสปลอม
        d["ref_ids"] = d["tpus"] or ([gpu] if gpu else [d["gp_id"]])
        d["ref_gpu"] = gpu or d["gp_id"]
    else:
        # ไม่ใช่ยา / เลือด: ไม่มี TMT -> รหัสภายในจากรายการกลาง (ASM-48)
        d["gp_id"] = ""
        d["tmt"] = {}
        d["ref_ids"] = []
        d["ref_gpu"] = ""
        if d.get("blood"):
            d["item_type"], d["internal_code"] = "BLOOD", "BLD-0001"
        else:
            SUP_SEQ[0] += 1
            d["item_type"], d["internal_code"] = "SUPPLY", f"SUP-{SUP_SEQ[0]:04d}"
    add("drug_master", id=d["id"], item_type=d["item_type"], gp_id=d["gp_id"], internal_code=d["internal_code"], generic_name=d["name"],
        strength=d["strength"], dosage_form=d["form"], base_unit=d["unit"], is_cold_chain=str(d["cold"]).lower(),
        is_blood_product=str(bool(d.get("blood"))).lower(), is_high_alert=str(bool(d.get("high_alert"))).lower(),
        emergency_class=d["emergency"], created_at=ts(START - dt.timedelta(days=25)))
    if not t:
        continue
    gp = d["gp_id"]
    nm = lambda i, _d=d: _d["tmt_names"][i]
    for sid in subs:
        add("tmt_reference", tmt_id=sid, level="SUBS", name=nm(sid), parent_tmt_id="", gp_id=gp)
    if vtm:
        add("tmt_reference", tmt_id=vtm, level="VTM", name=nm(vtm), parent_tmt_id=subs[0] if subs else "", gp_id=gp)
    add("tmt_reference", tmt_id=gp, level="GP", name=nm(gp), parent_tmt_id=vtm or "", gp_id=gp)
    if gpu:
        add("tmt_reference", tmt_id=gpu, level="GPU", name=nm(gpu), parent_tmt_id=gp, gp_id=gp)
    if gpp:
        add("tmt_reference", tmt_id=gpp, level="GPP", name=nm(gpp), parent_tmt_id=gpu or gp, gp_id=gp)
    for k, (tp, tpu) in enumerate(d["tps"]):
        add("tmt_reference", tmt_id=tp, level="TP", name=nm(tp), parent_tmt_id=gp, gp_id=gp)
        add("tmt_reference", tmt_id=tpu, level="TPU", name=nm(tpu), parent_tmt_id=tp, gp_id=gp)
        if d["tpps"][k]:
            add("tmt_reference", tmt_id=d["tpps"][k], level="TPP", name=nm(d["tpps"][k]), parent_tmt_id=tpu, gp_id=gp)

NZ = CFG["data_quality_noise"]
LOCAL_PREFIX = {"HA": "A", "HB": "B-", "HC": "C", "HD": "D.", "HE": "E_"}
NAME_STYLE = {"HA": lambda d: f"{d['name']} {d['strength']} {d['form']}",
              "HB": lambda d: f"{d['name'].upper()} {d['strength']} ({d['unit']})",
              "HC": lambda d: f"{d['name'][:12]} {d['strength']}".replace("  ", " "),
              "HD": lambda d: f"{d['name']} {d['form'][:3]}.",
              "HE": lambda d: f"{d['form'].upper()}-{d['name']} {d['strength']}"}
PACK_UNIT = {"tablet": "กล่อง", "capsule": "กล่อง", "injection": "กล่อง", "syrup": "ลัง", "IV bag": "ลัง"}

HD = {}            # (hcode,dkey) -> dict
PACK_MULT = [0.5, 1, 1, 2]
for d in DRUGS:
    for h in HOSP:
        if h["code"][1] not in d["carry"]:
            continue
        hd_id = uid()
        while True:
            local_code = f"{LOCAL_PREFIX[h['code']]}{rnd.randint(10000, 99999)}"
            if (h["id"], local_code) not in _USED_LC:
                _USED_LC.add((h["id"], local_code))
                break
        is_drug = d["item_type"] == "DRUG"
        verified = rnd.random() > NZ["mapping_not_verified"]
        noise_gpu = rnd.random() < NZ["tmt_gpu_instead_of_tpu"]
        noise_unit = rnd.random() < NZ["wrong_unit"]
        if noise_unit:
            verified = False
        if not is_drug:             # เวชภัณฑ์/เลือด: เลือกจากรายการกลาง (ไม่มีคะแนน) -> ยืนยันแล้วเสมอ
            verified, noise_gpu, noise_unit = True, False, False
        pack = max(1, int(round(d["pack"] * rnd.choice(PACK_MULT))))
        ved = d["ved"]
        if rnd.random() < 0.08:
            ved = {"V": "E", "E": "V", "D": "E"}[ved]
        price = round(d["price"] * (1 + rnd.uniform(-1, 1) * CFG["price_noise_between_hospitals"]), 2)
        hdrow = dict(id=hd_id, hospital_id=h["id"], local_code=local_code, local_name=NAME_STYLE[h["code"]](d), unit_price_thb=price,
                     local_unit=d["unit"] if not noise_unit else "BOX",
                     tmt_id=("" if not is_drug else (d["ref_gpu"] if noise_gpu else rnd.choice(d["ref_ids"]))), gp_id=d["gp_id"], active="true", ved=ved, abc="",
                     expiry_threshold_days=(CFG["expiry"]["threshold_days_V"] if ved == "V" else ""), drug_master_id=d["id"] if verified else "")
        TABLES["hospital_drug"].append(hdrow)
        HD[(h["code"], d["key"])] = dict(id=hd_id, row=hdrow, verified=verified, pack=pack, price=price, ved=ved, h=h, d=d,
                                          thr=CFG["expiry"]["threshold_days_V"] if ved == "V" else CFG["expiry"]["threshold_days_default"])
        # mapping
        mp_id = uid()
        created = START - dt.timedelta(days=rnd.randint(8, 15))
        if verified:
            status, conf = "VERIFIED", (round(rnd.uniform(0.93, 1.0), 3) if is_drug else "")
        else:
            status = "UNMATCHED" if noise_unit is False and rnd.random() < 0.3 else ("REJECTED" if rnd.random() < 0.25 else "SUGGESTED")
            conf = "" if status == "UNMATCHED" else round(rnd.uniform(0.45, 0.85), 3)
        add("drug_mapping", id=mp_id, hospital_drug_id=hd_id, drug_master_id=d["id"] if status == "VERIFIED" else "", status=status,
            method="TMT" if is_drug else "CENTRAL_LIST", confidence=conf, unit_conversion_factor=1, local_pack_unit=PACK_UNIT.get(d["form"], "กล่อง"),
            base_units_per_pack=pack if status == "VERIFIED" or rnd.random() < 0.7 else "", manufacturer=rnd.choice(MFR)[1],
            suggested_by=("RULES" if rnd.random() < 0.8 else "AGENT") if is_drug else "CENTRAL_LIST", verified_by=DATA_ADMIN if status == "VERIFIED" else "",
            verified_at=ts(created + dt.timedelta(days=rnd.randint(1, 5)), 600) if status == "VERIFIED" else "",
            reject_reason="หน่วยนับไม่ตรงกับยาหลัก (ต้องตรวจสอบ)" if status == "REJECTED" else "",
            created_at=ts(created), updated_at=ts(created + dt.timedelta(days=3)), version=1)
        add("drug_mapping_history", drug_mapping_id=mp_id, from_status="", to_status="UNMATCHED", actor_id="", note="import", occurred_at=ts(created, 540))
        if not is_drug:
            add("drug_mapping_history", drug_mapping_id=mp_id, from_status="UNMATCHED", to_status="VERIFIED", actor_id=DATA_ADMIN, note="เลือกจากรายการกลาง " + d["internal_code"], occurred_at=ts(created + dt.timedelta(days=1), 700))
        else:
            if status != "UNMATCHED":
                add("drug_mapping_history", drug_mapping_id=mp_id, from_status="UNMATCHED", to_status="SUGGESTED", actor_id="", note="rules", occurred_at=ts(created, 545))
            if status in ("VERIFIED", "REJECTED"):
                add("drug_mapping_history", drug_mapping_id=mp_id, from_status="SUGGESTED", to_status=status, actor_id=DATA_ADMIN, note="manual review", occurred_at=ts(created + dt.timedelta(days=2), 700))
        if is_drug and status != "VERIFIED":
            others = [x for x in DRUGS if x is not d and x["item_type"] == "DRUG"]
            cands = [d] + rnd.sample(others, 2)
            sc = sorted([round(rnd.uniform(0.7, 0.88), 3) if k == 0 else round(rnd.uniform(0.3, 0.6), 3) for k in range(3)], reverse=True)
            for rank, (cd, s) in enumerate(zip(cands, sc), 1):
                add("mapping_candidate", id=uid(), drug_mapping_id=mp_id, tmt_id=cd["ref_ids"][0], score=s,
                    score_parts=json.dumps({"name": round(s * 0.5, 3), "strength": round(s * 0.2, 3), "form": round(s * 0.15, 3), "unit": 0.0 if noise_unit and rank == 1 else round(s * 0.15, 3)}),
                    rank=rank)

print(f"[1/6] master data: {len(DRUGS)} drugs, {len(TABLES['hospital_drug'])} hospital_drug rows", file=sys.stderr)

# --------------------------------------------------------------------------------------
# 3) ตัวคูณรายวัน (COVID, ฤดูกาล, เทศกาล, น้ำท่วม) และการสร้างความต้องการ
# --------------------------------------------------------------------------------------
def arr(fn):
    return np.array([fn(d) for d in DATES], dtype=float)


def covid_col(col):
    out = np.ones(ND)
    for p in CFG["covid_periods"]:
        a, b = (p["start"] - START).days, (p["end"] - START).days
        out[max(a, 0):b + 1] = p[col]
    # ทำให้เปลี่ยนค่าแบบไม่กระโดด (smooth 7 วัน)
    k = np.ones(7) / 7
    pad = np.pad(out, (3, 3), mode="edge")
    return np.convolve(pad, k, mode="valid")


CV = {c: covid_col(c) for c in ["favi", "remd", "dexa", "para", "ppe", "atk", "opd", "elective"]}


def season(table, d):
    m = d.month - 1
    dim = (dt.date(d.year + (d.month == 12), d.month % 12 + 1, 1) - dt.date(d.year, d.month, 1)).days
    f = (d.day - 1) / dim
    return table[m] * (1 - f) + table[(m + 1) % 12] * f


FLU = arr(lambda d: season(CFG["season_index"]["flu"], d) * CFG["flu_year_multiplier"][d.year])
for i, d in enumerate(DATES):
    if d.year in CFG["flu_early_peak_years"] and d.month in (1, 2):
        FLU[i] *= 2.0
    if d.year in CFG["flu_shift_july_years"] and d.month in (6, 7, 8):
        FLU[i] *= 1.4
FLU = FLU / 1.0
DENGUE = arr(lambda d: season(CFG["season_index"]["dengue"], d) * CFG["dengue_year_multiplier"][d.year])
CAMPAIGN = arr(lambda d: season(CFG["season_index"]["flu_vaccine_campaign"], d))
PM25 = arr(lambda d: 1.0 if d.month in CFG["pm25"]["months"] else 0.0)


def trauma_weight(d):
    """0..1 : น้ำหนักช่วง 7 วันอันตราย (ระฆังคว่ำ จุดพีคที่ peak_offset)"""
    best = 0.0
    for key, w in CFG["trauma_windows"].items():
        if key.endswith("effect"):
            continue
        s_m, s_d = map(int, w["start"].split("-"))
        for yr in (d.year - 1, d.year):
            s = dt.date(yr, s_m, s_d)
            off = (d - s).days
            if 0 <= off <= 6:
                x = 1 - abs(off - w["peak_offset"]) / 4.0
                v = max(0.25, x)
                if key == "songkran" and yr == 2020:
                    v *= CFG["trauma_windows"]["songkran_2020_effect"]
                if key == "songkran":
                    v *= CFG.get("songkran_year_mult", {}).get(yr, 1.0)
                best = max(best, v)
    return best


TRAUMA = arr(trauma_weight)
HOLI = arr(lambda d: 1.0 if d.strftime("%m-%d") in CFG["holiday_like_days"] else 0.0)
DOW = np.array([d.weekday() for d in DATES])
DOW_OPD = np.array(CFG["dow_opd"])[DOW] * (1 - 0.6 * HOLI)
DOW_ER = np.where(DOW >= 5, 0.97, 1.0)

# น้ำท่วมรายโรงพยาบาล
FLOOD = {h["code"]: {k: np.ones(ND) for k in ["opd", "ors", "doxy", "ceftriaxone", "lead_mult"]} for h in HOSP}
FLOOD_MARK = defaultdict(list)
for ev in CFG["flood_events"]:
    s = (ev["start"] - START).days
    for wk in CFG["flood_week_multipliers"]:
        for k in ["opd", "ors", "doxy", "ceftriaxone", "lead_mult"]:
            a, b = s + wk["from_day"], min(ND, s + wk["to_day"])
            if a < ND:
                FLOOD[ev["hospital"]][k][a:b] = wk[k]
    FLOOD_MARK[ev["hospital"]].append(ev)

SHORT = defaultdict(list)       # drug key -> list of (a_i, b_i, fill, lead_mult)
for s in CFG["supply_shortages"]:
    for k in s["drugs"]:
        SHORT[k].append(((s["start"] - START).days, (s["end"] - START).days, s["fill"], s["lead_mult"]))

FLU_W = {"OSELTAMIVIR": 1.0, "PARACETAMOL_SYRUP": 0.35, "PARACETAMOL_500": 0.2, "SALBUTAMOL_MDI": 0.15, "SALBUTAMOL_NEB": 0.25}
DENGUE_W = {"NSS_1000": 0.10, "RL_1000": 0.06, "ORS": 0.12, "PARACETAMOL_500": 0.06, "PARACETAMOL_SYRUP": 0.08}


def factor_series(d, h):
    """ตัวคูณรายวันทั้งหมดของยา d ที่ รพ. h  (ยกเว้นขนาด รพ.)"""
    f = np.ones(ND)
    key = d["key"]
    fl = FLOOD[h["code"]]
    for tag in d["ev"]:
        base, _, arg = tag.partition(":")
        if base == "para":
            f *= CV["para"]
        elif base == "dexa":
            f *= CV["dexa"]
        elif base == "ppe":
            f *= CV["ppe"]
        elif base == "ppe_half":
            f *= 1 + (CV["ppe"] - 1) * 0.3
        elif base == "flu":
            w = FLU_W.get(key, 0.2)
            f *= (1 + w * (FLU - 1)) if w < 1 else FLU
        elif base == "dengue":
            f *= 1 + DENGUE_W.get(key, 0.05) * (DENGUE - 1)
        elif base == "pm25":
            m = np.array([CFG["pm25"]["salbutamol_mult"].get(dd.year, CFG["pm25"]["salbutamol_mult"]["default"]) for dd in DATES])
            f *= 1 + (m - 1) * PM25 * (1.0 if h["urban"] else 0.5)
        elif base == "pm25n95":
            f *= 1 + (CFG["pm25"]["n95_mult"] - 1) * PM25
        elif base == "trauma":
            f *= 1 + (float(arg) - 1) * TRAUMA
        elif base == "elective":
            f *= CV["elective"]
        elif base == "elective_half":
            f *= 1 + (CV["elective"] - 1) * 0.5
        elif base == "flood_ors":
            f *= fl["ors"]
        elif base == "flood_doxy":
            f *= fl["doxy"]
        elif base == "flood_ceftriaxone":
            f *= fl["ceftriaxone"]
    if d.get("season") == "flu_vaccine_campaign":
        f *= CAMPAIGN
    if d["opd_w"]:
        f *= 1 + (CV["opd"] * fl["opd"] - 1) * d["opd_w"]
    f *= {"opd": DOW_OPD, "er": DOW_ER, "flat": np.where(DOW >= 5, 0.97, 1.0)}[d["dow"]]
    if d.get("event_only"):
        f = f * CV[d["event_only"]] / 1.0
        f = np.where(CV[d["event_only"]] < 0.01, 0.0, f)
    return f


def gen_demand(d, h):
    f = factor_series(d, h)
    mu = d["mean_A"] * h["size"] * f
    pat = d["pattern"]
    if pat in ("regular", "erratic"):
        cv = d.get("cv", 0.3)
        k = 1.0 / (cv * cv)
        lam = rng.gamma(k, np.maximum(mu, 1e-9) / k)
        out = rng.poisson(lam)
    else:
        avg = d.get("avg_size", 1.5)
        ev = rng.poisson(np.maximum(mu, 0) / avg)
        if pat == "intermittent":
            out = ev + rng.poisson(np.maximum(ev * (avg - 1), 0))
        else:   # lumpy: ขนาดต่อเหตุแกว่งมาก
            out = np.zeros(ND, dtype=int)
            for i in np.nonzero(ev)[0]:
                out[i] = int(np.sum(np.maximum(1, np.round(rng.lognormal(math.log(avg) - 0.45, 0.95, ev[i])))))
    return out.astype(np.int64)


DEMAND = {}
for d in DRUGS:
    for h in HOSP:
        if h["code"][1] in d["carry"]:
            DEMAND[(h["code"], d["key"])] = gen_demand(d, h)
print("[2/6] demand series generated", file=sys.stderr)

# --------------------------------------------------------------------------------------
# 4) F3: ชุด Preset Kit, กฎ, เหตุการณ์ MCI ในอดีต (สร้างก่อน เพื่อให้ยอดใช้ยาเข้า usage_daily)
# --------------------------------------------------------------------------------------
KIT = {}
for code, k in CFG["kits"].items():
    kid = uid()
    KIT[code] = dict(id=kid, **k)
    add("kit_type", id=kid, code=code, name=k["name"], description="ชุดตัวอย่าง (สมมติ ต้องให้ทีมคลินิกตรวจ)", needs_cold_chain=str(k["cold"]).lower(), active="true")
    for dk, q in k["components"].items():
        add("kit_component", kit_type_id=kid, drug_master_id=DBY[dk]["id"], qty_per_kit=q)
TRI = ["RED", "YELLOW", "GREEN"]
for code, vals in CFG["kit_recipe"].items():
    for t, q in zip(TRI, vals):
        if q > 0:
            add("kit_recipe", triage=t, kit_type_id=KIT[code]["id"], qty_per_patient=q, is_critical_min=str(t == "RED").lower())
for dk, vals in CFG["extra_rule"].items():
    for t, q in zip(TRI, vals):
        if q > 0:
            add("incident_extra_rule", triage=t, drug_master_id=DBY[dk]["id"], qty_per_patient=q, is_critical_min=str(t == "RED").lower())

INC_ROWS = []
SPIKES = []      # (hcode, dkey, day_index, qty)
EMERG_BLOOD = []   # คำขอยืม PRC O ฉุกเฉิน (v1.2)
EMERG_REQ = []   # รายการคำขอยืมชุดฉุกเฉิน (สร้างหลังได้ ladder)


def pick_type():
    r, acc = rnd.random(), 0
    for t in CFG["incident_types"]:
        acc += t["weight"]
        if r <= acc:
            return t
    return CFG["incident_types"][0]


def incident_days():
    out = []
    for yr in range(START.year, END.year + 1):
        n = np.random.default_rng(CFG["seed"] + yr).poisson(CFG["incidents_per_year"])
        for _ in range(n):
            if rnd.random() < 0.3:          # กระจุกในช่วง 7 วันอันตราย
                if rnd.random() < 0.5:
                    d = dt.date(yr, 4, rnd.randint(11, 17))
                else:
                    d = dt.date(yr, 12, rnd.randint(29, 31)) if rnd.random() < 0.6 else dt.date(yr, 1, rnd.randint(1, 4))
            else:
                d = dt.date(yr, 1, 1) + dt.timedelta(days=rnd.randint(0, 364))
            if START <= d <= END:
                out.append(d)
    return sorted(out)


INC_NO = 0
KIT_READY = {}
for h in HOSP:
    for code, base in CFG["kit_ready_base"].items():
        KIT_READY[(h["code"], code)] = max(1, int(round(base * CFG["kit_ready_stock"][h["code"]])))

for d in incident_days():
    INC_NO += 1
    typ = pick_type()
    hc = rnd.choices(["HA", "HB", "HC", "HD", "HE"], weights=[50, 20, 10, 10, 10])[0]
    h = HBY[hc]
    n = int(np.clip(round(rnd.lognormvariate(math.log(typ["n_median"]), typ["n_sigma"])), 4, 150))
    frac = rng.dirichlet(np.array([CFG["triage_default"][t] for t in TRI]) * 40)
    bf = {"traffic": "traffic", "bus": "traffic", "fire": "fire_enclosed", "shooting": "shooting"}.get(typ["type"], "other")
    n_black = int(round(n * CFG["black_fraction"][bf] * (0.3 if bf == "fire_enclosed" and rnd.random() < 0.7 else 1.0))) if bf != "traffic" else int(round(n * rnd.uniform(0.04, 0.09)))
    live = n - n_black
    cnt = {t: int(round(live * f)) for t, f in zip(TRI, frac)}
    cnt["GREEN"] = max(0, live - cnt["RED"] - cnt["YELLOW"])
    cnt["BLACK"] = n_black
    iid = uid()
    created = ts(d, rnd.randint(360, 1320))
    creator = user_of(hc, "ER_STAFF", rnd.randint(0, 1))
    cancelled = rnd.random() < 0.04
    dup_of = ""
    if INC_ROWS and not cancelled and rnd.random() < 0.03 and INC_ROWS[-1]["hospital"] == hc and INC_ROWS[-1]["date"] == d:
        dup_of, cancelled = INC_ROWS[-1]["id"], True
    status = "CANCELLED" if cancelled else "RECONCILED"
    row = dict(id=iid, date=d, hospital=hc, status=status, type=typ, counts=cnt, n=n)
    INC_ROWS.append(row)
    off = lambda: round(rnd.uniform(-0.04, 0.04), 6)
    add("incident", id=iid, incident_no=f"INC-{d.year}-{INC_NO:04d}", hospital_id=h["id"], status=status, location_lat=round(h["lat"] + off(), 6),
        location_lon=round(h["lon"] + off(), 6), location_text=f"{typ['label']} (ตัวอย่าง) ใกล้ {h['name_th']}", reported_eta_min=rnd.randint(8, 45),
        created_by=creator, duplicate_of=dup_of, closed_at=ts(d, rnd.randint(1500, 3600)), created_at=created, updated_at=created, version=2)
    for t in ["RED", "YELLOW", "GREEN", "BLACK"]:
        add("incident_patient_count", incident_id=iid, triage=t, count=cnt[t], updated_at=created)
    if cancelled:
        continue
    # ---- แผน: Estimated vs Critical Minimum (สูตรเดียวกับ spec F-27) ----
    kits_used = [c for c in CFG["kit_recipe"] if c != "BURN" or "BURN" in typ["kits_extra"]]
    est_kit, crit_kit = {}, {}
    for c in kits_used:
        vals = CFG["kit_recipe"][c]
        est_kit[c] = math.ceil(sum(cnt[t] * q for t, q in zip(TRI, vals)))
        crit_kit[c] = math.ceil(cnt["RED"] * vals[0])
    est_extra, crit_extra = {}, {}
    for dk, vals in CFG["extra_rule"].items():
        if DBY[dk].get("blood") and not HBY[hc]["blood_bank"]:      # v1.2: เลือดเฉพาะ รพ.ที่มีธนาคารเลือด
            continue
        est_extra[dk] = math.ceil(sum(cnt[t] * q for t, q in zip(TRI, vals)))
        crit_extra[dk] = math.ceil(cnt["RED"] * vals[0])
    ready = {c: KIT_READY[(hc, c)] for c in kits_used}
    pack = {c: max(0, est_kit[c] - ready[c]) for c in kits_used if est_kit[c] > ready[c]}
    shortfall = {c: max(0, est_kit[c] - ready[c] - pack.get(c, 0)) for c in pack}
    # ครึ่งหนึ่งของชุดที่ขาด: แพ็กเองได้ (ส่วนประกอบเพียงพอ), ที่เหลือยืมเป็นชุดทั้งเซ็ต
    borrow_kits = {c: int(math.ceil((est_kit[c] - ready[c]) * rnd.uniform(0.0, 0.6))) for c in pack}
    borrow_kits = {c: q for c, q in borrow_kits.items() if q > 0}
    pack_kits = {c: est_kit[c] - ready[c] - borrow_kits.get(c, 0) for c in pack}
    pid = uid()
    steps = [{"step": 1, "action": "ตรวจสอบจำนวนผู้ป่วยตามระดับคัดแยก"}, {"step": 2, "action": "ใช้ชุดพร้อมใช้ที่มี", "kits": ready},
             {"step": 3, "action": "แพ็กชุดเพิ่มจากส่วนประกอบในคลัง", "kits": pack_kits}]
    if borrow_kits:
        steps.append({"step": 4, "action": "ยืมชุดทั้งเซ็ตจาก รพ.ใกล้เคียง", "kits": borrow_kits})
    if cnt["BLACK"]:
        steps.append({"step": 5, "action": "แจ้งเตือน: ผู้เสียชีวิต/ดำ ไม่สร้างรายการเวชภัณฑ์"})
    steps.append({"step": 6, "action": "เตือน: ผลิตภัณฑ์เลือดอื่น (PRC กรุ๊ปอื่น, FFP, เกล็ดเลือด, cryo) ขอผ่านธนาคารเลือด ไม่มีรายการในแผน"})
    add("emergency_plan", id=pid, incident_id=iid, revision=1, status="APPROVED",
        estimated_need=json.dumps({"kits": est_kit, "extras": est_extra}, ensure_ascii=False),
        critical_min=json.dumps({"kits": crit_kit, "extras": crit_extra}, ensure_ascii=False),
        buffer=json.dumps({"kits": {c: est_kit[c] - crit_kit[c] for c in est_kit}, "extras": {c: est_extra[c] - crit_extra[c] for c in est_extra}}, ensure_ascii=False),
        steps=json.dumps(steps, ensure_ascii=False), shortfall=json.dumps(shortfall, ensure_ascii=False) if shortfall else "",
        approved_by=user_of(hc, "PHARMACIST"), approved_at=ts(d, rnd.randint(1390, 1400) % 1440 + 5), agent_run_id="", created_at=created)
    for c, q in pack_kits.items():
        if q > 0:
            add("kit_pack_task", id=uid(), plan_id=pid, hospital_id=h["id"], kit_type_id=KIT[c]["id"], qty=q, status="DONE",
                confirmed_by=user_of(hc, "WAREHOUSE_OFFICER"), confirmed_at=ts(d, rnd.randint(1400, 1439)))
    # ---- ใช้จริง (60–100% ของที่ประเมิน) -> เข้า incident_usage และเพิ่มความต้องการยาใน usage_daily ----
    di = (d - START).days
    usage = defaultdict(float)
    for c in kits_used:
        used = est_kit[c] * rnd.uniform(0.6, 1.0)
        add("incident_usage", id=uid(), incident_id=iid, drug_master_id="", kit_type_id=KIT[c]["id"], qty_used=round(used, 3), recorded_by=user_of(hc, "ER_STAFF"))
        for dk, q in CFG["kits"][c]["components"].items():
            usage[dk] += used * q
    for dk, q in est_extra.items():
        usage[dk] += q * rnd.uniform(0.6, 1.0)
    for dk, q in usage.items():
        qq = int(round(q))
        if qq > 0 and (hc, dk) in DEMAND:
            SPIKES.append((hc, dk, di, qq))
            DEMAND[(hc, dk)][di] += qq
            add("incident_usage", id=uid(), incident_id=iid, drug_master_id=DBY[dk]["id"], kit_type_id="", qty_used=qq, recorded_by=user_of(hc, "ER_STAFF"))
    if est_extra.get("PRC_O", 0) >= 3 and rnd.random() < CFG["blood"]["incident_borrow_prob"]:
        EMERG_BLOOD.append(dict(inc=iid, date=d, hc=hc, qty=min(CFG["blood"]["prc_o_max_units"], est_extra["PRC_O"])))
    if borrow_kits:
        EMERG_REQ.append(dict(inc=iid, date=d, hc=hc, kits=borrow_kits))
print(f"[3/6] incidents: {len(INC_ROWS)} (spikes added to demand: {len(SPIKES)})", file=sys.stderr)

# --------------------------------------------------------------------------------------
# 5) จำลองสต็อกรายวัน: ใช้ยา -> สั่งซื้อ -> แจ้งเตือน -> ยืม(F1) -> คืน -> ใกล้หมดอายุ/โอน(F2)
# --------------------------------------------------------------------------------------
R_CFG, B_CFG, E_CFG = CFG["replenish"], CFG["borrow"], CFG["expiry"]
Z = R_CFG["z"]
CYCLE = {"room": 30, "cold": 14, "locked": 21, "light": 30, "blood": 5}
TO = B_CFG["timeout_min"]
BATCH_EXP = {}
LED = []                 # (abs_min, seq, hospital_id, lot_id, delta, reason, ref_type, ref_id, actor)
SNAP, USAGE = [], []
SEQ = [0]
EXPIRED = []             # (hcode, dkey, i, qty, value)
STOCKOUT = defaultdict(int)       # (hcode, ym) -> days with unmet demand
RELI = defaultdict(lambda: [0, 0])   # (lender_code, "YYYY-MM-01") -> [received, accepted_on_time]
RELI_CUM = defaultdict(lambda: [0, 0])
USAGE_VALUE = defaultdict(float)  # (hcode, dkey) -> value last 365 days
VALUE_REC = defaultdict(float)    # (metric, hcode, ym) -> value
LOTS_ALL = []
SO_FLAG = set()


class Lot:
    __slots__ = ("id", "no", "exp", "qty", "st", "created_i", "init_qty")

    def __init__(self, st, no, exp, i):
        self.id, self.no, self.exp, self.qty, self.st, self.created_i, self.init_qty = uid(), no, exp, 0, st, i, 0


class St:
    def __init__(self, d, h):
        self.d, self.h = d, h
        x = HD[(h["code"], d["key"])]
        self.hd, self.verified, self.pack, self.price, self.ved, self.thr = x["id"], x["verified"], max(1, x["pack"]), x["price"], x["ved"], x["thr"]
        self.lots, self.lotmap, self.oh = [], {}, 0
        self.dq, self.s1, self.s2 = deque(), 0.0, 0.0
        self.open_orders, self.pending_in = [], []
        self.ev = defaultdict(list)
        self.wk = defaultdict(int)
        self.last_order, self.last_alert, self.last_over = -99, -99, -99
        self.prior = 0.0 if d.get("event_only") else d["mean_A"] * h["size"]
        self.par = max(2, math.ceil(d["par_A"] * h["size"])) if d.get("par_A") else 0
        self.f2_lots = set()
        self.alloc_pending = 0

    def incoming(self):
        return sum(o["qty"] for o in self.open_orders) + sum(q for _, q in self.pending_in)


def abs_min(i, m=0):
    return i * 1440 + m


def mts(am):
    i, m = divmod(int(am), 1440)
    i = max(0, min(i, ND - 1)) if i >= ND else i
    return ts(DATES[min(i, ND - 1)] if i < ND else END, m if i < ND else 1439)


def stats(st):
    n = len(st.dq)
    if n < 30:
        m = (st.s1 + st.prior * (30 - n)) / 30
        var = max(st.s2 / n - (st.s1 / n) ** 2, 0) if n > 3 else (st.prior * 0.3) ** 2
    else:
        m = st.s1 / 30
        var = max(st.s2 / 30 - m * m, 0)
    return m, math.sqrt(var)


def led(am, st, lot, delta, reason, ref_type="", ref_id="", actor=""):
    SEQ[0] += 1
    LED.append((am, SEQ[0], st.h["id"], lot.id, delta, reason, ref_type, ref_id, actor))


def add_lot(st, no, exp, qty, reason, am, ref_type="", ref_id="", actor=""):
    lot = st.lotmap.get(no)
    if lot is None:
        lot = Lot(st, no, exp, am // 1440)
        st.lotmap[no] = lot
        LOTS_ALL.append(lot)
        LOT_BY_ID[lot.id] = lot
    if lot.qty <= 0:
        bisect.insort(st.lots, lot, key=lambda l: l.exp)
    lot.qty += qty
    lot.init_qty += qty
    st.oh += qty
    led(am, st, lot, qty, reason, ref_type, ref_id, actor or user_of(st.h["code"], "WAREHOUSE_OFFICER"))
    return lot


def take(st, qty, am, reason, min_days=None, today_ord=None, ref_type="", ref_id="", agg=False):
    """ตัดสต็อกแบบ FEFO คืน [(lot, qty)]"""
    need, out = qty, []
    for lot in st.lots:
        if need <= 0:
            break
        if min_days is not None and lot.exp - today_ord < min_days:
            continue
        t = min(lot.qty, need)
        if t <= 0:
            continue
        lot.qty -= t
        need -= t
        out.append((lot, t))
        st.oh -= t
        if agg:
            st.wk[lot.id] = st.wk.get(lot.id, 0) + t
        else:
            led(am, st, lot, -t, reason, ref_type, ref_id, user_of(st.h["code"], "WAREHOUSE_OFFICER"))
    if out:
        st.lots = [l for l in st.lots if l.qty > 0]
    return out


def flush_week(st, i):
    if st.wk:
        for lid_lot_qty in list(st.wk.items()):
            lid, q = lid_lot_qty
            lot = LOT_BY_ID[lid]
            led(abs_min(i, 1430), st, lot, -q, "ISSUE_USAGE", "WEEKLY_AGG", "", "")
        st.wk.clear()


LOT_BY_ID = {}


def travel(a, b):
    return DIST[(a, b)]["travel"]


def process_drug(d):
    hs = [h for h in HOSP if h["code"][1] in d["carry"]]
    S = {h["code"]: St(d, h) for h in hs}
    dkey = d["key"]
    reqs_this = []
    # สต็อกตั้งต้น
    for st in S.values():
        if st.prior > 0 or st.par:
            q0 = max(st.par, int(st.prior * rnd.uniform(30, 50)))
            q0 = math.ceil(q0 / st.pack) * st.pack
            for k, share in enumerate((0.55, 0.45)):
                exp = ORD0 + int(d["shelf_days"] * rnd.uniform(0.35, 0.8)) - 5 * k
                lot = add_lot(st, f"INIT{dkey[:4]}-{k+1}", exp, max(1, int(q0 * share)), "IMPORT", 0)
    for lot in list(LOTS_ALL):
        LOT_BY_ID[lot.id] = lot
    shorts = SHORT.get(dkey, [])

    def fill_lead(i):
        fill, lm = 1.0, 1.0
        for a, b, f, l in shorts:
            if a <= i <= b:
                fill, lm = min(fill, f), max(lm, l)
        return fill, lm

    for i in range(ND):
        date = DATES[i]
        today_ord = ORD0 + i
        for st in S.values():
            # -- 1) เหตุการณ์ที่ครบกำหนดวันนี้
            for kind, pay in sorted(st.ev.pop(i, []), key=lambda x: x[1].get("_t", 0) if isinstance(x[1], dict) else 0):
                handle_event(S, st, kind, pay, i, today_ord, d)
            # -- 2) หมดอายุ
            while st.lots and st.lots[0].exp < today_ord:
                lot = st.lots.pop(0)
                if lot.qty > 0:
                    led(abs_min(i, 480), st, lot, -lot.qty, "EXPIRED_WRITEOFF", "", "", user_of(st.h["code"], "WAREHOUSE_OFFICER"))
                    val = lot.qty * st.price
                    EXPIRED.append((st.h["code"], dkey, i, lot.qty, val))
                    VALUE_REC[("EXPIRED_WRITEOFF_THB", st.h["code"], date.strftime("%Y-%m-01"))] += val
                    st.oh -= lot.qty
                    lot.qty = 0
            # -- 3) ใช้ยา
            dem = int(DEMAND[(st.h["code"], dkey)][i])
            disp = min(dem, st.oh)
            if disp > 0:
                take(st, disp, abs_min(i), "ISSUE_USAGE", agg=True)
            if dem > disp:
                STOCKOUT[(st.h["code"], date.strftime("%Y-%m-01"))] += 1
            USAGE.append((st.h["id"], st.hd, date.isoformat(), disp))
            if i >= ND - 365:
                USAGE_VALUE[(st.h["code"], dkey)] += disp * st.price
            st.dq.append(dem)          # สัญญาณความต้องการ (รวมที่จ่ายไม่ได้เพราะของหมด) ใช้คำนวณสั่งซื้อ/ยืม
            st.s1 += dem
            st.s2 += dem * dem
            if len(st.dq) > 30:
                x = st.dq.popleft()
                st.s1 -= x
                st.s2 -= x * x
            # -- 4) snapshot สิ้นวัน
            SNAP.append((st.h["id"], st.hd, date.isoformat(), st.oh, st.incoming()))
            # -- 5) สั่งซื้อ
            reorder(st, i, date, d, fill_lead)
            # -- 6) แจ้งเตือนสต็อกต่ำ + ยืม
            if st.verified:
                check_alert(S, st, i, today_ord, d)
        # -- 7) สแกนยาใกล้หมดอายุทุกต้นเดือน
        if date.day == 1 and date >= E_CFG["scan_from"]:
            f2_scan(S, i, today_ord, d)
            for st in S.values():
                overstock_check(st, i, date)
        # -- 8) ปิดสัปดาห์
        if date.weekday() == 6 or i == ND - 1:
            for st in S.values():
                flush_week(st, i)
    for st in S.values():
        for lot in st.lotmap.values():
            pass
    return S


def reorder(st, i, date, d, fill_lead):
    m, sg = stats(st)
    if m <= 0.0005 and not st.par:
        return
    z = Z[st.ved]
    L = d["lead"] * (1.3 if not st.h["urban"] else 1.0)
    Lc = L + 7
    cyc = CYCLE[d["store"]]
    base_s = m * Lc + z * sg * math.sqrt(Lc)
    s = max(st.par, base_s) if st.par else base_s
    S_ = s + (max(st.par, m * cyc) if st.par else m * cyc)
    m7 = sum(list(st.dq)[-7:]) / max(1, min(7, len(st.dq)))
    if m > 0.5 and m7 > 1.3 * m:
        S_ *= 1.5
    ip = st.oh + st.incoming()
    if ip > s:
        return
    if not (date.weekday() == R_CFG["review_weekday"] or st.oh < 2 * m or (st.par and st.oh < 0.5 * st.par)):
        return
    if i - st.last_order < 3:
        return
    q = (S_ - ip) * CFG["fiscal_order_factor"].get(date.month, 1.0)
    if d.get("moq_days"):
        q = max(q, m * d["moq_days"])
    if q < 1:
        return
    pv = CFG["procurement_variance"]
    shortx = False
    if d["pattern"] in ("regular", "erratic") and not d.get("event_only") and not d.get("blood") and rnd.random() < pv["oversize_prob"]:
        q *= rnd.uniform(*pv["oversize_mult"])
        shortx = rnd.random() < pv["oversize_short_prob"]
    q = math.ceil(q / st.pack) * st.pack
    fill, lm = fill_lead(i)
    lm *= FLOOD[st.h["code"]]["lead_mult"][i]
    st.last_order = i
    Lb = max(1, round(L * rnd.uniform(0.8, 1.4) * lm))
    arr = i + Lb
    delivered = int(round(q * min(1.0, fill * rnd.uniform(0.92, 1.05))))
    if fill < 0.05 or delivered < 1:
        add("incoming_order", id=uid(), hospital_id=st.h["id"], hospital_drug_id=st.hd, qty=max(1, q), expected_date=DATES[min(arr, ND - 1)].isoformat(), status="CANCELLED", lead_time_days=Lb)
        return
    row = add("incoming_order", id=uid(), hospital_id=st.h["id"], hospital_drug_id=st.hd, qty=delivered, expected_date=DATES[min(arr, ND - 1)].isoformat(),
              status="RECEIVED" if arr < ND else "OPEN", lead_time_days=Lb)
    o = dict(qty=delivered, arr=arr, row=row, _t=0, short=(not d.get("blood")) and rnd.random() < CFG["procurement_variance"]["short_dated_prob"], shortx=shortx)
    st.open_orders.append(o)
    if arr < ND:
        st.ev[arr].append(("order_arr", o))


def handle_event(S, st, kind, p, i, today_ord, d):
    if kind == "order_arr":
        st.open_orders.remove(p)
        date = DATES[i]
        lo, hi = R_CFG["shelf_remaining_on_receipt"]
        bk = (d["key"], date.year, date.month, 8 if p.get("shortx") else (9 if p.get("short") else rnd.randint(1, 2)))
        exp = None if d.get("blood") else BATCH_EXP.get(bk)
        if d.get("blood"):      # เลือด: อายุต่อยูนิตตามวันรับจริง (ไม่ใช้แบทช์รายเดือน), ไม่มีล็อตสั้น/สั่งเกิน
            exp = today_ord + int(d["shelf_days"] * rnd.uniform(0.6, 0.95))
            bk = (d["key"], date.year, date.month, date.day)
        elif exp is None:
            if p.get("shortx"):
                lo, hi = CFG["procurement_variance"]["oversize_short_range"]
            elif p.get("short"):
                lo, hi = CFG["procurement_variance"]["short_dated_range"]
            exp = today_ord + int(d["shelf_days"] * rnd.uniform(lo, hi))
            BATCH_EXP[bk] = exp
        lot = add_lot(st, f"{d['key'][:4]}{date.year % 100:02d}{date.month:02d}-{bk[3]}", exp, p["qty"], "RECEIPT", abs_min(i, 540 + rnd.randint(0, 300)), "INCOMING_ORDER", p["row"]["id"])
        LOT_BY_ID[lot.id] = lot
    elif kind == "lend":
        leg = p
        am = abs_min(i, 600)
        pieces = take(st, leg["qa"], max(leg["loaded_abs"], am), "LEND_OUT", E_CFG and B_CFG["lot_min_remaining_days"], today_ord, "BORROW_LEG", leg["row"]["id"])
        if not pieces:
            pieces = take(st, leg["qa"], leg["loaded_abs"], "LEND_OUT", None, today_ord, "BORROW_LEG", leg["row"]["id"])
        got = sum(q for _, q in pieces)
        leg["row"]["qty_received"] = got
        borrower = S[leg["borrower"]]
        borrower.pending_in = [x for x in borrower.pending_in if x[0] != leg["row"]["id"]]
        if got <= 0:
            leg["row"]["status"] = "CANCELLED"
            leg["row"]["reject_reason"] = "สต็อกเปลี่ยนก่อนส่งของ"
            return
        for lot, q in pieces:
            add("borrow_leg_lot", id=uid(), leg_id=leg["row"]["id"], lot_id=lot.id, qty=q)
        leg["pieces"] = [(l.no, l.exp, q) for l, q in pieces]
        arr_i = min(ND - 1, leg["arrive_abs"] // 1440)
        borrower.ev[max(arr_i, i + 1)].append(("borrow_arr", dict(leg, _t=leg["arrive_abs"])))
    elif kind == "borrow_arr":
        leg = p
        st_b = st
        for no, exp, q in leg["pieces"]:
            add_lot(st_b, no, exp, q, "BORROW_IN", max(leg["arrive_abs"], abs_min(i)), "BORROW_LEG", leg["row"]["id"])
        got = sum(q for _, _, q in leg["pieces"])
        leg["row"]["status"] = "RECEIVED"
        leg["row"]["qty_received"] = got
        req = leg["req"]
        req["received"] += got
        rq = req["row"]
        req["item"]["qty_fulfilled"] = req["received"]
        # หนี้คืนเป็นสิ่งของ (ชนิดเดียวกัน จำนวนเท่ากัน)
        due = DATES[min(i, ND - 1)] + dt.timedelta(days=B_CFG["return_days"])
        ob = add("return_obligation", id=uid(), leg_id=leg["row"]["id"], debtor_hospital_id=st_b.h["id"], creditor_hospital_id=S[leg["lender"]].h["id"],
                 drug_master_id=d["id"], kit_type_id="", qty=got, qty_returned=0, return_mode="IN_KIND", due_date=due.isoformat(), status="OPEN", returned_at="", waived_reason="", waived_by="")
        o = dict(row=ob, remaining=got, lender=leg["lender"], due_i=min(i, ND - 1) + B_CFG["return_days"], parts=1 if rnd.random() < 0.6 else 2, done=0, _t=0)
        t0 = max(i + 3, o["due_i"] - rnd.randint(3, 18))
        if rnd.random() < B_CFG["waive_probability"]:
            wi = o["due_i"] + 15
            if wi < ND:
                st_b.ev[wi].append(("waive", o))
        elif t0 < ND:
            st_b.ev[t0].append(("return_try", o))
        # ขนส่งขาไป (F1) -> task + events
        mk_transport("BORROW_LEG", leg["row"]["id"], leg["lender"], st_b.h["code"], leg)
    elif kind == "waive":
        o = p
        o["row"]["status"] = "WAIVED"
        o["row"]["waived_reason"] = "ตกลงให้เป็นการสนับสนุนระหว่างโรงพยาบาล (ผู้ดูแลอนุมัติ)"
        o["row"]["waived_by"] = user_of(S[o["lender"]].h["code"], "HOSPITAL_ADMIN")
    elif kind == "return_try":
        o = p
        m, _ = stats(st)
        avail = int(st.oh - math.ceil(m * 7))
        due_i = o["due_i"]
        if avail <= 0:
            if i + 7 < ND:
                st.ev[i + 7].append(("return_try", o))
            if i > due_i:
                o["row"]["status"] = "OVERDUE"
            return
        part = o["remaining"] if o["parts"] == 1 or o["done"] == 1 else max(1, int(o["remaining"] * rnd.uniform(0.5, 0.7)))
        give = min(part, avail)
        am = abs_min(i, 600 + rnd.randint(0, 200))
        pieces = take(st, give, am, "RETURN_OUT", B_CFG["lot_min_remaining_days"], today_ord, "RETURN_OBLIGATION", o["row"]["id"]) or take(st, give, am, "RETURN_OUT", None, today_ord, "RETURN_OBLIGATION", o["row"]["id"])
        got = sum(q for _, q in pieces)
        if got <= 0:
            return
        o["remaining"] -= got
        o["done"] += 1
        o["row"]["qty_returned"] = o["row"]["qty"] - o["remaining"]
        arr = min(ND - 1, i + 1)
        lender_st = S[o["lender"]]
        lender_st.ev[arr].append(("return_in", dict(o=o, pieces=[(l.no, l.exp, q) for l, q in pieces], at=am + 1440 if i + 1 < ND else am, _t=am + 1440)))
        if o["remaining"] > 0 and i + 8 < ND:
            st.ev[i + 8].append(("return_try", o))
        elif o["remaining"] > 0:
            o["row"]["status"] = "OVERDUE" if i > due_i else "REMINDED"
    elif kind == "return_in":
        o = p["o"]
        for no, exp, q in p["pieces"]:
            lot = add_lot(st, no, exp, q, "RETURN_IN", p["at"], "RETURN_OBLIGATION", o["row"]["id"])
            LOT_BY_ID[lot.id] = lot
            add("return_receipt", id=uid(), obligation_id=o["row"]["id"], drug_master_id=d["id"], lot_id=lot.id, qty_local=q, qty_base=q,
                received_by=user_of(st.h["code"], "WAREHOUSE_OFFICER"), received_at=mts(p["at"]))
        if o["remaining"] <= 0:
            o["row"]["status"] = "RETURNED"
            o["row"]["returned_at"] = mts(p["at"])
    elif kind == "pool_out":
        ln = p
        pieces = []
        lot = ln["lot"]
        q = min(ln["qty"], lot.qty)
        if q > 0:
            lot.qty -= q
            st.oh -= q
            if lot.qty <= 0:
                st.lots = [l for l in st.lots if l.qty > 0]
            led(ln["out_abs"], st, lot, -q, "POOL_TRANSFER_OUT", "ALLOCATION_LINE", ln["row"]["id"], user_of(st.h["code"], "WAREHOUSE_OFFICER"))
        ln["moved"] = q
        ln["row"]["qty"] = max(q, 1) if q > 0 else ln["row"]["qty"]
        recv = S[ln["recv"]]
        if q > 0:
            recv.ev[min(ND - 1, max(i + 1, ln["in_abs"] // 1440))].append(("pool_in", dict(ln=ln, _t=ln["in_abs"])))
    elif kind == "pool_in":
        ln = p["ln"]
        lot = ln["lot"]
        new = add_lot(st, lot.no, lot.exp, ln["moved"], "POOL_TRANSFER_IN", max(ln["in_abs"], abs_min(i)), "ALLOCATION_LINE", ln["row"]["id"])
        LOT_BY_ID[new.id] = new
        ln["plan"]["done"] += 1
        mk_transport("ALLOCATION_LINE", ln["row"]["id"], ln["origin_code"], st.h["code"], ln)
        if ln["plan"]["done"] >= ln["plan"]["n"]:
            ln["plan"]["row"]["status"] = "COMPLETED"
            ln["plan"]["item"]["status"] = "TRANSFERRED"
            ln["plan"]["item"]["note"] = "โอนผ่านแผน " + ln["plan"]["row"]["plan_no"] if ln["plan"]["row"].get("plan_no") else "โอนผ่านแผน"
        VALUE_REC[("F2_TRANSFER_THB", ln["origin_code"], DATES[min(i, ND - 1)].strftime("%Y-%m-01"))] += ln["moved"] * ln["price"]


ALERTS = []       # (alert_row, request_dict|None, i)
REQS = []


def mk_transport(ref_type, ref_id, from_code, to_code, t):
    tid = uid()
    L, A = t["loaded_abs"], t["arrive_abs"]
    add("transport_task", id=tid, ref_type=ref_type, ref_id=ref_id, from_hospital_id=HBY[from_code]["id"], to_hospital_id=HBY[to_code]["id"],
        status="RECEIVED", driver_id=user_of(from_code, "DRIVER"), cancel_requested_by="", cancel_consent_by="", loaded_at=mts(L),
        departed_at=mts(L + 15), arrived_at=mts(A), received_at=mts(A + 20), created_at=mts(L - 60), updated_at=mts(A + 20), version=5)
    seq = 0
    for st_, tm in (("LOADED", L), ("IN_TRANSIT", L + 15), ("ARRIVED", A), ("RECEIVED", A + 20)):
        seq += 1
        lag = rnd.randint(2, 240) if rnd.random() < 0.15 else rnd.randint(0, 2)     # ส่วนหนึ่ง sync ทีหลัง (offline-first)
        actor = user_of(from_code if st_ in ("LOADED", "IN_TRANSIT") else to_code, "DRIVER" if st_ != "RECEIVED" else "WAREHOUSE_OFFICER")
        add("transport_event", id=uid(), task_id=tid, client_event_id=uid(), seq=seq, to_status=st_, captured_at=mts(tm), received_at=mts(tm + lag),
            actor_id=actor, photo_keys="{}", applied="true", reject_reason="")


def check_alert(S, st, i, today_ord, d):
    if d.get("blood"):      # v1.2 ASM-47: เลือดไม่อยู่ใน F1 (ไม่พยากรณ์/ไม่แจ้งเตือน/ไม่ยืมนอกเหตุฉุกเฉิน)
        return
    m, sg = stats(st)
    if (m < 0.05 and not st.par) or i - st.last_alert < B_CFG["cooldown_days"] or i >= ND - 1:
        return
    L = min(d["lead"], 7)
    z = Z[st.ved]
    if d["pattern"] in ("regular", "erratic"):
        R = m * L + z * sg * math.sqrt(L)
    else:
        avg = d.get("avg_size", 1.5)
        R = max(m * L + z * math.sqrt(avg * m * L) + avg, st.par * 0.25)
    cover = sum(o["qty"] for o in st.open_orders if o["arr"] <= i + L) + sum(q for _, q in st.pending_in)
    short = R - st.oh - cover
    if short < max(1, 0.15 * R):
        return
    st.last_alert = i
    cover_days = st.oh / max(m, 0.01)
    if st.ved == "V":
        sev = "VERY_URGENT" if cover_days < 2 else ("URGENT" if cover_days < 7 else "NORMAL")
    else:
        sev = "URGENT" if cover_days < 2 and st.ved == "E" else "NORMAL"
    need = math.ceil(short)
    date = DATES[i]
    arow = add("stock_alert", id=uid(), hospital_id=st.h["id"], hospital_drug_id=st.hd, type="LOW_STOCK", severity=sev, status="OPEN",
               stock_qty=st.oh, incoming_qty=cover, days_cover=round(cover_days, 2), suggested_borrow_qty=need, forecast_result_id="", snoozed_until="",
               created_at=ts(date, 420 + rnd.randint(0, 30)), updated_at=ts(date, 480), version=1)
    req = None
    if rnd.random() < B_CFG["request_probability"][st.ved]:
        req = create_borrow(S, st, i, today_ord, d, need, sev, R, arow)
    ALERTS.append((arow, req, i))


def create_borrow(S, st, i, today_ord, d, need, sev, R, arow):
    cands = []
    for lc, ls in S.items():
        if ls is st or not ls.verified:
            continue
        if d["cold"] and not (ls.h["cold"] and st.h["cold"]):
            continue
        ml, _ = stats(ls)
        safety = max(math.ceil(ml * B_CFG["lender_safety_days"]), math.ceil(0.5 * ls.par))
        usable = sum(l.qty for l in ls.lots if l.exp - today_ord >= B_CFG["lot_min_remaining_days"])
        lend = int(usable - safety)
        if lend < 1:
            continue
        trans = travel(lc, st.h["code"]) + 45
        mst, _ = stats(st)
        window_days = max(0.25, st.oh / max(mst, 0.01))
        w = B_CFG["score_weights"]
        rc = RELI_CUM[lc]
        rel = (rc[1] + 2) / (rc[0] + 4)
        parts = dict(time=round(max(0.0, 1 - trans / (window_days * 1440)), 4), fulfill=round(min(1.0, lend / need), 4),
                     stock_safety=round(min(1.0, (ls.oh - lend) / max(ml * 30, 1)), 4), reliability=round(rel, 4))
        si = w["time"] * parts["time"] + w["fulfill"] * parts["fulfill"] + w["stock_safety"] * parts["stock_safety"] + w["reliability"] * parts["reliability"]
        cands.append((si, lc, ls, lend, trans, window_days, parts))
    if not cands:
        return None
    cands.sort(key=lambda x: -x[0])
    ladder = cands[: B_CFG["max_legs"]]
    stop = math.ceil(B_CFG["stop_ratio"].get(st.ved, 1.0) * need)
    t0 = abs_min(i, rnd.randint(480, 960))
    approved = t0 + rnd.randint(5, 30)
    sev_to = TO[sev]
    req_row = add("borrow_request", id=uid(), request_no="", borrower_hospital_id=st.h["id"], context="STOCK_ALERT" if rnd.random() > 0.1 else "MANUAL",
                  status="IN_PROGRESS", urgency=sev, stock_alert_id=arow["id"], incident_id="",
                  reason=f"สต็อก {d['name']} ต่ำกว่าระดับที่ต้องมี (R={R:.1f})", created_by=user_of(st.h["code"], "PHARMACIST"),
                  approved_by=user_of(st.h["code"], "PHARMACIST"), approved_at=mts(approved),
                  ladder=json.dumps([{"hospital": c[1], "score_si": round(c[0], 4), "parts": c[6]} for c in ladder], ensure_ascii=False),
                  first_round_qty=need, stop_threshold=stop, created_at=mts(t0), updated_at=mts(t0), version=1)
    item = add("borrow_request_item", id=uid(), request_id=req_row["id"], kind="DRUG", drug_master_id=d["id"], kit_type_id="", qty_requested=need, qty_fulfilled=0, r_value=round(R, 3))
    req = dict(row=req_row, item=item, received=0)
    REQS.append(req)
    cum, t_now, last_resp = 0, approved, approved
    for rank, (si, lc, ls, lend, trans, window_days, parts) in enumerate(ladder, 1):
        asked = need - cum
        p_acc = HBY[lc]["reliability"] * (0.6 + 0.4 * min(1.0, lend / asked))
        r = rnd.random()
        sent = t_now
        deadline = sent + sev_to
        reminded = sent + int(sev_to * 0.5)
        month = DATES[min(i, ND - 1)].strftime("%Y-%m-01")
        RELI[(lc, month)][0] += 1
        RELI_CUM[lc][0] += 1
        leg = add("borrow_leg", id=uid(), request_id=req_row["id"], lender_hospital_id=ls.h["id"], round_no=1, rank_in_ladder=rank, status="SENT",
                  score_si=round(si, 4), score_parts=json.dumps(parts), t_transit_min=round(trans, 1), window_max_days=round(window_days, 2), qty_asked=asked,
                  qty_accepted="", qty_received="", sent_at=mts(sent), deadline_at=mts(deadline), reminded_at="", responded_at="", responded_by="",
                  reject_reason="", message_text=f"ขอยืม {d['name']} {d['strength']} จำนวน {asked} {d['unit']}")
        if r < p_acc:
            resp = sent + int(min(sev_to * 0.9, rnd.expovariate(1 / (0.18 * sev_to))))
            qa = min(asked, lend)
            if lend >= asked and rnd.random() < 0.2:
                qa = max(1, math.ceil(asked * rnd.uniform(0.5, 0.85)))
            leg["status"] = "ACCEPTED" if qa >= asked else "PARTIAL"
            leg["qty_accepted"] = qa
            leg["responded_at"] = mts(resp)
            leg["responded_by"] = user_of(lc, "PHARMACIST")
            if resp - sent > sev_to * 0.5:
                leg["reminded_at"] = mts(reminded)
            RELI[(lc, month)][1] += 1
            RELI_CUM[lc][1] += 1
            cum += qa
            loaded = resp + rnd.randint(40, 150)
            arrive = loaded + int(trans * rnd.uniform(0.9, 1.3))
            rt = dict(row=leg, qa=qa, loaded_abs=loaded, arrive_abs=arrive, borrower=st.h["code"], lender=lc, req=req)
            li = min(ND - 1, max(loaded // 1440, i + 1))
            ls.ev[li].append(("lend", dict(rt, _t=loaded)))
            st.pending_in.append((leg["id"], qa))
            t_now = resp
            last_resp = resp
            if cum >= stop:
                break
        elif r < p_acc + (1 - p_acc) * 0.5:
            resp = sent + int(min(sev_to * 0.9, rnd.expovariate(1 / (0.15 * sev_to))))
            leg["status"] = "REJECTED"
            leg["responded_at"] = mts(resp)
            leg["responded_by"] = user_of(lc, "PHARMACIST")
            leg["reject_reason"] = rnd.choice(["สต็อกไม่เพียงพอ", "ต้องสำรองไว้ใช้ภายใน", "ล็อตที่มีไม่เหมาะสม"])
            t_now = resp
            last_resp = resp
        else:
            leg["status"] = "TIMED_OUT"
            leg["reminded_at"] = mts(reminded)
            t_now = deadline
            last_resp = deadline
    req_row["updated_at"] = mts(last_resp)
    if cum >= need * 0.98:
        req_row["status"] = "FULFILLED"
    elif cum > 0:
        req_row["status"] = "PARTIALLY_FULFILLED"
    else:
        req_row["status"] = "ESCALATED" if sev in ("VERY_URGENT", "URGENT") else "CLOSED_UNFULFILLED"
    req["accepted"] = cum
    return req


def overstock_check(st, i, date):
    if not st.verified or st.ved == "D" or i - st.last_over < 30:
        return
    m, _ = stats(st)
    if m < 0.05:
        return
    cd = st.oh / m
    if cd > 120 and st.oh * st.price >= 5000:
        st.last_over = i
        add("stock_alert", id=uid(), hospital_id=st.h["id"], hospital_drug_id=st.hd, type="OVERSTOCK", severity="NORMAL",
            status="OPEN" if i >= ND - 31 else "AUTO_CLOSED", stock_qty=st.oh, incoming_qty=st.incoming(), days_cover=round(cd, 2), suggested_borrow_qty="",
            forecast_result_id="", snoozed_until="", created_at=ts(date, 450), updated_at=ts(date, 450), version=1)


PLAN_ROWS = []
F2_REASON = defaultdict(int)


def f2_scan(S, i, today_ord, d):
    if d.get("blood"):      # v1.2 ASM-47: เลือดไม่อยู่ใน F2
        return
    date = DATES[i]
    for st in S.values():
        if not st.verified:
            continue
        m, _ = stats(st)
        ahead = 0
        for lot in list(st.lots):
            days_left = lot.exp - today_ord
            qty_ahead = ahead
            ahead += lot.qty
            if lot.id in st.f2_lots or lot.qty <= 0 or days_left > st.thr or days_left < 20:
                continue
            usable = max(0.0, m * days_left * 0.85 - qty_ahead)
            surplus = int(lot.qty - usable)
            val = surplus * st.price
            if surplus <= 0 or surplus / lot.qty < 0.2 or val < E_CFG["min_value_thb"]:
                continue
            st.f2_lots.add(lot.id)
            r = rnd.random()
            decided = user_of(st.h["code"], "PHARMACIST")
            created = abs_min(i, 480)
            decision_at = created + rnd.randint(60, 2000)
            item = add("near_expiry_item", id=uid(), hospital_id=st.h["id"], lot_id=lot.id, status="DETECTED", qty=surplus, days_left=days_left,
                       value_thb=round(val, 2), decided_by=decided, decided_at=mts(decision_at), note="", review_after="", created_at=mts(created),
                       updated_at=mts(decision_at), version=2)
            if r >= 0.62:
                if r < 0.90:
                    item["status"], item["note"] = "KEPT", "คาดว่าจะใช้ทันก่อนหมดอายุ"
                    item["review_after"] = (date + dt.timedelta(days=30)).isoformat()
                else:
                    item["status"], item["note"] = "DISMISSED", "มูลค่าน้อย/ไม่คุ้มดำเนินการ"
                continue
            item["status"] = "RELEASED_TO_POOL"
            pool = add("pool_entry", id=uid(), region_id=REGION_ID, near_expiry_item_id=item["id"], qty_available=surplus, released_at=mts(decision_at))
            # ---- หาผู้รับ ----
            cands = []
            for rc, rs in S.items():
                if rs is st or not rs.verified:
                    continue
                if d["cold"] and not (rs.h["cold"] and st.h["cold"]):
                    continue
                mr, _ = stats(rs)
                cap = int(mr * days_left * 0.9 - rs.oh - rs.incoming())
                if cap >= max(1, 0.05 * surplus):
                    cands.append((cap, rc, rs))
            cands.sort(key=lambda x: -x[0])
            remaining, lines = surplus, []
            for cap, rc, rs in cands:
                if remaining <= 0:
                    break
                q = min(cap, remaining)
                lines.append((rc, rs, q))
                remaining -= q
            allocated = surplus - remaining
            plan_row = add("allocation_plan", id=uid(), plan_no="", region_id=REGION_ID, pool_entry_id=pool["id"], status="DRAFT",
                           total_value_thb="", total_transport_cost_thb="", cost_ratio="", economical="", option_chosen="", agent_run_id="",
                           approval_deadline=mts(decision_at + 2880), created_at=mts(decision_at + 5), updated_at=mts(decision_at + 60), version=3)
            if not lines or allocated < 0.2 * surplus:
                F2_REASON["no_demand" if not lines else "low_alloc"] += 1
                plan_row.update(status="CANCELLED", total_value_thb=0, total_transport_cost_thb=0, cost_ratio="", economical="false",
                                option_chosen="HOLD" if val >= 8000 else "DONATE_OR_DISCARD")
                continue
            tot_val = allocated * st.price
            costs = []
            for rc, rs, q in lines:
                km = DIST[(st.h["code"], rc)]["km"]
                costs.append(E_CFG["transport_base_thb"] + E_CFG["transport_per_km_thb"] * km + (E_CFG["cold_chain_extra_thb"] if d["cold"] else 0))
            tot_cost = sum(costs)
            ratio = tot_cost / tot_val
            option = ""
            if ratio > E_CFG["max_cost_ratio"] and len(lines) >= 2:
                option = "MERGE_SHIPMENTS"
                costs = [c * 0.7 for c in costs]
                tot_cost = sum(costs)
                ratio = tot_cost / tot_val
            economical = ratio <= E_CFG["max_cost_ratio"]
            plan_row.update(total_value_thb=round(tot_val, 2), total_transport_cost_thb=round(tot_cost, 2), cost_ratio=round(ratio, 4),
                            economical=str(economical).lower(), option_chosen=option)
            if not economical:
                F2_REASON["uneconomical"] += 1
                plan_row.update(status="CANCELLED", option_chosen="HOLD" if tot_val >= 8000 else "DONATE_OR_DISCARD")
                continue
            # อนุมัติ: ต้นทาง + ผู้รับแต่ละแห่ง
            reject = rnd.random() < 0.06
            for k, hcode in enumerate([st.h["code"]] + [rc for rc, _, _ in lines]):
                dec = "REJECTED" if (reject and k == 1) else "APPROVED"
                add("plan_approval", id=uid(), plan_id=plan_row["id"], hospital_id=HBY[hcode]["id"], decision=dec, decided_by=user_of(hcode, "PHARMACIST"),
                    decided_at=mts(decision_at + rnd.randint(120, 1500)), comment="" if dec == "APPROVED" else "ไม่สามารถรับได้ในช่วงนี้")
            if reject:
                plan_row["status"] = "NEEDS_DISCUSSION"
                continue
            plan_row["status"] = "AUTO_APPROVED" if tot_val < 20000 else "APPROVED"
            item["status"] = "ALLOCATED"
            pool["qty_available"] = surplus - allocated
            plan = dict(row=plan_row, item=item, n=len(lines), done=0)
            PLAN_ROWS.append(plan)
            out_i = i + 2
            for (rc, rs, q), c in zip(lines, costs):
                lrow = add("allocation_line", id=uid(), plan_id=plan_row["id"], receiver_hospital_id=rs.h["id"], qty=q, value_thb=round(q * st.price, 2),
                           expected_use_before_expiry="true", distance_km=DIST[(st.h["code"], rc)]["km"], transport_cost_thb=round(c, 2), cold_chain=str(d["cold"]).lower())
                out_abs = out_i * 1440 + rnd.randint(540, 720)
                tr = DIST[(st.h["code"], rc)]["travel"]
                in_abs = out_abs + int(tr) + 90 + (60 if d["cold"] else 0)
                ln = dict(row=lrow, lot=lot, qty=q, recv=rc, out_abs=out_abs, in_abs=in_abs, plan=plan, price=st.price, origin_code=st.h["code"],
                          loaded_abs=out_abs - 30, arrive_abs=in_abs - 20, _t=out_abs)
                if out_i < ND:
                    st.ev[out_i].append(("pool_out", ln))
            # ขนส่งจะถูกสร้างตอนรับของจริง (ดู pool_in)


STATES = {}
import time as _t
_t0 = _t.time()
for k, d in enumerate(DRUGS):
    STATES[d["key"]] = process_drug(d)
    print(f"    {k+1:2d}/{len(DRUGS)} {d['key']:<22} {_t.time()-_t0:6.1f}s  ledger={len(LED):,} reqs={len(REQS)}", file=sys.stderr)
print("[4/6] simulation done", dict(F2_REASON), file=sys.stderr)

# --------------------------------------------------------------------------------------
# 6) หลังจำลอง: สรุปสถานะ, ตารางที่เหลือ, ตรวจความสอดคล้อง, เขียน CSV
# --------------------------------------------------------------------------------------
# 6.1 เลขที่เอกสารเรียงตามเวลา
# 6.4b ยืมเลือด PRC กรุ๊ป O (v1.2 ASM-47): เหตุฉุกเฉินเท่านั้น ระหว่าง รพ.ที่มีธนาคารเลือด คืนแบบทดแทนผ่านธนาคารเลือด
for eb in EMERG_BLOOD:
    hc, d, q = eb["hc"], eb["date"], int(eb["qty"])
    cands = sorted([c for c in HBY if c != hc and HBY[c]["blood_bank"]], key=lambda c: DIST[(c, hc)]["travel"])
    if not cands:
        continue
    t0 = abs_min((d - START).days, rnd.randint(480, 1200))
    bor = HBY[hc]
    rq = add("borrow_request", id=uid(), request_no="", borrower_hospital_id=bor["id"], context="EMERGENCY", status="FULFILLED", urgency="VERY_URGENT",
             stock_alert_id="", incident_id=eb["inc"], reason="ยืม PRC กรุ๊ป O (MCI) ต้องให้ธนาคารเลือดยืนยัน ABO/Rh และ cross-match", created_by=user_of(hc, "ER_STAFF"),
             approved_by=user_of(hc, "PHARMACIST"), approved_at=mts(t0 + 1),
             ladder=json.dumps([{"hospital": c, "t_transit_min": DIST[(c, hc)]["travel"]} for c in cands]), first_round_qty=q, stop_threshold=q,
             created_at=mts(t0), updated_at=mts(t0 + 90), version=1)
    add("borrow_request_item", id=uid(), request_id=rq["id"], kind="DRUG", drug_master_id=DBY["PRC_O"]["id"], kit_type_id="", qty_requested=q, qty_fulfilled=q, r_value="")
    for rank, c in enumerate(cands, 1):
        win = rank == 1
        leg = add("borrow_leg", id=uid(), request_id=rq["id"], lender_hospital_id=HBY[c]["id"], round_no=1, rank_in_ladder=rank,
                  status="RECEIVED" if win else "CANCELLED", score_si="", score_parts="", t_transit_min=DIST[(c, hc)]["travel"],
                  window_max_days="", qty_asked=q, qty_accepted=q if win else "", qty_received=q if win else "", sent_at=mts(t0 + 1),
                  deadline_at=mts(t0 + 4), reminded_at="", responded_at=mts(t0 + 2) if win else "", responded_by=user_of(c, "PHARMACIST") if win else "",
                  reject_reason="" if win else "ยกเลิก: มี รพ.อื่นยืนยันก่อน", message_text="ขอยืม PRC กรุ๊ป O ฉุกเฉิน (ต้องให้ธนาคารเลือดยืนยัน)")
        if win:
            mk_transport("BORROW_LEG", leg["id"], c, hc, dict(loaded_abs=t0 + 20, arrive_abs=t0 + 20 + int(DIST[(c, hc)]["travel"]) + 10))
            rd = rnd.randint(*CFG["blood"]["replace_days"])
            done = (d + dt.timedelta(days=rd)) < END
            due = d + dt.timedelta(days=B_CFG["return_days"])
            add("return_obligation", id=uid(), leg_id=leg["id"], debtor_hospital_id=bor["id"], creditor_hospital_id=HBY[c]["id"], drug_master_id=DBY["PRC_O"]["id"],
                kit_type_id="", qty=q, qty_returned=q if done else 0, return_mode="BLOOD_REPLACEMENT", due_date=due.isoformat(),
                status="RETURNED" if done else ("OVERDUE" if due < END else "OPEN"), returned_at=ts(d + dt.timedelta(days=rd), 600) if done else "", waived_reason="", waived_by="")
REQS_SORTED = sorted(TABLES["borrow_request"], key=lambda r: r["created_at"])
for n, r in enumerate(REQS_SORTED, 1):
    r["request_no"] = f"BR-{r['created_at'][:4]}-{n:06d}"
for n, r in enumerate(sorted(TABLES["allocation_plan"], key=lambda r: r["created_at"]), 1):
    r["plan_no"] = f"AP-{r['created_at'][:4]}-{n:05d}"
for p in PLAN_ROWS:
    if p["row"]["status"] == "COMPLETED":
        p["item"]["note"] = "โอนผ่านแผน " + p["row"]["plan_no"]

# 6.2 สถานะ alert (ต้องไม่ซ้อนกันเกิน 1 ใบที่ active ต่อรายการ)
for arow, req, i in ALERTS:
    old = i < ND - 20
    if req is not None:
        arow["status"] = ("RESOLVED" if req["row"]["status"] in ("FULFILLED", "PARTIALLY_FULFILLED") else "AUTO_CLOSED") if old else "LINKED_TO_REQUEST"
    else:
        arow["status"] = rnd.choice(["AUTO_CLOSED", "RESOLVED", "AUTO_CLOSED"]) if old else rnd.choice(["OPEN", "ACKNOWLEDGED"])
    if arow["status"] == "OPEN" and rnd.random() < 0.3 and not old:
        arow["status"], arow["snoozed_until"] = "SNOOZED", ts(DATES[-1] + dt.timedelta(days=3), 480)

# 6.3 หนี้ที่ค้างตอนจบช่วงข้อมูล
for ob in TABLES["return_obligation"]:
    if ob["status"] in ("OPEN", "REMINDED") and ob["kit_type_id"] == "":
        due = dt.date.fromisoformat(ob["due_date"])
        if due < END:
            ob["status"] = "OVERDUE"
        elif (due - END).days <= 7:
            ob["status"] = "REMINDED"

# 6.4 คำขอยืมชุดฉุกเฉิน F3 (ยืมทั้งเซ็ต, ใครยืนยันก่อนชนะ, timeout 3 นาที)
for er in EMERG_REQ:
    hc, d = er["hc"], er["date"]
    t0 = abs_min((d - START).days, rnd.randint(480, 1200))
    bor = HBY[hc]
    near = sorted([c for c in HBY if c != hc], key=lambda c: DIST[(c, hc)]["travel"])[:3]
    rq = add("borrow_request", id=uid(), request_no="", borrower_hospital_id=bor["id"], context="EMERGENCY", status="FULFILLED", urgency="VERY_URGENT",
             stock_alert_id="", incident_id=er["inc"], reason="ยืมชุดเวชภัณฑ์ฉุกเฉิน (MCI) ทั้งเซ็ต", created_by=user_of(hc, "ER_STAFF"),
             approved_by=user_of(hc, "PHARMACIST"), approved_at=mts(t0 + 1),
             ladder=json.dumps([{"hospital": c, "t_transit_min": DIST[(c, hc)]["travel"]} for c in near]), first_round_qty=sum(er["kits"].values()),
             stop_threshold=sum(er["kits"].values()), created_at=mts(t0), updated_at=mts(t0 + 90), version=1)
    items = {c: add("borrow_request_item", id=uid(), request_id=rq["id"], kind="KIT", drug_master_id="", kit_type_id=KIT[c]["id"], qty_requested=q, qty_fulfilled=q, r_value="") for c, q in er["kits"].items()}
    winner = near[0] if rnd.random() < 0.8 else near[1]
    tot = sum(er["kits"].values())
    for rank, c in enumerate(near, 1):
        win = c == winner
        timed_out = (not win) and rnd.random() < 0.3 and rank < near.index(winner) + 1
        leg = add("borrow_leg", id=uid(), request_id=rq["id"], lender_hospital_id=HBY[c]["id"], round_no=1, rank_in_ladder=rank,
                  status="RECEIVED" if win else ("TIMED_OUT" if timed_out else "CANCELLED"), score_si="", score_parts="", t_transit_min=DIST[(c, hc)]["travel"],
                  window_max_days="", qty_asked=tot, qty_accepted=tot if win else "", qty_received=tot if win else "", sent_at=mts(t0 + 1),
                  deadline_at=mts(t0 + 4), reminded_at="", responded_at=mts(t0 + 2) if win else "", responded_by=user_of(c, "PHARMACIST") if win else "",
                  reject_reason="" if win else ("ไม่ตอบภายใน 3 นาที" if timed_out else "ยกเลิก: มี รพ.อื่นยืนยันก่อน"), message_text="ขอยืมชุดฉุกเฉินทั้งเซ็ต (first-confirm-wins)")
        if win:
            mk_transport("BORROW_LEG", leg["id"], c, hc, dict(loaded_abs=t0 + 20, arrive_abs=t0 + 20 + int(DIST[(c, hc)]["travel"]) + 10))
            for kc, q in er["kits"].items():
                done = (d + dt.timedelta(days=rnd.randint(8, 25))) < END
                due = d + dt.timedelta(days=B_CFG["return_days"])
                add("return_obligation", id=uid(), leg_id=leg["id"], debtor_hospital_id=bor["id"], creditor_hospital_id=HBY[c]["id"], drug_master_id="",
                    kit_type_id=KIT[kc]["id"], qty=q, qty_returned=q if done else 0, return_mode="IN_KIND", due_date=due.isoformat(),
                    status="RETURNED" if done else ("OVERDUE" if due < END else "OPEN"), returned_at=ts(d + dt.timedelta(days=12), 600) if done else "",
                    waived_reason="", waived_by="")
REQS_SORTED = sorted(TABLES["borrow_request"], key=lambda r: r["created_at"])
for n, r in enumerate(REQS_SORTED, 1):
    r["request_no"] = f"BR-{r['created_at'][:4]}-{n:06d}"

# 6.5 stock_lot / ledger / snapshot / usage
MFR_NAMES = [m[1] for m in MFR]
bal = defaultdict(int)
for e in LED:
    bal[e[3]] += e[4]
bad = [(l.no, l.qty, bal[l.id]) for l in LOTS_ALL if l.qty != bal[l.id]]
neg = [l for l in LOTS_ALL if l.qty < 0]
_ex = defaultdict(float)
for _hc, _dk, _i, _q, _v in EXPIRED:
    _ex[_dk] += _v
print("   expired value top:", [(k, round(v / 1e6, 2)) for k, v in sorted(_ex.items(), key=lambda x: -x[1])[:6]], file=sys.stderr)
print(f"[5/6] lots={len(LOTS_ALL):,} ledger={len(LED):,} balance mismatches={len(bad)} negative lots={len(neg)}", file=sys.stderr)
if bad[:3]:
    print("   mismatch sample:", bad[:3], file=sys.stderr)
for l in LOTS_ALL:
    st = l.st
    add("stock_lot", id=l.id, hospital_id=st.h["id"], hospital_drug_id=st.hd, lot_no=l.no, expiry_date=(dt.date.fromordinal(l.exp)).isoformat(),
        manufacturer=MFR_NAMES[zlib.crc32(l.no.encode()) % 3], pack_size_base_units=st.pack, qty_on_hand=l.qty, qty_held=0, updated_at=ts(END, 1200), version=1)

# 6.6 ABC (สะสมมูลค่าการใช้ 12 เดือนล่าสุดต่อ รพ.)
for h in HOSP:
    items = sorted([(USAGE_VALUE.get((h["code"], d["key"]), 0), d["key"]) for d in DRUGS if (h["code"], d["key"]) in HD], reverse=True)
    tot = sum(v for v, _ in items) or 1
    cum = 0
    for v, k in items:
        cum += v / tot
        HD[(h["code"], k)]["row"]["abc"] = "A" if cum - v / tot < 0.70 else ("B" if cum - v / tot < 0.90 else "C")

# 6.7 repeat_expiry_flag (12 เดือนล่าสุด)
agg = defaultdict(lambda: [0, 0.0])
for hc, dk, i, q, v in EXPIRED:
    if i >= ND - 365:
        agg[(hc, dk)][0] += 1
        agg[(hc, dk)][1] += v
for (hc, dk), (n, v) in agg.items():
    if DBY[dk].get("blood"):
        continue
    if n >= 2 or v >= 10000:
        lvl = "RECOMMEND" if (n >= 3 or v >= 30000) else "WATCH"
        add("repeat_expiry_flag", id=uid(), hospital_id=HBY[hc]["id"], drug_master_id=DBY[dk]["id"], level=lvl, lots_12m=n, value_12m_thb=round(v, 2),
            suggestion=json.dumps({"action": "ลดระดับสั่งซื้อ/ลดรอบสั่ง" if lvl == "RECOMMEND" else "เฝ้าระวัง", "suggested_order_cycle_days": 14}, ensure_ascii=False) if lvl == "RECOMMEND" else "",
            dismissed_until="", created_at=ts(END, 480))

# 6.8 reliability_stat / value_record
for (lc, month), (rc, ok) in sorted(RELI.items()):
    add("reliability_stat", lender_hospital_id=HBY[lc]["id"], month=month, requests_received=rc, accepted_on_time=ok)
for (metric, hc, ym), v in sorted(VALUE_REC.items()):
    add("value_record", id=uid(), hospital_id=HBY[hc]["id"], region_id=REGION_ID, metric=metric, period=ym, value_thb=round(v, 2), value_qty="", ref_type="", ref_id="", detail="", created_at=ts(END, 480))
for (hc, ym), n in sorted(STOCKOUT.items()):
    add("value_record", id=uid(), hospital_id=HBY[hc]["id"], region_id=REGION_ID, metric="STOCKOUT_ITEM_DAYS", period=ym, value_thb="", value_qty=n, ref_type="", ref_id="", detail="", created_at=ts(END, 480))

# 6.9 kit_stock / regional warehouse / context_signal / config / imports / report_definition
for h in HOSP:
    for code in KIT:
        add("kit_stock", hospital_id=h["id"], kit_type_id=KIT[code]["id"], qty_ready=KIT_READY[(h["code"], code)], qty_held=0, updated_at=ts(END, 1200))
for d in DRUGS:
    daily = sum(stats(s)[0] for s in STATES[d["key"]].values())
    add("regional_warehouse_stock", region_id=REGION_ID, drug_master_id=d["id"], qty=int(daily * 20), updated_at=ts(END, 1200))


def sig(stype, payload, a, b, src="MOCK_CONFIG"):
    add("context_signal", id=uid(), region_id=REGION_ID, signal_type=stype, payload=json.dumps(payload, ensure_ascii=False), valid_from=a.isoformat(),
        valid_to=b.isoformat() if b else "", source=src, approved_by=REGION_ADMIN, created_at=ts(a, 480))


for p in CFG["covid_periods"]:
    if p["name"].startswith("baseline"):
        continue
    sig("COVID_PERIOD", {k: p[k] for k in p if k not in ("start", "end")}, p["start"], p["end"])
for y in range(START.year, END.year + 1):
    for typ_, m in (("INFLUENZA_PEAK", 9), ("DENGUE_PEAK", 7)):
        a = dt.date(y, m, 1)
        if START <= a <= END:
            sig(typ_, {"year_multiplier": (CFG["flu_year_multiplier"] if typ_ == "INFLUENZA_PEAK" else CFG["dengue_year_multiplier"])[y]}, a, dt.date(y, m, 28))
    sig("PM25_SEASON", {"months": CFG["pm25"]["months"]}, dt.date(y, 1, 1), dt.date(y, 3, 31)) if START <= dt.date(y, 1, 1) <= END else None
    for nm, (a, b) in {"songkran": (dt.date(y, 4, 11), dt.date(y, 4, 17)), "newyear": (dt.date(y, 12, 29), dt.date(y + 1, 1, 4))}.items():
        if START <= a <= END:
            sig("SEVEN_DANGEROUS_DAYS", {"festival": nm}, a, b)
    if START <= dt.date(y, 8, 1) <= END:
        sig("FISCAL_YEAR_END_ORDERING", {"order_factor": CFG["fiscal_order_factor"][8]}, dt.date(y, 8, 1), dt.date(y, 9, 30))
for ev in CFG["flood_events"]:
    sig("FLOOD", {"hospital": ev["hospital"], "note": ev["note"]}, ev["start"], ev["start"] + dt.timedelta(days=42))


def flat(prefix, o, out):
    if isinstance(o, dict) and o:
        for k, v in o.items():
            flat(f"{prefix}.{k}" if prefix else str(k), v, out)
    else:
        out[prefix] = o


_defaults = {}
_cfg_path = ROOT / "config" / "config-defaults.yaml"   # copy of the spec's config-defaults.yaml (kept in the repo so the output is reproducible)
if not _cfg_path.exists():
    sys.exit(f"missing {_cfg_path}: copy config-defaults.yaml from the spec into db/mock/config/")
flat("", yaml.safe_load(open(_cfg_path, encoding="utf-8")), _defaults)
for k, v in _defaults.items():
    add("config_setting", key=k, scope="GLOBAL", value=json.dumps(v, ensure_ascii=False), description="ค่าเริ่มต้นจาก config-defaults.yaml", updated_by="", updated_at=ts(START - dt.timedelta(days=5)))
for h in HOSP:
    add("hospital_import", id=uid(), hospital_id=h["id"], kind="DRUG_LIST", file_key=f"imports/{h['code']}/drug_list_{(START - dt.timedelta(days=12)):%Y-%m}.csv", rows_total=len([1 for k in HD if k[0] == h["code"]]),
        rows_ok=len([1 for k in HD if k[0] == h["code"]]), rows_error=0, errors="", created_by=DATA_ADMIN, created_at=ts(START - dt.timedelta(days=12)))
    n_items = len([1 for k in HD if k[0] == h["code"]])
    for y in range(START.year, END.year + 1):
        for m in range(1, 13):
            a = dt.date(y, m, 1)
            if a < START or a > END:
                continue
            dim = (dt.date(y + (m == 12), m % 12 + 1, 1) - a).days
            err = int(rng.poisson(0.6))
            add("hospital_import", id=uid(), hospital_id=h["id"], kind="USAGE", file_key=f"imports/{h['code']}/usage_{a:%Y-%m}.csv", rows_total=n_items * dim,
                rows_ok=n_items * dim - err, rows_error=err, errors=json.dumps([{"row": 1, "msg": "unit mismatch"}]) if err else "", created_by=user_of(h["code"], "PHARMACIST"),
                created_at=ts(a + dt.timedelta(days=dim), 120))
for rid, nm in (("stock_overview", "ภาพรวมสต็อกและวันที่ครอบคลุม"), ("expiry_waste", "มูลค่ายาหมดอายุต่อเดือน"), ("borrow_activity", "การยืม-คืนระหว่างโรงพยาบาล")):
    add("report_definition", id=rid, name=nm, description="รายงานตัวอย่าง (mock)", query_spec=json.dumps({"source": rid}), roles="{HOSPITAL_ADMIN,PHARMACIST,REGION_ADMIN}")


# 6.10 เขียน CSV
def write_table(name, rows, cols=None):
    if not rows:
        return 0
    cols = cols or list(rows[0].keys())
    with open(OUT / f"{name}.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(cols)
        for r in rows:
            w.writerow([r[c] if not isinstance(r[c], float) else (repr(round(r[c], 6))) for c in cols])
    return len(rows)


counts = {}
SKIP = {"app_user_role_history"}
for name, rows in TABLES.items():
    counts[name] = write_table(name, rows)
LED.sort(key=lambda e: (e[0], e[1]))
with open(OUT / "stock_ledger.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f, lineterminator="\n")
    w.writerow(["hospital_id", "lot_id", "delta", "reason", "ref_type", "ref_id", "occurred_at", "actor_id"])
    for am, _, hid, lid, delta, reason, rt, rid, actor in LED:
        w.writerow([hid, lid, delta, reason, rt, rid, mts(am), actor])
counts["stock_ledger"] = len(LED)
with open(OUT / "stock_snapshot.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f, lineterminator="\n")
    w.writerow(["hospital_id", "hospital_drug_id", "snap_date", "qty_on_hand", "qty_incoming", "qty_held"])
    for hid, hd, dte, oh, inc in SNAP:
        w.writerow([hid, hd, dte, oh, inc, 0])
counts["stock_snapshot"] = len(SNAP)
with open(OUT / "usage_daily.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f, lineterminator="\n")
    w.writerow(["hospital_id", "hospital_drug_id", "usage_date", "qty_used"])
    w.writerows(USAGE)
counts["usage_daily"] = len(USAGE)
import enrich_v15   # v1.5 columns/tables (own random stream: v1.4 values are unchanged)
counts.update(enrich_v15.run(OUT, CFG))
json.dump(counts, open(OUT / "_row_counts.json", "w"), indent=1)
print("[6/6] wrote", len(counts), "CSV files;", sum(counts.values()), "rows", file=sys.stderr)

# --------------------------------------------------------------------------------------
# 7) load.sql  (โหลดเข้า PostgreSQL ด้วย \copy ตามลำดับ FK)
# --------------------------------------------------------------------------------------
LOAD_ORDER = ["region", "network", "hospital", "vehicle", "app_user", "app_user_role", "login_event", "hospital_distance", "config_setting", "drug_master", "tmt_reference",
              "hospital_drug", "drug_mapping", "mapping_candidate", "drug_mapping_history", "hospital_import", "stock_lot", "stock_ledger",
              "stock_snapshot", "usage_daily", "incoming_order", "context_signal", "stock_alert", "kit_type", "kit_component", "kit_recipe",
              "incident_extra_rule", "incident", "incident_patient_count", "emergency_plan", "kit_pack_task", "incident_usage", "borrow_request",
              "borrow_request_item", "borrow_leg", "borrow_leg_lot", "return_obligation", "return_receipt", "reliability_stat", "near_expiry_item",
              "pool_entry", "allocation_plan", "allocation_line", "plan_approval", "transport_task", "transport_event", "repeat_expiry_flag",
              "kit_stock", "regional_warehouse_stock", "value_record", "report_definition"]
with open(ROOT / "load.sql", "w", encoding="utf-8") as f:
    f.write("-- โหลดข้อมูล mock เข้า PostgreSQL (รันหลัง schema.sql)   ใช้:  psql -d <db> -f load.sql   (ให้รันจากโฟลเดอร์ csv/)\n")
    f.write("-- หมายเหตุ: app_user_role_history และแถว role หลักใน app_user_role ถูกสร้างอัตโนมัติจาก trigger ตอนโหลด app_user (app_user_role.csv มีเฉพาะ role เพิ่มเติม); audit_log/forecast_*/agent_* ปล่อยว่างให้ระบบสร้างเอง\n")
    f.write("\\set ON_ERROR_STOP on\nSET session_replication_role = origin;\n")
    for t in LOAD_ORDER:
        p = OUT / f"{t}.csv"
        if not p.exists():
            f.write(f"-- (ไม่มีข้อมูล) {t}\n")
            continue
        cols = open(p, encoding="utf-8").readline().strip()
        f.write(f"\\copy {t} ({cols}) FROM '{t}.csv' WITH (FORMAT csv, HEADER true)\n")
    f.write("ANALYZE;\n")
print("[7/7] load.sql written", file=sys.stderr)
