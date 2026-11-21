import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { UsernameAlreadyTakenError } from '@/modules/users/application/register-merchant.use-case';
import { User } from '@/modules/users/domain/user';
import { EmailInUseError, EmailSendFailedError, RecoveryRateLimitedError } from '@/modules/users/domain/errors';

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

const mockRequestVerification = vi.fn();
vi.mock('@/modules/users/infrastructure/recovery-services', () => ({
  buildRecoveryServices: () => ({ requestEmailVerification: { execute: (...args: unknown[]) => mockRequestVerification(...args) } }),
}));

const ownerUser = () =>
  new User({
    username: 'maria',
    merchantId: 'merchant-uuid-1',
    passwordHash: 'hash',
    authorizationPinHash: 'pinhash',
    authorities: ['ROLE_OWNER', 'CREATE_SALE', 'OPEN_CASH', 'CLOSE_CASH'],
    enabled: true,
    failedLoginAttempts: 0,
    createdAt: new Date(),
  });

const registerRequest = (extra: Record<string, unknown> = { email: 'maria@loja.com' }) =>
  new NextRequest('http://localhost:3000/api/auth/register', {
    method: 'POST',
    headers: { 'x-forwarded-for': '203.0.113.7' },
    body: JSON.stringify({ merchantName: 'Mercadinho', username: 'maria', password: 'password-12345', authorizationPin: '123456', ...extra }),
  });

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
    mockRequestVerification.mockResolvedValueOnce({ email: 'maria@loja.com' });

    const request = new NextRequest('http://localhost:3000/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        merchantName: 'Mercadinho da Maria',
        username: 'maria',
        password: 'password-12345',
        authorizationPin: '123456',
        email: 'maria@loja.com',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.username).toBe('maria');
    expect(data.merchantId).toBe('merchant-uuid-1');
    expect(data.isOwner).toBe(true);
    expect(data.verificationEmailSent).toBe(true);
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
        authorizationPin: '123456',
        email: 'maria@loja.com',
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

  it('asks for the verification link after the session is set, with the owner, merchant and IP (AC-8)', async () => {
    mockExecuteRegister.mockResolvedValueOnce(ownerUser());
    mockRequestVerification.mockResolvedValueOnce({ email: 'maria@loja.com' });

    await POST(registerRequest());

    expect(mockSetSessionCookie).toHaveBeenCalledTimes(1);
    expect(mockRequestVerification).toHaveBeenCalledTimes(1);
    expect(mockRequestVerification.mock.calls[0][0]).toMatchObject({ merchantId: 'merchant-uuid-1', username: 'maria', ip: '203.0.113.7' });
    expect(mockRequestVerification.mock.calls[0][0].email).toBeUndefined();
    expect(mockSetSessionCookie.mock.invocationCallOrder[0]).toBeLessThan(mockRequestVerification.mock.invocationCallOrder[0]);
  });

  it.each([
    ['sending fails', new EmailSendFailedError(new Error('brevo'))],
    ['the limit is reached', new RecoveryRateLimitedError(30)],
    ['the e-mail is already confirmed by another store (not revealed)', new EmailInUseError()],
    ['something unexpected happens', new Error('boom')],
  ])('still creates the account and answers 201 with verificationEmailSent false when %s', async (_name, failure) => {
    mockExecuteRegister.mockResolvedValueOnce(ownerUser());
    mockRequestVerification.mockRejectedValueOnce(failure);

    const response = await POST(registerRequest());
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.verificationEmailSent).toBe(false);
    expect(data.username).toBe('maria');
    expect(mockSetSessionCookie).toHaveBeenCalledTimes(1);
  });

  it('answers 400 in pt-BR and creates nothing when the e-mail is missing or invalid (AC-8)', async () => {
    for (const extra of [{}, { email: '' }, { email: 'sem-arroba' }]) {
      const response = await POST(registerRequest(extra));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.message).toBe('Dados de cadastro inválidos.');
      expect(data.errors[0].field).toBe('email');
    }
    expect(mockExecuteRegister).not.toHaveBeenCalled();
    expect(mockRequestVerification).not.toHaveBeenCalled();
  });
});
