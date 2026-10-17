import { useState } from 'react';

interface CancelModalProps {
  mayWrite: boolean;
  onClose: () => void;
  /** Called after "ยืนยันยกเลิกเหตุ" (the incident was reported by mistake). */
  onConfirm: () => void;
}

/** Cancel an incident that was reported by mistake (reason is required). */
export function CancelModal({ mayWrite, onClose, onConfirm }: CancelModalProps) {
  const [cancelReason, setCancelReason] = useState('');

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 16,
      }}
      onClick={() => onClose()}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: 480,
          background: '#ffffff',
          borderRadius: 12,
          padding: '20px 24px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0f2a5c', marginBottom: 8 }}>
          ยกเลิก INC-2026-000015 เพราะแจ้งผิด?
        </h2>
        <div style={{ fontSize: 12.5, color: '#475569', lineHeight: '18px', marginBottom: 12 }}>
          คำขอที่ยังไม่มีผู้ยืนยัน 2 รายการจะถูกยกเลิกทันที · ของที่ยืนยันแล้ว 3 รายการจะถูกส่งคืนผู้ให้ยืม · ชุดที่จัดเสร็จแล้วยังคงอยู่ในคลังเป็นชุดพร้อมใช้
        </div>
        <textarea
          rows={3}
          placeholder="เหตุผล (จำเป็น)"
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          style={{
            width: '100%',
            border: '1px solid #cbd5e1',
            borderRadius: 6,
            padding: '8px 10px',
            fontSize: 12.5,
            fontFamily: 'inherit',
            boxSizing: 'border-box',
            marginBottom: 14,
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            className="btn btn-s"
            onClick={() => onClose()}
          >
            ไม่ยกเลิก
          </button>
          {mayWrite && (
            <button
              type="button"
              className="btn btn-p"
              style={{ background: '#b91c1c', border: 'none', fontWeight: 600 }}
              onClick={() => {
                onConfirm();
              }}
            >
              ยืนยันยกเลิกเหตุ
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
