# Labels, Review Requests, Size Guidelines (on-demand reference)

## LABEL STRATEGY

### Status Labels
| Label | Use When |
|-------|----------|
| `work-in-progress` | PR not ready for review |
| `ready-for-review` | PR complete, awaiting review |
| `needs-revision` | PR requires changes |
| `approved` | PR has required approvals |

### Type Labels
| Label | Use When |
|-------|----------|
| `bug` | Addresses a bug |
| `enhancement` | New feature |
| `documentation` | Doc changes |
| `performance` | Performance improvements |
| `security` | Security changes |
| `breaking-change` | Breaking changes |

### Size Labels
| Label | Files Changed |
|-------|---------------|
| `size/XS` | 1-10 lines |
| `size/S` | 10-50 lines |
| `size/M` | 50-200 lines |
| `size/L` | 200-500 lines |
| `size/XL` | 500+ lines |

## REVIEW REQUEST BEST PRACTICES

### When to Request
- Mark PR as "Ready for Review" when complete
- Use draft PRs for work-in-progress
- Don't request review on WIP PRs

### Who to Request
1. CODEOWNERS (automatic)
2. Subject matter experts
3. Team leads for architectural decisions

### How to Request
- Use @mentions to tag reviewers
- Explain why their input is needed
- Be explicit about feedback desired
- Set timeline expectations

## PR SIZE GUIDELINES

| Size | Review Time | Recommendation |
|------|-------------|----------------|
| XS (< 50 lines) | 5-10 min | Easy review |
| S (50-200 lines) | 15-30 min | Standard review |
| M (200-500 lines) | 30-60 min | Consider splitting |
| L (500+ lines) | 1+ hours | Split into smaller PRs |
