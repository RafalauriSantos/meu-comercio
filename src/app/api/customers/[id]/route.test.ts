import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PATCH } from './route';
import { Money } from '@/shared/domain/money';
import { Customer } from '@/modules/customers/domain/customer';
import { CustomerAlreadyExistsError, CustomerChangedError, InvalidPhoneError } from '@/modules/customers/domain/errors';
import { UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';

const mockRequireAuthSession = vi.fn();
vi.mock('@/shared/infrastructure/auth/auth-context', () => ({
  requireAuthSession: () => mockRequireAuthSession(),
  UnauthorizedError: class UnauthorizedError extends Error {
    constructor() {
      super('Não autorizado.');
      this.name = 'UnauthorizedError';
    }
  },
}));

const mockUpdateDetails = vi.fn();
vi.mock('@/modules/customers/infrastructure/drizzle-customer-repository', () => ({
  DrizzleCustomerRepository: class MockDrizzleCustomerRepository {
    updateDetails = mockUpdateDetails;
  },
}));

const ID = '11111111-1111-4111-8111-111111111111';
const owner = { merchantId: 'merchant-1', username: 'dona', authorities: ['ROLE_OWNER'] };
const operator = { merchantId: 'merchant-1', username: 'caixa', authorities: ['ROLE_OPERATOR', 'CREATE_SALE'] };

function patch(body: unknown, id = ID, raw?: string) {
  return PATCH(
    new NextRequest(`http://localhost/api/customers/${id}`, { method: 'PATCH', body: raw ?? JSON.stringify(body) }),
    { params: Promise.resolve({ id }) }
  );
}

describe('PATCH /api/customers/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockRequireAuthSession.mockResolvedValue(owner);
    mockUpdateDetails.mockResolvedValue(
      new Customer({
        id: ID,
        merchantId: 'merchant-1',
        name: 'Maria Souza',
        phone: '11988887777',
        creditLimit: Money.fromDecimal('150'),
        active: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-11-17T10:00:00.000Z'),
      })
    );
  });

  it('401 sem sessão', async () => {
    mockRequireAuthSession.mockRejectedValue(new UnauthorizedError());

    expect((await patch({ name: 'A' })).status).toBe(401);
    expect(mockUpdateDetails).not.toHaveBeenCalled();
  });

  it('403 para operadora, antes de ler o corpo, e não grava', async () => {
    mockRequireAuthSession.mockResolvedValue(operator);

    const response = await patch({ name: 'A' });

    expect(response.status).toBe(403);
    expect((await response.json()).message).toBe('Apenas a proprietária pode editar clientes.');
    expect(mockUpdateDetails).not.toHaveBeenCalled();
  });

  it('400 para id que não é UUID', async () => {
    const response = await patch({ name: 'A' }, 'abc');

    expect(response.status).toBe(400);
    expect(mockUpdateDetails).not.toHaveBeenCalled();
  });

  it.each([
    ['creditLimit', { creditLimit: '10' }],
    ['active', { name: 'A', active: false }],
    ['campo desconhecido', { name: 'A', foo: 1 }],
    ['corpo vazio', {}],
  ])('400 strict: %s', async (_label, body) => {
    const response = await patch(body);

    expect(response.status).toBe(400);
    expect((await response.json()).errors.length).toBeGreaterThan(0);
    expect(mockUpdateDetails).not.toHaveBeenCalled();
  });

  it('400 para corpo que não é JSON', async () => {
    expect((await patch(null, ID, 'not json')).status).toBe(400);
  });

  it('400 com a mensagem em português da regra D-21 para telefone inválido', async () => {
    mockUpdateDetails.mockRejectedValue(new InvalidPhoneError());

    const response = await patch({ phone: '123' });

    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe('Telefone inválido. Use o DDD e o número, com 8 ou 9 dígitos.');
  });

  it('404 quando o cliente não é da loja', async () => {
    mockUpdateDetails.mockResolvedValue(null);

    const response = await patch({ name: 'A' });

    expect(response.status).toBe(404);
    expect((await response.json()).message).toBe('Cliente não encontrado.');
  });

  it('409 para telefone repetido', async () => {
    mockUpdateDetails.mockRejectedValue(new CustomerAlreadyExistsError('11988887777'));

    const response = await patch({ phone: '11988887777' });

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBeUndefined();
  });

  it('409 com code CUSTOMER_CHANGED quando o cliente mudou desde a leitura', async () => {
    mockUpdateDetails.mockRejectedValue(new CustomerChangedError());

    const response = await patch({ name: 'A', expectedUpdatedAt: '2026-11-17T09:00:00.000Z' });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code: 'CUSTOMER_CHANGED', message: new CustomerChangedError().message });
  });

  it('500 genérico, sem o texto do driver', async () => {
    mockUpdateDetails.mockRejectedValue(new Error('duplicate key value violates unique constraint "idx_customers_merchant_phone"'));

    const response = await patch({ name: 'A' });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: 'Erro interno ao editar cliente.' });
  });

  it('200 com o cliente, o telefone em dígitos e o updatedAt em ISO; repassa ator e expectedUpdatedAt', async () => {
    const response = await patch({ name: ' Maria Souza ', phone: '(11) 98888-7777', expectedUpdatedAt: '2026-11-17T09:00:00.000Z' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: ID,
      name: 'Maria Souza',
      phone: '11988887777',
      creditLimit: '150.00',
      updatedAt: '2026-11-17T10:00:00.000Z',
    });
    expect(mockUpdateDetails).toHaveBeenCalledWith(
      'merchant-1',
      ID,
      { name: 'Maria Souza', phone: '(11) 98888-7777' },
      { actorId: 'dona', expectedUpdatedAt: new Date('2026-11-17T09:00:00.000Z') }
    );
  });
});
