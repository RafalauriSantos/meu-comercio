import { describe, it, expect, beforeEach } from 'vitest';
import {
  AuthenticateUserUseCase,
  InvalidCredentialsError,
  AccountLockedError,
  AccountDisabledError,
} from './authenticate-user.use-case';
import { UserRepository, CreateMerchantWithOwnerParams } from '../domain/user-repository.port';
import { User } from '../domain/user';
import { hashSecret } from '../domain/password';

class MockUserRepository implements UserRepository {
  public users: Map<string, User> = new Map();

  async hasAnyUser(): Promise<boolean> {
    return this.users.size > 0;
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.users.get(username.toLowerCase()) ?? null;
  }

  async createInitialMerchantWithOwner(params: CreateMerchantWithOwnerParams): Promise<User> {
    const user = new User({
      username: params.username,
      merchantId: 'merchant-123',
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

  async updateFailedLoginAttempts(username: string, attempts: number, lockedUntil: Date | null): Promise<void> {
    const user = this.users.get(username);
    if (user) {
      this.users.set(
        username,
        new User({
          ...user,
          authorities: Array.from(user.authorities),
          failedLoginAttempts: attempts,
          lockedUntil,
        })
      );
    }
  }

  async resetFailedLoginAttempts(username: string): Promise<void> {
    const user = this.users.get(username);
    if (user) {
      this.users.set(
        username,
        new User({
          ...user,
          authorities: Array.from(user.authorities),
          failedLoginAttempts: 0,
          lockedUntil: null,
        })
      );
    }
  }
}

describe('AuthenticateUserUseCase', () => {
  let repository: MockUserRepository;
  let useCase: AuthenticateUserUseCase;

  beforeEach(async () => {
    repository = new MockUserRepository();
    useCase = new AuthenticateUserUseCase(repository);

    const passwordHash = await hashSecret('password-correta-123');
    const user = new User({
      username: 'tatiane',
      merchantId: 'merchant-123',
      passwordHash,
      enabled: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      authorities: ['ROLE_OWNER'],
      createdAt: new Date(),
    });
    repository.users.set('tatiane', user);
  });

  it('should authenticate successfully with correct credentials', async () => {
    const authenticated = await useCase.execute({
      username: 'tatiane',
      password: 'password-correta-123',
    });

    expect(authenticated.username).toBe('tatiane');
    expect(authenticated.isOwner()).toBe(true);
  });

  it('should reject non-existing user without leaking existence', async () => {
    await expect(
      useCase.execute({
        username: 'nao_existe',
        password: 'qualquer-senha',
      })
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it('should increment failed attempts and lock out account after 5 failed tries', async () => {
    // 4 failed attempts
    for (let i = 1; i <= 4; i++) {
      await expect(
        useCase.execute({
          username: 'tatiane',
          password: 'senha-errada',
        })
      ).rejects.toThrow(InvalidCredentialsError);
      expect(repository.users.get('tatiane')?.failedLoginAttempts).toBe(i);
    }

    // 5th failed attempt triggers lockout
    await expect(
      useCase.execute({
        username: 'tatiane',
        password: 'senha-errada',
      })
    ).rejects.toThrow(AccountLockedError);

    const user = repository.users.get('tatiane');
    expect(user?.failedLoginAttempts).toBe(5);
    expect(user?.lockedUntil).not.toBeNull();
    expect(user?.isLocked()).toBe(true);
  });

  it('should reject disabled users', async () => {
    const disabledUser = new User({
      username: 'operador_demitido',
      merchantId: 'merchant-123',
      passwordHash: await hashSecret('senha-123'),
      enabled: false,
      failedLoginAttempts: 0,
      lockedUntil: null,
      authorities: ['ROLE_OPERATOR'],
      createdAt: new Date(),
    });
    repository.users.set('operador_demitido', disabledUser);

    await expect(
      useCase.execute({
        username: 'operador_demitido',
        password: 'senha-123',
      })
    ).rejects.toThrow(AccountDisabledError);
  });

  it('should reset failed login attempts upon subsequent successful login', async () => {
    // Fail 2 times
    await expect(
      useCase.execute({ username: 'tatiane', password: 'wrong-password' })
    ).rejects.toThrow(InvalidCredentialsError);
    await expect(
      useCase.execute({ username: 'tatiane', password: 'wrong-password' })
    ).rejects.toThrow(InvalidCredentialsError);

    expect(repository.users.get('tatiane')?.failedLoginAttempts).toBe(2);

    // Now succeed
    const authenticated = await useCase.execute({
      username: 'tatiane',
      password: 'password-correta-123',
    });

    expect(authenticated.username).toBe('tatiane');
    expect(repository.users.get('tatiane')?.failedLoginAttempts).toBe(0);
  });
});
