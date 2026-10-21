/**
 * Documents (spec FL-10, BR-XC-001..007): borrow / transfer / return slips. A document is a stored, immutable snapshot
 * (`payload` = the printable content; `sha256` is the hash of its key-sorted JSON, so it can be re-verified from the stored jsonb). There is no PDF renderer in this stack, so `downloadUrl` is null and the web
 * prints from `payload`; `s3_key` is the logical key a renderer would later write to.
 */
import crypto from 'node:crypto';
import type { Request } from 'express';
import { auditContext, writeAudit } from '../../core/audit.js';
import { stableStringify } from '../../core/canonical.js';
import { oneOf, parsePage, toPage } from '../../core/pagination.js';
import { getSetting } from '../../core/settings.js';
import { bodyObject, uuidParam } from '../../core/validate.js';
import { query } from '../../db/client.js';
import { withTransaction } from '../../db/tx.js';
import type { Db } from '../../db/tx.js';
import { HttpError } from '../../middleware/httpError.js';
import type { AuthSessionUser } from '../auth/auth.types.js';

export const DOC_KINDS = ['BORROW_SLIP', 'RETURN_SLIP', 'TRANSFER_SLIP', 'INCIDENT_REPORT', 'UCEP_REPORT'] as const;
type DocKind = (typeof DOC_KINDS)[number];
const SUPPORTED: readonly DocKind[] = ['BORROW_SLIP', 'TRANSFER_SLIP', 'RETURN_SLIP'];
const REF_TYPE: Partial<Record<DocKind, string>> = {
  BORROW_SLIP: 'borrow_leg',
  TRANSFER_SLIP: 'allocation_line',
  RETURN_SLIP: 'return_receipt',
};

interface Party {
  hospitalId: string;
  code: string;
  name: string;
  address: string | null;
}
interface DraftLine {
  drugName: string | null;
  code: string | null;
  baseUnit: string | null;
  lotNo: string | null;
  expiryDate: string | null;
  qty: number;
  coldChain: boolean;
}
interface Draft {
  issuer: Party; // hospital that issues / owns the document (sender)
  counterparty: Party;
  lines: DraftLine[];
  deliveryColdChain: boolean;
  returnDueDate?: string;
  /** `BR-2026-000126 · รอบ 1` / `AP-2026-000041 · บรรทัด 2` — what the slip refers to. */
  refLabel: string | null;
  note?: string;
}

const DRUG_NAME = `concat_ws(' ', dm.generic_name, dm.strength, dm.dosage_form)`;
const PARTY_SQL = `h.id AS hospital_id, h.code, h.name_th AS name, h.address`;
const party = (row: Record<string, any>, prefix = ''): Party => ({
  hospitalId: row[`${prefix}hospital_id`],
  code: row[`${prefix}code`],
  name: row[`${prefix}name`],
  address: row[`${prefix}address`] ?? null,
});

async function hospitalParty(db: Db, id: string): Promise<Party> {
  const result = await db.query(`SELECT ${PARTY_SQL} FROM hospital h WHERE h.id = $1`, [id]);
  if (!result.rows[0]) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบโรงพยาบาล');
  return party(result.rows[0]);
}

async function draftBorrowSlip(db: Db, legId: string): Promise<Draft> {
  const leg = (
    await db.query(
      `SELECT bl.id, bl.status::text AS status, bl.lender_hospital_id, br.borrower_hospital_id, br.request_no, bl.round_no,
              COALESCE(bl.qty_received, bl.qty_accepted)::float8 AS qty, bl.request_item_id, bl.request_id
         FROM borrow_leg bl JOIN borrow_request br ON br.id = bl.request_id WHERE bl.id = $1`,
      [legId],
    )
  ).rows[0];
  if (!leg) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบรอบการยืม');
  if (!['ACCEPTED', 'PARTIAL', 'LOADED', 'IN_TRANSIT', 'RECEIVED'].includes(leg.status)) {
    throw new HttpError(409, 'VALIDATION', 'ออกเอกสารได้หลังผู้ให้ยืมตอบรับแล้วเท่านั้น');
  }
  const lines = (
    await db.query(
      `SELECT COALESCE(${DRUG_NAME}, kt.name) AS drug_name, hd.local_code AS code, COALESCE(dm.base_unit, 'ชุด') AS base_unit,
              COALESCE(dm.is_cold_chain, kt.needs_cold_chain, false) AS cold_chain, sl.lot_no, sl.expiry_date::text AS expiry_date,
              COALESCE(x.qty, $2::numeric)::float8 AS qty
         FROM borrow_leg bl
         LEFT JOIN borrow_request_item i ON i.id = COALESCE(bl.request_item_id, (SELECT min(y.id::text)::uuid FROM borrow_request_item y WHERE y.request_id = bl.request_id))
         LEFT JOIN drug_master dm ON dm.id = i.drug_master_id
         LEFT JOIN kit_type kt ON kt.id = i.kit_type_id
         LEFT JOIN borrow_leg_lot x ON x.leg_id = bl.id
         LEFT JOIN stock_lot sl ON sl.id = x.lot_id
         LEFT JOIN hospital_drug hd ON hd.id = sl.hospital_drug_id
        WHERE bl.id = $1 ORDER BY sl.expiry_date NULLS LAST, sl.lot_no`,
      [legId, leg.qty],
    )
  ).rows;
  const due =
    (await db.query(`SELECT due_date::text AS d FROM return_obligation WHERE leg_id = $1`, [legId])).rows[0]?.d ??
    (await db.query(`SELECT (current_date + $1::int)::text AS d`, [await getSetting<number>(db, 'return.default_days', 30)])).rows[0].d;
  return {
    issuer: await hospitalParty(db, leg.lender_hospital_id),
    counterparty: await hospitalParty(db, leg.borrower_hospital_id),
    lines: lines.map(toLine),
    deliveryColdChain: lines.some((l) => l.cold_chain),
    returnDueDate: due,
    refLabel: `${leg.request_no} · รอบ ${leg.round_no}`,
  };
}

async function draftTransferSlip(db: Db, lineId: string): Promise<Draft> {
  const row = (
    await db.query(
      `SELECT al.receiver_hospital_id, al.qty::float8 AS qty, al.cold_chain AS line_cold, sl.hospital_id AS sender_id, ap.plan_no,
              (SELECT count(*) FROM allocation_line x WHERE x.plan_id = al.plan_id AND x.id <= al.id) AS line_no,
              ${DRUG_NAME} AS drug_name, hd.local_code AS code, dm.base_unit, dm.is_cold_chain AS cold_chain, sl.lot_no, sl.expiry_date::text AS expiry_date
         FROM allocation_line al
         JOIN allocation_plan ap ON ap.id = al.plan_id
         JOIN pool_entry pe ON pe.id = ap.pool_entry_id
         JOIN near_expiry_item ne ON ne.id = pe.near_expiry_item_id
         JOIN stock_lot sl ON sl.id = ne.lot_id
         JOIN hospital_drug hd ON hd.id = sl.hospital_drug_id
         JOIN drug_master dm ON dm.id = hd.drug_master_id
        WHERE al.id = $1`,
      [lineId],
    )
  ).rows[0];
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบบรรทัดแผนจัดสรร');
  return {
    issuer: await hospitalParty(db, row.sender_id),
    counterparty: await hospitalParty(db, row.receiver_hospital_id),
    lines: [toLine(row)],
    deliveryColdChain: Boolean(row.line_cold || row.cold_chain),
    refLabel: `${row.plan_no} · บรรทัด ${row.line_no}`,
  };
}

async function draftReturnSlip(db: Db, receiptId: string): Promise<Draft> {
  const row = (
    await db.query(
      `SELECT ro.debtor_hospital_id, ro.creditor_hospital_id, br.request_no, rr.qty_base::float8 AS qty, ${DRUG_NAME} AS drug_name, dm.base_unit,
              dm.is_cold_chain AS cold_chain, sl.lot_no, sl.expiry_date::text AS expiry_date, NULL::text AS code
         FROM return_receipt rr
         JOIN return_obligation ro ON ro.id = rr.obligation_id
         JOIN borrow_leg bl ON bl.id = ro.leg_id
         JOIN borrow_request br ON br.id = bl.request_id
         JOIN drug_master dm ON dm.id = rr.drug_master_id
         LEFT JOIN stock_lot sl ON sl.id = rr.lot_id
        WHERE rr.id = $1`,
      [receiptId],
    )
  ).rows[0];
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบรายการรับคืน');
  return {
    issuer: await hospitalParty(db, row.debtor_hospital_id),
    counterparty: await hospitalParty(db, row.creditor_hospital_id),
    lines: [toLine(row)],
    deliveryColdChain: Boolean(row.cold_chain),
    refLabel: `${row.request_no} · คืนยา`,
  };
}

const toLine = (row: Record<string, any>): DraftLine => ({
  drugName: row.drug_name ?? null,
  code: row.code ?? null,
  baseUnit: row.base_unit ?? null,
  lotNo: row.lot_no ?? null,
  expiryDate: row.expiry_date ?? null,
  qty: Number(row.qty),
  coldChain: Boolean(row.cold_chain),
});

/** DR-<hospital code>-<yyyy>-<seq6> (BR-XC-007), serialised per hospital + year. */
async function nextDocNo(client: Db, hospitalCode: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `DR-${hospitalCode}-${year}-`;
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [prefix]);
  const last = await client.query(`SELECT max(substring(doc_no FROM '[0-9]+$')::int) AS n FROM document WHERE doc_no LIKE $1`, [`${prefix}%`]);
  return `${prefix}${String(Number(last.rows[0].n ?? 0) + 1).padStart(6, '0')}`;
}

const DOC_SELECT = `
  SELECT d.id, d.doc_no, d.kind, d.version, d.status, d.ref_type, d.ref_id, d.sha256, d.s3_key, d.payload, d.created_at,
         d.supersedes_id, d.hospital_id, h.code AS hospital_code, d.counterparty_hospital_id, c.code AS counterparty_code
    FROM document d
    LEFT JOIN hospital h ON h.id = d.hospital_id
    LEFT JOIN hospital c ON c.id = d.counterparty_hospital_id`;

const view = (row: Record<string, any>, withPayload: boolean) => ({
  id: row.id,
  docNo: row.doc_no,
  kind: row.kind as DocKind,
  version: Number(row.version),
  status: row.status,
  refType: row.ref_type,
  refId: row.ref_id,
  hospital: row.hospital_id ? { id: row.hospital_id, code: row.hospital_code } : null,
  counterparty: row.counterparty_hospital_id ? { id: row.counterparty_hospital_id, code: row.counterparty_code } : null,
  sha256: row.sha256,
  downloadUrl: null as string | null,
  createdAt: new Date(row.created_at).toISOString(),
  supersedesId: row.supersedes_id,
  ...(withPayload ? { payload: row.payload } : {}),
});

/** Region-wide users (no hospital) may read all; everyone else only documents their hospital issued or received. */
function visibleTo(user: AuthSessionUser): { sql: string; params: unknown[] } {
  return user.hospitalId
    ? { sql: `(d.hospital_id = $1 OR d.counterparty_hospital_id = $1)`, params: [user.hospitalId] }
    : { sql: `true`, params: [] };
}

export class DocumentsService {
  async get(user: AuthSessionUser, rawId: string) {
    const id = uuidParam(rawId, 'id');
    const scope = visibleTo(user);
    const result = await query(`${DOC_SELECT} WHERE d.id = $${scope.params.length + 1} AND ${scope.sql}`, [...scope.params, id]);
    if (!result.rows[0]) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบเอกสาร');
    const data = view(result.rows[0], true);
    return { ok: true, id: data.id, version: data.version, data };
  }

  async list(user: AuthSessionUser, raw: Record<string, unknown>) {
    const page = parsePage(raw);
    const kind = oneOf(raw.kind, DOC_KINDS, 'kind');
    const status = oneOf(raw.status, ['ISSUED', 'VOID'] as const, 'status');
    const scope = visibleTo(user);
    const params: unknown[] = [...scope.params];
    const where = [scope.sql];
    if (kind) where.push(`d.kind = $${params.push(kind)}`);
    if (status) where.push(`d.status = $${params.push(status)}`);
    params.push(page.limit + 1, page.offset);
    const result = await query(
      `${DOC_SELECT} WHERE ${where.join(' AND ')} ORDER BY d.created_at DESC, d.id LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const slice = toPage(result.rows, page);
    return { ok: true, items: slice.items.map((row) => view(row, true)), nextCursor: slice.nextCursor };
  }

  /** API-XC-002: generate (or return the existing) document for a reference. */
  async create(req: Request) {
    const user = req.user!;
    const body = bodyObject(req.body);
    const kind = oneOf(body.kind, DOC_KINDS, 'kind');
    if (!kind) throw new HttpError(400, 'VALIDATION', 'ต้องระบุ kind');
    if (!SUPPORTED.includes(kind)) throw new HttpError(422, 'VALIDATION', `ยังไม่รองรับเอกสารชนิด ${kind}`);
    const refId = uuidParam(body.refId, 'refId');
    const refType = REF_TYPE[kind]!;
    if (body.refType !== undefined && body.refType !== refType) {
      throw new HttpError(400, 'VALIDATION', `refType ของ ${kind} ต้องเป็น ${refType}`);
    }
    const mine = user.hospitalId;
    if (!mine) throw new HttpError(403, 'FORBIDDEN', 'ผู้ใช้ระดับเขตออกเอกสารไม่ได้');

    return withTransaction(async (client) => {
      const existing = await client.query(`${DOC_SELECT} WHERE d.kind = $1 AND d.ref_type = $2 AND d.ref_id = $3 AND d.status = 'ISSUED' ORDER BY d.version DESC LIMIT 1`, [kind, refType, refId]);
      const draft =
        existing.rows[0] ? null : kind === 'BORROW_SLIP' ? await draftBorrowSlip(client, refId) : kind === 'TRANSFER_SLIP' ? await draftTransferSlip(client, refId) : await draftReturnSlip(client, refId);
      const parties = existing.rows[0]
        ? [existing.rows[0].hospital_id, existing.rows[0].counterparty_hospital_id]
        : [draft!.issuer.hospitalId, draft!.counterparty.hospitalId];
      if (!parties.includes(mine)) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบข้อมูลอ้างอิง');
      if (existing.rows[0]) {
        const data = view(existing.rows[0], true);
        return { ok: true, id: data.id, version: data.version, data, existing: true };
      }
      const d = draft!;
      const issuedAt = new Date().toISOString();
      const docNo = await nextDocNo(client, d.issuer.code);
      const payload = {
        docNo,
        kind,
        issuedAt,
        refLabel: d.refLabel,
        partyA: d.issuer,
        partyB: d.counterparty,
        lines: d.lines,
        delivery: { coldChain: d.deliveryColdChain, instruction: d.deliveryColdChain ? 'ขนส่งในกล่องเย็น 2-8 °C (BR-F2a-026)' : 'ขนส่งปกติ' },
        ...(d.returnDueDate ? { returnTerms: { mode: 'IN_KIND', dueDate: d.returnDueDate, text: 'คืนในรูปยาชนิดและจำนวนเดียวกัน (ASM-24)' } } : {}),
        signatures: ['ผู้ส่งมอบ', 'ผู้รับมอบ'],
      };
      const sha256 = crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');
      const inserted = await client.query(
        `INSERT INTO document (kind, ref_type, ref_id, hospital_id, counterparty_hospital_id, doc_no, version, s3_key, sha256, payload)
         VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8, $9::jsonb) RETURNING id`,
        [kind, refType, refId, d.issuer.hospitalId, d.counterparty.hospitalId, docNo, `documents/${docNo}/v1.json`, sha256, JSON.stringify(payload)],
      );
      await writeAudit(client, auditContext(req), {
        action: 'DOCUMENT_ISSUED',
        entityType: 'document',
        entityId: inserted.rows[0].id,
        after: { docNo, kind, refType, refId },
      });
      const row = (await client.query(`${DOC_SELECT} WHERE d.id = $1`, [inserted.rows[0].id])).rows[0];
      const data = view(row, true);
      return { ok: true, id: data.id, version: data.version, data, existing: false };
    });
  }
}

export const documentsService = new DocumentsService();
