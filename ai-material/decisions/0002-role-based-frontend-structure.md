---
title: Role-based frontend structure
date: 2026-10-14
author: buffy
ai: Codebuff Buffy
tags: decision, frontend, structure, responsive
summary: Organize frontend by role with shared layout; responsive via CSS breakpoints.
---

# Role-Based Frontend Structure

Decision:
Organize `frontend/src/` as shared shell + per-role feature folders:
`roles/<role>/pages` (screens), `roles/<role>/components` (role panels), `roles/<role>/data` (role mock data),
with shared `components/common` (primitives), `components/layout` (chrome), `data/` (session, navigation), `lib/` (helpers).

Reason:
The dashboard will grow to multiple roles and screens; a single `App.tsx` + flat `components/` folder does not scale.

Consequences:
- New screens/panels must follow the layout rules in `frontend/src/README.md`.
- Shared layout must not import role data; pass it as props (`TopBar.notifications`).
- Responsive behavior lives in `index.css` classes with documented breakpoints
  (1024 drawer, 768 phone bar, 640 two-column, 360 single column), not inline styles.
