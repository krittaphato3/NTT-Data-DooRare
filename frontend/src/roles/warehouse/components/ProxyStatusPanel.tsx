import { useRef, useState } from 'react';
import { Icon } from '../../../components/common/icons';
import type { TransportStatus } from '../data/transport';
import type { PendingPhotoItem } from './ShipmentDrawer';

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
  pendingPhotos?: (string | PendingPhotoItem)[];
  onAddPhoto?: (file: File) => void;
  onRemovePendingPhoto?: (key: string) => void;
  onPreviewPhoto?: (url: string) => void;
  busy?: boolean;
  live?: boolean;
}

/**
 * WH may set IN_TRANSIT / ARRIVED on behalf of the driver only when necessary (e.g. the driver
 * cannot sync) and must give a reason that goes to the audit log (RBAC §4.4 ◐).
 */
export function ProxyStatusPanel({
  status,
  onSubmit,
  pendingPhotos,
  onAddPhoto,
  onRemovePendingPhoto,
  onPreviewPhoto,
  busy,
  live,
}: ProxyStatusPanelProps) {
  const next = NEXT[status];
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  if (!next) return null;
  const ok = reason.trim().length >= 5;
  const pendingList = pendingPhotos ?? [];

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <textarea
            className="inp"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="เหตุผล เช่น คนขับไม่มีสัญญาณ ซิงก์ไม่ได้ (บังคับ)"
            aria-label="เหตุผลที่บันทึกแทนคนขับ"
          />

          {/* Photo attachment for proxy action */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#0F2A5C' }}>
                แนบรูปถ่ายประกอบ (ถ้ามี / ไม่บังคับ)
              </span>
              {pendingList.length > 0 && <span className="sub" style={{ fontSize: 11 }}>{pendingList.length} รูปพร้อมแนบ</span>}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              {pendingList.map((item) => {
                const key = typeof item === 'string' ? item : item.key;
                const url = typeof item === 'object' && item.url ? item.url : (key.startsWith('data:') || key.startsWith('blob:') || key.startsWith('/') ? key : `/api/v1/uploads/${key}`);
                return (
                  <div key={key} className="ph ph-thumb" style={{ width: 60, height: 60, flexShrink: 0 }}>
                    {url ? (
                      <button
                        type="button"
                        className="ph-preview-btn"
                        onClick={() => onPreviewPhoto?.(url)}
                        title="คลิกเพื่อดูรูป"
                      >
                        <img src={url} alt="รูปพร้อมแนบ" className="ph-img" />
                      </button>
                    ) : (
                      <Icon name="camera" className="ic14" />
                    )}
                    {onRemovePendingPhoto && (
                      <button
                        type="button"
                        className="ph-remove-btn"
                        aria-label="ลบรูปนี้"
                        title="ลบรูปนี้"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemovePendingPhoto(key);
                        }}
                      >
                        <Icon name="x" className="ic14" />
                      </button>
                    )}
                  </div>
                );
              })}

              {pendingList.length < 5 && (
                <>
                  {live && (
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) onAddPhoto?.(file);
                        e.target.value = '';
                      }}
                    />
                  )}
                  <button
                    type="button"
                    className="ph ph-add"
                    style={{ width: 60, height: 60, fontSize: 10, flexShrink: 0 }}
                    disabled={busy}
                    onClick={() => fileRef.current?.click()}
                  >
                    <Icon name="camera" className="ic14" />
                    <span>+ แนบรูป</span>
                  </button>
                </>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            <button
              className="btn btn-p btn-sm"
              disabled={!ok || busy}
              onClick={() => {
                onSubmit(next.to, reason.trim());
                setOpen(false);
                setReason('');
              }}
            >
              {busy ? 'กำลังบันทึก…' : `ยืนยัน · ${next.label}`}
            </button>
            <button
              className="btn btn-g btn-sm"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setReason('');
              }}
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
