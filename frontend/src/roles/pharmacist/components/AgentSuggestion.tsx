import { useState } from 'react';
import { Icon } from '../../../components/common/icons';
import { mayActFor, requiredRoleHint } from '../../../lib/rbac';
import type { RoleCode } from '../../../lib/rbac';

type AgentPhase = 'open' | 'adjust' | 'confirm' | 'sent' | 'rejected';

const MAX_A = 110;
const MAX_B = 60;
const DEF_A = 80;
const DEF_B = 40;

interface AgentSuggestionProps {
  /** Role viewing the card; approve / adjust / reject are gated through `lib/rbac.ts`. */
  role?: RoleCode;
}

/** Pinned Agent suggestion card — state machine mirrors Main.dc.html exactly. */
export function AgentSuggestion({ role = 'PHARMACIST' }: AgentSuggestionProps) {
  const mayApprove = mayActFor(role, 'PHARMACIST', 'approveBorrow');
  const hint = requiredRoleHint('approveBorrow');
  const [phase, setPhase] = useState<AgentPhase>('open');
  const [qA, setQA] = useState(DEF_A);
  const [qB, setQB] = useState(DEF_B);
  const [adjusted, setAdjusted] = useState(false);
  const total = qA + qB;

  return (
    <div role="region" aria-label="คำแนะนำจาก Agent" className="agent-card" data-part="agent-suggestion">
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#1D4ED8', fontSize: 13, fontWeight: 600 }}>
          <Icon name="sparkle" />
          คำแนะนำจาก Agent <span className="en" style={{ color: '#475569' }}>Agent suggestion · ปักหมุด</span>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span className="ved ved-V">V</span>
          <span className="badge ug-critical">
            <Icon name="tri" className="ic14" />
            เร่งด่วนมาก
          </span>
          <span style={{ fontSize: 12 }}>18:30 น.</span>
        </span>
      </div>

      <div style={{ marginTop: 8, fontSize: 16, lineHeight: '26px', fontWeight: 600, color: '#0F2A5C' }}>
        Agent แนะนำ: ขอยืม Insulin Glargine pen <span className="num">{total}</span> หน่วย
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#FFFFFF', border: '1px solid #DBEAFE', borderRadius: 8, padding: '4px 10px', fontSize: 13, color: '#0F2A5C' }}>
          รพ.บางพลี <strong className="num" style={{ fontWeight: 600 }}>{qA}</strong> <span style={{ color: '#475569' }}>· 15.4 กม.</span>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', color: '#475569' }}>+</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#FFFFFF', border: '1px solid #DBEAFE', borderRadius: 8, padding: '4px 10px', fontSize: 13, color: '#0F2A5C' }}>
          รพ.บางบ่อ <strong className="num" style={{ fontWeight: 600 }}>{qB}</strong> <span style={{ color: '#475569' }}>· 28.6 กม.</span>
        </span>
        {adjusted && (
          <span className="badge" style={{ background: '#FEF3C7', color: '#92400E' }}>ปรับจำนวนโดยคุณ (Agent เสนอ 80 + 40)</span>
        )}
      </div>
      <p style={{ margin: '8px 0 12px', fontSize: 13, lineHeight: '20px', color: '#475569' }}>
        เหตุผล: คงเหลือ <span className="num">18</span> ด้าม ใช้เฉลี่ย <span className="num">12</span>/วัน → พอใช้ <span className="num">1.5</span> วัน ต่ำกว่า Predict 7 วัน · ทั้งสองแห่งมีสต็อกเกินเกณฑ์ปลอดภัยและส่งถึงได้ภายในวันนี้
      </p>

      {phase === 'open' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button
            className="btn btn-p btn-sm"
            disabled={!mayApprove}
            title={mayApprove ? undefined : hint}
            onClick={() => setPhase('confirm')}
          >
            <Icon name="check" />
            อนุมัติ · Approve
          </button>
          <button
            className="btn btn-s btn-sm"
            disabled={!mayApprove}
            title={mayApprove ? undefined : hint}
            onClick={() => setPhase('adjust')}
          >
            <Icon name="edit" />
            ปรับจำนวน · Adjust
          </button>
          <button
            className="btn btn-g btn-sm"
            disabled={!mayApprove}
            title={mayApprove ? undefined : hint}
            onClick={() => setPhase('rejected')}
          >
            <Icon name="x" />
            ปฏิเสธ · Reject
          </button>
        </div>
      )}

      {phase === 'adjust' && (
        <div style={{ background: '#FFFFFF', border: '1px solid #DBEAFE', borderRadius: 8, padding: '12px 14px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: '#0F2A5C', minWidth: 64 }}>รพ.บางพลี</span>
            <button className="step" aria-label="ลดจำนวน รพ.บางพลี" onClick={() => setQA((v) => Math.max(0, v - 10))}>
              <Icon name="minus" />
            </button>
            <output className="num" aria-live="polite" style={{ minWidth: 40, textAlign: 'right', fontWeight: 600, color: '#0F2A5C' }}>{qA}</output>
            <button className="step" aria-label="เพิ่มจำนวน รพ.บางพลี" onClick={() => setQA((v) => Math.min(MAX_A, v + 10))}>
              <Icon name="plus" />
            </button>
            <span style={{ fontSize: 12 }}>ให้ยืมได้สูงสุด <span className="num">{MAX_A}</span></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: '#0F2A5C', minWidth: 64 }}>รพ.บางบ่อ</span>
            <button className="step" aria-label="ลดจำนวน รพ.บางบ่อ" onClick={() => setQB((v) => Math.max(0, v - 10))}>
              <Icon name="minus" />
            </button>
            <output className="num" aria-live="polite" style={{ minWidth: 40, textAlign: 'right', fontWeight: 600, color: '#0F2A5C' }}>{qB}</output>
            <button className="step" aria-label="เพิ่มจำนวน รพ.บางบ่อ" onClick={() => setQB((v) => Math.min(MAX_B, v + 10))}>
              <Icon name="plus" />
            </button>
            <span style={{ fontSize: 12 }}>ให้ยืมได้สูงสุด <span className="num">{MAX_B}</span></span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <button className="btn btn-g btn-sm" onClick={() => setPhase('open')}>ยกเลิก</button>
            <button className="btn btn-p btn-sm" onClick={() => { setAdjusted(qA !== DEF_A || qB !== DEF_B); setPhase('open'); }}>บันทึกจำนวน</button>
          </div>
        </div>
      )}

      {phase === 'confirm' && (
        <div style={{ background: '#FFFFFF', border: '1px solid #1D4ED8', borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0F2A5C' }}>ยืนยันส่งคำขอยืม 2 รายการ?</div>
          <ul style={{ margin: '6px 0 10px', paddingLeft: 18, fontSize: 13, lineHeight: '20px' }}>
            <li>Insulin Glargine pen <span className="num">{qA}</span> หน่วย จาก รพ.บางพลี → โรงพยาบาลสมุทรปราการ</li>
            <li>Insulin Glargine pen <span className="num">{qB}</span> หน่วย จาก รพ.บางบ่อ → โรงพยาบาลสมุทรปราการ</li>
          </ul>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button className="btn btn-p btn-sm" onClick={() => setPhase('sent')}>ยืนยันและส่งคำขอ</button>
            <button className="btn btn-g btn-sm" onClick={() => setPhase('open')}>ย้อนกลับ</button>
          </div>
        </div>
      )}

      {phase === 'sent' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, background: '#DCFCE7', color: '#166534', borderRadius: 8, padding: '10px 12px', fontSize: 13, fontWeight: 500 }}>
          <Icon name="checkc" />
          ส่งคำขอแล้วโดยคุณ: #REQ-1055 (รพ.บางพลี) และ #REQ-1056 (รพ.บางบ่อ) · รอโรงพยาบาลผู้ให้ยืมตอบรับ
        </div>
      )}

      {phase === 'rejected' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, background: '#F1F5F9', color: '#475569', borderRadius: 8, padding: '10px 12px', fontSize: 13 }}>
          <Icon name="xc" />
          ปฏิเสธคำแนะนำแล้ว · ไม่มีการส่งคำขอ
          <button className="link" onClick={() => setPhase('open')} style={{ marginLeft: 'auto' }}>เลิกทำ</button>
        </div>
      )}

      {phase !== 'sent' && phase !== 'rejected' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 12, lineHeight: '16px', color: '#1E40AF', fontWeight: 500 }}>
          <Icon name="lock" className="ic14" />
          ยังไม่ส่งคำขอจนกว่าเจ้าหน้าที่อนุมัติ · Nothing is sent until you approve
        </div>
      )}
    </div>
  );
}
