import { describe, it, expect } from 'vitest';
import { readScreenSource } from '@/test-utils/read-screen-source';

// Locks the requests of /pdv in the source of the whole screen (spec 16, criterion 3), so the reorganization
// can prove "same requests before and after". The whole screen is the page plus the files of src/frontend/pdv.
// Counts as at HEAD: 13 apiClient. and 2 router.push('/login') in page.tsx, plus 1 apiClient. of
// cancel-sale-modal.tsx (its own file). The order at runtime is not locked here: the PDV has no harness yet.
describe('/pdv: the apiClient calls and the /login redirects in the source of the whole screen', () => {
  const source = readScreenSource('pdv');
  const count = (needle: string) => source.split(needle).length - 1;

  it('has 13 + 1 apiClient. and 2 router.push(/login)', () => {
    expect(count('apiClient.')).toBe(13 + 1 + 1); // + createProduct of use-register-on-scan.ts (22.19c)
    expect(count("router.push('/login')") + count('router.push(loginUrlHere())')).toBe(2);
  });

  it('calls exactly these apiClient methods, this many times each (a call may move to another file, never appear or vanish)', () => {
    const methods: Record<string, number> = {};
    for (const m of source.matchAll(/\bapiClient\s*\.\s*(\w+)/g)) methods[m[1]] = (methods[m[1]] ?? 0) + 1;

    expect(Object.fromEntries(Object.entries(methods).sort(([a], [b]) => a.localeCompare(b)))).toEqual({
      cancelSale: 1,
      createProduct: 1,
      createSale: 2,
      findProductByBarcode: 1,
      getCurrentCash: 2,
      getStoreSettings: 1,
      listCustomers: 2,
      listRecentSales: 1,
      logout: 1,
      me: 1,
      recordDeposit: 1,
      recordWithdrawal: 1,
      searchProducts: 1,
    });
  });
});
