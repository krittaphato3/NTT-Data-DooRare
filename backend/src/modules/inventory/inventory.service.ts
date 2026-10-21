/**
 * Stock of one hospital, read-only. `view=lots` lists lots (FEFO order), `view=summary` totals per drug listing.
 * Quantities are base units. Changes only ever go through `core/stock.ts`.
 */
import { oneOf, parsePage, toPage } from '../../core/pagination.js';
import { hospitalForRead } from '../../core/scope.js';
import { optionalNumber, uuidParam } from '../../core/validate.js';
import { query } from '../../db/client.js';
import type { AuthSessionUser } from '../auth/auth.types.js';

const DRUG_NAME = `concat_ws(' ', dm.generic_name, dm.strength, dm.dosage_form)`;

export class InventoryService {
  async list(user: AuthSessionUser, raw: Record<string, unknown>) {
    const page = parsePage(raw);
    const view = oneOf(raw.view, ['lots', 'summary'] as const, 'view') ?? 'lots';
    const hospitalId = hospitalForRead(user, raw.hospitalId);
    const params: unknown[] = [hospitalId];
    const where = ['sl.hospital_id = $1'];
    if (raw.includeEmpty !== 'true') where.push('sl.qty_on_hand > 0');
    if (raw.hospitalDrugId !== undefined) where.push(`sl.hospital_drug_id = $${params.push(uuidParam(raw.hospitalDrugId, 'hospitalDrugId'))}`);
    const within = optionalNumber(raw.expiringWithinDays, 'expiringWithinDays', { min: 0, max: 3650 });
    if (within !== undefined) where.push(`sl.expiry_date <= current_date + $${params.push(within)}::int`);
    if (typeof raw.q === 'string' && raw.q.trim()) {
      params.push(`%${raw.q.trim()}%`);
      where.push(`(hd.local_code ILIKE $${params.length} OR hd.local_name ILIKE $${params.length} OR sl.lot_no ILIKE $${params.length})`);
    }
    const join = `FROM stock_lot sl JOIN hospital_drug hd ON hd.id = sl.hospital_drug_id LEFT JOIN drug_master dm ON dm.id = hd.drug_master_id
                  WHERE ${where.join(' AND ')}`;
    params.push(page.limit + 1, page.offset);
    const limit = `LIMIT $${params.length - 1} OFFSET $${params.length}`;

    if (view === 'summary') {
      const result = await query(
        `SELECT hd.id, hd.local_code, hd.local_name, hd.local_unit, hd.ved::text AS ved, hd.abc::text AS abc,
                hd.min_level::float8 AS min_level, hd.max_level::float8 AS max_level, ${DRUG_NAME} AS drug_name, dm.base_unit, dm.is_cold_chain,
                sum(sl.qty_on_hand)::float8 AS on_hand, sum(sl.qty_held)::float8 AS held, count(*)::int AS lots,
                min(sl.expiry_date) FILTER (WHERE sl.qty_on_hand > 0)::text AS nearest_expiry
           ${join} GROUP BY hd.id, dm.id ORDER BY hd.local_code ${limit}`,
        params,
      );
      const slice = toPage(result.rows, page);
      return {
        ok: true,
        view,
        items: slice.items.map((r) => ({
          hospitalDrugId: r.id,
          localCode: r.local_code,
          localName: r.local_name,
          localUnit: r.local_unit,
          ved: r.ved,
          abc: r.abc,
          drugName: r.drug_name,
          baseUnit: r.base_unit,
          coldChain: Boolean(r.is_cold_chain),
          onHand: r.on_hand,
          held: r.held,
          free: Math.round((r.on_hand - r.held) * 1000) / 1000,
          lots: r.lots,
          nearestExpiry: r.nearest_expiry,
          minLevel: r.min_level,
          maxLevel: r.max_level,
        })),
        nextCursor: slice.nextCursor,
      };
    }

    const result = await query(
      `SELECT sl.id, sl.lot_no, sl.expiry_date::text AS expiry_date, (sl.expiry_date - current_date) AS days_left, sl.qty_on_hand::float8 AS on_hand,
              sl.qty_held::float8 AS held, sl.manufacturer, sl.version, hd.id AS hd_id, hd.local_code, hd.local_name, hd.local_unit,
              hd.ved::text AS ved, hd.abc::text AS abc, ${DRUG_NAME} AS drug_name, dm.base_unit, dm.is_cold_chain
         ${join} ORDER BY sl.expiry_date, sl.lot_no, sl.id ${limit}`,
      params,
    );
    const slice = toPage(result.rows, page);
    return {
      ok: true,
      view,
      items: slice.items.map((r) => ({
        id: r.id,
        lotNo: r.lot_no,
        expiryDate: r.expiry_date,
        daysToExpiry: Number(r.days_left),
        onHand: r.on_hand,
        held: r.held,
        free: Math.round((r.on_hand - r.held) * 1000) / 1000,
        manufacturer: r.manufacturer,
        version: Number(r.version),
        hospitalDrug: { id: r.hd_id, localCode: r.local_code, localName: r.local_name, localUnit: r.local_unit, ved: r.ved, abc: r.abc },
        drugName: r.drug_name,
        baseUnit: r.base_unit,
        coldChain: Boolean(r.is_cold_chain),
      })),
      nextCursor: slice.nextCursor,
    };
  }
}

export const inventoryService = new InventoryService();
