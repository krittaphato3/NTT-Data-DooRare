import { Icon } from '../../../components/common/icons';
import { REQUEST_STATUS_META } from '../data/f3';
import type { Incident } from '../data/f3';
import { whHref } from '../data/routes';
import { fmtQty, HOSPITALS } from '../data/transport';

export function TriageChips({ t }: { t: Incident['triage'] }) {
  return (
    <span style={{ display: 'inline-flex', gap: 4 }} title="จำนวนผู้บาดเจ็บแยกระดับ (ไม่เก็บข้อมูลระบุตัวผู้ป่วย)">
      <span className="badge t-red" style={{ fontWeight: 600 }}>แดง <span className="num">{t.red}</span></span>
      <span className="badge t-amber" style={{ fontWeight: 600 }}>เหลือง <span className="num">{t.yellow}</span></span>
      <span className="badge t-green" style={{ fontWeight: 600 }}>เขียว <span className="num">{t.green}</span></span>
    </span>
  );
}

interface IncidentsTabProps {
  rows: Incident[];
  activeId: string | null;
  onOpen: (id: string) => void;
}

/** Open / closed incidents and their links to kits and urgent requests (view-only for WH). */
export function IncidentsTab({ rows, activeId, onOpen }: IncidentsTabProps) {
  return (
    <div className="scroll-x">
      <table className="tbl kt-tbl" aria-label="เหตุฉุกเฉิน">
        <thead>
          <tr>
            <th style={{ width: 200 }}>เหตุ</th>
            <th style={{ width: 230 }}>สถานที่ · ผู้บาดเจ็บ</th>
            <th style={{ width: 170 }}>เวลา</th>
            <th>คำขอยืมเร่งด่วน</th>
            <th style={{ width: 150 }}>งานแพ็กเซ็ต</th>
            <th style={{ width: 110 }}>สถานะ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr key={i.id} className={activeId === i.id ? 'r-active' : ''}>
              <td>
                <button className="rowbtn code" style={{ fontSize: 12.5, color: '#1D4ED8', fontWeight: 600 }} onClick={() => onOpen(i.id)}>{i.id}</button>
                <span style={{ display: 'block', marginTop: 2 }}>
                  <span className={`badge ${i.own ? 't-blue' : 't-grey'}`} style={{ height: 18, fontSize: 11 }}>
                    {i.own ? 'เหตุของ รพ.เรา' : `เหตุของ ${HOSPITALS[i.hospital]}`}
                  </span>
                </span>
              </td>
              <td>
                <span style={{ fontWeight: 600, color: '#0F2A5C' }}>{i.title}</span>
                <span className="sub" style={{ display: 'block', marginBottom: 4 }}>{i.place}</span>
                <TriageChips t={i.triage} />
              </td>
              <td style={{ fontSize: 12.5 }}>
                <span className="num" style={{ color: '#0F2A5C' }}>{i.reportedAt}</span>
                <span className="sub" style={{ display: 'block' }}>{i.eta}</span>
              </td>
              <td style={{ fontSize: 12.5 }}>
                {i.requests.length === 0 && <span className="sub">—</span>}
                {i.requests.map((r) => (
                  <div key={r.id} style={{ marginBottom: 2 }}>
                    <span className="code">{r.id}</span> · {r.drug} <span className="num">{fmtQty(r.qty)}</span> {r.unit}{' '}
                    <span className={`badge t-${REQUEST_STATUS_META[r.status].tone}`} style={{ height: 18, fontSize: 11 }}>{REQUEST_STATUS_META[r.status].label}</span>
                  </div>
                ))}
              </td>
              <td style={{ fontSize: 12.5 }}>
                {i.kits.length === 0 ? <span className="sub">—</span> : i.kits.map((k) => (
                  <div key={k.kit}>{k.kit} × <span className="num">{k.qty}</span></div>
                ))}
              </td>
              <td>
                <span className={`badge ${i.status === 'OPEN' ? 't-amber' : 't-grey'}`}>{i.status === 'OPEN' ? 'เปิดอยู่' : 'ปิดเหตุแล้ว'}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface IncidentDrawerProps {
  incident: Incident;
  onClose: () => void;
}

export function IncidentDrawer({ incident: i, onClose }: IncidentDrawerProps) {
  return (
    <aside className="tr-drawer" aria-label="รายละเอียดเหตุ">
      <div className="tr-drawer-head">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span className="sub">เหตุฉุกเฉิน · F3 · ดูอย่างเดียว</span>
          <button className="icbtn" aria-label="ปิด / Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <h2 className="code" style={{ margin: 0, fontSize: 19, lineHeight: '28px', fontWeight: 600, color: '#0F2A5C' }}>{i.id}</h2>
          <span className={`badge ${i.status === 'OPEN' ? 't-amber' : 't-grey'}`}>{i.status === 'OPEN' ? 'เปิดอยู่' : 'ปิดเหตุแล้ว'}</span>
          <span className={`badge ${i.own ? 't-blue' : 't-grey'}`}>{i.own ? 'เหตุของ รพ.เรา' : `เหตุของ ${HOSPITALS[i.hospital]}`}</span>
        </div>
        <div style={{ fontSize: 14, color: '#0F2A5C' }}>{i.title} · {i.place}</div>
      </div>
      <div className="tr-drawer-body">
        <div className="tr-box">
          <h3 className="tr-h3" style={{ marginBottom: 6 }}>สรุปเหตุ</h3>
          <dl className="dlr">
            <dt>ผู้บาดเจ็บ</dt>
            <dd><TriageChips t={i.triage} /></dd>
            <dt>รายงานเมื่อ</dt>
            <dd className="num">{i.reportedAt}</dd>
            <dt>เวลา/ETA</dt>
            <dd>{i.eta}</dd>
          </dl>
          <div className="return-note">เก็บเฉพาะจำนวนผู้บาดเจ็บแยกระดับ ไม่มีข้อมูลที่ระบุตัวผู้ป่วยได้ · บันทึกเหตุและอนุมัติแผนเป็นของ ER</div>
        </div>

        <div>
          <h3 className="tr-h3">คำขอยืมเร่งด่วน</h3>
          {i.requests.length === 0 ? (
            <div className="sub">ไม่มีคำขอ</div>
          ) : (
            <ul className="kt-list">
              {i.requests.map((r) => (
                <li key={r.id}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span className="code" style={{ fontWeight: 600, color: '#0F2A5C' }}>{r.id}</span>
                    <span style={{ display: 'block', fontSize: 13, color: '#0F2A5C' }}>{r.drug} · <span className="num">{fmtQty(r.qty)}</span> {r.unit}</span>
                    <span className="sub">
                      {r.side === 'borrower' ? `เราขอยืมจาก ${HOSPITALS[r.counterpart]}` : `${HOSPITALS[r.counterpart]} ขอยืมเรา`}
                    </span>
                  </div>
                  <span className={`badge t-${REQUEST_STATUS_META[r.status].tone}`}>{REQUEST_STATUS_META[r.status].label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {i.kits.length > 0 && (
          <div>
            <h3 className="tr-h3">งานแพ็กเซ็ตของเหตุนี้</h3>
            <ul className="kt-list">
              {i.kits.map((k) => (
                <li key={k.kit}>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 600, color: '#0F2A5C' }}>{k.kit}</span> × <span className="num">{k.qty}</span> ชุด
                    {k.packId && <span className="code" style={{ display: 'block' }}>{k.packId} · แพ็กที่แท็บ "แพ็กชุดยา"</span>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {i.requests.some((r) => r.inboxId && r.status === 'NEED_CONFIRM') && (
          <div>
            <a className="btn btn-p" href={whHref('kit')} style={{ textDecoration: 'none' }}>
              <Icon name="inbox" />
              ไปยืนยันที่แท็บ “คำขอเร่งด่วนจาก รพ.อื่น”
            </a>
          </div>
        )}
      </div>
    </aside>
  );
}
