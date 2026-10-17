import { Icon } from '../../../components/common/icons';
import type { IncidentAccess } from '../data/access';
import { INCIDENT_HEADER } from '../data/incident';

interface RequirementSummaryCardProps {
  planDirty: boolean;
  planApproved: boolean;
  access: IncidentAccess;
  onApprove: () => void;
}

/** Requirement totals and plan approval (approveIncidentPlan: ER_STAFF). An edit to v2 makes a draft v3. */
export function RequirementSummaryCard({ planDirty, planApproved, access, onApprove }: RequirementSummaryCardProps) {
  const { mayApprovePlan } = access;

  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f2a5c', marginBottom: 10 }}>
        สรุปความต้องการ
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#475569' }}>ชุดที่ใช้จากชุดพร้อมใช้</span>
          <span style={{ fontWeight: 700, color: '#0f2a5c', fontFamily: 'Inter, sans-serif' }}>42</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#475569' }}>ชุดที่จัดเพิ่มจากของแยก</span>
          <span style={{ fontWeight: 700, color: '#0f2a5c', fontFamily: 'Inter, sans-serif' }}>13</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#475569' }}>ชุดที่จำเป็นต้องยืม</span>
          <span style={{ fontWeight: 700, color: '#dc2626', fontFamily: 'Inter, sans-serif' }}>3 ชุด</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#475569' }}>รายการนอกชุดที่ต้องยืม</span>
          <span style={{ fontWeight: 700, color: '#dc2626', fontFamily: 'Inter, sans-serif' }}>
            2 รายการ + PRC O 4 UNIT
          </span>
        </div>
      </div>
      <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 10, paddingTop: 8, fontSize: 10.5, color: '#94a3b8', lineHeight: '15px' }}>
        ประมาณการนับทุกระดับคัดแยก · ขั้นวิกฤตนับเฉพาะผู้ป่วยแดง · ส่วนเผื่อคือส่วนเผื่อช่วยจัดทำ · ผู้ป่วยดำไม่นำมาคิดชุด
      </div>

      {/* Plan approval: approveIncidentPlan (ER_STAFF). Edits to v2 create draft v3. */}
      <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 10, paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {planApproved ? (
          <div role="status" style={{ display: 'flex', gap: 8, background: '#dcfce7', color: '#166534', borderRadius: 8, padding: '8px 10px', fontSize: 12, lineHeight: '18px' }}>
            <Icon name="checkc" className="ic14" style={{ marginTop: 2 }} />
            <span>อนุมัติแผน v3 แล้ว 19:32 · ส่งคำขอยืมเร่งด่วนส่วนที่เพิ่ม และแจ้งคลังจัดชุดตามแผนใหม่</span>
          </div>
        ) : planDirty && mayApprovePlan ? (
          <>
            <div style={{ fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 10px', lineHeight: '18px' }}>
              แก้แผนแล้ว · ร่าง v3 ยังไม่ส่ง · คำขอยืมเร่งด่วนส่วนที่เปลี่ยนจะออกหลังอนุมัติ
            </div>
            <button type="button" className="btn btn-p" style={{ fontWeight: 600 }} onClick={() => onApprove()}>
              อนุมัติแผน v3 และส่งคำขอยืมเร่งด่วน
            </button>
          </>
        ) : (
          <div style={{ fontSize: 12, color: '#475569', lineHeight: '18px' }}>
            แผน {INCIDENT_HEADER.versionHistory.version} {INCIDENT_HEADER.versionHistory.approver}
            {mayApprovePlan && ' · แก้จำนวนจัดหรือตอบคำถาม Agent แล้วต้องอนุมัติใหม่'}
          </div>
        )}
      </div>
    </div>
  );
}
