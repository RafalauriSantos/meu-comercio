import { z } from 'zod';
import { User } from '../domain/user';
import { verifySecret } from '../domain/password';
import { UserRepository } from '../domain/user-repository.port';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;

export const LoginSchema = z.object({
  username: z.string().trim().min(1, 'Informe o usuário'),
  password: z.string().min(1, 'Informe a senha'),
});

export type LoginInput = z.infer<typeof LoginSchema>;

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Usuário ou senha inválidos.');
    this.name = 'InvalidCredentialsError';
  }
}

export class AccountLockedError extends Error {
  constructor(public readonly lockedUntil: Date) {
    super(`Conta temporariamente bloqueada por excesso de tentativas até ${lockedUntil.toLocaleTimeString('pt-BR')}.`);
    this.name = 'AccountLockedError';
  }
}

export class AccountDisabledError extends Error {
  constructor() {
    super('Esta conta de operador está desativada. Entre em contato com a proprietária.');
    this.name = 'AccountDisabledError';
  }
}

export class AuthenticateUserUseCase {
  constructor(private readonly userRepository: UserRepository) {}

  public async execute(rawInput: unknown): Promise<User> {
    const input = LoginSchema.parse(rawInput);
    const normalizedUsername = input.username.trim().toLowerCase();

    const user = await this.userRepository.findByUsername(normalizedUsername);
    if (!user) {
      throw new InvalidCredentialsError();
    }

    const now = new Date();
    if (user.isLocked(now)) {
      throw new AccountLockedError(user.lockedUntil!);
    }

    if (!user.enabled) {
      throw new AccountDisabledError();
    }

    const isPasswordValid = await verifySecret(input.password, user.passwordHash);

    if (!isPasswordValid) {
      const nextAttempts = user.failedLoginAttempts + 1;
      let lockedUntil: Date | null = null;

      if (nextAttempts >= MAX_FAILED_ATTEMPTS) {
        lockedUntil = new Date(now.getTime() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
      }

      await this.userRepository.updateFailedLoginAttempts(user.username, nextAttempts, lockedUntil);

      if (lockedUntil) {
        throw new AccountLockedError(lockedUntil);
      }

      throw new InvalidCredentialsError();
    }

    // Password is valid; reset attempts if needed
    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.userRepository.resetFailedLoginAttempts(user.username);
    }

    return user;
  }
}
