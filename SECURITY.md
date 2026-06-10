# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it privately by emailing
**isoisozakiso@gmail.com** instead of opening a public issue.

Please include:

- A description of the vulnerability and its impact
- Steps to reproduce
- Any suggested mitigation

We will acknowledge your report as soon as possible and keep you informed of the
progress toward a fix.

## Supported Versions

This project is deployed continuously from the `main` branch. Only the latest
deployed version is supported.

| Version | Supported |
| ------- | --------- |
| latest (`main`) | ✅ |
| older   | ❌ |

## Secrets

Application secrets (e.g. the Hotpepper API key and the share-token signing
secret) must be configured as **Cloudflare Worker secrets / environment
variables** — never committed to the repository. See [`.env.example`](./.env.example).
