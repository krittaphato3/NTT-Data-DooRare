import { Router } from 'express';
import { query } from '../../db/client.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.js';

/**
 * API-PL-006 `GET /dashboard`: counts for the caller's hospital (region-wide for a system admin), read straight from the
 * tables so it works before every feature module exists. Every role gets the same tiles; the screen shows what it needs.
 */
export const dashboardRouter = Router();

dashboardRouter.get('/', requireAuth, asyncHandler(async (req, res) => {
  const user = req.user!;
  const h = user.hospitalId;
  const one = async (sql: string, params: unknown[] = [h]) => (await query(sql, params)).rows[0];
  const [alerts, borrow, lender, expiry, incidents, transport, returns, stock, driver] = await Promise.all([
    one(`SELECT count(*) FILTER (WHERE status IN ('OPEN','ACKNOWLEDGED','LINKED_TO_REQUEST'))::int AS active,
                count(*) FILTER (WHERE status = 'OPEN' AND severity IN ('URGENT','VERY_URGENT'))::int AS urgent
           FROM stock_alert WHERE ($1::uuid IS NULL OR hospital_id = $1)`),
    one(`SELECT count(*) FILTER (WHERE status = 'PENDING_APPROVAL')::int AS pending_approval,
                count(*) FILTER (WHERE status IN ('APPROVED','IN_PROGRESS','PARTIALLY_FULFILLED'))::int AS in_progress,
                count(*) FILTER (WHERE status = 'ESCALATED')::int AS escalated
           FROM borrow_request WHERE ($1::uuid IS NULL OR borrower_hospital_id = $1)`),
    one(`SELECT count(*)::int AS waiting FROM borrow_leg WHERE status = 'SENT' AND ($1::uuid IS NULL OR lender_hospital_id = $1)`),
    one(`SELECT count(*) FILTER (WHERE status = 'DETECTED')::int AS detected, count(*) FILTER (WHERE status = 'RELEASED_TO_POOL')::int AS in_pool
           FROM near_expiry_item WHERE ($1::uuid IS NULL OR hospital_id = $1)`),
    one(`SELECT count(*)::int AS open FROM incident WHERE status IN ('OPEN','PLAN_REVIEW','ACTIVE','CLOSE_REQUESTED') AND ($1::uuid IS NULL OR hospital_id = $1)`),
    one(`SELECT count(*) FILTER (WHERE from_hospital_id = COALESCE($1::uuid, from_hospital_id) AND status = 'WAITING_DISPATCH')::int AS waiting_dispatch,
                count(*) FILTER (WHERE from_hospital_id = COALESCE($1::uuid, from_hospital_id) AND status IN ('LOADED','IN_TRANSIT','ARRIVED'))::int AS out_in_flight,
                count(*) FILTER (WHERE to_hospital_id = COALESCE($1::uuid, to_hospital_id) AND status IN ('LOADED','IN_TRANSIT'))::int AS in_on_the_way,
                count(*) FILTER (WHERE to_hospital_id = COALESCE($1::uuid, to_hospital_id) AND status = 'ARRIVED')::int AS to_receive
           FROM transport_task WHERE status NOT IN ('RECEIVED','CANCELLED') AND ($1::uuid IS NULL OR from_hospital_id = $1 OR to_hospital_id = $1)`),
    one(`SELECT count(*)::int AS open, count(*) FILTER (WHERE due_date < current_date)::int AS overdue
           FROM return_obligation WHERE status IN ('OPEN','REMINDED','OVERDUE') AND ($1::uuid IS NULL OR debtor_hospital_id = $1)`),
    one(`SELECT count(*) FILTER (WHERE qty_on_hand > 0)::int AS lots, count(*) FILTER (WHERE qty_on_hand > 0 AND expiry_date > current_date AND expiry_date <= current_date + 90)::int AS expiring_90d,
                count(*) FILTER (WHERE qty_on_hand > 0 AND expiry_date <= current_date)::int AS expired
           FROM stock_lot WHERE ($1::uuid IS NULL OR hospital_id = $1)`),
    user.role === 'DRIVER'
      ? one(`SELECT count(*)::int AS assigned FROM transport_task WHERE driver_id = $1 AND status NOT IN ('RECEIVED','CANCELLED')`, [user.id])
      : Promise.resolve(null),
  ]);
  res.status(200).json({
    ok: true,
    generatedAt: new Date().toISOString(),
    scope: h ? { hospitalId: h, code: user.hospitalCode, name: user.hospitalName } : { hospitalId: null, code: 'REGION', name: user.hospitalName },
    role: user.role,
    tiles: {
      stockAlerts: { active: alerts.active, urgent: alerts.urgent },
      borrowRequests: { pendingApproval: borrow.pending_approval, inProgress: borrow.in_progress, escalated: borrow.escalated },
      lenderQueue: { waiting: lender.waiting },
      nearExpiry: { detected: expiry.detected, inPool: expiry.in_pool },
      incidents: { open: incidents.open },
      transport: { waitingDispatch: transport.waiting_dispatch, outInFlight: transport.out_in_flight, inOnTheWay: transport.in_on_the_way, toReceive: transport.to_receive },
      returns: { open: returns.open, overdue: returns.overdue },
      inventory: { lotsInStock: stock.lots, expiringWithin90Days: stock.expiring_90d, expired: stock.expired },
      ...(driver ? { driver: { assignedTasks: driver.assigned } } : {}),
    },
  });
}));
