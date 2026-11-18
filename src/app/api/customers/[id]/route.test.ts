import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PATCH } from './route';
import { Money } from '@/shared/domain/money';
import { Customer } from '@/modules/customers/domain/customer';
import { CustomerAlreadyExistsError, CustomerChangedError, CustomerHasDebtError, InvalidPhoneError, OwnerPinRequiredError } from '@/modules/customers/domain/errors';
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
const mockFindById = vi.fn();
vi.mock('@/modules/customers/infrastructure/drizzle-customer-repository', () => ({
  DrizzleCustomerRepository: class MockDrizzleCustomerRepository {
    updateDetails = mockUpdateDetails;
    findById = mockFindById;
  },
}));

const mockAuthorizeOwnerPin = vi.fn();
vi.mock('@/modules/customers/infrastructure/bcrypt-owner-pin-verifier', () => ({
  BcryptOwnerPinVerifier: class MockBcryptOwnerPinVerifier {
    authorizeOwnerPin = mockAuthorizeOwnerPin;
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
    mockAuthorizeOwnerPin.mockResolvedValue('dona');
    mockFindById.mockResolvedValue(
      Customer.create({ id: ID, merchantId: 'merchant-1', name: 'Maria', phone: '11988887777', creditLimit: Money.fromDecimal('100') })
    );
    mockUpdateDetails.mockResolvedValue(
      new Customer({
        id: ID,
        merchantId: 'merchant-1',
        name: 'Maria Souza',
        phone: '11988887777',
        creditLimit: Money.fromDecimal('150'),
        active: true,
        creditBlocked: false,
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
    ['active texto', { active: 'false' }],
    ['active número', { active: 0 }],
    ['active nulo', { active: null }],
    ['creditBlocked texto', { creditBlocked: 'true' }],
    ['creditBlocked número', { creditBlocked: 1 }],
    ['creditBlocked nulo', { creditBlocked: null }],
    ['limite mal formado', { creditLimit: 'dez' }],
    ['campo desconhecido', { name: 'A', foo: 1 }],
    ['corpo vazio', {}],
  ])('400 strict: %s', async (_label, body) => {
    const response = await patch(body);

    expect(response.status).toBe(400);
    expect((await response.json()).errors.length).toBeGreaterThan(0);
    expect(mockUpdateDetails).not.toHaveBeenCalled();
  });

  it.each(['500.01', '-1'])('400 com mensagem em português para limite %s fora do intervalo, mesmo com PIN, sem chamar o repositório', async (creditLimit) => {
    const response = await patch({ creditLimit, ownerPin: '123456' });

    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe('O limite de fiado deve ser de R$ 0,00 a R$ 500,00.');
    expect(mockUpdateDetails).not.toHaveBeenCalled();
    expect(mockAuthorizeOwnerPin).not.toHaveBeenCalled();
  });

  describe('D-22: aumento do limite exige o PIN da proprietária (limite atual R$ 100,00)', () => {
    it('aumento sem PIN: 400 OWNER_PIN_REQUIRED, sem gastar tentativa e sem gravar', async () => {
      const response = await patch({ creditLimit: '100.01' });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.code).toBe('OWNER_PIN_REQUIRED');
      expect(body.message).toBe('Informe o PIN da proprietária para aumentar o limite de fiado.');
      expect(mockAuthorizeOwnerPin).not.toHaveBeenCalled();
      expect(mockUpdateDetails).not.toHaveBeenCalled();
    });

    it('PIN errado ou loja bloqueada (verificador devolve null): 403 e não grava', async () => {
      mockAuthorizeOwnerPin.mockResolvedValue(null);
      const response = await patch({ creditLimit: '200', ownerPin: '000000' });

      expect(response.status).toBe(403);
      expect((await response.json()).message).toBe('PIN de autorização da proprietária inválido.');
      expect(mockUpdateDetails).not.toHaveBeenCalled();
    });

    it('PIN mal formado: 400 de validação, sem gastar tentativa', async () => {
      const response = await patch({ creditLimit: '200', ownerPin: '12' });

      expect(response.status).toBe(400);
      expect(mockAuthorizeOwnerPin).not.toHaveBeenCalled();
    });

    it('aumento com PIN certo: 200, confere o PIN da sessão e manda só o usuário autorizador ao repositório', async () => {
      const response = await patch({ creditLimit: '500.00', ownerPin: '123456' });

      expect(response.status).toBe(200);
      expect(mockAuthorizeOwnerPin).toHaveBeenCalledWith('merchant-1', 'dona', '123456');
      expect(mockUpdateDetails.mock.calls[0][3].limitIncreaseAuthorizedBy).toBe('dona');
      expect(JSON.stringify(await response.json())).not.toContain('123456');
      expect(JSON.stringify(mockUpdateDetails.mock.calls)).not.toContain('123456');
    });

    it.each(['100.00', '40', '0'])('manter ou reduzir (%s) sem PIN: 200 e sem gastar tentativa', async (creditLimit) => {
      const response = await patch({ creditLimit });

      expect(response.status).toBe(200);
      expect(mockAuthorizeOwnerPin).not.toHaveBeenCalled();
    });

    it('active:false com aumento de limite sem PIN: 400 OWNER_PIN_REQUIRED e nada é gravado', async () => {
      const response = await patch({ active: false, name: 'Maria S', creditLimit: '200' });

      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe('OWNER_PIN_REQUIRED');
      expect(mockUpdateDetails).not.toHaveBeenCalled();
    });

    it('active:false com aumento e PIN certo: 200, tudo numa chamada só ao repositório', async () => {
      const response = await patch({ active: false, creditBlocked: true, creditLimit: '200', ownerPin: '123456' });

      expect(response.status).toBe(200);
      expect(mockUpdateDetails).toHaveBeenCalledTimes(1);
      expect(mockUpdateDetails.mock.calls[0][2]).toMatchObject({ active: false, creditBlocked: true });
      expect(mockUpdateDetails.mock.calls[0][3].limitIncreaseAuthorizedBy).toBe('dona');
    });

    it('excluir cliente com dívida continua 409 CUSTOMER_HAS_DEBT, mesmo com redução de limite', async () => {
      mockUpdateDetails.mockRejectedValue(new CustomerHasDebtError(Money.fromDecimal('10.00')));
      const response = await patch({ active: false, creditLimit: '20' });

      expect(response.status).toBe(409);
      expect((await response.json()).code).toBe('CUSTOMER_HAS_DEBT');
    });

    it('corrida: o repositório recusa o aumento visto sob a trava sem PIN, e vira 400 OWNER_PIN_REQUIRED', async () => {
      mockUpdateDetails.mockRejectedValue(new OwnerPinRequiredError());
      const response = await patch({ creditLimit: '90' });

      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe('OWNER_PIN_REQUIRED');
    });
  });

  it('403 para operadora também ao editar o limite, e não grava', async () => {
    mockRequireAuthSession.mockResolvedValue(operator);

    expect((await patch({ creditLimit: '10' })).status).toBe(403);
    expect(mockUpdateDetails).not.toHaveBeenCalled();
  });

  it('200 ao editar só o limite: repassa Money em centavos e devolve o limite em texto', async () => {
    const response = await patch({ creditLimit: '150.05', ownerPin: '123456' });

    expect(response.status).toBe(200);
    expect((await response.json()).creditLimit).toBe('150.00');
    const sent = mockUpdateDetails.mock.calls[0][2];
    expect(Object.keys(sent)).toEqual(['creditLimit']);
    expect(sent.creditLimit.toDecimal()).toBe('150.05');
  });

  it('403 para operadora ao excluir ou restaurar, mesmo com corpo ilegível, e não grava', async () => {
    mockRequireAuthSession.mockResolvedValue(operator);

    expect((await patch({ active: false })).status).toBe(403);
    expect((await patch({ active: true })).status).toBe(403);
    expect((await patch(null, ID, 'not json')).status).toBe(403);
    expect(mockUpdateDetails).not.toHaveBeenCalled();
  });

  it.each([false, true])('200 ao mudar só active=%s: repassa o booleano e devolve o estado', async (active) => {
    mockUpdateDetails.mockResolvedValue(
      new Customer({
        id: ID,
        merchantId: 'merchant-1',
        name: 'Maria Souza',
        phone: '11988887777',
        creditLimit: Money.fromDecimal('150'),
        active,
        creditBlocked: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-11-17T10:00:00.000Z'),
      })
    );

    const response = await patch({ active, expectedUpdatedAt: '2026-11-17T09:00:00.000Z' });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ active, creditBlocked: true });
    expect(mockUpdateDetails).toHaveBeenCalledWith(
      'merchant-1',
      ID,
      { active },
      { actorId: 'dona', expectedUpdatedAt: new Date('2026-11-17T09:00:00.000Z') }
    );
  });

  it('409 CUSTOMER_HAS_DEBT com o valor devido ao excluir cliente com dívida', async () => {
    mockUpdateDetails.mockRejectedValue(new CustomerHasDebtError(Money.fromDecimal('12.50')));

    const response = await patch({ active: false });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      code: 'CUSTOMER_HAS_DEBT',
      message: 'Este cliente deve R$ 12,50. Receba o valor para poder excluir.',
    });
  });

  it('403 para operadora ao bloquear o fiado, mesmo com corpo ilegível, e não grava', async () => {
    mockRequireAuthSession.mockResolvedValue(operator);

    expect((await patch({ creditBlocked: true })).status).toBe(403);
    expect((await patch(null, ID, 'not json')).status).toBe(403);
    expect(mockUpdateDetails).not.toHaveBeenCalled();
  });

  it.each([true, false])('200 ao mudar só creditBlocked=%s: repassa o booleano e devolve o estado', async (creditBlocked) => {
    mockUpdateDetails.mockResolvedValue(
      new Customer({
        id: ID,
        merchantId: 'merchant-1',
        name: 'Maria Souza',
        phone: '11988887777',
        creditLimit: Money.fromDecimal('150'),
        active: true,
        creditBlocked,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-11-17T10:00:00.000Z'),
      })
    );

    const response = await patch({ creditBlocked, expectedUpdatedAt: '2026-11-17T09:00:00.000Z' });

    expect(response.status).toBe(200);
    expect((await response.json()).creditBlocked).toBe(creditBlocked);
    expect(mockUpdateDetails).toHaveBeenCalledWith(
      'merchant-1',
      ID,
      { creditBlocked },
      { actorId: 'dona', expectedUpdatedAt: new Date('2026-11-17T09:00:00.000Z') }
    );
  });

  it('200 com creditBlocked junto de nome e limite na mesma chamada', async () => {
    const response = await patch({ name: 'Maria', creditLimit: '20', creditBlocked: true });

    expect(response.status).toBe(200);
    const sent = mockUpdateDetails.mock.calls[0][2];
    expect(sent).toMatchObject({ name: 'Maria', creditBlocked: true });
    expect(sent.creditLimit.toDecimal()).toBe('20.00');
  });

  it('409 CUSTOMER_CHANGED também ao mudar só creditBlocked, sem gravar', async () => {
    mockUpdateDetails.mockRejectedValue(new CustomerChangedError());

    const response = await patch({ creditBlocked: true, expectedUpdatedAt: '2026-11-17T09:00:00.000Z' });

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('CUSTOMER_CHANGED');
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
      creditBlocked: false,
      active: true,
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
