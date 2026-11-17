import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import type { SessionData } from '@/shared/infrastructure/auth/session';

import { POST as productsPost } from './products/route';
import { PATCH as productPatch } from './products/[id]/route';
import { POST as productsImportPost } from './products/import/route';
import { POST as restockPost } from './inventory/restock/route';
import { GET as salesReportGet } from './reports/sales/route';
import { GET as settingsGet, PATCH as settingsPatch } from './store/settings/route';
import { POST as operatorsPost, GET as operatorsGet } from './users/operators/route';
import { POST as cashOpenPost } from './cash/open/route';
import { POST as cashClosePost } from './cash/close/route';
import { POST as salesPost } from './sales/route';
import { POST as cancelPost } from './sales/[id]/cancel/route';
import { POST as withdrawalPost } from './cash/withdrawal/route';
import { POST as depositPost } from './cash/deposit/route';
import { POST as settlePost } from './customers/[id]/settle/route';
import { POST as customersPost } from './customers/route';
import { PATCH as customerPatch } from './customers/[id]/route';

// Permission contract of the API routes. Every "passes" case stops at the invalid body (400) before any
// database call: the db module is replaced by an empty object, so a call to it would turn into a 500.

const mockRequireAuthSession = vi.fn();
vi.mock('@/shared/infrastructure/auth/auth-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/infrastructure/auth/auth-context')>();
  return {
    ...actual,
    requireAuthSession: () => mockRequireAuthSession(),
    requireAuthenticatedSession: () => mockRequireAuthSession(),
  };
});

vi.mock('@/shared/infrastructure/db/connection', () => ({ db: {} }));

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, connection: async () => undefined };
});

function session(authorities: SessionData['authorities']): SessionData {
  return { username: 'user-test', merchantId: 'merchant-test', authorities, expiresAt: Date.now() + 60_000 };
}

const owner = session(['ROLE_OWNER', 'CREATE_SALE', 'OPEN_CASH', 'CLOSE_CASH']);
// A REAL registered operator today (create-operator.use-case.ts) has all four authorities, so it passes the
// OPEN_CASH and CLOSE_CASH checks (see D-06).
const realOperator = session(['ROLE_OPERATOR', 'CREATE_SALE', 'OPEN_CASH', 'CLOSE_CASH']);
// A session WITHOUT the cash authorities. No registered user has this today; it only protects the
// OPEN_CASH/CLOSE_CASH checks, so they keep returning 403 if an operator ever loses those authorities.
const operatorWithoutCash = session(['ROLE_OPERATOR', 'CREATE_SALE']);
// Pure owner session: no OPEN_CASH/CLOSE_CASH, so only the `isSessionOwner ||` shortcut lets it through.
const ownerRoleOnly = session(['ROLE_OWNER']);
const operatorOpenOnly = session(['ROLE_OPERATOR', 'OPEN_CASH']);
const operatorCloseOnly = session(['ROLE_OPERATOR', 'CLOSE_CASH']);

const UNAUTHENTICATED_MESSAGE = 'Não autorizado. Faça login para continuar.';
const SALE_ID = '11111111-1111-4111-8111-111111111111';
const params = { params: Promise.resolve({ id: SALE_ID }) };

function req(method: string, path: string, body: unknown = {}) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
  });
}

interface Case {
  name: string;
  call: () => Promise<Response>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('rotas só da dona (ROLE_OWNER)', () => {
  const ownerOnly: (Case & { message: string })[] = [
    {
      name: 'PATCH /api/products/[id]',
      call: () => productPatch(req('PATCH', `/api/products/${SALE_ID}`), params),
      message: 'Apenas a proprietária pode editar produtos do catálogo.',
    },
    {
      name: 'PATCH /api/customers/[id]',
      call: () => customerPatch(req('PATCH', `/api/customers/${SALE_ID}`), params),
      message: 'Apenas a proprietária pode editar clientes.',
    },
    {
      name: 'POST /api/products/import',
      call: () => productsImportPost(req('POST', '/api/products/import')),
      message: 'Apenas a proprietária pode importar produtos para o catálogo.',
    },
    {
      name: 'POST /api/inventory/restock',
      call: () => restockPost(req('POST', '/api/inventory/restock')),
      message: 'Apenas a proprietária pode lançar reposições manuais de estoque.',
    },
    {
      name: 'GET /api/reports/sales',
      call: () => salesReportGet(req('GET', '/api/reports/sales?period=invalido')),
      message: 'Apenas a proprietária pode ver os relatórios de vendas.',
    },
    {
      name: 'PATCH /api/store/settings',
      call: () => settingsPatch(req('PATCH', '/api/store/settings')),
      message: 'Apenas a proprietária pode mudar as configurações da loja.',
    },
    {
      name: 'POST /api/users/operators',
      call: () => operatorsPost(req('POST', '/api/users/operators')),
      message: 'Apenas a proprietária pode cadastrar novos operadores de caixa.',
    },
    {
      name: 'GET /api/users/operators',
      call: () => operatorsGet(),
      message: 'Apenas a proprietária pode listar operadores do comércio.',
    },
  ];

  describe.each(ownerOnly)('$name', ({ call, message }) => {
    it('sem sessão: 401', async () => {
      mockRequireAuthSession.mockRejectedValue(new UnauthorizedError());
      const response = await call();
      expect(response.status).toBe(401);
      expect((await response.json()).message).toBe(UNAUTHENTICATED_MESSAGE);
    });

    it('sessão de operador sem autoridades de caixa: 403 com a mensagem atual', async () => {
      mockRequireAuthSession.mockResolvedValue(operatorWithoutCash);
      const response = await call();
      expect(response.status).toBe(403);
      expect((await response.json()).message).toBe(message);
    });

    it('operador real (com as 4 autoridades) ainda é barrado: 403', async () => {
      mockRequireAuthSession.mockResolvedValue(realOperator);
      const response = await call();
      expect(response.status).toBe(403);
      expect((await response.json()).message).toBe(message);
    });
  });

  // GET /api/users/operators passes the check and goes to the database, so it is covered by the 403/401 cases
  // above only; the others stop at the invalid body.
  describe.each(ownerOnly.filter((c) => c.name !== 'GET /api/users/operators'))('$name (dona)', ({ call }) => {
    it('dona passa da checagem e para no corpo inválido: 400', async () => {
      mockRequireAuthSession.mockResolvedValue(owner);
      const response = await call();
      expect(response.status).toBe(400);
    });
  });
});

describe('POST /api/products (D-25): qualquer usuária logada', () => {
  it('sem sessão: 401', async () => {
    mockRequireAuthSession.mockRejectedValue(new UnauthorizedError());
    expect((await productsPost(req('POST', '/api/products'))).status).toBe(401);
  });

  it.each([['dona', owner], ['operador real', realOperator]])('%s passa da checagem e para no corpo inválido: 400', async (_n, s) => {
    mockRequireAuthSession.mockResolvedValue(s);
    expect((await productsPost(req('POST', '/api/products'))).status).toBe(400);
  });
});

describe('GET /api/users/operators: dona passa da checagem', () => {
  it('a dona chega à consulta de operadores (não recebe 401 nem 403)', async () => {
    mockRequireAuthSession.mockResolvedValue(owner);
    const response = await operatorsGet();
    // db is mocked as {}, so the listing throws after the check and the route answers 500: 500 plus the
    // logged error prove the check passed and execution reached the (mocked) database.
    expect(response.status).toBe(500);
    expect(console.error).toHaveBeenCalled();
  });
});

describe('POST /api/cash/open (OPEN_CASH)', () => {
  const call = () => cashOpenPost(req('POST', '/api/cash/open'));

  it('sem sessão: 401', async () => {
    mockRequireAuthSession.mockRejectedValue(new UnauthorizedError());
    const response = await call();
    expect(response.status).toBe(401);
    expect((await response.json()).message).toBe(UNAUTHENTICATED_MESSAGE);
  });

  it('sessão sem OPEN_CASH (nenhum usuário cadastrado hoje): 403 com a mensagem atual', async () => {
    mockRequireAuthSession.mockResolvedValue(operatorWithoutCash);
    const response = await call();
    expect(response.status).toBe(403);
    expect((await response.json()).message).toBe('Você não tem permissão para abrir o caixa (OPEN_CASH).');
  });

  it('operador com só CLOSE_CASH: 403', async () => {
    mockRequireAuthSession.mockResolvedValue(operatorCloseOnly);
    expect((await call()).status).toBe(403);
  });

  it('operador com OPEN_CASH passa da checagem e para no corpo inválido: 400', async () => {
    mockRequireAuthSession.mockResolvedValue(operatorOpenOnly);
    expect((await call()).status).toBe(400);
  });

  it('dona passa da checagem e para no corpo inválido: 400', async () => {
    mockRequireAuthSession.mockResolvedValue(owner);
    expect((await call()).status).toBe(400);
  });

  it('operador real (cadastrado hoje, com as 4 autoridades) passa da checagem: 400', async () => {
    mockRequireAuthSession.mockResolvedValue(realOperator);
    expect((await call()).status).toBe(400);
  });

  it('sessão só com ROLE_OWNER passa pelo atalho de dona: 400', async () => {
    mockRequireAuthSession.mockResolvedValue(ownerRoleOnly);
    expect((await call()).status).toBe(400);
  });
});

describe('POST /api/cash/close (CLOSE_CASH)', () => {
  const call = () => cashClosePost(req('POST', '/api/cash/close'));

  it('sem sessão: 401', async () => {
    mockRequireAuthSession.mockRejectedValue(new UnauthorizedError());
    const response = await call();
    expect(response.status).toBe(401);
    expect((await response.json()).message).toBe(UNAUTHENTICATED_MESSAGE);
  });

  it('sessão sem CLOSE_CASH (nenhum usuário cadastrado hoje): 403 com a mensagem atual', async () => {
    mockRequireAuthSession.mockResolvedValue(operatorWithoutCash);
    const response = await call();
    expect(response.status).toBe(403);
    expect((await response.json()).message).toBe('Você não tem permissão para fechar o caixa (CLOSE_CASH).');
  });

  it('operador com só OPEN_CASH: 403', async () => {
    mockRequireAuthSession.mockResolvedValue(operatorOpenOnly);
    expect((await call()).status).toBe(403);
  });

  it('operador com CLOSE_CASH passa da checagem e para no corpo inválido: 400', async () => {
    mockRequireAuthSession.mockResolvedValue(operatorCloseOnly);
    expect((await call()).status).toBe(400);
  });

  it('dona passa da checagem e para no corpo inválido: 400', async () => {
    mockRequireAuthSession.mockResolvedValue(owner);
    expect((await call()).status).toBe(400);
  });

  it('operador real (cadastrado hoje, com as 4 autoridades) passa da checagem: 400', async () => {
    mockRequireAuthSession.mockResolvedValue(realOperator);
    expect((await call()).status).toBe(400);
  });

  it('sessão só com ROLE_OWNER passa pelo atalho de dona: 400', async () => {
    mockRequireAuthSession.mockResolvedValue(ownerRoleOnly);
    expect((await call()).status).toBe(400);
  });
});

// Documents the current behavior, see 19.3 and DECISIONS.md.
// These routes require only a login: an operator without OPEN_CASH, CLOSE_CASH or ROLE_OWNER passes the check.
// sales/[id]/cancel is not login-only in practice: it also requires ownerPin in the body (validated by
// BcryptOwnerPinVerifier). Here the body is invalid, so the test stops before the PIN is checked.
// The tests do NOT claim this is the desired rule; if the rule changes, change the tests on purpose.
describe('rotas que hoje exigem só login (operador autenticado passa)', () => {
  const loginOnly: Case[] = [
    { name: 'POST /api/sales', call: () => salesPost(req('POST', '/api/sales')) },
    { name: 'POST /api/sales/[id]/cancel', call: () => cancelPost(req('POST', `/api/sales/${SALE_ID}/cancel`), params) },
    { name: 'POST /api/cash/withdrawal', call: () => withdrawalPost(req('POST', '/api/cash/withdrawal')) },
    { name: 'POST /api/cash/deposit', call: () => depositPost(req('POST', '/api/cash/deposit')) },
    { name: 'POST /api/customers/[id]/settle', call: () => settlePost(req('POST', `/api/customers/${SALE_ID}/settle`), params) },
    { name: 'POST /api/customers', call: () => customersPost(req('POST', '/api/customers')) },
  ];

  describe.each(loginOnly)('$name', ({ call }) => {
    it('sem sessão: 401', async () => {
      mockRequireAuthSession.mockRejectedValue(new UnauthorizedError());
      const response = await call();
      expect(response.status).toBe(401);
      expect((await response.json()).message).toBe(UNAUTHENTICATED_MESSAGE);
    });

    it('operador sem autoridade extra passa da checagem e para no corpo inválido: 400', async () => {
      mockRequireAuthSession.mockResolvedValue(session(['ROLE_OPERATOR']));
      expect((await call()).status).toBe(400);
    });
  });

  it('GET /api/store/settings: operador lê (só login)', async () => {
    mockRequireAuthSession.mockResolvedValue(session(['ROLE_OPERATOR']));
    const response = await settingsGet();
    // db is mocked as {}, so the read throws after the check and the route answers 500: 500 plus the logged
    // error prove the check passed and execution reached the (mocked) database.
    expect(response.status).toBe(500);
    expect(console.error).toHaveBeenCalled();
  });
});
