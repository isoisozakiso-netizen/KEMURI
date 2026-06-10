# Contributing to Pukari

Thank you for your interest in contributing to **Pukari (ぷかり)** — a search app
for finding smoking-friendly restaurants in Himeji, Japan.

## Code of Conduct

Please read our [Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you are
expected to uphold it.

## How to Contribute

### Reporting Bugs

1. Check [existing issues](../../issues) to avoid duplicates.
2. Use the **Bug report** template.
3. Include reproduction steps, expected vs. actual behavior, and your device/browser.

### Suggesting Features

1. Open an issue with the **enhancement** label (use the **Feature request** template).
2. Describe the use case and your proposed solution.

### Pull Requests

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/your-feature`.
3. Make your changes and run the checks: `npm run lint && npm run build`.
4. Commit with clear messages ([Conventional Commits](https://www.conventionalcommits.org/) encouraged).
5. Push and open a PR using the PR template.

## Development Setup

This project is a **Cloudflare Worker** that serves a single static front end
(`public/`) and a small JSON API (`src/index.js`). There is **no build/bundling
step** and **no framework** — it is intentionally dependency-light vanilla JS.

```bash
# Install the CLI (only needed for local dev / manual deploy)
npm install

# Run locally with Wrangler
npm run dev        # http://localhost:8787

# Validate syntax before committing
npm run lint
```

Data is stored in **Cloudflare KV** (`KEMURI_KV` binding). See
[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for details, and
[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) for deployment.

## Code Style

- **Vanilla JavaScript** (no TypeScript, no framework).
- Keep the front end in `public/index.html` and the Worker logic in `src/index.js`.
- Run `npm run lint` (syntax validation) before opening a PR.
- Prefer small, focused commits with descriptive messages.

## Questions?

Open a [Discussion](../../discussions) or an issue.
