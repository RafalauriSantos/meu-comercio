import { describe, it, expect, beforeEach } from 'vitest';
import { RegisterMerchantUseCase, UsernameAlreadyTakenError } from './register-merchant.use-case';
import { UserRepository, CreateMerchantWithOwnerParams, CreateOperatorParams } from '../domain/user-repository.port';
import { User } from '../domain/user';
import { verifySecret } from '../domain/password';

class InMemoryUserRepository implements UserRepository {
  private users: Map<string, User> = new Map();
  private merchantCount = 0;

  async hasAnyUser(): Promise<boolean> {
    return this.users.size > 0;
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.users.get(username.toLowerCase()) ?? null;
  }

  async createInitialMerchantWithOwner(params: CreateMerchantWithOwnerParams): Promise<User> {
    this.merchantCount++;
    const user = new User({
      username: params.username,
      merchantId: `merchant-uuid-${this.merchantCount}`,
      passwordHash: params.passwordHash,
      authorizationPinHash: params.authorizationPinHash,
      email: params.email,
      enabled: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      authorities: params.authorities,
      createdAt: new Date(),
    });
    this.users.set(user.username.toLowerCase(), user);
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
    this.users.set(user.username.toLowerCase(), user);
    return user;
  }

  async listOperators(merchantId: string): Promise<User[]> {
    return Array.from(this.users.values()).filter((u) => u.merchantId === merchantId);
  }

  async updateFailedLoginAttempts(): Promise<void> {}
  async resetFailedLoginAttempts(): Promise<void> {}
}

describe('RegisterMerchantUseCase (SaaS Self-Service Registration)', () => {
  let repository: InMemoryUserRepository;
  let useCase: RegisterMerchantUseCase;

  beforeEach(() => {
    repository = new InMemoryUserRepository();
    useCase = new RegisterMerchantUseCase(repository);
  });

  it('should successfully register a new merchant with unique merchantId and owner authorities', async () => {
    const result = await useCase.execute({
      merchantName: 'Mercadinho da Maria',
      username: 'maria',
      password: 'senha-segura-maria-123',
      authorizationPin: '9876',
      email: 'maria@mercadinho.com',
    });

    expect(result.username).toBe('maria');
    expect(result.merchantId).toBe('merchant-uuid-1');
    expect(result.isOwner()).toBe(true);
    expect(result.hasAuthority('CREATE_SALE')).toBe(true);
    expect(result.hasAuthority('OPEN_CASH')).toBe(true);
    expect(result.hasAuthority('CLOSE_CASH')).toBe(true);

    expect(await verifySecret('senha-segura-maria-123', result.passwordHash)).toBe(true);
    expect(await verifySecret('9876', result.authorizationPinHash!)).toBe(true);
  });

  it('should allow multiple different merchants to register independently in SaaS model', async () => {
    const store1 = await useCase.execute({
      merchantName: 'Loja do Rafael',
      username: 'rafael',
      password: 'password-12345',
      authorizationPin: '1111',
    });

    const store2 = await useCase.execute({
      merchantName: 'Mercadinho da Maria',
      username: 'maria',
      password: 'password-67890',
      authorizationPin: '2222',
    });

    expect(store1.merchantId).not.toBe(store2.merchantId);
    expect(store1.username).toBe('rafael');
    expect(store2.username).toBe('maria');
  });

  it('should reject registration if the username is already taken', async () => {
    await useCase.execute({
      merchantName: 'Primeira Loja',
      username: 'dono_comum',
      password: 'password-12345',
      authorizationPin: '1234',
    });

    await expect(
      useCase.execute({
        merchantName: 'Segunda Loja',
        username: 'dono_comum',
        password: 'password-67890',
        authorizationPin: '5678',
      })
    ).rejects.toThrow(UsernameAlreadyTakenError);
  });

  it('should validate password length and authorization PIN format', async () => {
    await expect(
      useCase.execute({
        merchantName: 'Mercado',
        username: 'usuario',
        password: '123',
        authorizationPin: '1234',
      })
    ).rejects.toThrow('A senha deve ter no mínimo 8 caracteres');

    await expect(
      useCase.execute({
        merchantName: 'Mercado',
        username: 'usuario',
        password: 'valid-password-123',
        authorizationPin: 'abc',
      })
    ).rejects.toThrow('O PIN de autorização deve conter de 4 a 6 dígitos numéricos');
  });
});
