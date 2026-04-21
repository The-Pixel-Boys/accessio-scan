/**
 * Formatter tests. No Playwright/network — pure functions against a fixed
 * ScanResult. These catch output-shape regressions that silently break
 * downstream consumers (CI pipelines, GitHub Code Scanning).
 */

import { describe, expect, it } from 'vitest';

import { formatConsole } from '../src/formatters/console.js';
import { formatJson } from '../src/formatters/json.js';
import { formatSarif } from '../src/formatters/sarif.js';
import type { ScanResult } from '../src/types.js';

const CLEAN_RESULT: ScanResult = {
  url: 'https://example.com/',
  scannedAt: '2026-04-21T10:00:00.000Z',
  durationMs: 1234,
  toolVersion: '0.1.0',
  axeVersion: '4.10.2',
  violations: [],
  violationCount: 0,
  passCount: 42,
  incompleteCount: 3,
};

const BROKEN_RESULT: ScanResult = {
  ...CLEAN_RESULT,
  violations: [
    {
      ruleId: 'image-alt',
      impact: 'critical',
      description: 'Images must have alternate text',
      help: 'Ensures <img> has alt',
      helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/image-alt',
      tags: ['wcag2a', 'wcag111'],
      nodes: [
        {
          target: ['body > img'],
          html: '<img src="logo.png">',
          failureSummary: 'Fix any of the following: element is missing alt attribute.',
        },
      ],
    },
    {
      ruleId: 'color-contrast',
      impact: 'serious',
      description: 'Text elements must have sufficient color contrast',
      help: 'Elements must meet minimum color contrast ratio thresholds',
      helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/color-contrast',
      tags: ['wcag2aa', 'wcag143'],
      nodes: [
        { target: ['body > div'], html: '<div>...</div>', failureSummary: 'Insufficient contrast' },
        { target: ['body > p'], html: '<p>...</p>', failureSummary: 'Insufficient contrast' },
      ],
    },
  ],
  violationCount: 2,
};

describe('formatConsole', () => {
  it('emits a green success banner when no violations', () => {
    const out = formatConsole(CLEAN_RESULT);
    expect(out).toContain('No accessibility violations detected');
    expect(out).toContain('0.1.0');
    expect(out).toContain('axe-core 4.10.2');
  });

  it('lists each violation with rule id and element count', () => {
    const out = formatConsole(BROKEN_RESULT);
    expect(out).toContain('image-alt');
    expect(out).toContain('color-contrast');
    expect(out).toContain('1 element');
    expect(out).toContain('2 elements');
  });

  it('includes the help URL so users can jump to remediation docs', () => {
    const out = formatConsole(BROKEN_RESULT);
    expect(out).toContain('dequeuniversity.com/rules/axe/4.10/image-alt');
  });
});

describe('formatJson', () => {
  it('round-trips back to the original ScanResult shape', () => {
    const json = formatJson(BROKEN_RESULT);
    const parsed = JSON.parse(json) as ScanResult;
    expect(parsed).toEqual(BROKEN_RESULT);
  });

  it('produces stable output suitable for diffing', () => {
    const a = formatJson(BROKEN_RESULT);
    const b = formatJson(BROKEN_RESULT);
    expect(a).toBe(b);
  });
});

describe('formatSarif', () => {
  it('declares SARIF 2.1.0 with the accessio-scan driver', () => {
    const out = formatSarif(BROKEN_RESULT);
    const sarif = JSON.parse(out) as {
      version: string;
      runs: Array<{ tool: { driver: { name: string; version: string } } }>;
    };
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.runs).toHaveLength(1);
    expect(sarif.runs[0].tool.driver.name).toBe('accessio-scan');
    expect(sarif.runs[0].tool.driver.version).toBe('0.1.0');
  });

  it('maps critical/serious → error and moderate → warning', () => {
    const out = formatSarif(BROKEN_RESULT);
    const sarif = JSON.parse(out) as {
      runs: Array<{ results: Array<{ level: string; ruleId: string }> }>;
    };
    const results = sarif.runs[0].results;
    expect(results.every((r) => r.level === 'error')).toBe(true);
  });

  it('emits one result per violating element, not per rule', () => {
    const out = formatSarif(BROKEN_RESULT);
    const sarif = JSON.parse(out) as {
      runs: Array<{ results: unknown[] }>;
    };
    // 1 image-alt element + 2 color-contrast elements = 3 results.
    expect(sarif.runs[0].results).toHaveLength(3);
  });

  it('dedupes rules so SARIF.rules[] has one entry per ruleId', () => {
    const out = formatSarif(BROKEN_RESULT);
    const sarif = JSON.parse(out) as {
      runs: Array<{ tool: { driver: { rules: Array<{ id: string }> } } }>;
    };
    const ruleIds = sarif.runs[0].tool.driver.rules.map((r) => r.id);
    expect(ruleIds).toEqual(['image-alt', 'color-contrast']);
  });
});
