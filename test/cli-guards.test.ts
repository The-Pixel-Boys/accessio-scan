/**
 * Guard tests for the CLI's pre-flight validation logic.
 *
 * We invoke the compiled CLI as a subprocess so the test exercises the
 * actual exit-code contract and stderr shape users rely on. No Playwright
 * launches — the invalid-input branches short-circuit before any browser
 * work, so these stay fast (~200ms per test).
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const execFileP = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI = resolve(__dirname, '..', 'dist', 'cli.js');

interface CliOutcome {
  code: number;
  stdout: string;
  stderr: string;
}

async function runCli(args: string[]): Promise<CliOutcome> {
  try {
    const { stdout, stderr } = await execFileP(process.execPath, [CLI, ...args], {
      timeout: 15_000,
    });
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

beforeAll(() => {
  // The CLI is compiled from src/cli.ts via `npm run build`. If dist/
  // is missing, the suite can't run — fail loud rather than silent.
  if (!existsSync(CLI)) {
    throw new Error(`CLI bundle missing at ${CLI}. Run \`npm run build\` first.`);
  }
});

describe('CLI input validation', () => {
  it('rejects non-http(s) URLs with exit 2', async () => {
    const { code, stderr } = await runCli(['file:///etc/passwd']);
    expect(code).toBe(2);
    expect(stderr).toMatch(/not a valid URL/);
  });

  it('rejects invalid --format with exit 2', async () => {
    const { code, stderr } = await runCli(['https://example.com', '--format', 'yaml']);
    expect(code).toBe(2);
    expect(stderr).toMatch(/invalid format/);
  });

  it('rejects non-positive --timeout with exit 2', async () => {
    const { code, stderr } = await runCli(['https://example.com', '--timeout', '-1']);
    expect(code).toBe(2);
    expect(stderr).toMatch(/--timeout must be a positive integer/);
  });

  it('rejects --wait-for selectors longer than 1000 chars with exit 2', async () => {
    const giant = 'a'.repeat(1001);
    const { code, stderr } = await runCli(['https://example.com', '--wait-for', giant]);
    expect(code).toBe(2);
    expect(stderr).toMatch(/--wait-for selector is 1001 chars/);
  });
});

describe('CLI --output overwrite protection', () => {
  it('refuses to overwrite an existing file without --force (exit 2)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'accessio-scan-test-'));
    const existing = join(dir, 'existing.json');
    writeFileSync(existing, '{"preserved": true}', 'utf8');

    const { code, stderr } = await runCli([
      'https://example.com',
      '--format',
      'json',
      '--output',
      existing,
    ]);

    expect(code).toBe(2);
    expect(stderr).toMatch(/already exists/);
    expect(stderr).toMatch(/--force/);

    // File must be untouched.
    expect(readFileSync(existing, 'utf8')).toBe('{"preserved": true}');
  });
});
