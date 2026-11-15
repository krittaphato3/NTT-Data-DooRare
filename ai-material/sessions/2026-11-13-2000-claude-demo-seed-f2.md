---
title: Demo seed (one command) - part 1: F2 near-expiry / pool / approval scenarios
date: 2026-11-13
author: alongkorn
ai: claude
tags: session, demo, mock-data, f2, seed, network, rds, cognito, detailed
summary: db:demo-seed ONLY=f2 shapes stock + lots so A-network plans auto-approve and cross-network plans wait; RDS/Cognito dump notes
---

> Detailed on purpose (user asked for detailed notes).

## Goal

- Demo for the finals: every feature (F1-F3) clickable many times from a ready database. The local DB is built first, then dumped to RDS by a teammate (EC2 owner) - no seed scripts run on RDS.
- One entry point after `npm run db:reset`: `npm run db:demo-seed`. Built one feature at a time, F2 first (F1, F3 still to do).

## Done

- Branch `demo/seed-scenarios` from `origin/backend-byok` (the newest line: Cognito, CloudFront, AI fixes; the old `fix/agents-f1-f2` is 9 commits behind). Upstream unset on purpose so nothing is pushed to backend-byok by accident. Not pushed, not merged (the branch only produces a DB).
- `backend/scripts/demo-seed.ts` (new) + `scripts/db.sh demo-seed` + `npm run db:demo-seed` (also applies `db/demo/03-networks.sql`). `ONLY=f2` (default), `RELEASE`, `SCALE`, `MIN_VALUE_A/X`. Refuses a non-local `DB_HOST` unless `CONFIRM_HOST` is set.
- Scenario kinds (lots `DEMO-F2<kind>-<owner><run>-<k>`):
  - A: receivers inside the owner's network -> plan AUTO_APPROVED -> TRANSPORTING (HA->HB,HC; HB->HA,HC; HC->HA,HB; HD->HE).
  - X: a receiver in the other network (HD/HE) -> READY_FOR_APPROVAL, approval by clicks (HA->HD,HE; HE->HA,HB; HB->HC,HD when a drug fits).
  - U: transport cost >= 20 % of value -> approval blocked with OPTION_REQUIRED until the owner picks an option.
- Shaping so the Agent's split is predictable: intended receivers cut to 5 % of target stock (ledger ISSUE_USAGE, ref_type `DEMO_F2_SHAPE`), every other hospital topped up to 1.3 x target (lot `DEMO-F2STK-*`).
- Tested locally on a freshly reset DB: round (`POST /pool/:id/agent-plan`) gives status FALLBACK (no LLM key) with lines only to the planned receivers; A plans TRANSPORTING, X and U wait; approving an X plan as the first receiver works (second approval in my test failed only because the test reused a stale `version`).

## Findings / decisions

- Network rule (matching.ts:195): AUTO_APPROVED needs all receivers in the origin network AND `network.auto_approve` AND economical. Economic check: cost (300 + 8 baht/km per receiver) < 20 % of value. Cheap drugs fail it, so the A scenarios (and X, so approval is not blocked) need drugs with enough value; this limits the lots: only ~8 of 14 wanted were created (distinct drugs are the bottleneck). `SCALE`/refill can only reuse a drug after its seeded lot is consumed.
- Dates: `current_date` is 2026-11-13 but the demo history stops 21 Oct and forecast origin is 19 Oct -> the old demo-f2 found 0 candidates on a fresh DB; hence explicit shaping. Lots expire 35-75 days after the seed day: seed close to the demo day.
- After `db:reset` the forecast must be loaded again (`POST /forecasts/runs` as system admin) or no candidate/alert exists. This is not yet part of `db:demo-seed`.
- RDS: `origin/backend-byok` compose defaults to the shared RDS (env override). `backend/.env` here and `docker-compose.override.yml` pin the local DB (127.0.0.1:5442). Backend started with explicit DB_* env.
- Login code (read, not changed): `/auth/login` accepts any password in {MASTER_PASSWORD (default doorare123), `password`, `admin`}, OTP only needs 6 digits; `/auth/cognito` trusts email/sub from the body and does not verify the id token. Cognito login matches `app_user` by `cognito_sub`, then by email (and links the real sub). Dumping over RDS replaces `app_user`: real emails must be inside the dump (to do later, last step before dump). BYOK defaults come from env vars, not from DB tables. Tell the EC2 owner about the login findings.
- `rds-backup-before.sql` in the repo root is empty (0 lines): make a real backup before any restore.

## Files touched

- new: `backend/scripts/demo-seed.ts`, this note. changed: `scripts/db.sh`, `package.json`. Untouched but still modified: `db/demo/README.md` (RDS/DB_HOST note, uncommitted, from before).

## Errors

- zsh: a `=====` echo and `$R:path` (modifier) broke commands; use `${R}:path`. macOS `sed -i` needs `''` (used python instead).
- A user-denied command: opening the DB before agreeing; fixed by asking first.

## Update: clean start (RELEASE=0 default)

- User wants a clean starting state they can click forward from, no half-way data: `RELEASE` now defaults to 0 (all seed lots start DETECTED = waiting for the pharmacist; nothing in the pool, no plans). `RELEASE=1` releases the first lot of each scenario (used only for API tests). Scope: F2 only; F1 and F3 will follow the same "start at the beginning" rule with their own switches.
- Fresh result after reset + forecast + seed: no pool lots, no open plans; DETECTED lots HA 13, HB 7, HC 4, HD 1, HE 2 (seed + 02-shape NE lots + a few history lots that were not shaped, so some of those may have no receiver).
- Web: `.claude/launch.json` `frontend-dev` (Vite, http://localhost:5173, proxies /api to :3001); login page shows "PostgreSQL (Port 5442)" = local DB. HA pharmacist and other MFA roles ask for OTP 123456.

## State / next steps

- Local DB now has test leftovers (plans, one approval): run `npm run db:reset`, reload forecasts, `npm run db:demo-seed` again before using or dumping it. The pre-reset DB copy is in the session scratchpad (not in the repo).
- Backend (tsx) was left running on :3001 against the local DB.
- Next: F1 (borrow flows with a spare pool of requests/alerts per state), then F3 (incidents), then fold forecast load into `db:demo-seed`, a `status` summary per role, `refill`; then put the real Cognito emails into `app_user` and write RESTORE.md for the teammate. Not committed.

## Update 2: shortage for the other waiting lots (2026-11-14)

- Problem (user): pressing the round on some lots gave "nobody can take it". Cause: after earlier test rounds every receiver had deficit 0, and the lots that are not seed lots (`DEMO-NE-*` from db/demo/02-shape.sql and a few history lots) sit on drugs that are well stocked at every hospital.
- Fix in `backend/scripts/demo-seed.ts`: new `shortageForOtherLots()` (runs after the scan, before RELEASE). For each DETECTED non-`DEMO-F2*` lot, up to 2 other hospitals with a verified mapping + WEEK forecast (u>=2) are drained to 5 % of target (own network first, then heaviest use). Drugs that carry a seeded F2 lot anywhere are skipped, otherwise extra takers appear (first try made HD's glove lot reach HA/HB/HC across networks, which broke "HD -> HE auto-approved").
- Result on a fresh seed (all lots released as a test, then DB restored to the clean dump): every seed lot lands exactly on its planned receivers (A: HA->HB,HC / HB->HA,HC / HC->HA,HB / HD->HE; X: HA->HD,HE / HE->HA,HB; U: HA->HD,HE). Other lots: takers for DEMO-NE-HA2/HA4/HA5, HB1/HB3, HC1, INFL2608-2.
- Known limits (by design, not bugs): `DEMO-NE-HA1` and `DEMO-NE-HB2` have no taker (no other hospital lists the drug with a forecast); DEMO-NE-HA3, HC2, NSS_2609-8, PARA2608-9, RABI2608-9 have nothing to release (owner uses it all in time, FEFO) -> "keep for own use" path.
- Agent/LLM: Groq key works but `openai/gpt-oss-120b` calls a non-existent tool `json`, `qwen/qwen3.8-27b` fails tool calls + free-tier 7000 ITPM; user is now trying OpenRouter `nvidia/nemotron-3-ultra-550b-a55b:free` via the Custom card (base URL https://openrouter.ai/api/v1, path /chat/completions). Until a model passes, runs are FALLBACK (F-22), which is fine for the demo. The saved config lives in `config_setting` (`agent.byok`) so a `db:reset` wipes it: back it up and re-insert (done by hand this session; consider a `db:demo-seed` step or a doc line).
- UI bug seen (known, reverted fix f659ab5 / 7d11baf): after the owner picks the cost option in a U plan the drawer shows only the green notice, the approve button comes back after a page reload.
- Pending user decision: make scenario U off by default (`WITH_U=1` to enable).
- DB state now: clean seeded copy restored (23 DETECTED lots, nothing in the pool, no open plan); backend on :3001, web on :5173 (tab "seed").

## Update 3: scenario U off by default (2026-11-14)

- User chose to keep the main demo simple: `demo-seed.ts` skips kind U unless `WITH_U=1` (`WITH_U=1 npm run db:demo-seed`). Code kept, header comment updated.
- Reseeded (reset + forecast + seed, AI config re-inserted): no `DEMO-F2U-*` lot, 8 seed lots (HA 4: N95, Paracetamol, PPE set, Favipiravir; HB 1; HC 1; HD 1; HE 1), DETECTED waiting HA=9 HB=6 HC=4 HD=1 HE=2, nothing in the pool, no open plan.
- The "no other hospital lists this drug" warning of `shortageForOtherLots()` also fires for lots whose drug is skipped because a seed lot carries it (HA5, HB3, HC1); those still got takers from the seed shortage in the earlier test. Wording only, not a failure.
- The "keep the U bug hidden" reason: the approve button disappears after choosing the cost option (known UI issue), so U is not in the default demo path.

## Update 4: F1 clean start (option "ข", 2026-11-14)

- Context: user asked what F1 mock would add; chose the small option: fix the clash with F2 + clean stray data (no new F1 scenarios yet). Rest of the plan (multi-lender, ESCALATED, ack/snooze examples, lender inbox, overdue return) NOT done, waits for the user.
- Finding that led to it: HA had LOW_STOCK alerts on drugs the F2 seed lots land on (Amlodipine, Metformin, ชุดทำแผล...). Borrowing them fills the F2 receivers' shortage -> F2 plan loses the receiver. One alert (HB Fentanyl) was LINKED_TO_REQUEST although its request (BR-2026-000574) was FULFILLED.
- Change in `backend/scripts/demo-seed.ts`: new `f1()` (ONLY default is now `f2,f1`): (1) `reevaluateAlerts()` imported from `src/modules/forecasts/forecasts.runs.js` so the shortages made by the F2 shaping become alerts; (2) stray LINKED_TO_REQUEST alerts with no active request -> RESOLVED; (3) every OPEN/ACKNOWLEDGED LOW_STOCK alert whose drug_master carries a `DEMO-F2%` lot (any hospital) -> SNOOZED for 7 days (re-opens after 7 days, so seed near the demo day); (4) prints the OPEN alerts left per hospital. `main()` now ends with `process.exit(0)` because the imported backend code keeps its own DB pool open. Header comment, `scripts/db.sh` usage line updated.
- Why snooze and not delete/ack: SNOOZED is a legal state that evaluation keeps (alerts.evaluate.ts:67-95 only reopens when `snoozed_until` is past); it is also a visible example of that status. Soft clash left on purpose: drugs drained only for the `DEMO-NE-*` lots (e.g. HA Sodium chloride, Ceftriaxone) still show alerts; borrowing them can take away one taker of a non-seed lot, it does not break any seed lot.
- Test: full `db:reset` -> forecast load -> `db:demo-seed` on the local DB (AI config saved to the scratchpad before and restored after, copy deleted). Output: alerts re-evaluated (WEEK opened 19, closed 1; MONTH opened 10, closed 7), 1 stray alert closed, 15 LOW_STOCK alerts on F2 drugs snoozed. Open LOW_STOCK left: HA very urgent 5 / urgent 2 / normal 1, HB urgent 4, HC very urgent 3 / urgent 1, HD 0, HE 0. HA's 8 left all have lenders on paper (lendable stock only; transit filter not checked): Ceftriaxone, Cobra antivenin, Ringer's lactate, Sodium chloride (only HE 616), Tranexamic acid, Epinephrine, Paracetamol (other drug master than the F2 one), Doxycycline. 0 active borrow requests, F2 state unchanged (8 seed lots, DETECTED HA=9 HB=6 HC=4 HD=1 HE=2, nothing in the pool).
- Side effects seen: the test borrow clicks of the user (BR-2026-000575..583) are gone because of the reset; BYOK/Nemotron config restored.
- Findings about the other F1 behaviour (for later): propose runs the F1 lender-selection agent (Nemotron 29-59 s, FALLBACK) and the button stays clickable -> double click gives 409 `สร้างคำขอจากแจ้งเตือนสถานะ LINKED_TO_REQUEST ไม่ได้`; fix is pending (saved in assistant memory, do not edit before the user says). VERY_URGENT sends up to 3 lenders only when no single lender covers the quantity (`allocateRound`, borrow.ts:137).
- Not done / limits: HD and HE have no open LOW_STOCK alert now (theirs are on F2 drugs, snoozed); forecast load is still a separate manual step before `db:demo-seed` (to fold in); nothing committed.
- Files touched: `backend/scripts/demo-seed.ts`, `scripts/db.sh` (comment), this note.

## Update 5: more alerts to borrow from (2026-11-14)

- Goal: user wanted more borrowable alerts on the stock alert page ("as appropriate", not equal everywhere; demo must work well and repeat). Concern raised by the user: if every hospital is short of a drug nobody can lend it.
- Finding: only ~13 non-F2 drugs per hospital have a forecast; the rest carry a waiting F2 lot, and their alerts are the F2 receivers' shortages (all 15 snoozed ones are DEMO_F2_SHAPE cuts), so the narrow "snooze only receivers" idea changes nothing. New alerts must come from cutting stock of drugs no DETECTED lot carries.
- Change in `backend/scripts/demo-seed.ts`: new `f1MoreAlerts()` (runs inside `f1()` after the first re-evaluation, then `reevaluateAlerts()` again). Per hospital tops up open LOW_STOCK alerts toward VERY_URGENT 3 / URGENT 3 / NORMAL 2 by draining stock (ledger ISSUE_USAGE, ref_type `DEMO_F1_SHAPE`, `drain()` got a refType arg) of a drug that: no DETECTED near-expiry lot of any hospital carries, has no active LOW_STOCK alert / borrow request at that hospital, forecast u >= 1/day, VED V for very urgent, V or E for urgent (E at 1.2 days of cover), E/D for normal (4 days), and >= 2 other hospitals that could lend (lots > 180 days minus their own target >= half the borrower's target). Lender count is recomputed after each cut (earlier cuts shrink lenders); a drug is cut at most 3 hospitals; the same hospital drug is never cut twice (first run bug: alerts only appear after the next evaluation, so the NOT EXISTS check did not see it).
- Safety net: after everything, the REAL lender filter (`loadBorrowConfig`, `loadNeed`, `buildLadder` from the borrow module: transit time, lendable stock, mapping, participation) runs for every OPEN LOW_STOCK alert; one with 0 eligible lenders is snoozed 7 days. Found on the first full run: HA Cobra antivenin (every hospital TRANSIT_TOO_LONG). Alerts with exactly 1 lender are kept (4: Sodium chloride at HA / HB / HC (only HE has stock), HB Influenza vaccine).
- Test: full `db:reset` -> forecast -> `db:demo-seed` three times on the local DB (first two found the double pick and the dead end). Final: open LOW_STOCK alerts HA 8 (VU 4, U 2, N 2), HB 8 (VU 2, U 4, N 2), HC 6, HD 5, HE 2 (29 in all, was 16); real ladder: every open alert has >= 1 eligible lender, most 2-3 (the quantity often exceeds one lender, so multi-lender rounds show up). F2 unchanged (DETECTED HA=9 HB=6 HC=4 HD=1 HE=2, nothing in the pool). AI config backed up in the scratchpad before and restored after (copy still to delete).
- Limits: HE stays at 2 (its drugs are mostly F2 shortages or contended; user said equal numbers are not needed). Borrowing the new alerts lowers lender stock (HE is the lender for many), re-seed to reset. Snooze (7 days) and expiry of the F2 lots count from the seed day, so seed near the demo day. Nothing committed.
- Files touched: `backend/scripts/demo-seed.ts` (header comment not yet reworded), this note, INDEX row.

## Update 6: forecast loaded by the seed itself (2026-11-14)

- Why: `db:demo-seed` needed a manual `POST /forecasts/runs` between reset and seed (db:scenarios does it inside its script, demo-scenarios.ts:134). A friend would have to create a script file; `npm run forecast:load` points at `scripts/load-forecast.ts` which does not exist.
- Change in `backend/scripts/demo-seed.ts`: `ensureForecast()` at the start of `main()`: if `forecast_run` has no SUCCEEDED row, logs in as `system_admin1.region@example.org` and calls `POST /forecasts/runs`; fails with a clear message (status + hint about `backend/models/artifacts/forecasts`) if it returns an error or no run was saved. `scripts/db.sh` usage line updated.
- Test: `db:reset` then `db:demo-seed` only (no manual forecast): "forecast loaded (2 run(s))", identical results to before (F2 waiting HA=9 HB=6 HC=4 HD=1 HE=2, open alerts HA 8, HB 8, HC 6, HD 5, HE 2). AI config backed up/restored, copy removed.
- Guide for the friend: `~/Downloads/DooRare-demo-seed-guide.md` (outside the repo; Mac + Windows Git Bash). Steps now: `db:reset`, start backend (`cd backend && npx tsx src/index.ts`), `db:demo-seed`, frontend dev. CSV (`db/mock/csv`) and forecast artifacts (`backend/models/artifacts/forecasts`) are not in git, the friend needs both.
- Branch facts: `origin/backend-byok` == HEAD (f4420c1), the local `backend-byok` is just stale; the only difference of `demo/seed-scenarios` is the uncommitted seed files (demo-seed.ts, db.sh, package.json, db/demo/README.md, ai-material). Do NOT commit `rds-backup-before.sql` (empty). Nothing committed yet.
- RDS: seed never runs on RDS; the user (no RDS access) dumps the local DB (`pg_dump`), the friend with EC2 access backs up RDS and restores it (dump/restore steps untested; RESTORE.md offered, not written).
- HIS question (user asked): no real HIS integration exists. `hospital_import` table and `hospital_drug.local_code` exist, no backend import endpoint/connector; "HIS Gateways 12/12", "HIS sync every 30 min" etc. are hard-coded UI sample data. Data comes from the mock CSV.
- Files touched: `backend/scripts/demo-seed.ts`, `scripts/db.sh`, this note.
