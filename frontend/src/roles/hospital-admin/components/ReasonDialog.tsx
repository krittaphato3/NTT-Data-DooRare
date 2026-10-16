import { useState } from 'react';
import type { ReactNode } from 'react';
import { Modal } from './Modal';

interface ReasonDialogProps {
  title: string;
  /** Exactly what will change, so the approver confirms the real effect. */
  detail: ReactNode;
  confirmLabel: string;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

/**
 * Confirmation dialog for audited write actions (SEC-003): the reason is mandatory and is what
 * gets written to the audit log, so confirm stays disabled until it is filled in.
 */
export function ReasonDialog({ title, detail, confirmLabel, onConfirm, onClose }: ReasonDialogProps) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const valid = reason.trim().length > 0;

  return (
    <Modal label={`${title} / Confirm`} onClose={onClose}>
      <h2 className="sec-h">{title}</h2>
      <div style={{ marginTop: 10, fontSize: 13, lineHeight: '20px', color: '#475569' }}>{detail}</div>

      <div className="ha-field" style={{ marginTop: 14 }}>
        <label className="ha-label" htmlFor="reason-dialog-input">
          เหตุผล · Reason <span aria-hidden="true">*</span>
        </label>
        <textarea
          id="reason-dialog-input"
          className="ha-textarea"
          value={reason}
          autoFocus
          aria-required="true"
          aria-invalid={touched && !valid}
          placeholder="ระบุเหตุผล — บันทึกไว้ใน audit log ตาม SEC-003"
          onChange={(e) => setReason(e.target.value)}
          onBlur={() => setTouched(true)}
        />
        {touched && !valid && <span className="ha-error">กรุณาระบุเหตุผล</span>}
      </div>

      <div className="ha-dialog-foot">
        <button className="btn btn-g" onClick={onClose}>
          ยกเลิก
        </button>
        <button className="btn btn-p" disabled={!valid} onClick={() => onConfirm(reason.trim())}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
