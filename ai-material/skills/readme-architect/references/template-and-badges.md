# Section Guidelines + Badge Codes (on-demand reference)

Load only when drafting or updating a README.

## SECTION GUIDELINES

### Header
- Center-aligned with `<div align="center">`
- Logo (if exists)
- Project name as H1
- One-liner description
- Badge row (build, license, version, stars)

```markdown
<div align="center">

# Project Name

**A short description of what your project does.**

[![Build][build-shield]][build-url]
[![License][license-shield]][license-url]
[![Stars][stars-shield]][stars-url]

</div>
```

### About The Project
Answer: What? Why? How?
- Problem statement
- Key features (bullet list)
- Screenshot/GIF if applicable

### Built With
Technology badges:
```markdown
* [![React][React.js]][React-url]
* [![Node.js][Node.js]][Node-url]
```

### Getting Started
1. Prerequisites (with install commands)
2. Installation (step-by-step)
3. Environment variables (table format)

### Usage
- Basic example with code block
- Advanced example
- Expected output

### Configuration
Table format:
```markdown
| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| API_KEY   | Your API key | -       | Yes      |
```

### Roadmap
Checkbox format:
```markdown
- [x] Feature 1
- [x] Feature 2
- [ ] Feature 3
```

### Contributing
Link to CONTRIBUTING.md + brief steps.

### License
Badge + link to LICENSE file.

### Contact
- Name
- Email
- Project Link

### Acknowledgments
Credit list.

## BADGE CODES (Copy-Paste)

### Essential Badges
```markdown
[![Build](https://github.com/USER/REPO/actions/workflows/ci.yml/badge.svg)](https://github.com/USER/REPO/actions)
[![License](https://img.shields.io/npm/l/express.svg)](https://github.com/USER/REPO/blob/master/LICENSE)
[![Version](https://img.shields.io/npm/v/express.svg)](https://npmjs.org/package/express)
[![Stars](https://img.shields.io/github/stars/USER/REPO.svg?style=social)](https://github.com/USER/REPO/stargazers)
[![Issues](https://img.shields.io/github/issues/USER/REPO.svg)](https://github.com/USER/REPO/issues)
[![Last Commit](https://img.shields.io/github/last-commit/USER/REPO.svg)](https://github.com/USER/REPO/commits)
```

### Social Badges
```markdown
[![Twitter](https://img.shields.io/badge/-Twitter-1DA1F2?style=flat-square&logo=twitter&logoColor=white)](https://twitter.com/HANDLE)
[![Discord](https://img.shields.io/badge/Discord-7289DA?style=flat-square&logo=discord&logoColor=white)](https://discord.gg/INVITE)
```

### Dynamic Stats
```markdown
![Stats](https://github-readme-stats.vercel.app/api?username=USER&show_icons=true&theme=radical)
![Languages](https://github-readme-stats.vercel.app/api/top-langs/?username=USER&layout=compact)
```
