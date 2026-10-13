---
name: container-optimizer
description: Optimize container images and Dockerfiles — multi-stage builds, base-image
  selection, layer caching, security hardening, and build speed. Use when image size,
  build time, or a container runtime concern is the task at hand.
metadata:
  version: 0.2.0
  grade: G2
  domain: production
  status: active
  last-reviewed: '2026-08-07'
  owned-by-agent: devops-engineer
---

# CONTAINER OPTIMIZER

Optimize Docker images for size, security, and build speed.

## RULES
1. Multi-stage builds — build deps not in production
2. Alpine/distroless base — 10-100x smaller
3. Non-root user — never run as root
4. Layer caching — order from least to most changing

## MULTI-STAGE PATTERNS

### Node.js
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

FROM node:20-alpine
RUN addgroup -g 1001 -S app && adduser -S app -u 1001 -G app
WORKDIR /app
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "dist/index.js"]
```

### Python
```dockerfile
FROM python:3.12-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

FROM python:3.12-slim
RUN useradd --create-home appuser
WORKDIR /app
COPY --from=builder /root/.local /home/appuser/.local
COPY . .
USER appuser
ENV PATH=/home/appuser/.local/bin:$PATH
CMD ["python", "-m", "uvicorn", "main:app"]
```

### Go (distroless)
```dockerfile
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY . .
RUN CGO_ENABLED=0 go build -o server .

FROM gcr.io/distroless/static-debian12
COPY --from=builder /app/server /
ENTRYPOINT ["/server"]
```

## BASE IMAGE SELECTION
| Image | Size | Use Case |
|-------|------|----------|
| `alpine` | ~5MB | Most apps |
| `distroless` | ~2MB | Production only |
| `slim` | ~80MB | When Alpine causes issues |
| `scratch` | 0MB | Static binaries |

## LAYER CACHING
```dockerfile
# BAD
COPY . .
RUN npm install  # Cache invalidated on any file change

# GOOD
COPY package*.json ./
RUN npm install  # Only re-runs when package.json changes
COPY . .
```

## SECURITY
- Non-root user
- Read-only filesystem (`--read-only`)
- Drop capabilities (`--cap-drop=ALL`)
- Scan: `trivy image myapp:latest`

## DOCKERIGNORE
```
node_modules
.git
.env
*.md
tests/
coverage/
```

## SIZE CHECKLIST
- [ ] Multi-stage build
- [ ] Alpine/distroless base
- [ ] Single RUN with cleanup
- [ ] .dockerignore configured
- [ ] No dev dependencies in production

## OUTPUT
```text
[CONTAINER]
Image: {name}
Optimizations:
- Base: {before} → {after}
- Multi-stage: {description}
Size:
- Before: {size}MB
- After: {size}MB
- Reduction: {percentage}%
Security:
- [ ] Non-root user
- [ ] Vulnerability scan passed
```

## WHEN TO USE
- A Dockerfile is hand-written with a fat base image and dev toolchain carried into production.
- Image size or build time is a real measured metric that must shrink (CI cost, pull latency, cold-start).
- Containers run as root, have mutable layers, or fail a vulnerability scan.
- You need a reproducible build with reliable layer cache hits across CI runs.
- The deploy target demands a minimal runtime (distroless, scratch, slim, alpine).

## WHEN NOT TO USE
- **The problem is the code, not the image** — slow startup, bugs, or excessive runtime memory are app concerns; this skill fixes the container, not the application.
- **Serverless / managed PaaS** where you cannot control the image (functions, build-packs-only platforms) — there is no Dockerfile to optimize.
- **One-off local exploration** — a throwaway container for a quick test does not justify optimization effort.
- **Kubernetes scheduling/networking** — deployment manifests, probes, and autoscaling belong to devops-pipeline-engineer; keep image-content concerns here.

## DECISION TREE
```text
1. MEASURE the pain first: size (docker image ls / docker history), build time
   (Docker BuildKit step timings), or security (trivy image).
2. SIZE pain   → base-image ladder: scratch (static) → distroless (runtime deps)
   → alpine (musl-compatible) → slim. Drop dev tooling via multi-stage.
3. BUILD-TIME pain → layer order (lockfiles first, source last), .dockerignore,
   BuildKit cache mounts, parallel stages.
4. SECURITY pain → non-root USER, read-only filesystem, --cap-drop=ALL, trivy scan.
5. RE-MEASURE after each change; never apply every optimization at once.
```
Never skip step 1 — "smaller" without a before/after number is not an optimization.

## FAILURE MODES & MITIGATIONS
- **Alpine breaks native modules (musl vs glibc).**
  DETECT: build succeeds but runtime crashes with "No such file or directory", a segfault, or a symbol error in a package with native bindings (bcrypt, pydantic-core, sharp).
  FIX: fall back to a `slim`/Debian base for that image, rebuild the native module inside the builder stage, or pin a musl-compatible version; record the exception next to the base-image choice.
- **Layer cache thrash — every commit rebuilds everything.**
  DETECT: `COPY . .` sits before `RUN npm install`/`pip install`; a one-line source change re-runs the entire dependency install.
  FIX: order layers least→most changing (copy lockfile, install, then copy source); use BuildKit `--mount=type=cache` for package-manager caches.
- **Non-root failure at startup.**
  DETECT: `PermissionError` / `EACCES` when the app writes logs, config, or sockets; bind-mount volumes are not writable by `USER app`.
  FIX: `chown` the writable paths before the `USER` switch, run with a fixed UID/GID (e.g. 1001) that matches the host volume, and mount `tmpfs` on `/tmp`.
- **Dev dependencies leak into the production image.**
  DETECT: the image contains compilers, test frameworks, source maps, `.env`, or `node_modules` dev packages; size and CVE surface are larger than they should be.
  FIX: multi-stage builds (dev deps only in the builder), `npm ci --omit=dev`, and a `.dockerignore` covering tests, coverage, `.git`, `*.md`, `.env`.
- **High-severity findings in the base image itself.**
  DETECT: `trivy image` reports CRITICAL CVEs in base OS packages rather than your application layer.
  FIX: pin a current base tag (minor pin, not `latest`), prefer distroless (fewer packages to scan), remove unused dependencies via multi-stage, and log accepted findings with a dated rationale.
- **Unmeasured "optimization".**
  DETECT: image changes with no before/after size or build-time recorded; the SIZE CHECKLIST stays unchecked.
  FIX: record before → after numbers and the reduction % in the OUTPUT block; compare `docker history` for layer-level deltas.

## VERIFICATION GATE
- **Reproducible build**: `docker build` completes from a clean cache with no warnings; same Dockerfile + lockfiles yields the same layers.
- **Measured size**: `docker image ls` shows the target size with the before → after delta and reduction % recorded.
- **Runtime smoke test**: the app starts as the non-root user, the HEALTHCHECK passes, and writes only to designated writable paths.
- **Security scan**: `trivy image <name>` has zero unaccepted CRITICAL findings; each accepted finding carries a dated rationale.
- **Layer-order check**: `docker history` shows dependency layers cached independently of source changes.
- **red-team-qa review**: adversarial check for root execution, leaked secrets, or dev tooling in the final image.

## REFERENCES
- Docker — Best practices for writing Dockerfiles (multi-stage, cache ordering, .dockerignore).
- Dockerfile reference — `USER`, `COPY --chown`, `RUN --mount=type=cache`, `HEALTHCHECK`.
- Trivy documentation — container image vulnerability scanning.
- BuildKit — cache mounts and reproducible builds.
