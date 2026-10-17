import { useState } from 'react';
import { Icon } from '../../../components/common/icons';
import type { TransportStatus } from '../data/transport';

export interface ProxyEntry {
  to: Extract<TransportStatus, 'IN_TRANSIT' | 'ARRIVED'>;
  reason: string;
}

const NEXT: Partial<Record<TransportStatus, { to: ProxyEntry['to']; label: string }>> = {
  LOADED: { to: 'IN_TRANSIT', label: 'ออกเดินทางแทนคนขับ' },
  IN_TRANSIT: { to: 'ARRIVED', label: 'ถึงปลายทางแทนคนขับ' },
};

interface ProxyStatusPanelProps {
  status: TransportStatus;
  onSubmit: (to: ProxyEntry['to'], reason: string) => void;
}

/**
 * WH may set IN_TRANSIT / ARRIVED on behalf of the driver only when necessary (e.g. the driver
 * cannot sync) and must give a reason that goes to the audit log (RBAC §4.4 ◐).
 */
export function ProxyStatusPanel({ status, onSubmit }: ProxyStatusPanelProps) {
  const next = NEXT[status];
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  if (!next) return null;
  const ok = reason.trim().length >= 5;
  return (
    <section aria-label="บันทึกสถานะแทนคนขับ" className="proxy-box">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <Icon name="tri" className="ic14" style={{ marginTop: 3, color: '#92400E' }} />
        <div style={{ fontSize: 13, lineHeight: '20px', color: '#0F2A5C' }}>
          <b style={{ fontWeight: 600 }}>บันทึกแทนคนขับ (เฉพาะกรณีจำเป็น)</b>
          <br />
          ใช้เมื่อคนขับ sync สถานะไม่ได้ · ต้องระบุเหตุผล และระบบบันทึกลง audit log
        </div>
      </div>
      {!open ? (
        <div>
          <button className="btn btn-s btn-sm" onClick={() => setOpen(true)}>
            {next.label}
          </button>
        </div>
      ) : (
        <>
          <textarea className="inp" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เหตุผล เช่น คนขับไม่มีสัญญาณ ซิงก์ไม่ได้ (บังคับ)" aria-label="เหตุผลที่บันทึกแทนคนขับ" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              className="btn btn-p btn-sm"
              disabled={!ok}
              onClick={() => {
                onSubmit(next.to, reason.trim());
                setOpen(false);
                setReason('');
              }}
            >
              ยืนยัน · {next.label}
            </button>
            <button className="btn btn-g btn-sm" onClick={() => setOpen(false)}>
              ยกเลิก
            </button>
          </div>
        </>
      )}
    </section>
  );
}
