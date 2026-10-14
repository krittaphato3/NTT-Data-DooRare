# PR Types with Examples (on-demand reference)

Load this file only when drafting a specific PR type. Keep SKILL.md lean.

### Bug Fix
```markdown
## Summary
Prevents duplicate form submissions by adding server-side idempotency check.

## Motivation
Users could submit forms multiple times, causing duplicate database entries.

## Changes
- Added debounce logic to form submit handler
- Implemented server-side idempotency key
- Added database unique constraint

## Testing
- [x] Unit tests for debounce logic
- [x] Manual testing: rapid clicking scenario

Closes #123
```

### New Feature
```markdown
## Summary
Implements dark mode toggle with automatic system preference detection.

## Motivation
Users requested dark mode for eye strain reduction.

## Implementation Details
- Uses CSS custom properties for theming
- Stores preference in localStorage
- Respects prefers-color-scheme media query

## Screenshots
<details>
<summary>Light Mode</summary>

![Light](url)
</details>
<details>
<summary>Dark Mode</summary>

![Dark](url)
</details>

Closes #456
```

### Performance Optimization
```markdown
## Summary
Implements lazy loading for images below the fold, reducing LCP by 40%.

## Motivation
Core Web Vitals showed LCP at 4.2s (threshold: 2.5s).

## Performance Metrics
- Before: LCP 4.2s, FID 180ms
- After: LCP 2.1s, FID 85ms

Closes #789
```
