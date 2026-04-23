# Contributing to accessio-scan

Thanks for your interest. This project is small by design — most contributions fall into one of three buckets:

1. **Bug reports** for scanner false positives or crashes.
2. **Format additions** (e.g. JUnit XML, CSV) that don't change the scan behavior.
3. **New CLI flags** that bridge common CI workflows.

If your change is larger — new rulesets, crawling, authentication, dashboards — please open a discussion issue first. Those are all planned post-v1.0 but need a design pass before code.

## Local setup

```bash
git clone https://github.com/The-Pixel-Boys/accessio-scan.git
cd accessio-scan
npm install
npx playwright install chromium
npm test
```

You'll need Node 20+ and ~500 MB of disk for Chromium.

## Before you open a PR

```bash
npm run typecheck   # no `any` sneaking in
npm run build       # dist/ compiles cleanly
npm test            # every test passes on your machine
```

The CI matrix runs tests on Node 20 and 22 against Chromium on Linux.

## Tests policy

- **Scanner tests** use local HTML fixtures in [`test/fixtures/`](./test/fixtures/). Never scan a remote URL in tests — network flakiness is not our user's problem.
- **Telemetry tests** include privacy assertions. If you add a new field to the telemetry payload, add an assertion that the field cannot leak PII (hostname, URL, selector, HTML). See [`test/telemetry.test.ts`](./test/telemetry.test.ts).
- **Formatter tests** use fixed `ScanResult` objects — no Playwright. These catch output-shape regressions.

## Telemetry and privacy

This is the one area where bad code lands in production with user impact. Any PR that touches [`src/telemetry.ts`](./src/telemetry.ts) requires:

1. An explicit check in the PR description of what data is sent.
2. A test asserting new fields cannot contain URL / HTML / selector content.
3. A README update to [`README.md#telemetry--privacy`](./README.md#telemetry--privacy) listing the new field.

If unsure, err on the side of **not** sending. Telemetry is opt-in and must stay minimal.

## Commit style

Conventional commits, briefly:

```
feat: add CSV formatter
fix: handle redirect chains longer than 20 hops
docs: clarify --wait-for usage
chore: bump axe-core to 4.11
```

## Release process

Maintainer-only. On main:

```bash
npm version minor   # or major / patch
git push origin main --tags
```

The `v*.*.*` tag triggers `.github/workflows/publish.yml`, which runs the test suite and publishes to npm with provenance.

## Code of conduct

We follow the [Contributor Covenant v2.1](./CODE_OF_CONDUCT.md). Be kind.
