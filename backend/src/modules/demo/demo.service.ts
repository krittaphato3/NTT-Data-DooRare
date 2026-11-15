import { pool, query } from '../../db/client.js';
import { runExpiryJobs } from '../expiry/expiry.routes.js';
import { loadForecastRuns, reevaluateAlerts } from '../forecasts/forecasts.runs.js';
import { systemAuditContext } from '../../core/audit.js';

export interface DbStats {
  hospitals: number;
  drugs: number;
  totalLots: number;
  demoLots: number;
  activeAlerts: number;
  borrowRequests: number;
  nearExpiryDetected: number;
  nearExpiryPool: number;
  allocationPlans: number;
  isNetworkSplit: boolean;
  /** which database this backend writes to (for the banner on the demo page) */
  database: { host: string; name: string; local: boolean };
  networks: { code: string; name: string; network: string }[];
}

export interface DemoOperationResult {
  success: boolean;
  message: string;
  logs: string[];
  stats: DbStats;
}

export class DemoService {
  /**
   * Retrieves live database counts and network distribution status.
   */
  static async getStats(): Promise<DbStats> {
    const [
      hospRes,
      drugRes,
      lotsRes,
      demoLotsRes,
      alertsRes,
      reqsRes,
      neDetectedRes,
      nePoolRes,
      plansRes,
      networksRes,
    ] = await Promise.all([
      query(`SELECT count(*)::int AS count FROM hospital WHERE active`),
      query(`SELECT count(*)::int AS count FROM drug_master`),
      query(`SELECT count(*)::int AS count FROM stock_lot WHERE qty_on_hand > 0`),
      query(`SELECT count(*)::int AS count FROM stock_lot WHERE lot_no LIKE 'DEMO%' AND qty_on_hand > 0`),
      query(`SELECT count(*)::int AS count FROM stock_alert WHERE status = 'OPEN'`),
      query(`SELECT count(*)::int AS count FROM borrow_request WHERE status NOT IN ('FULFILLED', 'CLOSED_UNFULFILLED', 'CANCELLED')`),
      query(`SELECT count(*)::int AS count FROM near_expiry_item WHERE status = 'DETECTED'`),
      query(`SELECT count(*)::int AS count FROM near_expiry_item WHERE status = 'RELEASED_TO_POOL'`),
      query(`SELECT count(*)::int AS count FROM allocation_plan`),
      query(`SELECT h.code, h.name_th AS name, n.name AS network FROM hospital h JOIN network n ON n.id = h.network_id ORDER BY h.code`),
    ]);

    const networks = networksRes.rows.map((r: any) => ({
      code: r.code,
      name: r.name,
      network: r.network,
    }));

    const isNetworkSplit = networks.some(
      (n: any) => (n.code === 'HD' || n.code === 'HE') && n.network.includes('B'),
    );

    return {
      hospitals: hospRes.rows[0]?.count || 0,
      drugs: drugRes.rows[0]?.count || 0,
      totalLots: lotsRes.rows[0]?.count || 0,
      demoLots: demoLotsRes.rows[0]?.count || 0,
      activeAlerts: alertsRes.rows[0]?.count || 0,
      borrowRequests: reqsRes.rows[0]?.count || 0,
      nearExpiryDetected: neDetectedRes.rows[0]?.count || 0,
      nearExpiryPool: nePoolRes.rows[0]?.count || 0,
      allocationPlans: plansRes.rows[0]?.count || 0,
      isNetworkSplit,
      database: {
        host: process.env.DB_HOST || '127.0.0.1',
        name: process.env.DB_NAME || 'doorare',
        local: ['127.0.0.1', 'localhost', '::1', 'db'].includes(process.env.DB_HOST || '127.0.0.1'),
      },
      networks,
    };
  }

  /**
   * Toggles network partitioning:
   * - split=true: places HD and HE in 'เครือข่ายตัวอย่าง B' (inter-network approvals required)
   * - split=false: puts all hospitals back in 'เครือข่ายทดสอบ' (Network A)
   */
  static async toggleNetworks(split: boolean): Promise<DemoOperationResult> {
    const logs: string[] = [];
    const ts = new Date().toISOString().substring(11, 19);

    if (split) {
      logs.push(`[${ts}] INFO: Starting Network Split operation...`);
      // Ensure Network B exists
      await query(`
        INSERT INTO network (region_id, name, auto_approve)
        SELECT h.region_id, 'เครือข่ายตัวอย่าง B', true
          FROM hospital h
         WHERE h.code = 'HD'
           AND NOT EXISTS (SELECT 1 FROM network n WHERE n.name = 'เครือข่ายตัวอย่าง B');
      `);
      logs.push(`[${ts}] OK: Verified 'เครือข่ายตัวอย่าง B' exists in database.`);

      // Move HD and HE to Network B
      const updateRes = await query(`
        UPDATE hospital h
           SET network_id = (SELECT id FROM network WHERE name = 'เครือข่ายตัวอย่าง B'),
               updated_at = now(),
               version = version + 1
         WHERE h.code IN ('HD', 'HE')
           AND h.network_id IS DISTINCT FROM (SELECT id FROM network WHERE name = 'เครือข่ายตัวอย่าง B');
      `);
      logs.push(`[${ts}] OK: Moved HD (บางบ่อ) and HE (บางเสาธง) to 'เครือข่ายตัวอย่าง B' (${updateRes.rowCount} hospitals updated).`);
      logs.push(`[${ts}] OK: Near-expiry allocation plans involving HD/HE will now require manual approval on 'แผนรอเห็นชอบ'.`);
    } else {
      logs.push(`[${ts}] INFO: Restoring unified single network...`);
      const updateRes = await query(`
        UPDATE hospital h
           SET network_id = (SELECT id FROM network WHERE name = 'เครือข่ายทดสอบ' LIMIT 1),
               updated_at = now(),
               version = version + 1
         WHERE h.code IN ('HD', 'HE');
      `);
      logs.push(`[${ts}] OK: Reunified HD and HE into 'เครือข่ายทดสอบ' (${updateRes.rowCount} hospitals updated).`);
    }

    const stats = await this.getStats();
    return {
      success: true,
      message: split ? 'แยกเครือข่าย B สำเร็จ' : 'รวมเครือข่ายสำเร็จ',
      logs,
      stats,
    };
  }

  /**
   * Safely purges seeded demo lots and related records.
   */
  static async cleanDemoData(): Promise<DemoOperationResult> {
    const logs: string[] = [];
    const ts = () => new Date().toISOString().substring(11, 19);
    logs.push(`[${ts()}] INFO: Purging demo records...`);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Delete demo transport photos and tasks
      const delPhotos = await client.query(`
        DELETE FROM transport_photo
        WHERE task_id IN (
          SELECT id FROM transport_task WHERE ref_id IN (
            SELECT id FROM borrow_leg WHERE request_id IN (
              SELECT id FROM borrow_request WHERE reason LIKE 'DEMO%' OR request_no LIKE 'BR-DEMO%'
            )
          )
        );
      `);
      logs.push(`[${ts()}] OK: Deleted ${delPhotos.rowCount} demo transport photos.`);

      const delTasks = await client.query(`
        DELETE FROM transport_task
        WHERE ref_id IN (
          SELECT id FROM borrow_leg WHERE request_id IN (
            SELECT id FROM borrow_request WHERE reason LIKE 'DEMO%' OR request_no LIKE 'BR-DEMO%'
          )
        ) OR task_no LIKE 'TR-DEMO%';
      `);
      logs.push(`[${ts()}] OK: Deleted ${delTasks.rowCount} demo transport tasks.`);

      // 2. Delete demo borrow items and requests
      const delLegs = await client.query(`
        DELETE FROM borrow_leg
        WHERE request_id IN (SELECT id FROM borrow_request WHERE reason LIKE 'DEMO%' OR request_no LIKE 'BR-DEMO%');
      `);
      logs.push(`[${ts()}] OK: Deleted ${delLegs.rowCount} demo borrow legs.`);

      const delItems = await client.query(`
        DELETE FROM borrow_request_item
        WHERE request_id IN (SELECT id FROM borrow_request WHERE reason LIKE 'DEMO%' OR request_no LIKE 'BR-DEMO%');
      `);
      logs.push(`[${ts()}] OK: Deleted ${delItems.rowCount} demo borrow request items.`);

      const delReqs = await client.query(`
        DELETE FROM borrow_request WHERE reason LIKE 'DEMO%' OR request_no LIKE 'BR-DEMO%';
      `);
      logs.push(`[${ts()}] OK: Deleted ${delReqs.rowCount} demo borrow requests.`);

      // 3. Delete demo allocation plans & pool entries
      const delPlanItems = await client.query(`
        DELETE FROM allocation_line
        WHERE plan_id IN (SELECT id FROM allocation_plan WHERE plan_no LIKE 'DEMO%');
      `);
      logs.push(`[${ts()}] OK: Deleted ${delPlanItems.rowCount} demo allocation lines.`);

      const delPlans = await client.query(`
        DELETE FROM allocation_plan WHERE plan_no LIKE 'DEMO%';
      `);
      logs.push(`[${ts()}] OK: Deleted ${delPlans.rowCount} demo allocation plans.`);

      const delPool = await client.query(`
        DELETE FROM pool_entry
        WHERE near_expiry_item_id IN (
          SELECT id FROM near_expiry_item WHERE lot_id IN (
            SELECT id FROM stock_lot WHERE lot_no LIKE 'DEMO%'
          )
        );
      `);
      logs.push(`[${ts()}] OK: Deleted ${delPool.rowCount} demo pool entries.`);

      // 4. Delete demo near-expiry items
      const delNE = await client.query(`
        DELETE FROM near_expiry_item
        WHERE lot_id IN (SELECT id FROM stock_lot WHERE lot_no LIKE 'DEMO%');
      `);
      logs.push(`[${ts()}] OK: Deleted ${delNE.rowCount} demo near-expiry items.`);

      // 5. Delete demo stock ledger entries (temporarily disable append-only trigger for cleanup)
      await client.query(`ALTER TABLE stock_ledger DISABLE TRIGGER stock_ledger_ro;`);
      try {
        const delLedger = await client.query(`
          DELETE FROM stock_ledger
          WHERE ref_type LIKE 'DEMO%' OR reason::text LIKE 'DEMO%'
             OR lot_id IN (SELECT id FROM stock_lot WHERE lot_no LIKE 'DEMO%');
        `);
        logs.push(`[${ts()}] OK: Deleted ${delLedger.rowCount} demo stock ledger entries.`);
      } finally {
        await client.query(`ALTER TABLE stock_ledger ENABLE TRIGGER stock_ledger_ro;`);
      }

      // 6. Delete demo stock lots
      const delLots = await client.query(`
        DELETE FROM stock_lot WHERE lot_no LIKE 'DEMO%';
      `);
      logs.push(`[${ts()}] OK: Deleted ${delLots.rowCount} demo stock lots.`);

      await client.query('COMMIT');
      logs.push(`[${ts()}] OK: Database commit succeeded.`);
    } catch (err: any) {
      await client.query('ROLLBACK');
      logs.push(`[${ts()}] ERROR: Failed to purge demo data: ${err.message}`);
      throw err;
    } finally {
      client.release();
    }

    // Re-evaluate alerts after clean
    try {
      logs.push(`[${ts()}] INFO: Re-evaluating stock alerts...`);
      await reevaluateAlerts();
      logs.push(`[${ts()}] OK: Alert re-evaluation complete.`);
    } catch (e: any) {
      logs.push(`[${ts()}] WARN: Alert re-evaluation error: ${e.message}`);
    }

    const stats = await this.getStats();
    return {
      success: true,
      message: 'ล้างข้อมูล Demo สำเร็จ',
      logs,
      stats,
    };
  }

  /**
   * Seeds fresh near-expiry lots (F2) for HA, HB, and HC with 35, 45, 60, 75 day expiries.
   */
  static async seedDemoF2(): Promise<DemoOperationResult> {
    const logs: string[] = [];
    const ts = () => new Date().toISOString().substring(11, 19);
    logs.push(`[${ts()}] INFO: Seeding near-expiry lots (F2)...`);

    const client = await pool.connect();
    try {
      // Find candidate drugs for each hospital
      const candidateDrugs = await query(`
        SELECT dm.id AS drug_id, dm.generic_name AS name, h.code, hd.id AS hd_id, hd.hospital_id,
               COALESCE((SELECT pack_size_base_units FROM stock_lot WHERE hospital_drug_id = hd.id LIMIT 1), 10) AS pack
          FROM drug_master dm
          JOIN hospital_drug hd ON hd.drug_master_id = dm.id AND hd.active
          JOIN hospital h ON h.id = hd.hospital_id AND h.active
         WHERE h.code IN ('HA', 'HB', 'HC')
           AND NOT dm.is_blood_product AND NOT dm.is_cold_chain AND NOT dm.is_controlled
         ORDER BY h.code, dm.generic_name
         LIMIT 18
      `);

      if (candidateDrugs.rows.length === 0) {
        logs.push(`[${ts()}] WARN: No candidate drugs found.`);
      }

      const runSuffix = Date.now().toString().slice(-4);
      const days = [35, 45, 60, 75];
      let seededCount = 0;

      await client.query('BEGIN');
      for (let i = 0; i < candidateDrugs.rows.length; i++) {
        const d = candidateDrugs.rows[i];
        const lotNo = `DEMO-F2-${d.code}${runSuffix}-${i + 1}`;
        const expDay = days[i % days.length];
        const qty = 50 + (i % 5) * 20;

        const lotRes = await client.query(`
          INSERT INTO stock_lot(
            hospital_id, hospital_drug_id, lot_no, expiry_date,
            manufacturer, pack_size_base_units, qty_on_hand, updated_at
          )
          VALUES ($1, $2, $3, current_date + $4::int, 'องค์การเภสัชกรรม (Demo Seed)', $5, $6, now())
          RETURNING id;
        `, [d.hospital_id, d.hd_id, lotNo, expDay, d.pack, qty]);

        const lotId = lotRes.rows[0].id;
        await client.query(`
          INSERT INTO stock_ledger(hospital_id, lot_id, delta, reason, ref_type, occurred_at)
          VALUES ($1, $2, $3, 'IMPORT', 'DEMO_F2_IMPORT', now());
        `, [d.hospital_id, lotId, qty]);

        seededCount++;
        logs.push(`[${ts()}] OK: Created lot ${lotNo} for ${d.code} (${d.name}, ${qty} units, exp in ${expDay} days)`);
      }
      await client.query('COMMIT');
      logs.push(`[${ts()}] OK: Committed ${seededCount} near-expiry lots to stock.`);
    } catch (err: any) {
      await client.query('ROLLBACK');
      logs.push(`[${ts()}] ERROR: Failed creating F2 lots: ${err.message}`);
      throw err;
    } finally {
      client.release();
    }

    // Trigger near-expiry scan
    try {
      logs.push(`[${ts()}] INFO: Running near-expiry detection scan...`);
      const scanRes = await runExpiryJobs();
      logs.push(`[${ts()}] OK: Near-expiry scan complete. Detected: ${JSON.stringify(scanRes)}`);
    } catch (e: any) {
      logs.push(`[${ts()}] WARN: Near-expiry scan warning: ${e.message}`);
    }

    // Ensure forecast artifacts are loaded into the database so recipient feasibility (F-22) can be calculated
    try {
      const fcCount = await query(`SELECT count(*)::int AS n FROM forecast_result`);
      if (Number(fcCount.rows[0].n) === 0) {
        logs.push(`[${ts()}] INFO: Loading forecast artifacts into database...`);
        await loadForecastRuns(systemAuditContext(), 'BOTH');
        logs.push(`[${ts()}] OK: Forecast artifacts loaded successfully.`);
      }
    } catch (e: any) {
      logs.push(`[${ts()}] WARN: Forecast load notice: ${e.message}`);
    }

    // Auto-release 2 near-expiry lots to Central Pool for HA (Hospital A)
    // Prioritizing drugs with high regional deficit (e.g. Amlodipine, N95 respirator, Ascorbic acid)
    // so the feature "✨ ให้ Agent จัดสรรรอบนี้" in "คลังกลาง · แผนจัดสรร" appears immediately with active recipients
    try {
      const releaseItems = await query(`
        SELECT ne.id, ne.hospital_id, ne.lot_id, ne.qty, h.region_id, h.code, sl.lot_no, dm.generic_name
          FROM near_expiry_item ne
          JOIN hospital h ON h.id = ne.hospital_id
          JOIN stock_lot sl ON sl.id = ne.lot_id
          JOIN hospital_drug hd ON hd.id = sl.hospital_drug_id
          JOIN drug_master dm ON dm.id = hd.drug_master_id
         WHERE ne.status = 'DETECTED' AND h.code = 'HA'
         ORDER BY (dm.generic_name IN ('Amlodipine', 'N95 respirator', 'Ascorbic acid', 'IV catheter 18G')) DESC, ne.created_at DESC
         LIMIT 2;
      `);

      for (const item of releaseItems.rows) {
        const qty = Number(item.qty);
        await query(`UPDATE stock_lot SET qty_held = qty_held + $1 WHERE id = $2`, [qty, item.lot_id]);
        await query(`
          INSERT INTO pool_entry (region_id, near_expiry_item_id, qty_available)
          VALUES ($1, $2, $3)
          ON CONFLICT (near_expiry_item_id) DO UPDATE SET qty_available = EXCLUDED.qty_available, released_at = now()
        `, [item.region_id, item.id, qty]);
        await query(`
          UPDATE near_expiry_item
             SET status = 'RELEASED_TO_POOL', decided_at = now(), updated_at = now()
           WHERE id = $1
        `, [item.id]);
        logs.push(`[${ts()}] OK: Auto-released lot ${item.lot_no} (${item.generic_name}, ${qty} units) to Central Pool for ${item.code}.`);
      }
    } catch (e: any) {
      logs.push(`[${ts()}] WARN: Auto-release to pool warning: ${e.message}`);
    }

    const stats = await this.getStats();
    return {
      success: true,
      message: 'สร้างชุดข้อมูลยาใกล้หมดอายุ F2 สำเร็จ',
      logs,
      stats,
    };
  }

  /**
   * One-click complete seed:
   * 1. Seeds F2 lots (auto-approved, inter-network approval, and transport check)
   * 2. Scans near expiry items
   * 3. Shapes F1 stock alerts
   * 4. Re-evaluates forecasts & stock alerts
   */
  static async seedFull(): Promise<DemoOperationResult> {
    const logs: string[] = [];
    const ts = () => new Date().toISOString().substring(11, 19);
    logs.push(`[${ts()}] INFO: Starting Complete Demo Seed (F1 + F2)...`);

    // 1. Seed F2
    const f2Res = await this.seedDemoF2();
    logs.push(...f2Res.logs);

    // 2. Shape F1 low stock alerts
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      logs.push(`[${ts()}] INFO: Shaping F1 borrowable stock alerts for all 5 hospitals...`);

      const hospitals = await client.query(`SELECT id, code FROM hospital WHERE active ORDER BY code`);
      for (const h of hospitals.rows) {
        // Find 2 drugs to create low-stock conditions for
        const drugs = await client.query(`
          SELECT hd.id AS hd_id, dm.id AS drug_id, dm.generic_name AS name,
                 COALESCE((SELECT sum(qty_on_hand - qty_held) FROM stock_lot WHERE hospital_drug_id = hd.id), 0) AS current_stock
            FROM hospital_drug hd
            JOIN drug_master dm ON dm.id = hd.drug_master_id
           WHERE hd.hospital_id = $1 AND hd.active
             AND NOT dm.is_controlled AND NOT dm.is_blood_product
           LIMIT 2;
        `, [h.id]);

        for (const drug of drugs.rows) {
          const stock = Number(drug.current_stock);
          if (stock > 10) {
            const drainQty = Math.floor(stock * 0.85);
            // Record usage in ledger
            await client.query(`
              INSERT INTO stock_ledger(hospital_id, lot_id, delta, reason, ref_type, occurred_at)
              SELECT $1, id, -1 * LEAST(qty_on_hand, $3::numeric), 'ISSUE_USAGE', 'DEMO_F1_SHAPE', now()
                FROM stock_lot
               WHERE hospital_drug_id = $2 AND qty_on_hand > 0
               LIMIT 1;
            `, [h.id, drug.hd_id, drainQty]);

            // Update lot stock
            await client.query(`
              UPDATE stock_lot
                 SET qty_on_hand = GREATEST(0, qty_on_hand - $2::numeric),
                     updated_at = now()
               WHERE hospital_drug_id = $1 AND qty_on_hand > 0;
            `, [drug.hd_id, drainQty]);

            logs.push(`[${ts()}] OK: Reduced stock of ${drug.name} at ${h.code} by ${drainQty} to trigger LOW_STOCK alert.`);
          }
        }
      }
      await client.query('COMMIT');
    } catch (e: any) {
      await client.query('ROLLBACK');
      logs.push(`[${ts()}] WARN: F1 shaping warning: ${e.message}`);
    } finally {
      client.release();
    }

    // 3. Re-evaluate alerts
    try {
      logs.push(`[${ts()}] INFO: Running alert re-evaluation...`);
      await reevaluateAlerts();
      logs.push(`[${ts()}] OK: Alert re-evaluation finished.`);
    } catch (e: any) {
      logs.push(`[${ts()}] WARN: Alert re-evaluation error: ${e.message}`);
    }

    const stats = await this.getStats();
    return {
      success: true,
      message: 'สร้างชุดข้อมูลจำลองสมบูรณ์ (F1 + F2) สำเร็จ',
      logs,
      stats,
    };
  }

  /**
   * Seeds demo role scenarios for Pharmacist, ER, Warehouse, and Driver.
   */
  static async seedScenarios(): Promise<DemoOperationResult> {
    const logs: string[] = [];
    const ts = () => new Date().toISOString().substring(11, 19);
    logs.push(`[${ts()}] INFO: Seeding 4-role operational scenarios...`);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const hospRows = await client.query(`SELECT id, code FROM hospital WHERE active`);
      const hMap: Record<string, string> = {};
      for (const r of hospRows.rows) hMap[r.code] = r.id;

      if (!hMap['HA'] || !hMap['HB']) {
        throw new Error('Hospitals HA and HB must exist.');
      }

      const userRes = await client.query(`SELECT id FROM app_user WHERE active LIMIT 1`);
      const userId = userRes.rows[0]?.id;
      if (!userId) {
        throw new Error('An active app_user must exist in the database.');
      }

      // Pick a sample drug
      const drugRes = await client.query(`
        SELECT dm.id, dm.generic_name
          FROM drug_master dm
         WHERE NOT dm.is_controlled AND NOT dm.is_blood_product
         LIMIT 1;
      `);
      const sampleDrug = drugRes.rows[0];

      if (sampleDrug) {
        // Scenario 1: ER Staff - Pending Emergency Borrow Request
        const erReqRes = await client.query(`
          INSERT INTO borrow_request(
            request_no, borrower_hospital_id, context, status, urgency, reason, created_by, created_at, updated_at
          )
          VALUES ('BR-DEMO-' || floor(random() * 90000 + 10000)::text, $1, 'EMERGENCY', 'IN_PROGRESS', 'VERY_URGENT', 'DEMO: ขอยืมเร่งด่วนสำหรับห้องฉุกเฉิน ER', $2, now(), now())
          RETURNING id, request_no;
        `, [hMap['HA'], userId]);
        const reqId = erReqRes.rows[0].id;
        const reqNo = erReqRes.rows[0].request_no;

        const itemRes = await client.query(`
          INSERT INTO borrow_request_item(request_id, kind, drug_master_id, qty_requested)
          VALUES ($1, 'DRUG', $2, 25)
          RETURNING id;
        `, [reqId, sampleDrug.id]);
        const itemId = itemRes.rows[0].id;

        // Scenario 2 & 3: Warehouse & Driver - Borrow leg accepted and ready for dispatch / delivery
        const legRes = await client.query(`
          INSERT INTO borrow_leg(
            request_id, request_item_id, lender_hospital_id, rank_in_ladder, qty_asked, qty_accepted, status, sent_at, responded_at
          )
          VALUES ($1, $2, $3, 1, 25, 25, 'ACCEPTED', now(), now())
          RETURNING id;
        `, [reqId, itemId, hMap['HB']]);
        const legId = legRes.rows[0].id;

        const taskRes = await client.query(`
          INSERT INTO transport_task(
            ref_type, ref_id, from_hospital_id, to_hospital_id,
            status, task_no, created_at, updated_at
          )
          VALUES ('BORROW_LEG', $1, $2, $3, 'IN_TRANSIT', 'TR-DEMO-' || floor(random() * 90000 + 10000)::text, now(), now())
          RETURNING id, task_no;
        `, [legId, hMap['HB'], hMap['HA']]);

        logs.push(`[${ts()}] OK: [ER Scenario] Created emergency borrow request ${reqNo} (${sampleDrug.generic_name})`);
        logs.push(`[${ts()}] OK: [Warehouse/Driver Scenario] Created active transport task ${taskRes.rows[0].task_no} (HB -> HA)`);
      }

      await client.query('COMMIT');
      logs.push(`[${ts()}] OK: Role scenarios successfully created.`);
    } catch (e: any) {
      await client.query('ROLLBACK');
      logs.push(`[${ts()}] ERROR: Failed creating scenarios: ${e.message}`);
      throw e;
    } finally {
      client.release();
    }

    const stats = await this.getStats();
    return {
      success: true,
      message: 'สร้างงานจำลอง 4 บทบาทสำเร็จ',
      logs,
      stats,
    };
  }
}
