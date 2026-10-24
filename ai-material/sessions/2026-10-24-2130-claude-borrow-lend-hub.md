# Borrow & Lend Hub (pharmacist) — merge /requests + /lend

## Goal
- Merge "คำขอยืมของเรา" (`?page=requests`) and "คิวตอบคำขอยืม" (`?page=lend`) into one hub with tabs; simplify UI (pharmacist feedback #3, #5).

## Done
- New `frontend/src/roles/pharmacist/pages/BorrowLendHubPage.tsx`: breadcrumb + title + tab bar (ยาที่เราขอยืม / รพ.อื่นขอยืมเรา / ภาระการคืน), live counts + amber "waiting" badge per tab, URL kept in sync with `history.replaceState` (`page=requests|lend`). Refetches both hooks on mount (first fetch raced sign-in and showed demo counts 5/1 vs real 0 rows).
- Tab visibility per role: Outbound all; Inbound PHARMACIST/HOSPITAL_ADMIN only (same as old `lend` allowlist); Obligations HOSPITAL_ADMIN only (was `maySeeObligations`). One-tab roles (procurement) get no tab bar.
- `BorrowRequestsPage`: new props `embedded`, `view` (hub-controlled `requests|obligations`); embedded hides own breadcrumb/title and the 3 "dirs" mode cards; keeps history + "สร้างคำขอยืมเอง" actions.
- `LenderQueuePage`: new prop `embedded` hides breadcrumb, heading and the two mode cards.
- `ObligationTable`: Waive button now rendered only when `waiveGate.allowed`; otherwise "—" (no dead grey button).
- `App.tsx`: `requests` and `lend` both render the hub (`initialTab`); nav active key `req` for both; badge `req` = pending + escalated + lender waiting; removed `lend` href mapping.
- `data/navigation.ts`: removed `lend` from PHARMACIST/HOSPITAL_ADMIN nav; `req` renamed "ยืม-ให้ยืมยา / Borrow & Lend".
- `borrow.css`: `.bl-tabs/.bl-tab*` styles (hint text hidden <640px).

## Follow-up (same session)
- Outbound: History + "สร้างคำขอยืมเอง" moved to the right of the tab bar (Hub exposes `.bl-actions` slot; `BorrowRequestsPage` renders actions into it via `createPortal` when `embedded`).
- Outbound bug fixed: History + status tile used to AND (history = fulfilled/closed only, so other tiles gave 0 rows). Now picking a tile clears History, toggling History clears the tile.
- Inbound: SM-1b tiles (รอเราตอบ / ตอบรับแล้ว / กำลังส่ง) are buttons that filter the table (`TILE_STATUSES`: accepted+partial, loaded+in_transit); click again or "ล้างตัวกรองสถานะ" to clear; the status dropdown clears the tile.
- Browser-verified: history 146 rows, history→pending 3, fulfilled 120; inbound waiting 1 / loaded 4. Docker frontend rebuilt.

- Outbound status tiles reworked: new `TileGroup` + `TILES` + `tileOf()` in `data/borrow.ts` (separate from `StatusGroup`, which still colours badges/drawer). Tiles: รออนุมัติ | กำลังขอยืม | ตอบรับแล้ว (any leg ACCEPTED/loaded/in transit/received) | ได้ครบแล้ว | ปิด·ยกเลิก. ESCALATED requests now count under กำลังขอยืม and are flagged by a red chip "ต้องเพิ่มผู้ให้ยืม N" (`.bl-need`, filters `needsLender`). Old `?group=escalated` link maps to progress + needsLender filter. ESCALATED label renamed "ต้องเพิ่มผู้ให้ยืม". Warehouse `WhBorrowPage` uses the same tiles.
- Verified in browser: tiles 2 / 6 / 9 / 120 / 26 rows; chip filter 6.

- Bug: "เพิ่มผู้ให้ยืม" on an F3 kit request (e.g. BR-2026-000599 ชุดแผลไฟไหม้) failed with 422 NOT_SUPPORTED (backend `drugOf`: kits have no drug item). Fix: `ApiBorrowRequest.drug.kind` -> `BorrowRequest.isKit`; drawer shows link "ไปจัดการที่เหตุฉุกเฉิน" instead of the button, badge reads "ส่งต่อผู้ดูแล" for kits, `needsLender` excludes kits (chip 6 -> 4). Backend unchanged.

## Decisions
- Wrapper + tabs, inner pages unchanged otherwise (low risk); old URLs stay valid as aliases, so Stock Alerts / Action Center / AlertsPanel links need no change.
- Hub tab counts duplicate the hooks' fetches (acceptable; not shared state).
- Warehouse role keeps its own `requests` page (WhBorrowPage), untouched.

## Files touched
- pages/BorrowLendHubPage.tsx (new), BorrowRequestsPage.tsx, LenderQueuePage.tsx, components/ObligationTable.tsx, borrow.css, data/navigation.ts, App.tsx.

## Errors
- Hub counts showed demo values (5/1) after login: fetch raced auth → fixed by refetch on mount.

## Verified
- `tsc -b` clean, `npm run build` ok; browser (dev server, pharmacist login): hub renders, tab switch updates URL to `page=lend`, no console errors.

## Next
- Hub item 6: hide Si/F-20 formula in lender/borrow drawer behind "ดูเหตุผล AI", show nearest-hospital summary card (distance · ETA · stock).
- Remaining feedback: #4 expiry+pool pipeline, #5 grouped sidebar headers, #6 Copilot order-sheet card; #1/#2 leftovers (Smart Button, antidote emphasis).
- Not committed; Docker `doorare-frontend` not rebuilt yet.
