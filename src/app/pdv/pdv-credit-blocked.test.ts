import { describe, it, expect } from 'vitest';
import { readScreenSource } from '@/test-utils/read-screen-source';

// The PDV has no DOM test setup, so the wiring is checked in the source (like the other pdv-*.test.ts).
const source = readScreenSource('pdv');

describe('/pdv fiado with a blocked customer (D-26)', () => {
  it('warns when the chosen customer is blocked, as an alert, and marks them in the list', () => {
    expect(source).toContain("from '@/frontend/pdv/credit-block'");
    expect(source).toContain("const creditBlocked = paymentMethod === 'TAB' && creditBlockedCustomer(customers, selectedCustomerId)");
    expect(source).toMatch(/\{creditBlocked && \(\s*<p[^>]*role="alert"[^>]*>\s*\{CREDIT_BLOCKED_NOTICE\}/);
    expect(source).toMatch(/\{c\.name\} \(\{c\.phone\}\)\{c\.creditBlocked \? ' - fiado bloqueado' : ''\}/);
  });

  it('does not let the sale go on in fiado: disabled button, no submit, no request', () => {
    expect(source).toMatch(/disabled=\{processing \|\| \(paymentMethod === 'TAB' && \(!selectedCustomerId \|\| creditBlocked\)\)\}/);
    expect(source).toMatch(/onSubmit=\{\(e\) => \{\s*e\.preventDefault\(\);\s*if \(paymentMethod === 'TAB' && \(!selectedCustomerId \|\| creditBlocked\)\) return;/);
    expect(source).toMatch(/if \(paymentMethod === 'TAB' && creditBlockedCustomer\(customers, selectedCustomerId\)\) \{\s*setMessage\(\{ text: CREDIT_BLOCKED_NOTICE, isError: true \}\);\s*return;/);
  });

  it('shows the server message on the 409 by its code, keeps the cart and marks the customer blocked', () => {
    const branch = source.match(/if \(isCreditBlockedError\(err\)\) \{[\s\S]*?return;\s*\}/)?.[0] ?? '';
    expect(branch).toContain('getErrorMessage(err');
    expect(branch).toContain('creditBlocked: true');
    expect(branch).not.toContain('resetCartAndCheckout');
  });
});
