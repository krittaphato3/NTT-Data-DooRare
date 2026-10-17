/**
 * ER incident store. Every incident the ER records (and its plan, borrow requests and updates) lives
 * here so the incident list, the flow page and the detail view read the same data. Prototype only:
 * mock incidents held in memory (a page reload resets them); replace with the incident API when it exists.
 */
import { useSyncExternalStore } from 'react';
import { EXTRA_DRUGS, INCIDENT_HEADER, PRESET_KITS } from './incident';
import type { PresetKitRow } from './incident';
import { DEFAULT_INTAKE } from './intake';
import type { IntakeValues } from './intake';
import { buildStockCheck, planBorrowRequests } from './stockCheck';
import type { BorrowRequestDraft } from './stockCheck';

export type IncidentStatus = 'planning' | 'sent' | 'closed' | 'cancelled';

export interface IncidentUpdate {
  at: string;
  text: string;
}

/** One send of borrow requests to one hospital (or several). A request sent to hospitals separately appears in several batches. */
export interface SentBatch {
  at: string;
  note: string;
  requests: BorrowRequestDraft[];
}

export interface IncidentRecord {
  id: string;
  createdAt: string;
  status: IncidentStatus;
  /** Flow step the incident is at (1–5) and the furthest step reached. */
  step: number;
  reached: number;
  intake: IntakeValues;
  kits: PresetKitRow[];
  edited: boolean;
  burnKitOption: 'none' | 'add';
  prcOption: '4' | '6';
  /** `${requestId}|${hospital}` the ER switched off while reviewing requests. */
  excluded: string[];
  note: string;
  batches: SentBatch[];
  updates: IncidentUpdate[];
  /** Counts changed after the plan was made: the Agent should assess again. */
  planStale: boolean;
  /** Mock data that has its own tracking screens (live) or no plan at all (archived). */
  seed?: 'live' | 'archived';
}

const t = INCIDENT_HEADER.triage;

const base = (): Omit<IncidentRecord, 'id' | 'createdAt' | 'status' | 'intake'> => ({
  step: 1,
  reached: 1,
  kits: PRESET_KITS,
  edited: false,
  burnKitOption: 'none',
  prcOption: '4',
  excluded: [],
  note: '',
  batches: [],
  updates: [],
  planStale: false,
});

const SEEDS: IncidentRecord[] = [
  {
    ...base(),
    id: 'INC-2026-000015',
    createdAt: '19:18',
    status: 'sent',
    step: 5,
    reached: 5,
    seed: 'live',
    intake: {
      ...DEFAULT_INTAKE,
      category: 'รถโดยสาร / อุบัติเหตุจราจรหมู่',
      location: `${INCIDENT_HEADER.title} · ${INCIDENT_HEADER.location}`,
      detail: INCIDENT_HEADER.quote,
      red: String(t.red),
      yellow: String(t.yellow),
      green: String(t.green),
      black: String(t.black),
      eta: '25',
    },
    updates: [{ at: '19:27', text: 'แดง 5 → 7' }],
  },
  {
    ...base(),
    id: 'INC-2026-000016',
    createdAt: '19:24',
    status: 'planning',
    step: 3,
    reached: 3,
    intake: { ...DEFAULT_INTAKE, category: 'ไฟไหม้โรงงาน', location: 'นิคมอุตสาหกรรมบางปู', detail: 'ไฟไหม้โรงงานเคมี มีผู้สูดดมควัน', red: '2', yellow: '4', green: '6', black: '0', eta: '15' },
  },
  {
    ...base(),
    id: 'INC-2026-000017',
    createdAt: '19:29',
    status: 'sent',
    step: 5,
    reached: 5,
    intake: { ...DEFAULT_INTAKE, category: 'สารเคมีรั่วไหล', location: 'ท่าเรือแหลมฉบัง', detail: 'สารเคมีรั่วไหลที่โกดัง คนงานหายใจลำบาก', red: '1', yellow: '5', green: '6', black: '0', unknown: '3', eta: '20' },
    batches: [
      {
        at: '19:31',
        note: '',
        requests: planBorrowRequests(buildStockCheck(PRESET_KITS, EXTRA_DRUGS), 20, 140),
      },
    ],
    updates: [{ at: '19:35', text: 'เหลือง 3 → 5 · ผู้บาดเจ็บเพิ่ม' }],
  },
  {
    ...base(),
    id: 'INC-2026-000014',
    createdAt: '12 ต.ค.',
    status: 'closed',
    step: 5,
    reached: 5,
    seed: 'archived',
    intake: { ...DEFAULT_INTAKE, category: 'ไฟไหม้โรงงาน', location: 'นิคมอุตสาหกรรมบางปู', detail: 'ไฟไหม้โรงงาน มีผู้สูดดมควัน', red: '1', yellow: '5', green: '8', black: '0' },
  },
  {
    ...base(),
    id: 'INC-2026-000012',
    createdAt: '4 ต.ค.',
    status: 'cancelled',
    seed: 'archived',
    intake: { ...DEFAULT_INTAKE, category: 'แจ้งผิด', location: '-', detail: 'แจ้งหยอก · ยกเลิก', red: '0', yellow: '0', green: '0', black: '0' },
  },
];

function load(): IncidentRecord[] {
  return [...SEEDS].sort((a, b) => b.id.localeCompare(a.id));
}

let records: IncidentRecord[] = load();
const listeners = new Set<() => void>();

function commit(next: IncidentRecord[]) {
  records = [...next].sort((a, b) => b.id.localeCompare(a.id));
  listeners.forEach((l) => l());
}

export function getIncident(id: string): IncidentRecord | undefined {
  return records.find((r) => r.id === id);
}

/** Create or replace a record. */
export function saveIncident(rec: IncidentRecord) {
  commit([...records.filter((r) => r.id !== rec.id), rec]);
}

export function nowHHmm(): string {
  return new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function nextIncidentId(): string {
  const n = records.reduce((m, r) => Math.max(m, Number(r.id.slice(-6)) || 0), 0);
  return `INC-2026-${String(n + 1).padStart(6, '0')}`;
}

/** Next borrow request number: after the mock requests of the live incident and every distinct request sent so far. */
export function nextRequestNo(): number {
  const ids = new Set(records.flatMap((r) => r.batches.flatMap((b) => b.requests.map((q) => q.id))));
  return 134 + 5 + ids.size;
}

const LABEL: Record<string, string> = { red: 'แดง', yellow: 'เหลือง', green: 'เขียว', black: 'ดำ', unknown: 'ไม่ทราบระดับ' };

/** Staff update from the field (more injured, level changed…). Logs what changed and marks the plan stale. */
export function applyIncidentUpdate(id: string, counts: Pick<IntakeValues, 'red' | 'yellow' | 'green' | 'black' | 'unknown'>, note: string) {
  const rec = getIncident(id);
  if (!rec) return;
  const diffs = (Object.keys(LABEL) as (keyof typeof counts)[])
    .filter((k) => (Number(counts[k]) || 0) !== (Number(rec.intake[k]) || 0))
    .map((k) => `${LABEL[k]} ${Number(rec.intake[k]) || 0} → ${Number(counts[k]) || 0}`);
  if (diffs.length === 0 && !note.trim()) return;
  const text = [diffs.join(' · '), note.trim()].filter(Boolean).join(' · ');
  saveIncident({
    ...rec,
    intake: { ...rec.intake, ...counts },
    updates: [...rec.updates, { at: nowHHmm(), text }],
    planStale: rec.planStale || (diffs.length > 0 && rec.reached >= 2 && !rec.seed),
  });
}

export function statusMeta(rec: IncidentRecord): { label: string; cls: string } {
  switch (rec.status) {
    case 'planning':
      return { label: `กำลังวางแผน · ขั้น ${rec.step}/5`, cls: 'st-pending' };
    case 'sent':
      return { label: rec.planStale ? 'ต้องประเมินแผนใหม่' : 'ส่งคำขอยืมแล้ว', cls: rec.planStale ? 'st-pending' : 'st-transit' };
    case 'closed':
      return { label: 'สรุปแล้ว', cls: 'st-approved' };
    default:
      return { label: 'ยกเลิก', cls: 'st-rejected' };
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useIncidents(): IncidentRecord[] {
  return useSyncExternalStore(subscribe, () => records);
}
