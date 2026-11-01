import { describe, it, expect } from 'vitest';
import { CreateOperatorUseCase, UsernameAlreadyExistsError } from './create-operator.use-case';
import { UserRepository, CreateMerchantWithOwnerParams, CreateOperatorParams } from '../domain/user-repository.port';
import { User } from '../domain/user';

class MockUserRepository implements UserRepository {
  private users = new Map<string, User>();

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
      authorities: params.authorities,
      createdAt: new Date(),
    });
    this.users.set(user.username, user);
    return user;
  }

  async createOperator(params: CreateOperatorParams): Promise<User> {
    const user = new User({
      username: params.username,
      merchantId: params.merchantId,
      passwordHash: params.passwordHash,
      enabled: true,
      failedLoginAttempts: 0,
      authorities: params.authorities,
      createdAt: new Date(),
    });
    this.users.set(user.username, user);
    return user;
  }

  async listOperators(merchantId: string): Promise<User[]> {
    return Array.from(this.users.values()).filter((u) => u.merchantId === merchantId);
  }

  async updateFailedLoginAttempts(): Promise<void> {}
  async resetFailedLoginAttempts(): Promise<void> {}
}

describe('CreateOperatorUseCase', () => {
  it('should create an operator successfully with proper authorities', async () => {
    const repo = new MockUserRepository();
    const useCase = new CreateOperatorUseCase(repo);

    const operator = await useCase.execute({
      merchantId: '123e4567-e89b-12d3-a456-426614174000',
      username: 'joao.caixa',
      password: 'password123',
    });

    expect(operator.username).toBe('joao.caixa');
    expect(operator.merchantId).toBe('123e4567-e89b-12d3-a456-426614174000');
    expect(operator.authorities.has('ROLE_OPERATOR')).toBe(true);
    expect(operator.authorities.has('CREATE_SALE')).toBe(true);
    expect(operator.authorities.has('OPEN_CASH')).toBe(true);
    expect(operator.authorities.has('ROLE_OWNER')).toBe(false);
  });

  it('should throw an error when username already exists', async () => {
    const repo = new MockUserRepository();
    const useCase = new CreateOperatorUseCase(repo);

    await useCase.execute({
      merchantId: '123e4567-e89b-12d3-a456-426614174000',
      username: 'maria.caixa',
      password: 'password123',
    });

    await expect(
      useCase.execute({
        merchantId: '123e4567-e89b-12d3-a456-426614174000',
        username: 'maria.caixa',
        password: 'anotherPassword',
      })
    ).rejects.toThrow(UsernameAlreadyExistsError);
  });

  it('should reject passwords shorter than 6 characters', async () => {
    const repo = new MockUserRepository();
    const useCase = new CreateOperatorUseCase(repo);

    await expect(
      useCase.execute({
        merchantId: '123e4567-e89b-12d3-a456-426614174000',
        username: 'pedro',
        password: '123',
      })
    ).rejects.toThrow();
  });
});
