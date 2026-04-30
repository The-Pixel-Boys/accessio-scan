/**
 * Unit tests for the {@code shouldFail} threshold function in src/cli.ts.
 *
 * The CLI's exit-code contract is what CI gates depend on; threshold logic
 * is the most consequential piece of code in the repo. Each branch gets at
 * least one passing case and one failing case.
 */

import { describe, expect, it } from 'vitest';
import { shouldFail } from '../src/threshold.js';

type V = { impact?: string | null };

function result(impacts: Array<string | null | undefined>): {
  violations: V[];
  violationCount: number;
} {
  const violations: V[] = impacts.map((impact) => ({ impact: impact ?? null }));
  return { violations, violationCount: violations.length };
}

describe('shouldFail', () => {
  it('returns false when threshold is "none" even with critical violations', () => {
    expect(shouldFail(result(['critical', 'serious']), 'none')).toBe(false);
  });

  it('returns false when threshold is "any" and there are no violations', () => {
    expect(shouldFail(result([]), 'any')).toBe(false);
  });

  it('returns true when threshold is "any" and there is a single minor violation', () => {
    expect(shouldFail(result(['minor']), 'any')).toBe(true);
  });

  it('returns true when threshold is "serious" and a serious violation is present', () => {
    expect(shouldFail(result(['minor', 'serious']), 'serious')).toBe(true);
  });

  it('returns true when threshold is "serious" and a critical violation is present', () => {
    // critical outranks serious — must still trip the gate.
    expect(shouldFail(result(['minor', 'critical']), 'serious')).toBe(true);
  });

  it('returns false when threshold is "serious" but only minor + moderate violations are present', () => {
    expect(shouldFail(result(['minor', 'moderate']), 'serious')).toBe(false);
  });

  it('returns false when threshold is "critical" and only serious violations are present', () => {
    expect(shouldFail(result(['serious', 'serious']), 'critical')).toBe(false);
  });

  it('handles missing impact field as non-fatal', () => {
    // axe-core occasionally emits violations without an impact tag; those
    // must not gate the build at any threshold above "any".
    expect(shouldFail(result([null, undefined]), 'serious')).toBe(false);
    expect(shouldFail(result([null, undefined]), 'any')).toBe(true);
  });

  it('treats unknown impact values as non-fatal at non-"any" thresholds', () => {
    expect(shouldFail(result(['weird-value']), 'serious')).toBe(false);
  });

  it('is case-insensitive on the impact tag', () => {
    expect(shouldFail(result(['SERIOUS']), 'serious')).toBe(true);
    expect(shouldFail(result(['Critical']), 'serious')).toBe(true);
  });
});
