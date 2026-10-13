---
name: security-hardening-specialist
description: Defensive hardening only — authentication, authorization, input validation,
  secrets handling, vulnerability remediation. Use when implementing or reviewing
  auth flows, validation, or a detected vulnerability's fix. Authorized pentest/exploit
  work routes to cybersecurity-specialist.
metadata:
  version: 0.2.0
  grade: G2
  domain: security
  status: active
  last-reviewed: '2026-08-06'
  owned-by-agent: security-auditor
---

# SECURITY HARDENING SPECIALIST

Harden applications against vulnerabilities. Follow OWASP Top 10.

## RULES
1. Defense in depth — multiple security layers
2. OWASP first — check Top 10 for every web app
3. Secrets never in code — scan for leaked credentials
4. Least privilege — minimum required permissions
5. Validate input, encode output

## OWASP TOP 10 QUICK FIXES

| Vulnerability | Fix |
|---------------|-----|
| Broken Access Control | RBAC, deny by default, validate every request |
| Cryptographic Failures | bcrypt/argon2, AES-256, TLS 1.3 |
| Injection | Parameterized queries, output encoding, ORM |
| Insecure Design | Threat modeling, rate limiting, lockout |
| Misconfiguration | Remove defaults, add security headers |
| Vulnerable Components | npm audit, Snyk, pin versions |
| Auth Failures | MFA, strong passwords, session regeneration |
| Data Integrity | Validate serialization, secure CI/CD |
| Logging Failures | Log security events, redact sensitive data |
| SSRF | Whitelist URLs, block internal IPs |

## AUTHENTICATION PATTERNS
```text
Access Token: 15min expiry
Refresh Token: 7 days, stored in DB
Rotation: Rotate on every use
Family tracking: Detect reuse → revoke family
```

## SECURITY HEADERS
```
Content-Security-Policy: default-src 'self'
Strict-Transport-Security: max-age=31536000
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
```

## SECRETS DETECTION
Patterns: `sk-`, `ak_`, `ghp_`, `github_pat_`, `-----BEGIN.*PRIVATE KEY-----`, `postgresql://`, `mysql://`

Tools: `gitleaks detect`, `trufflehog git file://.`

## INPUT VALIDATION
- Allowlist approach (not blocklist)
- Validate type, length, range, format
- Sanitize HTML with DOMPurify
- Parameterized queries for SQL

## OUTPUT
```text
[SECURITY]
Target: {file|service}
Findings:
1. [{SEVERITY}] {issue} — {location}
Hardening:
- {control applied}
Headers: {configured}
Secrets: {scanned}
```

## WHEN TO USE
- Adding or changing any code path that touches authentication, authorization, or input handling.
- A vulnerability has been reported in an owned service and must be reproduced, fixed, and verified.
- Reviewing a new dependency, exposing a new endpoint, or deploying a service to the internet.
- Audit/QA gate before release when the change crosses a trust boundary.

## WHEN NOT TO USE
- **Not a substitute for authorized penetration testing.** This skill hardens defects already identified or suspected; it does not emulate a sustained, adversarial exploit campaign.
- Do NOT begin active testing, fuzzing, or scanning against any live system **without prior written authorization** on scope. Authorized assessment belongs to `cybersecurity-specialist`; obtaining scoped permission first and cross-referencing that skill.
- Do not apply hardening blindly to areas with no threat model or no identified finding — patch the defect, not the whole surface.
- Not for writing new auth schemas from scratch; that is API design work, not post-hoc hardening.

## DECISION TREE
```text
1. THREAT MODEL FIRST  → for each component, run STRIDE:
     Spoofing | Tampering | Repudiation | Information disclosure | DoS | Elevation.
   Record per-component trust boundary, data classification, and entry points.
2. ATTACK SURFACE REVIEW → enumerate exposed endpoints, libraries, headers,
   cookies, upload/input paths, error responses. Keep the smallest surface that
   satisfies requirements.
3. CONTROLS PER FINDING  → map each resultant finding to the owning OWASP class
   (see OWASP TOP 10 QUICK FIXES) and select the least-privilege control.
4. VERIFY → apply control, add/adjust the authn/authz test, curl the headers,
   rescan secrets; confirm the severity is downgraded or closed.
```
Each step must finish before the next; an incomplete threat model produces a blind controls pass.

## FAILURE MODES & MITIGATIONS
- **CORS misconfiguration** — wide-open `Access-Control-Allow-Origin` echoing any origin.
  DETECT: check `Access-Control-Allow-Origin` against expected origin list on every endpoint.
  FIX: allow-list exact origins, never `*` with credentials; validate `Origin` server-side; drop preflight for unneeded methods.
- **IDOR / broken object-level authorization**.
  DETECT: test object IDs owned by one principal while calling as another; check the authz check is on the object, not the object list.
  FIX: deny by default; verify ownership on every object access; use opaque, unguessable IDs when feasible.
- **Mass assignment** — attacker-supplied fields overwrite protected model attributes.
  DETECT: craft a request with extra JSON/query fields (`role`, `isAdmin`) and observe persistence.
  FIX: explicit allowlist of assignable fields; reject unknown keys; map DTOs per role.
- **Rate-limit bypass** — attacker rotates identifiers to reset the counter.
  DETECT: probe limits with changing `X-Forwarded-For`, user-agent, or client id.
  FIX: rate-limit on a stable identity + IP fingerprint (not header alone); apply server-side limits and lockout; derive the secondary key only from trusted headers.
- **Timing attacks** — secret/account comparison leaks length or content.
  DETECT: measure variable-time equality on tokens/passwords over many reps.
  FIX: constant-time compare (HMAC, `hmac.compare_digest`); uniform error messages.
- **JWT algorithm confusion** — attacker passes `alg: "none"` or `HS256` against an RSA public key.
  DETECT: accept tokens with unexpected `alg`; sign HMAC tokens and swap the key.
  FIX: pin algorithms; never accept `none`; reject tokens whose `alg` is not in a server-side allowlist; validate key type with the algorithm.
- **Session fixation** — attacker pre-sets a session before login.
  DETECT: check whether the session id changes on privilege transition.
  FIX: regenerate/rotate the session id on login, elevation, and logout.
- **Secrets in images/logs** — credentials baked into a container layer or emitted to stderr.
  DETECT: `gitleaks detect`, `trufflehog git file://.`, scan logs and `docker history` for env/credential traces.
  FIX: remove and rotate the exposed secret; inject via secret manager at runtime; redact log writer; scan before every pipeline step.

## VERIFICATION GATE
- **SAST** on the changed code path with ZERO high/critical findings on OWASP-adjacent rules.
- **Dependency audit**: `npm audit` / `pip-audit` / `osv-scanner` clean of known-vulnerable components in the changed dependency graph.
- **Manual authn/authz test matrix**: each role × endpoint × object-ownership combination passes; include negative tests (anonymous, wrong-role, wrong-owner).
- **Headers verified via curl**: capture and assert `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection` on the hardened route.
- **Secrets scan**: `gitleaks --no-git`/`trufflehog` clean against both source and artifacts; no secrets in logs or images.
- Record every finding, its control, and the before/after verification evidence.

## REFERENCES
- OWASP ASVS (Application Security Verification Standard) — levels & control mapping.
- OWASP Top 10 — authoritative quick-fix table with real exploit patterns.
- NIST SP 800-63 — authentication / password / federation standards.
- WHATWG CORS spec — origin, preflight, and credentials semantics.
