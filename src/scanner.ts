/**
 * Playwright + axe-core scan runner.
 *
 * Launches headless Chromium, navigates to the target URL, injects axe-core,
 * and runs the default ruleset. Returns a normalized ScanResult that the
 * formatters and the telemetry uploader both consume.
 *
 * Only Chromium is supported in v0.1.0. Firefox/WebKit can follow once the
 * output is stable — the rule list is identical across engines.
 */

import { chromium, type Browser, type Page } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Impact, ScanOptions, ScanResult, Violation } from './types.js';

const DEFAULT_TIMEOUT_MS = 30_000;

// Read our own package.json for the toolVersion field — package.json is
// next to dist/ after build, one level above dist/scanner.js.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
  version: string;
};

export async function scan(options: ScanOptions): Promise<ScanResult> {
  const start = Date.now();
  let browser: Browser | null = null;

  try {
    // The Chromium sandbox is a critical defense: if axe-core's JS (or the
    // scanned page) ever triggers a Chromium exploit, the sandbox keeps it
    // contained to the browser process. We ONLY disable it when the caller
    // explicitly opts in via ACCESSIO_SCAN_UNSAFE_DISABLE_SANDBOX=1, which
    // is the escape hatch for root-in-Docker CI setups that can't get
    // namespace privileges. The env var name is deliberately loud.
    const unsafeNoSandbox = process.env.ACCESSIO_SCAN_UNSAFE_DISABLE_SANDBOX === '1';
    if (unsafeNoSandbox) {
      process.stderr.write(
        'accessio-scan: WARNING — Chromium sandbox disabled via ACCESSIO_SCAN_UNSAFE_DISABLE_SANDBOX. ' +
          'Only use this in trusted CI; never on developer machines.\n',
      );
    }

    browser = await chromium.launch({
      headless: true,
      args: [
        // --disable-dev-shm-usage avoids /dev/shm running out in tiny
        // CI containers; not a security toggle.
        '--disable-dev-shm-usage',
        ...(unsafeNoSandbox ? ['--no-sandbox'] : []),
      ],
    });

    const context = await browser.newContext({
      userAgent: `accessio-scan/${packageJson.version} (+https://github.com/The-Pixel-Boys/accessio-scan)`,
      // Common viewport so responsive issues show consistently across runs.
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();

    await page.goto(options.url, {
      timeout: options.timeoutMs || DEFAULT_TIMEOUT_MS,
      waitUntil: 'networkidle',
    });

    if (options.waitForSelector) {
      await page.waitForSelector(options.waitForSelector, {
        timeout: options.timeoutMs || DEFAULT_TIMEOUT_MS,
      });
    }

    const axeResults = await runAxe(page);

    return {
      url: options.url,
      scannedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
      toolVersion: packageJson.version,
      axeVersion: axeResults.testEngine.version,
      violations: axeResults.violations.map(normalizeViolation),
      violationCount: axeResults.violations.length,
      passCount: axeResults.passes.length,
      incompleteCount: axeResults.incomplete.length,
    };
  } finally {
    if (browser) await browser.close();
  }
}

async function runAxe(page: Page): Promise<AxeResults> {
  // @axe-core/playwright's AxeBuilder returns results typed loosely; we
  // pin the shape we use to keep the call site readable.
  const results = await new AxeBuilder({ page }).analyze();
  return results as unknown as AxeResults;
}

function normalizeViolation(v: AxeViolation): Violation {
  return {
    ruleId: v.id,
    impact: (v.impact ?? 'minor') as Impact,
    description: v.description,
    help: v.help,
    helpUrl: v.helpUrl,
    tags: v.tags,
    nodes: v.nodes.map((n) => ({
      target: Array.isArray(n.target) ? n.target.map(String) : [String(n.target)],
      html: n.html,
      failureSummary: n.failureSummary ?? '',
    })),
  };
}

// Loose shape we actually use from axe-core's result — keeps this file
// decoupled from axe-core's sprawling type tree.
interface AxeResults {
  testEngine: { version: string };
  violations: AxeViolation[];
  passes: unknown[];
  incomplete: unknown[];
}

interface AxeViolation {
  id: string;
  impact: string | null;
  description: string;
  help: string;
  helpUrl: string;
  tags: string[];
  nodes: Array<{
    target: unknown;
    html: string;
    failureSummary: string | null;
  }>;
}
