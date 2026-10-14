import { DOC_TYPE_META } from '../data/documents';
import type { TransferDoc } from '../data/documents';

const PARTY_LABEL: Record<TransferDoc['type'], [string, string]> = {
  BORROW: ['ผู้ยืม', 'ผู้ให้ยืม'],
  TRANSFER: ['ผู้โอน (ต้นทาง)', 'ผู้รับ (ปลายทาง)'],
  RETURN: ['ผู้ส่งคืน', 'ผู้รับคืน'],
  INCIDENT_BORROW: ['ผู้ยืม (ในเหตุฉุกเฉิน)', 'ผู้ให้ยืม'],
  INCIDENT_USAGE: ['หน่วยงานบันทึกการใช้', 'อ้างอิงเคลม'],
};

/** Printable A4-ish sheet: header, parties, item lines, terms, signature blocks
 *  (FR-XC-002) + SHA footer (FR-XC-006). VOID docs carry a rotated stamp. */
export function DocPaper({ doc }: { doc: TransferDoc }) {
  const meta = DOC_TYPE_META[doc.type];
  const [labelA, labelB] = PARTY_LABEL[doc.type];
  const isVoid = doc.status === 'VOID';

  return (
    <div className={`doc-paper ${isVoid ? 'doc-paper-void' : ''}`}>
      {isVoid && <span className="doc-stamp" aria-hidden="true">ยกเลิก · VOID</span>}

      <header className="doc-head">
        <div>
          <div className="doc-title">{meta.th}</div>
          <div className="doc-sub">{meta.en}</div>
        </div>
        <div className="doc-meta">
          <div>
            เลขที่ <b className="code">{doc.id}</b>
          </div>
          <div>ออกวันที่ {doc.issuedAt}</div>
          <div>
            อ้างอิง <span className="code">{doc.ref}</span> · v{doc.version}
          </div>
        </div>
      </header>

      <div className="doc-parties">
        <div className="doc-party">
          <span className="doc-party-label">{labelA}</span>
          <b>{doc.partyA.name}</b>
          <span>{doc.partyA.addr}</span>
        </div>
        <div className="doc-party">
          <span className="doc-party-label">{labelB}</span>
          <b>{doc.partyB.name}</b>
          <span>{doc.partyB.addr}</span>
        </div>
      </div>

      <table className="doc-lines">
        <thead>
          <tr>
            <th style={{ width: 30 }}>#</th>
            <th>รายการ</th>
            <th style={{ width: 92, textAlign: 'right' }}>จำนวน</th>
            <th style={{ width: 96 }}>รหัส</th>
            <th style={{ width: 104 }}>หมดอายุ</th>
          </tr>
        </thead>
        <tbody>
          {doc.lines.map((l, i) => (
            <tr key={l.name}>
              <td>{i + 1}</td>
              <td>{l.name}</td>
              <td style={{ textAlign: 'right' }}>
                {l.qty.toLocaleString()} {l.unit}
              </td>
              <td className="code">{l.code}</td>
              <td>{l.expiry}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="doc-delivery">{doc.delivery}</div>

      {doc.terms && (
        <div className="doc-terms">
          <b>
            เงื่อนไขการคืน{doc.returnDue ? ` · กำหนดคืน ${doc.returnDue}` : ''}
          </b>
          <ul>
            {doc.terms.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
      {doc.note && <div className="doc-note">{doc.note}</div>}

      <div className="doc-sigs">
        {[labelA, 'ผู้อนุมัติ', labelB].map((s) => (
          <div className="doc-sig" key={s}>
            <span className="doc-sig-line" />
            <span className="doc-sig-name">( {s} )</span>
            <span className="doc-sig-line" />
            <span className="doc-sig-role">ตำแหน่ง / หน่วยงาน ………………………</span>
          </div>
        ))}
      </div>

      <footer className="doc-foot">
        <span>ระบบสร้างโดย DooRare อัตโนมัติ · เนื้อหาตรึงหลังออกเอกสาร (FR-XC-005) · พิมพ์ซ้ำได้เนื้อหาเดิม</span>
        <span className="code">SHA-256 {doc.sha}</span>
      </footer>
    </div>
  );
}
