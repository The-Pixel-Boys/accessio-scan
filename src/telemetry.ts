/**
 * Opt-in anonymized telemetry.
 *
 * Only sends violation counts per rule + a SHA-256 hash of the scanned
 * hostname. No URLs, no HTML, no selectors, no headers. The hash is one-way;
 * the receiving service can detect "N different origins hit rule X" but
 * cannot reconstruct which origins.
 *
 * Uploads are best-effort — any network error is swallowed. A broken
 * telemetry endpoint never fails a user's scan.
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';

import type { ScanResult } from './types.js';

const DEFAULT_ENDPOINT = 'https://service.accessio.ai/v1/telemetry/scan';
const UPLOAD_TIMEOUT_MS = 5_000;

const TelemetryPayloadSchema = z.object({
  hostHash: z.string().length(64),
  scanner: z.literal('accessio-scan'),
  toolVersion: z.string().max(20),
  axeVersion: z.string().max(20),
  scannedAt: z.string().datetime(),
  violations: z.array(
    z.object({
      ruleId: z.string().max(100),
      impact: z.enum(['critical', 'serious', 'moderate', 'minor']),
      count: z.number().int().nonnegative(),
      tags: z.array(z.string().max(60)).max(40),
    }),
  ),
});

export type TelemetryPayload = z.infer<typeof TelemetryPayloadSchema>;

export function buildPayload(result: ScanResult): TelemetryPayload {
  const hostname = safeHostname(result.url);
  const hostHash = createHash('sha256').update(hostname).digest('hex');

  return {
    hostHash,
    scanner: 'accessio-scan',
    toolVersion: result.toolVersion,
    axeVersion: result.axeVersion,
    scannedAt: result.scannedAt,
    violations: result.violations.map((v) => ({
      ruleId: v.ruleId,
      impact: v.impact,
      count: v.nodes.length,
      tags: v.tags.slice(0, 40),
    })),
  };
}

export async function uploadTelemetry(
  result: ScanResult,
  endpoint: string | null,
): Promise<{ uploaded: boolean; error?: string }> {
  const url = endpoint ?? DEFAULT_ENDPOINT;

  // Reject everything that isn't http(s). Blocks file:// (arbitrary file
  // read on some runtimes), data:// (no-op but noisy), javascript://
  // (ignored by fetch but still a foot-gun), plus chrome://, gopher://,
  // etc. Primary attack scenario: an attacker who controls a user's CI
  // config passes --telemetry-endpoint pointing at a non-HTTP scheme to
  // probe the local filesystem or trigger unexpected fetch behaviour.
  if (!isHttpUrl(url)) {
    return { uploaded: false, error: 'telemetry endpoint must use http:// or https://' };
  }

  const payload = buildPayload(result);

  // Validate before shipping — catches our own bugs before they hit the wire.
  const parsed = TelemetryPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { uploaded: false, error: `payload validation failed: ${parsed.error.message}` };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(parsed.data),
      signal: controller.signal,
    });
    if (!response.ok) {
      return { uploaded: false, error: `HTTP ${response.status}` };
    }
    return { uploaded: true };
  } catch (err) {
    return { uploaded: false, error: err instanceof Error ? err.message : 'unknown error' };
  } finally {
    clearTimeout(timeout);
  }
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    // Pathological: user passed a non-URL that somehow made it through
    // validation. Hash the raw string so we still get a stable key.
    return url;
  }
}

function isHttpUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
