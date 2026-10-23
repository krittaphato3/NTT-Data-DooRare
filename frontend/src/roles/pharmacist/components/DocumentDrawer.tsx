import { Icon } from '../../../components/common/icons';
import { requiredRoleHint } from '../../../lib/rbac';
import { DocPaper } from './DocPaper';
import { DOC_TYPE_META } from '../data/documents';
import type { TransferDoc } from '../data/documents';

interface DocumentDrawerProps {
  doc: TransferDoc;
  /** link to the replacement document when VOID (FR-XC-005) */
  onOpenDoc: (id: string) => void;
  onClose: () => void;
  /** Whether the viewer may print/export the document (API-XC-001/002, §4.1). */
  mayPrint?: boolean;
}

/** UI-15 document detail — print/PDF actions (API-XC-001/002), versioned paper. */
export function DocumentDrawer({ doc, onOpenDoc, onClose, mayPrint = true }: DocumentDrawerProps) {
  /* Tooltip for a viewer without print rights — names the roles that own the action. */
  const noPrintHint = mayPrint ? undefined : requiredRoleHint('printDocuments');
  const meta = DOC_TYPE_META[doc.type];
  const isVoid = doc.status === 'VOID';
  const voidNote = doc.voidNote;

  const handleDownload = () => {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.id}-v${doc.version}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <aside className="tr-drawer" aria-label="รายละเอียดเอกสาร">
      <div className="tr-drawer-head">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span className="sub">เอกสารที่ระบบสร้างอัตโนมัติ · UI-15</span>
          <button className="icbtn" aria-label="ปิด / Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <h2 className="code" style={{ margin: 0, fontSize: 19, lineHeight: '28px', fontWeight: 600, color: '#0F2A5C' }}>
            {doc.id}
          </h2>
          {isVoid ? (
            <span className="badge t-red" style={{ fontWeight: 700 }}>VOID · ยกเลิก</span>
          ) : (
            <span className="badge t-green">ออกแล้ว (ISSUED)</span>
          )}
          <span className="badge t-grey code">v{doc.version}</span>
          <span className={`badge ${meta.tone}`}>{meta.label}</span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-p btn-sm" disabled={!mayPrint} title={mayPrint ? undefined : noPrintHint} onClick={() => window.print()}>
            <Icon name="printer" /> พิมพ์
          </button>
          <button className="btn btn-s btn-sm" disabled={!mayPrint} title={mayPrint ? undefined : noPrintHint} onClick={() => window.print()}>
            <Icon name="fileText" /> PDF
          </button>
          <button className="link" type="button" style={{ fontSize: 12.5 }} disabled={!mayPrint} title={mayPrint ? undefined : noPrintHint} onClick={handleDownload}>
            ดาวน์โหลดไฟล์ต้นฉบับ
          </button>
          <span className="code" style={{ marginLeft: 'auto', fontSize: 11, color: '#94A3B8' }}>
            SHA-256 {doc.sha}
          </span>
        </div>
      </div>

      <div className="tr-drawer-body">
        {isVoid && voidNote && (
          <div role="status" className="doc-void-banner">
            <Icon name="tri" className="ic20" style={{ color: '#B91C1C' }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <b>เอกสารถูกยกเลิก (VOID):</b> {voidNote.text}
              <button className="link doc-void-link" type="button" onClick={() => onOpenDoc(voidNote.newerId)}>
                เปิดเอกสารเวอร์ชันใหม่ {voidNote.newerId} →
              </button>
            </span>
          </div>
        )}

        <DocPaper doc={doc} />

        <div className="tr-box">
          <h3 className="tr-h3">การส่งมอบและคู่สัญญา</h3>
          <dl className="dlr">
            <dt>{DOC_TYPE_META[doc.type].label === 'ยืม' ? 'ผู้ยืม' : 'ต้นทาง'}</dt>
            <dd>
              {doc.partyA.name} <span className="sub">· {doc.partyA.addr}</span>
            </dd>
            <dt>{DOC_TYPE_META[doc.type].label === 'ยืม' ? 'ผู้ให้ยืม' : 'ปลายทาง'}</dt>
            <dd>
              {doc.partyB.name} <span className="sub">· {doc.partyB.addr}</span>
            </dd>
            <dt>ส่งมอบ</dt>
            <dd>{doc.delivery}</dd>
            {doc.returnDue && (
              <>
                <dt>กำหนดคืน</dt>
                <dd>
                  {doc.returnDue} · แจ้งเตือนก่อน 7 วัน, 1 วัน และรายวันเมื่อค้างคืน (ASM-24)
                </dd>
              </>
            )}
          </dl>
        </div>

        <div className="sub">
          เอกสารออกอัตโนมัติหลังขั้นตอนอนุมัติ (FR-XC-001) · เนื้อหาแก้ไขไม่ได้ ต้องออกใหม่และยกเลิกฉบับเดิม
          (FR-XC-005) · PDF เก็บใน S3 พร้อม SHA-256 เข้าถึงเฉพาะ รพ.ที่เกี่ยวข้อง เขต และผู้ตรวจ (FR-XC-006)
        </div>
      </div>
    </aside>
  );
}
