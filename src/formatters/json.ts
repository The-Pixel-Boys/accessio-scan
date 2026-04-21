/**
 * Stable JSON output suitable for CI pipelines and `jq` post-processing.
 *
 * The shape matches ScanResult 1:1 so the same structure is used in-process
 * (by the telemetry uploader) and on stdout. Keep this emission stable
 * across minor versions — downstream tooling may parse it.
 */

import type { ScanResult } from '../types.js';

export function formatJson(result: ScanResult): string {
  return JSON.stringify(result, null, 2);
}
