import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as settlePost } from './customers/[id]/settle/route';
import { POST as cancelPost } from './sales/[id]/cancel/route';
import { GET as setupStatusGet } from './setup/status/route';

// 19.8: a database failure must never reach the screen with its SQL text. Drizzle puts the query and its
// parameters in the message of the error it throws; the routes answer a generic message and only log the SQLSTATE.

const mockSession = vi.fn();
vi.mock('@/shared/infrastructure/auth/auth-context', () => ({
  requireAuthenticatedSession: () => mockSession(),
  UnauthorizedError: class UnauthorizedError extends Error {
    constructor() {
      super('Não autorizado.');
      this.name = 'UnauthorizedError';
    }
  },
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: () => Promise.resolve(),
}));

vi.mock('@/shared/infrastructure/db/connection', () => ({ db: {} }));

const mockSettle = vi.fn();
vi.mock('@/modules/customers/application/settle-customer-debt.use-case', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/customers/application/settle-customer-debt.use-case')>()),
  SettleCustomerDebtUseCase: class {
    execute = mockSettle;
  },
}));

const mockCancel = vi.fn();
vi.mock('@/modules/sales/application/cancel-sale.use-case', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/sales/application/cancel-sale.use-case')>()),
  CancelSaleUseCase: class {
    execute = mockCancel;
  },
}));

const mockHasAnyUser = vi.fn();
vi.mock('@/modules/users/infrastructure/drizzle-user-repository', () => ({
  DrizzleUserRepository: class {
    hasAnyUser = mockHasAnyUser;
  },
}));

const session = { merchantId: 'merchant-1', username: 'dona', authorities: ['ROLE_OWNER'] };

/** What Drizzle throws when the driver fails: the SQL and the parameters are in the message, the driver error is the cause. */
function driverError(): Error {
  return Object.assign(
    new Error('Failed query: select "id", "merchant_id", "phone" from "customers" where "merchant_id" = $1 params: 9d8c7b'),
    { cause: { code: '08006', message: 'connection terminated' } }
  );
}

const SQL_TEXT = /Failed query|select\s+"|"merchant_id"|params:|\$1/i;

function post(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('database errors never reach the screen with SQL (19.8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.mockResolvedValue(session);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.DATABASE_URL;
  });

  it('POST /api/customers/[id]/settle answers a generic 500 and does not show the SQL', async () => {
    mockSettle.mockRejectedValue(driverError());

    const response = await settlePost(post('/api/customers/c1/settle', { amount: '10.00' }), { params: Promise.resolve({ id: 'c1' }) });
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).not.toMatch(SQL_TEXT);
  });

  it('POST /api/sales/[id]/cancel answers a generic 500 and does not show the SQL', async () => {
    mockCancel.mockRejectedValue(driverError());

    const response = await cancelPost(post('/api/sales/s1/cancel', { ownerPin: '123456', reason: 'Cliente desistiu' }), {
      params: Promise.resolve({ id: 's1' }),
    });
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).not.toMatch(SQL_TEXT);
  });

  it('GET /api/setup/status (public) answers a generic 500 and does not show the SQL', async () => {
    process.env.DATABASE_URL = 'postgres://test';
    mockHasAnyUser.mockRejectedValue(driverError());

    const response = await setupStatusGet();
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).not.toMatch(SQL_TEXT);
  });

  it('a business rule error without a database cause still shows its message (settle and cancel)', async () => {
    mockSettle.mockRejectedValue(new Error('Valor de quitação inválido para este cliente.'));
    mockCancel.mockRejectedValue(new Error('Venda não pode ser cancelada agora.'));

    const settle = await settlePost(post('/api/customers/c1/settle', { amount: '10.00' }), { params: Promise.resolve({ id: 'c1' }) });
    const cancel = await cancelPost(post('/api/sales/s1/cancel', { ownerPin: '123456', reason: 'Cliente desistiu' }), {
      params: Promise.resolve({ id: 's1' }),
    });

    expect(settle.status).toBe(400);
    expect((await settle.json()).message).toBe('Valor de quitação inválido para este cliente.');
    expect(cancel.status).toBe(400);
    expect((await cancel.json()).message).toBe('Venda não pode ser cancelada agora.');
  });
});
