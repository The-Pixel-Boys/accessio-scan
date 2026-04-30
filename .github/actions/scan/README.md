# Accessio accessibility scan — GitHub Action

Composite action that runs [`accessio-scan`](https://github.com/The-Pixel-Boys/accessio-scan) against a URL in CI and fails the build when WCAG violations breach a configured impact threshold.

## Quick start

```yaml
- uses: The-Pixel-Boys/accessio-scan/.github/actions/scan@main
  with:
    url: https://example.com
    fail-on: serious
```

A complete workflow example lives at [`examples/github-actions/basic.yml`](../../../examples/github-actions/basic.yml).

## Inputs

| Name            | Required | Default                  | Description |
| --------------- | -------- | ------------------------ | ----------- |
| `url`           | yes      | —                        | Target URL to scan. Must include `http://` or `https://`. |
| `fail-on`       | no       | `serious`                | Impact threshold: `none` \| `any` \| `minor` \| `moderate` \| `serious` \| `critical`. `none` makes the gate report-only; `any` matches the CLI's historical default (fail on any violation). |
| `format`        | no       | `sarif`                  | Output format: `console` \| `json` \| `sarif`. |
| `output-file`   | no       | `accessio-scan-results.{format}` | Path the report is written to. Default lives in `$GITHUB_WORKSPACE`. |
| `wait-for`      | no       | —                        | CSS selector that must be present before the scan starts. Useful for SPAs. |
| `timeout`       | no       | `30000`                  | Page-load timeout in milliseconds. |
| `node-version`  | no       | `20`                     | Node.js version. |
| `upload-sarif`  | no       | `true`                   | When `format=sarif`, upload to GitHub code-scanning (security tab). Requires `security-events: write` permission on the calling job. |
| `artifact-name` | no       | `accessio-scan-report`   | Workflow artifact name. Empty string skips the upload. |
| `version`       | no       | `latest`                 | `accessio-scan` npm version to install. Pin for reproducible builds. |

## Outputs

| Name          | Description |
| ------------- | ----------- |
| `exit-code`   | Raw exit code from `accessio-scan`. `0` = pass, `1` = threshold breached, `2` = scanner error. |
| `report-path` | Absolute path to the report file. Useful when you want to upload it elsewhere or transform it. |

## Adoption pattern

Start with `fail-on: critical`, ratchet down as the codebase cleans up:

1. Day 1 — `fail-on: critical`. Catches the worst regressions; doesn't gate on existing serious findings.
2. Week 2 — `fail-on: serious`. After the team has cleared critical findings.
3. Steady state — `fail-on: any` or `fail-on: minor`. After backlog is at zero.

Use `fail-on: none` when you want the report and the SARIF upload but never want the build to fail (good for first-week visibility before turning on enforcement).

## Permissions required

The workflow that calls this action needs:

```yaml
permissions:
  contents: read
  security-events: write   # only when upload-sarif is true
```

## How it works

1. Sets up Node.js, restores a cached Playwright browser bundle.
2. `npm install -g accessio-scan@<version>` and `npx playwright install chromium`.
3. Runs the CLI with the configured threshold; the CLI owns the pass/fail decision (see `src/threshold.ts`).
4. Always uploads the report as a workflow artifact, even on failure.
5. When `format=sarif`, also pushes findings to GitHub code-scanning.
