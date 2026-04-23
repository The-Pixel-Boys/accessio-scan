#!/usr/bin/env node
/**
 * accessio-scan CLI entry.
 *
 * Parses args, runs the scanner, prints the chosen format, and — if the
 * user opted in — uploads anonymized telemetry. The process exits with
 * code 1 iff the scan found at least one violation, which lets callers
 * use accessio-scan as a CI gate with no scripting.
 */

import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { scan } from './scanner.js';
import { formatConsole } from './formatters/console.js';
import { formatJson } from './formatters/json.js';
import { formatSarif } from './formatters/sarif.js';
import { uploadTelemetry } from './telemetry.js';
import type { OutputFormat } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf8'),
) as { version: string };

interface CliOptions {
  format: OutputFormat;
  output?: string;
  force: boolean;
  telemetry: boolean;
  telemetryEndpoint?: string;
  timeout: string;
  waitFor?: string;
}

const VALID_FORMATS: readonly OutputFormat[] = ['console', 'json', 'sarif'];

// Playwright selector length cap. Normal CSS/xpath selectors are far
// under 200 chars; 1000 is comfortable headroom while still shutting
// down pathological inputs (ReDoS-adjacent attacks on the selector
// parser, extreme memory blowups) when library consumers forward
// user input without their own bound.
const MAX_SELECTOR_LENGTH = 1_000;

async function main(): Promise<void> {
  const program = new Command();

  program
    .name('accessio-scan')
    .description('Open-source accessibility scanner. Runs axe-core against a URL and reports WCAG violations.')
    .version(packageJson.version)
    .argument('<url>', 'URL to scan (must include protocol, e.g. https://example.com)')
    .option('-f, --format <type>', 'output format: console | json | sarif', 'console')
    .option('-o, --output <file>', 'write output to a file instead of stdout')
    .option('--force', 'overwrite --output file if it already exists', false)
    .option('-t, --telemetry', 'opt in to anonymized telemetry (hashed hostname + rule counts only)', false)
    .option('--telemetry-endpoint <url>', 'override the telemetry endpoint (advanced)')
    .option('--timeout <ms>', 'page load timeout in milliseconds', '30000')
    .option('--wait-for <selector>', 'wait for a CSS selector before scanning')
    .action(async (url: string, options: CliOptions) => {
      await run(url, options);
    });

  await program.parseAsync(process.argv);
}

async function run(url: string, options: CliOptions): Promise<void> {
  if (!VALID_FORMATS.includes(options.format)) {
    process.stderr.write(`Error: invalid format "${options.format}". Must be one of: ${VALID_FORMATS.join(', ')}\n`);
    process.exit(2);
  }

  const parsedUrl = parseUrl(url);
  if (!parsedUrl) {
    process.stderr.write(`Error: "${url}" is not a valid URL. Must include protocol (http:// or https://).\n`);
    process.exit(2);
  }

  const timeoutMs = Number.parseInt(options.timeout, 10);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    process.stderr.write(`Error: --timeout must be a positive integer (got "${options.timeout}").\n`);
    process.exit(2);
  }

  // Cap selector length before it reaches Playwright. Also protects
  // downstream library consumers who forward user input without
  // validating bounds themselves.
  if (options.waitFor && options.waitFor.length > MAX_SELECTOR_LENGTH) {
    process.stderr.write(
      `Error: --wait-for selector is ${options.waitFor.length} chars; max is ${MAX_SELECTOR_LENGTH}.\n`,
    );
    process.exit(2);
  }

  // Refuse to clobber an existing file unless --force. Default CLI
  // convention varies; we pick safe-by-default because a typo'd -o
  // can otherwise overwrite anything the user's process can write
  // (system config, source files, etc.).
  if (options.output && existsSync(options.output) && !options.force) {
    process.stderr.write(
      `Error: "${options.output}" already exists. Re-run with --force to overwrite.\n`,
    );
    process.exit(2);
  }

  const result = await scan({
    url: parsedUrl,
    timeoutMs,
    waitForSelector: options.waitFor ?? null,
  });

  const output = render(result, options.format);

  if (options.output) {
    writeFileSync(options.output, output, 'utf8');
    process.stderr.write(`Wrote ${options.format} report to ${options.output}\n`);
  } else {
    process.stdout.write(output);
    if (!output.endsWith('\n')) process.stdout.write('\n');
  }

  if (options.telemetry) {
    const upload = await uploadTelemetry(result, options.telemetryEndpoint ?? null);
    if (!upload.uploaded) {
      // Emit to stderr — never fail the scan on a telemetry hiccup.
      process.stderr.write(`accessio-scan: telemetry upload failed (${upload.error ?? 'unknown'})\n`);
    }
  }

  // Exit 1 iff violations found → lets CI pipelines gate on the exit code.
  process.exit(result.violationCount > 0 ? 1 : 0);
}

function render(result: Parameters<typeof formatConsole>[0], format: OutputFormat): string {
  switch (format) {
    case 'console':
      return formatConsole(result);
    case 'json':
      return formatJson(result);
    case 'sarif':
      return formatSarif(result);
  }
}

function parseUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`accessio-scan: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(2);
});
