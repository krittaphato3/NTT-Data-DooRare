/** Maps `GET /documents` onto the TransferDoc shape the documents screen (UI-15) renders. */
import { fmtThaiDate, fmtThaiTime } from '../../warehouse/data/transportLive';
import type { ApiDocKind, ApiDocument } from '../../../services/documentsApi';
import { DEFAULT_TERMS } from './documents';
import type { DocType, TransferDoc } from './documents';

const TYPE: Record<ApiDocKind, DocType> = {
  BORROW_SLIP: 'BORROW',
  TRANSFER_SLIP: 'TRANSFER',
  RETURN_SLIP: 'RETURN',
  INCIDENT_REPORT: 'INCIDENT_BORROW',
  UCEP_REPORT: 'INCIDENT_USAGE',
};

const MONTHS_LONG = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

function longThai(iso: string): string {
  const d = new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear() + 543} ${hh}:${mm}`;
}

const fmtQty = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 3 });

export function documentToView(doc: ApiDocument): TransferDoc {
  const p = doc.payload;
  const type = TYPE[doc.kind];
  const lines = p.lines.map((l) => ({
    name: l.drugName ?? '–',
    qty: l.qty,
    unit: l.baseUnit ?? '',
    code: l.code ?? l.lotNo ?? '–',
    expiry: l.expiryDate ? fmtThaiDate(l.expiryDate) : '–',
  }));
  const first = lines[0];
  const total = lines.reduce((sum, l) => sum + l.qty, 0);
  const sha = doc.sha256;
  return {
    id: doc.docNo,
    uuid: doc.id,
    version: doc.version,
    at: fmtThaiTime(doc.createdAt),
    issuedAt: longThai(doc.createdAt),
    type,
    status: doc.status,
    drug: first ? (lines.length > 1 ? `${first.name} (+${lines.length - 1})` : first.name) : '–',
    qty: total,
    unit: first?.unit ?? '',
    code: first?.code ?? '–',
    meta: `${fmtQty(total)} ${first?.unit ?? ''} · ${p.partyA.code} → ${p.partyB.code}`,
    ref: p.refLabel ?? doc.refType,
    sha: `${sha.slice(0, 8)} ${sha.slice(8, 16)} · ${sha.slice(16, 24)} · ${sha.slice(24, 32)}`,
    partyA: { name: p.partyA.name, addr: p.partyA.address ?? '' },
    partyB: { name: p.partyB.name, addr: p.partyB.address ?? '' },
    lines,
    delivery: `${p.delivery.instruction}${p.refLabel ? ` · อ้างอิง ${p.refLabel}` : ''}`,
    ...(p.returnTerms ? { returnDue: fmtThaiDate(p.returnTerms.dueDate), terms: [p.returnTerms.text, ...DEFAULT_TERMS.slice(1)] } : {}),
  };
}
