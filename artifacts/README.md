# UI artifacts

Scripted review screenshots of the dashboard — regenerated on demand, never hand-made.

## Regenerate

```sh
npm install          # once, at the repo root (installs playwright-core)
npm run capture      # captures the Docker build at http://localhost:8080
npm run capture:dev  # captures the Vite dev server at http://127.0.0.1:5173
```

Options: `node scripts/capture-screenshots.mjs --url <url> --out <dir> --channel msedge --executable <path>`.

## What you get

- `screenshots/<device>/full-page.png` — the entire page at that device size.
- `screenshots/<device>/<part>.png` — one image per UI part: `topbar`, `sidebar`,
  `page-header`, `kpi-row`, `alerts-panel`, `agent-suggestion`, `request-status-panel`,
  `nearby-hospitals`, `work-history`, `near-expiry`, `recent-activity`, `footer`
  (phone also gets `drawer-open.png`).
- `index.html` — gallery that shows every capture in one page (open it directly in a browser).
- `manifest.json` — machine-readable list with pixel dimensions and file sizes.

Devices: desktop 1440×900 · laptop 1280×800 · tablet 1024×768 · tablet portrait 768×1024 ·
phone 390×844 · small phone 360×800.

## Notes

- Parts are located by the `data-part="…"` attributes on the components in `frontend/src`;
  keep those when editing components or the capture skips them.
- The script drives the system Microsoft Edge / Google Chrome through `playwright-core`
  (no browser download); override with `--channel` or `--executable`.
- Re-runs overwrite `screenshots/`. The generated output (images, `index.html`, `manifest.json`) is gitignored — force-add it (`git add -f artifacts/screenshots`) only when you want a frozen review snapshot committed.
