---
title: Session: Pharmacist Stock Alerts UX & Flow Alignment
date: 2026-10-24
author: alongkorn
ai: antigravity
tags: session, frontend, pharmacist, alerts, stock-alerts, ui-ux
summary: Clarified stock alert actions (acknowledge, snooze, borrow request link) and added critical shortage triage bar for pharmacist workflow
---

## Goal
- Address user confusion on Stock Alerts (`/alerts`): clarify "เลื่อน", "รับทราบ", "ผูกคำขอแล้ว", and "ตรวจสอบและอนุมัติ".
- Align the alert page with the clinical pharmacist mental model where ML predicts shortages, high-risk items trigger agent borrow drafts requiring approval, and low-risk items are monitored or procured normally.

## Done
- Removed "เลื่อนเตือน" (Snooze) Completely:
  - Eliminated snooze action links from `StockAlertTable.tsx`.
  - Removed snooze modal, snooze hours input, audit reason textarea, and snooze state from `StockAlertsPage.tsx`.
  - Streamlined each row to decisive clinical actions: [ขอยืมยา/อนุมัติ] or [รับทราบ]. Eliminated clinical risk of snoozing emergency shortages.
- Removed `.sa-triage-section` based on user feedback ("อยากได้แบบเดิมแต่จัดระเบียบให้ดีๆ").
- Fixed Forecast and Row Duplication:
  - `buildStockAlertRows` was pushing multiple forecast entries for the same drug. Added deduplication guard `if (seen.has(f.hospitalDrugId)) continue;`.
  - Rebuilt and restarted backend container with deduplicated query.
- Separated Alert Workflows into Clear Tabs & Scoped Exclusively to Alerts:
  - **`รอจัดการ` (Active / To Do)**: Only alerts that require pharmacist intervention right now (open or linked with draft/pending approval) [8 items].
  - **`จัดการแล้ว / กำลังยืม` (Handled / In Progress)**: Alerts that have been acknowledged, snoozed, or whose borrow request is already accepted by a lending hospital [17 items].
  - **`แจ้งเตือนทั้งหมด` (All Alerts)**: Exactly the sum of active + handled alerts [25 items]. Excluded healthy non-alert drugs (11 items) from the alerts queue so only items with actual alerts appear.
- Re-labeled "ปกติ" (NORMAL severity) to **"เตือนทั่วไป"** (Routine):
  - Clarified that low-urgency reorder alerts (ORDER_AHEAD, ORDER_EARLIER, MIN_MAX) are routine notices for standard purchasing cycles, not "normal stock". Avoids the clinical contradiction of alerting on normal stock.
- Fixed Immediate Feedback on "รับทราบ" & "เลื่อนเตือน":
  - Clicking "รับทราบ" or "เลื่อนเตือน" now immediately moves the row from "รอจัดการ" into "จัดการแล้ว" and displays a green notification banner, eliminating confusion over whether anything happened.
- Fixed Status & Action for Requests with Accepted/In-Progress Lenders (e.g. Ringer's Lactate `BR-2026-000582`):
  - Passed `requestStatus` through `AlertRef`.
  - When `requestStatus === 'IN_PROGRESS'`: badge shows **`กำลังดำเนินการยืม (ตอบรับแล้ว)`** (blue) and button displays **`ติดตามคำขอ BR-xxxx →`** (secondary) instead of misleading "ไปอนุมัติคำขอ".
- Fixed Default Sorting & Severity Filter:
  - Ordered by `Severity (Critical -> Urgent -> Normal) -> Vital (V) -> ABC -> Days Left`.
  - Prevents Normal items from appearing above Urgent items in the table.
- Added Controlled Drug safety badges (`🔒 ยาควบคุมพิเศษ`):
  - Flags narcotics/psychotropics (Fentanyl, Morphine, Ketamine, Pethidine) where automated cross-hospital borrowing is prohibited by Thai FDA regulations, redirecting to manual protocol.
- Rebuilt frontend with `npm run build` (0 TypeScript errors) and synced to running Docker container `doorare-frontend`.

## Decisions
- Kept the HITL (Human-in-the-Loop) rule intact: clicking "ไปอนุมัติคำขอ" redirects to the Borrow Request drawer where candidate hospital ranking and dispatch confirmation happen. For requests already accepted by lenders, changed to "ติดตามคำขอ" to reflect actual status.

## Files touched
- `frontend/src/roles/pharmacist/data/stockAlerts.ts`
- `frontend/src/roles/pharmacist/components/StockAlertTable.tsx`
- `frontend/src/roles/pharmacist/components/AlertsPanel.tsx`
- `frontend/src/roles/pharmacist/pages/StockAlertsPage.tsx`
- `frontend/src/index.css`

## Errors encountered
- None. Build completed cleanly in ~763ms.

## Next steps
- Review with user and proceed to Flow 2: Borrow & Lend Hub consolidation (`/requests` & `/lend`).
