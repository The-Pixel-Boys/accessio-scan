/**
 * Public programmatic entry point.
 *
 * Most users run the CLI via `npx accessio-scan`, but the library API is
 * the first-class contract for users embedding the scanner into their own
 * tooling (custom CI steps, Slack bots, monitoring pipelines).
 */

export { scan } from './scanner.js';
export { formatConsole } from './formatters/console.js';
export { formatJson } from './formatters/json.js';
export { formatSarif } from './formatters/sarif.js';
export { buildPayload, uploadTelemetry } from './telemetry.js';

export type {
  Impact,
  OutputFormat,
  ScanOptions,
  ScanResult,
  Violation,
  ViolationNode,
} from './types.js';
export type { TelemetryPayload } from './telemetry.js';
