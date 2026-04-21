# accessio-scan

Open-source accessibility scanner. Runs [axe-core][axe] against any URL and reports WCAG violations. MIT-licensed.

[axe]: https://github.com/dequelabs/axe-core

```bash
npx accessio-scan https://example.com
```

That's it. No account, no signup, no config file. Every run is a full WCAG 2.1 + 2.2 audit against the default axe-core ruleset.

Built by the team behind [accessio.ai](https://accessio.ai).

## Install

Run ad-hoc:

```bash
npx accessio-scan https://your-site.com
```

Or install globally:

```bash
npm install -g accessio-scan
accessio-scan https://your-site.com
```

Requires Node.js 20+ and downloads Chromium on first use (~300 MB via Playwright).

## Usage

```
accessio-scan <url> [options]

Options:
  -f, --format <type>              output format: console | json | sarif  (default: console)
  -o, --output <file>              write output to a file instead of stdout
  -t, --telemetry                  opt in to anonymized telemetry
  --telemetry-endpoint <url>       override the telemetry endpoint (advanced)
  --timeout <ms>                   page load timeout in milliseconds        (default: 30000)
  --wait-for <selector>            wait for a CSS selector before scanning
  -V, --version
  -h, --help
```

### Exit codes

| Code | Meaning |
|------|---------|
| `0`  | Scan succeeded, zero violations. |
| `1`  | Scan succeeded, one or more violations found. |
| `2`  | Scanner error (bad URL, timeout, unreachable). |

This makes `accessio-scan` a drop-in CI gate:

```yaml
- run: npx accessio-scan https://staging.example.com
```

### JSON output

Pipe into `jq` for custom rollups:

```bash
npx accessio-scan https://example.com --format json | jq '.violations[].ruleId'
```

### SARIF + GitHub Code Scanning

Emit a [SARIF 2.1.0][sarif] report and upload it to GitHub Code Scanning for inline annotations on pull requests:

```yaml
- run: npx accessio-scan https://example.com --format sarif -o a11y.sarif
- uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: a11y.sarif
```

[sarif]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html

### Wait for dynamic content

Single-page apps often finish rendering after `networkidle`. Use `--wait-for` to delay the scan until a specific element appears:

```bash
npx accessio-scan https://my-spa.com --wait-for '[data-ready="true"]'
```

## Programmatic API

```ts
import { scan, formatJson } from 'accessio-scan';

const result = await scan({
  url: 'https://example.com',
  timeoutMs: 30_000,
  waitForSelector: null,
  telemetryEnabled: false,
  telemetryEndpoint: null,
});

console.log(formatJson(result));
```

Full types are exported — see [`src/types.ts`](./src/types.ts).

## Telemetry & privacy

Telemetry is **opt-in** and off by default. When you pass `--telemetry`, accessio-scan sends a minimal report to `https://service.accessio.ai/v1/telemetry/scan` containing:

| Field      | Value |
|------------|-------|
| `hostHash` | SHA-256 hash of the URL's hostname. One-way. |
| `ruleId`   | axe-core rule identifier (e.g. `color-contrast`). |
| `impact`   | `critical` \| `serious` \| `moderate` \| `minor`. |
| `count`    | Number of elements violating this rule on this scan. |
| `tags`     | WCAG level + SC tags from the rule's metadata. |
| `scannedAt`, `toolVersion`, `axeVersion` | Metadata. |

**Never sent:** URLs, query strings, page HTML, CSS selectors, HTTP headers, `failureSummary`, cookies, authentication, or any user input.

Privacy tests live in [`test/telemetry.test.ts`](./test/telemetry.test.ts) and verify that the wire payload contains none of the above. Any change that adds a field must add an assertion that it cannot leak PII.

The aggregated data powers the annual [State of Web Accessibility report](https://accessio.ai/blog/state-of-accessibility) and the industry benchmarks on accessio.ai. The full schema lives in the [accessio-service repo](https://github.com/accessio-ai/accessio-service).

### Custom endpoint

Self-host the telemetry endpoint against your own dataset:

```bash
npx accessio-scan https://example.com --telemetry --telemetry-endpoint https://your-collector.example/scan
```

### Disable Playwright browser download

If Chromium is already installed on CI:

```bash
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install accessio-scan
```

## Limitations

- **Single page only in v0.1.** Crawling / sitemap support lands in v0.2.
- **axe-core covers a subset of WCAG.** Roughly 50% of success criteria can be automatically detected; the rest need manual audits.
- **Not a substitute for usability testing** with disabled users.

## Related projects

- **[accessio.ai](https://accessio.ai)** — Hosted scanning + AI-generated remediation PRs for GitHub repos.
- **[axe-core](https://github.com/dequelabs/axe-core)** — The underlying rule engine (MPL 2.0).
- **[Playwright](https://playwright.dev)** — Headless browser automation.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Issues and PRs welcome.

## License

[MIT](./LICENSE). Bundles [axe-core](https://github.com/dequelabs/axe-core) under MPL 2.0 — see the LICENSE file for the notice.
