/**
 * Telemetry tests. The privacy guarantee lives here: if these pass, the
 * upload can only contain hashed origins + rule counts. Any regression
 * that smuggles URLs/HTML/selectors into the wire payload is a breach.
 */

import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';

import { buildPayload, uploadTelemetry } from '../src/telemetry.js';
import type { ScanResult } from '../src/types.js';

const RESULT: ScanResult = {
  url: 'https://example.com/secret-path?token=LEAK',
  scannedAt: '2026-04-21T10:00:00.000Z',
  durationMs: 1234,
  toolVersion: '0.1.0',
  axeVersion: '4.10.2',
  violationCount: 1,
  passCount: 5,
  incompleteCount: 0,
  violations: [
    {
      ruleId: 'image-alt',
      impact: 'critical',
      description: 'Images must have alt',
      help: 'Ensure alt',
      helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/image-alt',
      tags: ['wcag2a', 'wcag111'],
      nodes: [
        {
          target: ['body > img#profile-picture'],
          html: '<img src="/private/photo.jpg">',
          failureSummary: 'missing alt',
        },
      ],
    },
  ],
};

describe('buildPayload', () => {
  it('hashes the hostname with SHA-256 (hex, 64 chars)', () => {
    const payload = buildPayload(RESULT);
    const expected = createHash('sha256').update('example.com').digest('hex');
    expect(payload.hostHash).toBe(expected);
    expect(payload.hostHash).toHaveLength(64);
  });

  it('never includes the raw URL, path, or query string', () => {
    const wire = JSON.stringify(buildPayload(RESULT));
    expect(wire).not.toContain('secret-path');
    expect(wire).not.toContain('LEAK');
    expect(wire).not.toContain('example.com');
  });

  it('never includes HTML, selectors, or failureSummary', () => {
    const wire = JSON.stringify(buildPayload(RESULT));
    expect(wire).not.toContain('profile-picture');
    expect(wire).not.toContain('photo.jpg');
    expect(wire).not.toContain('missing alt');
    expect(wire).not.toContain('<img');
  });

  it('preserves rule id, impact, element count, and tags', () => {
    const payload = buildPayload(RESULT);
    expect(payload.violations).toHaveLength(1);
    const [violation] = payload.violations;
    expect(violation.ruleId).toBe('image-alt');
    expect(violation.impact).toBe('critical');
    expect(violation.count).toBe(1);
    expect(violation.tags).toEqual(['wcag2a', 'wcag111']);
  });

  it('caps tags at 40 entries so we never ship a runaway payload', () => {
    const huge: ScanResult = {
      ...RESULT,
      violations: [
        {
          ...RESULT.violations[0],
          tags: Array.from({ length: 100 }, (_, i) => `tag-${i}`),
        },
      ],
    };
    const payload = buildPayload(huge);
    expect(payload.violations[0].tags).toHaveLength(40);
  });
});

describe('uploadTelemetry', () => {
  it('returns uploaded:false with a descriptive error on network failure', async () => {
    const outcome = await uploadTelemetry(RESULT, 'http://127.0.0.1:1/does-not-exist');
    expect(outcome.uploaded).toBe(false);
    expect(outcome.error).toBeTruthy();
  });

  it.each([
    'file:///etc/passwd',
    'javascript:alert(1)',
    'data:,hello',
    'gopher://example.com/',
    'chrome://settings',
    'not-a-url-at-all',
    '',
  ])('rejects non-http scheme: %s', async (endpoint) => {
    const outcome = await uploadTelemetry(RESULT, endpoint);
    expect(outcome.uploaded).toBe(false);
    expect(outcome.error).toMatch(/http:\/\/ or https:\/\//);
  });

  it('returns uploaded:true on 2xx', async () => {
    const server = await startEchoServer(200);
    try {
      const outcome = await uploadTelemetry(RESULT, server.url);
      expect(outcome.uploaded).toBe(true);
    } finally {
      server.close();
    }
  });

  it('returns uploaded:false on non-2xx without throwing', async () => {
    const server = await startEchoServer(503);
    try {
      const outcome = await uploadTelemetry(RESULT, server.url);
      expect(outcome.uploaded).toBe(false);
      expect(outcome.error).toContain('503');
    } finally {
      server.close();
    }
  });
});

// ---- test helpers ----

async function startEchoServer(status: number): Promise<{ url: string; close: () => void }> {
  const http = await import('node:http');
  const server = http.createServer((_req, res) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end('{}');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('failed to bind server');
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () => server.close(),
  };
}
