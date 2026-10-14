---
name: browser-automation
description: Use when automating browser via Playwright MCP — navigation, clicks, form filling, accessibility snapshots, and token-efficient extraction. Wired to mcp.playwright (headless + isolated) in opencode.jsonc.
metadata:
  version: 1.0.0
  grade: G2
  domain: delivery
  status: active
  last-reviewed: '2026-08-27'
  owned-by-agent: browser-automation
  mcp: playwright
  caps: vision
---

# Browser Automation — Playwright MCP for opencode

Token-isolated browser automation via `mcp.playwright` (`npx -y @playwright/mcp@latest --headless --isolated --caps vision` in `C:\Users\Oz\.config\opencode\opencode.jsonc:4`). Delegated to `browser-automation` / `mcp-agent` subagents so the primary thread never bloats.

## WHEN TO USE

- Navigating, clicking, typing, selecting, hovering via Playwright's accessibility tree
- Extracting structured data with JS evaluation (preferred over full snapshots)
- Form fill + submit, auth flows, pagination
- Snapshot vs screenshot trade-off: **snapshot (accessibility tree) by default, screenshot only for visual regression**
- Any task that says "open browser", "check UI", "scrape", "E2E smoke"

## WHEN NOT TO USE

- Pure API/data tasks with no UI — use `code-implementer` or `api-architect`
- Static file reads where `read`/`grep` suffices
- When you already have the DOM via code — don't launch browser to re-derive

## TOKEN EFFICIENCY CONTRACT (opencode-native)

1. **Accessibility first**: use `mcp_playwright_snapshot` at `depth=2` (not full dump)
2. **Targeted extraction**: `mcp_playwright_evaluate` for `document.querySelector` / `innerText` instead of parsing whole snapshot
3. **Headless default**: ` --headless --isolated` already set; only remove `--headless` when visual proof required
4. **Result concise**: return extracted values + `box=[x,y,w,h]` only, not raw HTML
5. **Delegation**: primary thread dispatches `task(subagent_type="browser-automation", ...)` — never run Playwright in primary context for multi-step flows

## MCP TOOL MAP (wired to `opencode mcp list: playwright ✓ connected`)

### Navigation
```
mcp_playwright_navigate(url)          → navigate + wait for settle (timeoutNavigation 60s)
mcp_playwright_navigate_back()        → history back
mcp_playwright_tabs(action: list|select|new|close) → tab management
```

### Interaction (always with `ref` from snapshot)
```
mcp_playwright_click(ref)             → click by accessibility ref
mcp_playwright_type(ref, text)        → type
mcp_playwright_select(ref, values)    → dropdown
mcp_playwright_hover(ref)             → tooltip / hover
mcp_playwright_drag(ref, toRef)       → drag
mcp_playwright_press_key(key)         → keyboard
```

### Extraction (token-efficient)
```
mcp_playwright_snapshot(depth=2)      → accessibility tree (preferred)
mcp_playwright_evaluate(js)           → targeted JS: `() => document.querySelector('.price')?.innerText`
mcp_playwright_screenshot(fullPage=false) → only for visual diff, omit otherwise
mcp_playwright_console(level)         → console logs at error|warning|info|debug
```

### Session
```
Isolated context per MCP call (—isolated) → no cross-contamination; reuse via same browser_context if needed
--caps vision → image responses allowed; omit for text-only to save tokens
```

## PATTERNS

### Minimal snapshot + evaluate (recommended)
```js
// 1. Navigate
await mcp_playwright_navigate({ url: "https://example.com" })
// 2. Snapshot shallow
let snap = await mcp_playwright_snapshot({ depth: 2 })
// 3. Targeted evaluate (not parsing full snap)
let price = await mcp_playwright_evaluate({ function: "() => document.querySelector('[data-testid=\"price\"]')?.innerText" })
return { price } // concise, not full page
```

### Form fill (token-efficient)
```js
await mcp_playwright_navigate({ url: "https://app.example.com/login" })
let snap = await mcp_playwright_snapshot({ depth: 2 }) // find refs for inputs
await mcp_playwright_type({ ref: snap.refs.email, text: "{env:TEST_USER}" })
await mcp_playwright_type({ ref: snap.refs.pass, text: "{env:TEST_PASS}" })
await mcp_playwright_click({ ref: snap.refs.submit })
return { url: await mcp_playwright_evaluate({ function: "() => location.href" }) }
```

### Pagination scrape
```js
let results = []
for (let i=0; i<3; i++) {
  results.push(await mcp_playwright_evaluate({ function: "() => [...document.querySelectorAll('.item')].map(e=>e.innerText)" }))
  let snap = await mcp_playwright_snapshot({ depth: 2 })
  await mcp_playwright_click({ ref: snap.refs.next })
}
return { count: results.flat().length, sample: results[0].slice(0,3) }
```

## OPencode DELEGATION TEMPLATE

Primary thread (build/plan):
```
task(
  subagent_type="browser-automation",
  description="smoke login",
  prompt="[MISSION] smoke test login flow\n[CONTEXT] url=https://app.example.com, creds in {env:}\n[OUTPUT] {success: bool, url, consoleErrors[]}"
)
```

Subagent returns only the essential result, not the full MCP transcript.

## FAILURE MODES & MITIGATIONS

| Failure | Mitigation |
|---|---|
| Snapshot too large (token bloat) | Use depth=2, then evaluate for specifics |
| Flaky click (not attached) | Wait settle 500ms (timeoutSettle), re-snapshot, retry with new ref |
| Headed popup blocked by headless | Re-run with `--headless` removed (edit opencode.jsonc command per run) |
| Secrets in URL | Pass via `{env:VAR}` not hardcoded |
| Isolated context loses auth | Persist via `storage-state` or re-login per task |

## VERIFICATION GATE

- Tool `opencode mcp list` shows `playwright ✓ connected`
- Snapshot depth ≤2 unless deep inspection justified
- No screenshot unless visual proof requested
- Returned payload <500 tokens (concise)

## REFERENCES

- `C:\Users\Oz\.config\opencode\opencode.jsonc:4` — `mcp.playwright.command`
- `C:\Users\Oz\.config\opencode\agents\browser-automation.md` + `agents/mcp-agent.md` — token-isolated executors
- Playwright MCP: `npx -y @playwright/mcp@latest --help` (caps: vision, pdf, devtools)
- Skill `general-orchestrator` for multi-step flows that include browser steps
