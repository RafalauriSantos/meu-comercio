import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { BcryptOwnerPinVerifier } from './bcrypt-owner-pin-verifier';
import { UserRepository } from '@/modules/users/domain/user-repository.port';
import { User } from '@/modules/users/domain/user';

describe('BcryptOwnerPinVerifier', () => {
  const merchantId = 'merchant-uuid-1';
  let mockUserRepo: UserRepository;
  let verifier: BcryptOwnerPinVerifier;

  beforeEach(() => {
    mockUserRepo = {
      hasAnyUser: vi.fn(),
      findByUsername: vi.fn(),
      createInitialMerchantWithOwner: vi.fn(),
      createOperator: vi.fn(),
      listOperators: vi.fn(),
      updateFailedLoginAttempts: vi.fn(),
      resetFailedLoginAttempts: vi.fn(),
    };
    verifier = new BcryptOwnerPinVerifier(mockUserRepo, new InMemoryOwnerPinAttemptStore());
  });

  it('deve retornar false se o PIN for vazio ou inválido', async () => {
    const res = await verifier.verifyOwnerPin(merchantId, 'owner', '');
    expect(res).toBe(false);
  });

  it('deve retornar true quando o PIN corresponder ao hash do usuário proprietário', async () => {
    const pin = '4321';
    const pinHash = await bcrypt.hash(pin, 4);

    const ownerUser = new User({
      username: 'dona_maria',
      merchantId,
      passwordHash: 'dummy-pwd',
      authorizationPinHash: pinHash,
      enabled: true,
      failedLoginAttempts: 0,
      authorities: ['ROLE_OWNER', 'ROLE_OPERATOR'],
      createdAt: new Date(),
    });

    vi.mocked(mockUserRepo.findByUsername).mockResolvedValue(ownerUser);

    const result = await verifier.verifyOwnerPin(merchantId, 'dona_maria', pin);
    expect(result).toBe(true);
  });

  it('deve retornar false se o PIN for incorreto', async () => {
    const pinHash = await bcrypt.hash('1234', 4);

    const ownerUser = new User({
      username: 'dona_maria',
      merchantId,
      passwordHash: 'dummy-pwd',
      authorizationPinHash: pinHash,
      enabled: true,
      failedLoginAttempts: 0,
      authorities: ['ROLE_OWNER'],
      createdAt: new Date(),
    });

    vi.mocked(mockUserRepo.findByUsername).mockResolvedValue(ownerUser);

    const result = await verifier.verifyOwnerPin(merchantId, 'dona_maria', 'wrong-pin');
    expect(result).toBe(false);
  });

  it('deve retornar false se o usuário não tiver permissão de proprietário (ROLE_OWNER)', async () => {
    const pinHash = await bcrypt.hash('1234', 4);

    const operatorUser = new User({
      username: 'caixa_joao',
      merchantId,
      passwordHash: 'dummy-pwd',
      authorizationPinHash: pinHash,
      enabled: true,
      failedLoginAttempts: 0,
      authorities: ['ROLE_OPERATOR'],
      createdAt: new Date(),
    });

    vi.mocked(mockUserRepo.findByUsername).mockResolvedValue(operatorUser);

    const result = await verifier.verifyOwnerPin(merchantId, 'caixa_joao', '1234');
    expect(result).toBe(false);
  });

  it('deve retornar false se o usuário pertencer a outro merchant', async () => {
    const pinHash = await bcrypt.hash('1234', 4);

    const otherMerchantUser = new User({
      username: 'dona_outra',
      merchantId: 'other-merchant-999',
      passwordHash: 'dummy-pwd',
      authorizationPinHash: pinHash,
      enabled: true,
      failedLoginAttempts: 0,
      authorities: ['ROLE_OWNER'],
      createdAt: new Date(),
    });

    vi.mocked(mockUserRepo.findByUsername).mockResolvedValue(otherMerchantUser);

    const result = await verifier.verifyOwnerPin(merchantId, 'dona_outra', '1234');
    expect(result).toBe(false);
  });

  it('deve retornar false se a conta estiver desabilitada ou bloqueada', async () => {
    const pinHash = await bcrypt.hash('1234', 4);

    const disabledUser = new User({
      username: 'dona_bloqueada',
      merchantId,
      passwordHash: 'dummy-pwd',
      authorizationPinHash: pinHash,
      enabled: false,
      failedLoginAttempts: 5,
      authorities: ['ROLE_OWNER'],
      createdAt: new Date(),
    });

    vi.mocked(mockUserRepo.findByUsername).mockResolvedValue(disabledUser);

    const result = await verifier.verifyOwnerPin(merchantId, 'dona_bloqueada', '1234');
    expect(result).toBe(false);
  });
});

describe('BcryptOwnerPinVerifier — bloqueio por tentativas de PIN', () => {
  const merchantId = 'merchant-lockout-1';
  const OWNER_PIN = '654321';
  let attempts: InMemoryOwnerPinAttemptStore;
  let now: Date;
  let repo: UserRepository;
  let verifier: BcryptOwnerPinVerifier;

  beforeEach(async () => {
    attempts = new InMemoryOwnerPinAttemptStore();
    now = new Date('2026-11-06T12:00:00Z');
    const ownerUser = new User({
      username: 'dona_lockout',
      merchantId,
      passwordHash: 'dummy-pwd',
      authorizationPinHash: await bcrypt.hash(OWNER_PIN, 4),
      enabled: true,
      failedLoginAttempts: 0,
      authorities: ['ROLE_OWNER'],
      createdAt: new Date(),
    });
    repo = {
      hasAnyUser: vi.fn(),
      findByUsername: vi.fn().mockResolvedValue(ownerUser),
      createInitialMerchantWithOwner: vi.fn(),
      createOperator: vi.fn(),
      listOperators: vi.fn(),
      updateFailedLoginAttempts: vi.fn(),
      resetFailedLoginAttempts: vi.fn(),
    };
    verifier = new BcryptOwnerPinVerifier(repo, attempts, () => now);
  });

  it('bloqueia o PIN da dona depois de 5 tentativas erradas, mesmo com o PIN correto', async () => {
    for (let i = 0; i < 5; i++) {
      expect(await verifier.verifyOwnerPin(merchantId, 'dona_lockout', '000000')).toBe(false);
    }
    expect(await verifier.verifyOwnerPin(merchantId, 'dona_lockout', OWNER_PIN)).toBe(false);
  });

  it('zera o contador quando o PIN correto é informado antes do limite', async () => {
    for (let i = 0; i < 4; i++) {
      await verifier.verifyOwnerPin(merchantId, 'dona_lockout', '000000');
    }
    expect(await verifier.verifyOwnerPin(merchantId, 'dona_lockout', OWNER_PIN)).toBe(true);
    for (let i = 0; i < 4; i++) {
      await verifier.verifyOwnerPin(merchantId, 'dona_lockout', '000000');
    }
    expect(await verifier.verifyOwnerPin(merchantId, 'dona_lockout', OWNER_PIN)).toBe(true);
  });

  it('libera o PIN depois de 15 minutos de bloqueio', async () => {
    for (let i = 0; i < 5; i++) {
      await verifier.verifyOwnerPin(merchantId, 'dona_lockout', '000000');
    }
    now = new Date(now.getTime() + 15 * 60 * 1000 + 1);
    expect(await verifier.verifyOwnerPin(merchantId, 'dona_lockout', OWNER_PIN)).toBe(true);
  });

  it('não bloqueia outra loja quando uma loja está bloqueada', async () => {
    for (let i = 0; i < 5; i++) {
      await verifier.verifyOwnerPin(merchantId, 'dona_lockout', '000000');
    }
    const otherMerchant = 'merchant-lockout-2';
    expect(await attempts.getState(otherMerchant)).toEqual({ failedCount: 0, lockedUntil: null });
  });
});

class InMemoryOwnerPinAttemptStore {
  private readonly states = new Map<string, { failedCount: number; lockedUntil: Date | null }>();
  async getState(merchantId: string) {
    return this.states.get(merchantId) ?? { failedCount: 0, lockedUntil: null };
  }
  async saveState(merchantId: string, state: { failedCount: number; lockedUntil: Date | null }) {
    this.states.set(merchantId, state);
  }
}
