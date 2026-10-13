---
name: source-driven-development
description: Use when framework-specific code must be written — ground every decision
  in official documentation, verify exact signatures, cite full URLs, and never rely
  on stale training data.
metadata:
  version: 1.0.0
  grade: G3
  domain: delivery
  status: active
  last-reviewed: '2026-08-06'
  owned-by-agent: code-implementer
---

# Source-Driven Development

The discipline that grounds every framework-specific code decision in official documentation rather than recalled training data. Model training snapshots go stale; APIs deprecate, signatures change, and the safest knowledge is the authoritative page, fetched at write time. This skill governs any code that depends on an external library, framework, or standard: it forces the implementer to detect the dependency, fetch the official source, implement the exact signature, and cite the full URL. Unverified recall is treated as a defect, not a convenience. Where the official source conflicts with what the code says, the conflict is surfaced to the reviewer — never silently resolved by trusting either side.

## WHEN TO USE

- **Boilerplate and scaffolding** — generating a new file, component, or project shape from a framework template; the template rules must come from the framework's official docs.
- **Framework patterns** — forms, routing, state management, auth, or any pattern with a canonical API shape; the exact call signature is not negotiable and must be verified.
- **Documentation review** — verifying that existing code still matches the current official API after a dependency update.
- **Starter code** — adapting sample code from a tutorial, blog, or prior project into production; every claim in the sample must be checked against the official source.
- **Framework upgrade confidence** — raising a major dependency version; the changed-signature surface is exactly where stale recall does the most damage and official diff/release notes are the only safe map.
- **Cross-version port** — moving a pattern between two framework majors or two runtimes; each target's own official API is fetched, never the source runtime's recall.

## WHEN NOT TO USE

- **Version-independent logic** — pure algorithms, math, or standard-library-agnostic logic where no external API is being called; the source is the language spec itself and recall is safe.
- **Simple fixes** — a one-line correction with an already-known signature that cannot plausibly have changed since the last verified use.
- **"Just do it quickly" requests** — an explicit time-constrained instruction where the implementer is told to skip verification; the speed constraint overrides, and any unverified choice is explicitly labeled UNVERIFIED in the output.

## DECISION TREE

Branch top-down; the first match decides.

1. **Detect the dependencies** — inspect the dependency manifests: package.json, requirements.txt, pyproject.toml, go.mod, Cargo.toml, or Gemfile. Identify every external package, its major version, and which APIs the code will touch. No manifest, no verification list — so the manifest is the first artifact to read. A transitive dependency reached by the code is still a dependency to verify; indirect use does not excuse the fetch.
2. **Fetch official docs only** — fetch the dependency's official documentation. The source hierarchy, in priority order: official docs → official blog/changelog → web standards (MDN and W3C) → compatibility data (caniuse, MDN browser-compat-data). Never cite Stack Overflow, unofficial blogs, or recalled training data as a source.
3. **Implement the exact signature** — write code using the exact names, argument order, option keys, and return shapes the official docs show. 100% signature fidelity is the target; any deviation is flagged and justified.
4. **Cite full URLs** — every framework-specific decision carries a citation with the full page URL (not a homepage link, not a bare package name). A decision without a citation is unverified.
5. **Surface conflicts** — when the official docs disagree with existing code, or when two official pages disagree, surface the conflict to the reviewer with both URLs and the recommendation. Never silently pick one.

## PATTERNS

- **Targeted pages, not homepages** — cite the specific API page (e.g., the function reference page), not the framework landing page. The landing page proves the framework exists; the API page proves the signature.
- **Flag unverified patterns** — any code that could not be traced to an official source is marked UNVERIFIED inline with the reason, so the reviewer sees exactly where confidence is missing.
- **Surface doc-vs-code conflicts** — when code behavior and the documented API diverge, that is a review item with both sources attached; the code is not assumed wrong just because it differs.
- **Version pinning** — record the verified version with each citation ("React 18.2.0 docs"), because the same URL can change meaning after a major release.
- **Label UNVERIFIED** — anything unsourced, including sample-code adaptations and recalled APIs, carries the literal label UNVERIFIED next to the code; the label survives into the diff so reviewers and QA can catch it.
- **Citation on the line, not the PR** — the citation lives beside the code it justifies, so a future reviewer reading one file sees the source without cross-referencing; PR-level citations are second-best and fail when the file is viewed in isolation.
- **Re-verify on major bump** — a major-version dependency change invalidates every prior citation for that package; the entire touched surface is re-fetched, never inherited from the older version's citations.

## FAILURE MODES & MITIGATIONS

Each entry is DETECT → FIX.

1. **Using a deprecated API** — code calls an API the official docs mark deprecated. *DETECT:* a deprecation notice or removal banner on the cited page, or a lint warning from the official toolchain. *FIX:* re-fetch the docs, switch to the replacement API, and update the citation before the code is accepted.
2. **Skipping dependency files** — code is written for a dependency the manifest check never saw. *DETECT:* no package.json/requirements.txt/pyproject.toml/go.mod/Cargo.toml was read before implementation, or an imported package is absent from the manifest. *FIX:* read the manifest first; an imported package missing from the manifest is a blocking defect.
3. **Citing unofficial sources** — the citation points at Stack Overflow, a personal blog, or an unmaintained wiki. *DETECT:* the URL host is not the package's official domain or its sanctioned documentation mirror. *FIX:* replace the citation with the official page; if no official page exists, the pattern is UNVERIFIED and flagged.
4. **Version fog** — code was verified against a different major version than the one installed. *DETECT:* the citation lacks a version, or the installed version and the cited version differ. *FIX:* pin the version in the citation, re-fetch the docs for the installed version, and re-verify every touched signature.
5. **Stale training recall** — the implementer writes from memory instead of fetching the docs. *DETECT:* no fetch step happened, no citation exists for a framework-specific line, or the code uses an API shape from an old release. *FIX:* require a citation for every framework-specific decision; code with no citation is sent back to the DECISION TREE step 2.
6. **Unverified claims** — a sample or a recalled snippet is adapted with no source check. *DETECT:* the code carries no UNVERIFIED label and no citation, yet it came from a tutorial or memory. *FIX:* either verify against official docs and add the citation, or label the code UNVERIFIED so the reviewer decides knowingly.
7. **Cut-and-paste signature drift** — the implementer copies an example but renames a parameter or reorders arguments against the docs. *DETECT:* a deviation from the documented signature is unflagged and unjustified. *FIX:* diff the written call against the cited signature; every deviation acquires an explicit justification or is corrected.
8. **Wrong-source preference** — a lower-priority source is used when a higher one exists. *DETECT:* a Stack Overflow or blog citation sits next to an existing official page for the same API, or compatibility data is cited where official docs cover it. *FIX:* elevate the citation to the highest available tier of the hierarchy; never cite a lower tier when a higher tier covers the same decision.

## QUANTITATIVE RULES

- **Signature fidelity: 100%** — the target is exact argument order, option keys, and return shapes as the official docs show; any deviation is an explicit, justified exception.
- **Cite priority ranks** — a source is accepted only from the hierarchy: (1) official docs, (2) official blog/changelog, (3) web standards (MDN/W3C/WHATWG), (4) compatibility data. Anything below rank 4 is not a citation.
- **Page depth: targeted** — each citation points at the specific API/function page, not the homepage; homepage-only citations fail review.
- **Citation density** — 1 full-URL citation per framework-specific decision or signature block; a file touching a framework API with zero citations is automatically unverified.
- **Fetch freshness** — verification is re-run whenever the dependency's major version changes or the last fetch is older than the dependency's release cadence; stale citations are re-fetched before use.
- **Higher-tier rule** — when two sources carry conflicting guidance, the higher-priority tier wins; a conflict within the same tier is surfaced, not resolved by coin-flip.
- **0-unsourced floor** — the gate accepts the UNVERIFIED label as a deliberate, reviewed state, but the count of unverified blocks introduced must be consciously accepted by the reviewer, never an accident.
- **Procrastination guard** — fetch costs are bounded: docs fetch and signature verify target at most one targeted page per framework decision, so verification does not become a research project of its own.

## VERIFICATION GATE

The code is verified before it is accepted. Every item must be true; a single false item sends the change back to the step that caused it.

- **Versions identified?** The installed dependency versions were read from the manifest and match the cited versions.
- **Docs fetched?** Official documentation was fetched during this session for every framework-specific decision; no decision rides on memory alone.
- **Sources official?** Every citation resolves to the official hierarchy (docs → official blog → web standards → compatibility data); no Stack Overflow, blogs, or training recall.
- **No deprecated API?** Each touched API was checked for deprecation notices in the fetched docs; none is in use.
- **Conflicts surfaced?** Any doc-vs-code divergence was reported to the reviewer with both URLs and a recommendation.
- **Unverified flagged?** Every unsourced or recalled item carries the literal UNVERIFIED label and none is silently presented as verified.
- **Citations verifiable?** Each URL resolves to a real page, carries a version when the API is versioned, and points at the targeted API page rather than a homepage.

Output shape — a framework-specific change renders with its evidence attached:

```text
DEPENDENCIES: {package@version, from manifest path}
DECISIONS: {decision → exact signature → citation URL (full)}
CONFLICTS: {doc-vs-code divergence, both URLs, recommendation}
UNVERIFIED: {item, reason, label}
```

A change with a signature that deviates silently, a homepage-only citation, a deprecated API, or an unflagged unsourced claim does not pass the gate.

## REFERENCES

- Package managers and their manifests — the dependency-detection step's ground truth: package.json, requirements.txt, pyproject.toml, go.mod, Cargo.toml, Gemfile.
- MDN Web Docs — the web-standards source for web platform APIs, the priority-3 tier of the source hierarchy.
- W3C / WHATWG standards — the normative specification source when MDN and official docs disagree.
- caniuse / browser-compat-data — the compatibility-data tier used when a standard is implemented inconsistently across runtimes.
- systems-core-architect — the sibling delivery-domain skill that governs systems-language implementation quality; source-driven-development supplies the verified API ground truth it builds on.
- systematic-debugging — the debugging discipline that re-verifies assumptions against the actual API when observed behavior contradicts the code.
- The framework's own upgrade guides — every major-version documentation set publishes a migration path; the note to re-verify on major bump in this skill's PATTERNS maps to those guides.
- semver.org — the semantic-versioning rules that define when a release breaks an API; the decision about when a citation must be re-fetched keys off the semver bump.
- API deprecation policy docs — each major framework publishes a deprecation-and-removal policy; the FAILURE MODES "deprecated API" check uses that policy as its basis for what counts as deprecated.
- MDN browser-compat-data — the machine-readable dataset behind the compatibility-data tier; it is the concrete source a citation resolves to when a standard varies across runtimes.

Ownership: maintained by code-implementer; source-driven-development is the delivery-domain skill that keeps framework-specific code grounded in fetched, cited, official sources.