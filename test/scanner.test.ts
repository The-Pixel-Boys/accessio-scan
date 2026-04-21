/**
 * Scanner integration tests. These need real Playwright Chromium, so they
 * run slower than the formatter/telemetry unit tests. On CI the postinstall
 * `npx playwright install chromium` step handles the browser binary.
 *
 * Fixtures are local HTML files served via file:// so tests are hermetic —
 * no network, no flaky remote sites.
 */

import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import { scan } from '../src/scanner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixtureUrl = (name: string): string => `file://${resolve(join(__dirname, 'fixtures', name))}`;

describe('scan', () => {
  it('returns zero violations on an accessible fixture', async () => {
    const result = await scan({
      url: fixtureUrl('accessible.html'),
      timeoutMs: 10_000,
      waitForSelector: null,
      telemetryEnabled: false,
      telemetryEndpoint: null,
    });

    expect(result.violationCount).toBe(0);
    expect(result.violations).toEqual([]);
    expect(result.toolVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(result.axeVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(result.durationMs).toBeGreaterThan(0);
  }, 30_000);

  it('detects violations on a deliberately broken fixture', async () => {
    const result = await scan({
      url: fixtureUrl('broken.html'),
      timeoutMs: 10_000,
      waitForSelector: null,
      telemetryEnabled: false,
      telemetryEndpoint: null,
    });

    expect(result.violationCount).toBeGreaterThan(0);
    const ruleIds = result.violations.map((v) => v.ruleId);
    // broken.html is missing img alt, language attribute, and input label.
    expect(ruleIds).toContain('image-alt');
    expect(ruleIds).toContain('html-has-lang');
  }, 30_000);
});
