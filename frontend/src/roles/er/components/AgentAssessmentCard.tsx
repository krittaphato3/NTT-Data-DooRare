import { Icon } from '../../../components/common/icons';
import type { IncidentAccess } from '../data/access';
import type { Scenario } from '../data/scenario';

interface AgentAssessmentCardProps {
  scenario: Scenario;
  burnKitOption: 'none' | 'add';
  prcOption: '4' | '6';
  access: IncidentAccess;
  onBurnKit: (option: 'none' | 'add') => void;
  onPrc: (option: '4' | '6') => void;
}

/** Agent's assessment of the incident (or the S4 rule-based fallback) and its questions to staff. */
export function AgentAssessmentCard({ scenario, burnKitOption, prcOption, access, onBurnKit, onPrc }: AgentAssessmentCardProps) {
  const { mayWrite, writeHint } = access;

  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#0f2a5c', fontSize: 13.5 }}>
          <Icon name="sparkle" className="ic14" style={{ color: '#2563eb' }} />
          <span>Agent ประเมินเหตุการณ์</span>
        </div>
        <span className="badge st-approved" style={{ height: 20, fontSize: 11 }}>
          {scenario === 's4' ? 'FALLBACK' : 'มั่นใจสูง · HIGH'}
        </span>
      </div>

      {scenario === 's4' ? (
        /* S4: Agent Fallback View */
        <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '10px 12px', marginTop: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0369a1', marginBottom: 4 }}>
            เลือกชุดตามกฎของโรงพยาบาล
          </div>
          <div style={{ fontSize: 12, color: '#0369a1', lineHeight: '18px' }}>
            Agent ไม่ตอบภายใน 8 วินาที ระบบเลือกชุดจาก incident_kit_rule ของ &ldquo;รถโดยสาร / อุบัติเหตุจราจรหมู่&rdquo; แทน · จำนวนยังคำนวณเหมือนเดิม · ไม่มีคำถามเพิ่มเติม
          </div>
          <div style={{ fontSize: 11, color: '#0284c7', marginTop: 6 }}>
            เหตุผลของการตัดสินใจ: FALLBACK · บันทึกใน agent_run แล้ว
          </div>
        </div>
      ) : (
        /* Normal Agent Assessment View */
        <>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>
            F3_T1 · v2 · 19:27 · ใช้เวลา 3.1 วินาที · สถานะ OK
          </div>
          <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#334155', lineHeight: '19px' }}>
            รถโดยสารคว่ำ ผู้บาดเจ็บหลายระบบ มีเลือดออกมากและทางเดินหายใจ จึงเลือก Trauma Set ทุกคน, IV Set สำหรับแดงและเหลือง และ Intubation Set สำหรับผู้ป่วยแดง พร้อมยาห้ามเลือด สารน้ำ และวัคซีนบาดทะยัก
          </p>
          <ul style={{ margin: '0 0 12px', paddingLeft: 16, fontSize: 12, color: '#475569', lineHeight: '18px' }}>
            <li>Intubation Set ขาด 1 ชุด เพราะ stylet แยกมีแค่ 3 ชิ้น</li>
            <li>Tranexamic acid ต้องยืม 8 amp และเป็นรายการวิกฤต</li>
            <li>ผู้ป่วยดำ 1 ราย ไม่นำมาคิดชุด</li>
          </ul>

          {/* Questions to Staff */}
          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: '#0f2a5c' }}>คำถามถึงเจ้าหน้าที่</div>

            {/* Question 1: Burn Kit */}
            <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11.5, color: '#334155', marginBottom: 6 }}>
                มีผู้ป่วยแผลไหม้ร่วมด้วยหรือไม่ ถ้ามีควรเพิ่ม Burn Kit
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className={`btn btn-sm ${burnKitOption === 'none' ? 'btn-p' : 'btn-s'}`}
                  style={{ flex: 1, height: 28, fontSize: 11 }}
                  disabled={!mayWrite}
                  title={mayWrite ? undefined : writeHint}
                  onClick={() => {
                    onBurnKit('none');
                  }}
                >
                  ไม่มี
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${burnKitOption === 'add' ? 'btn-p' : 'btn-s'}`}
                  style={{ flex: 1.5, height: 28, fontSize: 11 }}
                  disabled={!mayWrite}
                  title={mayWrite ? undefined : writeHint}
                  onClick={() => {
                    onBurnKit('add');
                  }}
                >
                  มี - เพิ่ม Burn Kit
                </button>
              </div>
            </div>

            {/* Question 2: PRC O */}
            <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11.5, color: '#334155', marginBottom: 6 }}>
                ต้องการ PRC group O เพิ่มจาก 4 ยูนิตหรือไม่ (สูงสุด 6)
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className={`btn btn-sm ${prcOption === '4' ? 'btn-p' : 'btn-s'}`}
                  style={{ flex: 1, height: 28, fontSize: 11 }}
                  disabled={!mayWrite}
                  title={mayWrite ? undefined : writeHint}
                  onClick={() => {
                    onPrc('4');
                  }}
                >
                  คง 4 ยูนิต
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${prcOption === '6' ? 'btn-p' : 'btn-s'}`}
                  style={{ flex: 1, height: 28, fontSize: 11 }}
                  disabled={!mayWrite}
                  title={mayWrite ? undefined : writeHint}
                  onClick={() => {
                    onPrc('6');
                  }}
                >
                  เพิ่มเป็น 6
                </button>
              </div>
            </div>
          </div>

          <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 10, lineHeight: '14px' }}>
            Agent เลือกชุดและรายการยาตามลักษณะเหตุการณ์ ตามกฎตั้งต้นของโรงพยาบาล · จำนวนคำนวณโดยระบบ · ถ้าเกิน 8 วินาทีใช้กฎแทน (FALLBACK)
          </div>
        </>
      )}
    </div>
  );
}
