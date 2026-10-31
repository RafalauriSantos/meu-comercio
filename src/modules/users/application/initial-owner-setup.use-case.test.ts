import { describe, it, expect, beforeEach } from 'vitest';
import { InitialOwnerSetupUseCase, SetupAlreadyCompletedError } from './initial-owner-setup.use-case';
import { UserRepository, CreateMerchantWithOwnerParams } from '../domain/user-repository.port';
import { User } from '../domain/user';
import { verifySecret } from '../domain/password';

class InMemoryUserRepository implements UserRepository {
  private users: Map<string, User> = new Map();

  async hasAnyUser(): Promise<boolean> {
    return this.users.size > 0;
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.users.get(username.toLowerCase()) ?? null;
  }

  async createInitialMerchantWithOwner(params: CreateMerchantWithOwnerParams): Promise<User> {
    const user = new User({
      username: params.username,
      merchantId: 'test-merchant-id',
      passwordHash: params.passwordHash,
      authorizationPinHash: params.authorizationPinHash,
      email: params.email,
      enabled: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      authorities: params.authorities,
      createdAt: new Date(),
    });
    this.users.set(user.username, user);
    return user;
  }

  async updateFailedLoginAttempts(): Promise<void> {}
  async resetFailedLoginAttempts(): Promise<void> {}
}

describe('InitialOwnerSetupUseCase', () => {
  let repository: InMemoryUserRepository;
  let useCase: InitialOwnerSetupUseCase;

  beforeEach(() => {
    repository = new InMemoryUserRepository();
    useCase = new InitialOwnerSetupUseCase(repository);
  });

  it('should successfully create the initial owner with correct roles', async () => {
    const result = await useCase.execute({
      merchantName: 'Mercado da Vila',
      username: 'tatiane',
      password: 'super-secret-password-123',
      authorizationPin: '1234',
      email: 'tatiane@exemplo.com',
    });

    expect(result.username).toBe('tatiane');
    expect(result.merchantId).toBe('test-merchant-id');
    expect(result.isOwner()).toBe(true);
    expect(result.hasAuthority('CREATE_SALE')).toBe(true);
    expect(result.hasAuthority('OPEN_CASH')).toBe(true);
    expect(result.hasAuthority('CLOSE_CASH')).toBe(true);

    // Verify hash protection
    expect(await verifySecret('super-secret-password-123', result.passwordHash)).toBe(true);
    expect(await verifySecret('1234', result.authorizationPinHash!)).toBe(true);
  });

  it('should reject setup if an owner already exists', async () => {
    await useCase.execute({
      merchantName: 'Mercado da Vila',
      username: 'tatiane',
      password: 'super-secret-password-123',
      authorizationPin: '1234',
    });

    await expect(
      useCase.execute({
        merchantName: 'Outro Mercado',
        username: 'outro',
        password: 'outra-senha-segura',
        authorizationPin: '5678',
      })
    ).rejects.toThrow(SetupAlreadyCompletedError);
  });

  it('should reject weak passwords or invalid PINs', async () => {
    await expect(
      useCase.execute({
        username: 'tatiane',
        password: '123', // Less than 8 characters
        authorizationPin: '1234',
      })
    ).rejects.toThrow('A senha deve ter no mínimo 8 caracteres');

    await expect(
      useCase.execute({
        username: 'tatiane',
        password: 'valid-password-123',
        authorizationPin: 'abc', // Not 4-6 digits
      })
    ).rejects.toThrow('O PIN de autorização deve conter de 4 a 6 dígitos numéricos');
  });
});
