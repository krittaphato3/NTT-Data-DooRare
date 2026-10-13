# Scan, License, SBOM, Update Playbooks (on-demand reference)

Load only the section needed for the task at hand.

## VULNERABILITY SCANNING

### JavaScript/Node.js
```bash
npm audit
npm audit fix --dry-run
npx snyk test
npx audit-ci --critical
```

### Python
```bash
pip-audit
safety check
bandit -r .
```

### Go
```bash
govulncheck ./...
go list -m all | nancy sleuth
```

### Rust
```bash
cargo audit
cargo deny check
```

### Universal
```bash
trivy fs --format json .
syft . -o spdx-json > sbom.json
```

## SUPPLY CHAIN ATTACK PATTERNS

### Typosquatting
- **Attack**: Publish similar-named package
- **Examples**: `lodahs` vs `lodash`, `expresss` vs `express`
- **Defense**: Verify publisher, check download counts, review code

### Dependency Confusion
- **Attack**: Publish private package name to public registry
- **Defense**: Use scoped packages (`@mycompany/pkg`), namespace packages

### Maintainer Compromise
- **Attack**: Compromise maintainer account, inject malicious code
- **Defense**: Pin versions, review changelogs, use 2FA for publishing

### Malicious Code Injection
- **Attack**: Inject code via postinstall scripts
- **Defense**: Review package source, disable postinstall scripts

### Brandjacking
- **Attack**: Impersonate official packages
- **Defense**: Verify repository URL, check organization ownership

## LICENSE COMPLIANCE

### License Compatibility
| License | Commercial | Modify | Distribute | Patents |
|---------|------------|--------|------------|---------|
| MIT | ✅ | ✅ | ✅ | ✅ |
| Apache 2.0 | ✅ | ✅ | ✅ | ✅ |
| BSD 2-Clause | ✅ | ✅ | ✅ | ⚠️ |
| BSD 3-Clause | ✅ | ✅ | ✅ | ⚠️ |
| LGPL 2.1 | ✅ | ✅ | ⚠️ | ⚠️ |
| LGPL 3.0 | ✅ | ✅ | ⚠️ | ✅ |
| GPL 2.0 | ✅ | ⚠️ | ⚠️ | ⚠️ |
| GPL 3.0 | ✅ | ⚠️ | ⚠️ | ✅ |
| AGPL 3.0 | ⚠️ | ⚠️ | ⚠️ | ✅ |

### Checking Tools
```bash
# JavaScript
npx license-checker --summary
npx license-checker --failOn "GPL-3.0;AGPL-3.0"

# Python
pip-licenses --format=json
pip-licenses --fail-on="GPL-3.0"

# Go
go-licenses check ./...
```

## SBOM GENERATION

### SPDX Format
```json
{
  "spdxVersion": "SPDX-2.3",
  "dataLicense": "CC0-1.0",
  "packages": [
    {
      "SPDXID": "SPDXRef-Package",
      "name": "my-project",
      "versionInfo": "1.0.0",
      "licenseConcluded": "MIT"
    }
  ]
}
```

### CycloneDX Format
```json
{
  "bomFormat": "CycloneDX",
  "specVersion": "1.4",
  "components": [
    {
      "type": "library",
      "name": "lodash",
      "version": "4.17.21",
      "licenses": [{"license": {"id": "MIT"}}]
    }
  ]
}
```

### Generation Commands
```bash
# Syft (SPDX or CycloneDX)
syft . -o spdx-json > sbom.json
syft . -o cyclonedx-json > sbom.json

# npm
npx sbom-generator
```

## DEPENDENCY UPDATE STRATEGIES

### Automated Updates
- **Renovate Bot**: Configurable, supports monorepos
- **Dependabot**: GitHub native, security-focused

### Update Strategy
1. Patch updates: Auto-merge (bug fixes)
2. Minor updates: Review changelog, auto-merge if safe
3. Major updates: Manual review, test thoroughly

### Renovate Config
```json
{
  "extends": ["config:base"],
  "schedule": ["every weekend"],
  "automerge": true,
  "packageRules": [
    {"matchUpdateTypes": ["patch"], "automerge": true},
    {"matchUpdateTypes": ["major"], "automerge": false}
  ]
}
```
