import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readScreenSource } from '@/test-utils/read-screen-source';

// Locks the requests of /gestao so the reorganization of the screen into several files can prove "same
// requests before and after" (spec 16, criteria 2, 3, 14 and 21):
//  - the list and the ORDER of the apiClient calls of the first load, for the owner and for an operator;
//  - the number and the kind of `apiClient.` calls and of `router.push('/login')` in the source of the screen.
//
// No DOM: React is replaced by the same small harness as gestao-load-failure.test.ts (state in slots, effects
// after each render only when their dependencies changed, setState re-renders at once). The page is called
// as a function and the function components of the tree are run too (see `expand`), so the test keeps
// working when the page becomes thin and the screen lives in another file.
type Slot = {
  value?: unknown;
  set?: (next: unknown) => void;
  ref?: { current: unknown };
  deps?: unknown[];
  cleanup?: void | (() => void);
  memo?: unknown;
};
type Pending = { slot: Slot; effect: () => void | (() => void); deps?: unknown[] };

const h = vi.hoisted(() => ({
  slots: [] as Slot[],
  index: 0,
  pending: [] as Pending[],
  run: () => {},
  router: { push: vi.fn(), replace: vi.fn() },
  // Every call of the mocked apiClient, in the order the calls start: "name" or "name:argument".
  calls: [] as string[],
  api: {
    me: vi.fn(),
    getStoreSettings: vi.fn(),
    listProducts: vi.fn(),
    getProductsSummary: vi.fn(),
    listCustomers: vi.fn(),
    getCustomerBalance: vi.fn(),
    getCurrentCash: vi.fn(),
    getCreditMetrics: vi.fn(),
    listOperators: vi.fn(),
  },
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const slotAt = () => (h.slots[h.index] ??= {});
  const hooks = {
    useState: (initial: unknown) => {
      const slot = slotAt();
      if (!('value' in slot)) slot.value = typeof initial === 'function' ? (initial as () => unknown)() : initial;
      h.index++;
      slot.set ??= (next) => {
        const value = typeof next === 'function' ? (next as (p: unknown) => unknown)(slot.value) : next;
        if (Object.is(value, slot.value)) return;
        slot.value = value;
        h.run();
      };
      return [slot.value, slot.set];
    },
    useRef: (initial: unknown) => {
      const slot = slotAt();
      slot.ref ??= { current: initial };
      h.index++;
      return slot.ref;
    },
    useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
      h.pending.push({ slot: slotAt(), effect, deps });
      h.index++;
    },
    useCallback: (fn: unknown, deps: unknown[]) => {
      const slot = slotAt();
      h.index++;
      const prev = slot.deps;
      if (!prev || prev.length !== deps.length || deps.some((d, i) => !Object.is(d, prev[i]))) {
        slot.deps = deps;
        slot.memo = fn;
      }
      return slot.memo;
    },
    useMemo: (fn: () => unknown, deps: unknown[]) => {
      const slot = slotAt();
      h.index++;
      const prev = slot.deps;
      if (!prev || deps.some((d, i) => !Object.is(d, prev[i]))) {
        slot.deps = deps;
        slot.memo = fn();
      }
      return slot.memo;
    },
  };
  return { ...actual, ...hooks, default: { ...actual, ...hooks } };
});
vi.mock('next/navigation', () => ({ useRouter: () => h.router }));
vi.mock('@/frontend/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  apiClient: h.api,
}));
vi.mock('@/frontend/lib/use-skeleton-gate', () => ({ useSkeletonGate: () => 'content' }));
vi.mock('@/frontend/lib/use-auto-dismiss', () => ({ useAutoDismiss: () => {} }));

import GestaoPage from './page';

type El = { type: unknown; props: { children?: unknown; [key: string]: unknown } };

// Pieces that stay as elements (shared UI, the skeleton and the two panels with their own state and
// requests). Any other function component of the tree is a part of the screen and is run, errors included.
// The test of `expand` and its known limits are in gestao-load-failure.test.ts ('harness: expand').
const KEPT = new Set(['LoadFailureNotice', 'AppHeader', 'ManagementDataSkeleton', 'VersionLabel', 'SalesReportPanel', 'ImportProductsPanel']);

function expand(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(expand);
  if (!node || typeof node !== 'object' || !('props' in node)) return node;
  const el = node as El;
  if (typeof el.type === 'function' && !KEPT.has(el.type.name)) return expand((el.type as (props: unknown) => unknown)(el.props));
  if (!('children' in el.props)) return el;
  return { ...el, props: { ...el.props, children: expand(el.props.children) } };
}

let rendering = false;
let dirty = false;

function render() {
  if (rendering) {
    dirty = true;
    return;
  }
  rendering = true;
  try {
    do {
      dirty = false;
      h.index = 0;
      h.pending = [];
      expand(GestaoPage());
      for (const { slot, effect, deps } of h.pending) {
        const changed = !deps || !slot.deps || deps.some((d, i) => !Object.is(d, slot.deps![i]));
        if (!changed) continue;
        slot.cleanup?.();
        slot.deps = deps;
        slot.cleanup = effect();
      }
    } while (dirty);
  } finally {
    rendering = false;
  }
}
h.run = render;

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function mount() {
  h.slots.length = 0;
  render();
  await settle();
}

function respond(name: keyof typeof h.api, value: (arg: unknown) => unknown) {
  h.api[name].mockReset();
  h.api[name].mockImplementation(async (arg?: unknown) => {
    h.calls.push(typeof arg === 'string' ? `${name}:${arg}` : name);
    return value(arg);
  });
}

function loadAs(me: { isOwner: boolean }) {
  respond('me', () => ({ username: 'user', merchantId: 'm', authorities: [], ...me }));
  respond('getStoreSettings', () => ({ stockControlEnabled: true }));
  respond('listProducts', () => ({ items: [] }));
  respond('getProductsSummary', () => ({ total: 0, lowStockCount: 0, outOfStockCount: 0, stockValue: '0.00' }));
  respond('listCustomers', () => ({
    items: ['c1', 'c2', 'c3'].map((id) => ({ id, name: `Cliente ${id}`, phone: `9${id}`, creditLimit: '100.00' })),
  }));
  respond('getCustomerBalance', (id) => ({
    customerId: id,
    name: id,
    phone: '1',
    active: true,
    creditLimit: '100.00',
    currentDebt: '10.00',
    availableCredit: '0.00',
    totalDebits: '0.00',
    totalCredits: '0.00',
  }));
  respond('getCurrentCash', () => ({ open: false, session: null }));
  respond('getCreditMetrics', () => ({ totalOutstandingCredit: '30.00', totalSettledCredit: '0.00', activeDebtorsCount: 3 }));
  respond('listOperators', () => ({ items: [] }));
}

beforeEach(() => {
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() }); // the products tab listens to the scanner
  h.calls.length = 0;
  h.router.push.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('/gestao first load: the list and the order of the apiClient calls', () => {
  it('owner: me first, then settings and the five loads started together in this order, then one balance per customer', async () => {
    loadAs({ isOwner: true });
    await mount();

    expect(h.calls).toEqual([
      'me',
      'getStoreSettings',
      'listProducts:', // the first load asks for page 1 of the list: listProducts('', 1, 50)
      'getProductsSummary', // started together with the list, right after it
      'listCustomers',
      'getCurrentCash',
      'getCreditMetrics',
      'listOperators',
      'getCustomerBalance:c1',
      'getCustomerBalance:c2',
      'getCustomerBalance:c3',
    ]);
    expect(h.router.push).not.toHaveBeenCalled();
  });

  it('operator (not the owner): the same calls, without listOperators', async () => {
    loadAs({ isOwner: false });
    await mount();

    expect(h.calls).toEqual([
      'me',
      'getStoreSettings',
      'listProducts:', // the first load asks for page 1 of the list: listProducts('', 1, 50)
      'getProductsSummary', // started together with the list, right after it
      'listCustomers',
      'getCurrentCash',
      'getCreditMetrics',
      'getCustomerBalance:c1',
      'getCustomerBalance:c2',
      'getCustomerBalance:c3',
    ]);
    expect(h.api.listOperators).not.toHaveBeenCalled();
    expect(h.router.push).not.toHaveBeenCalled();
  });

  it('does nothing else until me() answers, and goes to /login once if me() fails', async () => {
    loadAs({ isOwner: true });
    h.api.me.mockReset();
    h.api.me.mockImplementation(async () => {
      h.calls.push('me');
      throw new Error('401');
    });
    await mount();

    expect(h.calls).toEqual(['me']);
    expect(h.router.push).toHaveBeenCalledTimes(1);
    expect(h.router.push).toHaveBeenCalledWith('/login');
  });
});

describe('/gestao: the apiClient calls and the /login redirects in the source of the whole screen', () => {
  // The whole screen: the page plus the files of src/frontend/management. Counts as at HEAD plus the barcode scan: 21 apiClient. and
  // 2 router.push('/login') in page.tsx, plus 2 apiClient. of import-products-panel.tsx (its own file).
  const source = readScreenSource('gestao');
  const count = (needle: string) => source.split(needle).length - 1;

  it('has 21 + 2 apiClient. and 2 router.push(/login)', () => {
    expect(count('apiClient.')).toBe(21 + 2 + 2);
    expect(count("router.push('/login')")).toBe(2);
  });

  it('calls exactly these apiClient methods, this many times each (a call may move to another file, never appear or vanish)', () => {
    const methods: Record<string, number> = {};
    for (const m of source.matchAll(/\bapiClient\s*\.\s*(\w+)/g)) methods[m[1]] = (methods[m[1]] ?? 0) + 1;

    expect(Object.fromEntries(Object.entries(methods).sort(([a], [b]) => a.localeCompare(b)))).toEqual({
      closeCash: 1,
      createCustomer: 1,
      createOperator: 1,
      createProduct: 1,
      findProductByBarcode: 2, // products tab: the barcode field and the scan that opens the form
      getCreditMetrics: 1,
      getCurrentCash: 1,
      getCustomerBalance: 2,
      getSalesReport: 1, // sales-report-panel.tsx; written on two lines, so it is not in the literal count
      getStoreSettings: 1, // page.tsx; also on several lines (`.getStoreSettings()` on its own line), so also not in the literal count
      importProducts: 2,
      listCustomers: 1,
      listOperators: 1,
      getProductsSummary: 1,
      listProducts: 2, // page 1 and Carregar mais: same method, two calls
      logout: 1,
      me: 1,
      openCash: 1,
      recordDeposit: 1,
      recordWithdrawal: 1,
      restockInventory: 1,
      settleCustomerDebt: 1,
      updateStoreSettings: 1,
    });
  });
});
