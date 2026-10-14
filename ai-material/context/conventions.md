# Conventions

Code style: match existing inline-style + CSS-class mix; keep mockup values verbatim when replicating UI (design source: `Mockups/Dashboard - Pharmacist Hospital/Main.dc.html`).

Naming: PascalCase component files; `roles/<role>` folder names lowercase; data files lowercase (`dashboard.ts`, `session.ts`).

Folder rules:
- Role screens: `frontend/src/roles/<role>/pages/`.
- Role-scoped panels/components: `frontend/src/roles/<role>/components/`.
- Role mock data: `frontend/src/roles/<role>/data/`.
- Shared chrome (Sidebar, TopBar, AccountMenu, Footer): `frontend/src/components/layout/`.
- Shared primitives (icons): `frontend/src/components/common/`.
- Shared shell data: `frontend/src/data/`; helpers: `frontend/src/lib/`.

Component rules:
- Shared layout must not import role data — pass role data as props.
- Responsive behavior belongs to `index.css` classes with documented breakpoints; avoid inline media-responsive styles.

API rules: none yet — mock data in `src/roles/*/data/` + `src/data/`.

Forbidden patterns: deep relative path chains beyond the role folder for role files; duplicating layout/components per role.

Preferred libraries: none added yet (React + Vite + TS only). Ask before adding dependencies.
