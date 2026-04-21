/**
 * Human-readable console output. This is the default format and what most
 * users see first, so the priority is "one glance tells you if you pass".
 */

import chalk from 'chalk';

import type { Impact, ScanResult, Violation } from '../types.js';

const IMPACT_ORDER: Impact[] = ['critical', 'serious', 'moderate', 'minor'];

const IMPACT_BADGE: Record<Impact, string> = {
  critical: chalk.bgRed.white.bold(' CRITICAL '),
  serious: chalk.bgRedBright.white.bold(' SERIOUS '),
  moderate: chalk.bgYellow.black.bold(' MODERATE '),
  minor: chalk.bgBlue.white.bold(' MINOR '),
};

export function formatConsole(result: ScanResult): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(chalk.bold(`accessio-scan v${result.toolVersion}  (axe-core ${result.axeVersion})`));
  lines.push(chalk.dim(`→ ${result.url}`));
  lines.push(chalk.dim(`  ${result.durationMs}ms · ${result.passCount} passes · ${result.incompleteCount} incomplete`));
  lines.push('');

  if (result.violations.length === 0) {
    lines.push(chalk.green.bold('✔ No accessibility violations detected.'));
    lines.push(chalk.dim('  (axe-core only covers a subset of WCAG. Manual audits are still recommended.)'));
    lines.push('');
    return lines.join('\n');
  }

  const grouped = groupByImpact(result.violations);
  const totalNodes = result.violations.reduce((sum, v) => sum + v.nodes.length, 0);

  lines.push(chalk.red.bold(`✖ ${result.violations.length} violations across ${totalNodes} elements:`));
  lines.push('');

  for (const impact of IMPACT_ORDER) {
    const violations = grouped.get(impact);
    if (!violations || violations.length === 0) continue;

    for (const v of violations) {
      lines.push(`${IMPACT_BADGE[impact]} ${chalk.bold(v.ruleId)}  ${chalk.dim(`(${v.nodes.length} element${v.nodes.length === 1 ? '' : 's'})`)}`);
      lines.push(`  ${v.help}`);
      lines.push(chalk.dim(`  ${v.helpUrl}`));

      // Show up to 3 example nodes per violation; more is noise.
      const examples = v.nodes.slice(0, 3);
      for (const node of examples) {
        const selector = node.target.join(' ');
        lines.push(chalk.dim(`    → ${truncate(selector, 80)}`));
      }
      if (v.nodes.length > examples.length) {
        lines.push(chalk.dim(`    … and ${v.nodes.length - examples.length} more`));
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

function groupByImpact(violations: Violation[]): Map<Impact, Violation[]> {
  const groups = new Map<Impact, Violation[]>();
  for (const v of violations) {
    const bucket = groups.get(v.impact) ?? [];
    bucket.push(v);
    groups.set(v.impact, bucket);
  }
  return groups;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
