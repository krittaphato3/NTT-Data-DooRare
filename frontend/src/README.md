# Frontend source layout

```
src/
  App.tsx                    app shell: sidebar + top bar + active role page + footer
  main.tsx                   React entry
  index.css                  design tokens, mockup primitives, responsive shell CSS
  components/
    common/                  shared, app-agnostic UI (icons)
    layout/                  shared chrome: Sidebar, TopBar, AccountMenu, Footer
  roles/
    pharmacist/
      pages/                 route-level screens (DashboardPage)
      components/            role-scoped panels (KpiRow, AlertsPanel, MiddleRow, …)
      data/                  role-scoped mock data (dashboard.ts)
  data/                      shared shell data (session.ts, navigation.ts)
  lib/                       helpers (time.ts: countdown formatting + tick hook)
```

## Rules

- New screen → `roles/<role>/pages/<Name>Page.tsx`, composed from that role's components.
- Widgets used by one role stay in `roles/<role>/components/`.
- Anything shared by 2+ roles moves up to `src/components/` (`common` primitives, `layout` chrome).
- Shared layout must not import role data — pass it as props (see `TopBar.notifications`).
- Mock data split: shared shell data in `src/data/`, role data in `roles/<role>/data/`.

## Responsive reference

Breakpoints are defined in `index.css` (see its header comment):
`≥1024` desktop with collapsible rail · `<1024` off-canvas drawer nav ·
`<768` phone top-bar grid · `<640` two-column KPI/tiles and 16px card padding · `<360` single-column KPIs.
