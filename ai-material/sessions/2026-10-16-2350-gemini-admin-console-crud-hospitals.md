---
title: System Admin Console (ADM-01) with Hospital Details and Account CRUD
date: 2026-10-16
author: EgqZ
ai: GEMINI
tags: session, admin, dashboard, hospitals, account-crud, docker
summary: Built Admin Console with Dashboard KPIs, Hospital breakdown, and Account CRUD.
---

## Goal

- Implement the System Admin Console (`role: admin`, `?page=admin` / `?role=admin`) with:
  - Dashboard KPIs (drug request rounds, total users, total logins, online active users).
  - List of hospitals in Health Region 6 network with key delivery and status metrics.
  - Detail view for each hospital showing requests, approvals, rejections, timeouts, and dispatch details.
  - Account CRUD with user creation, editing, deletion/deactivation, and role assignments.
  - Verification via Docker container build and serving on port 8080.

## Done

- Added SVG icons `users`, `trash`, `activity`, `userCheck` to `frontend/src/components/common/icons.tsx`.
- Updated navigation catalogue and role mappings in `frontend/src/data/navigation.ts` for `SYSTEM_ADMIN` and `HOSPITAL_ADMIN`.
- Created mock data model `frontend/src/roles/admin/data/adminData.ts` with 12 network hospitals, real-time online presence, detailed dispatch logs, and user accounts.
- Built `frontend/src/roles/admin/admin.css` with glassmorphic cards, real-time pulse indicators, and responsive breakpoints.
- Built components:
  - `AdminHeader.tsx`: Title, active role status, 5 tabs (dashboard, hospitals, accounts, config, audit), quick indicators.
  - `AdminDashboardTab.tsx`: 4 primary KPIs, daily trend bar chart, hourly login density, and live authentication feed.
  - `HospitalListTab.tsx`: Searchable/filterable table of 12 network hospitals with request, approved, reject, timeout, and dispatch counts.
  - `HospitalDetailView.tsx`: Deep-dive into specific hospital transactions, item details, cold chain status, rejection reasons, driver/vehicle details, and staff list.
  - `AccountCrudTab.tsx`: Full user account management (Create, Read, Update, Delete/Deactivate) with modals and form validation.
  - `SystemConfigTab.tsx` (UI-17): Emergency Kill switches (AI auto-matching, emergency dispatch, HIS sync, external notifications) and global system parameters (timeouts, cold chain thresholds, radius).
  - `AuditLogTab.tsx` (UI-18): Cryptographic audit log with action filtering, user tracking, IP details, and SHA-256 integrity chain seal.
  - `AdminPage.tsx`: Main page managing tab navigation, selected hospital state, and toast feedback.
- Connected TopBar search input directly into `AdminPage` props (`query`, `onQuery`), instantly filtering across hospitals, accounts, and audit log tabs.
- Wired sidebar navigation items for "ตั้งค่า · Kill switch" (`?page=admin&tab=config`) and "บันทึกตรวจสอบ" (`?page=admin&tab=audit`).
- Integrated `AdminPage` into `frontend/src/App.tsx` at `?page=admin` or `?role=admin` with dedicated `ADMIN_USER` profile.
- Removed all Pharmacist operational items (alerts, req, lend, exp, pool, inc, tr, doc, rep) from Admin role navigation in `ROLE_NAV`; configured pure Admin menu (`adm`, `hosp`, `acct`, `|`, `cfg`, `aud`).
- Updated `TopBar` for Admin role: replaced pharmacist hospital selector dropdown with System Admin scope badge and dedicated admin security notifications.
- Rebuilt Docker image and container `ntt-data-doorare-frontend-1` via `docker compose up --build -d frontend`; verified HTTP 200 on port 8080.

## Decisions

- Followed `roles/<role>` conventions and created `src/roles/admin/{pages,components,data}` with role-scoped styling.
- Bound soft-deactivation modal to safety guidelines (SEC-004) while providing instant UI updates and toast notifications.

## Files touched

- `frontend/src/components/common/icons.tsx`
- `frontend/src/components/layout/TopBar.tsx`
- `frontend/src/data/navigation.ts`
- `frontend/src/App.tsx`
- `frontend/src/roles/admin/data/adminData.ts`
- `frontend/src/roles/admin/admin.css`
- `frontend/src/roles/admin/components/AdminHeader.tsx`
- `frontend/src/roles/admin/components/AdminDashboardTab.tsx`
- `frontend/src/roles/admin/components/HospitalListTab.tsx`
- `frontend/src/roles/admin/components/HospitalDetailView.tsx`
- `frontend/src/roles/admin/components/AccountCrudTab.tsx`
- `frontend/src/roles/admin/components/SystemConfigTab.tsx`
- `frontend/src/roles/admin/components/AuditLogTab.tsx`
- `frontend/src/roles/admin/pages/AdminPage.tsx`

## Enterprise Enhancements Added

- **Top 5 Essential & Rare Drugs Section**: Rendered in `AdminDashboardTab.tsx` with request frequencies, units, estimated THB value, and regional stock alerts (Normal, Low, Critical).
- **Executive Value Realized & Waste Prevention Banner**: Displaying ฿14.85M shared life-saving value, ฿3.24M near-expiry waste prevented, and cold chain safety metrics.
- **System Health & Gateway Infrastructure Bar**: Live indicators for 12/12 HIS gateways, 18/18 Cold Chain sensors, and AI Agent matching latency.
- **Executive Report Export Modal**: Modal allowing report type selection (Executive Summary, Cold Chain, Audit Trail), date range, and export format (PDF, Excel, CSV) with digital verification seal.
- **Hospital Configuration & Capabilities CRUD**: Added capability edit modal and "เพิ่มโรงพยาบาลในเครือข่าย" with customizable Cold Chain (2-8°C), Blood Bank, and AI Agent Auto-matching participation flags in both `HospitalListTab.tsx` and `HospitalDetailView.tsx`.

## Errors

- TypeScript unused variables and icon typos (`pill`, `alertTriangle`) resolved before production build.
- Fixed modal backdrop class alignment: mapped `.admin-modal-backdrop` and `.admin-modal-card` to `.admin-modal-overlay` and `.admin-modal` in `admin.css`.
- Replaced stub alert in `HospitalDetailView.tsx` with dedicated Export Modal and genuine Blob file download.
- Expanded hospital configuration in `HospitalDetailView.tsx` and `HospitalListTab.tsx` to allow full editing of hospital name, short name, code, province, service type, beds, Cold Chain, Blood Bank, and AI Auto-matching.

## Next steps

- System is completely built, clean of errors, verified on Docker port 8080.


