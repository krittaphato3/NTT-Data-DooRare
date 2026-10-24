/**
 * Candidate lenders, hard filter (F-12), Si ranking (F-14..F-18) and the first-round allocation (F-21).
 * The result is what the pharmacist reviews in UI-04 and what gets frozen on approval.
 */
import type { Db } from '../../db/tx.js';
import {
  allocateRound, dailyUsage, hardFilterFailure, lendableStock, priorityScore, rankBySi, roundParts, scoreFulfill, scoreReliability, scoreStockSafety, scoreTime,
} from '../../core/formulas/borrow.js';
import type { ScoreParts } from '../../core/formulas/borrow.js';
import type { BorrowConfig } from './borrow.config.js';
import { findListing, latestForecast, usableStock } from './borrow.inputs.js';
import type { Need } from './borrow.inputs.js';
import { getOrRefreshHospitalDistance } from '../location/location.service.js';

export interface Candidate {
  hospitalId: string;
  code: string;
  name: string;
  eligible: boolean;
  /** First failing hard-filter reason (F-12) when not eligible. */
  failure: string | null;
  listingId: string | null;
  transitMin: number | null;
  usableForLending: number;
  totalTarget: number | null;
  lendable: number;
  stock: number;
  uLender: number;
  approvalRate: number | null;
  timeoutRate: number | null;
  parts: ScoreParts | null;
  si: number | null;
}

export interface LadderEntry extends Candidate {
  rank: number;
  /** Quantity planned for the first round (0 for later rounds). */
  qtyPlanned: number;
  si: number;
  parts: ScoreParts;
  transitMin: number;
}

export interface LadderPlan {
  candidates: Candidate[];
  ladder: LadderEntry[];
  parallel: boolean;
}

async function reliability(db: Db, lenderId: string, months: number) {
  const r = (
    await db.query(
      `SELECT count(*) FILTER (WHERE status IN ('ACCEPTED','PARTIAL','LOADED','IN_TRANSIT','RECEIVED'))::int AS approved,
              count(*) FILTER (WHERE status IN ('ACCEPTED','PARTIAL','LOADED','IN_TRANSIT','RECEIVED','REJECTED'))::int AS answered,
              count(*) FILTER (WHERE status = 'TIMED_OUT')::int AS timed_out,
              count(*) FILTER (WHERE status NOT IN ('PENDING','CANCELLED'))::int AS sent
         FROM borrow_leg WHERE lender_hospital_id = $1 AND COALESCE(sent_at, responded_at) >= now() - make_interval(months => $2::int)`,
      [lenderId, months],
    )
  ).rows[0];
  return {
    approvalRate: r.answered > 0 ? r.approved / r.answered : null,
    timeoutRate: r.sent > 0 ? r.timed_out / r.sent : null,
  };
}

export async function buildLadder(db: Db, cfg: BorrowConfig, need: Need, requesterHospitalId: string): Promise<LadderPlan> {
  const hospitals = (
    await db.query(
      `SELECT h.id, h.code, COALESCE(h.name_th, h.name_en) AS name, h.active, h.agent_participation, h.has_cold_chain,
              COALESCE(d.travel_minutes_override, d.travel_minutes)::float8 AS transit
         FROM hospital h
         LEFT JOIN hospital_distance d ON d.from_hospital_id = h.id AND d.to_hospital_id = $1
        WHERE h.id <> $1 ORDER BY h.code`,
      [requesterHospitalId],
    )
  ).rows;

  const candidates: Candidate[] = [];
  for (const h of hospitals) {
    let transitMin: number | null = h.transit;
    if (transitMin === null) {
      try {
        const route = await getOrRefreshHospitalDistance(db, h.id, requesterHospitalId);
        transitMin = route.travelMinutes;
      } catch {
        // fallback remains null
      }
    }

    const listing = await findListing(db, h.id, need.drug.drugMasterId);
    const base: Candidate = {
      hospitalId: h.id, code: h.code, name: h.name, eligible: false, failure: null, listingId: listing?.id ?? null, transitMin,
      usableForLending: 0, totalTarget: null, lendable: 0, stock: 0, uLender: 0, approvalRate: null, timeoutRate: null, parts: null, si: null,
    };
    if (!listing) {
      candidates.push({ ...base, failure: 'NO_LISTING' });
      continue;
    }
    const [usableLend, stock, week, month, rel] = await Promise.all([
      usableStock(db, listing.id, cfg.lotMinRemainingDays),
      usableStock(db, listing.id),
      latestForecast(db, listing.id, 'WEEK'),
      latestForecast(db, listing.id, 'MONTH'),
      reliability(db, h.id, cfg.reliabilityWindowMonths),
    ]);
    // F-13 edge case: a lender whose class has no Total Target (D) uses P50 as its keep-level.
    const totalTarget = week?.total_target ?? week?.p50 ?? null;
    const lendable = lendableStock(usableLend, totalTarget ?? 0);
    const uLender = dailyUsage(week?.p50 ?? null, month?.p50 ?? null, need.leadDays) ?? 0;
    const windowMaxMin = need.windowDays * 1440;
    const failure = hardFilterFailure({
      transitMin,
      windowMaxMin,
      lendable,
      coldChain: need.drug.coldChain,
      lenderColdChainCapable: Boolean(h.has_cold_chain),
      boxMinutes: cfg.coldBoxHours * 60,
      controlled: need.drug.controlled,
      lenderActive: Boolean(h.active),
      lenderAgentParticipation: Boolean(h.agent_participation),
      mappingVerified: listing.mapped,
      hasTotalTarget: totalTarget !== null,
    });
    const cand: Candidate = { ...base, usableForLending: usableLend, totalTarget, lendable, stock, uLender, approvalRate: rel.approvalRate, timeoutRate: rel.timeoutRate, failure };
    if (!failure && need.borrow > 0) {
      const qtyLend = Math.min(lendable, need.borrow);
      const parts: ScoreParts = {
        time: scoreTime(h.transit, windowMaxMin),
        fulfill: scoreFulfill(lendable, need.borrow),
        stockSafety: scoreStockSafety(stock, qtyLend, uLender, cfg.stockSafetyDays),
        reliability: scoreReliability(rel.approvalRate, rel.timeoutRate, cfg.reliabilityDefault),
      };
      cand.eligible = true;
      cand.si = priorityScore(parts, cfg.weights);
      cand.parts = roundParts(parts);
    }
    candidates.push(cand);
  }

  const eligible = candidates.filter((c) => c.eligible).map((c) => ({ ...c, si: c.si as number, transitMin: c.transitMin as number }));
  const ranked = rankBySi(eligible);
  const parallel = need.urgency === 'VERY_URGENT';
  const plan = allocateRound(ranked, need.borrow, parallel, cfg.maxParallel);
  const ladder: LadderEntry[] = ranked.map((c, i) => ({
    ...c,
    parts: c.parts as ScoreParts,
    rank: i + 1,
    qtyPlanned: plan.find((p) => p.hospitalId === c.hospitalId)?.qty ?? 0,
  }));
  return { candidates, ladder, parallel };
}
