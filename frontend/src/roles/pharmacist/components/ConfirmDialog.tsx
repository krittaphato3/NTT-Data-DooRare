import type { ReactNode } from 'react';
import { Modal } from '../../hospital-admin/components/Modal';

interface ConfirmDialogProps {
  title: string;
  /** What will change, in plain words. */
  detail: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** In-app confirmation (replaces the browser's confirm box) for a write that needs no reason. */
export function ConfirmDialog({ title, detail, confirmLabel, busy = false, onConfirm, onClose }: ConfirmDialogProps) {
  return (
    <Modal label={`${title} / Confirm`} onClose={onClose}>
      <h2 className="sec-h">{title}</h2>
      <div style={{ marginTop: 10, fontSize: 13.5, lineHeight: '21px', color: '#475569' }}>{detail}</div>
      <div className="ha-dialog-foot">
        <button className="btn btn-g" onClick={onClose}>
          ยกเลิก
        </button>
        <button className="btn btn-p" disabled={busy} onClick={onConfirm} autoFocus>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
