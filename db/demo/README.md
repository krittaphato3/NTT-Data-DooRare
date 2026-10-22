# Demo data (1 Oct -> 22 Oct 2026) and role scenarios

The mock history stops at 30 Sep 2026. This folder extends it to today and leaves unfinished work for the four demo roles
(pharmacist, ER, warehouse, driver). One database only: the sample data is for dev/demo and is removed by restoring the snapshot.

## Commands (repo root; Postgres container up)

The extended data (to 21 Oct) is part of the normal load, there is no snapshot or restore:

```bash
npm run db:reset        # drop the volume, load the mock CSV (to 30 Sep), then 01-backfill + 02-shape (to 21 Oct)
cd backend && npx tsx src/index.ts      # start the backend (separate terminal)
npm run db:scenarios    # pending work per role through the API (once per fresh DB, ~1 minute)
```

- `db:reset` always gives the same starting point again (this is how you "reset"). `db:load` does the same on an empty DB.
- `db:scenarios` refuses to run twice on the same DB (it looks for requests whose reason starts `DEMO:`): run `db:reset` first.
- The CSV (`db/mock/csv/`) is not in git: copy it from the mock zip or run `python3 db/mock/generate.py`.

## What each step does

| File | What |
|---|---|
| `db/demo/01-backfill.sql` (run by `db:load`) | 1-21 Oct, day by day: usage near the recent average (weekday/weekend, jitter), FEFO stock decrements, receipt of due orders (the 36 left OPEN on 30 Sep arrive 1-4 Oct), reorders when cover < 14 days, expired lots written off until 18 Oct, daily `stock_snapshot`. New lots `DEMO-R*`. |
| `db/demo/02-shape.sql` (run by `db:load`) | 19-21 Oct situation: usage spike (ledger `DEMO_SPIKE`) that leaves V/E drugs low at HA / HB / HC, HA short of loose components of 3 kits and low on ready kit sets, near-expiry lots `DEMO-NE-*` (HA 5, HB 3, HC 2), expired lots in stock `DEMO-EXP-HA*`. |
| `backend/scripts/demo-scenarios.ts` (run by `db:scenarios`) | Real API calls as each role (rules, audit, stock holds, notifications are the real ones): forecast run, expiry scan, borrow flows, near-expiry decisions, the Agent's matching (stand-in through `createPlanFromAgentProposal`), ER incidents. |

Requests created by the scenarios have `reason` starting `DEMO:` (manual ones); everything is dated 22 Oct (the scenario run time).

## Accounts (password `doorare123`, OTP `123456`)

| Role | Login | What waits for them |
|---|---|---|
| Pharmacist HA | `pharmacist1.ha@example.org` | LOW_STOCK alerts (5 very urgent); a borrow request waiting for approval, a draft, one where the lender rejected, one where the lender accepted; lender queue with 3 requests to answer; 4 near-expiry lots to decide (release / keep), 1 allocation plan waiting for approval, 1 lot released and waiting for the Agent, return obligations overdue (3) |
| Pharmacist HB / HC | `pharmacist1.hb@` / `pharmacist1.hc@` | lender queue items, own near-expiry lots (HB1 already released and shipped by the Agent plan) |
| Warehouse HA | `warehouse_officer1.ha@example.org` | tasks to load (2), goods ARRIVED to receive (2), kit pack tasks (5), emergency kit lending |
| Driver HA | `driver1.ha@example.org` | tasks LOADED to depart, IN_TRANSIT to confirm arrival |
| ER HA | `er_staff1.ha@example.org` | incident 1 (bus crash: plan approved, kits borrowed, one lender confirmed, packing in progress), incident 2 (chemical leak: plan waiting for approval) |

Hospital admin (`hospital_admin1.ha@`) and system admin (`system_admin1.region@`) work as before.

## Notes

- The Agent is not connected. Where the Agent would match near-expiry lots, the script plays it for two lots; lot HA2 is left released and waiting.
- The 15-minute expiry job in the backend keeps scanning; it may add near-expiry items as days pass. `db:reset` + `db:scenarios` resets that.
- Forecast artifacts end around 21 Sep; alerts compare them with the current stock, so the severity of alerts comes from the forecast numbers, not from 1-21 Oct usage.
