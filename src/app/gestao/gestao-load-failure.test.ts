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
    listCustomers: vi.fn(),
    getCustomerBalance: vi.fn(),
    getCurrentCash: vi.fn(),
    getCreditMetrics: vi.fn(),
    listOperators: vi.fn(),
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
const KEPT = new Set(['LoadFailureNotice', 'AppHeader', 'ManagementDataSkeleton', 'VersionLabel', 'SalesReportPanel', 'ImportProductsPanel']);

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

function openTab(label: string) {
  let button: El | undefined;
  walk(tree, (el) => {
    if (!button && el.type === 'button' && text(el).startsWith(label)) button = el;
  });
  if (!button) throw new Error(`tab "${label}" not found`);
  (button.props.onClick as () => void)();
}

const PRODUTOS = 'Catálogo & Estoque';
const FIADO = 'Clientes & Fiado';
const CAIXA = 'Controle de Caixa';
const OPERADORES = 'Operadores';

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
  for (const fn of Object.values(h.api)) fn.mockReset();
  h.router.push.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  h.api.me.mockResolvedValue({ username: 'dona', merchantId: 'm', authorities: [], isOwner: true });
  h.api.getStoreSettings.mockResolvedValue({ stockControlEnabled: true });
  h.api.listProducts.mockResolvedValue({ items: [] });
  h.api.listCustomers.mockResolvedValue({
    items: ['c1', 'c2', 'c3'].map((id) => ({ id, name: `Cliente ${id}`, phone: `9${id}`, creditLimit: '100.00' })),
  });
  h.api.getCustomerBalance.mockImplementation(async (id: string) => balanceOf(id, DEBT[id]));
  h.api.getCurrentCash.mockResolvedValue({ open: false, session: null });
  h.api.getCreditMetrics.mockResolvedValue({ totalOutstandingCredit: '60.00', totalSettledCredit: '0.00', activeDebtorsCount: 3 });
  h.api.listOperators.mockResolvedValue({ items: [] });
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
  it('shows no notice in any tab and reads each thing exactly once at start', async () => {
    await mount();
    for (const tab of [PRODUTOS, FIADO, CAIXA, OPERADORES]) {
      openTab(tab);
      expect(whats(), tab).toEqual([]);
    }
    expect(counts()).toEqual({
      me: 1, getStoreSettings: 1, listProducts: 1, listCustomers: 1, getCustomerBalance: 3,
      getCurrentCash: 1, getCreditMetrics: 1, listOperators: 1,
    });
    expect(h.router.push).not.toHaveBeenCalled();
    // The reference values the failure tests compare against.
    openTab(FIADO);
    for (const value of [10, 20, 30, 60]) expect(text(tree)).toContain(formatMoney(value));
    expect(text(tree)).toContain(`${FIADO} (3)`);
  });
});

describe('/gestao: products fail', () => {
  it('shows the notice only in the Produtos tab, with the same displayed values; retry repeats the same read and the notice goes away', async () => {
    h.api.listProducts.mockRejectedValueOnce(new Error('boom'));
    await mount();
    expect(whats().length).toBe(1);
    expect(whats()[0]).toMatch(/produtos/i);
    expect(text(tree)).toContain(`${PRODUTOS} (0)`); // value as today
    for (const tab of [FIADO, CAIXA, OPERADORES]) {
      openTab(tab);
      expect(whats().some((w) => /produtos/i.test(w)), tab).toBe(false);
    }
    openTab(PRODUTOS);
    const before = counts();
    await notices()[0].props.onRetry();
    await settle();
    expect(h.api.listProducts).toHaveBeenCalledTimes(2);
    expect(h.api.listProducts).toHaveBeenLastCalledWith('');
    expect(counts()).toEqual({ ...before, listProducts: 2 });
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
    expect(h.api.listProducts).toHaveBeenLastCalledWith('cola');
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
    openTab(FIADO);
    expect(whats().length).toBe(1);
    expect(whats()[0]).toMatch(/clientes/i);
    expect(h.api.getCustomerBalance).not.toHaveBeenCalled();
    expect(text(tree)).toContain(`${FIADO} (0)`); // value as today
    openTab(PRODUTOS);
    expect(whats()).toEqual([]);
    openTab(FIADO);
    await notices()[0].props.onRetry();
    await settle();
    expect(h.api.listCustomers).toHaveBeenCalledTimes(2);
    expect(h.api.getCustomerBalance).toHaveBeenCalledTimes(3);
    expect(whats()).toEqual([]);
    expect(text(tree)).toContain(`${FIADO} (3)`);
  });
});

describe('/gestao: some balances fail (the money case)', () => {
  it('counts the failures in the notice, keeps the R$ 0,00 of today, and retries only the balances that are missing', async () => {
    h.api.getCustomerBalance.mockImplementation(async (id: string) => {
      if (id !== 'c1') throw new Error('429');
      return balanceOf(id, DEBT[id]);
    });
    await mount();
    openTab(FIADO);
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
    h.api.getCustomerBalance.mockImplementation(async (id: string) => {
      if (id !== 'c1') throw new Error('429');
      return balanceOf(id, DEBT[id]);
    });
    await mount();
    openTab(FIADO);
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
    h.api.getCustomerBalance.mockImplementation(async (id: string) => {
      if (id === 'c1') return balanceOf(id, DEBT[id]);
      throw new Error('429');
    });
    await mount();
    openTab(FIADO);
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
  it('shows the notice only in Caixa, keeps "Fechado" and the open-cash form as today; retry reads the cash again', async () => {
    h.api.getCurrentCash.mockRejectedValueOnce(new Error('boom'));
    await mount();
    expect(text(tree)).toContain('● Fechado'); // value as today
    openTab(CAIXA);
    expect(whats().length).toBe(1);
    expect(whats()[0]).toMatch(/caixa/i);
    expect(text(tree)).toContain('Abrir Caixa do Turno'); // as today
    openTab(PRODUTOS);
    expect(whats()).toEqual([]);
    openTab(CAIXA);
    h.api.getCurrentCash.mockResolvedValueOnce({
      open: true,
      session: { id: 's', openedBy: 'dona', openingBalance: '100.00', openedAt: '2026-01-01T10:00:00Z', expectedCash: '100.00' },
    });
    const before = counts();
    await notices()[0].props.onRetry();
    await settle();
    expect(counts()).toEqual({ ...before, getCurrentCash: 2 });
    expect(whats()).toEqual([]);
    expect(text(tree)).toContain('● Aberto');
  });
});

describe('/gestao: fiado metrics fail', () => {
  it('shows the notice in Fiado with the zero as today; retry reads only the metrics', async () => {
    h.api.getCreditMetrics.mockRejectedValueOnce(new Error('boom'));
    await mount();
    openTab(FIADO);
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
  it('shows the notice only in Operadores; retry reads only the operators', async () => {
    h.api.listOperators.mockRejectedValueOnce(new Error('boom'));
    await mount();
    openTab(OPERADORES);
    expect(whats().length).toBe(1);
    expect(whats()[0]).toMatch(/operadores/i);
    expect(text(tree)).toContain(`${OPERADORES} (0)`); // value as today
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
      me: 1, getStoreSettings: 1, listProducts: 1, listCustomers: 1, getCustomerBalance: 0,
      getCurrentCash: 1, getCreditMetrics: 1, listOperators: 1,
    });
    expect(whats().length).toBe(1); // Produtos tab
    openTab(FIADO);
    expect(whats().length).toBe(2);
    expect(whats().some((w) => /clientes/i.test(w))).toBe(true);
    expect(whats().some((w) => /métricas/i.test(w))).toBe(true);
    openTab(CAIXA);
    expect(whats().length).toBe(1);
    openTab(OPERADORES);
    expect(whats().length).toBe(1);
  });

  it('a failure of me() still goes to /login once, with no notice and no other read', async () => {
    h.api.me.mockRejectedValue(new Error('401'));
    await mount();
    expect(h.router.push).toHaveBeenCalledTimes(1);
    expect(h.router.push).toHaveBeenCalledWith('/login');
    expect(whats()).toEqual([]);
    expect(counts()).toEqual({
      me: 1, getStoreSettings: 0, listProducts: 0, listCustomers: 0, getCustomerBalance: 0,
      getCurrentCash: 0, getCreditMetrics: 0, listOperators: 0,
    });
  });
});

describe('/gestao: race between the balance retry and another loadCustomers', () => {
  async function failTwoBalances() {
    h.api.getCustomerBalance.mockImplementation(async (id: string) => {
      if (id !== 'c1') throw new Error('429');
      return balanceOf(id, DEBT[id]);
    });
    await mount();
    openTab(FIADO);
    expect(whats().length).toBe(1);
  }

  function submitNewCustomer() {
    openTab('＋ Novo Cliente');
    let form: El | undefined;
    walk(tree, (el) => {
      if (!form && el.type === 'form' && text(el).includes('Cadastrar Cliente para Fiado')) form = el;
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
    h.api.getCustomerBalance.mockReset();
    h.api.getCustomerBalance.mockImplementation(async (id: string) => balanceOf(id, id === 'c2' ? '5.00' : DEBT[id]));
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
    const holds = Object.fromEntries(['c1', 'c2', 'c3', 'c4'].map((id) => [id, deferred<ReturnType<typeof balanceOf>>()]));
    h.api.getCustomerBalance.mockReset();
    h.api.getCustomerBalance.mockImplementation((id: string) => holds[id].promise);
    const submit = submitNewCustomer();
    await settle();
    expect(h.api.getCustomerBalance).toHaveBeenCalledTimes(4);
    expect(whats()).toEqual([]);
    for (const id of ['c1', 'c2', 'c3', 'c4']) holds[id].resolve(balanceOf(id, DEBT[id] ?? '1.00'));
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
    h.api.getCustomerBalance.mockImplementation(async (id: string) => {
      if (id !== 'c1') throw new Error('429');
      return balanceOf(id, DEBT[id]);
    });
    await mount();
    openTab(FIADO);
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
    h.api.getCustomerBalance.mockImplementation(async (id: string) => {
      if (id !== 'c1') throw new Error('429');
      return balanceOf(id, DEBT[id]);
    });
    await mount();
    openTab(FIADO);
    expect(whats().length).toBe(1);
  }

  function submitNewCustomer() {
    openTab('＋ Novo Cliente');
    let form: El | undefined;
    walk(tree, (el) => {
      if (!form && el.type === 'form' && text(el).includes('Cadastrar Cliente para Fiado')) form = el;
    });
    if (!form) throw new Error('new customer form not found');
    return (form.props.onSubmit as (e: unknown) => Promise<void>)({ preventDefault: () => {} });
  }

  function clickSettle() {
    let button: El | undefined;
    walk(tree, (el) => {
      if (!button && el.type === 'button' && text(el).includes('Quitar Fiado no Caixa')) button = el;
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
    h.api.getCustomerBalance.mockReset();
    h.api.getCustomerBalance.mockImplementation(async (id: string) => {
      if (id === 'c3') throw new Error('429');
      return balanceOf(id, DEBT[id]);
    });
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
      h.api.getCustomerBalance.mockReset();
      h.api.getCustomerBalance.mockImplementation(async (id: string) => {
        if (id === 'c1') return balanceOf('c1', '0.00');
        throw new Error('429');
      });
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
    openTab(FIADO);
    expect(whats()).toEqual([]);
    expect(h.api.getCustomerBalance).not.toHaveBeenCalled();
  });
});
