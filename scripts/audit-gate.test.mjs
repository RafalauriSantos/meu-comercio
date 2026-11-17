import { describe, it, expect } from 'vitest';
import { findBlockingAdvisories, IGNORED_ADVISORIES } from './audit-gate.mjs';

const advisory = (source, severity) => ({ source, name: 'pkg', title: `advisory ${source}`, severity });
const report = (vulnerabilities) => ({ vulnerabilities });

describe('findBlockingAdvisories', () => {
  const ignored = [{ source: 1247710, expires: '2026-12-17' }];

  it('blocks a high advisory that is not ignored', () => {
    const r = report({ foo: { severity: 'high', via: [advisory(1, 'high')] } });

    expect(findBlockingAdvisories(r, ignored, '2026-11-17').map((a) => a.source)).toEqual([1]);
  });

  it('does not block moderate advisories (same as --audit-level=high)', () => {
    const r = report({ foo: { severity: 'moderate', via: [advisory(2, 'moderate')] } });

    expect(findBlockingAdvisories(r, ignored, '2026-11-17')).toEqual([]);
  });

  it('ignores the listed advisory and the packages that only depend on it', () => {
    const r = report({
      picomatch: { severity: 'high', via: [advisory(1247710, 'high')] },
      vite: { severity: 'high', via: ['picomatch', 'tinyglobby'] },
    });

    expect(findBlockingAdvisories(r, ignored, '2026-11-17')).toEqual([]);
  });

  it('still blocks another high advisory next to the ignored one', () => {
    const r = report({
      picomatch: { severity: 'high', via: [advisory(1247710, 'high')] },
      other: { severity: 'critical', via: [advisory(99, 'critical')] },
    });

    expect(findBlockingAdvisories(r, ignored, '2026-11-17').map((a) => a.source)).toEqual([99]);
  });

  it('blocks again once the exception has expired', () => {
    const r = report({ picomatch: { severity: 'high', via: [advisory(1247710, 'high')] } });

    expect(findBlockingAdvisories(r, ignored, '2026-12-18').map((a) => a.source)).toEqual([1247710]);
    expect(findBlockingAdvisories(r, ignored, '2026-12-17')).toEqual([]);
  });

  it('counts each advisory once even when many packages list it', () => {
    const r = report({
      a: { severity: 'high', via: [advisory(5, 'high')] },
      b: { severity: 'high', via: [advisory(5, 'high')] },
    });

    expect(findBlockingAdvisories(r, ignored, '2026-11-17')).toHaveLength(1);
  });

  it('the project exception is the picomatch ReDoS and has an expiry date', () => {
    expect(IGNORED_ADVISORIES).toEqual([
      expect.objectContaining({ source: 1247710, ghsa: 'GHSA-fc5q-39xc-vjpf', expires: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }),
    ]);
  });
});
