import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { UsernameAlreadyTakenError } from '@/modules/users/application/register-merchant.use-case';
import { User } from '@/modules/users/domain/user';

const mockExecuteRegister = vi.fn();
vi.mock('@/modules/users/application/register-merchant.use-case', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/users/application/register-merchant.use-case')>();
  return {
    ...actual,
    RegisterMerchantUseCase: class MockRegisterMerchantUseCase {
      execute = (input: unknown) => {
        actual.RegisterMerchantSchema.parse(input);
        return mockExecuteRegister(input);
      };
    },
  };
});

const mockSetSessionCookie = vi.fn();
vi.mock('@/shared/infrastructure/auth/auth-context', () => ({
  setSessionCookie: (...args: unknown[]) => mockSetSessionCookie(...args),
}));

describe('POST /api/auth/register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully register a merchant and return 201 with session', async () => {
    const dummyUser = new User({
      username: 'maria',
      merchantId: 'merchant-uuid-1',
      passwordHash: 'hash',
      authorizationPinHash: 'pinhash',
      authorities: ['ROLE_OWNER', 'CREATE_SALE', 'OPEN_CASH', 'CLOSE_CASH'],
      enabled: true,
      failedLoginAttempts: 0,
      createdAt: new Date(),
    });

    mockExecuteRegister.mockResolvedValueOnce(dummyUser);

    const request = new NextRequest('http://localhost:3000/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        merchantName: 'Mercadinho da Maria',
        username: 'maria',
        password: 'password-12345',
        authorizationPin: '1234',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.username).toBe('maria');
    expect(data.merchantId).toBe('merchant-uuid-1');
    expect(data.isOwner).toBe(true);
    expect(mockSetSessionCookie).toHaveBeenCalledTimes(1);
  });

  it('should return 409 when the username is already taken', async () => {
    mockExecuteRegister.mockRejectedValueOnce(new UsernameAlreadyTakenError('maria'));

    const request = new NextRequest('http://localhost:3000/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        merchantName: 'Outro Mercado',
        username: 'maria',
        password: 'password-12345',
        authorizationPin: '1234',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.message).toBe("O nome de usuário 'maria' já está em uso.");
  });

  it('should return 400 when validation fails', async () => {
    const request = new NextRequest('http://localhost:3000/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        merchantName: 'M',
        username: 'u', // Invalid short username
        password: '123',
        authorizationPin: 'abc',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.message).toBe('Dados de cadastro inválidos.');
  });
});
