#!/usr/bin/env python3
"""สร้าง tmt_real.json จากไฟล์ TMT Release (สมสท.) : แมปยา 37 รายการ -> รหัส TMT จริงทุกระดับ
ใช้:  python3 tools/build_tmt.py <โฟลเดอร์ TMTRFyyyymmdd_BONUS>   (ต้องมี pandas + xlrd)
ผลลัพธ์: config/tmt_real.json  (รวมเข้าชุด mock แล้ว ไม่ต้องรันซ้ำถ้าไม่เปลี่ยนรอบ TMT)"""
import json, sys, re
from pathlib import Path
import pandas as pd

BONUS = Path(sys.argv[1])
REL = "20261005"
OUT = Path(__file__).resolve().parent.parent / "config" / "tmt_real.json"

# key -> (GP id จริง, ชื่อแสดง, ความแรง, รูปแบบ)  ; ไม่อยู่ในรายการนี้ = ไม่มีใน TMT (ไม่ใช่ยา / เลือด)
MAP = {
 "PARACETAMOL_500":   ("747132",  "Paracetamol", "500 mg", "tablet"),
 "PARACETAMOL_SYRUP": ("747533",  "Paracetamol", "120 mg/5 mL", "syrup"),
 "AMLODIPINE_5":      ("210476",  "Amlodipine", "5 mg", "tablet"),
 "METFORMIN_500":     ("231927",  "Metformin hydrochloride", "500 mg", "tablet"),
 "SALBUTAMOL_MDI":    ("666141",  "Salbutamol", "100 mcg/1 dose", "pressurised inhalation, suspension"),
 "SALBUTAMOL_NEB":    ("848856",  "Salbutamol", "2.5 mg/2.5 mL", "nebuliser solution"),
 "OSELTAMIVIR":       ("339390",  "Oseltamivir", "75 mg", "capsule, hard"),
 "FAVIPIRAVIR":       ("1140915", "Favipiravir", "200 mg", "film-coated tablet"),
 "REMDESIVIR":        ("1242065", "Remdesivir", "100 mg", "concentrate for solution for infusion"),
 "DEXAMETHASONE_INJ": ("555722",  "Dexamethasone", "4 mg/1 mL", "solution for injection"),
 "CEFTRIAXONE_1G":    ("694507",  "Ceftriaxone", "1 g", "powder for solution for injection/infusion"),
 "DOXYCYCLINE_100":   ("226408",  "Doxycycline", "100 mg", "capsule, hard"),
 "NSS_1000":          ("698197",  "Sodium chloride", "900 mg/100 mL (1000 mL)", "solution for infusion"),
 "RL_1000":           ("578054",  "Ringer's lactate", "1000 mL", "solution for infusion"),
 "ORS":               ("707563",  "Oral rehydration salts", "sachet", "oral powder"),
 "ADRENALINE_1MG":    ("810845",  "Epinephrine (adrenaline)", "1 mg/1 mL", "solution for injection"),
 "ATROPINE_06":       ("770061",  "Atropine sulfate", "600 mcg/1 mL", "solution for injection"),
 "TXA_250":           ("763354",  "Tranexamic acid", "250 mg/5 mL", "solution for injection"),
 "MORPHINE_10":       ("535897",  "Morphine sulfate", "10 mg/1 mL", "solution for injection"),
 "FENTANYL_100":      ("767330",  "Fentanyl", "100 mcg/2 mL", "solution for injection"),
 "KETAMINE_500":      ("533794",  "Ketamine", "500 mg/10 mL", "solution for injection"),
 "SUCCINYLCHOLINE":   ("768789",  "Suxamethonium chloride (succinylcholine)", "500 mg/10 mL", "solution for injection"),
 "INSULIN":           ("654828",  "Insulin human", "100 iu/1 mL", "solution for injection"),
 "DT_VACCINE":        ("670609",  "Diphtheria + tetanus toxoids (dT)", "2 iu + 20 iu/0.5 mL", "suspension for injection"),
 "INFLUENZA_VACCINE": ("1130328", "Influenza vaccine (quadrivalent)", "0.5 mL", "suspension for injection"),
 "RABIES_VACCINE":    ("749225",  "Purified duck embryo rabies vaccine", "2.5 iu/1 mL", "solution for injection"),
 "EQUINE_RIG":        ("762650",  "Equine rabies immunoglobulin", "1000 iu/5 mL", "solution for injection"),
 "ANTIVENOM_COBRA":   ("762264",  "Cobra antivenin", "600 mcg/1 mL", "powder and solvent for solution for injection"),
 "PRALIDOXIME_1G":    ("697750",  "Pralidoxime", "1 g", "powder for solution for injection/infusion"),
 "ALCOHOL_GEL":       ("816410",  "Ethyl alcohol", "70 mL/100 mL", "gel"),
}

def rd(sub, name):
    return pd.read_excel(BONUS / sub / f"{name}{REL}.xls", dtype=str)

C = {k: rd("Concept", k) for k in ("SUBS", "VTM", "GP", "GPU", "GPP", "TP", "TPU", "TPP")}
R = {k: rd("Relationship", k) for k in ("SUBStoVTM", "VTMtoGP", "GPtoGPU", "GPUtoGPP", "GPtoTP", "TPtoTPU", "TPUtoTPP")}
NAME = {}
for lvl, df in C.items():
    NAME[lvl] = dict(zip(df.iloc[:, 0], df["FSN"]))
MFR = dict(zip(C["TP"].iloc[:, 0], C["TP"]["MANUFACTURER"]))
def clean(s): return re.sub(r"\s*\((SUBS|VTM|GP|GPU|GPP|TP|TPU|TPP)\)\s*$", "", s)

def kids(rel, a, b, x): return R[rel][R[rel][a] == x][b].tolist()
def parents(rel, a, b, x): return R[rel][R[rel][b] == x][a].tolist()

out = {}
for key, (gp, nm, st, fm) in MAP.items():
    assert gp in NAME["GP"], (key, gp)
    vtm = parents("VTMtoGP", "VTMID", "GPID", gp)
    subs = [s for v in vtm for s in parents("SUBStoVTM", "SUBSID", "VTMID", v)]
    gpu = kids("GPtoGPU", "GPID", "GPUID", gp)
    gpp = [p for u in gpu for p in kids("GPUtoGPP", "GPUID", "GPPID", u)]
    tps = []
    for tp in kids("GPtoTP", "GPID", "TPID", gp):
        tpus = kids("TPtoTPU", "TPID", "TPUID", tp)
        if not tpus: continue
        tpps = [p for u in tpus for p in kids("TPUtoTPP", "TPUID", "TPPID", u)]
        tps.append((len(tpps) > 0, tp, tpus[0], tpps[:1]))
    tps.sort(key=lambda t: (not t[0], int(t[1])))
    pick = tps[:3]
    out[key] = dict(
        real=True, gp=gp, gp_name=clean(NAME["GP"][gp]), disp=dict(name=nm, strength=st, form=fm),
        subs=[dict(id=s, name=clean(NAME["SUBS"][s])) for s in subs[:3]],
        vtm=[dict(id=v, name=clean(NAME["VTM"][v])) for v in vtm[:1]],
        gpu=dict(id=gpu[0], name=clean(NAME["GPU"][gpu[0]])) if gpu else None,
        gpp=[dict(id=p, name=clean(NAME["GPP"][p])) for p in gpp[:1]],
        tps=[dict(tp=dict(id=tp, name=clean(NAME["TP"][tp]), mfr=MFR.get(tp, "")), tpu=dict(id=tpu, name=clean(NAME["TPU"][tpu])),
                  tpp=[dict(id=p, name=clean(NAME["TPP"][p])) for p in tpps]) for _, tp, tpu, tpps in pick],
        n_tp_total=len(tps))
    flag = "" if len(pick) >= 2 and gpu else "  <-- ข้อมูลไม่ครบ"
    print(f"{key:20s} GP {gp:>8s} subs={len(subs)} gpu={len(gpu)} gpp={len(gpp)} tp={len(tps)}{flag}")
OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
print("เขียน", OUT)
