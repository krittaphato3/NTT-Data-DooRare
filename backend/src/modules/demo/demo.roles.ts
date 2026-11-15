/**
 * Demo "work in progress" for the role screens, so the first look is not empty: a few borrow requests at different stages
 * (waiting for the borrower's pharmacist, waiting for a lender's answer, accepted and waiting for the warehouse to pack) and one running
 * emergency incident with an approved plan (kit packing tasks for the warehouse, emergency borrow legs waiting at the lenders).
 *
 * Everything goes through the real API as the real roles (pharmacist / ER staff), so every table stays consistent (requests, legs, transport
 * tasks, kit tasks, holds on lender lots, audit). It only ADDS: each item has a fixed reason / description and is skipped while an
 * unfinished one with the same text exists, so running it again adds nothing. Drugs are chosen away from the F1 / F2 demo (no stock
 * alert, no seeded near-expiry lot, no waiting near-expiry lot anywhere, no unfinished request of the same drug).
 */
import type pg from 'pg';

/** How the engine reaches the running backend: its /api/v1 base and a login for a seeded user (token). */
export interface RolesApi {
  base: string;
  login(email: string): Promise<string>;
}

type Reply = { status: number; json: any };

const IN_FLIGHT = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'IN_PROGRESS', 'PARTIALLY_FULFILLED', 'ESCALATED'];
const RUNNING_INCIDENT = ['OPEN', 'PLAN_REVIEW', 'ACTIVE'];

type BorrowScenario = { key: string; borrower: string; stage: 'pending' | 'sent' | 'accepted'; reason: string; share: number };
/** reasons are shown to the users, so they read like a pharmacist wrote them */
const BORROW: BorrowScenario[] = [
  { key: 'B1', borrower: 'HB', stage: 'pending', reason: 'สต็อกลดลงเร็วกว่าที่คาด ขอยืมเสริมก่อนรอบสั่งซื้อ', share: 0.25 },
  { key: 'B2', borrower: 'HC', stage: 'sent', reason: 'ผู้ป่วยนอกเพิ่มขึ้นช่วงเปลี่ยนฤดู สต็อกไม่พอถึงรอบจัดส่ง', share: 0.2 },
  { key: 'B3', borrower: 'HA', stage: 'accepted', reason: 'ยาในคลังเหลือน้อยก่อนรอบจัดซื้อถัดไป ขอยืมไปก่อน', share: 0.2 },
];
const INCIDENT = {
  hospital: 'HC',
  type: 'อุบัติเหตุรถชนหมู่',
  description: 'รถตู้ชนรถบรรทุกบนถนนสายหลัก คาดผู้บาดเจ็บหลายราย',
  location: 'ถนนสุขุมวิท กม.30',
  base: { RED: 3, YELLOW: 6, GREEN: 10 },
};

export async function seedRoleTasks(o: { db: pg.Pool; api: RolesApi; log: (line: string) => void }): Promise<string[]> {
  const { db, api } = o;
  const ok = (s: string) => o.log('  ok  ' + s);
  const warn = (s: string) => o.log('  !!  ' + s);
  const out: string[] = [];
  const tokens: Record<string, string> = {};
  const as = async (email: string) => (tokens[email] ??= await api.login(email));
  const call = async (token: string, method: string, path: string, body?: unknown): Promise<Reply> => {
    const r = await fetch(api.base + path, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(method === 'GET' ? {} : { 'Idempotency-Key': crypto.randomUUID() }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, json: await r.json().catch(() => null) };
  };
  const fail = (what: string, r: Reply) => `${what}: ${r.status} ${r.json?.title ?? r.json?.message ?? ''}`.trim();
  const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows;

  const usedDrugs = new Set<string>();

  for (const sc of BORROW) {
    const exists = await q(
      `SELECT 1 FROM borrow_request br JOIN hospital h ON h.id = br.borrower_hospital_id
        WHERE h.code = $1 AND br.reason = $2 AND br.status::text = ANY($3::text[]) LIMIT 1`,
      [sc.borrower, sc.reason, IN_FLIGHT],
    );
    if (exists.length > 0) { ok(`${sc.key} ${sc.borrower}: already there`); continue; }

    // drugs the borrower lists (mapped, forecast, not blood / cold chain / controlled / VED D) that stay clear of the F1 / F2 demo
    const cands = await q(
      `SELECT dm.id AS drug_id, dm.generic_name AS name, f.total_target::float8 AS target
         FROM hospital_drug hd
         JOIN hospital h ON h.id = hd.hospital_id AND h.code = $1 AND h.active
         JOIN drug_master dm ON dm.id = hd.drug_master_id AND NOT dm.is_blood_product AND NOT dm.is_cold_chain AND NOT dm.is_controlled
         JOIN drug_mapping m ON m.hospital_drug_id = hd.id AND m.status = 'VERIFIED'
         JOIN v_latest_forecast f ON f.hospital_drug_id = hd.id AND f.granularity = 'WEEK' AND f.u_per_day >= 2 AND f.total_target IS NOT NULL
        WHERE hd.active AND hd.ved::text <> 'D'
          AND NOT EXISTS (SELECT 1 FROM stock_alert a WHERE a.hospital_drug_id = hd.id AND a.type = 'LOW_STOCK' AND a.status IN ('OPEN','ACKNOWLEDGED','LINKED_TO_REQUEST','SNOOZED'))
          AND NOT EXISTS (SELECT 1 FROM borrow_request br JOIN borrow_request_item i ON i.request_id = br.id
                           WHERE br.borrower_hospital_id = hd.hospital_id AND i.drug_master_id = dm.id AND br.status::text = ANY($3::text[]))
          AND dm.id NOT IN (SELECT x.drug_master_id FROM stock_lot l JOIN hospital_drug x ON x.id = l.hospital_drug_id WHERE l.lot_no LIKE 'DEMO-F2%')
          AND NOT EXISTS (SELECT 1 FROM near_expiry_item ne JOIN stock_lot sl ON sl.id = ne.lot_id JOIN hospital_drug x ON x.id = sl.hospital_drug_id
                           WHERE ne.status = 'DETECTED' AND x.drug_master_id = dm.id)
        ORDER BY md5(dm.id::text || $2) LIMIT 10`,
      [sc.borrower, sc.key, IN_FLIGHT],
    );

    const pharm = await as(`pharmacist1.${sc.borrower.toLowerCase()}@example.org`);
    let done = false;
    for (const d of cands) {
      if (usedDrugs.has(d.drug_id)) continue;
      const qty = Math.max(10, Math.round(d.target * sc.share));
      const created = await call(pharm, 'POST', '/borrow-requests', { context: 'MANUAL', reason: sc.reason, items: [{ drugMasterId: d.drug_id, qtyRequested: qty }] });
      const id = created.json?.data?.id as string | undefined;
      if (created.status >= 300 || !id) { warn(fail(`${sc.key} ${sc.borrower} ${d.name}`, created)); continue; }
      const prop = await call(pharm, 'POST', `/borrow-requests/${id}/propose`, {});
      const ladder = (prop.json?.data?.proposal?.ladder ?? []) as unknown[];
      if (prop.status >= 300 || ladder.length === 0) {
        o.log(`      skip ${d.name}: ${prop.status >= 300 ? fail('propose', prop) : 'no lender can send it'}`);
        await call(pharm, 'POST', `/borrow-requests/${id}/cancel`, { reason: 'ไม่มีผู้ให้ยืมที่ส่งได้' });
        continue;
      }
      usedDrugs.add(d.drug_id);
      const no = created.json.data.requestNo as string;
      if (sc.stage === 'pending') {
        ok(`${no} ${sc.borrower} ขอยืม ${d.name} ${qty}: รอ ${sc.borrower} อนุมัติ`);
        out.push(`${sc.borrower} ขอยืม ${d.name} ${qty.toLocaleString()} (${no}): รอเภสัชกร ${sc.borrower} อนุมัติ`);
        done = true;
        break;
      }
      const appr = await call(pharm, 'POST', `/borrow-requests/${id}/approve`, {});
      if (appr.status >= 300) { warn(fail(`${no} approve`, appr)); await call(pharm, 'POST', `/borrow-requests/${id}/cancel`, { reason: 'ยกเลิกคำขอทดสอบ' }); continue; }
      const detail = await call(pharm, 'GET', `/borrow-requests/${id}`);
      const leg = (detail.json?.data?.legs ?? []).find((l: any) => l.status === 'SENT');
      const lender = leg?.lender?.code as string | undefined;
      if (!leg || !lender) { warn(`${no}: sent but no waiting leg found`); done = true; break; }
      if (sc.stage === 'sent') {
        ok(`${no} ${sc.borrower} ขอยืม ${d.name} ${qty}: ส่งถึง ${lender} รอตอบรับ`);
        out.push(`${sc.borrower} ขอยืม ${d.name} ${qty.toLocaleString()} (${no}): ส่งถึง ${lender} รอเภสัชกร ${lender} ตอบรับ`);
        done = true;
        break;
      }
      const lenderToken = await as(`pharmacist1.${lender.toLowerCase()}@example.org`);
      const resp = await call(lenderToken, 'POST', `/borrow-legs/${leg.id}/respond`, { decision: 'ACCEPT' });
      if (resp.status >= 300) { warn(fail(`${no} ${lender} respond`, resp)); done = true; break; }
      ok(`${no} ${sc.borrower} ขอยืม ${d.name} ${qty}: ${lender} ตอบรับแล้ว รอคลังแพ็กส่ง`);
      out.push(`${sc.borrower} ขอยืม ${d.name} ${qty.toLocaleString()} (${no}): ${lender} ตอบรับแล้ว รอคลัง ${lender} แพ็กส่ง`);
      done = true;
      break;
    }
    if (!done) warn(`${sc.key} ${sc.borrower}: no suitable drug found`);
  }

  // ---- one running emergency incident
  const running = await q(
    `SELECT i.incident_no FROM incident i JOIN hospital h ON h.id = i.hospital_id
      WHERE h.code = $1 AND i.description = $2 AND i.status::text = ANY($3::text[]) LIMIT 1`,
    [INCIDENT.hospital, INCIDENT.description, RUNNING_INCIDENT],
  );
  if (running.length > 0) {
    ok(`emergency ${INCIDENT.hospital}: ${running[0].incident_no} already running`);
    return out;
  }
  try {
    const er = await as(`er_staff1.${INCIDENT.hospital.toLowerCase()}@example.org`);
    const made = await call(er, 'POST', '/incidents', {
      incidentType: INCIDENT.type, description: INCIDENT.description, locationText: INCIDENT.location,
      counts: INCIDENT.base, reportedEtaMin: 25, acknowledgeDuplicate: true,
    });
    const inc = made.json?.data as { id: string; incidentNo: string; version?: number } | undefined;
    if (made.status >= 300 || !inc) { warn(fail('emergency create', made)); return out; }

    // raise the patient counts until the plan needs a few borrowed lines (1-4), so the lenders get some emergency requests to answer
    let lines = 0;
    for (let k = 1; k <= 10; k++) {
      if (k > 1) {
        const patch = await call(er, 'PATCH', `/incidents/${inc.id}/counts`, { counts: { RED: INCIDENT.base.RED * k, YELLOW: INCIDENT.base.YELLOW * k, GREEN: INCIDENT.base.GREEN * k } });
        if (patch.status >= 300) { warn(fail('emergency counts', patch)); break; }
      }
      const prev = await call(er, 'POST', `/incidents/${inc.id}/plan`, { preview: true });
      const sf = prev.json?.data?.plan?.shortfall;
      lines = Array.isArray(sf) ? sf.length : Number(sf?.items?.length ?? 0);
      if (lines >= 1) break;
    }
    o.log(`      emergency plan needs ${lines} borrowed line(s)`);
    const plan = await call(er, 'POST', `/incidents/${inc.id}/plan`, {});
    const planId = plan.json?.data?.plan?.id as string | undefined;
    if (plan.status >= 300 || !planId) { warn(fail('emergency plan', plan)); return out; }
    const appr = await call(er, 'POST', `/incidents/${inc.id}/plan/approve`, { planId });
    if (appr.status >= 300) { warn(fail('emergency approve', appr)); return out; }
    let sent = 0;
    if (lines >= 1 && lines <= 4) {
      const send = await call(er, 'POST', `/incidents/${inc.id}/emergency-borrow`, {});
      if (send.status >= 300) warn(fail('emergency borrow', send));
      else sent = (send.json?.data?.created ?? []).length;
    } else if (lines > 4) {
      warn(`emergency: the plan needs ${lines} borrowed lines, not sent (kept small); the ER screen can send them`);
    }
    ok(`emergency ${inc.incidentNo} at ${INCIDENT.hospital}: plan approved, ${sent} borrow request(s) sent`);
    out.push(`เหตุฉุกเฉิน ${inc.incidentNo} ที่ ${INCIDENT.hospital}: แผนอนุมัติแล้ว มีงานแพ็กชุดยาของคลัง${sent > 0 ? ` และส่งคำขอยืมฉุกเฉิน ${sent} รายการรอผู้ให้ยืมตอบ` : ''}`);
  } catch (e) {
    warn(`emergency: ${(e as Error).message}`);
  }
  return out;
}
