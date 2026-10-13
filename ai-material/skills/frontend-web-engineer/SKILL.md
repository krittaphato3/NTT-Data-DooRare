---
name: frontend-web-engineer
description: Use when building or refining web frontend code — React/Next.js/Vue/Svelte, TypeScript, Tailwind/CSS, component and state architecture, forms, and client data fetching. Use for pages, components, and UI logic. Scroll/motion work routes to animation-web-builder; WCAG conformance audits route to accessibility-audit.
metadata:
  version: 1.0.0
  grade: G3
  domain: delivery
  status: active
  last-reviewed: '2026-10-10'
  owned-by-agent: ui-ux-architect
---

# Frontend Web Engineer

The delivery skill for browser UI: components, state, data fetching, styling, and performance in real client apps. It exists because "make me a page" is the most common prompt in agentic coding and the most common place agents quietly produce working-but-unmaintainable UI. The rules below are the difference between a component that composes and a 400-line file with eleven `useEffect`s.

## WHEN TO USE

- **New UI surface** — a page, route, component, form, modal, table, or navigation shell.
- **Frontend logic** — client state, data fetching, optimistic updates, form validation, routing.
- **Styling work** — Tailwind/CSS classes, tokens, theme, responsive layout, dark mode.
- **Frontend refactor** — extract a component, lift state, split a god-component, remove prop drilling.
- **Frontend performance** — Core Web Vitals, bundle size, hydration errors, render thrash, list virtualization.
- **Framework-version work** — Server Components, Suspense, signals, islands — any case where the *correct* API depends on the installed major version (verify per `source-driven-development`).

## WHEN NOT TO USE

- **Visual identity, spacing, and design-token *decisions*** — that is UI/UX design (`ui-ux-architect` as a design task), not this skill's mechanics.
- **Scroll-driven animation, parallax, GSAP, canvas frame animation** — route to `animation-web-builder`.
- **Conformance auditing** (WCAG evidence, screen-reader runs, contrast math) — route to `accessibility-audit`; this skill only respects the rules.
- **Backend/API contract design** — `api-design-architect`.
- **Pure markup with no behavior and no repo conventions to honor** — a trivial static snippet can be written inline.

## DECISION TREE

1. **Read the existing UI first.** Find the component library, styling system, state manager, and router actually in use. New UI must match them; a bespoke pattern beside an existing system is a defect.
2. **Server or client (and per-version correctness).** Determine which components are server-rendered and which are client. Confirm the installed framework's semantics in the docs before writing `"use client"`, Suspense boundaries, or loaders — do not port idioms from a version you are not on.
3. **Data: fetch where it belongs.** Server-rendered data on the server; client data via the project's query/cache layer, never ad-hoc `useEffect` fetch loops.
4. **State: local first, lift only on evidence.** Local state until a second consumer exists; then lift. Global store only for genuinely cross-cutting state. Cache/server state is not component state.
5. **Compose, don't configure.** Prefer small composable primitives + a variant helper over a component with fifteen boolean props.
6. **Style with tokens.** Use the existing token scale for color, space, radius, and type. No magic hex or arbitrary `px`.
7. **Verify in the running app.** Build/typecheck clean, then load the actual page and confirm render, interaction, and no console errors — attaching evidence per `verification-before-completion`.

## PATTERNS

### 1. Component contract
- Props are explicit and typed; no `any`, no implicit `children` shapes.
- One primary responsibility per component; if the name needs "And", split it.
- Variants via a bounded union (`'primary' | 'secondary' | 'ghost'`), not stacked booleans.
- Forward refs and spread rest props on primitives so composition and a11y attributes survive.

### 2. Rendering & hydration
- Keep server/client boundary as low in the tree as possible; a `"use client"` at the page root ships the whole subtree to the browser.
- Never render non-deterministic values (dates, `Math.random`, `window` reads) during SSR — they cause hydration mismatches. Gate with an effect or a stable seed.
- Lists need stable keys; index keys only for static, never-reordering lists.

### 3. State model
```text
Server state  → query/cache layer (source of truth lives on the server)
URL state     → route params/search params (shareable, survives reload)
Form state    → form library or reducer colocated with the form
Local UI state→ useState in the nearest component that needs it
Global state  → only truly cross-cutting, long-lived, client-only values
```
If state can be derived from props or other state, derive it — do not store it.

### 4. Data fetching
- Server components: fetch on the server, cache explicitly (revalidate/revalidateTag or the framework equivalent).
- Client: use the project's query layer with stable keys, and handle the three states (`loading`, `error`, `empty`) explicitly — empty is not an error.
- Mutations: optimistic update + rollback on error, or a pending state; never leave the UI lying about server truth.
- Cancel/ignore stale responses (AbortController or query-layer semantics).

### 5. Forms
- Controlled inputs with a single validation source (schema library if present) shared between client and server.
- Disable submit while pending; show field-level errors adjacent to the field, not only in a toast.
- Never block paste; never strip input; validate on submit and on blur, not on every keystroke, for anything expensive.

### 6. Styling & responsive
- Token scale for color/space/radius/type; dark mode via the same tokens, never a second hardcoded palette.
- Mobile-first, fluid layouts; test at 360, 768, 1024, 1440 widths.
- Prefer CSS/layout primitives over JS measurement; avoid layout thrash from reading geometry in render.

### 7. Performance budgets
- **LCP** < 2.5s, **INP** < 200ms, **CLS** < 0.1 on a mid-tier mobile profile.
- Route-level code splitting; do not import a charting/markdown/editor library at the app root.
- Virtualize lists beyond ~100 rows; debounce high-frequency handlers.
- Reserve space for images/media (explicit dimensions) to prevent CLS; lazy-load below the fold.

## FAILURE MODES & MITIGATIONS

Each entry is DETECT → FIX.

1. **God component** — DETECT: > ~250 lines, or > 8 props, or "And" in the name. FIX: extract by responsibility; keep the container thin.
2. **Effect-driven data fetching** — DETECT: `useEffect` + fetch + manual loading flags. FIX: move to the query layer or server render.
3. **Hydration mismatch** — DETECT: console hydration error, flashing content. FIX: remove non-deterministic SSR output; gate client-only reads in effects.
4. **Prop drilling** — DETECT: a prop threaded through 3+ layers unchanged. FIX: composition (slots/children) or context at the nearest common ancestor.
5. **Style drift** — DETECT: hex literals, arbitrary spacing, a second button style. FIX: replace with tokens and the existing primitive.
6. **Version-idiom porting** — DETECT: an API that does not exist in the installed major version. FIX: verify against the installed version's docs (`source-driven-development`) before writing.
7. **Accessibility regression** — DETECT: `div` with `onClick`, missing label, unannounced state change. FIX: semantic element + label; escalate a full audit to `accessibility-audit`.
8. **Bundle creep** — DETECT: route bundle grows with no feature that justifies it. FIX: dynamic import the heavy module; check the bundle report.
9. **Test theater** — DETECT: snapshot-only tests asserting markup, not behavior. FIX: assert user-observable behavior (`test-driven-development`).

## QUANTITATIVE RULES

- Component soft cap ~250 lines; split beyond that. Prop count soft cap ~8.
- Lighthouse/CWV floors: LCP 2.5s, INP 200ms, CLS 0.1 (mid-tier mobile, throttled).
- Breakpoints verified: 360 / 768 / 1024 / 1440.
- List virtualization threshold ~100 rows; debounce input handlers ≥ 200ms when they trigger work.
- Every new interactive component ships with at least one behavior test.

## VERIFICATION GATE

Every item must hold; a false item returns the work to the step that caused it.

- **Builds clean?** Typecheck + build + lint pass, output attached.
- **Rendered and interacted?** The page was actually loaded; render, primary interaction, and console (no errors) confirmed with evidence.
- **Conventions honored?** Uses the repo's existing components, tokens, state, and data layers — no parallel system introduced.
- **States covered?** loading / error / empty / populated all handled for every async surface.
- **Budgets met?** CWV targets hold on a throttled mobile profile, or the delta is stated as measured.
- **A11y respected?** Semantic elements, labels, focus, and keyboard path intact (full audit routed to `accessibility-audit`).

```text
[FRONTEND DELIVERABLE]
Surface: {route/component}   Framework: {name + major version}
Files:   {changed paths}
States:  loading ✓ error ✓ empty ✓ populated ✓
Budget:  LCP {x}s · INP {x}ms · CLS {x}  (profile: mid-tier mobile)
Evidence:{build log · test output · rendered check}
A11y:    {respected | audit routed to accessibility-audit}
```

## REFERENCES

- Core Web Vitals (LCP/INP/CLS) — the performance thresholds in QUANTITATIVE RULES.
- `ui-ux-architect` agent — design tokens, component architecture, and the visual systems this skill implements.
- `animation-web-builder` — scroll/motion work carved out above.
- `accessibility-audit` — conformance evidence carved out above.
- `source-driven-development` — mandatory for framework-version API accuracy.

Ownership: maintained by ui-ux-architect; frontend-web-engineer is the delivery-domain skill for browser UI mechanics.
