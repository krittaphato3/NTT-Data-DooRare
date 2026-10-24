# Pharmacist incident console: live data only

## Goal
- User: remove mock from the pharmacist/HA incident page; show real incidents of the hospital, view-only (like ER).

## Done
- `frontend/src/roles/er/pages/IncidentConsolePage.tsx` now only renders `LiveConsole` (API `/incidents`, per hospital); `MockIncidentConsole` and the `?mock=1` switch removed for this page.
- Deleted now-unreferenced `roles/er/components/PlanPanel.tsx` and `BorrowPanel.tsx` (only the mock console used them). Other ER pages still keep their own mock/live switch (not touched).
- Verified: with localStorage `doorare_mock=1` the page still shows live INC-2026-0069 data; tsc + build ok; Docker frontend rebuilt.

## Decisions
- Kept the pharmacist's two existing writes in the summary tab (record actual use, co-sign closing with ER): F3 close needs both signatures (backend step 7). Plan / borrow / pack tabs are view-only. Say if the summary tab should be view-only too.

## Next
- Not committed.
