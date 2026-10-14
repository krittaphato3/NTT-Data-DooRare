---
name: accessibility-audit
description: Use when auditing or fixing accessibility — WCAG 2.1/2.2 AA conformance, keyboard-only operation, screen-reader semantics, contrast, focus management, and accessible forms/dialogs. Use for a11y reviews, remediation, and compliance evidence. Visual design decisions route to frontend-web-engineer.
metadata:
  version: 1.0.0
  grade: G2
  domain: delivery
  status: active
  last-reviewed: '2026-10-10'
  owned-by-agent: accessibility-specialist
---

# Accessibility Audit

Evidence-based WCAG 2.1/2.2 AA auditing and remediation for real rendered UI. Accessibility is not a lint pass bolted on at the end — it is a set of user journeys that either complete or do not. This skill produces findings a human can reproduce and fixes a screen reader can confirm, not a checklist of guesses.

## WHEN TO USE

- **Conformance request** — "is this accessible?", "make this WCAG AA", "we need an a11y report".
- **After any UI change** — new component, modal, form, or navigation, before it ships.
- **Symptom reports** — "can't tab to it", "screen reader reads gibberish", "no focus visible", "color is unreadable".
- **Remediation** — fixing a specific violation with a verifiable before/after.
- **Compliance evidence** — producing an audit trail (finding → criterion → risk → fix → proof).

## WHEN NOT TO USE

- **Visual/interaction design direction** — layout, hierarchy, and aesthetic choices are `frontend-web-engineer` / `ui-ux-architect`; this skill judges conformance, not taste.
- **The component being built, not reviewed** — implement semantics while building (`frontend-web-engineer`) and route the audit here.
- **Backend API accessibility** — N/A; out of scope.

## DECISION TREE

1. **Scope.** One component, one page/flow, or the whole app? Auditing a whole app is a crawl + prioritized sample, not an exhaustive pass.
2. **Standard.** Default WCAG 2.1 AA (2.2 AA if the product targets it). State the target explicitly; a report without a named standard is unusable.
3. **Static pass first.** Automated scan (axe/lighthouse) + semantic review. Automated tools catch roughly a third of issues — never present a green scan as conformance.
4. **Keyboard pass second (mandatory).** Unplug the mouse: Tab/Shift+Tab through the entire flow, activate everything with Enter/Space, dismiss with Escape, confirm visible focus at every stop and no traps.
5. **Screen-reader pass third (mandatory for any interactive flow).** Read the flow with a real screen reader; confirm meaningful names, roles, states, and live-region announcements.
6. **Zoom / reflow and contrast last.** 200% zoom with no loss of content or function; 400% reflow without two-dimensional scroll; contrast thresholds measured, not eyeballed.
7. **Report and fix, then re-verify.** Each finding pairs a violation with the criterion, the user impact, the fix, and the re-test evidence.

## PATTERNS

### 1. Perceivable
- Every meaningful image has an accessible name; decorative media is hidden (`alt=""` / `aria-hidden`).
- Text contrast ≥ **4.5:1** (normal) and ≥ **3:1** (large ≥ 24px/19px bold). Non-text UI boundaries and icons ≥ **3:1**.
- Never encode meaning by color alone — pair with text, shape, or icon.
- Video: captions; audio: transcript.

### 2. Operable
- Everything operable by keyboard, in a logical order; no keyboard trap.
- **Visible focus** on every focusable control, ≥ 3:1 against its background.
- Custom widgets implement the expected key set (dialog: Escape + focus trap + return focus; menu: arrows + Home/End; tabs: arrow navigation).
- Touch targets ≥ 44×44 CSS px. Skip-to-content on repeated navigation.
- No time limit traps; pauses available for auto-updating content.

### 3. Understandable
- `lang` set on the document; meaningful page titles; predictable navigation.
- Every input has a programmatically associated label; errors are described in text and tied to the field (`aria-describedby`, `aria-invalid`).
- Required fields are marked in code, not only visually.
- Errors identify the field and say how to fix it; on submit failure, move focus to the first error or an error summary.

### 4. Robust
- Correct semantics first: native `<button>`, `<a>`, `<dialog>`, `<table>` over ARIA-rebuilt `div`s.
- ARIA only where HTML has no equivalent, and every role has its required properties/states (a `role="checkbox"` without `aria-checked` is worse than none).
- State changes announced via live regions (`aria-live="polite"` for most, `assertive` for errors); status messages visible and announced.
- Dialogs: `role="dialog"` + `aria-modal` + labelled by its heading + focus moved in and restored on close.

### 5. The audit record
One row per finding — never a prose blob:

```text
id | severity | WCAG criterion | element (file:line or selector) | user impact | repro steps | fix | re-test evidence
```

Severity ladder: **CRITICAL** (blocks a task — no keyboard path, no name on a control, unreadable text), **HIGH** (task possible, painful), **MEDIUM** (annoyance/friction), **LOW/INFO** (polish).

## FAILURE MODES & MITIGATIONS

Each entry is DETECT → FIX.

1. **Scan theater** — DETECT: "axe passed, we're accessible". FIX: add the mandatory keyboard and screen-reader passes; report automated coverage as partial.
2. **Keyboard pass skipped** — DETECT: no Tab-order evidence in the report. FIX: run it; a UI where Tab does not reach the control is not accessible.
3. **Over-ARIA** — DETECT: `role` on a native element, redundant/incorrect `aria-*`. FIX: delete it; use the native element.
4. **Focus loss on dynamic UI** — DETECT: opening a modal or routing leaves focus on `document.body`. FIX: move focus to the dialog/summary and return it on close.
5. **Color-only meaning** — DETECT: required/error/selected shown only by hue. FIX: add text/icon/shape.
6. **Unlabeled or mislabeled control** — DETECT: control announced as "button" or "edit text" with no name. FIX: label association or `aria-label` with real copy.
7. **Contrast eyeballed** — DETECT: "looks fine" with no measured ratio. FIX: measure and record the exact ratio.
8. **Zoom untested** — DETECT: no reflow/zoom evidence. FIX: test 200% zoom and 400% reflow.
9. **Fix without re-test** — DETECT: remediation with no post-fix evidence. FIX: re-run the exact failing step and attach the result (`verification-before-completion`).

## QUANTITATIVE RULES

- Contrast: 4.5:1 text, 3:1 large text and non-text UI — measured values recorded, no rounding to pass.
- Touch target ≥ 44×44 CSS px; focus indicator ≥ 3:1; focus never removed.
- Zoom 200% (no loss) and reflow at 400% (320px width) without two-dimensional scroll.
- Automated tools ≈ one-third coverage — keyboard + screen-reader passes are mandatory, not optional.
- Every finding carries a file:line or selector plus reproducible steps; zero-evidence findings are not findings.

## VERIFICATION GATE

- **Standard named?** Target (WCAG 2.1 AA / 2.2 AA) stated in the report.
- **All four passes run?** Static + keyboard + screen-reader + zoom/contrast, each with evidence.
- **Findings reproducible?** Every finding has steps and a location a second person can follow to the same result.
- **Fixes re-tested?** Each remediation shows a before/after on the exact failing step.
- **Residual risk stated?** Anything not fixed is listed with its user impact and severity, never silently dropped.

```text
[ACCESSIBILITY AUDIT]
Standard: WCAG 2.1 AA      Scope: {flow/pages}
Passes: static (axe) ✓ · keyboard ✓ · screen reader ✓ · zoom/contrast ✓

FINDINGS:
1. [CRITICAL] {violation} — {criterion} — {file:line/selector}
   Impact: {what a user cannot do}
   Repro:  {steps}
   Fix:    {change}
   Re-test:{evidence}

SUMMARY: {n} CRITICAL · {n} HIGH · {n} MEDIUM · {n} LOW
Residual risk: {unfixed items + impact}
```

## REFERENCES

- WCAG 2.1 / 2.2 (W3C) — the normative criteria behind the four principles.
- axe-core / Lighthouse — the automated third of the audit, never the whole.
- WAI-ARIA Authoring Practices — expected roles, states, and key sets for custom widgets.
- `accessibility-specialist` agent — the auditor that runs this skill.
- `frontend-web-engineer`, `ui-ux-architect` — where semantic implementation happens.

Ownership: maintained by accessibility-specialist; accessibility-audit is the conformance-evidence skill for delivered UI.
