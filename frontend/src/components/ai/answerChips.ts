/**
 * Derives two things from a finished assistant answer, with no extra model call:
 * - citations: the records and links the answer actually touched (from its tool results and its text)
 * - follow-ups: 2-3 next questions that make sense for this role and this answer
 * Pure functions so the drawer stays a rendering concern.
 */
import type { ToolLogEntry } from './ToolExecutionLogCard';

export interface Citation {
  id: string;
  label: string;
  /** Internal app deep link (`?page=...`) or an external http(s) URL. */
  href: string;
  kind: 'record' | 'external';
}

export interface FollowUp {
  label: string;
  prompt: string;
}

const MAX_CITATIONS = 5;
const MAX_FOLLOW_UPS = 3;

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

/** The records the answer read or wrote, plus any external page it opened. */
export function citationsFrom(content: string, toolLogs?: ToolLogEntry[]): Citation[] {
  const found = new Map<string, Citation>();
  const add = (c: Citation) => {
    if (c.id && c.href && !found.has(c.id)) found.set(c.id, c);
  };
  const haystack = `${content}\n${JSON.stringify(toolLogs ?? [])}`;

  for (const m of haystack.matchAll(/\b(BR-\d{4}-\d{4,6})\b/g)) {
    add({ id: m[1], label: m[1], href: '?page=requests', kind: 'record' });
  }
  for (const m of haystack.matchAll(/\b(INC-[A-Za-z0-9-]{3,})\b/g)) {
    add({ id: m[1], label: m[1], href: `?page=incidents&incident=${encodeURIComponent(m[1])}&id=${encodeURIComponent(m[1])}`, kind: 'record' });
  }
  for (const m of haystack.matchAll(/https?:\/\/[^\s"'\\<>]+/g)) {
    const url = m[0].replace(/[),.;]+$/, '');
    if (!/^https?:\/\//i.test(url)) continue;
    if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(url)) continue; // internal
    add({ id: url, label: hostOf(url), href: url, kind: 'external' });
  }

  return [...found.values()].slice(0, MAX_CITATIONS);
}

/** 2-3 concrete next steps, chosen from what the answer was about. */
export function followUpsFrom(content: string, toolLogs?: ToolLogEntry[]): FollowUp[] {
  const tools = (toolLogs ?? []).map((t) => t.name).join(' ').toLowerCase();
  const haystack = `${tools} ${content}`;
  const hit = (re: RegExp) => re.test(haystack);
  const out: FollowUp[] = [];

  if (hit(/stock|alert|rop|คงคลัง|สต็อก|วิกฤต/)) {
    out.push({ label: 'สร้างคำขอยืมจากผลนี้', prompt: 'สร้างคำขอยืมยาจากรายการที่ต้องยืมนี้' });
    out.push({ label: 'ดู รพ. ที่ให้ยืมได้', prompt: 'ค้นหา รพ. ที่มียาให้ยืมใกล้ที่สุด' });
  }
  if (hit(/borrow|lender|ยืม|คำขอ/)) {
    out.push({ label: 'ดูสถานะคำขอยืม', prompt: 'สรุปสถานะการยืมยาประจำวัน' });
  }
  if (hit(/incident|plan|เหตุ|แผนเวชภัณฑ์/)) {
    out.push({ label: 'ดูแผนเวชภัณฑ์', prompt: 'สรุปแผนเวชภัณฑ์ของเหตุนี้' });
    out.push({ label: 'ประเมินแผนใหม่', prompt: 'ประเมินแผนเวชภัณฑ์ของเหตุนี้ใหม่' });
  }
  if (hit(/web_search|web_fetch|เว็บ|ลิงก์/)) {
    out.push({ label: 'สรุปสั้น ๆ', prompt: 'สรุปข้อมูลจากเว็บข้างต้นเป็น 3 ข้อ' });
  }
  if (out.length === 0) {
    out.push({ label: 'ดูภาพรวมสต็อก', prompt: 'ตรวจสอบสต็อกยาใกล้ถึงจุด ROP' });
    out.push({ label: 'สรุปงานวันนี้', prompt: 'คำนวณสรุปการยืมยาประจำวัน' });
  }

  const seen = new Set<string>();
  return out.filter((f) => (seen.has(f.label) ? false : (seen.add(f.label), true))).slice(0, MAX_FOLLOW_UPS);
}
