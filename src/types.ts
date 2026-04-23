/**
 * Shared types for accessio-scan.
 *
 * Impact levels mirror axe-core's `impact` enum. We keep them as a string
 * union rather than importing from axe-core so downstream consumers of the
 * JSON / SARIF output don't need axe-core at build time.
 */

export type Impact = 'critical' | 'serious' | 'moderate' | 'minor';

export interface ViolationNode {
  target: string[];
  html: string;
  failureSummary: string;
}

export interface Violation {
  ruleId: string;
  impact: Impact;
  description: string;
  help: string;
  helpUrl: string;
  tags: string[];
  nodes: ViolationNode[];
}

export interface ScanResult {
  url: string;
  scannedAt: string;
  durationMs: number;
  toolVersion: string;
  axeVersion: string;
  violations: Violation[];
  violationCount: number;
  passCount: number;
  incompleteCount: number;
}

export type OutputFormat = 'console' | 'json' | 'sarif';

export interface ScanOptions {
  url: string;
  timeoutMs: number;
  waitForSelector: string | null;
}
