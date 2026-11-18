import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { Money } from '@/shared/domain/money';
import { Customer } from '@/modules/customers/domain/customer';
import { CreditMovement } from '@/modules/customers/domain/credit-movement';
import { encodeStatementCursor } from '@/modules/customers/domain/customer-statement';
import { UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';

const mockRequireAuthSession = vi.fn();
vi.mock('@/shared/infrastructure/auth/auth-context', () => ({
  requireAuthenticatedSession: () => mockRequireAuthSession(),
  UnauthorizedError: class UnauthorizedError extends Error {
    constructor() {
      super('Não autorizado.');
      this.name = 'UnauthorizedError';
    }
  },
}));

const mockFindById = vi.fn();
vi.mock('@/modules/customers/infrastructure/drizzle-customer-repository', () => ({
  DrizzleCustomerRepository: class {
    findById = mockFindById;
  },
}));

const mockGetStatementPage = vi.fn();
vi.mock('@/modules/customers/infrastructure/drizzle-customer-credit-repository', () => ({
  DrizzleCustomerCreditRepository: class {
    getStatementPage = mockGetStatementPage;
  },
}));

const ID = '11111111-1111-4111-8111-111111111111';
const MOVEMENT_ID = '33333333-3333-4333-8333-333333333333';
const operator = { merchantId: 'merchant-1', username: 'caixa', authorities: ['ROLE_OPERATOR', 'CREATE_SALE'] };

function get(query = '', id = ID) {
  return GET(new NextRequest(`http://localhost/api/customers/${id}/statement${query}`), { params: Promise.resolve({ id }) });
}

describe('GET /api/customers/[id]/statement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockRequireAuthSession.mockResolvedValue(operator);
    mockFindById.mockResolvedValue(
      new Customer({
        id: ID,
        merchantId: 'merchant-1',
        name: 'Ana',
        phone: '11988887777',
        creditLimit: Money.fromDecimal('100'),
        active: true,
        creditBlocked: false,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      })
    );
    mockGetStatementPage.mockResolvedValue([]);
  });

  it('401 sem sessão', async () => {
    mockRequireAuthSession.mockRejectedValue(new UnauthorizedError());

    expect((await get()).status).toBe(401);
    expect(mockFindById).not.toHaveBeenCalled();
  });

  it('400 para id que não é UUID', async () => {
    expect((await get('', 'abc')).status).toBe(400);
    expect(mockFindById).not.toHaveBeenCalled();
  });

  it('404 igual para cliente inexistente ou de outra loja, sem eco do id', async () => {
    mockFindById.mockResolvedValue(null);

    const response = await get();

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ message: 'Cliente não encontrado.' });
    expect(mockFindById).toHaveBeenCalledWith('merchant-1', ID);
  });

  it.each(['limit=0', 'limit=-1', 'limit=51', 'limit=abc', 'limit=', 'limit=1.5'])('400 para %s', async (query) => {
    expect((await get(`?${query}`)).status).toBe(400);
    expect(mockGetStatementPage).not.toHaveBeenCalled();
  });

  it('400 para cursor adulterado ou de outro cliente', async () => {
    expect((await get('?cursor=adulterado')).status).toBe(400);

    const other = encodeStatementCursor('22222222-2222-4222-8222-222222222222', { createdAt: '2026-11-17T10:00:00Z', id: MOVEMENT_ID });
    expect((await get(`?cursor=${other}`)).status).toBe(400);
    expect(mockGetStatementPage).not.toHaveBeenCalled();
  });

  it('200 vazio para operadora, loja da sessão e limite padrão', async () => {
    const response = await get();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [], nextCursor: null });
    expect(mockGetStatementPage).toHaveBeenCalledWith('merchant-1', ID, { limit: 21, after: undefined });
  });

  it('200 com dinheiro em texto, ISO, operador e sem authorizedBy', async () => {
    mockGetStatementPage.mockResolvedValue([
      {
        movement: new CreditMovement({
          id: MOVEMENT_ID,
          merchantId: 'merchant-1',
          customerId: ID,
          type: 'CREDIT',
          amount: Money.fromDecimal('0.20'),
          operatorId: 'caixa',
          authorizedBy: 'dona',
          note: 'Pagamento',
          createdAt: new Date('2026-11-17T02:30:00.000Z'),
        }),
        runningBalance: Money.fromDecimal('10.30'),
        position: { createdAt: '2026-11-17T02:30:00.000000Z', id: MOVEMENT_ID },
      },
    ]);

    const body = await (await get('?limit=5')).json();

    expect(body.items).toEqual([
      {
        id: MOVEMENT_ID,
        type: 'PAYMENT',
        amount: '0.20',
        balanceAfter: '10.30',
        createdAt: '2026-11-17T02:30:00.000Z',
        saleId: null,
        operator: 'caixa',
        note: null,
      },
    ]);
    expect(mockGetStatementPage).toHaveBeenCalledWith('merchant-1', ID, { limit: 6, after: undefined });
  });

  it('500 genérico sem vazar detalhe', async () => {
    mockGetStatementPage.mockRejectedValue(new Error('connection refused to db.internal'));

    const response = await get();

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('db.internal');
  });
});
