/**
 * SARIF 2.1.0 output for GitHub Code Scanning and other static-analysis
 * aggregators.
 *
 * Spec: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
 * GitHub upload: https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/sarif-support-for-code-scanning
 *
 * One run per scan. One result per violation element (not per rule) because
 * GitHub Code Scanning expects per-location results to render inline annotations.
 */

import type { Impact, ScanResult } from '../types.js';

// axe impact → SARIF level. SARIF has {error, warning, note, none}; we lose
// the critical/serious distinction but GH Code Scanning treats both as error.
const IMPACT_TO_LEVEL: Record<Impact, 'error' | 'warning' | 'note'> = {
  critical: 'error',
  serious: 'error',
  moderate: 'warning',
  minor: 'note',
};

interface SarifRule {
  id: string;
  name: string;
  shortDescription: { text: string };
  fullDescription: { text: string };
  helpUri: string;
  properties: { tags: string[]; impact: Impact };
}

interface SarifResult {
  ruleId: string;
  level: 'error' | 'warning' | 'note';
  message: { text: string };
  locations: Array<{
    physicalLocation: {
      artifactLocation: { uri: string };
      // We set region.snippet.text to the offending HTML. SARIF requires
      // startLine — we use 1 since axe doesn't give us line numbers.
      region: { startLine: number; snippet: { text: string } };
    };
  }>;
}

export function formatSarif(result: ScanResult): string {
  const rules: SarifRule[] = dedupeRules(result);
  const results: SarifResult[] = [];

  for (const violation of result.violations) {
    for (const node of violation.nodes) {
      results.push({
        ruleId: violation.ruleId,
        level: IMPACT_TO_LEVEL[violation.impact],
        message: {
          text: node.failureSummary || violation.help,
        },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: result.url },
              region: {
                startLine: 1,
                snippet: { text: node.html },
              },
            },
          },
        ],
      });
    }
  }

  const sarif = {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'accessio-scan',
            version: result.toolVersion,
            informationUri: 'https://github.com/accessio-ai/accessio-scan',
            rules,
          },
        },
        results,
      },
    ],
  };

  return JSON.stringify(sarif, null, 2);
}

function dedupeRules(result: ScanResult): SarifRule[] {
  const seen = new Map<string, SarifRule>();
  for (const v of result.violations) {
    if (seen.has(v.ruleId)) continue;
    seen.set(v.ruleId, {
      id: v.ruleId,
      name: v.ruleId,
      shortDescription: { text: v.help },
      fullDescription: { text: v.description },
      helpUri: v.helpUrl,
      properties: { tags: v.tags, impact: v.impact },
    });
  }
  return Array.from(seen.values());
}
