import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';

// D-29: real use case, mocked repository and audit, to prove the refusal happens before any write.
const mockSession = vi.fn();
vi.mock('@/shared/infrastructure/auth/auth-context', () => ({
  requireAuthenticatedSession: () => mockSession(),
  UnauthorizedError: class UnauthorizedError extends Error {
    constructor() {
      super('Não autorizado.');
    }
  },
}));

const mockFindByPhone = vi.fn();
const mockSave = vi.fn();
vi.mock('@/modules/customers/infrastructure/drizzle-customer-repository', () => ({
  DrizzleCustomerRepository: class {
    findByPhone = mockFindByPhone;
    save = mockSave;
  },
}));

const mockAuthorize = vi.fn();
vi.mock('@/modules/customers/infrastructure/bcrypt-owner-pin-verifier', () => ({
  BcryptOwnerPinVerifier: class {
    authorizeOwnerPin = mockAuthorize;
  },
}));

const mockAudit = vi.fn();
vi.mock('@/modules/audit/infrastructure/drizzle-audit-service', () => ({
  DrizzleAuditAdapter: class {
    record = mockAudit;
  },
}));

const owner = { merchantId: 'merchant-1', username: 'dona', authorities: ['ROLE_OWNER'] };
const operator = { merchantId: 'merchant-1', username: 'caixa', authorities: ['ROLE_OPERATOR'] };

function post(body: unknown) {
  return POST(new NextRequest('http://localhost:3000/api/customers', { method: 'POST', body: JSON.stringify(body) }));
}

describe('POST /api/customers: limite de fiado no cadastro (D-29)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindByPhone.mockResolvedValue(null);
    mockSave.mockResolvedValue(undefined);
    mockAudit.mockResolvedValue(undefined);
    mockAuthorize.mockResolvedValue('dona');
    mockSession.mockResolvedValue(operator);
  });

  it('401 sem sessão', async () => {
    mockSession.mockRejectedValue(new UnauthorizedError());
    const res = await post({ name: 'Seu Zé', phone: '11999998888' });
    expect(res.status).toBe(401);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it.each(['150.00', 150, '0.01'])('operadora com limite %s: 400, sem tocar o repositório', async (creditLimit) => {
    const res = await post({ name: 'Seu Zé', phone: '11999998888', creditLimit, ownerPin: '123456' });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Só a proprietária define o limite de fiado.');
    expect(mockFindByPhone).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
    expect(mockAuthorize).not.toHaveBeenCalled();
  });

  it.each([{}, { creditLimit: null }, { creditLimit: '0.00' }, { creditLimit: 0 }])(
    'operadora sem limite ou com zero (%j): 201 com limite 0.00',
    async (extra) => {
      const res = await post({ name: 'Seu Zé', phone: '11999998888', ...extra });
      expect(res.status).toBe(201);
      expect((await res.json()).creditLimit).toBe('0.00');
      expect(mockSave).toHaveBeenCalledTimes(1);
      expect(mockAudit.mock.calls[0][5].creditLimit).toBe('0.00');
    }
  );

  it('operadora grava na loja da sessão, não na do corpo', async () => {
    const res = await post({ name: 'Seu Zé', phone: '11999998888', merchantId: 'outra-loja' });
    expect(res.status).toBe(201);
    expect(mockSave.mock.calls[0][0].merchantId).toBe('merchant-1');
  });

  it('proprietária com limite e PIN certo: 201, grava o limite e audita quem autorizou, sem o PIN', async () => {
    mockSession.mockResolvedValue(owner);
    const res = await post({ name: 'Seu Zé', phone: '11999998888', creditLimit: '150.00', ownerPin: '123456' });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.creditLimit).toBe('150.00');
    expect(JSON.stringify(body)).not.toContain('123456');
    expect(mockAuthorize).toHaveBeenCalledWith('merchant-1', 'dona', '123456');
    expect(mockAudit.mock.calls[0][5]).toMatchObject({ creditLimit: '150.00', authorizedBy: 'dona' });
    expect(JSON.stringify(mockAudit.mock.calls)).not.toContain('123456');
  });

  it('proprietária com limite sem PIN: 400 OWNER_PIN_REQUIRED, sem gastar tentativa e sem gravar', async () => {
    mockSession.mockResolvedValue(owner);
    const res = await post({ name: 'Seu Zé', phone: '11999998888', creditLimit: '150.00' });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('OWNER_PIN_REQUIRED');
    expect(mockAuthorize).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('proprietária com PIN errado ou loja bloqueada: 403 e não grava', async () => {
    mockSession.mockResolvedValue(owner);
    mockAuthorize.mockResolvedValue(null);
    const res = await post({ name: 'Seu Zé', phone: '11999998888', creditLimit: '150.00', ownerPin: '000000' });
    expect(res.status).toBe(403);
    expect((await res.json()).message).toBe('PIN de autorização da proprietária inválido.');
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('proprietária com PIN mal formado: 400 de validação, sem gastar tentativa', async () => {
    mockSession.mockResolvedValue(owner);
    const res = await post({ name: 'Seu Zé', phone: '11999998888', creditLimit: '150.00', ownerPin: '12' });
    expect(res.status).toBe(400);
    expect(mockAuthorize).not.toHaveBeenCalled();
  });

  it('proprietária sem limite não precisa de PIN: 201 com 0.00', async () => {
    mockSession.mockResolvedValue(owner);
    const res = await post({ name: 'Seu Zé', phone: '11999998888' });
    expect(res.status).toBe(201);
    expect((await res.json()).creditLimit).toBe('0.00');
    expect(mockAuthorize).not.toHaveBeenCalled();
  });

  it('telefone repetido com limite e PIN: 409 antes de gastar tentativa de PIN', async () => {
    mockSession.mockResolvedValue(owner);
    mockFindByPhone.mockResolvedValue({ id: 'x' });
    const res = await post({ name: 'Seu Zé', phone: '11999998888', creditLimit: '10.00', ownerPin: '123456' });
    expect(res.status).toBe(409);
    expect(mockAuthorize).not.toHaveBeenCalled();
  });

  it('proprietária aceita o teto e recusa acima dele (mesmo com PIN) ou negativo', async () => {
    mockSession.mockResolvedValue(owner);
    expect((await post({ name: 'A', phone: '11999998888', creditLimit: '500.00', ownerPin: '123456' })).status).toBe(201);
    vi.clearAllMocks();
    mockFindByPhone.mockResolvedValue(null);
    const above = await post({ name: 'B', phone: '11999997777', creditLimit: '500.01', ownerPin: '123456' });
    expect(above.status).toBe(400);
    expect((await above.json()).message).toBe('O limite de fiado deve ser de R$ 0,00 a R$ 500,00.');
    expect((await post({ name: 'C', phone: '11999996666', creditLimit: '-1.00', ownerPin: '123456' })).status).toBe(400);
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockAuthorize).not.toHaveBeenCalled();
  });

  it('telefone repetido continua 409 e telefone inválido 400', async () => {
    mockSession.mockResolvedValue(owner);
    mockFindByPhone.mockResolvedValue({ id: 'x' });
    expect((await post({ name: 'Seu Zé', phone: '11999998888' })).status).toBe(409);
    expect((await post({ name: 'Seu Zé', phone: '123' })).status).toBe(400);
  });
});
