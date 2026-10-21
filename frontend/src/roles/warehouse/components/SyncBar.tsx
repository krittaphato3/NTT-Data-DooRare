import { Icon } from '../../../components/common/icons';
import type { IconName } from '../../../components/common/icons';

interface SyncBarProps {
  online: boolean;
  /** Items captured offline and not yet uploaded. */
  queued: number;
  onSync: () => void;
}

/** Offline / sync status bar (FR-F2a-016). */
export function SyncBar({ online, queued, onSync }: SyncBarProps) {
  let v: { title: string; text: string; icon: IconName; bg: string; border: string; fg: string; n: number; btn: string; can: boolean };
  if (!online) {
    v = { title: 'ออฟไลน์', text: 'ไม่มีสัญญาณ · การกดขั้นตอนและรูปถ่ายถูกบันทึกในเครื่อง และจะซิงก์อัตโนมัติเมื่อกลับมาออนไลน์', icon: 'wifiOff', bg: '#FFFBEB', border: '#FDE68A', fg: '#92400E', n: queued + 1, btn: 'รอสัญญาณ…', can: false };
  } else if (queued > 0) {
    v = { title: 'ออนไลน์', text: 'มีรายการที่บันทึกตอนไม่มีสัญญาณยังไม่ถูกส่งขึ้นระบบ (รูปขึ้นรถ TR-2026-000341 ถ่าย 16:29)', icon: 'sync', bg: '#FFFFFF', border: '#E2E8F0', fg: '#1D4ED8', n: queued, btn: 'ซิงก์ตอนนี้', can: true };
  } else {
    v = { title: 'ซิงก์ครบแล้ว', text: 'ทุกขั้นตอนและรูปถ่ายอยู่บนระบบ', icon: 'checkc', bg: '#F0FDF4', border: '#BBF7D0', fg: '#166534', n: 0, btn: 'ซิงก์อีกครั้ง', can: true };
  }
  return (
    <section role="status" aria-live="polite" className="syncbar" style={{ background: v.bg, borderColor: v.border }}>
      <span className="syncbar-icon" style={{ color: v.fg }}>
        <Icon name={v.icon} />
      </span>
      <span className="syncbar-text">
        <b>{v.title}</b> · {v.text}
      </span>
      {v.n > 0 && (
        <span className="badge t-amber" style={{ fontWeight: 600 }}>
          <Icon name="sync" className="ic14" />
          รอซิงก์ <span className="num">{v.n}</span>
        </span>
      )}
      <button className="btn btn-s btn-sm" onClick={onSync} disabled={!v.can}>
        {v.btn}
      </button>
    </section>
  );
}
