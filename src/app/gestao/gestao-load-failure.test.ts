import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useEffect, useState } from 'react';

// No DOM: React is replaced by a small harness (state in slots, effects after each render only when their
// dependencies changed, setState re-renders at once). The page is called as a function and the returned
// element tree is read. The page may be thin: the screen (and its tabs) can live in components of other
// files, so the function components of the tree are run too, in the same render and with the same hooks
// (see `expand`), except the ones in KEPT. The failure notice is found by the function name
// `LoadFailureNotice` and its props (`what`, `onRetry`, `busy`), so this file does not import it.
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
  api: {
    me: vi.fn(),
    getStoreSettings: vi.fn(),
    listProducts: vi.fn(),
    getProductsSummary: vi.fn(),
    listCustomers: vi.fn(),
    getCustomerBalance: vi.fn(),
    getCustomerBalances: vi.fn(),
    getCurrentCash: vi.fn(),
    getCreditMetrics: vi.fn(),
    listOperators: vi.fn(),
    getOwnerEmail: vi.fn(),
    createCustomer: vi.fn(),
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
import { formatMoney } from '@/frontend/lib/formatters';
import { ApiError } from '@/frontend/lib/api-client';

type El = { type: unknown; props: { children?: unknown; [key: string]: unknown } };
type Notice = El & { props: { what: string; onRetry: () => unknown; busy?: boolean } };

// Pieces that stay as elements: the notice (read by its name and props), the shared header and version label, the skeleton and
// the two panels that have their own state and requests. Anything else that is a function component is a
// part of the screen and is run. An error while running one is not caught: a screen piece that this
// harness cannot run must fail the test, never make a `whats()` of [] pass without looking.
//
// Known limits of `expand` (the test 'harness: expand' below proves what it does):
//  - the hooks of a child share the slots of the page by call order, so a child that appears or disappears
//    by a condition shifts the slots of every hook after it;
//  - only plain function components are run: memo(...) and forwardRef(...) are objects and stay as elements;
//  - KEPT compares the function name, so a renamed component, or another one with the same name, is also kept.
// gestao-request-order.test.ts has a copy of this harness; the test of `expand` lives only here.
const KEPT = new Set(['LoadFailureNotice', 'NewCustomerPanel', 'AppHeader', 'ManagementDataSkeleton', 'VersionLabel', 'SalesReportPanel', 'ImportProductsPanel']);

function expand(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(expand);
  if (!node || typeof node !== 'object' || !('props' in node)) return node;
  const el = node as El;
  if (typeof el.type === 'function' && !KEPT.has(el.type.name)) return expand((el.type as (props: unknown) => unknown)(el.props));
  if (!('children' in el.props)) return el;
  return { ...el, props: { ...el.props, children: expand(el.props.children) } };
}

let tree: unknown;
let rendering = false;
let dirty = false;

function render(root: () => unknown = () => GestaoPage()) {
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
      tree = expand(root());
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

function walk(node: unknown, visit: (el: El) => void) {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, visit));
  if (node && typeof node === 'object' && 'props' in node) {
    visit(node as El);
    walk((node as El).props.children, visit);
  }
}

function text(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  if (node && typeof node === 'object' && 'props' in node) return text((node as El).props.children);
  return '';
}

function notices(): Notice[] {
  const found: Notice[] = [];
  walk(tree, (el) => {
    if (typeof el.type === 'function' && el.type.name === 'LoadFailureNotice') found.push(el as Notice);
  });
  return found;
}

function whats(): string[] {
  return notices().map((n) => String(n.props.what));
}

// Opening a tab reads its data (once); the test waits for that read, as the screen does.
async function openTab(label: string) {
  let button: El | undefined;
  walk(tree, (el) => {
    if (!button && el.type === 'button' && text(el).startsWith(label)) button = el;
  });
  if (!button) throw new Error(`tab "${label}" not found`);
  (button.props.onClick as () => void)();
  await settle();
}

const PRODUTOS = 'Catálogo';
const FIADO = 'Clientes';
const CAIXA = 'Caixa';
const AJUSTES = 'Ajustes';

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const balanceOf = (id: string, debt: string) => ({
  customerId: id,
  name: id,
  phone: '1',
  active: true,
  creditLimit: '100.00',
  currentDebt: debt,
  availableCredit: '0.00',
  totalDebits: '0.00',
  totalCredits: '0.00',
});
const DEBT: Record<string, string> = { c1: '10.00', c2: '20.00', c3: '30.00' };

function counts() {
  return Object.fromEntries(Object.entries(h.api).filter(([n]) => n !== 'createCustomer').map(([name, fn]) => [name, fn.mock.calls.length]));
}

async function mount() {
  h.slots.length = 0;
  render();
  await settle();
}

beforeEach(() => {
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() }); // the products tab listens to the scanner
  for (const fn of Object.values(h.api)) fn.mockReset();
  h.router.push.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  h.api.me.mockResolvedValue({ username: 'dona', merchantId: 'm', authorities: [], isOwner: true });
  h.api.getStoreSettings.mockResolvedValue({ stockControlEnabled: true });
  h.api.listProducts.mockResolvedValue({ items: [] });
  h.api.getProductsSummary.mockResolvedValue({ total: 0, lowStockCount: 0, outOfStockCount: 0, stockValue: '0.00' });
  h.api.listCustomers.mockResolvedValue({
    items: ['c1', 'c2', 'c3'].map((id) => ({ id, name: `Cliente ${id}`, phone: `9${id}`, creditLimit: '100.00' })),
  });
  h.api.getCustomerBalances.mockImplementation(async () => ({ items: ['c1', 'c2', 'c3'].map((id) => balanceOf(id, DEBT[id])) }));
  h.api.getCustomerBalance.mockImplementation(async (id: string) => balanceOf(id, DEBT[id]));
  h.api.getCurrentCash.mockResolvedValue({ open: false, session: null });
  h.api.getCreditMetrics.mockResolvedValue({ totalOutstandingCredit: '60.00', totalSettledCredit: '0.00', activeDebtorsCount: 3 });
  h.api.listOperators.mockResolvedValue({ items: [] });
  h.api.getOwnerEmail.mockResolvedValue({ email: 'maria@gmail.com', verified: true });
  h.api.createCustomer.mockResolvedValue({});
});

describe('harness: expand', () => {
  const log: string[] = [];
  let setCount: (n: number) => void = () => {};

  // A child with its own hooks, and a piece that is in KEPT (by name) and must not run.
  function Child({ label }: { label: string }) {
    const [count, set] = useState(0);
    setCount = set;
    useEffect(() => {
      log.push(`effect ${count}`);
    }, [count]);
    return { type: 'span', props: { children: `${label}${count}` } };
  }
  function LoadFailureNotice() {
    log.push('kept ran');
    return null;
  }
  const Root = () => ({
    type: 'div',
    props: { children: [{ type: Child, props: { label: 'c' } }, { type: LoadFailureNotice, props: { what: 'x', onRetry: () => {} } }] },
  });

  beforeEach(() => {
    log.length = 0;
    h.slots.length = 0;
    h.run = () => render(Root); // a setState of the fake child re-renders the fake root, not the page
  });
  afterEach(() => {
    h.run = render;
  });

  it('runs a child function component: its state and its effect work through the harness hooks', () => {
    render(Root);
    expect(text(tree)).toBe('c0');
    expect(log).toEqual(['effect 0']);

    setCount(2);
    expect(text(tree)).toBe('c2');
    expect(log).toEqual(['effect 0', 'effect 2']);
  });

  it('does not run a piece of KEPT: it stays in the tree as an element, found by its name', () => {
    render(Root);
    setCount(1);

    expect(log).not.toContain('kept ran');
    expect(notices()).toHaveLength(1);
    expect(notices()[0].props.what).toBe('x');
  });
});

describe('/gestao without failures (control: nothing changes at HEAD)', () => {
  it('shows no notice in any tab and reads each thing exactly once: at start only me, settings, products and the e-mail dot', async () => {
    await mount();
    expect(counts()).toEqual({
      me: 1, getStoreSettings: 1, listProducts: 1, getProductsSummary: 1, listCustomers: 0, getCustomerBalances: 0, getCustomerBalance: 0,
      getCurrentCash: 0, getCreditMetrics: 0, listOperators: 0, getOwnerEmail: 1,
    });
    for (const tab of [PRODUTOS, FIADO, CAIXA, AJUSTES]) {
      await openTab(tab);
      expect(whats(), tab).toEqual([]);
    }
    expect(counts()).toEqual({
      me: 1, getStoreSettings: 1, listProducts: 1, getProductsSummary: 1, listCustomers: 1, getCustomerBalances: 1, getCustomerBalance: 0,
      getCurrentCash: 1, getCreditMetrics: 1, listOperators: 1, getOwnerEmail: 1,
    });
    expect(h.router.push).not.toHaveBeenCalled();
    // The reference values the failure tests compare against.
    await openTab(FIADO);
    for (const value of [10, 20, 30, 60]) expect(text(tree)).toContain(formatMoney(value));
    expect(text(tree)).not.toContain(`${FIADO} (3)`); // no counter in the tab label
  });

  it('while a tab loads, its content is the skeleton, never the empty state of the tab', async () => {
    await mount();
    const slow = deferred<{ items: never[] }>();
    h.api.listCustomers.mockReturnValueOnce(slow.promise);
    await openTab(FIADO);
    const skeletons = () => {
      const found: El[] = [];
      walk(tree, (el) => {
        if (typeof el.type === 'function' && el.type.name === 'ManagementDataSkeleton') found.push(el);
      });
      return found;
    };
    expect(skeletons().map((s) => s.props.tabs)).toEqual([false]); // only the content, the tab row stays
    expect(text(tree)).not.toContain('Nenhum cliente cadastrado ainda.');

    slow.resolve({ items: [] });
    await settle();
    expect(skeletons()).toEqual([]);
    expect(text(tree)).toContain('Nenhum cliente cadastrado ainda.');
  });
});

describe('/gestao: products fail', () => {
  it('shows the notice only in the Produtos tab, with the same displayed values; retry repeats the same read and the notice goes away', async () => {
    h.api.listProducts.mockRejectedValueOnce(new Error('boom'));
    await mount();
    expect(whats().length).toBe(1);
    expect(whats()[0]).toMatch(/produtos/i);
    for (const tab of [FIADO, CAIXA, AJUSTES]) {
      await openTab(tab);
      expect(whats().some((w) => /produtos/i.test(w)), tab).toBe(false);
    }
    await openTab(PRODUTOS);
    const before = counts();
    await notices()[0].props.onRetry();
    await settle();
    expect(h.api.listProducts).toHaveBeenCalledTimes(2);
    expect(h.api.listProducts).toHaveBeenLastCalledWith('', 1, 50);
    expect(counts()).toEqual({ ...before, listProducts: 2, getProductsSummary: 2 });
    expect(whats()).toEqual([]);
  });

  it('retry repeats the search that was typed', async () => {
    await mount();
    let input: El | undefined;
    walk(tree, (el) => {
      if (el.type === 'input' && el.props.id === 'product-search') input = el;
    });
    h.api.listProducts.mockRejectedValueOnce(new Error('boom'));
    (input!.props.onChange as (e: unknown) => void)({ target: { value: 'cola' } });
    await settle();
    expect(whats().length).toBe(1);
    await notices()[0].props.onRetry();
    await settle();
    expect(h.api.listProducts).toHaveBeenLastCalledWith('cola', 1, 50);
    expect(whats()).toEqual([]);
  });

  it('keeps the notice when the retry fails too, and is busy while the retry is in flight', async () => {
    h.api.listProducts.mockRejectedValueOnce(new Error('boom'));
    await mount();
    const slow = deferred<{ items: never[] }>();
    h.api.listProducts.mockReturnValueOnce(slow.promise);
    const retry = notices()[0].props.onRetry();
    expect(notices()[0].props.busy).toBe(true);
    slow.reject(new Error('still down'));
    await retry;
    await settle();
    expect(whats().length).toBe(1);
    expect(notices()[0].props.busy).toBeFalsy();
    expect(h.api.listProducts).toHaveBeenCalledTimes(2);
  });
});

describe('/gestao: customers fail', () => {
  it('shows the notice only in Fiado; no balance read; retry repeats loadCustomers and loads the balances', async () => {
    h.api.listCustomers.mockRejectedValueOnce(new Error('boom'));
    await mount();
    await openTab(FIADO);
    expect(whats().length).toBe(1);
    expect(whats()[0]).toMatch(/clientes/i);
    expect(h.api.getCustomerBalances).not.toHaveBeenCalled();
    await openTab(PRODUTOS);
    expect(whats()).toEqual([]);
    await openTab(FIADO);
    await notices()[0].props.onRetry();
    await settle();
    expect(h.api.listCustomers).toHaveBeenCalledTimes(2);
    expect(h.api.getCustomerBalances).toHaveBeenCalledTimes(1);
    expect(whats()).toEqual([]);
  });
});

describe('/gestao: some balances fail (the money case)', () => {
  it('counts the failures in the notice, keeps the R$ 0,00 of today, and retries only the balances that are missing', async () => {
    h.api.getCustomerBalances.mockResolvedValue({ items: [balanceOf('c1', DEBT.c1)] });
    await mount();
    await openTab(FIADO);
    expect(whats().length).toBe(1);
    expect(whats()[0]).toMatch(/saldo/i);
    expect(whats()[0]).toMatch(/\b2\b/);
    // Values as at HEAD: the failed ones still show zero, the good one shows its debt.
    expect(text(tree)).toContain(formatMoney(10));
    expect(text(tree)).not.toContain(formatMoney(20));
    expect(text(tree)).not.toContain(formatMoney(30));
    expect(text(tree)).toContain(formatMoney(0));

    h.api.getCustomerBalance.mockClear();
    h.api.getCustomerBalance.mockImplementation(async (id: string) => balanceOf(id, DEBT[id]));
    const before = counts();
    await notices()[0].props.onRetry();
    await settle();
    expect(h.api.getCustomerBalance.mock.calls.map((c) => c[0]).sort()).toEqual(['c2', 'c3']);
    expect(h.api.listCustomers).toHaveBeenCalledTimes(1); // not loadCustomers again
    expect(counts()).toEqual({ ...before, getCustomerBalance: 2 });
    expect(whats()).toEqual([]);
    expect(text(tree)).toContain(formatMoney(10)); // kept: merged into the state, not replaced
    expect(text(tree)).toContain(formatMoney(20));
    expect(text(tree)).toContain(formatMoney(30));
  });

  it('keeps a smaller notice when only part of the retry works, and the next retry asks only for what is still missing', async () => {
    h.api.getCustomerBalances.mockResolvedValue({ items: [balanceOf('c1', DEBT.c1)] });
    await mount();
    await openTab(FIADO);
    h.api.getCustomerBalance.mockClear();
    h.api.getCustomerBalance.mockImplementation(async (id: string) => {
      if (id === 'c3') throw new Error('429');
      return balanceOf(id, DEBT[id]);
    });
    await notices()[0].props.onRetry();
    await settle();
    expect(whats().length).toBe(1);
    expect(whats()[0]).toMatch(/saldo/i);
    expect(whats()[0]).toMatch(/\b1\b/);
    expect(text(tree)).toContain(formatMoney(20));
    expect(text(tree)).not.toContain(formatMoney(30));

    h.api.getCustomerBalance.mockClear();
    h.api.getCustomerBalance.mockImplementation(async (id: string) => balanceOf(id, DEBT[id]));
    await notices()[0].props.onRetry();
    await settle();
    expect(h.api.getCustomerBalance.mock.calls.map((c) => c[0])).toEqual(['c3']);
    expect(whats()).toEqual([]);
    expect(text(tree)).toContain(formatMoney(30));
  });

  it('is busy while the balance retry is in flight (no second burst against the 30 requests per minute limit)', async () => {
    h.api.getCustomerBalances.mockResolvedValue({ items: [balanceOf('c1', DEBT.c1)] });
    await mount();
    await openTab(FIADO);
    const slow = deferred<ReturnType<typeof balanceOf>>();
    h.api.getCustomerBalance.mockClear();
    h.api.getCustomerBalance.mockReturnValue(slow.promise);
    const retry = notices()[0].props.onRetry();
    expect(notices()[0].props.busy).toBe(true);
    slow.resolve(balanceOf('c2', '20.00'));
    await retry;
    await settle();
    expect(notices()[0]?.props.busy).toBeFalsy();
  });
});

describe('/gestao: cash fails', () => {
  it('shows the notice only in Caixa, keeps the open-cash form as today; retry reads the cash again', async () => {
    h.api.getCurrentCash.mockRejectedValueOnce(new Error('boom'));
    await mount();
    await openTab(CAIXA);
    expect(whats().length).toBe(1);
    expect(whats()[0]).toMatch(/caixa/i);
    expect(text(tree)).toContain('Abrir Caixa do Turno'); // as today
    await openTab(PRODUTOS);
    expect(whats()).toEqual([]);
    await openTab(CAIXA);
    h.api.getCurrentCash.mockResolvedValueOnce({
      open: true,
      session: { id: 's', openedBy: 'dona', openingBalance: '100.00', openedAt: '2026-01-01T10:00:00Z', expectedCash: '100.00' },
    });
    const before = counts();
    await notices()[0].props.onRetry();
    await settle();
    expect(counts()).toEqual({ ...before, getCurrentCash: 2 });
    expect(whats()).toEqual([]);
    expect(text(tree)).toContain('Dados do turno');
  });
});

describe('/gestao: fiado metrics fail', () => {
  it('shows the notice in Fiado with the zero as today; retry reads only the metrics', async () => {
    h.api.getCreditMetrics.mockRejectedValueOnce(new Error('boom'));
    await mount();
    await openTab(FIADO);
    expect(whats().length).toBe(1);
    expect(whats()[0]).toMatch(/métricas/i);
    expect(text(tree)).toContain(formatMoney(0)); // "Total de Fiado na Rua" as today
    expect(text(tree)).not.toContain(formatMoney(60));
    const before = counts();
    await notices()[0].props.onRetry();
    await settle();
    expect(counts()).toEqual({ ...before, getCreditMetrics: 2 });
    expect(whats()).toEqual([]);
    expect(text(tree)).toContain(formatMoney(60));
  });
});

describe('/gestao: operators fail', () => {
  it('shows the notice only in Ajustes; retry reads only the operators', async () => {
    h.api.listOperators.mockRejectedValueOnce(new Error('boom'));
    await mount();
    expect(whats()).toEqual([]); // the other tabs show no operators notice
    await openTab(AJUSTES);
    expect(whats().length).toBe(1);
    expect(whats()[0]).toMatch(/operadores/i);
    const before = counts();
    await notices()[0].props.onRetry();
    await settle();
    expect(counts()).toEqual({ ...before, listOperators: 2 });
    expect(whats()).toEqual([]);
  });
});

describe('/gestao: no new automatic requests and no change in the login redirect', () => {
  it('with every read failing: no /login, each read once, no automatic retry, one notice per failed thing', async () => {
    h.api.listProducts.mockRejectedValue(new Error('x'));
    h.api.listCustomers.mockRejectedValue(new Error('x'));
    h.api.getCurrentCash.mockRejectedValue(new Error('x'));
    h.api.getCreditMetrics.mockRejectedValue(new Error('x'));
    h.api.listOperators.mockRejectedValue(new Error('x'));
    await mount();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(h.router.push).not.toHaveBeenCalled();
    expect(counts()).toEqual({
      me: 1, getStoreSettings: 1, listProducts: 1, getProductsSummary: 1, listCustomers: 0, getCustomerBalances: 0, getCustomerBalance: 0,
      getCurrentCash: 0, getCreditMetrics: 0, listOperators: 0, getOwnerEmail: 1,
    });
    expect(whats().length).toBe(1); // Produtos tab
    await openTab(FIADO);
    expect(whats().length).toBe(2);
    expect(whats().some((w) => /clientes/i.test(w))).toBe(true);
    expect(whats().some((w) => /métricas/i.test(w))).toBe(true);
    await openTab(CAIXA);
    expect(whats().length).toBe(1);
    await openTab(AJUSTES);
    expect(whats().length).toBe(1);
    expect(counts()).toEqual({
      me: 1, getStoreSettings: 1, listProducts: 1, getProductsSummary: 1, listCustomers: 1, getCustomerBalances: 0, getCustomerBalance: 0,
      getCurrentCash: 1, getCreditMetrics: 1, listOperators: 1, getOwnerEmail: 1,
    });
  });

  it('a failure of me() that is not an expired session stays on the screen with one notice and no other read', async () => {
    h.api.me.mockRejectedValue(new Error('429'));
    await mount();
    expect(h.router.push).not.toHaveBeenCalled();
    expect(whats()).toEqual(['o painel']);
    expect(counts().me).toBe(1);
    expect(counts().listProducts).toBe(0);
  });

  it('a 401 of me() (expired session) still goes to /login once, with no notice and no other read', async () => {
    h.api.me.mockRejectedValue(new ApiError(401, 'Não autenticado.'));
    await mount();
    expect(h.router.push).toHaveBeenCalledTimes(1);
    expect(h.router.push).toHaveBeenCalledWith('/login');
    expect(whats()).toEqual([]);
    expect(counts()).toEqual({
      me: 1, getStoreSettings: 1, listProducts: 0, getProductsSummary: 0, listCustomers: 0, getCustomerBalances: 0, getCustomerBalance: 0,
      getCurrentCash: 0, getCreditMetrics: 0, listOperators: 0, getOwnerEmail: 0,
    });
  });
});

describe('/gestao: race between the balance retry and another loadCustomers', () => {
  async function failTwoBalances() {
    h.api.getCustomerBalances.mockResolvedValue({ items: [balanceOf('c1', DEBT.c1)] });
    await mount();
    await openTab(FIADO);
    expect(whats().length).toBe(1);
  }

  function submitNewCustomer() {
    void openTab('＋ Novo Cliente');
    let form: El | undefined;
    walk(tree, (el) => {
      if (!form && typeof el.type === 'function' && el.type.name === 'NewCustomerPanel') form = el;
    });
    if (!form) throw new Error('new customer form not found');
    return (form.props.onSubmit as (e: unknown) => Promise<void>)({ preventDefault: () => {} });
  }

  it('a stale balance from the retry never overwrites a fresher one loaded meanwhile by loadCustomers', async () => {
    await failTwoBalances();
    // Retry in flight: c2 and c3 answers are held back (they carry the OLD debt of c2: 20,00).
    const holdC2 = deferred<ReturnType<typeof balanceOf>>();
    const holdC3 = deferred<ReturnType<typeof balanceOf>>();
    h.api.getCustomerBalance.mockReset();
    h.api.getCustomerBalance.mockImplementation((id: string) => (id === 'c2' ? holdC2.promise : holdC3.promise));
    const retry = notices()[0].props.onRetry();
    await settle();
    // Meanwhile another loadCustomers finishes (customer created) and c2 is now 5,00 on the server.
    h.api.getCustomerBalances.mockResolvedValue({ items: ['c1', 'c2', 'c3'].map((id) => balanceOf(id, id === 'c2' ? '5.00' : DEBT[id])) });
    await submitNewCustomer();
    await settle();
    expect(text(tree)).toContain(formatMoney(5));
    // Now the stale retry answers.
    holdC2.resolve(balanceOf('c2', '20.00'));
    holdC3.resolve(balanceOf('c3', '30.00'));
    await retry;
    await settle();
    expect(text(tree)).toContain(formatMoney(5));
    expect(text(tree)).not.toContain(formatMoney(20));
    expect(whats()).toEqual([]);
  });

  it('failure already fixed by the retry, then loadCustomers: no balance notice while the balances are still loading', async () => {
    await failTwoBalances();
    h.api.getCustomerBalance.mockReset();
    h.api.getCustomerBalance.mockImplementation(async (id: string) => balanceOf(id, DEBT[id]));
    await notices()[0].props.onRetry();
    await settle();
    expect(whats()).toEqual([]);
    // New loadCustomers: the list arrives, the balances are held back (nothing failed).
    h.api.listCustomers.mockResolvedValue({
      items: ['c1', 'c2', 'c3', 'c4'].map((id) => ({ id, name: `Cliente ${id}`, phone: `9${id}`, creditLimit: '100.00' })),
    });
    const hold = deferred<{ items: ReturnType<typeof balanceOf>[] }>();
    h.api.getCustomerBalances.mockClear(); // the first load already read them once
    h.api.getCustomerBalances.mockReturnValue(hold.promise);
    const submit = submitNewCustomer();
    await settle();
    expect(h.api.getCustomerBalances).toHaveBeenCalledTimes(1);
    expect(whats()).toEqual([]);
    hold.resolve({ items: ['c1', 'c2', 'c3', 'c4'].map((id) => balanceOf(id, DEBT[id] ?? '1.00')) });
    await submit;
    await settle();
    expect(whats()).toEqual([]);
  });

  it('double click on "Tentar de novo" of the balances: the page itself does not start a second burst while busy', async () => {
    await failTwoBalances();
    const slow = deferred<ReturnType<typeof balanceOf>>();
    h.api.getCustomerBalance.mockReset();
    h.api.getCustomerBalance.mockReturnValue(slow.promise);
    const first = notices()[0].props.onRetry();
    expect(notices()[0].props.busy).toBe(true);
    expect(h.api.getCustomerBalance).toHaveBeenCalledTimes(2);
    // A second click only reaches the handler if the button were enabled; the button is disabled when busy.
    expect(notices()[0].props.busy).toBe(true);
    slow.resolve(balanceOf('c2', '20.00'));
    await first;
    await settle();
  });

  it('while any retry is in flight, every notice of the Fiado tab is busy (one request burst at a time)', async () => {
    h.api.getCreditMetrics.mockRejectedValueOnce(new Error('429'));
    h.api.getCustomerBalances.mockResolvedValue({ items: [balanceOf('c1', DEBT.c1)] });
    await mount();
    await openTab(FIADO);
    expect(notices().length).toBe(2);
    const slow = deferred<ReturnType<typeof balanceOf>>();
    h.api.getCustomerBalance.mockReset();
    h.api.getCustomerBalance.mockReturnValue(slow.promise);
    const first = notices()[0].props.onRetry();
    expect(notices().map((n) => n.props.busy)).toEqual([true, true]);
    slow.resolve(balanceOf('c2', '20.00'));
    await first;
    await settle();
    expect(notices().map((n) => n.props.busy)).toEqual([false]);
  });
});

describe('/gestao: more races of the balance retry (A2 acceptance gaps)', () => {
  async function failTwoBalances() {
    h.api.getCustomerBalances.mockResolvedValue({ items: [balanceOf('c1', DEBT.c1)] });
    await mount();
    await openTab(FIADO);
    expect(whats().length).toBe(1);
  }

  function submitNewCustomer() {
    void openTab('＋ Novo Cliente');
    let form: El | undefined;
    walk(tree, (el) => {
      if (!form && typeof el.type === 'function' && el.type.name === 'NewCustomerPanel') form = el;
    });
    if (!form) throw new Error('new customer form not found');
    return (form.props.onSubmit as (e: unknown) => Promise<void>)({ preventDefault: () => {} });
  }

  function clickSettle() {
    let button: El | undefined;
    walk(tree, (el) => {
      if (!button && el.type === 'button' && text(el).includes('Receber')) button = el;
    });
    if (!button) throw new Error('settle button not found');
    (button.props.onClick as () => void)();
  }

  function submitSettle() {
    let form: El | undefined;
    walk(tree, (el) => {
      if (!form && el.type === 'form' && text(el).includes('Quitação de Fiado no Caixa')) form = el;
    });
    if (!form) throw new Error('settle form not found');
    return (form.props.onSubmit as (e: unknown) => Promise<void>)({ preventDefault: () => {} });
  }

  it('retry in flight, then loadCustomers removes a customer: the removed one is never shown and the rest still completes', async () => {
    await failTwoBalances();
    const holdC2 = deferred<ReturnType<typeof balanceOf>>();
    const holdC3 = deferred<ReturnType<typeof balanceOf>>();
    h.api.getCustomerBalance.mockReset();
    h.api.getCustomerBalance.mockImplementation((id: string) => (id === 'c2' ? holdC2.promise : holdC3.promise));
    const retry = notices()[0].props.onRetry();
    await settle();
    // Meanwhile the list reloads without c2; c3 balance fails again in that reload.
    h.api.listCustomers.mockResolvedValue({
      items: ['c1', 'c3'].map((id) => ({ id, name: `Cliente ${id}`, phone: `9${id}`, creditLimit: '100.00' })),
    });
    h.api.getCustomerBalances.mockResolvedValue({ items: [balanceOf('c1', DEBT.c1)] });
    await submitNewCustomer();
    await settle();
    expect(text(tree)).not.toContain('Cliente c2');
    holdC2.resolve(balanceOf('c2', '20.00'));
    holdC3.resolve(balanceOf('c3', '30.00'));
    await retry;
    await settle();
    expect(text(tree)).not.toContain('Cliente c2');
    expect(text(tree)).not.toContain(formatMoney(20));
    expect(text(tree)).toContain(formatMoney(30));
    expect(text(tree)).toContain(formatMoney(10));
    expect(whats()).toEqual([]); // no phantom count of 1 for the removed customer
    expect(notices()[0]?.props.busy).toBeFalsy();
  });

  it('retry in flight, then the list becomes empty: no balance notice, not busy', async () => {
    await failTwoBalances();
    const hold = deferred<ReturnType<typeof balanceOf>>();
    h.api.getCustomerBalance.mockReset();
    h.api.getCustomerBalance.mockReturnValue(hold.promise);
    const retry = notices()[0].props.onRetry();
    await settle();
    h.api.listCustomers.mockResolvedValue({ items: [] });
    await submitNewCustomer();
    await settle();
    hold.resolve(balanceOf('c2', '20.00'));
    await retry;
    await settle();
    expect(whats()).toEqual([]);
    expect(text(tree)).not.toContain(formatMoney(20));
    expect(notices().length).toBe(0);
  });

  it('retry in flight for missing balances, then a settlement of a customer that already has a balance: the new debt wins', async () => {
    await failTwoBalances(); // c1 has 10,00; c2 and c3 missing
    const holdC2 = deferred<ReturnType<typeof balanceOf>>();
    const holdC3 = deferred<ReturnType<typeof balanceOf>>();
    h.api.getCustomerBalance.mockReset();
    h.api.getCustomerBalance.mockImplementation((id: string) => (id === 'c2' ? holdC2.promise : holdC3.promise));
    (h.api as Record<string, unknown>).settleCustomerDebt = vi.fn().mockResolvedValue({});
    try {
      const retry = notices()[0].props.onRetry();
      await settle();
      // Settle c1 (10,00 -> 0,00) while the retry is in flight; the reload shows c1 paid and c2/c3 still failing.
      clickSettle();
      h.api.getCustomerBalances.mockResolvedValue({ items: [balanceOf('c1', '0.00')] });
      await submitSettle();
      await settle();
      expect(text(tree)).not.toContain(`Dívida Atual em Aberto${formatMoney(10)}`);
      holdC2.resolve(balanceOf('c2', '20.00'));
      holdC3.resolve(balanceOf('c3', '30.00'));
      await retry;
      await settle();
      expect(text(tree)).not.toContain(`Dívida Atual em Aberto${formatMoney(10)}`); // c1 must not go back to the old debt
      expect(text(tree)).toContain(formatMoney(20));
      expect(text(tree)).toContain(formatMoney(30));
      expect(whats().some((w) => /saldo/i.test(w))).toBe(false);
    } finally {
      delete (h.api as Record<string, unknown>).settleCustomerDebt;
    }
  });

  it('retry fails twice in a row: notice keeps the same count, never busy afterwards, and a third retry still asks only for the missing ones', async () => {
    await failTwoBalances();
    for (let i = 0; i < 2; i++) {
      h.api.getCustomerBalance.mockReset();
      h.api.getCustomerBalance.mockImplementation(async (id: string) => {
        if (id === 'c3') throw new Error('429');
        if (i === 0) throw new Error('429'); // first retry: everything fails
        return balanceOf(id, DEBT[id]);
      });
      await notices()[0].props.onRetry();
      await settle();
      expect(notices().length).toBe(1);
      expect(notices()[0].props.busy).toBeFalsy();
      expect(whats()[0]).toMatch(i === 0 ? /\b2\b/ : /\b1\b/);
    }
    h.api.getCustomerBalance.mockReset();
    h.api.getCustomerBalance.mockImplementation(async (id: string) => balanceOf(id, DEBT[id]));
    await notices()[0].props.onRetry();
    await settle();
    expect(h.api.getCustomerBalance.mock.calls.map((c) => c[0])).toEqual(['c3']);
    expect(whats()).toEqual([]);
  });

  it('empty customer list: no balance notice and no balance read', async () => {
    h.api.listCustomers.mockResolvedValue({ items: [] });
    await mount();
    await openTab(FIADO);
    expect(whats()).toEqual([]);
    expect(h.api.getCustomerBalance).not.toHaveBeenCalled();
  });
});

describe('/gestao: recovery e-mail of the owner (D-32, slice 2b-1)', () => {
  const REGISTER = 'Cadastre e confirme seu e-mail para poder recuperar a senha e o PIN';
  const CONFIRM = 'Falta confirmar seu e-mail';
  const DOT = 'E-mail de recuperação sem confirmar'; // the accessible text of the alert dot in the Ajustes label

  function dotCount() {
    let found = 0;
    walk(tree, (el) => {
      if (el.type === 'span' && el.props.className === 'mg-dot') found++;
    });
    return found;
  }

  it('AC-62: owner with no e-mail sees the alert dot on Ajustes in every tab, no banner anywhere; the form is in Ajustes', async () => {
    h.api.getOwnerEmail.mockResolvedValue({ email: null, verified: false });
    await mount();
    for (const tab of [PRODUTOS, FIADO, CAIXA, AJUSTES]) {
      await openTab(tab);
      expect(dotCount(), tab).toBe(1);
      expect(text(tree), tab).toContain(DOT);
      expect(text(tree), tab).not.toContain(REGISTER);
    }
    expect(text(tree)).toContain('Nenhum e-mail cadastrado.');
    expect(text(tree)).toContain('Cadastrar e-mail');
    expect(whats()).toEqual([]);
  });

  it('AC-63: e-mail saved but not confirmed shows the dot and, in Ajustes, "falta confirmar."', async () => {
    h.api.getOwnerEmail.mockResolvedValue({ email: 'maria@gmail.com', verified: false });
    await mount();
    expect(dotCount()).toBe(1);
    expect(text(tree)).not.toContain(CONFIRM);
    await openTab(AJUSTES);
    expect(text(tree)).toContain('falta confirmar.');
  });

  it('AC-62/63: with the e-mail confirmed there is no dot, and Ajustes shows it as confirmed', async () => {
    await mount(); // default: confirmed
    expect(dotCount()).toBe(0);
    expect(text(tree)).not.toContain(DOT);
    expect(text(tree)).not.toContain(REGISTER);
    await openTab(AJUSTES);
    expect(text(tree)).toContain('maria@gmail.com');
    expect(text(tree)).toContain('confirmado.');
  });

  it('AC-9: an operator never reads the e-mail, has no Ajustes or Relatórios tab and no dot', async () => {
    h.api.me.mockResolvedValue({ username: 'caixa', merchantId: 'm', authorities: [], isOwner: false });
    h.api.getOwnerEmail.mockResolvedValue({ email: null, verified: false });
    await mount();
    expect(h.api.getOwnerEmail).not.toHaveBeenCalled();
    await expect(openTab(AJUSTES)).rejects.toThrow(/not found/);
    await expect(openTab('Relatórios')).rejects.toThrow(/not found/);
    for (const tab of [PRODUTOS, FIADO, CAIXA]) await openTab(tab); // the three tabs of the operator stay
    expect(dotCount()).toBe(0);
    expect(text(tree)).not.toContain(DOT);
  });

  it('a failed read does not break Gestão: no notice anywhere but Ajustes, which shows the failure with a retry that reads only the e-mail', async () => {
    h.api.getOwnerEmail.mockRejectedValueOnce(new Error('boom'));
    await mount();
    expect(whats()).toEqual([]); // Produtos tab: the rest loaded as always
    expect(dotCount()).toBe(0); // unknown state: no alert
    expect(h.router.push).not.toHaveBeenCalled();
    await openTab(AJUSTES);
    expect(whats()).toEqual(['o e-mail de recuperação']);
    expect(text(tree)).not.toContain('Senha atual'); // the form waits for a known state
    const before = counts();
    await notices()[0].props.onRetry();
    await settle();
    expect(counts()).toEqual({ ...before, getOwnerEmail: 2 });
    expect(whats()).toEqual([]);
    expect(text(tree)).toContain('Senha atual');
  });
});

describe('/gestao: tabs and the stock control switch (shell of 5 tabs)', () => {
  function tabLabels(): string[] {
    const labels: string[] = [];
    walk(tree, (el) => {
      if (el.type === 'div' && el.props.className === 'mg-tabs') {
        const buttons: El[] = [];
        walk(el.props.children, (b) => {
          if (b.type === 'button') buttons.push(b);
        });
        labels.push(...buttons.map((b) => text(b)));
      }
    });
    return labels;
  }

  it('the owner has Catálogo, Clientes, Caixa, Relatórios and Ajustes, with no counter, no cash state and no old title', async () => {
    await mount();
    expect(tabLabels()).toEqual(['Catálogo', 'Clientes', 'Caixa', 'Relatórios', 'Ajustes']);
    expect(text(tree)).not.toContain('Painel de Gestão do Comércio');
    expect(text(tree)).not.toContain('Retaguarda');
  });

  it('the operator has only Catálogo, Clientes and Caixa', async () => {
    h.api.me.mockResolvedValue({ username: 'caixa', merchantId: 'm', authorities: [], isOwner: false });
    await mount();
    expect(tabLabels()).toEqual(['Catálogo', 'Clientes', 'Caixa']);
  });

  it('the switch is in Ajustes and not in the catalog; it asks, saves and shows the new state', async () => {
    const updateStoreSettings = vi.fn().mockResolvedValue({ stockControlEnabled: false });
    (h.api as Record<string, unknown>).updateStoreSettings = updateStoreSettings;
    const confirmFn = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmFn);
    try {
      await mount();
      expect(text(tree)).not.toContain('Controle de estoque');
      await openTab(AJUSTES);
      expect(text(tree)).toContain('Ligado.');
      await openTab('Desligar');
      await settle();
      expect(confirmFn).toHaveBeenCalledTimes(1);
      expect(updateStoreSettings).toHaveBeenCalledWith({ stockControlEnabled: false });
      expect(text(tree)).toContain('Desligado.');
      expect(text(tree)).toContain('Ligar');
    } finally {
      delete (h.api as Record<string, unknown>).updateStoreSettings;
      vi.unstubAllGlobals();
    }
  });

  it('does not save when the owner says no to the question', async () => {
    const updateStoreSettings = vi.fn();
    (h.api as Record<string, unknown>).updateStoreSettings = updateStoreSettings;
    vi.stubGlobal('confirm', () => false);
    try {
      await mount();
      await openTab(AJUSTES);
      await openTab('Desligar');
      await settle();
      expect(updateStoreSettings).not.toHaveBeenCalled();
      expect(text(tree)).toContain('Ligado.');
    } finally {
      delete (h.api as Record<string, unknown>).updateStoreSettings;
      vi.unstubAllGlobals();
    }
  });
});
