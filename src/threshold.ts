/**
 * CI-gate severity threshold logic. Lives in its own module so tests can
 * import the function without dragging the CLI's top-level main() side
 * effect along (it `process.exit`s on bad args at module load).
 */

/**
 * Impact threshold that decides whether the scanner exits non-zero.
 * Values are ordered from least- to most-severe; 'none' is a sentinel
 * meaning "never fail" (report-only mode for CI dashboards). 'any' is
 * the historical default — exit 1 on any violation regardless of impact.
 */
export type FailOnImpact =
  | 'none'
  | 'any'
  | 'minor'
  | 'moderate'
  | 'serious'
  | 'critical';

export const VALID_FAIL_ON: readonly FailOnImpact[] = [
  'none',
  'any',
  'minor',
  'moderate',
  'serious',
  'critical',
];

const IMPACT_RANK: Readonly<Record<string, number>> = {
  minor: 1,
  moderate: 2,
  serious: 3,
  critical: 4,
};

/**
 * Decide whether the configured threshold has been breached. Exposed via the
 * CLI's `--fail-on` flag and indirectly through the GitHub Action wrapper.
 *
 * @param result    raw scanner output (carries the violation list with impact tags)
 * @param threshold one of {@link FailOnImpact}
 * @returns true when at least one violation meets the threshold
 */
export function shouldFail(
  result: {
    violations: ReadonlyArray<{ impact?: string | null }>;
    violationCount: number;
  },
  threshold: FailOnImpact,
): boolean {
  if (threshold === 'none') return false;
  if (threshold === 'any') return result.violationCount > 0;
  const required = IMPACT_RANK[threshold];
  if (required === undefined) {
    // Unknown threshold — treat conservatively as 'any'. Validation
    // upstream should have caught this; belt-and-braces.
    return result.violationCount > 0;
  }
  return result.violations.some((v) => {
    const impact = v.impact?.toLowerCase();
    if (!impact) return false;
    const rank = IMPACT_RANK[impact];
    return rank !== undefined && rank >= required;
  });
}
