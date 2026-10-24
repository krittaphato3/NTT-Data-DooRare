import { useEffect, useState } from 'react';
import { getHospitalDrugs, getKitTypes } from '../../../services/catalogApi';
import type { ApiHospitalDrug } from '../../../services/catalogApi';

interface Props {
  /** Kit codes / drug master ids already in the plan (they are edited in the tables above, not added twice). */
  kitsInPlan: string[];
  extrasInPlan: string[];
  disabled: boolean;
  onAddKit: (code: string, qty: number, name: string) => void;
  onAddDrug: (drugMasterId: string, qty: number, name: string) => void;
}

/**
 * BR-F3-008: staff add a kit or an item the rules did not put in the plan. Items come from the hospital's own drug list (a borrowed
 * item must be listed to enter stock); the server recomputes the plan with the addition (`setKits` / `setExtras`).
 */
export function AddPlanItem({ kitsInPlan, extrasInPlan, disabled, onAddKit, onAddDrug }: Props) {
  const [kind, setKind] = useState<'drug' | 'kit'>('drug');
  const [q, setQ] = useState('');
  const [drugs, setDrugs] = useState<ApiHospitalDrug[]>([]);
  const [kits, setKits] = useState<{ code: string; name: string }[]>([]);
  const [picked, setPicked] = useState('');
  const [qty, setQty] = useState('');

  useEffect(() => {
    getKitTypes()
      .then((r) => setKits(r.items.filter((k) => k.active).map((k) => ({ code: k.code, name: k.name }))))
      .catch(() => setKits([]));
  }, []);
  useEffect(() => {
    if (kind !== 'drug' || q.trim().length < 2) return setDrugs([]);
    const t = setTimeout(() => {
      getHospitalDrugs({ q: q.trim(), limit: 30 })
        .then((r) => setDrugs(r.items.filter((d) => d.active && d.master)))
        .catch(() => setDrugs([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, kind]);

  const kitOptions = kits.filter((k) => !kitsInPlan.includes(k.code));
  const drugOptions = drugs.filter((d) => !extrasInPlan.includes(d.master!.id));
  const n = Number(qty);
  const valid = Boolean(picked) && Number.isInteger(n) && n > 0;
  const name = kind === 'kit' ? kits.find((k) => k.code === picked)?.name : drugs.find((d) => d.master?.id === picked)?.localName;

  const add = () => {
    if (!valid) return;
    if (kind === 'kit') onAddKit(picked, n, name ?? picked);
    else onAddDrug(picked, n, name ?? picked);
    setPicked('');
    setQty('');
    setQ('');
  };

  const field = { height: 34, border: '1px solid #cbd5e1', borderRadius: 6, padding: '0 8px', fontFamily: 'inherit', fontSize: 13 } as const;
  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f2a5c', marginBottom: 4 }}>
        เพิ่มรายการเอง <span style={{ fontSize: 12, fontWeight: 400, color: '#94a3b8' }}>BR-F3-008 · ระบบคำนวณแผนใหม่ทันทีหลังเพิ่ม</span>
      </div>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>เพิ่มชุดยาหรือยา/เวชภัณฑ์ที่กฎไม่ได้ใส่มา · ใส่จำนวนที่คาดว่าต้องใช้ ระบบตรวจสต็อกและคิดจำนวนที่ต้องยืมให้</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select aria-label="ประเภทรายการ" value={kind} disabled={disabled} onChange={(e) => { setKind(e.target.value as 'drug' | 'kit'); setPicked(''); }} style={field}>
          <option value="drug">ยา / เวชภัณฑ์</option>
          <option value="kit">ชุดยา (Preset Kit)</option>
        </select>
        {kind === 'drug' && (
          <input aria-label="ค้นหายา" placeholder="ค้นหาชื่อยา / รหัส (อย่างน้อย 2 ตัวอักษร)" value={q} disabled={disabled} onChange={(e) => setQ(e.target.value)} style={{ ...field, flex: '1 1 200px' }} />
        )}
        <select aria-label="รายการที่จะเพิ่ม" value={picked} disabled={disabled} onChange={(e) => setPicked(e.target.value)} style={{ ...field, flex: '2 1 240px', maxWidth: '100%' }}>
          <option value="">{kind === 'kit' ? `เลือกชุดยา (${kitOptions.length})` : q.trim().length < 2 ? 'พิมพ์ค้นหาก่อน' : `เลือกยา (${drugOptions.length} รายการ)`}</option>
          {kind === 'kit'
            ? kitOptions.map((k) => <option key={k.code} value={k.code}>{k.name} ({k.code})</option>)
            : drugOptions.map((d) => <option key={d.id} value={d.master!.id}>[{d.ved}] {d.localName} ({d.master!.baseUnit})</option>)}
        </select>
        <input aria-label="จำนวนที่คาดว่าต้องใช้" type="number" min={1} placeholder="จำนวน" value={qty} disabled={disabled} onChange={(e) => setQty(e.target.value)} style={{ ...field, width: 90 }} />
        <button type="button" className="btn btn-p btn-sm" disabled={disabled || !valid} onClick={add}>+ เพิ่มเข้าแผน</button>
      </div>
    </div>
  );
}
